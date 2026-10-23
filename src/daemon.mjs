import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { Backend } from './backend.mjs';
import { Store, validateConfig } from './store.mjs';
import { Engine } from './engine.mjs';
import { controlEndpoint } from './paths.mjs';
import { tokenFor } from './control.mjs';
import { GuardError, requireThreadId, errorInfo } from './util.mjs';
import { startDashboard } from './dashboard.mjs';
import { version } from './version.mjs';
import { ManualControl } from './manual-control.mjs';
export async function runDaemon(home) {
  await fs.mkdir(home, { recursive: true });
  const lock = path.join(home, 'monitor.lock');
  const instance = crypto.randomUUID();
  try { await fs.writeFile(lock, JSON.stringify({ pid: process.pid, instance }), { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = JSON.parse(await fs.readFile(lock, 'utf8'));
    let alive = true;
    try { process.kill(previous.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (alive) throw new GuardError('monitor_already_running');
    await fs.unlink(lock); return runDaemon(home);
  }
  let backend, backendOpening, dashboardOpening, dashboard, server, interval, shuttingDown = false, nextTick = 0;
  const store = await new Store(home).open();
  const token = await tokenFor(home);
  async function getBackend() {
    if (backend) return backend;
    if (!backendOpening) backendOpening = new Backend(store.data.config).open().then(value => { backend = value; return value; }).finally(() => { backendOpening = null; });
    return backendOpening;
  }
  const proxy = new Proxy({}, { get: (_, method) => async (...args) => (await getBackend())[method](...args) });
  const engine = new Engine(store, proxy);
  await engine.recover();
  const manual = new ManualControl(store, proxy, engine);
  await manual.recover();
  async function handle(method, params) {
    switch (method) {
      case 'ping': return { running: true, pid: process.pid, instance, version };
      case 'dashboard': {
        if (!dashboardOpening) dashboardOpening = startDashboard({ dispatch: handle }).then(value => { dashboard = value; return value; }).catch(error => { dashboardOpening = null; throw error; });
        const page = await dashboardOpening; return { url: page.url, running: true };
      }
      case 'threads': return (await getBackend()).listThreads(params);
      case 'cached_status': return { running: true, version, config: store.data.config, quota: store.data.lastQuota, compatibility: store.data.compatibility, lastTick: store.data.lastTick, lastError: store.data.lastError, managed: Object.values(store.data.watches), episodes: store.data.episodes.slice(-30), manualActions: store.data.manualActions, events: await store.events() };
      case 'status': {
        try { const current = await getBackend(); store.data.compatibility = await current.compatibility(); store.data.lastQuota = await current.quota(); store.data.lastError = null; await store.save(); } catch (error) { store.data.lastError = errorInfo(error); }
        return handle('cached_status', {});
      }
      case 'watch': return engine.watch(requireThreadId(params.threadId));
      case 'unwatch': return engine.unwatch(requireThreadId(params.threadId));
      case 'thread_control': return manual.run(params);
      case 'configure': {
        const next = validateConfig(params, store.data.config);
        if (next.codexPath !== store.data.config.codexPath && (engine.running || manual.running || backendOpening)) throw new GuardError('check_in_progress', 'Wait for the current check before changing the Codex path');
        if (next.codexPath !== store.data.config.codexPath) { await backend?.close(); backend = null; }
        store.data.config = next; if (backend) backend.config = next;
        await store.save(); await store.event('configuration_changed', { enabled: next.enabled, observeOnly: next.observeOnly });
        nextTick = 0; return next;
      }
      case 'dismiss': {
        if (store.data.manualActions.some(item => item.id === params.episodeId)) return manual.dismiss(params.episodeId);
        const episode = store.data.episodes.find(item => item.id === params.episodeId);
        if (!episode) throw new GuardError('episode_not_found');
        if (['pause_pending', 'resume_pending'].includes(episode.status)) throw new GuardError('operation_in_progress', '当前控制指令正在执行，请等待结果确认后再取消后续恢复。');
        if (store.data.watches[episode.threadId]) store.data.watches[episode.threadId].skipWindow = episode.resetsAt;
        await engine.change(episode, 'cancelled', 'User dismissed this recovery'); return { cancelled: episode.id };
      }
      case 'check': if (manual.running) throw new GuardError('operation_in_progress', '手动操作正在执行，请稍后检查。'); return engine.tick({ explicit: true });
      case 'shutdown': setTimeout(() => shutdown(), 50); return { stopping: true };
      default: throw new GuardError('method_not_found');
    }
  }
  server = net.createServer(socket => {
    let input = '', handled = false;
    const timeout = setTimeout(() => socket.destroy(), 60000);
    socket.on('error', () => {}); socket.on('close', () => clearTimeout(timeout));
    socket.on('data', async bytes => {
      if (handled) return;
      input += bytes.toString();
      if (input.length > 65536) { socket.destroy(); return; }
      if (!input.includes('\n')) return;
      handled = true;
      try {
        const request = JSON.parse(input.split('\n')[0]);
        if (typeof request.token !== 'string' || request.token.length !== token.length || !crypto.timingSafeEqual(Buffer.from(request.token), Buffer.from(token))) throw new GuardError('unauthorized_control_request');
        const result = await handle(request.method, request.params ?? {}); socket.end(JSON.stringify({ result }) + '\n');
      } catch (error) { socket.end(JSON.stringify({ error: errorInfo(error) }) + '\n'); }
    });
  });
  const endpoint = controlEndpoint(home);
  if (process.platform !== 'win32') { try { await fs.unlink(endpoint); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); });
  if (process.platform !== 'win32') await fs.chmod(endpoint, 0o600);
  async function shutdown() {
    if (shuttingDown) return; shuttingDown = true; clearInterval(interval);
    await dashboard?.close();
    await backend?.close(); server.close();
    try { const current = JSON.parse(await fs.readFile(lock, 'utf8')); if (current.instance === instance) await fs.unlink(lock); } catch {}
    process.exit(0);
  }
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  interval = setInterval(() => {
    if (shuttingDown || engine.running || manual.running || Date.now() < nextTick) return;
    // No background account polling until at least one chat is enrolled.
    nextTick = Date.now() + store.data.config.pollIntervalSeconds * 1000;
    if (!Object.keys(store.data.watches).length || !store.data.config.enabled) return;
    engine.tick().catch(async error => { store.data.lastError = errorInfo(error); await store.save(); });
  }, 1000);
  return { server, engine, store, shutdown };
}

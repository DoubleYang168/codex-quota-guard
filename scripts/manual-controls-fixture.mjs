// Browser acceptance fixture. The backend below never connects to the desktop.
import fs from 'node:fs/promises';
import path from 'node:path';
import { startDashboard } from '../src/dashboard.mjs';
import { Store, validateConfig } from '../src/store.mjs';
import { Engine } from '../src/engine.mjs';
import { ManualControl } from '../src/manual-control.mjs';
import { projectRoot } from '../src/paths.mjs';
import { version } from '../src/version.mjs';
const parent = path.join(projectRoot, '.runtime', 'tests'); await fs.mkdir(parent, { recursive: true });
const store = await new Store(await fs.mkdtemp(path.join(parent, 'manual-browser-'))).open();
store.data.config.enabled = false;
const rows = [
  { threadId: '11111111-1111-4111-8111-111111111111', title: '测试会话：整理项目文档', cwd: 'example-notes', updatedAt: Date.now() / 1000 },
  { threadId: '22222222-2222-4222-8222-222222222222', title: '测试会话：验证 Goal 连续执行', cwd: 'example-goal', updatedAt: Date.now() / 1000 - 100 }
];
const states = new Map(rows.map((row, index) => [row.threadId, { threadId: row.threadId, thread: { name: row.title, cwd: row.cwd }, identity: row.threadId, goal: null, turn: { id: `fixture-${index}`, status: index ? 'interrupted' : 'inProgress', items: [] }, queueKnown: true, queueCount: 0 }]));
const calls = [];
const resetsAt = Math.floor(Date.now() / 1000) + 7200;
const backend = {
  compatibility: async () => ({ compatible: true }),
  quota: async () => ({ remaining: 42, weeklyRemaining: 76, allowed: true, readAt: Date.now(), resetsAt, accountFingerprint: 'fixture-only' }),
  snapshot: async id => { if (!states.has(id)) throw new Error('此测试宿主只支持列出的两个模拟会话'); const state = structuredClone(states.get(id)); state.recentTurns = [state.turn]; return state; },
  stop: async (id, turnId) => { calls.push({ type: 'stop', id, turnId }); states.get(id).turn.status = 'interrupted'; },
  waitStopped: async id => backend.snapshot(id),
  start: async item => { calls.push({ type: 'start', id: item.threadId, requestId: item.id }); const turn = { id: `manual-${item.id}`, status: 'inProgress', items: [{ text: `[quota-guard:${item.id}]` }] }; states.get(item.threadId).turn = turn; return { turnId: turn.id }; }
};
store.data.lastQuota = await backend.quota();
const engine = new Engine(store, backend), manual = new ManualControl(store, backend, engine);
if (process.argv.includes('--explicit-check-regression')) {
  Object.assign(store.data.config, { enabled: true, observeOnly: false, pauseRemainingPercent: 60 });
  await engine.watch(rows[0].threadId); store.data.watches[rows[0].threadId].skipWindow = resetsAt;
  await engine.tick(); // Background-style checks must leave this fake turn alone.
}
const demoAssets = path.join(store.home, 'assets');
await fs.cp(path.join(projectRoot, 'web'), demoAssets, { recursive: true });
const demoIndex = path.join(demoAssets, 'index.html');
await fs.writeFile(demoIndex, (await fs.readFile(demoIndex, 'utf8')).replace('<main id="overview">', '<main id="overview"><div class="notice warning">模拟演示 · 仅使用虚构会话和额度，不连接真实 Codex</div>'));
const page = await startDashboard({ assets: demoAssets, dispatch: async (method, args) => {
  if (method === 'threads') return { threads: rows.filter(item => !args.search || item.title.includes(args.search)), nextCursor: null };
  if (['cached_status', 'status'].includes(method)) return { running: true, version, config: store.data.config, quota: store.data.lastQuota, lastTick: store.data.lastTick, managed: Object.values(store.data.watches), episodes: store.data.episodes, manualActions: store.data.manualActions, events: await store.events() };
  if (method === 'thread_control') return manual.run(args);
  if (method === 'watch') return engine.watch(args.threadId);
  if (method === 'unwatch') return engine.unwatch(args.threadId);
  if (method === 'configure') {
    if (process.argv.includes('--fail-configure')) throw new Error('模拟保存失败：配置未写入');
    store.data.config = validateConfig(args, store.data.config); await store.save(); return store.data.config;
  }
  if (method === 'check') return engine.tick({ explicit: true });
  if (method === 'dismiss') return manual.dismiss(args.episodeId);
  throw new Error('Unsupported fixture action');
} });
await fs.writeFile(path.join(projectRoot, '.runtime', 'manual-fixture.json'), JSON.stringify({ ...page, close: undefined, home: store.home, pid: process.pid }));
console.log(JSON.stringify({ url: page.url, simulatedDesktop: true }));
async function stop() { await fs.writeFile(path.join(projectRoot, '.runtime', 'manual-browser-calls.json'), JSON.stringify({ simulatedDesktop: true, calls, state: store.data }, null, 2)); await page.close(); process.exit(0); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { dataDirectory } from '../src/paths.mjs';
import { Store, validateConfig } from '../src/store.mjs';
import { Backend } from '../src/backend.mjs';
import { control, startMonitor } from '../src/control.mjs';
import { runDaemon } from '../src/daemon.mjs';
import { runMcp } from '../src/mcp.mjs';
import { errorInfo, requireThreadId } from '../src/util.mjs';
import { launchBrowser } from '../src/dashboard.mjs';
import { version } from '../src/version.mjs';
import { serviceStatus, serviceControl } from '../src/service.mjs';
const [command = 'help', ...args] = process.argv.slice(2);
const home = dataDirectory();
function print(value) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
try {
  if (command === 'mcp') await runMcp();
  else if (command === 'daemon') await runDaemon(home);
  else if (command === 'doctor') {
    const store = await new Store(home).open(); const backend = await new Backend(store.data.config).open();
    try {
      const result = { version, dataDirectory: home, compatibility: await backend.compatibility(), quota: await backend.quota(), desktopProbe: null, mutationsSent: 0 };
      const threadId = args[0] ?? process.env.CODEX_THREAD_ID;
      if (threadId) {
        try { const snapshot = await backend.snapshot(requireThreadId(threadId)); result.desktopProbe = { ownerAvailable: await backend.ownerAvailable(threadId), liveReadable: true, liveTurnStatus: snapshot.turn?.status, queueReadable: snapshot.queueKnown, goalStatus: snapshot.goal?.status ?? null }; }
        catch (error) { result.desktopProbe = { liveReadable: false, error: errorInfo(error) }; process.exitCode = 1; }
      }
      result.runtime = { executable: process.execPath, node: process.version, platform: process.platform, arch: process.arch };
      await fs.writeFile(path.join(home, 'doctor.json'), JSON.stringify(result, null, 2) + '\n'); print(result);
    } finally { await backend.close(); }
  } else if (command === 'start') print(await startMonitor(home));
  else if (command === 'ui') {
    await startMonitor(home); const page = await control('dashboard', {}, { home });
    if (!args.includes('--no-open')) { try { await launchBrowser(page.url); page.browserLaunchRequested = true; } catch (error) { page.browserError = errorInfo(error); } }
    print(page);
  }
  else if (command === 'stop') print(await serviceControl('shutdown', { home }));
  else if (command === 'service-status') print({ ...await serviceStatus({ home }), dataDirectory: home });
  else if (command === 'status') { await startMonitor(home); print(await control('status', {}, { home })); }
  else if (['watch', 'unwatch'].includes(command)) { await startMonitor(home); print(await control(command, { threadId: requireThreadId(args[0] ?? process.env.CODEX_THREAD_ID) }, { home })); }
  else if (command === 'configure') {
    const patch = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--live') patch.observeOnly = false;
      else if (args[i] === '--observe') patch.observeOnly = true;
      else if (args[i] === '--enabled') patch.enabled = true;
      else if (args[i] === '--disabled') patch.enabled = false;
      else if (args[i] === '--pause') patch.pauseRemainingPercent = Number(args[++i]);
      else if (args[i] === '--resume') patch.resumeRemainingPercent = Number(args[++i]);
      else if (args[i] === '--interval') patch.pollIntervalSeconds = Number(args[++i]);
      else throw new Error(`Unknown option: ${args[i]}`);
    }
    validateConfig(patch); await startMonitor(home); print(await control('configure', patch, { home }));
  } else if (command === 'check') { await startMonitor(home); print(await control('check', {}, { home })); }
  else if (command === 'dismiss') { await startMonitor(home); print(await control('dismiss', { episodeId: args[0] }, { home })); }
  else print({ commands: ['ui [--no-open]', 'doctor [thread-id] (read only)', 'start', 'service-status (cached, no startup)', 'status (starts helper)', 'watch <thread-id>', 'unwatch <thread-id>', 'configure --observe|--live --pause 5 --resume 100 --interval 300', 'configure --disabled|--enabled', 'check', 'dismiss <episode-id>', 'stop (disable and exit)', 'mcp'], defaultMode: process.platform === 'darwin' ? 'observe' : 'live', dataDirectory: home });
} catch (error) { console.error(JSON.stringify(errorInfo(error))); process.exitCode = 1; }

// Read-only local acceptance. No thread/start, turn/start, interrupt, Goal write,
// plugin registration or monitor startup is performed by this script.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Backend } from '../src/backend.mjs';
import { defaults } from '../src/store.mjs';
import { projectRoot } from '../src/paths.mjs';
import { macApplication, macVersion } from '../src/platform/macos.mjs';
import { errorInfo, requireThreadId } from '../src/util.mjs';
if (process.platform !== 'darwin') throw Error('macOS only');
const report = { checkedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, node: process.version, mutationsSent: 0 };
const backend = new Backend(defaults);
try {
  report.application = await macApplication(); report.desktop = await macVersion();
  await backend.open(); report.compatibility = await backend.compatibility();
  const quota = await backend.quota();
  report.quota = { readable: true, accountIdentified: !!quota.accountFingerprint, fiveHourReadable: Number.isFinite(quota.remaining), weeklyReadable: Number.isFinite(quota.weeklyRemaining) };
  const page = await backend.listThreads({}); report.threadIndexReadable = Array.isArray(page.threads);
  const threadId = process.argv[2] ? requireThreadId(process.argv[2]) : page.threads.find(thread => [projectRoot, path.dirname(projectRoot)].includes(thread.cwd))?.threadId;
  if (!threadId) throw Error('Pass a loaded local test chat UUID to verify the live bridge');
  const snapshot = await backend.snapshot(threadId);
  report.desktopProbe = { liveReadable: true, ownerAvailable: await backend.ownerAvailable(threadId), queueReadable: snapshot.queueKnown, liveTurnStatus: snapshot.turn?.status ?? null, goalReadable: true };
  report.passed = report.compatibility.compatible && report.quota.accountIdentified && report.desktopProbe.ownerAvailable && report.desktopProbe.queueReadable;
} catch (error) { report.passed = false; report.error = errorInfo(error); }
finally { await backend.close(); }
const directory = path.join(projectRoot, '.runtime'); await fs.mkdir(directory, { recursive: true });
await fs.writeFile(path.join(directory, 'macos-validation.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;

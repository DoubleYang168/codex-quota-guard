// Source-project installer. Keep mutable data outside the CLI's version cache.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findCodex, projectRoot, dataDirectory } from '../src/paths.mjs';
const execute = promisify(execFile), cli = await findCodex();
const release = JSON.parse(await fs.readFile(path.join(projectRoot, 'dist', 'latest.json'), 'utf8'));
const home = path.resolve(process.env.CODEX_QUOTA_GUARD_HOME || (process.platform === 'darwin' ? dataDirectory() : path.join(projectRoot, '.runtime', 'user')));
await fs.mkdir(home, { recursive: true });
await fs.mkdir(path.join(projectRoot, '.runtime'), { recursive: true });
try {
  const state = await fs.readFile(path.join(home, 'state.json'), 'utf8'); JSON.parse(state);
  const backup = path.join(projectRoot, '.runtime', 'install-backups', new Date().toISOString().replaceAll(/[:.]/g, '-'));
  await fs.mkdir(backup, { recursive: true }); await fs.writeFile(path.join(backup, 'state.json'), state);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
async function run(args) { return execute(cli, [...args, '--json'], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 }); }
// Windows keeps a loaded MCP server's working directory open. An identical
// version is already installed; do not ask the CLI to rename its active cache.
const existing = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'plugins', 'cache', 'quota-guard-local', 'quota-guard', release.version);
try {
  await fs.access(path.join(existing, 'package.json'));
  const sums = JSON.parse(await fs.readFile(path.join(release.directory, 'SHA256SUMS.json'), 'utf8'));
  for (const [relative, expected] of Object.entries(sums)) {
    if (crypto.createHash('sha256').update(await fs.readFile(path.join(existing, relative))).digest('hex') !== expected) throw new Error('This version is installed with different files; bump the version before updating a loaded plugin.');
  }
  await fs.writeFile(path.join(existing, 'runtime-home.json'), JSON.stringify({ schema: 1, home }) + '\n');
  const evidence = { version: release.version, installedPath: existing, dataDirectory: home, alreadyInstalled: true, checkedAt: new Date().toISOString() };
  await fs.writeFile(path.join(projectRoot, '.runtime', 'installation.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2)); process.exit(0);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
try { await run(['plugin', 'marketplace', 'add', release.directory]); }
catch (error) {
  if (!String(error.stderr).includes('already added from a different source')) throw error;
  await run(['plugin', 'marketplace', 'remove', 'quota-guard-local']);
  await run(['plugin', 'marketplace', 'add', release.directory]);
}
const result = JSON.parse((await run(['plugin', 'add', 'quota-guard@quota-guard-local'])).stdout);
await fs.writeFile(path.join(result.installedPath, 'runtime-home.json'), JSON.stringify({ schema: 1, home }) + '\n');
const evidence = { ...result, dataDirectory: home, installedAt: new Date().toISOString() };
await fs.writeFile(path.join(projectRoot, '.runtime', 'installation.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));

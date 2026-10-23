import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GuardError } from '../util.mjs';
const execute = promisify(execFile);

export async function macApplication({ env = process.env, home = os.homedir() } = {}) {
  if (env.CODEX_QUOTA_GUARD_APP) {
    const app = path.resolve(env.CODEX_QUOTA_GUARD_APP);
    await fs.access(path.join(app, 'Contents', 'Info.plist'));
    return app;
  }
  const apps = [];
  for (const root of ['/Applications', path.join(home, 'Applications')]) {
    for (const name of ['ChatGPT.app', 'Codex.app']) {
      const app = path.join(root, name);
      try { await fs.access(path.join(app, 'Contents', 'Resources', 'codex-cli')); apps.push(app); } catch {}
    }
  }
  if (!apps.length) throw new GuardError('mac_application_not_found', 'No Codex desktop app found; set CODEX_QUOTA_GUARD_APP to the active .app path');
  if (apps.length !== 1) throw new GuardError('mac_application_ambiguous', 'Expected one Codex desktop app; set CODEX_QUOTA_GUARD_APP to the active .app path');
  return apps[0];
}

export async function macCli(options) {
  const resources = path.join(await macApplication(options), 'Contents', 'Resources');
  for (const relative of ['codex-cli/CodexCLI.app/Contents/MacOS/codex', 'codex']) {
    const candidate = path.join(resources, relative);
    try { await fs.access(candidate, fs.constants.X_OK); return candidate; } catch {}
  }
  throw new GuardError('mac_cli_not_found', 'No bundled Codex CLI found; set CODEX_QUOTA_GUARD_CODEX explicitly');
}

export async function macVersion(options) {
  const plist = path.join(await macApplication(options), 'Contents', 'Info.plist');
  const read = async key => (await execute('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], { timeout: 5000 })).stdout.trim();
  return { version: await read('CFBundleShortVersionString'), build: await read('CFBundleVersion') };
}

export function macDesktopEndpoint(env = process.env, home = os.homedir()) {
  return env.CODEX_QUOTA_GUARD_IPC_PATH || path.join(env.CODEX_HOME || path.join(home, '.codex'), 'ipc', 'ipc.sock');
}

export async function ownedSocket(endpoint, uid = process.getuid?.()) {
  const stat = await fs.lstat(endpoint);
  if (!stat.isSocket() || uid === undefined || stat.uid !== uid || (stat.mode & 0o022)) {
    throw new GuardError('unsafe_desktop_socket', 'Desktop endpoint must be a socket owned by the current user and not writable by other users');
  }
  return endpoint;
}

export async function macToolsEndpoint({ env = process.env, directory = '/tmp/codex-app-tools' } = {}) {
  if (env.CODEX_APP_TOOLS_PIPE_PATH) return ownedSocket(env.CODEX_APP_TOOLS_PIPE_PATH);
  const candidates = [];
  for (const name of await fs.readdir(directory)) {
    if (!name.endsWith('.sock')) continue;
    try { candidates.push(await ownedSocket(path.join(directory, name))); } catch {}
  }
  if (candidates.length !== 1) throw new GuardError('desktop_bridge_ambiguous', 'Expected one owned app-tools socket; set CODEX_APP_TOOLS_PIPE_PATH if multiple desktop instances or stale sockets exist');
  return candidates[0];
}

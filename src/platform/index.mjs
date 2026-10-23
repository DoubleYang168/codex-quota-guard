import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { macDesktopEndpoint, macToolsEndpoint, ownedSocket } from './macos.mjs';
import { GuardError } from '../util.mjs';

export const reviewedPlatforms = Object.freeze({
  win32: [
    ['codex-cli 0.163.0-alpha.10.2', '26.1013.4894.0'],
    ['codex-cli 0.163.0-alpha.11.2', '26.1016.8622.0']
  ],
  // Protocol reviewed and read-only connection verified on arm64. Control and
  // Goal recovery remain experimental, see docs/MACOS.md for acceptance status.
  darwin: [['codex-cli 0.163.0-alpha.11.2', '26.1016.62342']]
});
export function platformDefaults(platform = process.platform) {
  const [compatibleCli, compatibleDesktop] = (reviewedPlatforms[platform] || reviewedPlatforms.win32)[0];
  return { observeOnly: platform === 'darwin', compatibleCli, compatibleDesktop };
}
export function stableDataDirectory(home = os.homedir()) {
  return path.join(home, 'Library', 'Application Support', 'Codex Quota Guard');
}
export function desktopEndpoint() {
  if (process.platform === 'darwin') return macDesktopEndpoint();
  if (process.platform === 'win32') return '\\\\.\\pipe\\codex-ipc';
  throw new GuardError('unsupported_platform');
}
export async function toolsEndpoint() {
  if (process.platform === 'darwin') return macToolsEndpoint();
  if (process.env.CODEX_APP_TOOLS_PIPE_PATH) return process.env.CODEX_APP_TOOLS_PIPE_PATH;
  if (process.platform !== 'win32') throw new GuardError('unsupported_platform');
  const pipes = (await fs.readdir('\\\\.\\pipe\\')).filter(name => name.startsWith('codex-app-tools-'));
  if (pipes.length !== 1) throw new GuardError('desktop_bridge_ambiguous', 'Expected exactly one running desktop app-tools bridge');
  return '\\\\.\\pipe\\' + pipes[0];
}
export async function validateDesktopEndpoint(endpoint) {
  if (process.platform === 'darwin') await ownedSocket(endpoint);
  return endpoint;
}

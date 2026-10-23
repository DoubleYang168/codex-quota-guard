import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hash } from './util.mjs';
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function dataDirectory(root = projectRoot) {
  if (process.env.CODEX_QUOTA_GUARD_HOME) return path.resolve(process.env.CODEX_QUOTA_GUARD_HOME);
  // A local installation may pin the prior data directory across upgrades.
  // This machine-specific pointer is intentionally excluded from release ZIPs.
  try {
    const pointer = JSON.parse(readFileSync(path.join(root, 'runtime-home.json'), 'utf8'));
    if (pointer.schema !== 1 || typeof pointer.home !== 'string' || !path.isAbsolute(pointer.home)) throw new Error('Invalid runtime home pointer');
    return path.resolve(pointer.home);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return path.join(root, '.runtime');
}
export function controlEndpoint(home = dataDirectory()) {
  return process.platform === 'win32' ? `\\\\.\\pipe\\codex-quota-guard-${hash(path.resolve(home)).slice(0, 16)}` : path.join(home, 'control.sock');
}
export async function findCodex(explicit) {
  if (explicit || process.env.CODEX_QUOTA_GUARD_CODEX) return path.resolve(explicit || process.env.CODEX_QUOTA_GUARD_CODEX);
  const directory = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin');
  const candidates = [];
  try {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name, 'codex.exe');
      if (entry.isDirectory()) try { candidates.push({ path: candidate, modified: (await fs.stat(candidate)).mtimeMs }); } catch {}
    }
  } catch {}
  candidates.sort((a, b) => b.modified - a.modified);
  if (candidates.length) return candidates[0].path;
  return process.platform === 'win32' ? 'codex.exe' : 'codex';
}

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { GuardError } from './util.mjs';
import { platformDefaults } from './platform/index.mjs';
export const defaults = Object.freeze({ enabled: true, pauseRemainingPercent: 5, resumeRemainingPercent: 100, pollIntervalSeconds: 300, codexPath: null, ...platformDefaults() });
export function validateConfig(patch, current = defaults) {
  for (const key of Object.keys(patch)) if (!(key in defaults)) throw new GuardError('unknown_configuration_key', key);
  const next = { ...current, ...patch };
  for (const key of ['enabled', 'observeOnly']) if (typeof next[key] !== 'boolean') throw new GuardError('invalid_configuration', key);
  for (const key of ['pauseRemainingPercent', 'resumeRemainingPercent']) if (!Number.isFinite(next[key]) || next[key] < 0 || next[key] > 100) throw new GuardError('invalid_configuration', key);
  if (next.resumeRemainingPercent <= next.pauseRemainingPercent) throw new GuardError('invalid_configuration', 'Resume threshold must exceed pause threshold');
  if (!Number.isInteger(next.pollIntervalSeconds) || next.pollIntervalSeconds < 15 || next.pollIntervalSeconds > 3600) throw new GuardError('invalid_configuration', 'pollIntervalSeconds must be 15..3600');
  for (const key of ['codexPath', 'compatibleCli', 'compatibleDesktop']) if (next[key] !== null && (typeof next[key] !== 'string' || !next[key].trim())) throw new GuardError('invalid_configuration', key);
  return next;
}
export class Store {
  constructor(home) { this.home = home; this.file = path.join(home, 'state.json'); }
  async open() {
    await fs.mkdir(this.home, { recursive: true });
    try { this.data = JSON.parse(await fs.readFile(this.file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new GuardError('invalid_state_file', 'State file is unreadable; no automatic control will start');
      this.data = { schema: 1, config: { ...defaults }, watches: {}, episodes: [], lastQuota: null, lastError: null, lastTick: null };
    }
    if (this.data.schema !== 1 || !this.data.watches || !Array.isArray(this.data.episodes) || (this.data.manualActions !== undefined && !Array.isArray(this.data.manualActions))) throw new GuardError('unsupported_state_schema');
    this.data.config = validateConfig(this.data.config);
    return this;
  }
  async save() {
    const contents = JSON.stringify(this.data, null, 2) + '\n';
    this.writeQueue = (this.writeQueue ?? Promise.resolve()).then(() => this.write(contents));
    return this.writeQueue;
  }
  async write(contents) {
    const temporary = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, contents, { mode: 0o600 });
    await fs.rename(temporary, this.file);
  }
  async event(type, details = {}) {
    const file = path.join(this.home, 'events.jsonl');
    try { if ((await fs.stat(file)).size > 1024 * 1024) await fs.rename(file, path.join(this.home, 'events.previous.jsonl')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.appendFile(file, JSON.stringify({ at: new Date().toISOString(), type, ...details }) + '\n', { mode: 0o600 });
  }
  async events(limit = 20) {
    try { return (await fs.readFile(path.join(this.home, 'events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).slice(-limit).map(line => JSON.parse(line)); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
}

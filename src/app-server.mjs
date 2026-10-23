import { spawn, execFile } from 'node:child_process';
import readline from 'node:readline';
import { promisify } from 'node:util';
import path from 'node:path';
import { findCodex } from './paths.mjs';
import { GuardError } from './util.mjs';
import { version } from './version.mjs';
import { macVersion } from './platform/macos.mjs';
const execute = promisify(execFile);
const allowed = new Set(['account/rateLimits/read', 'account/read', 'thread/list', 'thread/read', 'thread/turns/list', 'thread/goal/get', 'thread/goal/set', 'thread/queue/list']);
export class AppServer {
  constructor(codexPath) { this.codexPath = codexPath; this.pending = new Map(); this.counter = 0; }
  async start() {
    this.executable = await findCodex(this.codexPath);
    this.child = spawn(this.executable, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child.stderr.resume();
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', () => this.fail(new GuardError('app_server_closed')));
    this.reader = readline.createInterface({ input: this.child.stdout });
    this.reader.on('line', line => { try { this.receive(JSON.parse(line)); } catch {} });
    const result = await this.request('initialize', { clientInfo: { name: 'codex-quota-guard', version }, capabilities: { experimentalApi: true } }, 20000);
    this.child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    this.initialization = result;
    return this;
  }
  receive(message) {
    if (message.method && message.id !== undefined) {
      // No inference, approvals, input, sign-in, or attestation is delegated to this helper.
      this.child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Quota Guard does not handle interactive server requests' } }) + '\n');
      return;
    }
    const waiting = this.pending.get(message.id);
    if (!waiting) return;
    clearTimeout(waiting.timer); this.pending.delete(message.id);
    if (message.error) waiting.reject(new GuardError('app_server_error', message.error.message, { rpcCode: message.error.code }));
    else waiting.resolve(message.result);
  }
  request(method, params, timeout = 15000) {
    if (method !== 'initialize' && !allowed.has(method)) return Promise.reject(new GuardError('method_not_allowed', method));
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new GuardError('app_server_timeout', method, { uncertain: method === 'thread/goal/set' })); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => {
        if (error && this.pending.has(id)) { clearTimeout(timer); this.pending.delete(id); reject(new GuardError('app_server_write_failed', error.message, { uncertain: method === 'thread/goal/set' })); }
      });
    });
  }
  fail(error) { for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); } this.pending.clear(); }
  async version() { const result = await execute(this.executable || await findCodex(this.codexPath), ['--version'], { windowsHide: true, timeout: 10000 }); return result.stdout.trim(); }
  async close() { this.reader?.close(); this.child?.stdin.end(); this.fail(new GuardError('app_server_closed')); if (this.child && this.child.exitCode === null) this.child.kill(); }
}
export async function desktopVersion() {
  if (process.platform === 'darwin') { try { return (await macVersion()).version; } catch { return null; } }
  if (process.platform !== 'win32') return null;
  const command = "$p = Get-CimInstance Win32_Process -Filter \"Name = 'ChatGPT.exe'\" | Where-Object { $_.CommandLine -notmatch ' --type=' } | Select-Object -First 1; if ($p) { $p.ExecutablePath }";
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try { const result = await execute(shell, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 12000 }); return /OpenAI\.Codex_([^_]+)_/.exec(result.stdout)?.[1] ?? null; } catch { return null; }
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import readline from 'node:readline';
import { promisify } from 'node:util';
import { findCodex, projectRoot } from '../src/paths.mjs';
const execute = promisify(execFile);
const release = JSON.parse(await fs.readFile(path.join(projectRoot, 'dist', 'latest.json'), 'utf8'));
const home = path.join(projectRoot, '.runtime', `package-validation-${Date.now()}`);
await fs.mkdir(home, { recursive: true });
const env = { ...process.env, CODEX_HOME: home }, cli = await findCodex();
const checks = [];
for (const args of [['plugin', 'marketplace', 'add', release.directory, '--json'], ['plugin', 'add', 'quota-guard@quota-guard-local', '--json'], ['plugin', 'list', '--json']]) {
  const result = await execute(cli, args, { env, windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  checks.push({ command: args.slice(0, 3).join(' '), stdout: result.stdout.trim() });
}
const child = spawn(cli, ['app-server'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
child.stderr.resume(); const reader = readline.createInterface({ input: child.stdout }); let counter = 0; const pending = new Map();
reader.on('line', line => { try { const v = JSON.parse(line); const entry = pending.get(v.id); if (entry) { clearTimeout(entry.timer); pending.delete(v.id); v.error ? entry.reject(new Error(v.error.message)) : entry.resolve(v.result); } } catch {} });
function request(method, params) { const id = ++counter; return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(Error('protocol_timeout')); }, 30000); pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); }); }
try {
  await request('initialize', { clientInfo: { name: 'quota-guard-package-validation', version: '0.1.0' }, capabilities: { experimentalApi: true } });
  child.stdin.write('{"method":"initialized"}\n');
  const servers = await request('mcpServerStatus/list', {});
  const summaries = servers.data.map(server => ({ name: server.name, status: server.status, tools: Object.keys(server.tools ?? {}) }));
  checks.push({ command: 'mcpServerStatus/list', result: summaries });
  if (!summaries.some(server => server.tools.some(name => name.endsWith('quota_status')))) throw Error('Installed plugin MCP tools were not discovered');
  const result = { passed: true, isolatedHome: home, checks };
  await fs.writeFile(path.join(projectRoot, '.runtime', 'package-validation.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { reader.close(); child.stdin.end(); child.kill(); }

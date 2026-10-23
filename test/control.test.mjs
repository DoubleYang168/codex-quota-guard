import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectRoot, controlEndpoint } from '../src/paths.mjs';
import { tokenFor, control, startMonitor } from '../src/control.mjs';
const execute = promisify(execFile);
async function temporary(prefix) { const parent = path.join(projectRoot, '.runtime', 'tests'); await fs.mkdir(parent, { recursive: true }); return fs.mkdtemp(path.join(parent, prefix)); }

test('concurrent token readers agree on one complete token; invalid existing credentials are not replaced', async () => {
  const home = await temporary('tokens-');
  const tokens = await Promise.all(Array.from({ length: 16 }, () => tokenFor(home)));
  assert.equal(new Set(tokens).size, 1); assert.match(tokens[0], /^[a-f0-9]{64}$/);
  await fs.writeFile(path.join(home, 'control-token'), 'invalid');
  await assert.rejects(tokenFor(home), error => error.code === 'invalid_control_token');
  assert.equal(await fs.readFile(path.join(home, 'control-token'), 'utf8'), 'invalid');
});
test('authentication failure is surfaced instead of spawning another helper', async t => {
  const home = await temporary('auth-'); const first = await startMonitor(home), original = await tokenFor(home);
  t.after(async () => { await fs.writeFile(path.join(home, 'control-token'), original); try { await control('shutdown', {}, { home }); } catch {} });
  await fs.writeFile(path.join(home, 'control-token'), (original[0] === 'a' ? 'b' : 'a') + original.slice(1));
  try { await assert.rejects(startMonitor(home), error => error.code === 'unauthorized_control_request'); }
  finally { await fs.writeFile(path.join(home, 'control-token'), original); }
  assert.equal((await control('ping', {}, { home })).instance, first.instance);
});
test('a silent endpoint does not count as an absent helper and does not create a monitor lock', async t => {
  const home = await temporary('timeout-'), sockets = new Set();
  const server = net.createServer(socket => { sockets.add(socket); socket.resume(); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(controlEndpoint(home), resolve));
  t.after(() => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(resolve); }));
  await assert.rejects(startMonitor(home), error => error.code === 'control_timeout');
  await assert.rejects(fs.stat(path.join(home, 'monitor.lock')), error => error.code === 'ENOENT');
});
test('CLI stop persists disabled state and service-status does not bring the helper back', async t => {
  const home = await temporary('cli-stop-'); await startMonitor(home);
  t.after(async () => { try { await control('shutdown', {}, { home }); } catch {} });
  const options = { env: { ...process.env, CODEX_QUOTA_GUARD_HOME: home }, windowsHide: true, timeout: 10000 };
  const stopped = JSON.parse((await execute(process.execPath, [path.join(projectRoot, 'bin', 'quota-guard.mjs'), 'stop'], options)).stdout);
  assert.equal(stopped.running, false); assert.equal(stopped.enabled, false);
  const status = JSON.parse((await execute(process.execPath, [path.join(projectRoot, 'bin', 'quota-guard.mjs'), 'service-status'], options)).stdout);
  assert.equal(status.running, false); assert.equal(status.enabled, false);
});

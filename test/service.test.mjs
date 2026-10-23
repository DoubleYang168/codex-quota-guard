import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { serviceStatus, serviceControl } from '../src/service.mjs';
import { control, startMonitor } from '../src/control.mjs';
import { dataDirectory, projectRoot } from '../src/paths.mjs';
import { defaults } from '../src/store.mjs';
import { GuardError } from '../src/util.mjs';

test('offline status uses saved state and never starts a service; timeouts are not reported as stopped', async () => {
  let loads = 0;
  const deps = { send: async () => { throw new GuardError('monitor_not_running'); }, load: async () => { loads++; return { config: { ...defaults, observeOnly: false }, watches: { chat: {} }, lastQuota: { remaining: 30, readAt: 100 } }; } };
  const result = await serviceStatus(deps);
  assert.equal(result.running, false); assert.equal(result.observeOnly, false); assert.equal(result.managedCount, 1); assert.equal(result.remaining, 30); assert.equal(loads, 1);
  await assert.rejects(serviceStatus({ ...deps, send: async () => { throw new GuardError('control_timeout'); } }), error => error.code === 'control_timeout'); assert.equal(loads, 1);
});
test('shutdown first disables management, confirms exit, and does not restart on repeated calls', async () => {
  const calls = []; let read = 0;
  const deps = { start: async () => { throw Error('must not start'); }, send: async (method, args) => calls.push({ method, args }), status: async () => ({ running: read++ === 0, enabled: read === 1 }), wait: async () => {} };
  const result = await serviceControl('shutdown', deps); assert.equal(result.running, false);
  assert.deepEqual(calls, [{ method: 'configure', args: { enabled: false } }, { method: 'shutdown', args: {} }]);
  calls.length = 0; await serviceControl('shutdown', deps); assert.deepEqual(calls, []);
});
test('unknown shutdown outcome is reported instead of claiming success or resending', async () => {
  const calls = [];
  await assert.rejects(serviceControl('shutdown', { send: async method => calls.push(method), status: async () => ({ running: true }), wait: async () => {} }), error => error.code === 'shutdown_not_confirmed');
  assert.deepEqual(calls, ['configure', 'shutdown']);
});
test('service enable/disable/exit/restart works across real helper processes without enrolling or controlling chats', async t => {
  const parent = path.join(projectRoot, '.runtime', 'tests'); await fs.mkdir(parent, { recursive: true });
  const home = await fs.mkdtemp(path.join(parent, 'service-'));
  t.after(async () => { try { await control('shutdown', {}, { home }); } catch {} });
  assert.equal((await serviceStatus({ home })).running, false);
  await serviceControl('enable', { home });
  const first = await control('ping', {}, { home });
  await control('configure', { pauseRemainingPercent: 7 }, { home });
  const disabled = await serviceControl('disable', { home }); assert.equal(disabled.running, true); assert.equal(disabled.enabled, false);
  const exited = await serviceControl('shutdown', { home }); assert.equal(exited.running, false);
  assert.equal((await serviceStatus({ home })).running, false);
  await serviceControl('enable', { home });
  const second = await control('ping', {}, { home }); assert.notEqual(first.instance, second.instance);
  const state = await control('cached_status', {}, { home });
  assert.equal(state.config.pauseRemainingPercent, 7); assert.equal(state.config.observeOnly, defaults.observeOnly); assert.deepEqual(state.managed, []); assert.deepEqual(state.episodes, []);
});
test('installed runtime pointer keeps old data directory and refuses malformed pointers', async () => {
  const parent = path.join(projectRoot, '.runtime', 'tests'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'pointer-'));
  const home = path.join(root, 'kept-data');
  await fs.writeFile(path.join(root, 'runtime-home.json'), JSON.stringify({ schema: 1, home }));
  if (!process.env.CODEX_QUOTA_GUARD_HOME) { assert.equal(dataDirectory(root), home); await fs.writeFile(path.join(root, 'runtime-home.json'), '{broken'); assert.throws(() => dataDirectory(root)); }
});

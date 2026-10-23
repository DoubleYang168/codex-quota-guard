import test from 'node:test';
import assert from 'node:assert/strict';
import { Backend, compatibleVersions } from '../src/backend.mjs';
import { platformDefaults } from '../src/platform/index.mjs';
const defaults = platformDefaults('win32');

test('version compatibility accepts only reviewed pairs and preserves custom pins', () => {
  assert.equal(compatibleVersions('codex-cli 0.163.0-alpha.10.2', '26.1013.4894.0', defaults, 'win32'), true);
  assert.equal(compatibleVersions('codex-cli 0.163.0-alpha.11.2', '26.1016.8622.0', defaults, 'win32'), true);
  assert.equal(compatibleVersions('codex-cli 0.163.0-alpha.11.2', null, defaults, 'win32'), true);
  assert.equal(compatibleVersions('codex-cli 0.163.0-alpha.11.2', '26.1013.4894.0', defaults, 'win32'), false);
  assert.equal(compatibleVersions('codex-cli 0.164.0', null, defaults, 'win32'), false);
  assert.equal(compatibleVersions('codex-cli 0.163.0-alpha.11.2', null, defaults, 'linux'), false);
  assert.equal(compatibleVersions('codex-cli 0.163.0-alpha.11.2', null, { compatibleCli: 'custom', compatibleDesktop: 'custom' }, 'win32'), false);
});

function fixture({ goal = true, owner = true } = {}) {
  const calls = [], state = { turn: { id: 'turn', status: 'inProgress' }, goal: goal ? { threadId: 'chat', createdAt: 1, objective: 'Same Goal', status: 'active' } : null };
  const ipc = { open: async function () { return this; }, owner: async () => { calls.push('owner'); if (!owner) throw Error('not_loaded'); }, stop: async () => { calls.push('interrupt'); return { interruptedTurnId: 'turn' }; }, close: () => calls.push('close') };
  const rpc = { request: async (method, params) => { calls.push({ method, params }); state.goal.status = 'paused'; return { goal: structuredClone(state.goal) }; } };
  const backend = new Backend({}, { rpc, ipcFactory: () => ipc }); backend.snapshot = async () => structuredClone(state);
  return { backend, state, calls };
}

test('an active Goal is explicitly paused before an exact-turn interrupt', async () => {
  const x = fixture(); await x.backend.stop('chat', 'turn');
  assert.deepEqual(x.calls, ['owner', { method: 'thread/goal/set', params: { threadId: 'chat', status: 'paused' } }, 'interrupt', 'close']);
});

test('no Goal writes are made for an unloaded desktop, an ordinary task or a changed turn', async () => {
  const unloaded = fixture({ owner: false }); await assert.rejects(unloaded.backend.stop('chat', 'turn')); assert.deepEqual(unloaded.calls, ['owner', 'close']);
  const ordinary = fixture({ goal: false }); await ordinary.backend.stop('chat', 'turn'); assert.deepEqual(ordinary.calls, ['owner', 'interrupt', 'close']);
  const changed = fixture(); changed.state.turn.id = 'user-turn'; await assert.rejects(changed.backend.stop('chat', 'turn')); assert.deepEqual(changed.calls, ['owner', 'close']);
});

test('a Goal or turn change during Goal pause prevents the interrupt', async () => {
  for (const change of ['goal', 'turn']) {
    const x = fixture(); x.backend.rpc.request = async () => { x.state.goal.status = 'paused'; if (change === 'goal') x.state.goal.objective = 'Replacement'; else x.state.turn.id = 'user-turn'; return { goal: structuredClone(x.state.goal) }; };
    await assert.rejects(x.backend.stop('chat', 'turn')); assert.ok(!x.calls.includes('interrupt'));
  }
});

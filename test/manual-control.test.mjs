import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from '../src/store.mjs';
import { Engine } from '../src/engine.mjs';
import { ManualControl } from '../src/manual-control.mjs';
import { projectRoot } from '../src/paths.mjs';
import { GuardError } from '../src/util.mjs';
const threadId = '11111111-1111-4111-8111-111111111111';
const request = action => ({ threadId, action, requestId: crypto.randomUUID() });
async function setup() {
  const parent = path.join(projectRoot, '.runtime', 'tests'); await fs.mkdir(parent, { recursive: true });
  const store = await new Store(await fs.mkdtemp(path.join(parent, 'manual-'))).open();
  store.data.config.enabled = false; store.data.config.observeOnly = true;
  const state = { thread: {}, identity: 'same-settings', threadId, turn: { id: 'old', status: 'inProgress', items: [] }, goal: { threadId, objective: 'Test only', createdAt: 1, updatedAt: 1, status: 'active' }, queueKnown: true, queueCount: 0 };
  const calls = { stop: 0, start: 0 };
  const backend = {
    compatibility: async () => ({ compatible: true }),
    quota: async () => ({ remaining: 1, readAt: Date.now(), allowed: true, accountFingerprint: 'account', resetsAt: 123 }),
    snapshot: async () => { const copy = structuredClone(state); copy.recentTurns = copy.turn ? [copy.turn] : []; return copy; },
    stop: async () => {
      const saved = JSON.parse(await fs.readFile(store.file, 'utf8'));
      assert.equal(saved.manualActions.at(-1).status, 'pending');
      calls.stop++; state.turn.status = 'interrupted'; state.goal.status = 'paused'; state.goal.updatedAt++;
    },
    waitStopped: async () => backend.snapshot(),
    start: async item => {
      const saved = JSON.parse(await fs.readFile(store.file, 'utf8'));
      assert.equal(saved.manualActions.at(-1).status, 'pending');
      calls.start++; if (item.goalWasActive) state.goal.status = 'active';
      state.turn = { id: 'new', status: 'inProgress', items: [{ text: `[quota-guard:${item.id}]` }] }; return { turnId: 'new' };
    }
  };
  const engine = new Engine(store, backend), manual = new ManualControl(store, backend, engine, { wait: async () => {} });
  return { store, state, calls, backend, engine, manual };
}

test('manual stop persists before interruption, works in disabled observe mode, and never enrolls or schedules recovery', async () => {
  const x = await setup(), command = request('stop');
  const config = structuredClone(x.store.data.config);
  const result = await x.manual.run(command);
  assert.equal(result.status, 'succeeded'); assert.equal(result.turnStatus, 'interrupted');
  assert.equal(x.calls.stop, 1); assert.deepEqual(x.store.data.watches, {}); assert.deepEqual(x.store.data.episodes, []);
  assert.deepEqual(x.store.data.config, config);
  assert.equal((await x.manual.run(command)).replayed, true); assert.equal(x.calls.stop, 1);
  assert.equal((await x.manual.run(request('stop'))).status, 'no_op'); assert.equal(x.calls.stop, 1);
});

test('manual start continues an idle paused Goal at low quota without changing automatic settings', async () => {
  const x = await setup(); x.state.turn.status = 'interrupted'; x.state.goal.status = 'paused';
  const command = request('start'), result = await x.manual.run(command);
  assert.equal(result.status, 'succeeded'); assert.equal(result.confirmedNewTurnId, 'new'); assert.equal(result.goalStatus, 'active');
  assert.match(result.message, /后续自动执行需继续核对/);
  await x.manual.run(command); assert.equal(x.calls.start, 1);
  assert.equal(x.store.data.config.observeOnly, true); assert.equal(x.store.data.config.enabled, false); assert.deepEqual(x.store.data.watches, {});
});

test('manual start on an already running chat is a no-op, not another continuation', async () => {
  const x = await setup(); assert.equal((await x.manual.run(request('start'))).status, 'no_op'); assert.equal(x.calls.start, 0);
});

test('queued, unknown, exhausted and incompatible starts fail before any mutation', async () => {
  for (const condition of ['queue', 'unknown_queue', 'quota', 'version']) {
    const x = await setup(); x.state.turn.status = 'interrupted';
    if (condition === 'queue') x.state.queueCount = 1;
    if (condition === 'unknown_queue') x.state.queueKnown = false;
    if (condition === 'quota') x.backend.quota = async () => ({ allowed: false });
    if (condition === 'version') x.backend.compatibility = async () => ({ compatible: false });
    assert.equal((await x.manual.run(request('start'))).status, 'failed', condition);
    assert.deepEqual(x.calls, { start: 0, stop: 0 });
  }
});

test('manual control checks turn and Goal changes again immediately before dispatch', async () => {
  for (const condition of ['turn', 'goal']) {
    const x = await setup(), snapshot = x.backend.snapshot; let reads = 0;
    x.backend.snapshot = async () => { if (++reads === 2) { if (condition === 'turn') x.state.turn.id = 'user-new-turn'; else x.state.goal.updatedAt++; } return snapshot(); };
    const result = await x.manual.run(request('stop')); assert.equal(result.status, 'failed'); assert.equal(result.error.code, 'thread_changed'); assert.equal(x.calls.stop, 0);
  }
});

test('manual stop cancels pending quota recovery so an explicit stop will not be undone', async () => {
  const x = await setup(); x.state.turn.status = 'interrupted';
  x.store.data.episodes.push({ id: 'quota-episode', threadId, status: 'waiting_reset' });
  const result = await x.manual.run(request('stop'));
  assert.equal(result.status, 'no_op'); assert.equal(x.store.data.episodes[0].status, 'cancelled'); assert.equal(x.calls.stop, 0);
});

test('uncertain manual control blocks repeated mutations and automatic rules until acknowledged', async () => {
  const x = await setup(); await x.engine.watch(threadId); x.store.data.config.enabled = true; x.store.data.config.observeOnly = false;
  x.backend.stop = async () => { x.calls.stop++; throw new GuardError('ipc_timeout', 'unknown', { uncertain: true }); };
  const command = request('stop'), result = await x.manual.run(command);
  assert.equal(result.status, 'needs_attention');
  await assert.rejects(x.manual.run(request('stop')), error => error.code === 'manual_result_unknown');
  assert.equal((await x.manual.run(command)).replayed, true);
  await x.engine.tick(); assert.equal(x.calls.stop, 1); assert.deepEqual(x.store.data.episodes, []);
  await x.manual.dismiss(command.requestId); assert.equal(x.store.data.manualActions[0].status, 'dismissed');
  assert.equal(x.calls.stop, 1);
});

test('restart during manual control preserves uncertainty and never replays the command', async () => {
  const x = await setup(), command = request('start');
  x.store.data.manualActions.push({ id: command.requestId, threadId, action: 'start', status: 'pending' }); await x.store.save();
  const reopened = await new Store(x.store.home).open(), manual = new ManualControl(reopened, x.backend, x.engine);
  await manual.recover(); assert.equal(reopened.data.manualActions[0].status, 'needs_attention');
  assert.equal((await manual.run(command)).replayed, true); assert.equal(x.calls.start, 0);
});

test('the scheduler and manual control cannot issue mutations concurrently', async () => {
  const x = await setup(); x.engine.running = true;
  await assert.rejects(x.manual.run(request('stop')), error => error.code === 'operation_in_progress'); x.engine.running = false;
  let release; x.backend.compatibility = () => new Promise(resolve => { release = () => resolve({ compatible: true }); });
  const first = x.manual.run(request('stop'));
  await assert.rejects(x.manual.run(request('stop')), error => error.code === 'operation_in_progress');
  while (!release) await new Promise(resolve => setTimeout(resolve, 1)); release();
  assert.equal((await first).status, 'succeeded'); assert.equal(x.calls.stop, 1);
});

test('an accepted continuation is not success without matching execution evidence', async () => {
  const x = await setup(); x.state.turn.status = 'interrupted';
  x.backend.start = async () => { x.calls.start++; return { turnId: 'not-observed' }; };
  const result = await x.manual.run(request('start'));
  assert.equal(result.status, 'needs_attention'); assert.equal(x.calls.start, 1);
});

test('a changed account for a monitored chat prevents manual dispatch and request IDs cannot be reused across actions', async () => {
  const x = await setup(); await x.engine.watch(threadId);
  x.backend.quota = async () => ({ accountFingerprint: 'other', allowed: true });
  const command = request('stop'), result = await x.manual.run(command);
  assert.equal(result.status, 'failed'); assert.equal(result.error.code, 'account_changed'); assert.equal(x.calls.stop, 0);
  await assert.rejects(x.manual.run({ ...command, action: 'start' }), error => error.code === 'request_id_conflict');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../src/paths.mjs';
import { Store, validateConfig } from '../src/store.mjs';
import { Engine } from '../src/engine.mjs';
import { goalIdentity, GuardError } from '../src/util.mjs';
const THREAD = '11111111-1111-4111-8111-111111111111';
async function setup(t, { goal = true, observe = false } = {}) {
  const home = await fs.mkdtemp(path.join(await fs.mkdir(path.join(projectRoot, '.runtime', 'tests'), { recursive: true }).then(() => path.join(projectRoot, '.runtime', 'tests')), 'engine-'));
  const store = await new Store(home).open(); store.data.config.observeOnly = observe;
  let now = 1000000;
  const state = { threadId: THREAD, thread: { source: 'vscode' }, identity: 'settings', goal: goal ? { threadId: THREAD, objective: 'Finish two steps', createdAt: 1, updatedAt: 1, status: 'active' } : null,
    turn: { id: 'turn-1', status: 'inProgress', items: [] }, queueKnown: true, queueCount: 0 };
  const limits = { remaining: 4, weeklyRemaining: 50, allowed: true, accountFingerprint: 'account', resetsAt: 2000 };
  const calls = { stop: 0, start: 0 };
  const backend = {
    quota: async () => ({ ...limits, readAt: now }), compatibility: async () => ({ compatible: true }),
    snapshot: async () => { const result = structuredClone(state); result.goalIdentity = goalIdentity(result.goal); result.recentTurns = [result.turn]; return result; },
    stop: async () => { calls.stop++; state.turn.status = 'interrupted'; if (state.goal) { state.goal.status = 'paused'; state.goal.updatedAt = 2; } },
    waitStopped: async () => backend.snapshot(),
    start: async episode => { calls.start++; if (state.goal) { state.goal.status = 'active'; state.goal.updatedAt = 3; } state.turn = { id: 'turn-2', status: 'inProgress', items: [{ text: `[quota-guard:${episode.id}]` }] }; return { turnId: 'turn-2' }; }
  };
  const engine = new Engine(store, backend, { clock: () => now });
  await engine.watch(THREAD);
  return { store, engine, backend, state, limits, calls, advance: ms => { now += ms; }, episode: () => store.data.episodes.at(-1) };
}
test('observe mode records proposed stop without mutation', async t => {
  const x = await setup(t, { observe: true }); await x.engine.tick();
  assert.deepEqual(x.calls, { stop: 0, start: 0 }); assert.equal(x.store.data.episodes.length, 0);
  assert.equal((await x.store.events()).at(-1).type, 'would_pause');
});
test('exact threshold stops once; partial replenishment and exhausted weekly quota do not resume', async t => {
  const x = await setup(t); x.limits.remaining = 5; await x.engine.tick(); assert.equal(x.episode().status, 'waiting_reset');
  await x.engine.tick(); assert.equal(x.calls.stop, 1);
  x.limits.remaining = 99; await x.engine.tick(); assert.equal(x.calls.start, 0);
  x.limits.remaining = 100; x.limits.weeklyRemaining = 0; await x.engine.tick(); assert.equal(x.calls.start, 0);
});
test('Goal resume is not claimed until a subsequent turn is observed', async t => {
  const x = await setup(t); await x.engine.tick(); x.limits.remaining = 100;
  await x.engine.tick(); assert.equal(x.episode().status, 'resume_check');
  await x.engine.tick(); assert.equal(x.episode().status, 'goal_check');
  x.state.turn = { id: 'turn-3', status: 'inProgress', items: [] };
  await x.engine.tick(); assert.equal(x.episode().status, 'resumed'); assert.equal(x.calls.start, 1);
});
test('ordinary task needs a matching execution turn, not a Goal', async t => {
  const x = await setup(t, { goal: false }); await x.engine.tick(); x.limits.remaining = 100;
  await x.engine.tick(); await x.engine.tick(); assert.equal(x.episode().status, 'resumed');
});
test('new user work supersedes pending recovery and is not stopped again in that window', async t => {
  const x = await setup(t); await x.engine.tick(); x.state.turn = { id: 'user-turn', status: 'inProgress' };
  await x.engine.tick(); assert.equal(x.episode().status, 'cancelled');
  await x.engine.tick(); assert.equal(x.calls.stop, 1); assert.equal(x.calls.start, 0);
});
test('manual Goal change cancels automatic recovery', async t => {
  const x = await setup(t); await x.engine.tick(); x.state.goal.updatedAt = 9;
  x.limits.remaining = 100; await x.engine.tick(); assert.equal(x.episode().status, 'cancelled'); assert.equal(x.calls.start, 0);
});

test('explicit checks re-evaluate new work in the same quota window while background ticks preserve the exemption', async t => {
  const x = await setup(t); await x.engine.tick();
  x.state.turn = { id: 'user-new-turn', status: 'inProgress', items: [] }; x.state.goal.status = 'active';
  await x.engine.tick(); assert.equal(x.episode().status, 'cancelled');
  await x.engine.tick(); assert.equal(x.calls.stop, 1);
  assert.match(x.store.data.watches[THREAD].lastReason, /立即检查/);
  const result = await x.engine.tick({ explicit: true });
  assert.equal(result.pausedCount, 1); assert.equal(x.calls.stop, 2);
  assert.equal(x.episode().turnId, 'user-new-turn'); assert.equal(x.episode().status, 'waiting_reset');
  assert.equal(x.store.data.watches[THREAD].lastTurn.status, 'interrupted');
});

test('an explicit check cancels superseded recovery and checks the current turn in the same click', async t => {
  const x = await setup(t); await x.engine.tick();
  const previous = x.episode(); x.state.turn = { id: 'new-turn', status: 'inProgress', items: [] }; x.state.goal.status = 'active';
  const result = await x.engine.tick({ explicit: true });
  assert.equal(previous.status, 'cancelled'); assert.equal(result.pausedCount, 1); assert.equal(x.calls.stop, 2);
});

test('explicit checks still enforce observe mode, thresholds and automatic-management disable', async t => {
  const x = await setup(t, { observe: true });
  x.store.data.watches[THREAD].skipWindow = x.limits.resetsAt;
  let result = await x.engine.tick({ explicit: true }); assert.equal(result.wouldPauseCount, 1); assert.equal(x.calls.stop, 0);
  x.store.data.config.observeOnly = false; x.limits.remaining = 90;
  result = await x.engine.tick({ explicit: true }); assert.equal(result.pausedCount, 0); assert.equal(x.calls.stop, 0);
  x.limits.remaining = 1; x.store.data.config.enabled = false;
  result = await x.engine.tick({ explicit: true }); assert.equal(result.skipped, 'disabled'); assert.equal(x.calls.stop, 0);
});
test('queued input holds recovery', async t => {
  const x = await setup(t); await x.engine.tick(); x.state.queueCount = 1; x.limits.remaining = 100;
  await x.engine.tick(); assert.equal(x.episode().status, 'waiting_reset'); assert.equal(x.calls.start, 0);
});
test('uncertain start is never automatically repeated', async t => {
  const x = await setup(t); await x.engine.tick(); x.limits.remaining = 100;
  x.backend.start = async () => { x.calls.start++; throw new GuardError('ipc_timeout', '', { uncertain: true }); };
  await x.engine.tick(); assert.equal(x.episode().status, 'needs_attention');
  await x.engine.tick(); assert.equal(x.calls.start, 1); assert.equal(x.calls.stop, 1);
});
test('unconfirmed stop is not treated as paused or automatically resumed', async t => {
  const x = await setup(t); x.backend.stop = async () => { x.calls.stop++; throw new GuardError('ipc_timeout', '', { uncertain: true }); };
  await x.engine.tick(); assert.equal(x.episode().status, 'needs_attention'); x.limits.remaining = 100;
  await x.engine.tick(); assert.equal(x.calls.start, 0);
});
test('account change and incompatible version prevent control', async t => {
  const x = await setup(t); x.limits.accountFingerprint = 'other'; await x.engine.tick(); assert.equal(x.calls.stop, 0);
  x.limits.accountFingerprint = 'account'; x.backend.compatibility = async () => ({ compatible: false }); await x.engine.tick(); assert.equal(x.calls.stop, 0);
});
test('restart during stop requires inspection, and does not resend stop', async t => {
  const x = await setup(t); x.store.data.episodes.push({ id: 'pending', threadId: THREAD, status: 'pause_pending' });
  await x.engine.recover(); await x.engine.tick(); assert.equal(x.episode().status, 'needs_attention'); assert.equal(x.calls.stop, 0);
});
test('restart during resume checks evidence without resubmitting', async t => {
  const x = await setup(t); await x.engine.tick(); x.limits.remaining = 100; await x.engine.tick();
  x.episode().status = 'resume_pending'; await x.engine.recover(); await x.engine.tick();
  assert.equal(x.episode().status, 'goal_check'); assert.equal(x.calls.start, 1);
});
test('disabled or removed management is checked again before stop', async t => {
  const x = await setup(t); const read = x.backend.snapshot; let reads = 0;
  x.backend.snapshot = async () => { const result = await read(); if (++reads === 2) x.store.data.config.enabled = false; return result; };
  await x.engine.tick(); assert.equal(x.calls.stop, 0); assert.equal(x.episode().status, 'cancelled');
});
test('concurrent checks cannot dispatch duplicate control', async t => {
  const x = await setup(t); await Promise.all([x.engine.tick(), x.engine.tick()]); assert.equal(x.calls.stop, 1);
});
test('quota is refreshed before stop; replenishment during snapshot collection cancels the stop', async t => {
  const x = await setup(t); let queries = 0;
  x.backend.quota = async () => ({ ...x.limits, remaining: ++queries === 1 ? 4 : 100, readAt: 1000000 });
  await x.engine.tick(); assert.equal(x.calls.stop, 0); assert.equal(x.episode().status, 'cancelled');
});

test('disabling from the dashboard during the last quota read prevents a stop', async t => {
  const x = await setup(t); let reads = 0;
  x.backend.quota = async () => { if (++reads === 2) x.store.data.config = { ...x.store.data.config, enabled: false }; return { ...x.limits, readAt: 1000000 }; };
  await x.engine.tick(); assert.equal(x.calls.stop, 0); assert.equal(x.episode().status, 'cancelled');
});

test('selecting an already managed chat does not replace its accepted settings or pending recovery', async t => {
  const x = await setup(t); const watch = structuredClone(x.store.data.watches[THREAD]); x.state.identity = 'changed';
  const result = await x.engine.watch(THREAD);
  assert.equal(result.alreadyWatched, true); assert.deepEqual(x.store.data.watches[THREAD], watch);
});

test('removing a chat while its stop is being confirmed cannot resurrect its cancelled recovery', async t => {
  const x = await setup(t);
  x.backend.waitStopped = async () => { await x.engine.unwatch(THREAD); return x.backend.snapshot(); };
  await x.engine.tick(); assert.equal(x.episode().status, 'cancelled');
  x.limits.remaining = 100; await x.engine.tick(); assert.equal(x.calls.start, 0);
});

test('removing a chat during an already dispatched continuation keeps its recovery cancelled', async t => {
  const x = await setup(t); await x.engine.tick(); x.limits.remaining = 100;
  x.backend.start = async () => { x.calls.start++; await x.engine.unwatch(THREAD); return { turnId: 'started' }; };
  await x.engine.tick(); assert.equal(x.episode().status, 'cancelled');
  await x.engine.tick(); assert.equal(x.calls.start, 1);
});
test('a single resumed turn without Goal continuation becomes needs-attention', async t => {
  const x = await setup(t); await x.engine.tick(); x.limits.remaining = 100; await x.engine.tick(); await x.engine.tick();
  x.advance(601000); await x.engine.tick(); assert.equal(x.episode().status, 'needs_attention'); assert.equal(x.calls.start, 1);
});
test('state writes remain ordered and invalid configuration is rejected', async t => {
  const x = await setup(t); x.store.data.lastTick = 1; const a = x.store.save(); x.store.data.lastTick = 2; const b = x.store.save(); await Promise.all([a, b]);
  assert.equal((await new Store(x.store.home).open()).data.lastTick, 2);
  assert.throws(() => validateConfig({ pollIntervalSeconds: 0 })); assert.throws(() => validateConfig({ pauseRemainingPercent: 100 })); assert.throws(() => validateConfig({ unknown: true }));
});

test('a long scheduling gap rejects cached quota before control and resumes checks only with a fresh sample', async t => {
  const x = await setup(t);
  const freshQuota = x.backend.quota;
  const cached = await freshQuota();
  x.advance(60 * 60 * 1000);
  x.backend.quota = async () => cached;
  const stale = await x.engine.tick();
  assert.equal(stale.error.code, 'stale_quota');
  assert.deepEqual(x.calls, { stop: 0, start: 0 });
  x.backend.quota = freshQuota;
  await x.engine.tick();
  assert.equal(x.calls.stop, 1);
  x.limits.remaining = 100;
  const recoverySample = await freshQuota();
  x.advance(60 * 60 * 1000);
  x.backend.quota = async () => recoverySample;
  assert.equal((await x.engine.tick()).error.code, 'stale_quota');
  assert.equal(x.calls.start, 0);
  x.backend.quota = freshQuota;
  await x.engine.tick();
  assert.equal(x.calls.start, 1);
});

test('a Goal cleared before successor verification requires inspection without replaying the real continuation', async t => {
  const x = await setup(t);
  await x.engine.tick(); x.limits.remaining = 100;
  await x.engine.tick();
  assert.equal(x.calls.start, 1);
  x.state.goal = null;
  await x.engine.tick();
  assert.equal(x.episode().status, 'needs_attention');
  assert.match(x.episode().reason, /Goal changed/);
  await x.engine.tick();
  assert.equal(x.calls.start, 1);
});

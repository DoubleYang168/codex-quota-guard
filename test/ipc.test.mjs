import fs from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { DesktopIpc, snapshotTurns } from '../src/desktop-ipc.mjs';
async function fixture(t, { wrongTurn = false, nestedStart = false, snapshotVersion = 11 } = {}) {
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\quota-guard-test-${crypto.randomUUID()}` : path.join(await fs.mkdtemp('/tmp/qg-ipc-'), 'ipc.sock');
  const requests = [];
  const server = net.createServer(socket => {
    let buffer = Buffer.alloc(0);
    function send(value) { const b = Buffer.from(JSON.stringify(value)), f = Buffer.alloc(4 + b.length); f.writeUInt32LE(b.length); b.copy(f, 4); socket.write(f.subarray(0, 2)); socket.write(f.subarray(2)); }
    socket.on('data', bytes => {
      buffer = Buffer.concat([buffer, bytes]);
      while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE(0)) {
        const length = buffer.readUInt32LE(0), request = JSON.parse(buffer.subarray(4, 4 + length)); buffer = buffer.subarray(4 + length); requests.push(request);
        if (request.type === 'broadcast') {
          if (request.params.following) {
            const snapshot = { type: 'broadcast', method: 'thread-stream-state-changed', version: snapshotVersion, sourceClientId: 'desktop-owner',
              params: { hostId: 'local', conversationId: request.params.conversationId, change: { type: 'snapshot', conversationState: { id: request.params.conversationId, turns: [{ turnId: 'live-turn', status: 'inProgress', turnStartedAtMs: 1000, items: [] }] } } } };
            send({ ...snapshot, sourceClientId: 'wrong-owner', version: 999 });
            send(snapshot);
          }
          continue;
        }
        send({ type: 'broadcast', method: 'irrelevant', params: {} });
        const result = request.method === 'initialize' ? { clientId: 'client' } : request.method === 'thread-owner-discovery' ? {} : request.method === 'thread-follower-interrupt-turn' ? { interruptedTurnId: wrongTurn ? 'other-turn' : request.params.expectedTurnId } : nestedStart ? { result: { turn: { id: 'new-turn' } } } : { turnId: 'new-turn' };
        send({ type: 'response', requestId: request.requestId, handledByClientId: 'desktop-owner', resultType: 'success', result });
      }
    });
  });
  await new Promise(resolve => server.listen(endpoint, resolve));
  if (process.platform === 'darwin') await fs.chmod(endpoint, 0o600);
  const client = await new DesktopIpc(endpoint).open();
  t.after(async () => { client.close(); await new Promise(resolve => server.close(resolve)); });
  return { client, requests };
}
test('stop names the expected turn, routes to discovered owner, and tolerates fragmented frames', async t => {
  const x = await fixture(t); await x.client.stop('chat', 'running-turn'); const stop = x.requests.at(-1);
  assert.equal(stop.version, 4); assert.equal(stop.params.expectedTurnId, 'running-turn'); assert.equal(stop.targetClientId, 'desktop-owner');
});
test('success response naming another turn is rejected', async t => {
  const x = await fixture(t, { wrongTurn: true }); await assert.rejects(x.client.stop('chat', 'running-turn'), error => error.code === 'turn_not_stopped');
});
test('continuation inherits thread settings and uses a stable client message ID', async t => {
  const x = await fixture(t); await x.client.start('chat', 'Continue', 'stable-id'); const start = x.requests.at(-1);
  assert.equal(start.version, 2); assert.equal(start.params.turnStart.context.inheritThreadSettings, true); assert.equal(start.params.turnStart.request.clientUserMessageId, 'stable-id');
  assert.equal(start.params.turnStart.request.model, undefined); assert.equal(start.params.turnStart.request.approvalPolicy, undefined);
});

test('desktop wrapped continuation result exposes the actual new turn', async t => {
  const x = await fixture(t, { nestedStart: true });
  assert.equal((await x.client.start('chat', 'Continue', 'stable-id')).turn.id, 'new-turn');
});

test('read-only live snapshot subscribes to the owner and cancels its subscription', async t => {
  const x = await fixture(t);
  const live = await x.client.readThread('chat');
  assert.equal(live.turns[0].id, 'live-turn'); assert.equal(live.turns[0].status, 'inProgress');
  assert.equal(live.turns[0].startedAt, 1);
  // Let the fixture receive the cancellation written before readThread returns.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(x.requests.filter(item => item.method === 'thread-stream-following-changed')[0].params.following, true);
  assert.ok(!x.requests.some(item => /interrupt|start-turn/.test(item.method)));
});

test('an unknown snapshot protocol is rejected before turn state can be used', async t => {
  const x = await fixture(t, { snapshotVersion: 12 });
  await assert.rejects(x.client.readThread('chat'), error => error.code === 'live_snapshot_protocol_changed');
});

test('canonical snapshot order and continuation evidence are preserved; incomplete live state is rejected', () => {
  const turn = { turnId: 'current', status: 'inProgress', items: [], params: { input: [{ text: '[quota-guard:test]' }] } };
  const state = { id: 'chat', turns: [], turnHistory: { kind: 'canonical', history: { islands: [{ entries: [{ value: 'current' }] }], entitiesByKey: { current: turn } } } };
  assert.equal(snapshotTurns(state, 'chat')[0].id, 'current');
  assert.match(JSON.stringify(snapshotTurns(state, 'chat')[0].items), /quota-guard:test/);
  assert.throws(() => snapshotTurns(state, 'other'), error => error.code === 'live_thread_state_unknown');
  turn.status = 'completed'; state.threadRuntimeStatus = { type: 'active' };
  assert.throws(() => snapshotTurns(state, 'chat'), error => error.code === 'live_thread_state_unknown');
  state.threadRuntimeStatus = { type: 'idle' }; turn.status = 'inProgress';
  turn.turnId = null;
  assert.throws(() => snapshotTurns(state, 'chat'), error => error.code === 'live_thread_state_unknown');
});

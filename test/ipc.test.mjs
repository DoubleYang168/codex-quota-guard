import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { DesktopIpc } from '../src/desktop-ipc.mjs';
import { dataDirectory } from '../src/paths.mjs';
async function fixture(t, { wrongTurn = false } = {}) {
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\quota-guard-test-${crypto.randomUUID()}` : path.join(dataDirectory(), `test-${crypto.randomUUID()}.sock`);
  const requests = [];
  const server = net.createServer(socket => {
    let buffer = Buffer.alloc(0);
    function send(value) { const b = Buffer.from(JSON.stringify(value)), f = Buffer.alloc(4 + b.length); f.writeUInt32LE(b.length); b.copy(f, 4); socket.write(f.subarray(0, 2)); socket.write(f.subarray(2)); }
    socket.on('data', bytes => {
      buffer = Buffer.concat([buffer, bytes]);
      while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE(0)) {
        const length = buffer.readUInt32LE(0), request = JSON.parse(buffer.subarray(4, 4 + length)); buffer = buffer.subarray(4 + length); requests.push(request);
        send({ type: 'broadcast', method: 'irrelevant', params: {} });
        const result = request.method === 'initialize' ? { clientId: 'client' } : request.method === 'thread-owner-discovery' ? {} : request.method === 'thread-follower-interrupt-turn' ? { interruptedTurnId: wrongTurn ? 'other-turn' : request.params.expectedTurnId } : { turnId: 'new-turn' };
        send({ type: 'response', requestId: request.requestId, handledByClientId: 'desktop-owner', resultType: 'success', result });
      }
    });
  });
  await new Promise(resolve => server.listen(endpoint, resolve));
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

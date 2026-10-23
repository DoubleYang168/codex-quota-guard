import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startDashboard, launchBrowser } from '../src/dashboard.mjs';
import { Backend } from '../src/backend.mjs';

async function fixture(t) {
  const calls = [];
  const page = await startDashboard({ dispatch: async (method, args) => { calls.push({ method, args }); return { ok: true }; } });
  t.after(() => page.close());
  const token = new URL(page.url).hash.slice(1);
  const post = (method, args = {}, headers = {}) => fetch(`${page.origin}/api/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Quota-Guard-Token': token, ...headers }, body: JSON.stringify(args) });
  return { calls, page, post };
}
test('dashboard assets work without exposing credentials; cached status and settings route to the existing monitor', async t => {
  const x = await fixture(t);
  const html = await fetch(x.page.origin); assert.equal(html.status, 200);
  assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const body = await html.text(); assert.match(body, /会话管理/); assert.ok(!body.includes(new URL(x.page.url).hash.slice(1)));
  assert.equal((await fetch(x.page.origin + '/app.js')).status, 200);
  await x.post('status'); await x.post('refresh'); await x.post('configure', { enabled: false });
  assert.deepEqual(x.calls, [{ method: 'cached_status', args: {} }, { method: 'status', args: {} }, { method: 'configure', args: { enabled: false } }]);
});
test('dashboard refuses unauthenticated, cross-origin, cross-site and non-JSON requests before dispatch', async t => {
  const x = await fixture(t);
  for (const [headers, status] of [[{ 'X-Quota-Guard-Token': '' }, 401], [{ Origin: 'https://example.com' }, 403], [{ 'Sec-Fetch-Site': 'cross-site' }, 403], [{ 'Content-Type': 'text/plain' }, 415]]) assert.equal((await x.post('configure', { enabled: true }, headers)).status, status);
  assert.equal((await fetch(x.page.origin + '/api/status')).status, 405);
  assert.deepEqual(x.calls, []);
});
test('dashboard rejects DNS rebinding and request paths outside its action allowlist', async t => {
  const x = await fixture(t);
  const status = await new Promise((resolve, reject) => { const request = http.get(x.page.origin, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); });
  assert.equal(status, 403);
  assert.equal((await x.post('shutdown')).status, 400);
  assert.equal((await x.post('configure', { codexPath: 'untrusted.exe' })).status, 400);
  assert.equal((await x.post('watch', { threadId: 'latest' })).status, 400);
  assert.deepEqual(x.calls, []);
});
test('dashboard limits body size and does not dispatch malformed JSON', async t => {
  const x = await fixture(t), headers = { 'Content-Type': 'application/json', 'X-Quota-Guard-Token': new URL(x.page.url).hash.slice(1) };
  assert.equal((await fetch(x.page.origin + '/api/status', { method: 'POST', headers, body: '{broken' })).status, 400);
  assert.equal((await fetch(x.page.origin + '/api/status', { method: 'POST', headers, body: JSON.stringify({ value: 'x'.repeat(17000) }) })).status, 413);
  assert.deepEqual(x.calls, []);
});
test('history list returns only metadata, paginates and never reports a separate app-server status as live desktop state', async () => {
  let requested;
  const backend = new Backend({}, { rpc: { request: async (method, args) => { requested = { method, args }; return { data: [{ id: 'thread', name: 'Chosen title', preview: 'private text', cwd: 'D:\\work', updatedAt: 5, status: { type: 'notLoaded' }, turns: ['private'] }], nextCursor: 'next' }; } } });
  const result = await backend.listThreads({ cursor: 'previous', search: 'Chosen' });
  assert.equal(requested.method, 'thread/list'); assert.equal(requested.args.cursor, 'previous'); assert.equal(requested.args.searchTerm, 'Chosen');
  assert.equal(result.nextCursor, 'next'); assert.equal(result.threads[0].title, 'Chosen title');
  assert.equal(result.threads[0].status, undefined); assert.equal(result.threads[0].turns, undefined);
});
test('browser launch accepts only a loopback management URL', async () => {
  await assert.rejects(launchBrowser('https://example.com'), /invalid_dashboard_url/);
});

test('manual chat controls require authentication, exact UUIDs, a supported action and an idempotency key', async t => {
  const x = await fixture(t), threadId = '11111111-1111-4111-8111-111111111111', requestId = '22222222-2222-4222-8222-222222222222';
  const valid = { threadId, requestId, action: 'stop' };
  assert.equal((await x.post('thread_control', valid, { 'X-Quota-Guard-Token': '' })).status, 401);
  assert.equal((await x.post('thread_control', valid, { Origin: 'https://example.com' })).status, 403);
  for (const args of [{ ...valid, threadId: 'latest' }, { ...valid, requestId: undefined }, { ...valid, action: 'kill' }, { ...valid, expectedTurnId: 'untrusted' }]) {
    assert.equal((await x.post('thread_control', args)).status, 400);
  }
  assert.deepEqual(x.calls, []);
  assert.equal((await x.post('thread_control', valid)).status, 200);
  assert.deepEqual(x.calls, [{ method: 'thread_control', args: valid }]);
});

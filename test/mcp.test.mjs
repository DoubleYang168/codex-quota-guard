import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { runMcp, callTool } from '../src/mcp.mjs';
test('MCP initialize and tools catalog are usable without starting a monitor', async () => {
  const input = new PassThrough(), output = new PassThrough(); let data = '', called = 0; output.on('data', b => { data += b; });
  const running = runMcp({ input, output, handler: async () => { called++; return {}; } });
  input.end([JSON.stringify({ id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } }), JSON.stringify({ method: 'notifications/initialized' }), JSON.stringify({ id: 2, method: 'tools/list' })].join('\n') + '\n');
  await running; const responses = data.trim().split('\n').map(JSON.parse);
  assert.equal(responses[0].result.protocolVersion, '2025-11-25'); assert.equal(responses[1].result.tools.length, 10); assert.equal(called, 0);
});

test('native panel metadata and HTML resource are available without invoking tools or starting monitoring', async () => {
  const input = new PassThrough(), output = new PassThrough(); let raw = '', calls = 0;
  output.on('data', bytes => { raw += bytes; });
  const done = runMcp({ input, output, handler: async () => { calls++; return {}; } });
  input.end([{ id: 1, method: 'initialize', params: {} }, { id: 2, method: 'tools/list' }, { id: 3, method: 'resources/list' }, { id: 4, method: 'resources/read', params: { uri: 'ui://quota-guard/control-panel-v1.html' } }].map(item => JSON.stringify(item)).join('\n') + '\n');
  await done;
  const replies = raw.trim().split('\n').map(JSON.parse);
  assert.deepEqual(replies[0].result.capabilities.resources, {});
  const descriptor = replies[1].result.tools.find(item => item.name === 'show_control_panel');
  assert.deepEqual(descriptor._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }]);
  assert.equal(descriptor._meta.ui.resourceUri, replies[2].result.resources[0].uri);
  const resource = replies[3].result.contents[0];
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
  assert.match(resource.text, /退出后台/); assert.match(resource.text, /ui\/initialize/);
  assert.ok(!resource.text.includes('<!--SCRIPT-->')); assert.deepEqual(resource._meta.ui.csp.connectDomains, []); assert.equal(calls, 0);
});

test('native status and exit tools bypass automatic startup and reject unknown actions', async () => {
  const calls = [], deps = { start: async () => { throw new Error('must not start'); }, inspect: async () => { calls.push('status'); return { running: false }; }, manage: async action => { calls.push(action); return { running: false }; } };
  await callTool('service_status', {}, deps); await callTool('show_control_panel', {}, deps); await callTool('service_control', { action: 'shutdown' }, deps);
  assert.deepEqual(calls, ['status', 'status', 'shutdown']);
  await assert.rejects(callTool('service_control', { action: 'restart_everything' }, deps), /action/);
});

test('opening the dashboard starts the helper and launches only its returned URL, without changing settings', async () => {
  const calls = [], url = 'http://127.0.0.1:12345/#' + 'a'.repeat(64);
  const deps = { start: async () => calls.push('start'), send: async method => { calls.push(method); return { url }; }, open: async target => calls.push(target) };
  const result = await callTool('open_dashboard', {}, deps);
  assert.equal(result.browserLaunchRequested, true);
  assert.deepEqual(calls, ['start', 'dashboard', url]);
  calls.length = 0;
  await callTool('open_dashboard', { openBrowser: false }, deps);
  assert.deepEqual(calls, ['start', 'dashboard']);
});
test('tool arguments reject accidental widening and malformed chat identities', async () => {
  await assert.rejects(callTool('watch_thread', { threadId: 'latest' }), /invalid_thread_id/);
  await assert.rejects(callTool('quota_status', { observeOnly: false }), /Unknown argument/);
  await assert.rejects(callTool('configure', { observeOnly: 'false' }), /observeOnly/);
});
test('management commands route to the shared helper and global pause does not stop chats', async () => {
  const sent = []; const deps = { start: async () => {}, send: async (method, args) => { sent.push({ method, args }); return {}; } };
  await callTool('set_enabled', { enabled: false }, deps); assert.deepEqual(sent, [{ method: 'configure', args: { enabled: false } }]);
});

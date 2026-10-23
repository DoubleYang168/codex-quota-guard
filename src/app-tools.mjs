import fs from 'node:fs/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import { GuardError } from './util.mjs';
// The desktop's read-only tool bridge supplies live turn state. A separate
// app-server can report an in-flight desktop turn as interrupted in persisted history.
export class AppTools {
  constructor(threadId) { this.threadId = threadId; this.pending = new Map(); this.buffer = Buffer.alloc(0); this.nextId = 0; }
  async open() {
    let endpoint = process.env.CODEX_APP_TOOLS_PIPE_PATH;
    if (!endpoint) {
      if (process.platform !== 'win32') throw new GuardError('windows_desktop_required');
      const pipes = (await fs.readdir('\\\\.\\pipe\\')).filter(name => name.startsWith('codex-app-tools-'));
      if (pipes.length !== 1) throw new GuardError('desktop_bridge_ambiguous', 'Expected exactly one running desktop app-tools bridge');
      endpoint = '\\\\.\\pipe\\' + pipes[0];
    }
    this.socket = net.createConnection(endpoint);
    this.socket.on('data', bytes => this.receive(bytes));
    this.socket.on('error', error => this.fail(error));
    this.socket.on('close', () => this.fail(new GuardError('desktop_bridge_closed')));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.destroy(); reject(new GuardError('desktop_bridge_timeout')); }, 5000);
      this.socket.once('connect', () => { clearTimeout(timer); resolve(); });
      this.socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
    return this;
  }
  receive(bytes) {
    this.buffer = Buffer.concat([this.buffer, bytes]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > 16 * 1024 * 1024) { this.fail(new GuardError('bridge_frame_too_large')); this.socket.destroy(); return; }
      if (this.buffer.length < 4 + length) return;
      let response;
      try { response = JSON.parse(this.buffer.subarray(4, 4 + length)); } catch { this.fail(new GuardError('invalid_bridge_response')); this.socket.destroy(); return; }
      this.buffer = this.buffer.subarray(4 + length);
      const waiting = this.pending.get(response.id);
      if (!waiting) continue;
      clearTimeout(waiting.timer); this.pending.delete(response.id);
      if (response.error) waiting.reject(new GuardError('desktop_bridge_error', response.error.message)); else waiting.resolve(response.result);
    }
  }
  request(method, params) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new GuardError('desktop_bridge_timeout')); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      const frame = Buffer.alloc(4 + data.length); frame.writeUInt32LE(data.length); data.copy(frame, 4); this.socket.write(frame);
    });
  }
  async readThread() {
    const catalog = await this.request('tools/list', { threadStartKind: 'all' });
    const tool = catalog.tools.find(item => item.name === 'read_thread');
    if (!tool) throw new GuardError('live_thread_reader_unavailable');
    const response = await this.request('tools/call', { arguments: { threadId: this.threadId, turnLimit: 3, includeOutputs: false, maxOutputCharsPerItem: 2048 }, callerSource: 'codex', callId: crypto.randomUUID(), hostId: 'local', namespace: tool.namespace, threadId: this.threadId, tool: 'read_thread', turnId: 'quota-guard-read-only' });
    if (!response.success) throw new GuardError('live_thread_read_failed');
    const text = response.contentItems?.find(item => item.type === 'inputText')?.text;
    if (!text) throw new GuardError('live_thread_read_failed');
    return JSON.parse(text);
  }
  fail(error) { for (const waiting of this.pending.values()) { clearTimeout(waiting.timer); waiting.reject(error); } this.pending.clear(); }
  close() { this.socket?.destroy(); this.fail(new GuardError('desktop_bridge_closed')); }
}

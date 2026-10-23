import net from 'node:net';
import crypto from 'node:crypto';
import { GuardError } from './util.mjs';
import { desktopEndpoint, validateDesktopEndpoint } from './platform/index.mjs';
const versions = { initialize: 0, 'thread-owner-discovery': 1, 'thread-follower-interrupt-turn': 4, 'thread-follower-start-turn': 2 };
export function snapshotTurns(state, threadId) {
  if (!state || state.id !== threadId) throw new GuardError('live_thread_state_unknown');
  let turns;
  if (state.turnHistory?.kind === 'canonical') {
    const history = state.turnHistory.history;
    if (!Array.isArray(history?.islands) || !history.entitiesByKey) throw new GuardError('live_thread_state_unknown');
    turns = history.islands.flatMap(island => island.entries.map(entry => history.entitiesByKey[entry.value]));
  } else turns = state.turns;
  if (!Array.isArray(turns) || turns.some(turn => !turn || !['inProgress', 'completed', 'interrupted', 'failed'].includes(turn.status) || (turn.status === 'inProgress' && !turn.turnId))) throw new GuardError('live_thread_state_unknown');
  if (state.threadRuntimeStatus?.type === 'active' && !turns.some(turn => turn.status === 'inProgress')) throw new GuardError('live_thread_state_unknown');
  if (state.turnHistory?.kind === 'canonical' && state.turns?.some(turn => turn.status === 'inProgress' &&
      (!turn.turnId || !turns.some(known => known.turnId === turn.turnId && known.status === 'inProgress')))) throw new GuardError('live_thread_state_unknown');
  return turns.filter(turn => turn.turnId).slice(-3).map(turn => ({ id: turn.turnId, status: turn.status,
    startedAt: turn.turnStartedAtMs == null ? null : turn.turnStartedAtMs / 1000,
    items: [...(turn.items || []), { type: 'localTurnInput', input: turn.params?.input || [] }] }));
}
export class DesktopIpc {
  constructor(endpoint = desktopEndpoint()) { this.endpoint = endpoint; this.pending = new Map(); this.listeners = new Set(); this.buffer = Buffer.alloc(0); this.clientId = 'initializing-client'; }
  async open() {
    await validateDesktopEndpoint(this.endpoint);
    this.socket = net.createConnection(this.endpoint);
    this.socket.on('data', bytes => this.receive(bytes));
    this.socket.on('error', error => this.fail(new GuardError('desktop_disconnected', error.message, { uncertain: true })));
    this.socket.on('close', () => this.fail(new GuardError('desktop_disconnected', 'Desktop IPC closed', { uncertain: true })));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.destroy(); reject(new GuardError('desktop_connect_timeout')); }, 5000);
      this.socket.once('connect', () => { clearTimeout(timer); resolve(); });
      this.socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
    try {
      const hello = await this.request('initialize', { clientType: 'codex-quota-guard' });
      if (!hello.result?.clientId) throw new GuardError('desktop_initialization_failed');
      this.clientId = hello.result.clientId;
      return this;
    } catch (error) { this.close(); throw error; }
  }
  write(value) {
    const data = Buffer.from(JSON.stringify(value));
    if (data.length > 8 * 1024 * 1024) throw new GuardError('ipc_frame_too_large');
    const frame = Buffer.alloc(4 + data.length); frame.writeUInt32LE(data.length); data.copy(frame, 4); this.socket.write(frame);
  }
  receive(bytes) {
    this.buffer = Buffer.concat([this.buffer, bytes]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > 8 * 1024 * 1024) { this.fail(new GuardError('ipc_frame_too_large', 'Desktop frame exceeds limit', { uncertain: true })); this.socket.destroy(); return; }
      if (this.buffer.length < 4 + length) return;
      let message;
      try { message = JSON.parse(this.buffer.subarray(4, 4 + length)); } catch { this.fail(new GuardError('invalid_ipc_frame', '', { uncertain: true })); this.socket.destroy(); return; }
      this.buffer = this.buffer.subarray(4 + length);
      for (const listener of this.listeners) listener(message);
      if (message.type === 'client-discovery-request') this.write({ type: 'client-discovery-response', requestId: message.requestId, response: { canHandle: false } });
      const waiting = message.type === 'response' && this.pending.get(message.requestId);
      if (!waiting) continue;
      clearTimeout(waiting.timer); this.pending.delete(message.requestId);
      if (message.resultType === 'success') waiting.resolve(message);
      else waiting.reject(new GuardError('ipc_refused', message.error ?? 'Desktop refused request'));
    }
  }
  request(method, params, targetClientId, timeout = 8000) {
    if (!(method in versions)) return Promise.reject(new GuardError('method_not_allowed', method));
    if (!this.socket || this.socket.destroyed || this.closedError) return Promise.reject(this.closedError || new GuardError('ipc_closed'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new GuardError('ipc_timeout', method, { uncertain: method.includes('interrupt') || method.includes('start-turn') })); }, timeout);
      this.pending.set(requestId, { resolve, reject, timer });
      try { this.write({ type: 'request', method, requestId, sourceClientId: this.clientId, version: versions[method], params, targetClientId, timeoutMs: timeout - 500 }); }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  }
  async owner(threadId) {
    const response = await this.request('thread-owner-discovery', { hostId: 'local', conversationId: threadId });
    if (!response.handledByClientId) throw new GuardError('desktop_thread_not_loaded');
    return response.handledByClientId;
  }
  async readThread(threadId, timeout = 8000) {
    const owner = await this.owner(threadId);
    let listener, timer, onFailure;
    const following = value => this.write({ type: 'broadcast', method: 'thread-stream-following-changed', sourceClientId: this.clientId,
      targetClientIds: [owner], version: 1, params: { hostId: 'local', conversationId: threadId, following: value } });
    try {
      const state = await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new GuardError('live_snapshot_timeout')), timeout);
        listener = message => {
          if (message.type !== 'broadcast' || message.method !== 'thread-stream-state-changed' || message.sourceClientId !== owner ||
              message.params?.hostId !== 'local' || message.params?.conversationId !== threadId) return;
          if (message.version !== 11) return reject(new GuardError('live_snapshot_protocol_changed'));
          if (message.params.change?.type === 'snapshot') resolve(message.params.change.conversationState);
        };
        onFailure = reject; this.snapshotFailure = onFailure;
        this.listeners.add(listener); following(true);
      });
      return { thread: { id: threadId }, turns: snapshotTurns(state, threadId) };
    } finally {
      clearTimeout(timer); this.listeners.delete(listener);
      if (this.snapshotFailure === onFailure) this.snapshotFailure = null;
      if (this.socket && !this.socket.destroyed && !this.closedError) following(false);
    }
  }
  async stop(threadId, turnId) {
    const owner = await this.owner(threadId);
    const response = await this.request('thread-follower-interrupt-turn', { conversationId: threadId, mode: 'system', expectedTurnId: turnId }, owner, 30000);
    if (response.result?.interruptedTurnId !== turnId) throw new GuardError('turn_not_stopped', 'Desktop did not confirm the expected turn was interrupted');
    return response.result;
  }
  async start(threadId, message, clientUserMessageId, owner) {
    const response = await this.request('thread-follower-start-turn', { conversationId: threadId, turnStart: { request: { threadId, clientUserMessageId, input: [{ type: 'text', text: message, text_elements: [] }] }, context: { inheritThreadSettings: true } } }, owner || await this.owner(threadId), 30000);
    return response.result?.result ?? response.result;
  }
  fail(error) { this.closedError = error; this.snapshotFailure?.(error); for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); } this.pending.clear(); }
  close() { this.socket?.destroy(); this.fail(new GuardError('ipc_closed')); }
}

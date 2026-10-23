import crypto from 'node:crypto';
export class GuardError extends Error {
  constructor(code, message = code, options = {}) { super(message); this.code = code; Object.assign(this, options); }
}
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function requireThreadId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new GuardError('invalid_thread_id');
  return value;
}
export const errorInfo = error => ({ code: error.code ?? 'operation_failed', message: String(error.message ?? error).slice(0, 400), uncertain: !!error.uncertain });
export function goalIdentity(goal) { return goal ? hash([goal.threadId, goal.createdAt, goal.objective]) : null; }
export const goalStatus = goal => goal?.status?.replaceAll('_', '').toLowerCase() ?? null;
export function threadIdentity(thread) {
  return hash([thread.cwd, thread.model, thread.modelProvider, thread.source, thread.threadSource]);
}
export const finalTurn = turn => !!turn && ['completed', 'failed', 'interrupted'].includes(turn.status);

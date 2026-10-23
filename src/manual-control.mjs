import crypto from 'node:crypto';
import { GuardError, errorInfo, finalTurn, goalIdentity, goalStatus, requireThreadId, sleep } from './util.mjs';

const unresolved = item => ['pending', 'needs_attention'].includes(item.status);
const completedEpisodes = new Set(['resumed', 'cancelled']);

// Manual commands share the scheduler's exclusion lock but deliberately do not
// change enrollment, observe/live mode, thresholds or the monitoring switch.
export class ManualControl {
  constructor(store, backend, engine, { clock = () => Date.now(), wait = sleep } = {}) {
    this.store = store; this.backend = backend; this.engine = engine; this.clock = clock; this.wait = wait; this.running = false;
    this.store.data.manualActions ??= [];
  }
  async recover() {
    for (const item of this.store.data.manualActions) if (item.status === 'pending') {
      item.status = 'needs_attention'; item.message = '后台在手动操作期间重启，请先检查原会话；不会自动重发。'; item.updatedAt = this.clock();
    }
    await this.store.save();
  }
  async finish(item, status, message, extra = {}) {
    Object.assign(item, extra, { status, message, updatedAt: this.clock() });
    await this.store.save();
    await this.store.event(`manual_${status}`, { threadId: item.threadId, actionId: item.id, action: item.action, reason: message });
    return { ...item };
  }
  async cancelRecovery(threadId) {
    for (const episode of this.store.data.episodes) if (episode.threadId === threadId && !completedEpisodes.has(episode.status)) {
      await this.engine.change(episode, 'cancelled', 'Superseded by an explicit manual chat control');
    }
  }
  async dismiss(id) {
    const item = this.store.data.manualActions.find(action => action.id === id);
    if (!item) throw new GuardError('manual_action_not_found');
    if (item.status === 'pending') throw new GuardError('operation_in_progress', '手动操作仍在执行，请等待结果。');
    if (item.status === 'needs_attention') await this.finish(item, 'dismissed', '用户已确认检查原会话，不再阻止后续控制；没有发送任务指令。');
    return { dismissed: id };
  }
  async run({ threadId, action, requestId }) {
    requireThreadId(threadId); requireThreadId(requestId);
    if (!['start', 'stop'].includes(action)) throw new GuardError('invalid_manual_action');
    const existing = this.store.data.manualActions.find(item => item.id === requestId);
    if (existing) {
      if (existing.threadId !== threadId || existing.action !== action) throw new GuardError('request_id_conflict', '操作编号已经用于另一个请求。');
      return { ...existing, replayed: true };
    }
    if (this.running || this.engine.running) throw new GuardError('operation_in_progress', '后台正在检查或控制任务，请稍后重试。');
    if (this.store.data.manualActions.some(item => item.threadId === threadId && unresolved(item))) throw new GuardError('manual_result_unknown', '上次手动操作尚未确认。请先检查原会话，并在“暂停与恢复”中确认已检查。');
    this.running = true;
    const item = { id: requestId, clientMessageId: crypto.randomUUID(), threadId, action, status: 'pending', createdAt: this.clock(), updatedAt: this.clock(), message: '正在检查任务状态' };
    let dispatched = false;
    try {
      this.store.data.manualActions.push(item);
      // Keep unresolved records even when older than the normal history limit.
      this.store.data.manualActions = this.store.data.manualActions.filter((entry, index, all) => unresolved(entry) || index >= all.length - 100);
      await this.store.save();
      if (!(await this.backend.compatibility()).compatible) throw new GuardError('incompatible_version', '当前桌面或 CLI 版本不兼容，未发送控制指令。');
      const before = await this.backend.snapshot(threadId);
      if (action === 'start' && before.turn?.status === 'inProgress') return await this.finish(item, 'no_op', '会话已在运行，未重复启动。', { turnId: before.turn.id, turnStatus: 'inProgress' });
      if (action === 'stop' && before.turn?.status !== 'inProgress') {
        await this.cancelRecovery(threadId);
        return await this.finish(item, 'no_op', '当前没有运行中的轮次，未发送中断；旧的自动恢复已取消。', { turnStatus: before.turn?.status ?? null });
      }
      if (action === 'start' && before.turn && !finalTurn(before.turn)) throw new GuardError('thread_state_unknown', '当前轮次状态不明确，未启动。');
      if (action === 'start' && (!before.queueKnown || before.queueCount)) throw new GuardError('queued_input_present', '排队输入非空或无法读取，请先在原会话检查。');
      const watch = this.store.data.watches[threadId];
      if (watch || action === 'start') {
        const quota = await this.backend.quota();
        if (watch && (!quota.accountFingerprint || watch.accountFingerprint !== quota.accountFingerprint)) throw new GuardError('account_changed', '会话加入监控时的账户与当前不同，未发送指令。');
        if (action === 'start' && !quota.allowed) throw new GuardError('usage_not_allowed', '当前额度不允许启动，未发送续跑指令。');
      }
      const current = await this.backend.snapshot(threadId);
      if (current.identity !== before.identity || current.turn?.id !== before.turn?.id || current.turn?.status !== before.turn?.status ||
          goalIdentity(current.goal) !== goalIdentity(before.goal) || current.goal?.updatedAt !== before.goal?.updatedAt || goalStatus(current.goal) !== goalStatus(before.goal)) {
        throw new GuardError('thread_changed', '任务在操作前发生变化，请刷新后重试。');
      }
      if (action === 'start' && (!current.queueKnown || current.queueCount)) throw new GuardError('queued_input_present', '操作前发现排队输入，未启动。');
      await this.cancelRecovery(threadId);
      Object.assign(item, { turnId: before.turn?.id ?? null, goalIdentity: goalIdentity(before.goal) });
      await this.store.save();
      dispatched = true;
      if (action === 'stop') {
        await this.backend.stop(threadId, before.turn.id);
        const stopped = await this.backend.waitStopped(threadId, before.turn.id, goalStatus(before.goal) === 'active');
        return await this.finish(item, 'succeeded', '已确认当前轮次停止。手动停止不会安排自动恢复。', { turnStatus: stopped.turn?.status ?? null, goalStatus: goalStatus(stopped.goal) });
      }
      const result = await this.backend.start({ ...item, pauseReason: 'manual', goalWasActive: ['active', 'paused', 'usagelimited'].includes(goalStatus(before.goal)) });
      item.expectedNewTurnId = result?.turnId ?? result?.turn?.id ?? null;
      await this.store.save();
      for (let attempt = 0; attempt < 4; attempt++) {
        const snapshot = await this.backend.snapshot(threadId);
        const matching = (snapshot.recentTurns ?? (snapshot.turn ? [snapshot.turn] : [])).find(turn =>
          (item.expectedNewTurnId && turn.id === item.expectedNewTurnId) || JSON.stringify(turn.items ?? []).includes(`[quota-guard:${item.id}]`));
        if (matching) return await this.finish(item, 'succeeded', '已观察到本次续跑轮次；Goal 后续自动执行需继续核对。', { confirmedNewTurnId: matching.id, turnStatus: matching.status, goalStatus: goalStatus(snapshot.goal) });
        if (attempt < 3) await this.wait(300);
      }
      return await this.finish(item, 'needs_attention', '续跑请求已提交，但未确认对应轮次。请检查原会话，不会自动重发。');
    } catch (error) {
      // A delivery error after entering the mutation path is treated as
      // uncertain, even when the bridge could not describe its exact phase.
      return await this.finish(item, dispatched ? 'needs_attention' : 'failed', dispatched ? '控制结果未确认，请先检查原会话；不会自动重发。' : error.message, { error: errorInfo(error) });
    } finally { this.running = false; }
  }
}

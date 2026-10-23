import crypto from 'node:crypto';
import { goalIdentity, goalStatus, finalTurn, GuardError, errorInfo } from './util.mjs';
// Uncertain episodes remain a blocking active record until explicitly dismissed.
const terminal = new Set(['resumed', 'cancelled']);
export class Engine {
  constructor(store, backend, { clock = () => Date.now() } = {}) { this.store = store; this.backend = backend; this.clock = clock; this.running = false; }
  async recover() {
    for (const episode of this.store.data.episodes) {
      if (episode.status === 'pause_pending') { episode.status = 'needs_attention'; episode.reason = 'Restarted during a stop; inspect the desktop before acting'; }
      if (episode.status === 'resume_pending') { episode.status = 'resume_check'; episode.uncertain = true; }
    }
    await this.store.save();
  }
  async watch(threadId) {
    if (this.store.data.watches[threadId]) return { threadId, watched: true, alreadyWatched: true };
    const snapshot = await this.backend.snapshot(threadId);
    if (snapshot.thread.source && !['vscode', 'cli', 'app', 'exec'].includes(snapshot.thread.source) && typeof snapshot.thread.source !== 'string') throw new GuardError('unsupported_thread_source');
    const quota = await this.backend.quota();
    if (!quota.accountFingerprint) throw new GuardError('account_identity_unknown');
    this.store.data.watches[threadId] = { threadId, title: snapshot.thread.name || snapshot.thread.preview?.slice(0, 100) || '', cwd: snapshot.thread.cwd ?? '', identity: snapshot.identity, accountFingerprint: quota.accountFingerprint, addedAt: this.clock(), enabled: true };
    await this.store.save(); await this.store.event('watch_added', { threadId });
    return { threadId, watched: true, goal: goalStatus(snapshot.goal), mode: this.store.data.config.observeOnly ? 'observe' : 'live' };
  }
  async unwatch(threadId) {
    delete this.store.data.watches[threadId];
    for (const episode of this.store.data.episodes) if (episode.threadId === threadId && !terminal.has(episode.status)) { episode.status = 'cancelled'; episode.reason = 'Removed from management'; }
    await this.store.save(); await this.store.event('watch_removed', { threadId }); return { threadId, watched: false };
  }
  async change(episode, status, reason) {
    episode.status = status; episode.reason = reason; episode.updatedAt = this.clock();
    await this.store.save(); await this.store.event(status, { threadId: episode.threadId, episodeId: episode.id, reason });
  }
  async tick({ explicit = false } = {}) {
    if (this.running) return { skipped: 'tick_already_running' };
    this.running = true;
    try {
      const data = this.store.data, config = data.config;
      let pausedCount = 0, wouldPauseCount = 0, resumeRequestedCount = 0;
      const quota = await this.backend.quota(); data.lastQuota = quota; data.lastTick = this.clock(); data.lastError = null;
      await this.store.save();
      if (!config.enabled) return { skipped: 'disabled', quota };
      if (this.clock() - quota.readAt > 30000) throw new GuardError('stale_quota');
      const compatibility = await this.backend.compatibility(); data.compatibility = compatibility;
      const mutationsAllowed = !config.observeOnly && compatibility.compatible;
      for (const watch of Object.values(data.watches)) {
        if (!watch.enabled) continue;
        if (data.manualActions?.some(item => item.threadId === watch.threadId && ['pending', 'needs_attention'].includes(item.status))) { watch.lastReason = 'Manual control result needs inspection; automatic control is held'; continue; }
        try {
          if (!quota.accountFingerprint || watch.accountFingerprint !== quota.accountFingerprint) { watch.lastReason = 'Account changed or identity unavailable'; continue; }
          const snapshot = await this.backend.snapshot(watch.threadId);
          watch.lastObservedAt = this.clock(); watch.lastTurn = snapshot.turn ? { id: snapshot.turn.id, status: snapshot.turn.status } : null;
          watch.lastReason = null;
          let episode = data.episodes.find(item => item.threadId === watch.threadId && !terminal.has(item.status));
          if (episode) {
            if (['resume_check', 'goal_check'].includes(episode.status)) { await this.verifyResume(episode, snapshot); watch.lastReason = episode.reason; continue; }
            if (episode.status === 'waiting_reset') {
              const changed = this.resumePrecondition(episode, snapshot);
              if (changed) {
                watch.skipWindow = episode.resetsAt; await this.change(episode, 'cancelled', changed);
                if (!explicit) { watch.lastReason = '检测到新的轮次或任务变更，已取消旧恢复；本额度周期内不再自动中断。点击“立即检查”可重新判断当前任务。'; continue; }
                episode = null;
              } else if (mutationsAllowed && quota.allowed && quota.remaining >= config.resumeRemainingPercent && (quota.weeklyRemaining === null || quota.weeklyRemaining > 0)) {
                // One start per tick, with a fresh quota check for the next chat on the next tick.
                await this.resume(episode, snapshot); if (episode.status === 'resume_check') resumeRequestedCount++;
                watch.lastReason = episode.reason; break;
              }
            }
            if (episode) { watch.lastReason = episode.reason; continue; }
          }
          if (snapshot.identity !== watch.identity) { watch.lastReason = 'Model, work directory, provider, or source changed; remove and add this chat again to accept its new settings'; continue; }
          if (watch.skipWindow === quota.resetsAt && !explicit) { watch.lastReason = '本额度周期内已检测到新任务，自动检查暂不重复中断。点击“立即检查”可重新判断当前轮次。'; continue; }
          if (quota.remaining > config.pauseRemainingPercent) { watch.lastReason = `剩余额度 ${quota.remaining}% 高于暂停阈值 ${config.pauseRemainingPercent}%，无需停止。`; continue; }
          if (snapshot.turn?.status !== 'inProgress') { watch.lastReason = '当前没有运行中的轮次，无需停止。'; continue; }
          if (snapshot.goal && goalStatus(snapshot.goal) !== 'active') { watch.lastReason = 'Existing Goal is not active'; continue; }
          if (!mutationsAllowed) {
            if (config.observeOnly) wouldPauseCount++;
            watch.lastReason = config.observeOnly ? 'Would stop this running turn at the quota threshold' : 'Version is incompatible; no stop sent';
            const key = `${snapshot.turn.id}:${quota.resetsAt}`;
            if (watch.lastSuggestion !== key) { watch.lastSuggestion = key; await this.store.event('would_pause', { threadId: watch.threadId, turnId: snapshot.turn.id, remaining: quota.remaining }); }
            continue;
          }
          await this.pause(watch, snapshot, quota);
          const latest = data.episodes.at(-1);
          if (latest?.threadId === watch.threadId && latest.status === 'waiting_reset') {
            pausedCount++; watch.lastReason = '已因额度不足停止当前轮次，等待额度恢复。';
          } else if (latest?.threadId === watch.threadId) watch.lastReason = latest.reason;
        } catch (error) { watch.lastReason = errorInfo(error); await this.store.event('thread_check_failed', { threadId: watch.threadId, error: errorInfo(error) }); }
      }
      data.episodes = data.episodes.filter((item, index, items) => !terminal.has(item.status) || index >= items.length - 100);
      await this.store.save();
      return { quota, managed: Object.keys(data.watches).length, mode: config.observeOnly ? 'observe' : 'live', compatibility, explicit, pausedCount, wouldPauseCount, resumeRequestedCount };
    } catch (error) { this.store.data.lastError = errorInfo(error); await this.store.save(); return { error: errorInfo(error) }; }
    finally { this.running = false; }
  }
  async pause(watch, before, quota) {
    const episode = { id: crypto.randomUUID(), clientMessageId: crypto.randomUUID(), threadId: watch.threadId, turnId: before.turn.id, identity: before.identity,
      goalIdentity: goalIdentity(before.goal), goalWasActive: goalStatus(before.goal) === 'active', accountFingerprint: quota.accountFingerprint, pauseReason: 'quota',
      remainingAtPause: quota.remaining, resetsAt: quota.resetsAt, createdAt: this.clock(), status: 'pause_pending' };
    this.store.data.episodes.push(episode); await this.store.save();
    try {
      // Re-read immediately before mutation; the desktop also checks expectedTurnId.
      const current = await this.backend.snapshot(watch.threadId);
      if (!this.store.data.config.enabled || this.store.data.config.observeOnly || !this.store.data.watches[watch.threadId]) { await this.change(episode, 'cancelled', 'Management was disabled before stop'); return; }
      if (current.turn?.id !== episode.turnId || current.turn?.status !== 'inProgress' || current.identity !== episode.identity || goalIdentity(current.goal) !== episode.goalIdentity) { await this.change(episode, 'cancelled', 'Task changed before stop'); return; }
      const fresh = await this.backend.quota();
      if (!this.store.data.config.enabled || this.store.data.config.observeOnly || !this.store.data.watches[watch.threadId] || episode.status !== 'pause_pending') { await this.change(episode, 'cancelled', 'Management was disabled before stop'); return; }
      if (this.clock() - fresh.readAt > 30000 || fresh.accountFingerprint !== episode.accountFingerprint || fresh.remaining > this.store.data.config.pauseRemainingPercent) { await this.change(episode, 'cancelled', 'Fresh quota no longer requires a stop'); return; }
      await this.backend.stop(watch.threadId, episode.turnId);
      const stopped = await this.backend.waitStopped(watch.threadId, episode.turnId, episode.goalWasActive);
      if (terminal.has(episode.status)) return;
      watch.lastTurn = stopped.turn ? { id: stopped.turn.id, status: stopped.turn.status } : null;
      watch.lastObservedAt = this.clock();
      episode.goalPausedUpdatedAt = stopped.goal?.updatedAt ?? null;
      episode.goalPausedStatus = goalStatus(stopped.goal);
      await this.change(episode, 'waiting_reset', 'Expected turn stopped and Goal state confirmed');
    } catch (error) { if (!terminal.has(episode.status)) await this.change(episode, 'needs_attention', `Stop was not confirmed: ${error.code ?? 'operation_failed'}`); }
  }
  resumePrecondition(episode, snapshot) {
    if (snapshot.identity !== episode.identity) return 'Task settings changed after pause';
    if (snapshot.turn?.id !== episode.turnId || !finalTurn(snapshot.turn)) return 'New work or user activity superseded the stopped turn';
    if (goalIdentity(snapshot.goal) !== episode.goalIdentity) return 'Goal was replaced or cleared';
    if (episode.goalWasActive && (!['paused', 'usagelimited'].includes(goalStatus(snapshot.goal)) || snapshot.goal.updatedAt !== episode.goalPausedUpdatedAt)) return 'Goal state changed after plugin pause';
    return null;
  }
  async resume(episode, snapshot) {
    if (!snapshot.queueKnown) { episode.reason = 'Queued-input state is unavailable; waiting'; return; }
    if (snapshot.queueCount) { episode.reason = 'User has queued input; automatic resume is held'; return; }
    episode.resumeRequestedAt = this.clock(); await this.change(episode, 'resume_pending', 'Preparing one continuation');
    try {
      const current = await this.backend.snapshot(episode.threadId);
      const changed = this.resumePrecondition(episode, current);
      if (changed || !current.queueKnown || current.queueCount) { await this.change(episode, 'cancelled', changed || 'Queued input changed before resume'); return; }
      const fresh = await this.backend.quota();
      if (!this.store.data.config.enabled || this.store.data.config.observeOnly || !this.store.data.watches[episode.threadId] || episode.status !== 'resume_pending') { await this.change(episode, 'cancelled', 'Management was disabled before resume'); return; }
      if (this.clock() - fresh.readAt > 30000 || fresh.accountFingerprint !== episode.accountFingerprint || !fresh.allowed || fresh.remaining < this.store.data.config.resumeRemainingPercent || fresh.weeklyRemaining === 0) { await this.change(episode, 'waiting_reset', 'Fresh quota check does not permit recovery'); return; }
      const result = await this.backend.start(episode);
      if (terminal.has(episode.status)) return;
      episode.expectedNewTurnId = result?.turnId ?? result?.turn?.id ?? null;
      await this.change(episode, 'resume_check', 'Continuation accepted; waiting for execution evidence');
    } catch (error) {
      if (terminal.has(episode.status)) return;
      if (['desktop_thread_not_loaded', 'ipc_refused', 'desktop_connect_timeout'].includes(error.code) && !error.uncertain) await this.change(episode, 'waiting_reset', 'Desktop does not currently hold the task; open it once');
      else await this.change(episode, 'needs_attention', `Resume result needs inspection; no automatic replay: ${error.code ?? 'operation_failed'}`);
    }
  }
  async verifyResume(episode, snapshot) {
    const candidates = snapshot.recentTurns ?? (snapshot.turn ? [snapshot.turn] : []);
    const sent = candidates.find(turn => turn.id === episode.expectedNewTurnId || JSON.stringify(turn.items ?? []).includes(`[quota-guard:${episode.id}]`));
    if (sent) episode.confirmedNewTurnId = sent.id;
    if (!episode.confirmedNewTurnId) {
      if (episode.uncertain || this.clock() - episode.resumeRequestedAt > 120000) await this.change(episode, 'needs_attention', 'No matching continuation execution was proven; do not send again automatically');
      return;
    }
    if (!episode.goalWasActive) { await this.change(episode, 'resumed', 'Matching continuation turn observed'); return; }
    if (goalIdentity(snapshot.goal) !== episode.goalIdentity) { await this.change(episode, 'needs_attention', 'Goal changed during resume verification'); return; }
    if (goalStatus(snapshot.goal) === 'complete') { await this.change(episode, 'resumed', 'Original Goal completed after continuation'); return; }
    if (goalStatus(snapshot.goal) !== 'active') { await this.change(episode, 'needs_attention', 'Continuation started but original Goal is not active'); return; }
    if (snapshot.turn && snapshot.turn.id !== episode.confirmedNewTurnId && snapshot.turn.id !== episode.turnId) { await this.change(episode, 'resumed', 'A subsequent turn observed with original Goal active'); return; }
    if (this.clock() - episode.resumeRequestedAt > 600000) { await this.change(episode, 'needs_attention', 'One continuation ran, but subsequent Goal execution was not proven'); return; }
    await this.change(episode, 'goal_check', 'Continuation observed; waiting to verify subsequent Goal execution');
  }
}

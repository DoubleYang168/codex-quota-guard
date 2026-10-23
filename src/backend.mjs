import { AppServer, desktopVersion } from './app-server.mjs';
import { DesktopIpc } from './desktop-ipc.mjs';
import { AppTools } from './app-tools.mjs';
import { hash, GuardError, goalIdentity, threadIdentity, sleep } from './util.mjs';
const reviewedPairs = new Map([
  ['codex-cli 0.163.0-alpha.10.2', '26.1013.4894.0'],
  ['codex-cli 0.163.0-alpha.11.2', '26.1016.8622.0']
]);
export function compatibleVersions(cli, desktop, config, platform = process.platform) {
  // Existing installations retain their original baseline. Only these reviewed
  // default pairs gain compatibility; explicit custom version pins stay exact.
  const reviewedBaseline = reviewedPairs.get(config.compatibleCli) === config.compatibleDesktop;
  return platform === 'win32' && (reviewedBaseline
    ? reviewedPairs.has(cli) && (!desktop || reviewedPairs.get(cli) === desktop)
    : cli === config.compatibleCli && (!desktop || desktop === config.compatibleDesktop));
}
export class Backend {
  constructor(config, { rpc, ipcFactory = () => new DesktopIpc() } = {}) { this.config = config; this.rpc = rpc; this.ipcFactory = ipcFactory; }
  async open() { this.rpc ||= await new AppServer(this.config.codexPath).start(); return this; }
  async close() { await this.rpc?.close(); }
  async listThreads({ cursor = null, search = '' } = {}) {
    const result = await this.rpc.request('thread/list', { cursor, limit: 50, sortKey: 'updated_at', sortDirection: 'desc', modelProviders: [], sourceKinds: ['cli', 'vscode', 'appServer', 'exec', 'unknown'], archived: false, useStateDbOnly: true, ...(search ? { searchTerm: search } : {}) }, 30000);
    return { threads: result.data.map(thread => ({ threadId: thread.id, title: thread.name || thread.preview?.slice(0, 100) || '未命名会话', cwd: thread.cwd ?? '', updatedAt: thread.updatedAt, source: thread.source })), nextCursor: result.nextCursor ?? null };
  }
  async compatibility() {
    const [cli, desktop] = await Promise.all([this.rpc.version(), desktopVersion()]);
    return { cli, desktop, compatible: compatibleVersions(cli, desktop, this.config), desktopVersionVerified: !!desktop, warning: desktop ? null : 'Desktop package version could not be read; CLI version and exact IPC protocol/turn identity are checked.' };
  }
  async quota() {
    const [limits, account] = await Promise.all([this.rpc.request('account/rateLimits/read', {}), this.rpc.request('account/read', {})]);
    const bucket = limits.rateLimitsByLimitId?.codex ?? limits.rateLimits;
    if (!bucket) throw new GuardError('quota_unavailable');
    const windows = [bucket.primary, bucket.secondary].filter(Boolean);
    const fiveHour = windows.find(window => window.windowDurationMins === 300);
    const weekly = windows.find(window => window.windowDurationMins === 10080);
    const valid = window => !!window && Number.isFinite(window.usedPercent) && window.usedPercent >= 0 && window.usedPercent <= 100;
    if (!valid(fiveHour)) throw new GuardError('five_hour_quota_unknown');
    const identity = account.account?.id ?? account.account?.email;
    return { readAt: Date.now(), remaining: Math.max(0, 100 - fiveHour.usedPercent), weeklyRemaining: valid(weekly) ? Math.max(0, 100 - weekly.usedPercent) : null,
      resetsAt: fiveHour.resetsAt, accountFingerprint: identity ? hash(identity) : null,
      allowed: limits.ordinaryUsageAllowed !== false && !bucket.spendControlReached && !bucket.rateLimitReachedType && windows.every(window => !valid(window) || window.usedPercent < 100), bucket: bucket.limitId ?? 'codex' };
  }
  async snapshot(threadId) {
    const [read, turns, goal] = await Promise.all([
      this.rpc.request('thread/read', { threadId, includeTurns: false }),
      this.rpc.request('thread/turns/list', { threadId, limit: 3, sortDirection: 'desc', itemsView: 'full' }),
      this.rpc.request('thread/goal/get', { threadId })
    ]);
    let queueKnown = false, queueCount = null;
    try { const queued = await this.rpc.request('thread/queue/list', { threadId, limit: 1 }); queueKnown = true; queueCount = queued.data?.length ?? 0; } catch {}
    const bridge = await new AppTools(threadId).open();
    let live;
    try { live = await bridge.readThread(); } finally { bridge.close(); }
    // Never decide a live stop from the separate server's persisted turn status.
    if (!live.thread || !Array.isArray(live.turns)) throw new GuardError('live_thread_state_unknown');
    const data = [...live.turns].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return { threadId, thread: read.thread, identity: threadIdentity(read.thread), goal: goal.goal ?? null, goalIdentity: goalIdentity(goal.goal), turn: data[0] ?? null,
      recentTurns: data, queueKnown, queueCount };
  }
  async ownerAvailable(threadId) { const ipc = await this.ipcFactory().open(); try { await ipc.owner(threadId); return true; } finally { ipc.close(); } }
  async stop(threadId, turnId) {
    const ipc = await this.ipcFactory().open();
    try {
      await ipc.owner(threadId);
      const before = await this.snapshot(threadId);
      if (before.turn?.id !== turnId || before.turn.status !== 'inProgress') throw new GuardError('thread_changed_before_stop');
      // The desktop's exact-turn interrupt path returns before its internal
      // Goal-pause branch. Pause explicitly rather than assuming it happened.
      if (before.goal?.status === 'active') {
        const result = await this.rpc.request('thread/goal/set', { threadId, status: 'paused' });
        if (goalIdentity(result.goal) !== goalIdentity(before.goal) || result.goal?.status !== 'paused') throw new GuardError('goal_pause_not_confirmed');
        const current = await this.snapshot(threadId);
        if (current.turn?.id !== turnId || current.turn.status !== 'inProgress' || goalIdentity(current.goal) !== goalIdentity(before.goal) || current.goal?.status !== 'paused') throw new GuardError('thread_changed_during_goal_pause');
      }
      return await ipc.stop(threadId, turnId);
    } finally { ipc.close(); }
  }
  async start(episode) {
    const ipc = await this.ipcFactory().open();
    let goalWritten = false;
    try {
      const owner = await ipc.owner(episode.threadId); // No goal write before proving that the desktop holds it.
      if (episode.goalWasActive) { await this.rpc.request('thread/goal/set', { threadId: episode.threadId, status: 'active', origin: 'automatic' }); goalWritten = true; }
      const text = episode.pauseReason === 'manual' ? '继续当前会话中尚未完成的任务；如已完成，请说明完成情况。' : '继续原任务，从暂停处接着完成原有目标。';
      return await ipc.start(episode.threadId, `${text}\n\n[quota-guard:${episode.id}]`, episode.clientMessageId, owner);
    } catch (error) { if (goalWritten) error.uncertain = true; throw error;
    } finally { ipc.close(); }
  }
  async waitStopped(threadId, turnId, expectedGoal) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const snapshot = await this.snapshot(threadId);
      if (snapshot.turn?.id !== turnId) throw new GuardError('thread_changed_during_stop');
      const ended = ['interrupted', 'completed', 'failed'].includes(snapshot.turn?.status);
      const goalPaused = !expectedGoal || ['paused', 'usageLimited'].includes(snapshot.goal?.status);
      if (ended && goalPaused) return snapshot;
      await sleep(500);
    }
    throw new GuardError('pause_confirmation_timeout', 'Expected turn/Goal did not reach a confirmed stopped state', { uncertain: true });
  }
}

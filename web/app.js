const $ = id => document.getElementById(id);
const fragment = location.hash.slice(1);
let token = /^[a-f0-9]{64}$/.test(fragment) ? fragment : null;
try {
  if (token) { sessionStorage.setItem('quota-guard-token', token); history.replaceState(null, '', location.pathname); }
  else token = sessionStorage.getItem('quota-guard-token');
} catch { /* A fragment token still works when browser storage is unavailable. */ }
let state = null, threads = new Map(), nextCursor = null, dirty = false, monitorDirty = false, busy = false, searchGeneration = 0;
let noticeTimer;
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function date(value) { if (!value) return '尚无记录'; const d = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value); return Number.isNaN(+d) ? '未知时间' : d.toLocaleString('zh-CN', { hour12: false }); }
function message(error) { return error?.message || error?.code || String(error); }
function showError(error) { $('operation-error').textContent = message(error); $('operation-error').hidden = false; }
function notice(text, duration = 6500) { clearTimeout(noticeTimer); $('notice').textContent = text; $('notice').hidden = false; noticeTimer = setTimeout(() => { $('notice').hidden = true; }, duration); }
async function api(action, args = {}) {
  const response = await fetch(`/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Quota-Guard-Token': token || '' }, body: JSON.stringify(args), signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  if (!response.ok || data.error) { if (response.status === 401) $('auth-error').hidden = false; throw new Error(message(data.error || { message: `请求失败 (${response.status})` })); }
  return data.result;
}
function setBusy(value) { busy = value; document.querySelectorAll('[data-action],.thread-check,.dismiss').forEach(node => { node.disabled = value || !token || node.dataset.inFlight === 'true'; }); }
async function act(operation, success) {
  if (busy) return;
  setBusy(true); $('operation-error').hidden = true;
  try { await operation(); await refresh(); if (success) notice(success); }
  catch (error) { try { await refresh(); } catch {} showError(error); if (state) render(); }
  finally { setBusy(false); }
}
function percentage(id, bar, value) { $(id).textContent = Number.isFinite(value) ? Number(value.toFixed(1)) : '—'; $(bar).style.width = `${Number.isFinite(value) ? value : 0}%`; }
function render() {
  if (!state) return;
  const config = state.config, managed = state.managed;
  $('connection').textContent = '本地后台在线'; $('connection-dot').className = 'dot online'; $('offline').hidden = true; $('version').textContent = `v${state.version || '0.2.0'}`;
  percentage('remaining', 'quota-bar', state.quota?.remaining); percentage('weekly', 'weekly-bar', state.quota?.weeklyRemaining);
  $('quota-bar').parentNode.classList.toggle('low', Number.isFinite(state.quota?.remaining) && state.quota.remaining <= config.pauseRemainingPercent);
  $('reset').textContent = state.quota ? `重置时间 ${date(state.quota.resetsAt)} · 更新于 ${date(state.quota.readAt)}` : '等待额度数据';
  $('managed-count').textContent = managed.length;
  $('mode-description').textContent = !config.enabled ? '监控已停用，当前任务继续工作' : config.observeOnly ? '观察模式 · 不自动暂停或继续' : '自动控制 · 只管理已选会话';
  $('last-check').textContent = `最近监控检查：${date(state.lastTick)}`;
  if (!monitorDirty) { $('enabled').checked = config.enabled; $('mode-observe').checked = config.observeOnly; $('mode-live').checked = !config.observeOnly; }
  $('monitor-state').textContent = !config.enabled ? '已停用' : config.observeOnly ? '观察中' : '自动控制';
  $('monitor-state').className = `badge ${!config.enabled ? 'off' : config.observeOnly ? '' : 'live'}`;
  $('rule-summary').textContent = `剩余 ≤ ${config.pauseRemainingPercent}% 时暂停，达到 ${config.resumeRemainingPercent}% 时恢复，每 ${config.pollIntervalSeconds} 秒检查一次。`;
  if (!dirty) { $('pause').value = config.pauseRemainingPercent; $('resume').value = config.resumeRemainingPercent; $('interval').value = config.pollIntervalSeconds; }
  $('session-badge').textContent = managed.length;
  $('recovery-badge').textContent = state.episodes.filter(item => !['resumed', 'cancelled'].includes(item.status)).length + (state.manualActions || []).filter(item => ['pending', 'needs_attention'].includes(item.status)).length;
  $('backend-error').hidden = !state.lastError;
  if (state.lastError) $('backend-error').textContent = `最近一次后台读取失败，显示的是上次保存的数据：${message(state.lastError)}`;
  const compatibility = state.compatibility;
  $('compatibility-note').hidden = !compatibility || (compatibility.compatible && compatibility.platform !== 'darwin');
  if (compatibility) $('compatibility-note').textContent = !compatibility.compatible ? '当前平台或版本未通过兼容检查，自动和手动聊天控制均不可用。' : 'macOS 实验支持：完整 Goal 自动恢复尚未验收。首次使用默认观察模式，请先在测试聊天验证。';
  renderThreads(); renderRecoveries(); renderEvents();
}
async function refresh(action = 'status') {
  try { state = await api(action); render(); }
  catch (error) { $('connection').textContent = '后台暂不可用'; $('connection-dot').className = 'dot offline'; $('offline').hidden = false; throw error; }
}
function renderThreads() {
  if (!state) return;
  const watches = new Map(state.managed.map(item => [item.threadId, item]));
  const combined = new Map(threads);
  for (const watch of watches.values()) if (!combined.has(watch.threadId)) combined.set(watch.threadId, { ...watch, title: watch.title || watch.threadId });
  const query = $('search').value.trim().toLocaleLowerCase();
  const entries = [...combined.values()].filter(item => (!$('managed-only').checked || watches.has(item.threadId)) && (!query || `${item.title} ${item.threadId}`.toLocaleLowerCase().includes(query)));
  entries.sort((a, b) => Number(watches.has(b.threadId)) - Number(watches.has(a.threadId)) || (b.updatedAt || 0) - (a.updatedAt || 0));
  const list = $('thread-list'); list.replaceChildren();
  for (const item of entries) {
    const watch = watches.get(item.threadId), row = element('div', 'thread-row');
    const checkbox = element('input', 'thread-check'); checkbox.type = 'checkbox'; checkbox.checked = !!watch; checkbox.disabled = busy || !token; checkbox.id = `thread-${item.threadId}`; checkbox.dataset.threadId = item.threadId;
    const info = element('div', 'thread-info'), label = element('label', 'thread-title', item.title || item.threadId); label.htmlFor = checkbox.id; label.title = item.title || item.threadId; info.append(label);
    const detail = element('div', 'thread-detail'); detail.append(element('code', '', item.threadId), document.createTextNode(item.cwd ? ` · ${item.cwd}` : '')); detail.title = item.cwd || item.threadId; info.append(detail);
    if (watch?.lastReason) info.append(element('p', 'thread-reason', typeof watch.lastReason === 'string' ? watch.lastReason : message(watch.lastReason)));
    const side = element('div', 'thread-state'); side.append(element('span', `badge ${watch ? '' : 'off'}`, watch ? '已加入' : '未加入'));
    if (watch?.lastObservedAt) { const names = { inProgress: '运行中', completed: '已完成', interrupted: '已中断', failed: '失败' }; side.append(element('small', '', `上次观察：${names[watch.lastTurn?.status] || '未知'} · ${date(watch.lastObservedAt)}`)); }
    const manual = (state.manualActions || []).filter(action => action.threadId === item.threadId).at(-1);
    const blocked = (state.manualActions || []).some(action => action.threadId === item.threadId && ['pending', 'needs_attention'].includes(action.status));
    const actions = element('div', 'thread-actions');
    for (const [action, text, style] of [['start', '启动／继续', 'secondary'], ['stop', '停止', 'danger'], [watch ? 'unwatch' : 'watch', watch ? '移出自动监控' : '加入自动监控', 'secondary']]) {
      const button = element('button', `button ${style} thread-action`, text); button.type = 'button'; button.dataset.action = action; button.dataset.threadId = item.threadId;
      button.dataset.inFlight = String(blocked && ['start', 'stop'].includes(action)); button.disabled = busy || !token || button.dataset.inFlight === 'true';
      button.title = `${text}：${item.title || item.threadId}`; button.setAttribute('aria-label', button.title); actions.append(button);
    }
    if (manual) info.append(element('p', `thread-reason${manual.status === 'succeeded' || manual.status === 'no_op' ? ' manual-success' : ''}`, `手动${manual.action === 'start' ? '启动' : '停止'} · ${manual.message} · ${date(manual.updatedAt)}`));
    side.append(actions); row.append(checkbox, info, side); list.append(row);
  }
  if (!entries.length) list.append(element('div', 'empty', query ? '没有匹配的会话。可刷新列表或粘贴完整会话 ID 添加。' : $('managed-only').checked ? '还没有加入任何会话，取消筛选后勾选需要管理的会话。' : '暂无可列出的本地会话，可通过完整会话 ID 添加。'));
  $('list-count').textContent = `已载入 ${threads.size} 个会话 · 显示 ${entries.length} 个 · 已加入 ${watches.size} 个`;
  $('load-more').hidden = !nextCursor;
}
async function loadThreads(append = false) {
  const generation = ++searchGeneration;
  const result = await api('threads', { cursor: append ? nextCursor : null, search: $('search').value.trim() });
  if (generation !== searchGeneration) return;
  if (!append) threads = new Map();
  for (const item of result.threads) threads.set(item.threadId, item);
  nextCursor = result.nextCursor; renderThreads();
}
const episodeNames = { pause_pending: '正在确认暂停', waiting_reset: '等待额度恢复', resume_pending: '准备继续', resume_check: '核对续跑结果', goal_check: '核对 Goal 后续执行', needs_attention: '需要人工检查', resumed: '已恢复', cancelled: '已取消' };
function renderRecoveries() {
  const list = $('recovery-list'); list.replaceChildren();
  const manualActions = (state.manualActions || []).filter(item => ['pending', 'needs_attention'].includes(item.status));
  for (const item of [...manualActions].reverse()) {
    const row = element('div', 'recovery-row'), info = element('div'), side = element('div', 'record-right');
    info.append(element('div', 'record-title', `手动${item.action === 'start' ? '启动' : '停止'} · ${threads.get(item.threadId)?.title || item.threadId}`), element('p', 'record-meta', `${date(item.updatedAt)} · ${item.message}`));
    side.append(element('span', 'badge live', item.status === 'pending' ? '正在执行' : '需要人工检查'));
    const button = element('button', 'button secondary dismiss', item.status === 'pending' ? '正在处理' : '已检查原会话，解除阻止');
    button.dataset.episodeId = item.id; button.dataset.inFlight = String(item.status === 'pending'); button.disabled = busy || item.status === 'pending'; side.append(button);
    row.append(info, side); list.append(row);
  }
  for (const item of [...state.episodes].reverse()) {
    const row = element('div', 'recovery-row'), info = element('div');
    const watch = state.managed.find(w => w.threadId === item.threadId);
    info.append(element('div', 'record-title', watch?.title || threads.get(item.threadId)?.title || item.threadId), element('p', 'record-meta', `${date(item.updatedAt || item.createdAt)} · ${item.reason || ''}`));
    const side = element('div', 'record-right'); side.append(element('span', `badge ${item.status === 'needs_attention' ? 'live' : ''}`, episodeNames[item.status] || item.status));
    if (!['resumed', 'cancelled'].includes(item.status)) { const inFlight = ['pause_pending', 'resume_pending'].includes(item.status); const button = element('button', 'button danger dismiss', inFlight ? '正在处理' : '取消该恢复'); button.dataset.episodeId = item.id; button.dataset.inFlight = String(inFlight); button.disabled = busy || inFlight; side.append(button); }
    row.append(info, side); list.append(row);
  }
  if (!state.episodes.length && !manualActions.length) list.append(element('div', 'empty', '暂无自动暂停恢复或需要检查的手动操作。'));
}
const eventNames = { watch_added: '会话已加入管理', watch_removed: '会话已移出管理', configuration_changed: '监控设置已更新', would_pause: '观察：达到暂停条件', thread_check_failed: '会话检查失败', manual_succeeded: '手动控制已确认', manual_no_op: '手动控制无需执行', manual_failed: '手动控制未执行', manual_needs_attention: '手动控制结果需检查', manual_dismissed: '已解除手动控制阻止', ...episodeNames };
function renderEvents() {
  const list = $('event-list'); list.replaceChildren();
  for (const item of [...state.events].reverse()) {
    const row = element('div', 'event-row'), info = element('div'); info.append(element('div', 'record-title', eventNames[item.type] || item.type));
    info.append(element('p', 'record-meta', [item.threadId, item.reason, item.error && message(item.error)].filter(Boolean).join(' · ') || (item.type === 'configuration_changed' ? `监控${item.enabled ? '启用' : '停用'} · ${item.observeOnly ? '观察模式' : '自动控制'}` : '')));
    row.append(info, element('span', 'small muted', date(item.at))); list.append(row);
  }
  if (!state.events.length) list.append(element('div', 'empty', '暂无运行记录。'));
}
function draftHint(id) { $(id).textContent = '有未保存的修改'; $(id).classList.remove('saved', 'save-error'); }
async function saveConfiguration(patch, buttonId, hintId, success, clearDraft) {
  if (busy || !state) return;
  const button = $(buttonId), label = button.textContent, hint = $(hintId);
  clearTimeout(noticeTimer); $('notice').hidden = true;
  await act(async () => {
    button.textContent = '正在保存…'; hint.textContent = '正在保存…'; hint.classList.remove('saved', 'save-error');
    try {
      const config = await api('configure', patch);
      if (Object.entries(patch).some(([key, value]) => config[key] !== value)) throw new Error('后台未确认保存结果，请刷新后检查。');
      state.config = config; clearDraft();
      hint.textContent = `✓ ${success}`; hint.classList.add('saved'); notice(success, 3000);
    } catch (error) {
      hint.textContent = '保存未确认，请重试或检查后台状态'; hint.classList.add('save-error'); throw error;
    } finally { button.textContent = label; }
  });
}
$('monitor-controls').addEventListener('change', () => { monitorDirty = true; draftHint('monitor-hint'); });
$('monitor-controls').addEventListener('submit', event => {
  event.preventDefault();
  saveConfiguration({ enabled: $('enabled').checked, observeOnly: $('mode-observe').checked }, 'save-monitor', 'monitor-hint', '监控设置已保存', () => { monitorDirty = false; });
});
$('settings').addEventListener('input', () => { dirty = true; draftHint('settings-hint'); });
$('settings').addEventListener('submit', event => {
  event.preventDefault();
  const patch = { pauseRemainingPercent: Number($('pause').value), resumeRemainingPercent: Number($('resume').value), pollIntervalSeconds: Number($('interval').value) };
  if (patch.resumeRemainingPercent <= patch.pauseRemainingPercent) { showError(new Error('恢复阈值必须高于暂停阈值。')); return; }
  saveConfiguration(patch, 'save-rules', 'settings-hint', '额度规则已保存', () => { dirty = false; });
});
$('check').addEventListener('click', () => act(async () => {
  const result = await api('check'); if (result.error) throw new Error(message(result.error));
  if (result.skipped) {
    notice(result.skipped === 'disabled' ? '监控总开关已停用，本次仅更新额度，没有控制任务。' : '后台已有检查正在执行，本次未重复执行。');
    return;
  }
  notice(`已重新检查 ${result.managed} 个监控会话：停止 ${result.pausedCount ?? 0} 个，观察拟停止 ${result.wouldPauseCount ?? 0} 个，恢复请求 ${result.resumeRequestedCount ?? 0} 个。未执行的原因见对应会话下方。`);
}));
$('reload-threads').addEventListener('click', () => act(async () => { await refresh('refresh'); await loadThreads(); }, '额度和会话列表已刷新。'));
$('load-more').addEventListener('click', () => act(() => loadThreads(true)));
$('managed-only').addEventListener('change', renderThreads);
let searchTimer;
$('search').addEventListener('input', () => { renderThreads(); clearTimeout(searchTimer); searchTimer = setTimeout(() => loadThreads().catch(showError), 400); });
$('thread-list').addEventListener('change', event => {
  const input = event.target; if (!input.matches('.thread-check')) return;
  const checked = input.checked;
  act(() => api(checked ? 'watch' : 'unwatch', { threadId: input.dataset.threadId }), checked ? '会话已加入管理。' : '会话已移出管理，尚未发送的自动恢复已取消。');
});
$('thread-list').addEventListener('click', event => {
  const button = event.target.closest('.thread-action');
  if (!button || button.disabled || busy) return;
  const threadId = button.dataset.threadId, action = button.dataset.action;
  if (['watch', 'unwatch'].includes(action)) {
    act(() => api(action, { threadId }), action === 'watch' ? '已加入自动监控，按当前总开关和观察／自动模式执行。' : '已移出自动监控，当前任务继续工作。');
    return;
  }
  const requestId = crypto.randomUUID();
  act(async () => {
    const result = await api('thread_control', { threadId, action, requestId });
    await refresh();
    if (['failed', 'needs_attention'].includes(result.status)) throw new Error(`${result.message}${result.error?.code ? ` (${result.error.code})` : ''}`);
    notice(result.message);
  });
});
$('manual-form').addEventListener('submit', event => { event.preventDefault(); const threadId = $('manual-id').value.trim(); act(async () => { await api('watch', { threadId }); $('manual-id').value = ''; }, '会话已加入管理。'); });
$('recovery-list').addEventListener('click', event => { const button = event.target.closest('.dismiss'); if (button && !button.disabled) act(() => api('dismiss', { episodeId: button.dataset.episodeId }), '已处理该记录，没有向会话发送任务指令。'); });
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(tab => { const selected = tab === button; tab.classList.toggle('active', selected); tab.setAttribute('aria-selected', String(selected)); $(`panel-${tab.dataset.tab}`).hidden = !selected; });
}));
async function initialize() {
  if (!token) { $('auth-error').hidden = false; setBusy(false); $('connection').textContent = '等待有效访问链接'; return; }
  setBusy(true);
  try { await refresh(); await Promise.allSettled([refresh('refresh'), loadThreads()]).then(results => { for (const result of results) if (result.status === 'rejected') showError(result.reason); }); }
  catch (error) { showError(error); }
  finally { setBusy(false); }
  setInterval(() => { if (!busy && !document.hidden) refresh().catch(() => {}); }, 10000);
}
initialize();

(() => {
  const $ = id => document.getElementById(id), pending = new Map();
  let sequence = 0, ready = false, busy = false, current = null, compatibilityBridge = false;
  function request(method, params, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('宿主连接超时，请刷新状态；不会自动重复发送控制指令。')); }, timeout);
      pending.set(id, { resolve, reject, timer });
      window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
    });
  }
  function notify(method, params) { window.parent.postMessage({ jsonrpc: '2.0', method, params }, '*'); }
  function feedback(text, error = false) { $('feedback').textContent = text; $('feedback').className = error ? 'error' : ''; }
  function controls() {
    $('open').disabled = !ready || busy;
    $('refresh').disabled = !ready || busy;
    $('toggle').disabled = !ready || busy || !current;
    $('exit').disabled = !ready || busy || !current?.running;
  }
  function render(value) {
    if (typeof value?.running !== 'boolean' || typeof value.enabled !== 'boolean' || typeof value.managedCount !== 'number') return;
    current = value;
    $('plugin-version').textContent = value.pluginVersion ? `v${value.pluginVersion}` : '';
    $('status').textContent = !value.running ? '后台未启动' : value.enabled ? '监控已启用' : '监控已停用';
    $('status').className = `badge ${value.running && value.enabled ? 'online' : ''}`;
    $('headline').textContent = !value.running ? '后台已退出，可以随时重新启动' : !value.enabled ? '后台在线，自动管理已停用' : value.observeOnly ? '观察模式：记录条件，不控制任务' : '自动控制：按规则管理已选会话';
    $('detail').textContent = !value.running ? '点击“启用监控”可重新启动；打开管理页不会自行启用已停用的监控。' : `当前为${value.observeOnly ? '观察' : '自动控制'}模式。模式、会话及额度规则可在管理页修改。`;
    $('managed').textContent = value.managedCount;
    $('quota').textContent = `上次剩余额度 ${Number.isFinite(value.remaining) ? `${value.remaining}%` : '—'}（缓存）`;
    $('toggle').textContent = value.running && value.enabled ? '停用监控' : '启用监控';
    controls();
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
    const message = event.data, waiting = pending.get(message.id);
    if (waiting) { pending.delete(message.id); clearTimeout(waiting.timer); message.error ? waiting.reject(new Error(message.error.message || '宿主请求失败')) : waiting.resolve(message.result); }
    else if (message.method === 'ui/notifications/tool-result') render(message.params?.structuredContent);
  });
  async function call(name, args = {}) {
    const result = compatibilityBridge ? await window.openai.callTool(name, args) : await request('tools/call', { name, arguments: args });
    if (result.isError) { const raw = result.content?.find(item => item.type === 'text')?.text; let error; try { error = JSON.parse(raw); } catch {} throw new Error(error?.message || raw || '控制请求失败'); }
    const value = result.structuredContent ?? result;
    render(value); return value;
  }
  async function refresh() { return call('service_status'); }
  async function act(operation, message) {
    if (busy || !ready) return;
    busy = true; controls(); feedback('正在处理…');
    try { await operation(); await refresh(); feedback(message); }
    catch (error) { feedback(error.message || String(error), true); }
    finally { busy = false; controls(); }
  }
  $('open').addEventListener('click', () => act(async () => {
    const page = await call('open_dashboard', { openBrowser: true });
    if (page.browserLaunchRequested === false && /^http:\/\/127\.0\.0\.1:\d+\/#([a-f0-9]{64})$/.test(page.url)) { $('fallback-url').value = page.url; $('fallback').hidden = false; }
    else $('fallback').hidden = true;
  }, '已请求打开浏览器管理页。'));
  $('toggle').addEventListener('click', () => {
    const disable = current?.running && current.enabled;
    act(() => call('service_control', { action: disable ? 'disable' : 'enable' }), disable ? '监控已停用，聊天当前任务继续运行。' : '监控已启用，沿用保存的观察／自动控制模式。');
  });
  $('exit').addEventListener('click', () => act(() => call('service_control', { action: 'shutdown' }), '后台已退出，监控设为停用；此面板保留，可以重新启动。'));
  $('refresh').addEventListener('click', () => act(refresh, '状态已刷新。'));
  async function initialize() {
    try {
      if (window.parent === window) throw new Error('请从插件入口打开此面板。');
      try { await request('ui/initialize', { appInfo: { name: 'quota-guard-controls', version: '0.4.6' }, appCapabilities: {}, protocolVersion: '2026-01-26' }, 5000); notify('ui/notifications/initialized', {}); }
      catch (error) { if (typeof window.openai?.callTool !== 'function') throw error; compatibilityBridge = true; }
      ready = true; controls(); await refresh();
      setInterval(() => { if (!busy && !document.hidden) refresh().catch(error => feedback(error.message, true)); }, 5000);
    } catch (error) { $('status').textContent = '连接未就绪'; $('headline').textContent = '此宿主尚未连接控制面板'; feedback(`${error.message} 可重新加载插件后再打开面板。`, true); }
  }
  initialize();
})();

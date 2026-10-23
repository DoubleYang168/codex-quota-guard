import { control, startMonitor } from './control.mjs';
import { Store } from './store.mjs';
import { dataDirectory } from './paths.mjs';
import { GuardError, sleep } from './util.mjs';
import { version } from './version.mjs';

function summary(state) {
  return { running: !!state.running, pluginVersion: version, serviceVersion: state.version ?? null, enabled: state.config.enabled, observeOnly: state.config.observeOnly,
    managedCount: Array.isArray(state.managed) ? state.managed.length : Object.keys(state.watches ?? {}).length,
    remaining: state.quota?.remaining ?? state.lastQuota?.remaining ?? null, quotaReadAt: state.quota?.readAt ?? state.lastQuota?.readAt ?? null };
}
export async function serviceStatus({ send = control, home = dataDirectory(), load = async () => (await new Store(home).open()).data } = {}) {
  try { return summary(await send('cached_status', {}, { home, timeout: 2500 })); }
  catch (error) {
    // A timeout is not proof that the process stopped. Never fall back to
    // starting a second process or report it as offline on an unknown result.
    if (error.code !== 'monitor_not_running') throw error;
    return summary({ ...await load(), running: false });
  }
}
export async function serviceControl(action, { send = control, start = startMonitor, home = dataDirectory(), status = () => serviceStatus({ send, home }), wait = sleep } = {}) {
  if (!['enable', 'disable', 'shutdown'].includes(action)) throw new GuardError('invalid_service_action');
  if (action === 'enable') { await start(home); await send('configure', { enabled: true }, { home }); return status(); }
  const before = await status();
  if (!before.running) return { ...before, alreadyStopped: true };
  // Persist the off switch before shutdown; passive status polling and reopening
  // the browser must not restore live control without the user's enable action.
  await send('configure', { enabled: false }, { home });
  if (action === 'disable') return status();
  await send('shutdown', {}, { home });
  for (let attempt = 0; attempt < 20; attempt++) {
    await wait(100);
    const after = await status();
    if (!after.running) return after;
  }
  throw new GuardError('shutdown_not_confirmed', '退出请求已发送，但尚未确认后台退出，请刷新状态后检查。');
}

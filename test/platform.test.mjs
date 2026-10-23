import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { macApplication, macCli, macDesktopEndpoint, macToolsEndpoint, ownedSocket } from '../src/platform/macos.mjs';
import { platformDefaults } from '../src/platform/index.mjs';
import { compatibleVersions } from '../src/backend.mjs';
import { controlEndpoint } from '../src/paths.mjs';
import { AppTools } from '../src/app-tools.mjs';
import { startMonitor, control } from '../src/control.mjs';

test('Mac pins are separate from Windows; unknown platform, desktop version and Intel cannot control chats', () => {
  const config = platformDefaults('darwin');
  assert.equal(config.observeOnly, true);
  assert.equal(platformDefaults('win32').observeOnly, false);
  const check = (cli, desktop, platform = 'darwin', arch = 'arm64') => compatibleVersions(cli, desktop, config, platform, arch);
  assert.equal(check(config.compatibleCli, config.compatibleDesktop), true);
  assert.equal(check(config.compatibleCli, null), false);
  assert.equal(check(config.compatibleCli, '26.1016.8622.0'), false);
  assert.equal(check('codex-cli future', config.compatibleDesktop), false);
  assert.equal(check(config.compatibleCli, config.compatibleDesktop, 'linux'), false);
  assert.equal(check(config.compatibleCli, config.compatibleDesktop, 'darwin', 'x64'), false);
  assert.equal(compatibleVersions(config.compatibleCli, config.compatibleDesktop, platformDefaults('win32'), 'win32'), false);
});

test('Mac paths preserve spaces and explicit app selection; CLI absence is actionable', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'quota-app-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const app = path.join(root, 'My Desktop.app'), env = { CODEX_QUOTA_GUARD_APP: app };
  const contents = path.join(app, 'Contents'), resources = path.join(contents, 'Resources');
  await fs.mkdir(resources, { recursive: true }); await fs.writeFile(path.join(contents, 'Info.plist'), 'fixture');
  assert.equal(await macApplication({ env }), app);
  await assert.rejects(macCli({ env }), error => error.code === 'mac_cli_not_found');
  const cli = path.join(resources, 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS', 'codex');
  await fs.mkdir(path.dirname(cli), { recursive: true }); await fs.writeFile(cli, '', { mode: 0o755 });
  assert.equal(await macCli({ env }), cli);
  assert.equal(macDesktopEndpoint({ CODEX_HOME: '/custom home' }, '/home/user'), path.join('/custom home', 'ipc', 'ipc.sock'));
  assert.equal(macDesktopEndpoint({ CODEX_QUOTA_GUARD_IPC_PATH: '/explicit.sock' }), '/explicit.sock');
});

async function socketFixture(t, onConnection = () => {}) {
  const directory = await fs.mkdtemp('/tmp/qg-bridge-');
  const endpoint = path.join(directory, 'bridge.sock');
  const sockets = new Set();
  const server = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); onConnection(socket); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); });
  await fs.chmod(endpoint, 0o600);
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, endpoint };
}

test('Mac discovery rejects symlinks, foreign ownership, unsafe permissions and ambiguous bridges', { skip: process.platform === 'win32' }, async t => {
  const { directory, endpoint } = await socketFixture(t);
  assert.equal(await macToolsEndpoint({ env: {}, directory }), endpoint);
  await assert.rejects(ownedSocket(endpoint, (process.getuid?.() ?? 0) + 1), error => error.code === 'unsafe_desktop_socket');
  await fs.chmod(endpoint, 0o666);
  await assert.rejects(ownedSocket(endpoint), error => error.code === 'unsafe_desktop_socket');
  await fs.chmod(endpoint, 0o600);
  const link = path.join(directory, 'alias.sock'); await fs.symlink(endpoint, link);
  await assert.rejects(ownedSocket(link), error => error.code === 'unsafe_desktop_socket');
  const other = await socketFixture(t);
  // A second actual socket in the same directory makes automatic choice unsafe.
  const secondPath = path.join(directory, 'second.sock'); await fs.rename(other.endpoint, secondPath);
  await assert.rejects(macToolsEndpoint({ env: {}, directory }), error => error.code === 'desktop_bridge_ambiguous');
  assert.equal(await macToolsEndpoint({ env: { CODEX_APP_TOOLS_PIPE_PATH: endpoint }, directory }), endpoint);
});

test('rejected app-tools peer fails promptly, including requests made after close', { skip: process.platform === 'win32', timeout: 5000 }, async t => {
  const { endpoint } = await socketFixture(t, socket => socket.destroy());
  const bridge = await new AppTools('test', { endpoint }).open();
  t.after(() => bridge.close());
  await assert.rejects(bridge.readThread(), error => error.code === 'desktop_bridge_closed');
  await assert.rejects(bridge.readThread(), error => error.code === 'desktop_bridge_closed');
});

test('deep data paths use a short private socket and survive stale sockets after an unclean exit', { skip: process.platform === 'win32', timeout: 20000 }, async t => {
  const root = await fs.mkdtemp('/tmp/qg-long-');
  const home = path.join(root, 'data with spaces '.repeat(9));
  assert.ok(Buffer.byteLength(controlEndpoint(home)) < 104);
  t.after(async () => { try { await control('shutdown', {}, { home }); } catch {} });
  const first = await startMonitor(home);
  assert.equal((await fs.stat(controlEndpoint(home))).mode & 0o777, 0o600);
  process.kill(first.pid, 'SIGKILL');
  for (let attempt = 0; attempt < 50; attempt++) {
    try { process.kill(first.pid, 0); await new Promise(resolve => setTimeout(resolve, 20)); }
    catch (error) { if (error.code === 'ESRCH') break; throw error; }
  }
  const second = await startMonitor(home);
  assert.notEqual(second.instance, first.instance);
  const state = await control('cached_status', {}, { home });
  assert.deepEqual(state.managed, []); assert.deepEqual(state.episodes, []);
});

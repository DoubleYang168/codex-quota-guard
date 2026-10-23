import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { controlEndpoint, dataDirectory, projectRoot } from './paths.mjs';
import { GuardError, sleep } from './util.mjs';
export async function tokenFor(home) {
  await fs.mkdir(home, { recursive: true });
  if (process.platform !== 'win32') {
    const directory = path.dirname(controlEndpoint(home));
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.uid !== process.getuid?.()) throw new GuardError('unsafe_control_directory');
    await fs.chmod(directory, 0o700);
  }
  const file = path.join(home, 'control-token');
  try { await fs.writeFile(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  // A competing process may see the exclusively created file before its first
  // write completes. Wait for the creator; never replace an existing token.
  for (let attempt = 0; attempt < 25; attempt++) {
    const token = (await fs.readFile(file, 'utf8')).trim();
    if (/^[a-f0-9]{64}$/.test(token)) return token;
    await sleep(20);
  }
  throw new GuardError('invalid_control_token', 'Local control token is incomplete or invalid; no replacement was written');
}
export async function control(method, params = {}, { home = dataDirectory(), timeout = 45000 } = {}) {
  const token = await tokenFor(home);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(controlEndpoint(home)); let buffer = '';
    const timer = setTimeout(() => { socket.destroy(); reject(new GuardError('control_timeout')); }, timeout);
    const finish = (error, result) => { clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(result); };
    socket.once('error', error => finish(new GuardError(['ENOENT', 'ECONNREFUSED'].includes(error.code) ? 'monitor_not_running' : 'control_connection_failed', error.code)));
    socket.once('connect', () => socket.write(JSON.stringify({ token, method, params }) + '\n'));
    socket.on('data', bytes => {
      buffer += bytes.toString();
      if (buffer.length > 2 * 1024 * 1024) return finish(new GuardError('control_response_too_large'));
      if (!buffer.includes('\n')) return;
      try { const response = JSON.parse(buffer.split('\n')[0]); finish(response.error ? new GuardError(response.error.code, response.error.message) : null, response.result); } catch (error) { finish(error); }
    });
  });
}
export async function startMonitor(home = dataDirectory()) {
  try { return await control('ping', {}, { home, timeout: 1500 }); }
  catch (error) { if (error.code !== 'monitor_not_running') throw error; }
  const child = spawn(process.execPath, [path.join(projectRoot, 'bin', 'quota-guard.mjs'), 'daemon'], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CODEX_QUOTA_GUARD_HOME: home } });
  child.on('error', () => {}); child.unref();
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(250);
    try { return await control('ping', {}, { home, timeout: 1000 }); }
    catch (error) { if (error.code !== 'monitor_not_running') throw error; }
  }
  throw new GuardError('monitor_start_failed', 'Could not contact monitor; run the daemon in a terminal for diagnostics');
}

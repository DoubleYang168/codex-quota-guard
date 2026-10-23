import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { projectRoot } from './paths.mjs';
import { GuardError, errorInfo, requireThreadId } from './util.mjs';

const actions = new Set(['status', 'refresh', 'threads', 'configure', 'watch', 'unwatch', 'check', 'dismiss', 'thread_control']);
function validateAction(action, args) {
  if (!actions.has(action) || !args || typeof args !== 'object' || Array.isArray(args)) throw new GuardError('invalid_dashboard_request');
  const keys = { status: [], refresh: [], threads: ['cursor', 'search'], configure: ['enabled', 'observeOnly', 'pauseRemainingPercent', 'resumeRemainingPercent', 'pollIntervalSeconds'], watch: ['threadId'], unwatch: ['threadId'], check: [], dismiss: ['episodeId'], thread_control: ['threadId', 'action', 'requestId'] }[action];
  if (Object.keys(args).some(key => !keys.includes(key))) throw new GuardError('invalid_dashboard_request');
  if (['watch', 'unwatch'].includes(action)) requireThreadId(args.threadId);
  if (action === 'thread_control') {
    requireThreadId(args.threadId); requireThreadId(args.requestId);
    if (!['start', 'stop'].includes(args.action)) throw new GuardError('invalid_manual_action');
  }
  if (action === 'dismiss' && (typeof args.episodeId !== 'string' || args.episodeId.length > 100 || !args.episodeId)) throw new GuardError('invalid_dashboard_request');
  if (action === 'threads') {
    for (const key of keys) if (args[key] !== undefined && args[key] !== null && (typeof args[key] !== 'string' || args[key].length > (key === 'search' ? 200 : 4096))) throw new GuardError('invalid_dashboard_request');
  }
}
export async function startDashboard({ dispatch, assets = path.join(projectRoot, 'web') }) {
  const token = crypto.randomBytes(32).toString('hex');
  const files = new Map(await Promise.all([['/', 'index.html', 'text/html; charset=utf-8'], ['/app.js', 'app.js', 'text/javascript; charset=utf-8'], ['/style.css', 'style.css', 'text/css; charset=utf-8']].map(async ([url, file, mime]) => [url, { body: await fs.readFile(path.join(assets, file)), mime }])));
  let origin;
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
    try {
      // Reject rebinding, cross-site fetches and cross-origin form submissions.
      if (`http://${request.headers.host}` !== origin || (request.headers.origin && request.headers.origin !== origin) || ['cross-site', 'same-site'].includes(request.headers['sec-fetch-site'])) return json(403, { error: { code: 'origin_refused' } });
      const target = new URL(request.url, origin);
      const file = files.get(target.pathname);
      if (request.method === 'GET' && file && !target.search) { response.writeHead(200, { 'Content-Type': file.mime }); response.end(file.body); return; }
      if (!target.pathname.startsWith('/api/')) return json(404, { error: { code: 'not_found' } });
      if (request.method !== 'POST') return json(405, { error: { code: 'post_required' } });
      const supplied = request.headers['x-quota-guard-token'];
      if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(token) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) return json(401, { error: { code: 'unauthorized' } });
      if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) return json(415, { error: { code: 'json_required' } });
      const chunks = []; let size = 0;
      for await (const bytes of request) { size += bytes.length; if (size > 16384) return json(413, { error: { code: 'request_too_large' } }); chunks.push(bytes); }
      const raw = Buffer.concat(chunks).toString('utf8');
      let args;
      try { args = JSON.parse(raw); } catch { return json(400, { error: { code: 'invalid_json' } }); }
      const action = target.pathname.slice(5);
      validateAction(action, args);
      const result = await dispatch(action === 'status' ? 'cached_status' : action === 'refresh' ? 'status' : action, args);
      json(200, { result });
    } catch (error) { json(400, { error: errorInfo(error) }); }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { url: `${origin}/#${token}`, origin, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
export async function launchBrowser(url) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/#([a-f0-9]{64})$/.test(url)) throw new GuardError('invalid_dashboard_url');
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, detached: true, stdio: 'ignore' });
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
  });
}

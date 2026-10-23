import readline from 'node:readline';
import { control, startMonitor } from './control.mjs';
import { GuardError, errorInfo, requireThreadId } from './util.mjs';
import { launchBrowser } from './dashboard.mjs';
import { version } from './version.mjs';
import { serviceStatus, serviceControl } from './service.mjs';
import { panelUri, panelDescriptor, panelResource } from './panel.mjs';
const appTool = { ui: { visibility: ['model', 'app'] }, 'openai/widgetAccessible': true };
export const tools = [
  { name: 'show_control_panel', title: '额度管理', description: 'Show the native Quota Guard control panel with buttons for opening the management page, enabling/disabling monitoring and exiting the background service. Reads cached state without starting the background service or inference.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: panelUri, visibility: ['model', 'app'] }, 'openai/outputTemplate': panelUri, 'openai/widgetAccessible': true, 'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] } } },
  { name: 'service_status', description: 'Read cached service status without starting the helper or querying live quota. Suitable for UI polling, including after exiting the background service.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, _meta: appTool },
  { name: 'service_control', description: 'Control the Quota Guard helper: enable starts it and enables monitoring using saved observe/live settings; disable pauses management without stopping chats; shutdown saves monitoring as disabled and exits the background helper while keeping this MCP control entry available.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['enable', 'disable', 'shutdown'] } }, required: ['action'], additionalProperties: false }, _meta: appTool },
  { name: 'open_dashboard', description: 'Start the local browser management page for selecting chats, viewing quota and changing monitoring settings. Opens the default browser unless openBrowser=false. Does not enroll chats or change observe/live mode.', inputSchema: { type: 'object', properties: { openBrowser: { type: 'boolean' } }, additionalProperties: false } },
  { name: 'quota_status', description: 'Read current quota, managed chats, pending recoveries and monitor health. Starts the local helper if needed; does not stop or resume tasks.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'watch_thread', description: 'Enroll this explicitly selected local desktop chat for quota monitoring. Uses the configured observe/live mode.', inputSchema: { type: 'object', properties: { threadId: { type: 'string', description: 'Exact local Codex chat UUID' } }, required: ['threadId'], additionalProperties: false } },
  { name: 'unwatch_thread', description: 'Remove one chat from monitoring and cancel its unsent automatic recoveries. Does not stop the task itself.', inputSchema: { type: 'object', properties: { threadId: { type: 'string' } }, required: ['threadId'], additionalProperties: false } },
  { name: 'configure', description: 'Set quota thresholds, polling interval and observe/live mode. observeOnly=false authorizes automatic stop/resume for enrolled chats under the saved rules.', inputSchema: { type: 'object', properties: { enabled: { type: 'boolean' }, observeOnly: { type: 'boolean' }, pauseRemainingPercent: { type: 'number', minimum: 0, maximum: 100 }, resumeRemainingPercent: { type: 'number', minimum: 0, maximum: 100 }, pollIntervalSeconds: { type: 'integer', minimum: 15, maximum: 3600 } }, additionalProperties: false } },
  { name: 'set_enabled', description: 'Enable or pause all quota management, retaining the selected chats and pending state. Does not pause their work immediately.', inputSchema: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'], additionalProperties: false } },
  { name: 'dismiss_recovery', description: 'Cancel one pending/uncertain recovery by its exact episode ID; never sends a continuation.', inputSchema: { type: 'object', properties: { episodeId: { type: 'string' } }, required: ['episodeId'], additionalProperties: false } }
];
tools.find(tool => tool.name === 'open_dashboard')._meta = appTool;
export function validateArguments(name, args) {
  const spec = tools.find(tool => tool.name === name);
  if (!spec) throw new GuardError('unknown_tool');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new GuardError('invalid_arguments');
  for (const key of Object.keys(args)) if (!(key in spec.inputSchema.properties)) throw new GuardError('invalid_arguments', `Unknown argument: ${key}`);
  for (const key of spec.inputSchema.required ?? []) if (!(key in args)) throw new GuardError('invalid_arguments', `Missing argument: ${key}`);
  for (const [key, value] of Object.entries(args)) {
    const rule = spec.inputSchema.properties[key];
    if (rule.type === 'integer' ? !Number.isInteger(value) : typeof value !== rule.type) throw new GuardError('invalid_arguments', key);
    if (rule.enum && !rule.enum.includes(value)) throw new GuardError('invalid_arguments', key);
    if (typeof value === 'number' && (!Number.isFinite(value) || value < rule.minimum || value > rule.maximum)) throw new GuardError('invalid_arguments', key);
  }
  if (args.threadId) requireThreadId(args.threadId);
}
export async function callTool(name, args, { start = startMonitor, send = control, open = launchBrowser, inspect = serviceStatus, manage = serviceControl } = {}) {
  validateArguments(name, args);
  if (['service_status', 'show_control_panel'].includes(name)) return inspect();
  if (name === 'service_control') return manage(args.action);
  await start();
  if (name === 'open_dashboard') {
    const page = await send('dashboard', {});
    if (args.openBrowser !== false) { try { await open(page.url); return { ...page, browserLaunchRequested: true }; } catch (error) { return { ...page, browserLaunchRequested: false, browserError: errorInfo(error) }; } }
    return page;
  }
  const commands = { quota_status: 'status', watch_thread: 'watch', unwatch_thread: 'unwatch', configure: 'configure', set_enabled: 'configure', dismiss_recovery: 'dismiss' };
  return send(commands[name], args);
}
export async function runMcp({ input = process.stdin, output = process.stdout, handler = callTool } = {}) {
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  const write = value => output.write(JSON.stringify(value) + '\n');
  for await (const line of reader) {
    if (!line.trim()) continue;
    let request;
    try { request = JSON.parse(line); } catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); continue; }
    if (request.id === undefined) continue;
    try {
      let result;
      switch (request.method) {
        case 'initialize': result = { protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25', '2026-07-28'].includes(request.params?.protocolVersion) ? request.params.protocolVersion : '2025-11-25', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'codex-quota-guard', version }, instructions: 'Use show_control_panel for native Quota Guard buttons, service_status for passive status, service_control for enable/disable/shutdown, and open_dashboard for the browser management page. Monitor only user-selected local Codex chats. New installations default to automatic control with no enrolled chats. Preserve saved modes; opening this panel does not enroll chats. Goal continuation must be verified separately from delivery of a continuation.' }; break;
        case 'ping': result = {}; break;
        case 'tools/list': result = { tools }; break;
        case 'tools/call': {
          try { const value = await handler(request.params?.name, request.params?.arguments ?? {}); result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false }; }
          catch (error) { result = { content: [{ type: 'text', text: JSON.stringify(errorInfo(error)) }], isError: true }; }
          break;
        }
        case 'resources/list': result = { resources: [panelDescriptor] }; break;
        case 'resources/read': {
          if (request.params?.uri !== panelUri) throw new GuardError('unknown_resource');
          result = await panelResource(); break;
        }
        case 'prompts/list': result = { prompts: [] }; break;
        default: write({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }); continue;
      }
      write({ jsonrpc: '2.0', id: request.id, result });
    } catch (error) { write({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: error.message } }); }
  }
}

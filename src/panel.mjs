import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './paths.mjs';
export const panelUri = 'ui://quota-guard/control-panel-v1.html';
export const panelDescriptor = { uri: panelUri, name: 'quota-guard-control-panel', title: '额度管理', description: 'Quota Guard 后台启停和管理页入口', mimeType: 'text/html;profile=mcp-app' };
export async function panelResource() {
  const [html, css, js] = await Promise.all(['control-panel.html', 'control-panel.css', 'control-panel.js'].map(file => fs.readFile(path.join(projectRoot, 'web', file), 'utf8')));
  return { contents: [{ uri: panelUri, mimeType: panelDescriptor.mimeType, text: html.replace('<!--STYLE-->', () => `<style>${css}</style>`).replace('<!--SCRIPT-->', () => `<script>${js}</script>`),
    _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } }, 'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] } } }] };
}

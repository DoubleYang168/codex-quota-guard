import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../src/paths.mjs';
import { version } from '../src/version.mjs';
import { publicFiles } from './public-files.mjs';

const files = await publicFiles();
const json = async name => JSON.parse(await fs.readFile(path.join(projectRoot, name), 'utf8'));
for (const name of ['package.json', 'plugin.json', '.codex-plugin/plugin.json']) {
  if ((await json(name)).version !== version) throw new Error(`Version mismatch: ${name}`);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a numeric three-part version');
const panel = await fs.readFile(path.join(projectRoot, 'web/control-panel.js'), 'utf8');
if (!panel.includes(`version: '${version}'`)) throw new Error('Panel version mismatch');
for (const name of ['README.md', 'README.en.md', 'INSTALL.md']) {
  if (!(await fs.readFile(path.join(projectRoot, name), 'utf8')).includes(version)) throw new Error(`Current version absent: ${name}`);
}
const legacy = await json('.mcp.json'), portable = await json('mcp.json');
for (const manifest of [legacy, portable]) {
  const server = manifest.mcpServers.quota_guard;
  if (server.command !== 'node' || server.args[0] !== '${PLUGIN_ROOT}/bin/quota-guard.mjs' || server.args[1] !== 'mcp') throw new Error('Unexpected MCP command');
}
const marketplace = await json('.agents/plugins/marketplace.json');
if (marketplace.plugins[0].source.path !== './') throw new Error('Marketplace must point to this root');

const problems = [];
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['api-key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}/],
  ['credential-url', /https?:\/\/127\.0\.0\.1:\d+\/#?[a-f0-9]{64}\b/i],
  ['personal-windows-home', /[A-Z]:\\Users\\(?!Public\b|Example\b|User\b)[^\\\s"']+/i],
  ['credential-assignment', /(?:token|apiKey|password)\s*[:=]\s*['"][A-Za-z0-9_-]{32,}['"]/i]
];
for (const name of files) {
  if (/\.(?:png|jpg|jpeg|gif|webp|ico)$/i.test(name)) continue;
  const text = await fs.readFile(path.join(projectRoot, name), 'utf8');
  for (const [label, pattern] of patterns) {
    const match = pattern.exec(text);
    if (match) problems.push(`${name}:${text.slice(0, match.index).split('\n').length}: ${label}`);
  }
  if (name.endsWith('.md')) {
    const prose = text.replace(/```[\s\S]*?```/g, '');
    for (const match of prose.matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1].split(/\s+"/)[0].replace(/^<|>$/g, '');
      if (/^(?:https?:|mailto:|#)/i.test(link)) continue;
      const target = decodeURIComponent(link.split('#')[0]);
      const relative = path.relative(projectRoot, path.resolve(projectRoot, path.dirname(name), target)).split(path.sep).join('/');
      if (!files.includes(relative)) problems.push(`${name}: missing or non-public local link: ${relative}`);
    }
  }
}
if (problems.length) throw new Error(problems.join('\n'));
if (process.argv.includes('--files')) process.stdout.write(JSON.stringify(files));
else if (!process.argv.includes('--quiet')) console.log(JSON.stringify({ version, publicFiles: files.length, manifests: 'ok', localLinks: 'ok', sensitivePatterns: 'no matches; manual review still required' }, null, 2));

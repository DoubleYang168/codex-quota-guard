import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { projectRoot } from '../src/paths.mjs';
const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, [path.join(projectRoot, 'scripts/check-source.mjs'), '--quiet'], { windowsHide: true, stdio: 'pipe' });
const pkg = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const dist = path.join(projectRoot, 'dist');
const stage = path.join(dist, `build-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`, 'quota-guard');
await fs.mkdir(stage, { recursive: true });
const included = ['package.json', 'plugin.json', 'mcp.json', '.mcp.json', '.codex-plugin/plugin.json', '.agents/plugins/marketplace.json', 'README.md', 'README.en.md', 'INSTALL.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'docs', 'LICENSE', 'NOTICE.md', 'src', 'bin', 'skills', 'web'];
async function walk(relative) {
  const source = path.join(projectRoot, relative), stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw new Error('Release input must not be a symlink');
  if (stat.isDirectory()) { const all = []; for (const item of await fs.readdir(source)) all.push(...await walk(path.join(relative, item))); return all; }
  const destination = path.join(stage, relative); await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.copyFile(source, destination); return [relative.split(path.sep).join('/')];
}
const files = []; for (const relative of included) files.push(...await walk(relative));
const checksums = {}; for (const relative of files) checksums[relative] = crypto.createHash('sha256').update(await fs.readFile(path.join(stage, relative))).digest('hex');
await fs.writeFile(path.join(stage, 'SHA256SUMS.json'), JSON.stringify(checksums, null, 2) + '\n'); files.push('SHA256SUMS.json');
// Small standard ZIP writer: no packaging dependencies or external commands.
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
const locals = [], centrals = []; let offset = 0;
for (const relative of files.sort()) {
  const name = Buffer.from(`quota-guard/${relative}`), content = await fs.readFile(path.join(stage, relative)), compressed = deflateRawSync(content), crc = crc32(content);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
  locals.push(local, name, compressed); centrals.push(central, name); offset += local.length + name.length + compressed.length;
}
const directory = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const archive = path.join(dist, `codex-quota-guard-${pkg.version}.zip`), bytes = Buffer.concat([...locals, directory, end]);
await fs.writeFile(archive, bytes);
const result = { version: pkg.version, directory: stage, archive, bytes: bytes.length, files: files.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
await fs.writeFile(archive + '.sha256', `${result.sha256}  ${path.basename(archive)}\n`);
await fs.writeFile(path.join(dist, 'latest.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2));

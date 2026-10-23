import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../src/paths.mjs';

export const publicRoots = ['src', 'bin', 'web', 'skills', 'test', 'scripts', 'docs', '.github', '.agents', '.codex-plugin'];
export const publicRootFiles = ['package.json', 'plugin.json', 'mcp.json', '.mcp.json', '.gitignore', '.gitattributes', '.npmrc', 'README.md', 'README.en.md', 'INSTALL.md', 'LICENSE', 'NOTICE.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md'];
export const ignoredRoots = new Set(['.git', '.runtime', 'dist', 'node_modules', 'research', 'runtime-home.json', '.env', '.DS_Store', 'Thumbs.db']);

export async function publicFiles(root = projectRoot) {
  const files = [];
  async function visit(relative) {
    const stat = await fs.lstat(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`Public source must not contain symlinks: ${relative}`);
    if (stat.isDirectory()) {
      for (const child of (await fs.readdir(path.join(root, relative))).sort()) await visit(`${relative}/${child}`);
    } else {
      if (relative.split('/').some(part => ['.runtime', '.git', 'node_modules', '__pycache__'].includes(part)) || /(?:^|\/)(?:runtime-home\.json|control-token|\.env(?:\..*)?)$/.test(relative) || /\.(?:log|pyc|zip)$/.test(relative)) throw new Error(`Private/generated file inside public tree: ${relative}`);
      files.push(relative);
    }
  }
  for (const item of (await fs.readdir(root)).sort()) {
    if (ignoredRoots.has(item) || /^\.env\./.test(item)) continue;
    if (!publicRoots.includes(item) && !publicRootFiles.includes(item)) throw new Error(`Unexpected root item; review before publishing: ${item}`);
    await visit(item);
  }
  for (const item of [...publicRoots, ...publicRootFiles]) await fs.access(path.join(root, item));
  return files.sort();
}

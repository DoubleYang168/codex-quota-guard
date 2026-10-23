import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../src/paths.mjs';
const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next ?? '')) throw new Error('Usage: npm run version:set -- 0.4.6');
const pkgFile = path.join(projectRoot, 'package.json');
const current = JSON.parse(await fs.readFile(pkgFile, 'utf8')).version;
for (const name of ['package.json', 'plugin.json', '.codex-plugin/plugin.json']) {
  const file = path.join(projectRoot, name), text = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, text.replace(/("version"\s*:\s*")[^"]+(")/, (_, prefix, suffix) => `${prefix}${next}${suffix}`));
}
for (const name of ['src/version.mjs', 'web/control-panel.js', 'README.md', 'README.en.md', 'INSTALL.md']) {
  const file = path.join(projectRoot, name), text = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, text.replaceAll(current, next));
}
console.log(`Updated ${current} -> ${next}. Add CHANGELOG and release notes, then run npm run check.`);

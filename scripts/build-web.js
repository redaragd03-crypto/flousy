/* scripts/build-web.js — stage web assets into www/ for Capacitor (no build step needed) */
import { cpSync, rmSync, mkdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');

if (!existsSync(join(root, 'index.html'))) {
  console.error('index.html not found in project root');
  process.exit(1);
}

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

for (const entry of ['index.html', 'manifest.json', 'sw.js', 'src', 'assets']) {
  const src = join(root, entry);
  if (!existsSync(src)) throw new Error(`missing web asset: ${entry}`);
  cpSync(src, join(www, entry), { recursive: true });
}

// sanity: every icon referenced by manifest must exist in www/
const manifest = JSON.parse(readFileSync(join(www, 'manifest.json'), 'utf8'));
let missing = 0;
for (const ic of manifest.icons || []) {
  const p = join(www, ic.src);
  if (!existsSync(p) || statSync(p).size === 0) { console.error('MISSING ICON:', ic.src); missing++; }
}
if (missing) process.exit(1);

console.log('www/ staged OK');

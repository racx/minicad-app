/* Suite 00 — the core boundary gate: js/core/ must be entirely DOM-free.
   Greps every core module for `document.` / `window.`; one FAIL per hit.
   Runs first (filename sort) so a violation fails the run loudly. */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, finish } from './stub-dom.mjs';

const coreDir = join(dirname(fileURLToPath(import.meta.url)), '../js/core');
const files = readdirSync(coreDir, { recursive: true }).filter(f => f.endsWith('.js'));
check('js/core/ exists and has modules', files.length > 0);

for (const f of files){
  const src = readFileSync(join(coreDir, f), 'utf8');
  const hits = [];
  src.split('\n').forEach((line, i) => {
    if (/\bdocument\.|\bwindow\./.test(line)) hits.push(`${f}:${i+1}`);
  });
  check(`core module ${f} is DOM-free`, hits.length === 0);
  if (hits.length) console.log('  DOM references at: ' + hits.join(', '));
}
finish();

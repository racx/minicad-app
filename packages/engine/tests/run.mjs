#!/usr/bin/env node
/* MiniCAD engine test runner.
   Usage: node tests/run.mjs        (from anywhere — paths are resolved from this file)
   Each *.test.mjs runs in its own process (fresh module state). */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f=>f.endsWith('.test.mjs')).sort();
let failed = 0, checks = 0;

for (const f of files){
  const r = spawnSync(process.execPath, [join(dir, f)], {encoding:'utf8'});
  const ok = r.status===0;
  const n = (r.stdout.match(/^PASS /gm)||[]).length + (r.stdout.match(/^FAIL /gm)||[]).length;
  checks += n;
  console.log(`${ok?'✔':'✘'} ${f}  (${n} checks)`);
  if (!ok){
    failed++;
    const details = r.stdout.split('\n').filter(l=>l.startsWith('FAIL')).join('\n');
    console.log(details || r.stderr);
  }
}
console.log(failed ? `\n${failed}/${files.length} suites FAILED`
                   : `\nAll ${files.length} suites passed (${checks} checks)`);
process.exit(failed?1:0);

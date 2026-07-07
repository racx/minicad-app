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

/* Test tiers — future sessions: NEW SUITES DEFAULT TO CORE-DIRECT.
   00        boundary gate  — greps js/core/ for DOM references
   01–23     adapter-integration — boot through js/adapters/dom/main.js with
             tests/stub-dom.mjs; assertions read the stubbed DOM (historical,
             approved to stay as-is)
   24+       core-direct — import js/core/* straight, NO fake document */
const tier = f => {
  const n = parseInt(f, 10);
  if (n === 0) return '— boundary gate (core must be DOM-free) —';
  if (n <= 23) return '— adapter-integration suites (stub DOM) —';
  return '— core-direct suites (no DOM stub) —';
};
let lastTier = null;

for (const f of files){
  if (tier(f) !== lastTier){ lastTier = tier(f); console.log(lastTier); }
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

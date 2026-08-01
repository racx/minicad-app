#!/usr/bin/env node
/* =========================================================
   DWG → DXF converter        ** GPL-3.0 — see README.md **

   usage:  node convert.mjs <output.json>   < input.dwg

   Emits the parsed DWG database as JSON (not DXF): libredwg's DXF writer
   crashes on real drawings, while its reader handles them fine. The engine
   turns this JSON into its own IR in core/dwgdb.js.

   The payload goes to the FILE named on argv, never to stdout: the wasm prints
   its own diagnostics to stdout, which would otherwise corrupt the payload.
   Treat this process's stdout as noise.

   SUCCESS IS "THE OUTPUT FILE IS NON-EMPTY", not the exit status: the wasm
   spins up a thread pool that cannot be shut down cleanly, so a normal exit
   idles ~3.7s after the work is done (measured, with zero active handles).
   We flush the file and SIGKILL ourselves instead — 3.9s becomes 0.26s.
   Failures write nothing to the file and exit normally:
     2 = not a DWG / empty / too large   3 = unreadable DWG   4 = converter broken

   Deliberately a standalone process: LibreDWG is GPL, MiniCAD is not.
   Rails shells out to this; nothing imports it.
   ========================================================= */
import { LibreDwg } from '@mlightcad/libredwg-web';
import { createRequire } from 'node:module';
import { closeSync, openSync, writeSync } from 'node:fs';

const MAX_BYTES = Number(process.env.DWG_MAX_BYTES || 64 * 1024 * 1024);

const die = (code, msg) => { process.stderr.write(msg + '\n'); process.exit(code); };

const outPath = process.argv[2];
if (!outPath) die(4, 'usage: convert.mjs <output.dxf> < input.dwg');

// "AC" + 4 digits — the version stamp every DWG starts with
const isDWG = b => b.length > 6 && b[0] === 0x41 && b[1] === 0x43 &&
                   [...b.subarray(2, 6)].every(c => c >= 0x30 && c <= 0x39);

const chunks = [];
let total = 0;
for await (const c of process.stdin) {
  total += c.length;
  if (total > MAX_BYTES) die(2, `That file is larger than ${Math.round(MAX_BYTES / 1048576)} MB.`);
  chunks.push(c);
}
const buf = Buffer.concat(chunks);

if (!buf.length) die(2, 'That file is empty.');
if (!isDWG(buf))  die(2, 'That is not a DWG file. If it is a DXF, open it directly.');

// Resolve the wasm next to wherever npm actually installed the package —
// workspaces hoist to the repo root, so a hardcoded ./node_modules path breaks.
function wasmDir() {
  const entry = createRequire(import.meta.url).resolve('@mlightcad/libredwg-web');
  const pkg = entry.slice(0, entry.lastIndexOf('/@mlightcad/libredwg-web/') + '/@mlightcad/libredwg-web/'.length);
  return pkg + 'wasm/';
}

let dwg;
try {
  dwg = await LibreDwg.create(wasmDir());
} catch (e) {
  die(4, `The DWG converter could not start: ${e}`);
}

// Read the database rather than asking libredwg to emit DXF: its DXF *writer*
// crashes with "memory access out of bounds" on real files (a 330 KB r2013
// house plan) whose reader path parses cleanly. The engine maps this JSON to
// its IR in core/dwgdb.js.
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
let payload = null;
try {
  const ptr = dwg.dwg_read_data(ab, 0);
  if (ptr){
    const db = dwg.convert(ptr);
    // A garbage file still yields a pointer and an empty database, which would
    // serialize to perfectly valid JSON — so check there is actually a drawing
    // in here before calling it a success.
    const records = Object.values(db?.tables?.BLOCK_RECORD?.entries || {});
    const drawable = (db?.entities?.length || 0) +
                     records.reduce((n, r) => n + ((r && r.entities && r.entities.length) || 0), 0);
    if (!drawable)
      die(3, 'That DWG could not be read. It may be damaged, or a newer format than we support.');
    // handles come back as BigInt, which JSON.stringify refuses
    const plain = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);
    payload = Buffer.from(JSON.stringify({
      header: db.header || {},
      tables: {LAYER: db.tables?.LAYER, BLOCK_RECORD: db.tables?.BLOCK_RECORD},
      entities: db.entities || [],
    }, plain));
  }
} catch (e) {
  process.stderr.write(`convert threw: ${e}\n`);
}
if (!payload || payload.length < 2)
  die(3, 'That DWG could not be read. It may be damaged, or a newer format than we support.');

// writeSync is a real write(2), so the bytes are in the page cache and visible
// to the parent the moment the loop finishes — SIGKILL cannot lose them.
const out = payload;
const fd = openSync(outPath, 'w');
for (let off = 0; off < out.length; ) off += writeSync(fd, out, off, out.length - off);
closeSync(fd);
process.kill(process.pid, 'SIGKILL');   // see header: a clean exit costs ~3.7s

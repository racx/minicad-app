# @minicad/dwg — DWG→DXF converter

**This package is GPL-3.0. `@minicad/engine` and the Rails app are not. Keep it that way.**

## Why it is a separate package invoked as a subprocess

DWG reading uses [LibreDWG](https://www.gnu.org/software/libredwg/) (via
[`@mlightcad/libredwg-web`](https://github.com/mlightcad/libredwg-web)), which is
**GPL-3.0**. Shipping that WebAssembly to a browser would be *distribution* and would
place MiniCAD under GPLv3 — anyone we distribute to could demand source and redistribute.

GPLv3 has no network-use clause (that is AGPL). Running it **server-side** and returning
only the converted DXF is not distribution. Invoking it as a **separate process** — rather
than importing it — is the strongest, most conventional form of that separation.

Therefore:

- **Nothing imports this package.** Rails runs `node packages/dwg/convert.mjs` and pipes
  bytes through stdin/stdout. `packages/engine` has no idea it exists.
- It has its own `package.json`, its own `license`, and its own `node_modules`.
- If you ever bundle this into the Vite entrypoint or import it from Ruby-adjacent JS,
  you have relicensed MiniCAD. Don't.

## Why JSON and not DXF

The obvious design is `dwg_write_dxf()` → feed the existing DXF parser. It does not
survive contact with real files: a 330 KB r2013 house plan crashes that call with
`RuntimeError: memory access out of bounds`, while `dwg_read_data()` + `convert()` parse
the same file into 593 entities across 143 layers with zero unknowns. The reader is
solid; the writer is not (and it is not a memory limit — the wasm has 1 GB initial /
4 GB max). So we emit the database and map it in `@minicad/engine`'s `core/dwgdb.js`.

## Contract

```
argv[1]: path to write the output JSON to
stdin  : raw .dwg bytes
output : the parsed DWG database as JSON — A NON-EMPTY OUTPUT FILE IS SUCCESS
exit 2 : not a DWG / empty / too large   (stderr = message for the end user)
exit 3 : unreadable DWG                  (stderr = message for the end user)
exit 4 : converter itself is broken      (stderr = operator diagnostic)
```

stderr on exit 2 and 3 is shown to end users verbatim, so it must stay in plain language
(MiniCAD rule: every refusal needs a human message).

**Why success has no exit code.**  LibreDWG's wasm starts a thread pool that cannot be
shut down cleanly from JS: after the conversion finishes the process idles ~3.7s before
dying, even with `process.exit()`, `process.reallyExit()`, and zero active handles
(measured — the work itself is ~200ms). So on success the script flushes stdout with
`writeSync` and then SIGKILLs itself, which takes a 3.9s conversion down to **0.26s**.
Output is byte-identical either way. Failures never write to stdout, so
"stdout non-empty" is an unambiguous success test.

If someone later rebuilds the wasm single-threaded, this can go back to a plain
`process.exit(0)` — check whether the idle is gone before changing the contract.

## Install / test

```
npm install --workspaces          # from the repo root
node packages/dwg/convert.mjs < some.dwg > some.dxf
```

`DwgConverter` (`app/services/dwg_converter.rb`) is the Rails wrapper;
`POST /api/dwg` is the endpoint the browser talks to.

# MScript — scriptable command grammar

> **Provenance:** rewritten 2026-07-07 against monorepo commit `bb0cf63`
> (core extraction complete). MScript is **implemented**: parser, validator and
> `executeScript` live in `js/core/mscript.js`, exported through the package
> face (`js/core/index.js`). The round-trip proof is the core-direct suite
> `tests/24-mscript.test.mjs` (every grammar form, every rejection class,
> atomicity); the embedding-level proof is `tests/25-face.test.mjs`.

## Purpose

A line-oriented text format that drives the drawing engine without a mouse or
DOM — the substrate for AI-generated drawings, batch tests, and "describe your
floor plan" in the SaaS. One statement per line; `#` starts a comment.
Statements execute through the same `startCommand/onPoint/handleEnter`
machinery as the interactive UI, so defaults and refusals are identical to
typing the command.

## Design rules

1. Every statement maps onto the *existing* command semantics (same defaults,
   same refusals — an engine refusal becomes a script error).
2. Points are `x,y` in absolute drawing units. No `@`-relative forms — scripts
   know their coordinates.
3. **Scripts are atomic.** A failure at line N (syntax, selector, refusal,
   incomplete statement) rolls back entities, layers, idSeq, units, current
   layer, selection, undo/redo stacks and remembered prefs — nothing mutates.
   Errors come back structured: `{line, msg}`.
4. A successful script lands as **one undo entry**, however many statements ran.
5. Commands that need a selection take an explicit **selector**:
   - `LAST` / `LAST n` — the most recent entity / n most recent
   - `ALL` — everything on visible + unlocked layers
   - `W(x0,y0 x1,y1)` — window (fully inside) · `C(x0,y0 x1,y1)` — crossing
   - `#id [#id …]` — explicit entity ids (`executeScript` returns created ids)
6. Strings are double-quoted. Keywords are case-insensitive. Material keys are
   bare lowercase words.

## Grammar

### Draw
```
LINE   x,y x,y [x,y ...]                 # chained, like the L command
PLINE  x,y [x,y | A x,y | L x,y ...] [CLOSE]
       # A = arc mode, L = straight — mirroring the interactive command.
       # A after the first point (no tangent yet) consumes TWO points:
       # a point ON the arc, then its endpoint. Later A segments are
       # tangent-continuation arcs defined by the endpoint alone.
RECT   x,y x,y
CIRCLE cx,cy r<radius>                   # CIRCLE 50,30 r12
ARC    x,y x,y x,y                       # 3-point: start, on-arc, end
TEXT   x,y h<height> "string"
DIM    x,y x,y off<offset>               # aligned dim; signed offset = side
```

### Modify
```
MOVE    <sel> dx,dy                      # displacement, not base/dest pair
COPY    <sel> dx,dy [dx,dy ...]          # one clone per displacement
ROTATE  <sel> base<x,y> ang<degrees>
SCALE   <sel> base<x,y> f<factor>
OFFSET  <sel-single> d<dist> side<x,y>
TRIM    edges(<sel>|ALL) at<x,y>         # at = the pick point on the target
EXTEND  bounds(<sel>|ALL) at<x,y>
FILLET  r<radius> #id at<x,y> #id at<x,y>   # each at-point must touch its #id
MIRROR  <sel> x,y x,y [ERASE]
STRETCH C(x0,y0 x1,y1) dx,dy             # crossing box is mandatory, like the command
ERASE   <sel>
CHLAYER <sel> "layername"
EDITTEXT #id "new string"
JOIN    <sel>                            # chain touching lines/arcs/open plines; loops close
EXPLODE <sel>                            # polylines → lines + arcs (hatches on them cascade away)
```

### Annotation / layers / session
```
DIMTXT  h<height>|AUTO
LAYER   "name" [color#rrggbb] [OFF|ON] [LOCK|UNLOCK] [CURRENT]   # creates if missing
UNITS   mm|cm|m
NEW     CONFIRM                          # explicit keyword instead of Y/N prompt
ZOOM    E
HATCH   <sel-single> <material-key>      # closed pline (arc segments fine) or circle;
                                         # re-hatching swaps the material.
                                         # keys: concrete, brick, green, glass, wood, water
                                         # (the source of truth is js/core/materials.js)
AREA    <sel-single>                     # measurement READBACK: logs
                                         # "<What> — area A units² (perimeter P units)."
                                         # — echoed to the command history and returned
                                         # in executeScript's result.logs
```

### Deliberately NOT scriptable
- **PLOT** — printing is interactive by nature (paper, scale, window picks).
- **OSNAP configuration / DYN** — user preferences persisted per browser, not
  drawing content. A script snaps nothing anyway: it supplies exact coordinates.
- Pointer UX (grips, drag-move, rubber previews) — no scripted form by design.

## API (package face: `@minicad/engine`)

```js
executeScript(lines[, state]) → { created:[ids], errors:[{line,msg}], logs:[{text,cls}] }
parseScript(lines)            → { statements, errors }        // syntax only
previewScript(lines)          → { entities, errors, logs }    // execute + full rollback:
                                                              // deep copies for ghost previews,
                                                              // zero lasting state change
serializeContext({cap=150})   → drawing-as-context payload: units, layers, counts,
                                selection-first entity table (2-decimal rounded,
                                hatch rows carry material + computed area), truncated flag
```

`state` is accepted for signature compatibility; the engine is a singleton per
JS realm and `executeScript` operates on it. The reference host (the Rails
app's editor) uses `previewScript` for the AI ghost preview and
`executeScript` on commit.

## Implementation notes

- `js/core/mscript.js` — grammar table (regex → statement), selector resolver,
  per-statement drivers. Engine refusals are captured off the `'e'`-class log
  stream and become line-numbered errors; a statement that leaves a command
  active is an error ("did not complete").
- Atomic rollback restores a full pre-script capture (see `captureDoc`),
  including remembered prefs (fillet radius, dim text height) via
  `snapshotPrefs/restorePrefs`.
- One-undo collapse: intermediate `snapshot()` pushes are spliced down to the
  first one after success.

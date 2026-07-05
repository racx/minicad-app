# MScript — scriptable command grammar (design)

> **Provenance note (2026-07-05):** this file was requested as a "sync" but was **not
> present in the repo** and no prior version exists in git history. This is a fresh draft
> written against the engine at commit `219218d`. Nothing here is implemented yet — see
> "Implementation status" at the bottom.

## Purpose

A line-oriented text format that drives the drawing engine without a mouse or DOM — the
substrate for AI-generated drawings, batch tests, and eventually "describe your floor plan"
in the SaaS. One statement per line; `#` starts a comment.

## Design rules

1. Every statement maps onto the *existing* command semantics (same defaults, same refusals).
2. Points are `x,y` (drawing units). No `@`-relative forms in v1 — scripts know their coords.
3. Commands that need a selection take an explicit **selector** (scripts have no click):
   - `LAST` — the most recently created entity
   - `LAST n` — the n most recent
   - `ALL` — everything on visible+unlocked layers
   - `W(x0,y0 x1,y1)` — window (fully inside) · `C(x0,y0 x1,y1)` — crossing
   - `#id` — explicit entity id (ids are returned by executeScript, see below)
4. Strings are double-quoted. Keywords are case-insensitive.

## Grammar (v1) — one form per implemented engine command

### Draw
```
LINE   x,y x,y [x,y ...]                 # chained, like the L command
PLINE  x,y x,y x,y [... ] [CLOSE]
RECT   x,y x,y
CIRCLE cx,cy r<radius>                   # CIRCLE 50,30 r12
ARC    x,y x,y x,y                       # 3-point: start, on-arc, end
TEXT   x,y h<height> "string"            # TEXT 5,5 h2.5 "Living room"
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
FILLET  r<radius> #id at<x,y> #id at<x,y>
MIRROR  <sel> x,y x,y [ERASE]
STRETCH C(x0,y0 x1,y1) dx,dy             # crossing box is mandatory, like the command
ERASE   <sel>
CHLAYER <sel> "layername"
EDITTEXT #id "new string"                # engine: startEditText + apply
```

### Annotation / layers / session
```
DIMTXT  h<height>|AUTO
LAYER   "name" [color<#hex>] [OFF|ON] [LOCK|UNLOCK] [CURRENT]
UNITS   mm|cm|m                          # reserved — lands with Stage 1
NEW     CONFIRM                          # explicit keyword instead of Y/N prompt
ZOOM    E
```

## Grammar ↔ engine diff (both directions, at commit 219218d)

**In the engine but previously missing from any grammar** (now covered above):
`DIM, DIMTXT, CHLAYER, STRETCH, ARC, EDITTEXT` ✅ (per Stage-0 instruction), plus
`MIRROR, FILLET, TRIM, EXTEND, OFFSET-pline, NEW, layer off/lock` which also had no
scripted form anywhere.

**In the grammar but NOT in the engine:**
- `UNITS` — reserved; engine has no units concept yet (Stage 1 work).
- Entity ids as a *user-facing* concept (`#id` selectors): engine has stable numeric ids
  (`state.js nextId`) but nothing exposes them.
- `LAYER ... color/OFF/LOCK` one-liner: engine has the capabilities but only via UI
  buttons, not via a single command.

**Interaction model gaps** (engine features a script cannot express, by design):
grips, drag-to-move, rubber-band previews — these are pointer UX, out of scope.

## Implementation status

**`executeScript(lines, state)` DOES NOT EXIST.** Verified by grep across `js/`, `tests/`,
`docs/`: zero references. There is also no DOM-free entry point today: `js/commands.js`
imports `js/ui.js` (log/setPrompt/cmdInput) and `js/view.js` (draw), both of which touch
`document` at module top level — the engine only runs DOM-free via the test stub
(`tests/stub-dom.mjs`).

Implementation sketch for a later session (NOT this one):
1. Extract log/setPrompt behind an injectable sink so `commands.js` stops hard-importing DOM.
2. `js/mscript.js`: `executeScript(text) → {created:[ids], errors:[{line,msg}]}` —
   a parser that calls `startCommand/onPoint/handleEnter` exactly like the tests already do
   (the test suites are the proof this driving style works).
3. Tests: one suite asserting every grammar form round-trips into the expected entities.

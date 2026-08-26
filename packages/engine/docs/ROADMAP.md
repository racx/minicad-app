# MiniCAD — Feature Inventory & Roadmap

**Single source of truth** for what exists, how complete it is, and what comes next.
Evidence-based: every claim below cites `file:line` in the codebase as of commit `536d7c7`
(line numbers may have drifted since; section updates carry their own dates).
Verified against the test suite: `node tests/run.mjs` → **41 suites, 1060 checks, all passing** (2026-08-18).

Update this file whenever a feature lands or a decision changes the plan.

---

## 1. Command inventory

Canonical names from the alias map (`js/commands.js:15–26`). "Typed coords" means the command's
point steps accept `x,y` / `@dx,dy` / `@d<a` / direct-distance via `parsePoint`
(`js/commands.js:660`, consumed for any active command at `js/commands.js:813`).
"Undo" = one `snapshot()` per completed mutation unless noted.

### Draw

| Command | Aliases | Flow & completeness | Evidence |
|---|---|---|---|
| LINE | `L` | ✅ Complete. Chained segments, Enter/right-click ends. Typed+clicked coords, ortho/osnap. Snapshot per segment. | prompt `commands.js:124`, points `:210`, snapshot `:213` |
| PLINE | `PL` | ✅ Complete, now with ARC SEGMENTS: `A` switches to arc mode (tangent-continuation arc by endpoint; 3-point flow when the arc is the first segment), `L` back to straight, `C` closes, Enter finishes. Vertices carry DXF-style `bulge` (tan θ/4, +CCW). Render, rubber preview, hit/bbox/snaps (mid = apex, cen), apex grips, transforms (mirror negates bulge), SVG plot `A` paths and DXF group 42 all honor it. | PLINE modes `commands.js` (onPoint/handleEnter PLINE), bulge math `geometry.js` (bulgeApex/bulgeArc/tangentBulge/bulgeFrom3/plineParts), parts model `intersect.js`, suite 21 |
| JOIN | `J` `JOIN` `PEDIT` | ✅ Merges touching lines, arcs and open polylines into polylines (arcs become bulged segments; loops auto-close). Ends must meet exactly. One snapshot. | `commands.js` performJoin/strandOf/reverseStrand, suite 21 |
| HATCH | `H` `HATCH` `BHATCH` | ✅ Material fills on closed shapes (closed pline incl. bulges / circle): pick material from catalog dialog (concrete, brick, green, glass, wood, water — `js/materials.js`), click inside or on the outline. Associative: hatch references its boundary (follows move/stretch, dies with erase/explode, remaps on copy/mirror). Area+perimeter logged on creation. Renders under linework (screen-space patterns); prints as mm-true SVG patterns. NOT exported to DXF yet. | `commands.js` placeHatch/boundaryAt, `js/hatchui.js`, render `view.js` drawHatch, plot patterns `plot.js`, suite 22 |
| AREA | `AREA` `AA` | ✅ Click a hatch or closed shape → area + perimeter (shoelace + circular-segment corrections, bulge-aware — `geometry.js` plineArea/entityArea). | suite 22 |
| BOUNDARY | `BO` `BOUNDARY` `BPOLY` | ✅ Pick a point inside any enclosed region → closed pline traced around it, AutoCAD BOUNDARY style. Works on linework that merely crosses: entities flatten to a planar graph (`core/boundary.js` — pieces cut at every crossing, dead-end stubs pruned), then a leftmost-turn walk from the ray-entry edge traces exactly the face containing the pick, CCW; the outside world traces CW and is rejected with a gap hint. Arcs/circles carry through as bulges; collinear/co-circular pieces re-merge. Hidden/locked/frozen layers and text/dim/hatch don't fence. One snapshot per pick; repeatable like HATCH. Islands are NOT traced as extra plines — hatching the result already detects them (islandsWithin). | `core/boundary.js` traceBoundary, `commands.js` placeBoundary, suite 39 |
| EXPLODE | `X` `EXPLODE` | ✅ Breaks polylines (incl. rectangles) into line/arc entities — the escape hatch TRIM/EXTEND/OFFSET point at for curved plines. | `commands.js` performExplode, suite 21 |
| RECTANG | `REC` `RECT` `RECTANGLE` | ✅ Complete. Two corners → closed pline. Typed+clicked. One snapshot. | `:133`, `:234` |
| CIRCLE | `C` | ✅ Complete. Center + radius (click **or** typed number `:731`). One snapshot. | `:134`, `:243`, makeCircle `:369` |
| ARC | `A` | ✅ Complete. 3-point (start / on-arc / end), live curved preview, collinear third point refused and re-promptable. One snapshot. | `:125`, `:222–233`, math `geometry.js` `arcFrom3`, preview `view.js` (drawRubber ARC branch) |
| TEXT | `T` `DT` | ✅ Complete. Point → height (default 2.5) → string (spaces allowed, `main.js:141–143`). One snapshot. | `:135`, `:247`, `:697–708` |
| DIM | `DIM` `DLI` `DAL` `DIMLINEAR` | ✅ Complete (aligned type only). p1 → p2 → placement click; live ghost preview; value recomputed from geometry at render. One snapshot. | `:155`, `:295–312`, entity `entities.js:12` (dimGeom) |
| DIMTXT | `DTX` | ✅ Complete. Sets dim text height (remembered; `A`/0 = auto = 4% of length, `entities.js:9`). Also restyles selected dims (one snapshot). | `:156`, `:767–782` |

### Modify

| Command | Aliases | Flow & completeness | Evidence |
|---|---|---|---|
| MOVE | `M` | ✅ Complete. Noun-verb or verb-noun (MODIFY set `:27`), base→dest with ghost preview. Typed coords. One snapshot. | `:262–265`, ghost `view.js` (MOVE/COPY dest) |
| COPY | `CO` `CP` | ✅ Complete. Repeats placement until Enter (`:805`). Snapshot **per placement**. | `:262–274` |
| ROTATE | `RO` | ✅ Complete. Base point, then typed degrees (`:722`) or clicked angle. One snapshot. All 6 entity types. | `:313`, applyRotate `:388` |
| SCALE | `SC` | ⚠️ Typed factor only — clicking at the factor step just logs a hint (`:320–322`); AutoCAD's reference-length click-scaling absent. One snapshot. | `:320`, applyScale `:404` |
| OFFSET | `O` | ✅ Complete for line/circle/arc/pline (mitered corners, open+closed); text/dim politely refused (`:356`). Distance typed only. Snapshot per offset (popped on failure `:582`). | `:138`, `:352`, offsetPlinePts `:592` |
| TRIM | `TR` | ✅ Complete for line/circle/arc targets (pline/text refused `:467`); plines **do** work as cutting edges. Empty Enter = all edges; preselection deliberately ignored (`:140`); trimmed edges' pieces stay edges. One snapshot per trim. | `:139`, `:324`, trimEntity `:462–495` |
| EXTEND | `EX` | ✅ Complete for line/arc targets (`:535`). Click-near-the-tip picks the end; nearest boundary ahead wins; hidden layers excluded. One snapshot per extend. | `:143`, `:331`, extendLine `:540`, extendArc `:559` |
| FILLET | `F` | ⚠️ **Lines only** (`:342`). Radius prompt (remembered, default 0). r=0 corner (trim+extend), r>0 tangent arc with pick-side quadrant selection; parallel & radius-too-large refused. One snapshot. | `:147`, `:338`, filletLines `:611–658` |
| MIRROR | `MI` | ✅ Complete. Two-point axis (rubber line), `Erase source? [Y/N] <N>` (`:783`). Arc reflected CCW-correct, text insertion-only (MIRRTEXT=0 style). One snapshot. | `:275`, doMirror `:571`, mirrorEnt `entities.js:195` |
| STRETCH | `S` | ✅ Complete. Forces fresh crossing-box selection (`:151`, box rect captured in `boxSelect` via `selRect`); vertices inside box move, circles/arcs/text move iff center/insertion inside; dims stretch per-defpoint. One snapshot. | `:283`, stretchEnt `:585` |
| ERASE | `E` `DEL` | ✅ Complete. Also Delete/Backspace key when idle (`main.js:164–170`). One snapshot. | afterSelect `:180–186` |
| LAYDEL | `LAYDEL` `LAYDELETE` `LADEL` | ✅ Deletes matching layers and every object on them, ignoring the file's lock flag (client drawings ship scratch layers locked). Trailing/embedded `*` matches a family — `EXCLUIR*` cleared 13 layers / 4460 objects (20% of a real plan) in one command. Layer `0` protected; hatches orphaned by a deleted boundary go too; one snapshot. | `commands.js` LAYDEL, suite 11 |
| THAW | `THAW` | ✅ Clears the `frozen` flag on every imported approximation, making them editable. One snapshot; says how many it released; no-ops with a message when nothing is frozen. | `commands.js` THAW, suite 26 |
| CHLAYER | `CH` | ✅ Complete. Requires prior selection (`:127–131`), validates layer name and lists layers on typo (`:749–758`). One snapshot. | `:749` |

### Annotation / inspect / view / session

| Command | Aliases | Flow & completeness | Evidence |
|---|---|---|---|
| DIST | `DI` | ✅ Complete. Two points → distance/Δ/angle logged. No mutation, no snapshot (correct). | `:136`, `:251–260` |
| ZOOM | `Z` | ⚠️ Extents/All only (`:709–714`). No zoom-window, no zoom-scale. Wheel zoom + middle-drag/space pan cover daily use (`main.js:101`, `:64`). | `:137` |
| ZOOMEXT | `ZOOMEXT` (toolbar) | ✅ Instant. | `:113` |
| UNDO / REDO | `U` / `REDO`, Ctrl-Z / Ctrl-Shift-Z | ✅ Complete. JSON snapshots, depth capped at 200 (`state.js:31–34`). Cancels active command. | `commands.js:30–44` |
| NEW | `NEW` | ✅ Complete. Y/N confirm (default N), clears drawing + undo history + autosave. | `:126`, `:739–748` |
| TOGORTHO/TOGOSNAP/TOGGRID | `ORTHO` `GRID`, F8/F3/F7 (+F9 snap) | ✅ Instant toggles. Typed `OSNAP` now opens the mode picker instead (F3/chip remain the quick toggle). | `:114–116`, keys `main.js:150–153` |
| OSNAP dialog | `OSNAP` `OS` | ✅ Per-mode snap picker (AutoCAD Drafting Settings analog): checkbox per marker incl. Nearest ⧖ (default off) and Edge crossing, master F3 sync, alignment-tracking toggle, All on/off. Choices persist per browser (`minicad.osnap`). Gating: `SNAP_ACTIVE` set filters candidates before the fixed `SNAP_PRIORITY` ranking. | `commands.js` (SNAP_ACTIVE/setSnapActive/loadSnapConfig), `js/osnapui.js`, markup `index.html#osnapDlg`, suite 20 |
| HELP | `?` `HELP` | ✅ In-app panel. | `:117` |
| TOGDYN | `DYN`, F12, chip | ✅ Dynamic input: prompt + live typing rendered in a tooltip riding the crosshair (edge-aware flip), on by default. Pure display — input routing/UX unchanged. | `view.js` drawDynInput, `main.js` (F12, input redraw), suite 23 |
| EDITTEXT | *(no alias — double-click a text)* | ✅ Complete. Prefills input with current string; Enter applies (one snapshot), Esc/empty keeps. | `startEditText commands.js:825`, dblclick `main.js:129–133`, apply `:760–766` |

### Explicitly ABSENT (confirmed by grep over `js/` and `index.html`)

**EXPLODE: does not exist** — no alias, no handler, no reference. Likewise absent:
**ARRAY, HATCH, BLOCK/INSERT/WBLOCK, PEDIT, CHAMFER, BREAK, JOIN, LENGTHEN, ELLIPSE,
SPLINE, POLYGON, DONUT, GROUP, PURGE.** The only grep hits for these strings are CSS
`display:block` and an unrelated comment.
(PAN shipped 2026-07-06: `P`/`PAN` hand tool — left-drag pans, grab cursor,
Enter/Esc exits — alongside the existing middle-drag/space-drag. Suite 17.)

---

## 2. Direct manipulation (no command needed)

| Feature | Behavior | Evidence |
|---|---|---|
| Layer panel | ✅ `☰` opens a filtered list of every layer — a client DWG brings 130 and the `<select>` alone is unusable. Filter matches substrings or `*` wildcards; each row shows colour, object count, and per-layer 👁 / 🔒 / 🗑 (delete routes through LAYDEL, so it is one undoable step). "Isolate current" / "Show all" for the common case. Rows are built with `createElement` — a layer name is untrusted text and must never become markup. | `ui.js renderLayerPanel`, `main.js`, suite 11 |
| Click / box select | Click toggles; L→R window (fully inside), R→L crossing (touching). | `clickSelect commands.js` (~`:836`), `boxSelect` (+`selRect` capture), `main.js` mouseup |
| Drag-to-move | Press on selected body, drag. 4-px threshold, one snapshot, Esc aborts. ✥ hover glyph. | `main.js:44–52`, `:88–95`, Esc `:155` |
| Grips | Blue squares on selection: line ends/mid, circle cen/quad, arc ends/mid(radius), pline vertices, text insertion, dim p1/p2/off-slide. Osnap-aware **excluding self**; hot grip red; one snapshot; Esc reverts. | `entGrips entities.js:131`, `applyGrip :154`, wiring `main.js:24–38`, `:54–60`, `:82–87` |
| Repeat last command | Empty Enter at idle. | `commands.js:691` |
| Right-click / Space = Enter | | `main.js:134`, `:142` |

## 3. Entity × subsystem matrix

Six entity types — `line, circle, arc, pline, text, dim` — each implemented in **all seven**
entity subsystems (hit-test, bbox, snaps, grips, translate, mirror, window-test): 7 hits per
type in `js/entities.js` (verified by grep count). Rotate/scale live in `commands.js`
(applyRotate `:388`, applyScale `:404`) and cover all six. Renderer covers all six
(`view.js drawEntity`), dim annotative with world-height text.

**Osnap kinds:** `end, int, mid, cen, quad, perp, tan` active by default; `nea`
(nearest-on-object) implemented but **opt-in** — add `'nea'` to the single config array
`SNAP_PRIORITY` (`js/commands.js`). Highest-priority kind within tolerance wins (distance
breaks ties within a kind); `nea` is computed lazily and only fires when nothing else does.
Static kinds: `entities.js snapCandidates`; dynamic int/perp/tan: `commands.js
applyModifiers`; tan/perp require a rubber base point.
**Absent:** node, extension/parallel tracking.

## 4. Layers

Full set: color, current-layer, add (`main.js layer bar`), **visibility** (hidden = invisible +
unpickable + unsnappable + excluded from TRIM/EXTEND edges — `entities.js findEntityAt`,
`snapCandidates`, `commands.js boxSelect/applyModifiers/trimEntity/extendEntity`),
**lock** (visible + snappable, selection-proof), CHLAYER reassignment.
**Absent:** rename, delete, per-entity color override, lineweights.

## 5. Persistence & interchange

| Feature | State | Evidence |
|---|---|---|
| JSON save/open | ✅ Round-trips everything incl. layer states. | `io.js saveJSON/openJSON` |
| Autosave | ✅ localStorage every 5 s + beforeunload; restore on boot (skips empty saves); NEW clears. Real-browser round-trip verified. | `io.js:38–64`, `main.js:242–243`, boot restore `main.js` boot() |
| DXF export | ✅ **R2000 (AC1015)**, `core/dxfwrite.js`. Carries what R12 could not: HATCH entities, per-layer true colour (420), per-layer and per-entity lineweight (370, snapped to AutoCAD's ladder), LWPOLYLINE with bulges, text rotation, and **real DIMENSION entities** with the anonymous graphics block they need to load at all. Non-ASCII is written as `\U+XXXX` — a Brazilian drawing full of "Iluminação" would otherwise come back as mojibake — and `dxf.js` decodes it on the way in. Round-tripped the 22,177-entity house: **0 errors / 0 fixes under ezdxf audit**, 4.9 MB in 81 ms, all 591 hatches and 292 accented labels intact. | `core/dxfwrite.js`, suite 31 |
| DXF import | ✅ ASCII DXF R12–R2018 via **Open** (`.dxf` dispatched by extension). Two stages: `core/dxf.js` parses group codes into a backend-neutral shape IR (BLOCK/INSERT expanded to world coords incl. rotation/scale/arrays); `core/cadimport.js` maps IR → entities. Native: LINE, CIRCLE, ARC, LWPOLYLINE/POLYLINE, TEXT/ATTRIB (with rotation), MTEXT (split per line, codes stripped, **word-wrapped to its reference rectangle** — 715 of 728 in a real plan carry one, and ignoring it runs legend text out of its table cell), aligned DIMENSION. **Frozen** — marked on the *entity*, keeping its own layer and colour (visible + snappable + hideable with its layer, but click-through): ELLIPSE, SPLINE (rational de Boor), bulged plines, SOLID/TRACE/3DFACE, LEADER. Layer table incl. ACI/true colour, off, locked. `$INSUNITS` sets units and scales coords. Bulge tessellation reuses `geometry.bulgeArc`, so imported and drawn curves share one definition. | `core/dxf.js`, `core/cadimport.js`, `adapters/dom/io.js`, suite 26 |
| DXF import — HATCH | ✅ Boundary paths (polyline incl. bulges) and edge paths (line/arc/elliptic-arc/spline). SOLID fills (by far the commonest — 1044 of 1121 in a real house plan) map to a **flat-wash `solid` material**; mapping them to a line pattern blankets the sheet in diagonals. A **single closed loop becomes a real filled `hatch` entity** on an editable boundary, with the material guessed from the AutoCAD pattern name (`materialFor`, falls back to concrete). Multi-loop hatches (islands) can't be expressed by one `ref`, so they stay frozen outlines — reported separately. Parsing needs an ordered cursor walk because HATCH reuses 10/20/40/50/51/72/73/93/97 between boundary and pattern data. | `core/dxf.js hatchLoops`, suite 26 |
| DXF import — not yet | ⚠️ MLINE, MULTILEADER, ACAD_TABLE, REGION/3DSOLID, WIPEOUT, XLINE/RAY, rotated/angular DIMENSION. Binary DXF refused with a human message. All counted and named back to the user. | `core/dxf.js` SILENT/skip report |
| **DWG import** | ✅ **Rails-side**: browser POSTs bytes to `/api/dwg` and gets the parsed DWG **database as JSON**, which `core/dwgdb.js` maps to the same IR `dxf.js` produces. Verified on a real 330 KB r2013 architect-drawn house: 1133 objects, 144 layers, 86 dimensions, 2 filled hatches, 0 unreadable, ~300 ms. Conversion runs in `packages/dwg` (GPL-3.0) as a **subprocess**, never linked or shipped to the browser. **NOT via `dwg_write_dxf()`** — libredwg's DXF writer dies with `memory access out of bounds` on real drawings whose reader path parses cleanly, so we read the database instead. Model space is imported; paper space (viewports onto it) is not a MiniCAD concept. **Unresolved external references are detected and named** (block-record flag bit 4 with no geometry) — a layout file that xrefs its base drawing otherwise opens as annotation-only and looks broken; suites 26+29 cover it. **The licence boundary is enforced by tests**: suite 27 fails if any engine module references the GPL reader. | `packages/dwg/`, `app/services/dwg_converter.rb`, `Api::DwgController`, `core/dwg.js`, `core/dwgdb.js`, suites 27+29 |
| DWG export | ⚠️ Deferred by decision (2026-08-02): modern DXF ships the same fidelity with no new runtime, and the entity mapping is shared. ACadSharp (MIT, AC1018) remains the route if a `.dwg` extension is ever specifically required — it costs a .NET SDK in the image and a third language in the stack. LibreDWG's writer is r2000-only and reportedly rejected by AutoCAD; the route is ACadSharp (MIT, writes AC1018) as a second subprocess. | — |
| Lineweight | ✅ Imported per layer (DXF group 370 = 1/100 mm; DWG = index into AutoCAD's standard ladder) and per entity, which wins. Stored as real mm in `layer.lw` / `entity.lw`. Paper uses the millimetres directly; screen uses a clamped px ramp (`lwPx`, 1–6 px) so heavy walls stay heavy at any zoom instead of ballooning — AutoCAD's LWDISPLAY behaviour. **Caveat:** most architectural drawings leave everything BYLAYER/default and get their printed weights from a CTB/STB plot-style table keyed on colour, which is an external file not present in the DWG — in the sample house only 9% of objects carry an author-set weight. | `state.js lwOf/lwPx`, `dxf.js lwFromIndex/lwFromHundredths`, suite 26 |
| Performance | ✅ Uniform spatial grid (`core/spatial.js`) behind hit-testing, snapping and rendering, plus viewport culling. On the 22,177-entity house: `findEntityAt` 14.2 → **0.018 ms**, `snapCandidates` 33 → **0.030 ms**, entities drawn per frame 22,177 → **1,341** at room zoom; a mouse move went from ~100 ms to **0.08 ms**. Index rebuilds on a geometry epoch (`state.bumpGeom`, fired by `setEntities`/`snapshot`); between bumps extra candidates are harmless and the only possible misses are the objects being edited, which every query unions in from the selection. | `core/spatial.js`, suite 30 |
| Print / PDF | ✅ **Legibility warnings** (`plotWarnings`) shown live in the dialog and logged on print: text that would land under 1.5 mm, content overflowing the sheet, or content using only a corner. A 690-unit imported site printed at 1:50 fits the page and is still black crumbs — 0.02 mm text under a 0.35 mm pen — and nothing used to say so. PLOT/⌘P → mm-true SVG sheet (white/black print palette, footer strip) in a hidden iframe with real-mm `@page`; browser Save-as-PDF gives a scale-accurate vector PDF. Calibration test page with 100/50 mm bars. All linework is CONTINUOUS today, so the "dashes in mm" requirement is vacuously satisfied — revisit when linetypes exist. | `js/plot.js` (pure), `js/plotui.js`, suites 15–16 |
| Units | ✅ UNITS mm/cm/m (default cm); dim text + readout formatting; persisted in JSON + autosave. | `state.js` units/unitFmt, `geometry.js formatLen`, suite 14 |

## 6. Test coverage map

`tests/run.mjs`, 33 suites / 827 checks, each suite an isolated process driving the real
engine through a stubbed DOM (`tests/stub-dom.mjs`):

| Suite | Covers |
|---|---|
| 01-core | draw commands, coord entry, undo/redo, erase, repeat, DXF skeleton |
| 02-trim-arc | intersection primitives, arc entity ops, 8 TRIM scenarios |
| 03-drag-move | drag-to-move via synthetic mouse events, Esc abort |
| 04-extend-fillet | EXTEND ends/arcs/boundaries, FILLET exact tangent geometry |
| 05-trim-clean-slate | preselection ignored + selection cleared (regression lock) |
| 06-grips | every grip type, self-exclusion snapping, Esc revert, command inertness |
| 07-mirror-stretch-dim | mirror geometry/arc-CCW/erase-source, stretch box semantics, dim entity |
| 08-dimtxt | height remembered/applied/auto, SCALE interaction, DXF height |
| 09-arc-draw | arcFrom3 math, direction, collinear re-prompt |
| 10-autosave-new | tick/restore/clear, NEW confirm, empty-save guard |
| 11-layers-editing | hide/lock filters incl. TRIM edges, CHLAYER, dblclick edit |
| 12-offset-pline | closed/open pline miters, arc offset, collapse + refusal messages |
| 39-boundary | tracer on loose lines / # crossings / overlapping rects / circles (bulge loops, mixed arc+line regions), outside-pick and gap refusals, command flow (undo step, repeat, hatchable result), hidden-layer and text exclusion |
| 26-dxfimport | DXF parse → IR → entities: native mapping, curve tessellation onto FROZEN, HATCH boundary + edge paths (incl. the pattern-section code-reuse trap) and material inference, INSERT scale/rotation/arrays, `$INSUNITS`, layer flags, MTEXT, bad-input refusals, openDXF end-to-end, round-trip of our own export |
| 27-dwg | DWG magic sniff, `dwgToDxf` request shape, every failure path's human message, openDWG end-to-end against a stubbed endpoint, and a **licence guard**: no engine module may reference the GPL converter |
| 31-dxfwrite | R2000 structure and handle uniqueness, true colour / lineweight / hatch / dimension-block emission, `\\U+` escaping both ways, and a full round-trip through our own reader |
| 23c-cmdline | The command line is a contenteditable div, not an `<input>`: markup lock (no name/type/autocomplete, plaintext-only, one non-wrapping line with a min-height), the `value`-over-`textContent` shim, typed commands and coordinates through it, spaces inside a TEXT string, type-anywhere replay, and multi-line paste flattened |
| 30-spatial | Spatial index: 200 probes agreeing with brute force, superset-not-subset queries, mid-drag staleness covered by the selection union, add/move/delete visibility, degenerate inputs, bounded `snapCandidates`, and a sub-ms hit-test assertion at 3600 entities |
| 29-dwgdb | DwgDatabase → IR: every entity type, radian angles, ATTRIB's nested text record, INSERT expansion/arrays/attribs, units-not-rescaled, layer flags, bad input — plus a slice of the real house plan asserting room-sized dimensions and untouched coordinates |
| 28-text-rotation | `rot` across bbox/hit/grips/mirror/ROTATE/SCALE, both renderers' Y-flip sign, DXF group code 50 round-trip, backwards compatibility with pre-rotation saved files |

**Not covered by tests:** pixel output (rendering correctness is eyeballed / Playwright
screenshots), DXF acceptance by third-party CAD (checked with ezdxf ad hoc).

## 7. Known limitations (accepted, documented)

1. FILLET lines-only; SCALE typed-factor-only; ZOOM E/A-only (see §1 table).
2. DIM: aligned style only; DXF decomposition loses "dimension-ness" on re-import.
3. TRIM/EXTEND don't split/extend plines as **targets** (fine as edges/boundaries).
4. Pline offset uses simple miters — extreme acute angles produce long spikes (no miter limit).
5. ES modules require a server for Chrome (`serve.py`, no-cache) or Safari for `file://`.
6. Undo is whole-document JSON snapshots (fine at household scale, O(n) per action).
7. Hiding the *current* layer is allowed (warned in log) — you can draw invisible ink.

## 8. Roadmap

> **Product intent (see CLAUDE.md):** MiniCAD is being built toward a SaaS for solo
> architects — browser-first, DXF-native ("open the DXF a client sent you"). The household
> tool is the incubator, not the destination. This re-tiers DXF import into Tier 1.

### ACI color palette — shipped 2026-08-19 (suite 38)

Layer colors are picked from the numbered **AutoCAD Color Index** (Janaina:
the numbers are the convention — "color 253" IS the light gray). Canonical
256-entry table generated from ezdxf into `core/aci.js` (`aciHex`/`aciOf`/
`aciName`; exact match prefers the classic 1–9 so pure red is "1", never 10).
Dialog in `adapters/dom/colorui.js` (swatch click or typed `COLOR`/`COL`),
laid out like AutoCAD's: 24×10 hue grid + classics 1–9 + grays 250–255, live
number/name readout, true-color input for off-index values. DXF export now
writes each layer's real index in group 62 (negative = off) instead of a flat
±7 — a 253 layer opens as 253 (ezdxf-verified). The importer's approximate
`aciColor` formula in dxf.js still stands for reading foreign files.

### Hatch island detection — shipped 2026-08-19 (suites 22, 31)

Hatching between two loops fills the ring, not the slab (Rachad hit this with an
offset trapezoid). A hatch now carries `holes:[ids]` — every visible closed shape
wholly inside the boundary at placement (`islandsWithin`), rendered even-odd on
canvas and in plot SVG so nested islands alternate AutoCAD-style. Live like the
boundary itself: islands move with their shapes; erasing an island closes its
hole (the hatch survives); COPY/MIRROR remap hole ids; clicking inside a hole
hits the island, not the hatch. HATCH/AREA report net area, islands deducted.
DXF export writes one boundary path per island (outer external|polyline=3,
islands polyline=2; ezdxf 0/0). DXF **import** of multi-loop hatches still
leaves frozen outlines — the IR would need per-loop grouping first.

### Drafting UX parity — shipped 2026-08-18 (suites 34–37)

Driven by side-by-side comparison with AutoCAD 2027 (Rachad's screenshots):

- **Ortho defaults OFF** (AutoCAD's ORTHOMODE=0); it never applies to RECTANG's
  second corner (h/v from corner 1 is precisely the zero-area rectangle).
- **PLINE closes on its own first vertex**: in-progress vertices are endpoint
  snap + tracking candidates (the entity doesn't exist yet, so `snapCandidates`
  can't see them), and landing on the first vertex finishes with `closed:true`
  — the flag HATCH needs. Typed `C` still works; two points never auto-close.
- **Command autocomplete** (`suggestCommands` in core): idle typing lists
  matching commands under the dyn box, one row per command, exact alias first.
  ↑/↓ choose, Tab completes, Enter/Space/right-click run the highlighted row —
  `PLI ⏎` runs PLINE. Suppressed during a command (letters are options there).
- **Angle + length preview on the rubber band**: dashed East-to-line arc with
  the angle boxed at it (whole degrees CCW from East), live length boxed on
  the line. Obeys F12/DYN.
- **Board looks like AutoCAD's dark model space**: background/grid sampled from
  a real screenshot (`BG`/`GRID_*` constants in `adapters/dom/view.js`),
  CURSORSIZE-5 crosshair (5%-of-screen arms, clear pickbox), and a compass
  rose (N/E/S/W + TOP badge) top-right.

### State of play — 2026-08-03

The DWG/DXF import–edit–export loop works end to end on a real
architect-drawn house (`-BASE-HNX-J-R05.dwg`, 22,177 entities). What is worth
knowing before picking this up:

**Not yet verified by a human.** Everything below passed tests and audits, but
nobody has confirmed it in a browser:
- the units prompt on import (`suggestUnits`) and the print-legibility warnings
- the layer panel's per-row 👁 / 🔒 / 🗑 against a 130-layer drawing
- whether the R2000 export opens cleanly in *AutoCAD* (ezdxf audits it clean,
  which is not the same thing)
- the **contenteditable command line** (below) in a real Safari and Chrome:
  that no card is offered, that type-anywhere lands the first character, that
  EDITTEXT prefills with the caret at the end, and that the row does not jump
  when the field empties

**Open, in the order they are worth doing:**
1. ~~**Safari offers saved credit cards on the command line.**~~ ✅ **fixed
   2026-08-03** — the field stopped being an `<input>`. It is a
   `contenteditable="plaintext-only"` div with no name, type or autocomplete;
   nothing about it says "form field", so nothing offers to fill it. `value` is
   a getter/setter over `textContent` defined on the element itself
   (`ui.js asTextField`), so all ~15 call sites — including view.js reaching in
   via `getElementById` — read unchanged. Three things a div does not do for
   free are done by hand: caret to the end after `focus()` (`caretToEnd`,
   otherwise an EDITTEXT prefill types backwards), the type-anywhere keystroke
   replayed into the field, and a multi-line paste flattened to one line. The
   layer filter is still a real `<input>` (it needs `.select()`) and keeps the
   attribute defences plus readonly-until-focus. Suite 23c. **Untested by a
   human in Safari** — that is the whole claim, and it is the one thing the
   tests cannot make.
2. **Six suites carry their own inline DOM stubs** (01–07 era) instead of
   `tests/stub-dom.mjs`. They miss harness improvements and can stay green
   while the app is broken — a `setAttribute` change broke all six at once.
   Consolidate them.
3. Fit-point splines: 8 of 215 in the house have no control points and
   currently render as straight lines through the fit points; they should be
   interpolated.
4. Rotated TEXT is imported but MTEXT attachment-point handling is only
   approximated — wrapped rows may sit low in their cell rather than centred.
5. `public/vite/assets/` accumulates a bundle per build (38 at last count).
   Harmless locally, bloats an image — needs an `--emptyOutDir` or a clean step.

**Rules learned the hard way, all encoded in code or tests now:** never rescale
a drawing on the strength of a header (`INSUNITS` lies); a file may be only an
annotation sheet whose geometry lives in an unresolved xref; frozen-ness is a
property of an object, not a layer to park it on; a layer name from someone
else's file is untrusted text; and **the DWG database is not DXF with different
syntax** — the same concept is flagged differently (LWPOLYLINE closes on 512,
the heavy POLYLINE2D/3D on 1), so a mapper ported across from the DXF reader
can be wrong in a way that still parses, still audits clean, and only shows up
as a shape one segment short of shut.

### Tier 1 — next up
- ~~Print / PDF at scale~~ ✅ **shipped 2026-07-06**: UNITS (mm/cm/m, persisted), PLOT
  dialog (paper/orientation/scale incl. fit-with-displayed-1:N/print window/lineweight/
  mono-vs-colors), pure mm-true SVG renderer (`js/plot.js`), iframe print with real-mm
  `@page`, calibration test page. Suites 14–16.
  **Pending human verification:** physical ruler check of the calibration page and a
  Chrome + Safari print of an A4-landscape 1:50 sheet (see checklist in session report).
- ~~DXF import~~ ✅ **shipped**: R12–R2018 through Open, backend-neutral IR. Suite 26.
- ~~DWG import~~ ✅ **shipped**: `POST /api/dwg` → `packages/dwg` GPL subprocess → the DXF path. Suite 27.
- ~~Rotated TEXT~~ ✅ **shipped**: `rot` on the text entity (optional — absent = horizontal, so
  old drawings load unchanged), a baseline-end rotation grip, ROTATE spins glyphs, DXF code 50. Suite 28.
  LWPOLYLINE bulge now has a native home (pline arc segments, shipped 2026-07-06).
- ~~DXF HATCH export~~ ✅ **shipped 2026-08-19** (a basic writer had landed with the R2000
  work; this made it faithful): per-material user-defined pattern lines (brick opens as
  brick, not ANSI31 — angles/gaps/dashes from `materials.js`, dots as zero-length dashes,
  spacing scaled mm-on-paper → model units at the 1:50 reference), boundary bulges kept
  (group 42; circles as four exact quarter arcs, not 32-gons), material colour on the
  entity (62 nearest-ACI + 420 true colour). ezdxf audit: 0 errors / 0 fixes with all 7
  materials. Round-trips through our importer (`MINICAD_*` names map back; `GREEN` added
  to the pattern→material table). Suite 31.
- ~~OFFSET for curved polylines~~ ✅ **shipped 2026-08-19**: each segment offsets as its own
  primitive (arcs keep centre and orientation, radius ±d; bulges recomputed from final
  endpoints since mitered joints slide along the offset circle). Corners: line/line miters
  unlimited (as before), arc-involved joints trim onto the offset primitives within a 4·d
  miter limit, and unreachable convex corners are bridged with a corner arc of radius d
  about the original vertex. Collapse through an arc's centre refused. Suite 12.
- **Radius + angular dimensions** (`DIMRAD`, `DIMANG`) on the existing dim entity family.
- ~~Tangent + nearest osnap~~ ✅ shipped (TAN default-on; NEA **off by default** —
  tick "Nearest ⧖" in the `OSNAP` dialog — see §3).

### Tier 2 — wants, not needs
- **ARRAY** (rectangular/polar copies).
- ~~Layer delete~~ ✅ shipped (`LAYDEL`, wildcards). **Layer rename**, per-entity color.
- **ZOOM window / previous** (PAN command shipped 2026-07-06).
- SCALE by reference length; FILLET for arcs/plines; CHAMFER.

### Tier 3 — the big one
- ~~**Blocks / symbol library**~~ ✅ **core shipped 2026-08-04**: `BLOCK` (select → base point →
  name, and the selection becomes an insert) and `INSERT` (name → point → scale → angle).
  An `insert` entity references a definition in `state.blocks`; every subsystem answers by
  expanding it (`entities.js blockParts`, memoised per insert). Uniform scale only — a
  non-uniform insert makes ellipses, which this engine cannot hand back as editable objects.
  MIRROR really mirrors (a `mir` flag flips the definition about its own Y axis, the way DXF
  uses a negative X scale), so a mirrored door opens the other way. EXPLODE breaks one back
  into geometry. Definitions travel in the saved doc, the autosave and the Rails adapter.
  Suite 32.
  **Nested blocks land 2026-08-04**: a definition may contain inserts, composed one level at a
  time (`R(p)·M(p)·R(c)·M(c) = R(p ∓ c)·M(p xor c)` — a reflection reverses any rotation applied
  after it), depth-capped at 8 and cycle-guarded, so a block containing itself expands once and
  stops rather than hanging the tab.
  **DXF export writes real BLOCK/INSERT 2026-08-04**: a `BLOCK_RECORD` and a `BLOCK…ENDBLK`
  per definition (contents in the definition's own coordinates, base point in group 10),
  `INSERT` per placement with 41/42/43 and 50; mirroring is a negative X scale, which is where
  the engine's `mir` flag came from. Names are sanitised for DXF and de-duplicated. Nested
  definitions are pulled in transitively — a block written without the block it contains opens
  with a hole in it. Audited: **0 errors / 0 fixes under ezdxf** with nested, mirrored and
  dimensioned content in one file, and the mirrored insert explodes to the same coordinates in
  ezdxf as in MiniCAD. An insert whose definition is missing falls back to flattened geometry.
  **Symbol library shipped 2026-08-04** (`js/core/symbols.js`, picker in `adapters/dom/symbolui.js`):
  16 symbols — doors 700/800/900, windows 600/1000/1500, WC, basin, shower, bath, sink, stove,
  fridge, single and double bed, table, chair, sofa, north arrow. Defined in METRES because
  that is what a door is, and scaled into the drawing's units on first use, so the same symbol
  is 80 in a centimetre drawing and 800 in a millimetre one. A symbol becomes an ordinary
  block in the drawing the moment it is used — editable, explodable, exported like any other.
  Suite 33 checks every entry is real-world sized and carries no layer (so it takes the layer
  you insert it on).
  **Still open:** the symbols are a first pass by someone who is not an architect — worth a
  review by someone who draws plans for a living, especially at 1:50.
- ~~Imported blocks flattened on the way in~~ ✅ **fixed 2026-08-04**: both readers emit block
  definitions in the IR (`blockdefs`) and inserts as references, and `cadimport` maps a
  definition by importing it as a small drawing of its own — same mapping, same freezing, one
  level down. Kept only when the placement is expressible: equal scale magnitudes (signs are
  mirroring, which the engine has) inside a matrix that has not already squashed it. Anything
  else still flattens, so a distorted block arrives as correct loose lines rather than as a
  wrong symbol. Layer `0` inside a definition means "the insert's layer", so it is dropped on
  import and filled in at expansion. On the real house slice: **the same 127 objects of
  geometry, held as 77** — parity asserted exactly, because a definition failing to resolve a
  nested insert shows up as nothing but a slightly smaller number.

### Non-goals (deliberate)
3D, paper space/viewports, xrefs, splines/ellipses, hatching, plot styles — out of scope
for a household tool; revisit only on explicit demand.

## 9. How to verify this document

```
python3 serve.py                 # http://localhost:8000 (no-cache dev server)
node tests/run.mjs               # 33 suites, 827 checks
```
User-facing docs: `guide.html` (beginner manual), `learn.html` (8 animated command movies),
`?` panel in-app. Keep all three in sync with feature changes — and keep **this file** in
sync with reality: cite code, not memory.

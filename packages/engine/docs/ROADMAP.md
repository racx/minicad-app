# MiniCAD — Feature Inventory & Roadmap

**Single source of truth** for what exists, how complete it is, and what comes next.
Evidence-based: every claim below cites `file:line` in the codebase as of commit `536d7c7`.
Verified against the test suite: `node tests/run.mjs` → **16 suites, 278 checks, all passing** (2026-07-06).

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
| DXF export | ✅ R12/AC1009 (`io.js:69`). LINE/CIRCLE/ARC/POLYLINE/TEXT native; **DIM decomposed to 3 LINEs + rotated TEXT** (`io.js:90–99`) — a deliberate simplification (no block defs). Layer off/lock flags exported (`62` negative / `70`=4). ezdxf audit: 0 errors. | `io.js:66–104` |
| DXF import | ❌ Absent. Export is one-way. | — |
| Print / PDF | ✅ PLOT/⌘P → mm-true SVG sheet (white/black print palette, footer strip) in a hidden iframe with real-mm `@page`; browser Save-as-PDF gives a scale-accurate vector PDF. Calibration test page with 100/50 mm bars. All linework is CONTINUOUS today, so the "dashes in mm" requirement is vacuously satisfied — revisit when linetypes exist. | `js/plot.js` (pure), `js/plotui.js`, suites 15–16 |
| Units | ✅ UNITS mm/cm/m (default cm); dim text + readout formatting; persisted in JSON + autosave. | `state.js` units/unitFmt, `geometry.js formatLen`, suite 14 |

## 6. Test coverage map

`tests/run.mjs`, 12 suites / 206 checks, each suite an isolated process driving the real
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

### Tier 1 — next up
- ~~Print / PDF at scale~~ ✅ **shipped 2026-07-06**: UNITS (mm/cm/m, persisted), PLOT
  dialog (paper/orientation/scale incl. fit-with-displayed-1:N/print window/lineweight/
  mono-vs-colors), pure mm-true SVG renderer (`js/plot.js`), iframe print with real-mm
  `@page`, calibration test page. Suites 14–16.
  **Pending human verification:** physical ruler check of the calibration page and a
  Chrome + Safari print of an A4-landscape 1:50 sheet (see checklist in session report).
- **DXF import** (LINE/CIRCLE/ARC/LWPOLYLINE/TEXT subset first) — promoted per product intent.
  LWPOLYLINE bulge now has a native home (pline arc segments, shipped 2026-07-06).
- **DXF HATCH export** (currently hatches stay in the JSON doc only).
- **OFFSET for curved polylines** (arc segments offset to r±d, joint recompute) — the current
  refusal points users at EXPLODE → offset → JOIN.
- **Radius + angular dimensions** (`DIMRAD`, `DIMANG`) on the existing dim entity family.
- ~~Tangent + nearest osnap~~ ✅ shipped (TAN default-on; NEA **off by default** —
  tick "Nearest ⧖" in the `OSNAP` dialog — see §3).

### Tier 2 — wants, not needs
- **ARRAY** (rectangular/polar copies).
- **Layer rename/delete**, per-entity color.
- **ZOOM window / previous** (PAN command shipped 2026-07-06).
- SCALE by reference length; FILLET for arcs/plines; CHAMFER.

### Tier 3 — the big one
- **Blocks / symbol library** (doors, windows, furniture): definitions, insert with
  rotation/scale, grips, DXF BLOCK/INSERT export. This is the feature that turns the
  drafting tool into a floor-planning tool; schedule as its own multi-step project.

### Non-goals (deliberate)
3D, paper space/viewports, xrefs, splines/ellipses, hatching, plot styles — out of scope
for a household tool; revisit only on explicit demand.

## 9. How to verify this document

```
python3 serve.py                 # http://localhost:8000 (no-cache dev server)
node tests/run.mjs               # 12 suites, 206 checks
```
User-facing docs: `guide.html` (beginner manual), `learn.html` (8 animated command movies),
`?` panel in-app. Keep all three in sync with feature changes — and keep **this file** in
sync with reality: cite code, not memory.

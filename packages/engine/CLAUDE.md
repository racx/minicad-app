# MiniCAD

Browser-based 2D CAD. No dependencies, no build step — ES modules served plain.

## Product intent

MiniCAD is being built toward a SaaS for solo architects — browser-first, DXF-native
("open the DXF a client sent you"). The household tool is the incubator, not the
destination. DXF import is therefore Tier 1, not Tier 2 — see docs/ROADMAP.md §8.

## Working rules

- `docs/ROADMAP.md` is the single source of truth for feature status. Cite code, not memory.
- Run `node tests/run.mjs` before and after every engine change (12+ suites; each
  `tests/NN-*.test.mjs` runs in its own process against a stubbed DOM). New feature = new suite.
- Dev server: `python3 serve.py` → http://localhost:8000 (no-cache headers; Chrome caches
  ES modules aggressively otherwise). `file://` works in Safari only.
- Preserve the command-line UX exactly: aliases, right-click = Enter, Space = Enter,
  Esc cancels, empty Enter repeats last command, typed coordinates everywhere.
- End users are non-CAD people; every refusal needs a human message, every feature needs
  guide.html (manual) and, if conceptually hard, learn.html (animated demo) coverage.

## Architecture (one line each)

- `js/state.js` — all shared mutable state; reassignment via set*() helpers (live bindings).
- `js/geometry.js` — pure math. `js/intersect.js` — intersection/tangent/perpendicular queries.
- `js/entities.js` — per-entity ops (hit, bbox, snaps, grips, transforms). Seven types:
  line, circle, arc, pline (straight + bulge-arc segments), text, dim, hatch
  (associative material fill referencing a closed boundary).
- `js/commands.js` — ALIASES map + startCommand/onPoint/handleEnter state machine;
  one snapshot() per user action = one undo step.
- `js/view.js` — canvas render (world Y-up, screen Y-down: arc angles negate).
- `js/io.js` — JSON save/open, localStorage autosave, DXF R12 export.
- `js/materials.js` — hatch material catalog (pure data).
- `js/main.js` — event wiring only.

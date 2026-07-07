# @minicad/engine

Browser-based 2D CAD engine. No dependencies, no build step — ES modules served
plain. Working rules in `CLAUDE.md`; feature status in `docs/ROADMAP.md`.

Layout:

- `js/core/` — DOM-free: geometry, entities, intersections, state, command
  state machine, materials, plot SVG builder, MScript. Core talks to the
  outside only through the sink in `js/core/bus.js`.
- `js/adapters/dom/` — everything that touches the DOM: canvas render, command
  line, dialogs, event wiring, localStorage autosave, downloads.

Standalone: `python3 serve.py` → http://localhost:8000.

## Testing

```bash
node tests/run.mjs
```

Suites run in three tiers (headers printed by the runner):

| Suites | Tier | Rules |
|---|---|---|
| `00` | **boundary gate** | greps `js/core/` for `document.` / `window.` — any hit fails the run |
| `01–23` | **adapter-integration** | boot through `js/adapters/dom/main.js` with `tests/stub-dom.mjs`; assertions read the stubbed DOM. Historical tier — approved to stay as-is. |
| `24+` | **core-direct** | import `js/core/*` straight under plain node — **no fake `document`, no adapters** |

**New test suites default to core-direct.** Only write an adapter-integration
suite when the thing under test *is* adapter wiring (event handling, dialog
DOM, canvas). If a core-direct suite won't import cleanly, that's a core
boundary bug — fix the module, don't add a stub.

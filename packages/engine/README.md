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

## Embedding (the package face)

`@minicad/engine` (the face) is DOM-free — safe under plain node. The DOM
adapter `@minicad/engine/dom` boots the interactive editor and must be imported
in a browser after the engine markup (`index.html`'s `#app`) is in the document.

```js
// node example — no DOM, no stubs
import { createEngine } from '@minicad/engine'

const engine = createEngine()
const result = engine.executeScript(`
  # a hatched room with a door swing
  RECT 0,0 400,300
  LINE 400,80 400,220
  ARC 400,220 330,150 400,80
  HATCH #1 concrete
  AREA #1
`)

if (result.errors.length) {
  for (const e of result.errors) console.error(`line ${e.line}: ${e.msg}`)
} else {
  const ctx = engine.serializeContext()
  console.log(`${ctx.counts.total} entities in ${ctx.units}`)
  console.log(result.logs.find(l => l.text.includes('area'))?.text)
  // scripts are atomic (all-or-nothing) and land as ONE undo entry
}
```

In a browser host: inject `index.html`'s `#app` markup, `import '@minicad/engine/dom'`,
then drive via the same face. See `app/javascript/entrypoints/editor.js` in the
parent repo for the reference host.

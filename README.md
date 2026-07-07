# MiniCAD

Browser 2D CAD for solo architects — a Rails 8.1 SaaS shell around a
zero-dependency drafting engine, in one monorepo.

- **Shell** (this app): auth, dashboard, persistence, AI endpoint. Hotwire +
  Tailwind, minitest.
- **Engine** (`packages/engine`): the drafting board. Plain ES modules, no build
  step, own test harness, standalone-runnable (`python3 packages/engine/serve.py`).
  Consumed by the shell as the npm workspace `@minicad/engine`, bundled by Vite
  into the single editor entrypoint. Engine rules live in
  `packages/engine/CLAUDE.md`; feature status in `packages/engine/docs/ROADMAP.md`.

## Features

### Shell
- **Google-only sign-in** (Devise + OmniAuth, CSRF-safe; password-less
  `Sign in as developer` button in dev/test — no Google credentials needed
  locally). Users carry a `plan` (default `beta`).
- **Drawings dashboard** — title-block cards with plan-set sheet numbers
  (A-001…), create/rename/delete, inline rename via Turbo.
- **Editor mount** — the engine injected verbatim (its own CSS, no Tailwind)
  under a slim adapter bar: explicit save + debounced autosave with a
  "saved HH:MM" indicator, optimistic-lock conflict banner (reload /
  save-as-copy — never a silent overwrite), per-drawing localStorage crash net
  reconciled on boot, server-side history snapshots (≤ every 2 min, newest 50).
- **/try** — anonymous editor, localStorage-only, sign-in nudge.
- **AI commands (stub)** — `POST /api/drawings/:id/ai_commands` returning
  `{status, plan, script, question}`; client validates the MScript shell-side,
  shows a dashed ghost preview, Enter commits (one undo step) / Esc discards.
  Guardrails live now: rack-attack 10/min/user + per-user daily counter
  (`AI_DAILY_LIMIT`, default 200).
- **Landing page** — the drafting board itself as the hero, transitioning to
  tracing-paper content.

### Engine (added on top of the household tool)
- **Object snap dialog** (`OSNAP`/`OS`, F3) — per-marker checkboxes incl.
  Nearest ⧖ (off by default) and alignment tracking; persisted per browser.
- **Arc segments in polylines** — `PL` then `A`/`L` mode switching (tangent
  arcs by endpoint), DXF-style bulge vertices, apex grips, correct snaps,
  trims, prints and DXF export (group 42).
- **JOIN / PEDIT / EXPLODE** — chain touching lines/arcs/plines into polylines
  (loops auto-close); explode polylines back into pieces.
- **HATCH + AREA** — material catalog (concrete, brick, green area, glass,
  wood, water), click inside a closed shape, associative fill + area/perimeter
  readout; `AREA` re-measures anything closed.
- **Dynamic input** (`DYN`, F12) — prompt + live typing riding the crosshair.

## Development

```bash
bin/setup          # deps, db
bin/dev            # server + tailwind watcher → http://localhost:3000
bin/rails db:seed  # demo user (demo@minicad.local) + four MScript-authored demo
                   # drawings (db/seeds/drawings/*.mscript, executed through the
                   # engine face — previews land in tmp/seed-previews/)
bin/ci             # rubocop, audits, boundary gate, minitest, engine suites, builds
npm test -w packages/engine   # engine suites alone
```

`/try` starts first-time visitors on a copy of the demo studio plan — baked
from the same `.mscript` source at build time.

Copy `.env.example` → `.env` for Google OAuth (a **fresh** OAuth client per
app — never reuse another app's secret). Local dev works without it via the
developer sign-in.

No deploy tooling yet by design — `/up` healthcheck and 12-factor ENV are in
place so deployment is config, not surgery.

## Working rules

See `CLAUDE.md` (repo) and `packages/engine/CLAUDE.md` (engine). Short version:
engine keeps working standalone, its suite stays green in isolation, Tailwind
never crosses into the engine, and every engine feature ships with a test
suite, guide.html coverage and a ROADMAP entry.

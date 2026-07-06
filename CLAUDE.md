# MiniCAD App — SaaS shell around the MiniCAD engine

Monorepo: Rails 8.1 shell (auth, dashboard, persistence, AI endpoint) around the
browser CAD engine at `packages/engine` (imported with full git history —
`git log packages/engine` shows it).

## Working rules

- Stage complete = commit hash quoted. Final message of a work session includes
  `git log --oneline -6`.
- Docs produced in a session are committed the same session.
- **Engine boundary (monorepo):** `packages/engine` imports NOTHING from the app;
  the app imports the engine ONLY via its package face (`core/index.js` exports);
  engine changes must keep the engine suite green in isolation
  (`npm test -w packages/engine`). Editor UI in the app is the DOM adapter's
  consumer — Tailwind never crosses into `packages/engine`.
- `packages/engine` stays standalone: its pages (index.html, guide.html,
  learn.html, serve.py) must keep working from inside the package directory, and
  its test suite must run with no Rails/app dependency.
- Stop for review after Stage 2 (auth) and Stage 4 (editor mount).
- No new gems without asking.

## Stack (fixed decisions)

- Rails 8.1, PostgreSQL, minitest.
- Two asset pipelines, on purpose:
  - **Tailwind (tailwindcss-rails) + Hotwire/importmap** serve every shell page
    (dashboard, auth, marketing). Tailwind styles the SHELL only.
  - **Vite (vite_rails)** serves exactly ONE entrypoint —
    `app/javascript/entrypoints/editor.js` — which bundles the engine. The editor
    keeps the engine's own CSS untouched; do not Tailwind-ify engine UI.
- Engine package: npm workspace `@minicad/engine` at `packages/engine`
  (`npm test -w packages/engine` runs its 19+ suites; wired into bin/ci —
  engine failures fail the build).
- No deploy tooling yet (no Kamal, no SSL config) — but keep the `/up` healthcheck
  and 12-factor ENV discipline so deploy later is config, not surgery.

## CI

`bin/ci` (Rails 8.1 CI DSL, `config/ci.rb`): rubocop-rails-omakase, security audits,
minitest, engine suites, and both asset builds (Tailwind + Vite) must pass.

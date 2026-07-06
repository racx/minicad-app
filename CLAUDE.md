# MiniCAD App — SaaS shell around the MiniCAD engine

Rails 8.1 shell (auth, dashboard, persistence, AI endpoint) around the browser CAD
engine that lives in `../minicad` (separate repo).

## Working rules

- Stage complete = commit hash quoted. Final message of a work session includes
  `git log --oneline -6`.
- Docs produced in a session are committed the same session.
- **Engine code is READ-ONLY in this repo** — the `minicad` npm workspace symlinks
  `../minicad`; engine changes go to the engine repo, never through this one.
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
- Engine package: npm workspace `minicad` → `../minicad`
  (`npm test --workspace=minicad` runs its 19+ suites; wired into bin/ci).
- No deploy tooling yet (no Kamal, no SSL config) — but keep the `/up` healthcheck
  and 12-factor ENV discipline so deploy later is config, not surgery.

## CI

`bin/ci` (Rails 8.1 CI DSL, `config/ci.rb`): rubocop-rails-omakase, security audits,
minitest, engine suites, and both asset builds (Tailwind + Vite) must pass.

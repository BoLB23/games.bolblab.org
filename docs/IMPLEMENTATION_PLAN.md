# Implementation plan

This plan is intentionally kept alongside the code so future sessions can see both the intended sequence and the completed foundation.

- [x] Inspect the empty repository and establish the workspace boundaries.
- [x] Create the root npm workspace, local command wrappers, and environment template.
- [x] Scaffold the FastAPI modular monolith with configuration, synchronous SQLAlchemy, Alembic, migrations, seed data, development authentication, and catalog endpoints.
- [x] Create the framework-independent TypeScript game client SDK and its tests.
- [x] Build the React catalog application, including authentication, catalog, game detail, profile, and route states.
- [x] Build the independent vanilla-TypeScript sample game using the SDK.
- [x] Add API, SDK, catalog, and sample-game automated tests.
- [x] Write architecture, ADR, roadmap, future-design, README, and handoff documentation.
- [x] Install dependencies, generate lockfiles, and run migrations, seed idempotency, tests, linting, type checks, and builds.
- [x] Record the actual verification results in `docs/HANDOFF.md`.
- [x] Add platform-level player profiles with validated nickname, haircut, and palette data.
- [x] Add clan roles, server-derived presence, capped game sessions, and aggregated clan playtime.
- [x] Add generic leaderboard definitions/entries, server-side aggregation, stable ranking, and seed boards.
- [x] Expand the SDK and Sample Game with shared-player, session, heartbeat, and sample-score flows.
- [x] Add React routes for My Player, My Clan, and Leaderboards with responsive arcade styling.
- [x] Add Alembic migration, seed fixtures, backend/frontend tests, and the heartbeat design ADR.

## Notes and deviations

The repository started empty. The API remains a separate `uv` project while the browser code uses npm workspaces, as requested. `package-lock.json` and `apps/api/uv.lock` are committed artifacts. The expansion keeps synchronous SQLAlchemy, SQLite/PostgreSQL-compatible schema types, development authentication, and the independent game boundary. A fresh SQLite migration and repeated seed remain idempotent; stale session time is capped rather than inferred from tab lifetime.

## Next milestone

Phase 2 authentication now has a handoff-ready implementation design in
[`PHASE_2_AUTHELIA_OIDC_IMPLEMENTATION_PLAN.md`](PHASE_2_AUTHELIA_OIDC_IMPLEMENTATION_PLAN.md).
It is intentionally a plan only: validate the live Authelia issuer, callback, HTTPS
deployment, client registration, and group policy before implementing it.

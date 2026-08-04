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

## Notes and deviations

The repository started empty. The API remains a separate `uv` project while the browser code uses npm workspaces, as requested. `package-lock.json` and `apps/api/uv.lock` are committed artifacts. A fresh SQLite migration and two consecutive seeds succeeded; the final root test, lint, type-check, and build commands all passed.

# Repository Guidelines

## Project Structure & Module Organization

- `apps/catalog-web/` is the authenticated React 19/Vite catalog. Pages, auth state, components, and Vitest tests live in `src/`; browser assets are in `public/`.
- `apps/api/` is the FastAPI/SQLAlchemy service. Keep routes in `app/api/routes/`, business logic in `app/services/`, schemas in `app/schemas/`, and tests in `tests/`.
- `packages/game-client-sdk/` contains the framework-independent typed client shared by the catalog and games.
- `games/sample-game/` and `games/flappy-mike/` are independent Vite games. Treat `games/flappy-mike/` as a Phaser 4 project.
- `k8s/`, `docker/`, and `scripts/` hold deployment artifacts. Read `docs/HANDOFF.md` and relevant decision records before architectural changes.

## Build, Test, and Development Commands

Run from the repository root:

```bash
npm install             # install Node workspace dependencies
npm run setup           # create .env if needed and sync the API environment
npm run db:migrate      # apply Alembic migrations
npm run db:seed         # idempotently seed local development data
npm run dev             # run API, catalog, and both games
npm run test            # run Pytest and all Vitest suites
npm run lint            # run Ruff and ESLint
npm run typecheck       # run mypy and TypeScript checks
npm run build           # build SDK, catalog, and games
```

## Coding Style & Naming Conventions

Use TypeScript with 2-space indentation and Python with 4 spaces. Follow existing React conventions: `PascalCase` components, `camelCase` functions and variables, and named page exports. Python uses `snake_case`, typed signatures, and Ruff’s 100-character target. Prefer small route handlers that delegate to services. Keep API JSON snake_case; map to camelCase only in SDK-facing types where already established.

## Testing Guidelines

Place API tests in `apps/api/tests/test_*.py`; use descriptive `test_<behavior>` names. Place catalog tests in `apps/catalog-web/src/test/*.test.tsx`. Add a regression test for behavior changes, especially authentication, session ownership, ranking, presence, and persistence. Run focused tests while iterating, then `npm run test`, `npm run lint`, and `npm run typecheck` before handoff.

## Commit, Pull Request & Security Guidelines

Use concise imperative commits, usually `feat:` or `fix:` (for example, `fix: preserve game launch URL paths`). Keep changes scoped. PRs should explain user impact, verification performed, and include screenshots for visible UI changes. Never commit `.env`, session/OIDC secrets, generated local data, or Kubernetes Secret values. Production OIDC requires the documented TLS overlay; do not weaken secure-cookie settings for convenience.

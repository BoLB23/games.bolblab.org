# Lantern Library game platform

A small private browser-game catalog. It currently provides a development-only player picker, a catalog, game detail and profile views, one independent sample game, and a small SDK shared by browser games. Milton Estates is represented only as a disabled coming-soon catalog record; this repository does not copy, move, or modify it.

## Architecture

- `apps/catalog-web` — React/Vite catalog on port 5173.
- `apps/api` — FastAPI modular monolith on port 8000, using synchronous SQLAlchemy sessions.
- `packages/game-client-sdk` — framework-independent typed fetch client used by games.
- `games/sample-game` — standalone vanilla TypeScript/Vite game on port 5174.
- `data` — local SQLite database (ignored by Git).

## Prerequisites and first run

Install a supported Node.js LTS release, npm, Python 3.11+, and [uv](https://docs.astral.sh/uv/). Then run:

```bash
npm install
npm run setup
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run setup` copies `.env.example` to `.env` when needed and runs `uv sync` within `apps/api`. Replace the development `SESSION_SECRET` before using any shared environment. Visit `http://localhost:5173`, choose a development user, and launch Sample Game. API docs are available at `http://127.0.0.1:8000/api/v1/docs` in development.

## Commands

```bash
npm install       # install all browser-workspace dependencies
npm run setup     # create .env if absent and sync the API environment with uv
npm run dev       # API :8000, catalog :5173, sample game :5174
npm run test      # Pytest and Vitest suites
npm run lint      # Ruff and ESLint
npm run typecheck # mypy and TypeScript checks
npm run build     # SDK, catalog, and sample-game production builds
npm run db:migrate
npm run db:seed   # safe to run repeatedly
npm run db:reset  # remove only data/game-platform.db, migrate, then seed
```

The API's `DATABASE_URL=sqlite:///../../data/game-platform.db` is intentionally relative to `apps/api`, where uv commands run. Change it to a PostgreSQL URL for future deployment work; see `docs/future/DATABASE_AND_DEPLOYMENT.md`.

## Internal Kubernetes deployment

The internal deployment is intentionally manual. GitLab CI lints, type-checks,
tests, and builds tagged API and web images for every commit; it does not have
cluster credentials and never deploys. Import or mirror this repository into a
GitLab project with its Container Registry enabled so `.gitlab-ci.yml` can push
its images to `$CI_REGISTRY_IMAGE`. Its runner must permit Docker-in-Docker
(`privileged = true`) for the image job.

The homelab deployment expects the `ceph-block` storage class and the NGINX
ingress class already used by the rest of the cluster. Before the first deploy,
create the session secret without committing it:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl -n bolblab-games create secret generic games-secrets \
  --from-literal=SESSION_SECRET="$(openssl rand -base64 32)"
```

Publish the two images to an image repository that the cluster can pull from,
then deploy the matching tag. GitLab uses the current commit's short SHA. The
script defaults to the GitHub Container Registry convention used by the
homelab and to that same local commit tag:

```bash
scripts/deploy --tag <image-tag>
```

When using GitLab's registry, pass its image base once with
`--image-repo registry.gitlab.example/group/project`; use `--context
<kubectl-context>` when needed.
The app is served at `http://games.int.bolblab.org`. If the existing
`games-int-bolblab-org-tls` secret is present, the deploy script uses it;
otherwise it leaves the ingress HTTP-only.

The API currently keeps SQLite data in a 1 GiB `games-data` PVC and runs its
migrations plus idempotent seed step before startup. This is suitable for the
small internal deployment only; move to PostgreSQL before increasing replicas.

## Current limitations

Catalog routes are private and require the development session. This development login is not production authentication: it has no passwords, public registration, social login, or OIDC implementation. There are no cloud saves, statistics, leaderboards, play sessions, achievements, multiplayer, or Milton Estates integration yet. Those are designed in `docs/future/` and ordered in `docs/ROADMAP.md`.

Read `docs/HANDOFF.md` before continuing implementation.

# Underground Heat Studios

A small private browser-game platform for a handful of longtime friends. It includes a development-only player picker, shared player customization, a clan presence/playtime board, server-ranked leaderboards, one independent sample game, and a framework-independent SDK. Milton Estates remains a disabled coming-soon catalog record; this repository does not copy, move, or modify it.

## Architecture

- `apps/catalog-web` — React/Vite catalog on port 6183.
- `apps/api` — FastAPI modular monolith on port 8001, using synchronous SQLAlchemy sessions.
- `packages/game-client-sdk` — framework-independent typed fetch client used by games.
- `games/sample-game` — standalone vanilla TypeScript/Vite game on port 6184.
- `games/flappy-mike` — standalone Phaser 4 mini-game on port 6185.
- `data` — local SQLite database (ignored by Git).

The authenticated catalog exposes Games, My Player, My Clan, and Leaderboards. Player appearance is stored once per platform user and is returned to games through the SDK. Presence uses a server timestamp refreshed by a periodic browser heartbeat; playtime uses capped game-session heartbeats.

## Prerequisites and first run

Install a supported Node.js LTS release, npm, Python 3.11+, and [uv](https://docs.astral.sh/uv/). Then run:

```bash
npm install
npm run setup
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run setup` copies `.env.example` to `.env` when needed and runs `uv sync` within `apps/api`. Replace the development `SESSION_SECRET` before using any shared environment. Visit `http://localhost:6183`, choose a development user, and launch Sample Game. API docs are available at `http://127.0.0.1:8001/api/v1/docs` in development.

## Google login

Local testing keeps the seeded player picker with `AUTH_MODE=development` and `VITE_AUTH_MODE=development`. Google login is enabled only when **both** values are `oidc`. Configure a Google OAuth **Web application** client with the exact redirect URI `OIDC_CALLBACK_URL` (normally `https://<catalog-host>/api/v1/auth/callback`) and add these server-side values to the deployment secret: `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_TRANSACTION_SECRET`. Set `OIDC_ISSUER=https://accounts.google.com`.

The API owns the authorization-code exchange and validates Google ID tokens; browser JavaScript receives only the platform’s HTTP-only session cookie. Any Google account can create a local player on first sign-in. New accounts start as `peon`; optionally set `OVERLORD_EMAIL` to bootstrap one verified Google email as `overlord`. In production, configuration fails closed unless OIDC is selected, all OIDC values are present, the catalog/redirect use HTTPS, secure cookies are enabled, and the cookie name starts with `__Host-`.

## Commands

```bash
npm install       # install all browser-workspace dependencies
npm run setup     # create .env if absent and sync the API environment with uv
npm run dev       # API :8001, catalog :6183, sample game :6184, FlappyMike :6185
npm run test      # Pytest and Vitest suites
npm run lint      # Ruff and ESLint
npm run typecheck # mypy and TypeScript checks
npm run build     # SDK, catalog, and sample-game production builds
npm run db:migrate
npm run db:seed   # safe to run repeatedly
npm run db:reset  # remove only data/game-platform.db, migrate, then seed
```

The API's `DATABASE_URL=sqlite:///../../data/game-platform.db` is intentionally relative to `apps/api`, where uv commands run. Change it to a PostgreSQL URL for future deployment work; see `docs/future/DATABASE_AND_DEPLOYMENT.md`.

## Core API contracts

All routes below live under `/api/v1` and require the current HTTP-only platform session unless noted otherwise:

- `GET/PUT /me/player` — read or update the current shared player.
- `POST /presence/heartbeat` — record the current browser as recently seen.
- `GET /clan/members` and `GET /clan/members/{user_id}` — render clan members with appearance, role, online state, and aggregated playtime.
- `PATCH /clan/members/{user_id}/role` — overlord-only role changes for another member.
- `POST /games/{game_slug}/sessions`, `POST /game-sessions/{session_id}/heartbeat`, and `POST /game-sessions/{session_id}/end` — server-owned playtime sessions.
- `GET /leaderboards`, `GET /games/{game_slug}/leaderboards`, `GET /leaderboards/{key}`, and `POST /games/{game_slug}/leaderboards/{key}/entries` — definitions, rankings, and authenticated-user submissions.

Leaderboard entries are aggregated server-side using each definition’s `max`, `min`, `latest`, or `sum` rule. A submission never accepts a score-owner user ID; the authenticated session is the owner.

Games use `@bolb23/game-client-sdk`. The main shared methods are `getCurrentPlayer()`, `startGameSession(gameSlug)`, and `submitLeaderboardEntry(gameSlug, input)`. The SDK returns camelCase `PlatformPlayer` data while the API keeps its normal snake_case JSON contract. Independent game repositories install a released version from GitHub Packages; see [`docs/SDK_LOCAL_DEVELOPMENT.md`](docs/SDK_LOCAL_DEVELOPMENT.md).

## Internal Kubernetes deployment

The internal deployment is intentionally manual. GitHub Actions lints,
type-checks, tests, and builds both images for every push and pull request. A
push to `main` also publishes them to GitHub Container Registry (GHCR) with the
commit's short SHA and `latest` tags; it does not have cluster credentials and
never deploys.

The homelab deployment expects the `ceph-block` storage class and the NGINX
ingress class already used by the rest of the cluster. Before the first deploy,
create the session secret without committing it:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl -n bolblab-games create secret generic games-secrets \
  --from-literal=SESSION_SECRET="$(openssl rand -base64 32)"
```

GHCR packages are private by default. Make the published package public for
this internal cluster or configure an image-pull secret before deploying.

After a successful push to `main`, GitHub Actions publishes both images to the
GitHub Container Registry convention used by the homelab. Deploy the matching
current commit's short SHA (the script chooses this by default):

```bash
scripts/deploy --context <kubectl-context> --tag <image-tag>
```

Production OIDC mode is the default and requires an explicit `--context`.
The deploy script does not apply development auth to a cluster. Use `npm run
dev` for local development, or render the explicit development overlay for a
private local cluster. Use `--image-repo <repository>` only when overriding the default
`ghcr.io/bolb23/games.bolblab.org` image base.
The production app is served at `https://games.bolblab.org`; the base manifest
fails closed without the OIDC secret/configuration and TLS secret. For a local
seeded player-picker deployment, render and apply the explicit development
overlay instead:

```bash
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/overlays/development | kubectl apply -f -
```

The API currently keeps SQLite data in a 1 GiB `games-data` PVC and runs its
migrations plus idempotent seed step before startup. This is suitable for the
small internal deployment only; move to PostgreSQL before increasing replicas.

### Production Google OIDC overlay

The default API manifest is production OIDC and fails closed until its required
secret and ConfigMap values are present. Use the explicit
[`k8s/overlays/google-oidc`](k8s/overlays/google-oidc) overlay after TLS is
working; secure `__Host-` cookies require HTTPS.

1. Register a Google OAuth Web application. Its authorized redirect URI must be
   exactly `https://<catalog-host>/api/v1/auth/callback`.
2. The OIDC overlay is already configured for the canonical public HTTPS
   catalog host, `https://games.bolblab.org`.
3. Create `games-secrets` from
   [`k8s/secret.example.yaml`](k8s/secret.example.yaml), supplying
   `SESSION_SECRET`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
   `OIDC_CALLBACK_URL`, `OIDC_TRANSACTION_SECRET`, and `OVERLORD_EMAIL`. Set
   `OVERLORD_EMAIL` to the verified Google address for the intended
   administrator; this repository deliberately supplies only a placeholder. Do
   not commit the resulting Secret or its values. `OIDC_CALLBACK_URL` must use
   the same host as the ConfigMap and the Google client registration.
4. Provide the `games-bolblab-org-tls` ingress TLS secret (for
   `games.bolblab.org`; the exact secret name is intentional) and use a host
   that matches the ingress). Build and publish a web image with its build-time
   mode set to OIDC; Vite variables cannot be changed after the static image is
   built:

   ```bash
   docker build -f docker/web.Dockerfile --build-arg VITE_AUTH_MODE=oidc \
     -t ghcr.io/bolb23/games.bolblab.org/web:<oidc-tag> .
   ```

   Publish API and web images with the same `<oidc-tag>`, then deploy them with:

   ```bash
   scripts/deploy --oidc --tag <oidc-tag>
   ```

`--oidc` refuses to deploy while the TLS secret is absent and applies the OIDC
overlay. The overlay sets `APP_ENV=production`, `AUTH_MODE=oidc`,
`SESSION_COOKIE_NAME=__Host-game_platform_session`,
`SESSION_COOKIE_SECURE=true`, the HTTPS catalog origin, Google issuer, callback
and client secret references, transaction secret, and `OVERLORD_EMAIL`. Its init
container runs migrations only: it does not seed the deterministic development
players into the production OIDC database.

For the exact Google client registration, secret-helper, DNS/TLS, image build,
and rollout sequence for the public `https://games.bolblab.org` host, see
[`docs/GOOGLE_OIDC_DEPLOYMENT.md`](docs/GOOGLE_OIDC_DEPLOYMENT.md).

## Current limitations

Catalog routes are private. The default internal deployment uses the development picker; the production Google OIDC path is available only through its TLS-required overlay. The development login is not production authentication and its deterministic users are test fixtures, not accounts to seed in an OIDC environment. Session time is intentionally approximate and capped between heartbeats; leaderboards are not an anti-cheat system. Cloud saves, achievements, multiplayer, and Milton Estates integration remain future work. The platform uses polling/heartbeats instead of WebSockets or Redis by design; see [`docs/decisions/007-heartbeats-over-realtime.md`](docs/decisions/007-heartbeats-over-realtime.md).

Read `docs/HANDOFF.md` before continuing implementation.

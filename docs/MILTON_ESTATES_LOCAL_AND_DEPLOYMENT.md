# Milton Estates platform integration

Milton Estates remains a separately built and deployed browser game. This
repository owns its platform registration and API boundary; the Milton Estates
repository owns the game and its deployment.

## Local E2E setup

Use `localhost` consistently in browser URLs. Do not mix `localhost` with
`127.0.0.1`, because the API session cookie is scoped to the hostname that
sets it.

| Service | Local URL |
| --- | --- |
| Catalog | `http://localhost:6183` |
| Platform API | `http://localhost:8001/api/v1` |
| Sample Game | `http://localhost:6184` |
| Milton Estates | `http://localhost:5183` |

Copy the following development settings into the root `.env` (or merge them
with the generated development file):

```dotenv
CATALOG_ORIGIN=http://localhost:6183
SAMPLE_GAME_ORIGIN=http://localhost:6184
GAME_CORS_ALLOWED_ORIGINS=http://localhost:5183
MILTON_ESTATES_ORIGIN=http://localhost:5183
MILTON_ESTATES_ENABLED=true
VITE_API_BASE_URL=http://localhost:8001/api/v1
```

Run the migrations and idempotent seed after changing the Milton settings:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Start Milton Estates separately from its own repository on port `5183`. Sign
in at the catalog first, then open Milton directly or use the catalog launch
button. The SDK sends requests with `credentials: 'include'`; the API CORS
allowlist must contain the Milton *origin* exactly (scheme, hostname, and
port—never a URL path).

To keep this work separate from a normal local platform database, point only
the API commands at another ignored SQLite file before migrating and seeding,
for example `DATABASE_URL=sqlite:///../../data/milton-integration.db`. Use the
same value while starting the API process. Do not use `db:reset` against a
database you want to retain.

## Production configuration (prepare only)

The catalog and API share `https://games.bolblab.org`: the catalog is served
from `/` and the API is served from `/api/v1`. Milton is served independently
from `https://games.bolblab.org/games/milton-estates/` and calls the platform API at
`https://games.bolblab.org/api/v1`.

The production API configuration must include:

```dotenv
APP_ENV=production
SESSION_COOKIE_SECURE=true
CATALOG_ORIGIN=https://games.bolblab.org
MILTON_ESTATES_ORIGIN=https://games.bolblab.org
MILTON_ESTATES_LAUNCH_URL=https://games.bolblab.org/games/milton-estates/
MILTON_ESTATES_ENABLED=false
```

Set `MILTON_ESTATES_ENABLED=true` only after the Milton URL, SDK smoke test,
and first leaderboard contract have been verified. `SameSite=Lax` is suitable
for this topology because Milton shares the catalog origin; keep the cookie
host-only and do not broaden it to `.bolblab.org`.

The production catalog image already uses the relative API base URL
`/api/v1`, which keeps catalog-to-API calls same-origin. Its ingress must
route `/api` to the API service before routing `/` to the catalog service.

This does not authorize a production deployment. Development-player login is
not production authentication; complete the planned OIDC and HTTPS acceptance
work before enabling this configuration outside development.

## Acceptance checks

1. Sign in at the catalog and open Milton at `http://localhost:5183`.
2. Confirm the SDK returns the selected shared player.
3. Start a game, verify a Milton play session appears in the platform, and
   verify heartbeats/end events are accepted.
4. Confirm the Sample Game on `http://localhost:6184` still loads and submits
   its existing score.
5. Once the Milton game supplies its explicit leaderboard contract, enable
   the corresponding platform definition and verify a score appears in the
   catalog leaderboard.
6. With no platform session, confirm Milton remains playable offline and
   gives a clear sign-in hint rather than failing gameplay or local saves.

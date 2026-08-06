# Handoff

**Date:** 2026-08-05

## Implemented

Underground Heat Studios now has the player, clan, and leaderboard expansion on top of the existing FastAPI/React/Vite modular monolith. Milton Estates remains a `coming_soon` seed record; its project was not touched.

- `User` stores one of `peon`, `member`, `staff`, or `overlord`, plus `last_seen_at`. Role authorization is centralized in `require_overlord`; an overlord can change another member’s role but cannot change their own through the clan API.
- `PlayerProfile` is separate from auth identity, catalog games, and future per-game saves. Nicknames are trimmed and must be 1–9 characters. Haircut keys and colors are validated against server-owned options.
- `GameSession` stores user, game, start, last heartbeat, end, and credited seconds. The server caps each heartbeat gap at `GAME_SESSION_MAX_GAP_SECONDS` (120 seconds by default) and finalizes stale sessions at that cap.
- `LeaderboardDefinition` is unique by `(game_id, key)`. `LeaderboardEntry` is unique by `(leaderboard_id, user_id)` and applies `max`, `min`, `latest`, or `sum` server-side. Ranking has stable tie handling and returns the current user’s row/rank separately when needed.
- The catalog has `/my-player`, `/clan`, and `/leaderboards`, a reusable layered avatar renderer, role badges, server-derived online indicators, exact timestamp tooltips, time-by-game details, value-aware board formatting, and responsive mobile/desktop styling.
- The Sample Game loads the shared player, starts a game session, heartbeats every 45 seconds, banks `orb-touches`, and ends the session. The framework-independent SDK does not expose internal database models or auth tokens.

## Database and migration

The new Alembic revision is `apps/api/migrations/versions/20260805_02_player_clan_leaderboards.py`. It adds:

- `users.role` and `users.last_seen_at`
- `player_profiles`
- `game_sessions`
- `leaderboard_definitions`
- `leaderboard_entries`

Indexes cover profile ownership, session user/game and heartbeat lookups, definition game/key, entry definition/value, and entry ownership. The schema uses standard SQLAlchemy UUID, JSON, date/time, numeric, and string types for SQLite development and PostgreSQL compatibility.

## API routes

All routes are under `/api/v1` and require the current platform session unless stated otherwise:

| Route | Purpose |
| --- | --- |
| `GET /me/player` | Return or create the current user’s default player profile. |
| `PUT /me/player` | Update only the current user’s validated player fields. |
| `POST /presence/heartbeat` | Record the current user’s last-seen timestamp. |
| `GET /clan/members` | Return all active members with appearance, role, presence, total/per-game playtime, and recent game. |
| `GET /clan/members/{user_id}` | Return one member’s aggregate. |
| `PATCH /clan/members/{user_id}/role` | Overlord-only role update for another active member. |
| `POST /games/{game_slug}/sessions` | Start a play session for an enabled game. |
| `POST /game-sessions/{session_id}/heartbeat` | Credit one capped interval for the owning session. |
| `POST /game-sessions/{session_id}/end` | Close and credit the final capped interval. |
| `GET /leaderboards` | List active boards across visible games. |
| `GET /games/{game_slug}/leaderboards` | List active boards for one game. |
| `GET /leaderboards/{key}` | Return a ranked board; `game_slug` is accepted when a key is ambiguous. |
| `POST /games/{game_slug}/leaderboards/{key}/entries` | Submit a finite, bounded value for the authenticated user only. |

`POST` score requests accept `value` and an optional small JSON `metadata` object. They do not accept a score-owner user ID. The server validates the game, board/game relationship, game leaderboard capability, value bounds, metadata size, and aggregation rule.

## SDK usage

Games can use the SDK without knowing FastAPI, SQLAlchemy, or the authentication provider:

```ts
const player = await sdk.getCurrentPlayer();
const session = await sdk.startGameSession('sample-game');

const heartbeat = window.setInterval(() => void session.heartbeat(), 45_000);
await sdk.submitLeaderboardEntry('sample-game', {
  leaderboardKey: 'orb-touches',
  value: score,
  metadata: { source: 'sample-game' },
});

window.clearInterval(heartbeat);
await session.end();
```

`PlatformPlayer` uses camelCase fields (`userId`, `hairColor`, `tshirtColor`, `pantsColor`, and `shoeColor`) so Phaser, vanilla TypeScript, or another browser framework can consume the result naturally. Authentication remains an HTTP-only cookie boundary.

## Presence and playtime behavior

The catalog sends an immediate presence heartbeat and repeats it every 60 seconds while authenticated. The backend, not the browser, determines online state using `last_seen_at` and `PRESENCE_WINDOW_SECONDS` (120 seconds by default). The clan UI renders both a friendly relative label and the exact timestamp.

Playtime is credited only on session start, heartbeat, and end. Each update credits the elapsed time since the prior heartbeat, capped at `GAME_SESSION_MAX_GAP_SECONDS`. An abandoned session is therefore bounded; when a later session start or clan read encounters an old active session, it is finalized at the cap. This is intentionally approximate and is not a proof of active play.

## Seed data

`seed_database` is idempotent and now creates five development users with all four roles, customized appearances, mixed recent/offline timestamps, sample-game playtime, a Milton Estates history row, two sample-game boards, and seeded entries. Ada Admin is the local `overlord` development user. Re-running the seed updates the deterministic fixture records without duplicating them.

## Verification — passed on 2026-08-05

The focused API suite covers nickname validation, current-user player ownership, presence window behavior, capped abandoned sessions, role authorization, ascending/descending boards, all aggregation modes, client-provided user-ID rejection, and invalid game/board combinations. Frontend tests cover player preview controls and validation, clan indicators, and leaderboard formatting/order. The final root verification passed with:

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

Results: 14 API tests, 5 catalog tests, 1 Sample Game test, and 8 SDK tests passed; Ruff, mypy, all workspace TypeScript checks, and all production builds passed. Fresh SQLite upgrade and upgrade/downgrade checks passed. A local browser smoke check exercised development login, My Player, My Clan, Leaderboards, the responsive mobile layout, and the Sample Game’s three-click session/score/end flow. The API suite emits the existing upstream FastAPI/Starlette TestClient deprecation warning; it does not affect test results.

## Known limitations and next steps

Development authentication is still a user picker and is not production authentication. There are no cloud saves, rate limiting/anti-cheat guarantees, achievements, or Milton Estates integration. Leaderboard definitions are seeded/configured in backend code rather than managed in the UI. Presence and rankings are eventually consistent HTTP reads by design. The rationale for avoiding WebSockets and Redis is in [`docs/decisions/007-heartbeats-over-realtime.md`](decisions/007-heartbeats-over-realtime.md).

The next planned milestone is the prepared Authelia/OIDC implementation. Validate the live issuer, HTTPS callback, client registration, allowed-user group, and admin group before writing that integration; see [`PHASE_2_AUTHELIA_OIDC_IMPLEMENTATION_PLAN.md`](PHASE_2_AUTHELIA_OIDC_IMPLEMENTATION_PLAN.md).

## Read first next session

1. `README.md`
2. `docs/IMPLEMENTATION_PLAN.md`
3. `docs/PHASE_2_AUTHELIA_OIDC_IMPLEMENTATION_PLAN.md`
4. `docs/ARCHITECTURE.md`
5. `docs/decisions/007-heartbeats-over-realtime.md`
6. `apps/api/app/main.py` and `apps/api/app/services/seed.py`

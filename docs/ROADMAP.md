# Roadmap

## 1. Catalog foundation — complete

Entry: empty repository. Completion: private catalog, development auth, independent sample game, SQLite migration/seed, tests, and handoff documentation. This milestone is implemented; final command verification is tracked in `HANDOFF.md`.

## 2. Player, clan, and leaderboard expansion — complete

Entry: stable catalog, game SDK, and development session boundary. Completion: shared player profiles, clan roles/presence/playtime, generic leaderboard aggregation/ranking, responsive platform pages, Sample Game SDK usage, migration/seed data, and automated coverage. This milestone uses HTTP polling and heartbeats; it does not add WebSockets or Redis.

## 3. Authelia/OIDC authentication

Entry: stable catalog API and session boundary. Completion: backend Authorization Code flow, OIDC account linking, secure production cookies, and development-auth removal/disablement strategy.

## 4. PostgreSQL deployment validation

Entry: OIDC design agreed. Completion: migration and integration tests against PostgreSQL, backup/restore rehearsal, and a documented operational configuration.

## 5. Milton Estates integration

Entry: existing game regression baseline. Completion: preserved independent build served through a catalog record and SDK identity read, without changing its LocalStorage saves.

## 6. Cloud saves

Entry: game/version contract. Completion: slot-based optimistic-concurrency saves, limits, LocalStorage migration path, and SDK support.

## 7. Per-game saves and richer statistics

Entry: current platform player/session contracts. Completion: slot-based cloud saves, game-specific profile data, richer statistics, and an SDK save boundary without coupling games to database models.

## 8. Leaderboard hardening and achievements

Entry: current server-side score-submission contract. Completion: pagination, anti-abuse/rate limits, version eligibility, achievements, and richer game-specific boards.

## 9. First real-time multiplayer mini-game

Entry: authoritative game rules and room protocol design. Completion: tested WebSocket lobby/room lifecycle running in one API process.

## 10. Operational deployment and backups

Entry: validated PostgreSQL deployment. Completion: packaging, ingress, secret management, probes, monitoring baseline, and recurring restore tests.

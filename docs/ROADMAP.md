# Roadmap

## 1. Catalog foundation — current

Entry: empty repository. Completion: private catalog, development auth, independent sample game, SQLite migration/seed, tests, and handoff documentation. This milestone is implemented; final command verification is tracked in `HANDOFF.md`.

## 2. Authelia/OIDC authentication

Entry: stable catalog API and session boundary. Completion: backend Authorization Code flow, OIDC account linking, secure production cookies, and development-auth removal/disablement strategy.

## 3. PostgreSQL deployment validation

Entry: OIDC design agreed. Completion: migration and integration tests against PostgreSQL, backup/restore rehearsal, and a documented operational configuration.

## 4. Milton Estates integration

Entry: existing game regression baseline. Completion: preserved independent build served through a catalog record and SDK identity read, without changing its LocalStorage saves.

## 5. Cloud saves

Entry: game/version contract. Completion: slot-based optimistic-concurrency saves, limits, LocalStorage migration path, and SDK support.

## 6. Play sessions and player statistics

Entry: cloud-save identity/game profile model. Completion: durable sessions and honest profile history/statistics.

## 7. Leaderboards and achievements

Entry: server-side score-submission contract. Completion: validated rankings, pagination, replacement rules, achievements, and client display.

## 8. First real-time multiplayer mini-game

Entry: authoritative game rules and room protocol design. Completion: tested WebSocket lobby/room lifecycle running in one API process.

## 9. Operational deployment and backups

Entry: validated PostgreSQL deployment. Completion: packaging, ingress, secret management, probes, monitoring baseline, and recurring restore tests.

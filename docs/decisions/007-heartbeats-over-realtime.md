# ADR 007: HTTP heartbeats for presence and playtime

## Context

Underground Heat Studios is a private collection for fewer than ten friends. The platform needs useful online indicators and honest-enough playtime, but it does not need a shared real-time world or high-volume event fanout.

## Decision

Use ordinary authenticated HTTP requests with periodic heartbeats:

- The catalog posts `/presence/heartbeat` while it is open. The backend considers a member online only when `last_seen_at` is within the configurable two-minute presence window.
- Games start a server-owned `GameSession`, heartbeat it periodically, and explicitly end it. Each update credits only the elapsed interval since the previous heartbeat, capped at the configured maximum gap.
- Clan and leaderboard pages use normal TanStack Query requests and can be refreshed or invalidated after mutations.

Do not add WebSockets, Redis, a message broker, or a separate presence service for this iteration.

## Consequences

This keeps local SQLite development, PostgreSQL compatibility, deployment, testing, and failure behavior straightforward. A crashed tab stops accruing time after the last credible heartbeat, and a missed heartbeat can make a user look offline until the next one arrives. The UI is intentionally eventually consistent within the polling interval. If a future game needs authoritative multiplayer or sub-second event delivery, it should introduce a separate protocol for that game rather than expanding this platform-wide presence mechanism.

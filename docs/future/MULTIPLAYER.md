# Future multiplayer

Add WebSocket handlers under `/ws/v1` only when the first real-time mini-game has authoritative rules defined. Start with one API process and in-memory room state: lobby creation, join codes, presence, ready state, room lifecycle, reconnect grace period, and disconnect cleanup. Persist only durable match results; do not write live movement/state to PostgreSQL.

Clients send versioned, size-limited, rate-limited intent messages; the server owns score, win conditions, and authoritative state. Send state snapshots (and targeted events) back to clients. Proposed envelope: `{version, type, request_id?, payload}`. Define room/game protocol versions and rejection/error messages before implementation. Test joins, invalid codes, ready transitions, reconnects, dropped connections, duplicate messages, authority violations, and message limits.

Introduce Redis only if more than one API process needs room coordination. Non-goals: WebSocket handlers, Redis, durable movement logs, or client-authoritative scores in this foundation.

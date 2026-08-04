# Future saves, statistics, and leaderboards

## Proposed schemas

- `PlayerGameProfile(id, user_id, game_id, created_at, updated_at)` unique on `(user_id, game_id)`.
- `GameSave(id, profile_id, slot_key, game_version, data_json, revision, byte_size, created_at, updated_at)` unique on `(profile_id, slot_key)`; `slot_key` is bounded and `revision` increments on every write.
- `PlaySession(id, user_id, game_id, started_at, ended_at, client_version, metadata_json)` with bounded metadata.
- `Leaderboard(id, game_id, key, title, direction, best_score_only, created_at)` unique on `(game_id, key)` where direction is ascending/descending.
- `Score(id, leaderboard_id, user_id, play_session_id, value, game_version, metadata_json, submitted_at)` with bounded metadata and server-controlled replacement behavior.
- `Achievement(id, game_id, key, title, description)` unique on `(game_id, key)` and `PlayerAchievement(user_id, achievement_id, earned_at)` unique on `(user_id, achievement_id)`.

## Save contract

`GET /games/{slug}/saves`, `GET /games/{slug}/saves/{slot}`, `PUT /games/{slug}/saves/{slot}`. A write includes generic JSON data, game version, and expected revision. Mismatches return HTTP 409 with current revision metadata. Enforce per-save and total-size limits, validate ownership and game access, and keep an opt-in LocalStorage fallback/import migration. SDK methods would be `saves.list/get/put`; they do not exist yet.

## Scores and leaderboards

Proposed: `POST /games/{slug}/sessions`, `POST /games/{slug}/leaderboards/{key}/scores`, and `GET /games/{slug}/leaderboards/{key}?cursor=`. The server defines ascending/descending order, best-score-only replacement, pagination, version eligibility, session association, metadata size limits, and basic plausibility/rate checks. Never let a client choose replacement rules. SDK methods would mirror these endpoints after the server contracts are implemented.

## Non-goals

No generic arbitrary JSON querying, anti-cheat guarantee, implementation of any table or endpoint, or fabricated profile statistics now.

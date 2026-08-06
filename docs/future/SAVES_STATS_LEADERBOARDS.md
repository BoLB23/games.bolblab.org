# Future saves, statistics, and leaderboards

The player profile, play-session, and baseline leaderboard contracts in this note were implemented in the Player/Clan/Leaderboard expansion. The remaining proposals below concern cloud saves, richer per-game statistics, pagination, version eligibility, anti-abuse controls, and achievements.

## Proposed schemas

- `PlayerGameProfile(id, user_id, game_id, created_at, updated_at)` unique on `(user_id, game_id)`.
- `GameSave(id, profile_id, slot_key, game_version, data_json, revision, byte_size, created_at, updated_at)` unique on `(profile_id, slot_key)`; `slot_key` is bounded and `revision` increments on every write.
- `GameSession` now exists as the current bounded session model; a future version may add client/game version metadata if needed.
- `LeaderboardDefinition` and `LeaderboardEntry` now exist as the current definition/aggregate-entry models; a future version may add richer version eligibility and achievement links.
- `Achievement(id, game_id, key, title, description)` unique on `(game_id, key)` and `PlayerAchievement(user_id, achievement_id, earned_at)` unique on `(user_id, achievement_id)`.

## Save contract

`GET /games/{slug}/saves`, `GET /games/{slug}/saves/{slot}`, `PUT /games/{slug}/saves/{slot}`. A write includes generic JSON data, game version, and expected revision. Mismatches return HTTP 409 with current revision metadata. Enforce per-save and total-size limits, validate ownership and game access, and keep an opt-in LocalStorage fallback/import migration. SDK methods would be `saves.list/get/put`; they do not exist yet.

## Scores and leaderboards

Current: `POST /games/{slug}/sessions`, `POST /games/{slug}/leaderboards/{key}/entries`, and `GET /leaderboards/{key}` with an optional game selector/limit. The server defines direction, `max`/`min`/`latest`/`sum` aggregation, metadata size limits, and bounded values. Future hardening should add pagination, version eligibility, session association, rate checks, and stronger plausibility rules. Never let a client choose replacement rules.

## Non-goals

No generic arbitrary JSON querying, anti-cheat guarantee, cloud-save implementation, or fabricated profile statistics now.

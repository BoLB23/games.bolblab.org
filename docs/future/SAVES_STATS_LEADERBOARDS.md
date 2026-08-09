# Future saves, statistics, and leaderboards

The player profile, play-session, and baseline leaderboard contracts in this note were implemented in the Player/Clan/Leaderboard expansion. The remaining proposals below concern cloud saves, richer per-game statistics, pagination, version eligibility, anti-abuse controls, and achievements.

## Proposed schemas

- `PlayerGameProfile(id, user_id, game_id, created_at, updated_at)` unique on `(user_id, game_id)`.
- `GameSave(id, profile_id, slot_key, game_version, data_json, revision, byte_size, created_at, updated_at)` unique on `(profile_id, slot_key)`; `slot_key` is bounded and `revision` increments on every write.
- `GameSession` now exists as the current bounded session model; a future version may add client/game version metadata if needed.
- `LeaderboardDefinition` and `LeaderboardEntry` now exist as the current definition/aggregate-entry models; a future version may add richer version eligibility and achievement links.
- `Achievement(id, game_id, key, title, description)` unique on `(game_id, key)` and `PlayerAchievement(user_id, achievement_id, earned_at)` unique on `(user_id, achievement_id)`.

## Save contract

`GET /games/{slug}/saves`, `GET /games/{slug}/saves/{slot}`, `PUT /games/{slug}/saves/{slot}`, and `DELETE /games/{slug}/saves/{slot}`. The list endpoint returns slot metadata only; the per-slot endpoint returns the payload. A write includes generic JSON game state (for example, quests, progress, inventory, and world state), a game version, a schema version, and an expected revision. Mismatches return HTTP 409 with current revision and update-time metadata so a game can ask the player whether to keep the remote or local state rather than silently overwriting it.

Enforce per-save and total-size limits, validate the authenticated user's ownership and game access, and enable routes only when `supports_cloud_saves` is true. Keep an opt-in LocalStorage cache/import path for offline resilience, but treat the server copy as authoritative after a successful cloud write. SDK methods should be typed and generic: `saves.list(gameSlug)`, `saves.get<T>(gameSlug, slotKey)`, `saves.put<T>(gameSlug, slotKey, input)`, and `saves.delete(gameSlug, slotKey)`.

## SDK integration audit — 2026-08-06

The player, session, and leaderboard contracts are working and were verified by the API, SDK, catalog, and sample-game test suites plus the workspace type checks.

- Games can read the authenticated platform user through `auth.getCurrentUser()`, the shared character appearance through `getCurrentPlayer()`, and the full persisted player profile through `players.getCurrent()`.
- Games can list/read boards with `leaderboards.forGame()` and `leaderboards.get()`, then submit a score with `leaderboards.submit()` or the `submitLeaderboardEntry()` convenience method. The API assigns the score owner from the authenticated cookie and applies the server-owned aggregation rule.
- The sample game proves shared-player rendering, sessions, and score submission, but does not currently read or render leaderboard results. Add that as the reference-game integration when the next SDK change is made.
- `GameLabSDK` is deliberately narrower than the returned client: it currently omits leaderboard reads and the full profile API. Export the full client interface, or expand the facade, so game authors can explicitly type the capabilities they need.
- The convenience `submitLeaderboardEntry()` currently returns `void` even though the underlying endpoint returns the ranked entry. Return that response so games can immediately show a confirmed score and rank.
- Map HTTP 409 to a dedicated SDK `conflict` error code before saves ship; save clients must distinguish a revision conflict from a generic API failure.
- Browser CORS currently names only the catalog and Sample Game origins. Add a configurable allowlist for each independently hosted game before onboarding additional games. Adding save deletion also requires `DELETE` in the allowed methods.

## Recommended implementation sequence

1. Complete the planned Authelia/OIDC authentication milestone before adding persistent player progress. The current development-only player picker is not a durable identity boundary for cloud data.
2. Make the small SDK integration improvements above and update the Sample Game to read/render its board; this gives future games a complete, tested reference.
3. Add the save migration, API service/routes, size and ownership checks, and revision-conflict response.
4. Add the typed SDK save surface and LocalStorage recovery helper, then integrate a versioned save slot into the Sample Game.
5. Test cross-user isolation, disabled-game rejection, slot deletion, payload/total quota limits, revision conflicts, and an old schema migration.

## Scores and leaderboards

Current: `POST /games/{slug}/sessions`, `POST /games/{slug}/leaderboards/{key}/entries`, and `GET /leaderboards/{key}` with an optional game selector/limit. The server defines direction, `max`/`min`/`latest`/`sum` aggregation, metadata size limits, and bounded values. Future hardening should add pagination, version eligibility, session association, rate checks, and stronger plausibility rules. Never let a client choose replacement rules.

## Non-goals

No generic arbitrary JSON querying, anti-cheat guarantee, cloud-save implementation, or fabricated profile statistics now.

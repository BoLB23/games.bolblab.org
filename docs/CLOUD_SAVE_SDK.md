# Cloud-save SDK

Cloud saves are per-player, per-game, named slots. The API accepts arbitrary JSON state but does not interpret it. Each game owns its data schema and migration logic.

## Enable Milton Estates

Cloud saves are off by default, including when Milton Estates itself is enabled. After Milton has an explicit local-save migration/recovery screen, set both values and reseed:

```dotenv
MILTON_ESTATES_ENABLED=true
MILTON_ESTATES_CLOUD_SAVES_ENABLED=true
```

```bash
npm run db:migrate
npm run db:seed
npm run build --workspace @bolb23/game-client-sdk
```

The independent Milton project can consume the SDK as documented in [`SDK_LOCAL_DEVELOPMENT.md`](SDK_LOCAL_DEVELOPMENT.md). Its browser origin must remain in `GAME_CORS_ALLOWED_ORIGINS`.

## Contract

- `GET /games/{slug}/saves` returns slot metadata only.
- `GET /games/{slug}/saves/{slot}` returns the versioned JSON payload.
- `PUT /games/{slug}/saves/{slot}` creates a slot with `expected_revision: null`; later writes must send the revision received from the server.
- `DELETE /games/{slug}/saves/{slot}` removes a slot.

A stale write returns HTTP 409. In the SDK it is a `GamePlatformApiError` with `code === 'conflict'`; its response body in `detail` includes the current server metadata. Do not automatically overwrite it—offer the player a choice between their local copy and the remote one.

The API enforces a 512 KiB default per-save limit and 2 MiB total across one player's slots for one game. Configure `CLOUD_SAVE_MAX_BYTES` and `CLOUD_SAVE_TOTAL_MAX_BYTES` when deployment needs different, bounded limits.

## Milton integration sketch

```ts
import {
  createGamePlatformClient,
  createGameSaveCache,
  GamePlatformApiError,
} from '@bolb23/game-client-sdk';

const gameSlug = 'milton-estates';
const slot = 'primary';
const client = createGamePlatformClient({ apiBaseUrl: 'https://platform.example/api/v1' });
const cache = createGameSaveCache();

async function persist(state: MiltonSaveState, revision: number | null) {
  try {
    const saved = await client.saves.put(gameSlug, slot, {
      data: state,
      gameVersion: BUILD_VERSION,
      schemaVersion: 1,
      expectedRevision: revision,
    });
    cache.write(gameSlug, slot, saved);
    return saved;
  } catch (error) {
    if (error instanceof GamePlatformApiError && error.code === 'conflict') {
      // Show Milton's recoverable local-vs-cloud choice; do not overwrite silently.
    }
    throw error;
  }
}
```

Keep Milton's current LocalStorage save as a separate source until the player completes that migration. `createGameSaveCache()` is deliberately only a cache: it never uploads, merges, or replaces game data by itself.

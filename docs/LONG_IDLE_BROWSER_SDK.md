# Long-idle browser SDK

`@bolb23/game-client-sdk` provides opt-in primitives for tabs that can be hidden, suspended, offline, or left open past their login lifetime. They retain the existing HTTP-only cookie boundary: no SDK API exposes a session or OIDC token to JavaScript.

## Authentication contract

Platform sessions have a fixed `SESSION_TTL_SECONDS` lifetime (eight hours by default). They are **not sliding**: API activity and heartbeats do not extend a session. `GET /auth/session` validates the cookie and safely returns the authenticated user, `expires_at`, and `is_sliding: false`.

Call `client.auth.revalidate()` or `client.revalidateAuthentication()` before visible-tab work. It returns either `authenticated` with that safe metadata, or `reauthentication_required` for a 401. It never starts OIDC, opens a popup, or redirects. Network, timeout, conflict, validation, and API failures still reject as typed `GamePlatformApiError` values.

## What the SDK guarantees

- All fetches retain `credentials: 'include'`, have bounded timeouts, and preserve typed errors.
- `createGameSessionLifecycle()` starts only after revalidation, ends telemetry on `hidden`/`pagehide`, and starts a new server session on return to a visible tab. Calls are serialized and idempotent. A rejected stale session is replaced only after revalidation. The server's existing abandoned-session cap remains authoritative.
- `createDurableGameSave()` writes each pending snapshot to storage before its PUT, serializes/coalesces writes, and only removes a snapshot after confirmed persistence. It retries network/timeout failures with bounded backoff and reconnect/visible signals.
- A lost PUT response is reconciled with a GET. Matching remote data is accepted; different remote data becomes a user-controlled `conflict`, never an overwrite.
- Pending saves and leaderboard events use keys scoped by `userId`, game slug, and (for saves) slot key. Before upload, the manager revalidates and refuses to upload if the current cookie belongs to another player.
- `createDurableLeaderboardOutbox()` persists submissions until accepted, sends an API idempotency key, and retries only network/timeout results. Validation, authorization, and server rejection are surfaced instead of being converted into a success.

## What each game must implement

- Obtain `userId` from an initial successful `auth.revalidate()` and create fresh durable managers for that identity. Call `recoverAfterReauthentication()` after the user completes the game's explicit login UX.
- Render manager state (`dirty`, `saving`, `offline`, `unauthorized`, `failed`, or `conflict`) and offer recovery UI. In particular, `conflict` requires an explicit player choice/merge; the SDK never selects a winner.
- Decide when a save snapshot is stable enough to enqueue, define its game/schema migrations, and ensure the game itself pauses or resumes gameplay appropriately when hidden.
- Keep any game's existing local-save migration UI. Durable delivery does not automatically import, merge, or delete a game's unrelated local state.

## Integration example

```ts
import {
  createDurableGameSave,
  createDurableLeaderboardOutbox,
  createGamePlatformClient,
  createGameSessionLifecycle,
} from '@bolb23/game-client-sdk';

const client = createGamePlatformClient({ apiBaseUrl: 'https://platform.example/api/v1' });
const verified = await client.auth.revalidate();
if (verified.status === 'reauthentication_required') {
  showLoginButton(); // User interaction owns the redirect/login.
} else {
  const userId = verified.session.user.id;
  const play = createGameSessionLifecycle({ client, gameSlug: 'my-game' });
  const save = createDurableGameSave<MySave>({
    client, userId, gameSlug: 'my-game', slotKey: 'primary',
  });
  const events = createDurableLeaderboardOutbox({ client, userId, gameSlug: 'my-game' });

  await play.start();
  save.save({ data: currentState(), gameVersion: BUILD_VERSION, schemaVersion: 2, expectedRevision });
  events.enqueue({ leaderboardKey: 'best-score', value: finalScore });

  // After the user signs in through your explicit UI:
  await save.recoverAfterReauthentication();
  await events.recoverAfterReauthentication();
}
```

Call `dispose()` on durable managers and the lifecycle when the game is torn down. The managers' browser-event callbacks absorb delivery failures into observable state, so games do not need fire-and-forget promise handlers.

## Upgrade notes

Existing `client.saves`, `startGameSession`, `submitLeaderboardEntry`, and `createGameSaveCache` APIs remain available. New reliability behavior is opt-in to avoid surprising uploads from pre-existing LocalStorage.

1. Run `npm run db:migrate` to create `leaderboard_submissions`, then deploy API and SDK together.
2. Replace bespoke visibility heartbeat code with `createGameSessionLifecycle`.
3. Keep normal cloud-save revision handling, but enqueue through `createDurableGameSave` and display `conflict` instead of retrying it.
4. Send leaderboard submissions through `createDurableLeaderboardOutbox`; direct callers that perform their own retries should supply a stable `idempotencyKey` to `submitLeaderboardEntry`.

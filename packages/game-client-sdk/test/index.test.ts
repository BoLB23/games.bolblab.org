import { describe, expect, it, vi } from 'vitest';
import {
  createDurableGameSave,
  createDurableLeaderboardOutbox,
  createGamePlatformClient,
  createGameSaveCache,
  createGameSessionLifecycle,
  GamePlatformApiError,
  type BrowserEventTarget,
  type LocalSaveStorage,
} from '../src/index.js';

const user = { id: '1', display_name: 'Pat', email: null, avatar_url: null, is_admin: false, last_login_at: null };

class Signals implements BrowserEventTarget {
  private listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: () => void): void { this.listeners.get(type)?.delete(listener); }
  emit(type: string): void { this.listeners.get(type)?.forEach((listener) => listener()); }
}

function memoryStorage(): { storage: LocalSaveStorage; values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    },
  };
}

const authenticated = { status: 'authenticated' as const, session: { user: { ...user, needs_player_setup: false, role: 'member' as const, last_seen_at: null }, expiresAt: '2026-08-17T00:00:00Z', isSliding: false as const } };

describe('game client SDK', () => {
  it('normalizes the base URL and includes credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(user), { status: 200 }));
    const client = createGamePlatformClient({ apiBaseUrl: 'http://api.test/api/', fetch });
    await client.auth.getCurrentUser();
    expect(fetch).toHaveBeenCalledWith('http://api.test/api/auth/me', expect.objectContaining({ credentials: 'include' }));
  });

  it('returns typed responses', async () => {
    const client = createGamePlatformClient({ apiBaseUrl: 'http://api.test', fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(user))) });
    await expect(client.auth.getCurrentUser()).resolves.toEqual(user);
  });

  it.each([[401, 'unauthorized'], [404, 'not_found'], [422, 'validation']] as const)('maps HTTP %i', async (status, code) => {
    const client = createGamePlatformClient({ apiBaseUrl: 'http://api.test', fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Nope' }), { status })) });
    await expect(client.auth.getCurrentUser()).rejects.toMatchObject({ status, code } satisfies Partial<GamePlatformApiError>);
  });

  it('maps network failures', async () => {
    const client = createGamePlatformClient({ apiBaseUrl: 'http://api.test', fetch: vi.fn().mockRejectedValue(new Error('offline')) });
    await expect(client.auth.getCurrentUser()).rejects.toMatchObject({ code: 'network' });
  });

  it('maps request timeouts', async () => {
    const fetch = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))));
    const client = createGamePlatformClient({ apiBaseUrl: 'http://api.test', fetch, timeoutMs: 1 });
    await expect(client.auth.getCurrentUser()).rejects.toMatchObject({ code: 'timeout' });
  });

  it('returns reauthentication_required for a cookie that expired in a surviving tab', async () => {
    const client = createGamePlatformClient({
      apiBaseUrl: 'http://api.test',
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Authentication is required' }), { status: 401 })),
    });
    await expect(client.auth.revalidate()).resolves.toMatchObject({ status: 'reauthentication_required', error: { code: 'unauthorized' } });
  });

  it('exposes the shared player, session handle, and leaderboard submission boundary', async () => {
    const profile = { user_id: 'user-1', nickname: 'Pat', haircut: 'fade', hair_color: '#2b1d13', tshirt_color: '#f05a28', pants_color: '#1b2330', shoe_color: '#f5efe4', id: 'profile-1', created_at: '', updated_at: '' };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(profile)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session-1', session_id: 'session-1' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session-1' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session-1' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ entry: {}, rank: 1 })));
    const client = createGamePlatformClient({ apiBaseUrl: 'http://api.test/api', fetch });
    await expect(client.getCurrentPlayer()).resolves.toMatchObject({ userId: 'user-1', hairColor: '#2b1d13' });
    const session = await client.startGameSession('sample-game');
    await session.heartbeat();
    await session.end();
    await client.submitLeaderboardEntry('sample-game', { leaderboardKey: 'orb-touches', value: 4, metadata: { source: 'test' } });
    expect(fetch.mock.calls[1][0]).toBe('http://api.test/api/games/sample-game/sessions');
    expect(JSON.parse(String(fetch.mock.calls[4][1]?.body))).toEqual({ value: 4, metadata: { source: 'test' } });
  });

  it('reads and writes typed cloud saves using explicit revisions', async () => {
    const rawSave = {
      id: 'save-1', slot_key: 'campaign', game_version: '1.2.0', schema_version: 3, revision: 1,
      byte_size: 14, created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z', data: { coins: 42 },
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([rawSave])))
      .mockResolvedValueOnce(new Response(JSON.stringify(rawSave)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...rawSave, revision: 2, data: { coins: 43 } })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createGamePlatformClient({ apiBaseUrl: 'http://api.test', fetch });
    await expect(client.saves.list('milton-estates')).resolves.toMatchObject([{ slotKey: 'campaign', byteSize: 14 }]);
    await expect(client.saves.get<{ coins: number }>('milton-estates', 'campaign')).resolves.toMatchObject({ data: { coins: 42 } });
    await expect(client.saves.put('milton-estates', 'campaign', {
      data: { coins: 43 }, gameVersion: '1.2.1', schemaVersion: 3, expectedRevision: 1,
    })).resolves.toMatchObject({ revision: 2, data: { coins: 43 } });
    await client.saves.delete('milton-estates', 'campaign');
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({
      data: { coins: 43 }, game_version: '1.2.1', schema_version: 3, expected_revision: 1,
    });
    expect(fetch.mock.calls[3][1]).toMatchObject({ method: 'DELETE' });
  });

  it('maps save conflicts and keeps recovery cache opt-in', async () => {
    const client = createGamePlatformClient({
      apiBaseUrl: 'http://api.test',
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { message: 'Save revision conflict', current: null } }), { status: 409 })),
    });
    await expect(client.saves.put('milton-estates', 'campaign', {
      data: { coins: 43 }, gameVersion: '1.2.1', schemaVersion: 3, expectedRevision: 1,
    })).rejects.toMatchObject({ code: 'conflict', status: 409 });

    const values = new Map<string, string>();
    const cache = createGameSaveCache({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
        removeItem: (key) => { values.delete(key); },
      },
    });
    const save = { id: 'save-1', slotKey: 'campaign', gameVersion: '1.0.0', schemaVersion: 1, revision: 1, byteSize: 12, createdAt: '', updatedAt: '', data: { coins: 1 } };
    expect(cache.write('milton-estates', 'campaign', save)).toBe(true);
    expect(cache.read<{ coins: number }>('milton-estates', 'campaign')).toEqual(save);
    expect(cache.remove('milton-estates', 'campaign')).toBe(true);
    expect(cache.read('milton-estates', 'campaign')).toBeNull();
  });

  it('starts a fresh visible game session once after hidden-to-visible events overlap', async () => {
    const events = new Signals();
    const visibility = Object.assign(new Signals(), { hidden: true });
    const sessions = {
      start: vi.fn().mockResolvedValue({ id: 'fresh', session_id: 'fresh' }),
      heartbeat: vi.fn().mockResolvedValue({}),
      end: vi.fn().mockResolvedValue({}),
    };
    const lifecycle = createGameSessionLifecycle({
      client: { auth: { revalidate: vi.fn().mockResolvedValue(authenticated) }, sessions },
      gameSlug: 'sample-game', events, visibility, heartbeatIntervalMs: 60_000,
    });
    await lifecycle.start();
    expect(sessions.start).not.toHaveBeenCalled();
    visibility.hidden = false;
    visibility.emit('visibilitychange');
    await Promise.all([lifecycle.start(), lifecycle.start()]);
    expect(sessions.start).toHaveBeenCalledTimes(1);
    await lifecycle.dispose();
  });

  it('keeps an offline save durable and flushes it after reconnect', async () => {
    const { storage, values } = memoryStorage();
    let online = false;
    const saves = { put: vi.fn().mockResolvedValue({ id: 's', slotKey: 'main', gameVersion: '1', schemaVersion: 1, revision: 1, byteSize: 1, createdAt: '', updatedAt: '', data: { coins: 1 } }), get: vi.fn(), list: vi.fn(), delete: vi.fn() };
    const durable = createDurableGameSave({ client: { auth: { revalidate: vi.fn().mockResolvedValue(authenticated) }, saves }, userId: '1', gameSlug: 'sample-game', slotKey: 'main', storage, online: () => online });
    durable.save({ data: { coins: 1 }, gameVersion: '1', schemaVersion: 1, expectedRevision: null });
    expect(durable.state.status).toBe('offline');
    expect(values.size).toBe(1);
    online = true;
    await durable.flush();
    expect(saves.put).toHaveBeenCalledTimes(1);
    expect(durable.state.status).toBe('saved');
    expect(values.size).toBe(0);
    durable.dispose();
  });

  it('persists a snapshot before an in-flight save can be suspended', async () => {
    const { storage, values } = memoryStorage();
    let resolvePut: ((value: { id: string; slotKey: string; gameVersion: string; schemaVersion: number; revision: number; byteSize: number; createdAt: string; updatedAt: string; data: { coins: number } }) => void) | undefined;
    const put = vi.fn().mockImplementation(() => new Promise((resolve) => { resolvePut = resolve; }));
    const durable = createDurableGameSave({ client: { auth: { revalidate: vi.fn().mockResolvedValue(authenticated) }, saves: { put, get: vi.fn(), list: vi.fn(), delete: vi.fn() } }, userId: '1', gameSlug: 'sample-game', slotKey: 'main', storage });
    durable.save({ data: { coins: 2 }, gameVersion: '1', schemaVersion: 1, expectedRevision: null });
    await Promise.resolve();
    expect(values.size).toBe(1);
    resolvePut?.({ id: 's', slotKey: 'main', gameVersion: '1', schemaVersion: 1, revision: 1, byteSize: 1, createdAt: '', updatedAt: '', data: { coins: 2 } });
    await durable.flush();
    durable.dispose();
  });

  it('reconciles a successful PUT whose response was lost without retrying it', async () => {
    const { storage } = memoryStorage();
    const snapshot = { id: 's', slotKey: 'main', gameVersion: '1', schemaVersion: 1, revision: 2, byteSize: 1, createdAt: '', updatedAt: '', data: { coins: 3 } };
    const saves = { put: vi.fn().mockRejectedValue(new GamePlatformApiError('lost', undefined, 'timeout')), get: vi.fn().mockResolvedValue(snapshot), list: vi.fn(), delete: vi.fn() };
    const durable = createDurableGameSave({ client: { auth: { revalidate: vi.fn().mockResolvedValue(authenticated) }, saves }, userId: '1', gameSlug: 'sample-game', slotKey: 'main', storage });
    durable.save({ data: { coins: 3 }, gameVersion: '1', schemaVersion: 1, expectedRevision: 1 });
    await durable.flush();
    expect(saves.put).toHaveBeenCalledTimes(1);
    expect(durable.state.status).toBe('saved');
    durable.dispose();
  });

  it('leaves revision conflicts under game control and isolates cached saves per user', async () => {
    const { storage } = memoryStorage();
    const conflict = new GamePlatformApiError('conflict', 409, 'conflict');
    const client = { auth: { revalidate: vi.fn().mockResolvedValue(authenticated) }, saves: { put: vi.fn().mockRejectedValue(conflict), get: vi.fn(), list: vi.fn(), delete: vi.fn() } };
    const first = createDurableGameSave({ client, userId: '1', gameSlug: 'sample-game', slotKey: 'main', storage });
    first.save({ data: { coins: 4 }, gameVersion: '1', schemaVersion: 1, expectedRevision: 1 });
    await first.flush();
    expect(first.state.status).toBe('conflict');
    const second = createDurableGameSave({ client, userId: '2', gameSlug: 'sample-game', slotKey: 'main', storage });
    expect(second.state.pending).toBeNull();
    first.dispose();
    second.dispose();
  });

  it('keeps a failed leaderboard event across reload and submits its key exactly once', async () => {
    const { storage } = memoryStorage();
    const input = { leaderboardKey: 'orb-touches', value: 4 };
    const firstClient = { auth: { revalidate: vi.fn().mockResolvedValue(authenticated) }, leaderboards: { submit: vi.fn().mockRejectedValue(new GamePlatformApiError('offline', undefined, 'network')) } };
    const first = createDurableLeaderboardOutbox({ client: firstClient, userId: '1', gameSlug: 'sample-game', storage, maxRetries: 0 });
    const key = first.enqueue(input);
    await first.flush();
    expect(first.state.status).toBe('queued');
    first.dispose();
    const submit = vi.fn().mockResolvedValue({ entry: {}, rank: 1 });
    const second = createDurableLeaderboardOutbox({ client: { auth: { revalidate: vi.fn().mockResolvedValue(authenticated) }, leaderboards: { submit } }, userId: '1', gameSlug: 'sample-game', storage });
    await second.recoverAfterReauthentication();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][1]).toMatchObject({ idempotencyKey: key });
    expect(second.state).toMatchObject({ status: 'accepted', queuedCount: 0 });
    second.dispose();
  });

  it('absorbs background retry failures without unhandled promise rejections', async () => {
    const { storage } = memoryStorage();
    const events = new Signals();
    const outbox = createDurableLeaderboardOutbox({
      client: {
        auth: { revalidate: vi.fn().mockRejectedValue(new GamePlatformApiError('offline', undefined, 'network')) },
        leaderboards: { submit: vi.fn() },
      },
      userId: '1', gameSlug: 'sample-game', storage, events, maxRetries: 0,
    });
    outbox.enqueue({ leaderboardKey: 'orb-touches', value: 1 });
    events.emit('online');
    await Promise.resolve();
    await Promise.resolve();
    expect(outbox.state).toMatchObject({ status: 'queued', queuedCount: 1 });
    outbox.dispose();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createGamePlatformClient, createGameSaveCache, GamePlatformApiError } from '../src/index.js';

const user = { id: '1', display_name: 'Pat', email: null, avatar_url: null, is_admin: false, last_login_at: null };

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
});

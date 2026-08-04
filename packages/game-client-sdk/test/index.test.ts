import { describe, expect, it, vi } from 'vitest';
import { createGamePlatformClient, GamePlatformApiError } from '../src/index.js';

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
});

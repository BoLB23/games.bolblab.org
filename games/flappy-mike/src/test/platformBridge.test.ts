import { describe, expect, it, vi } from 'vitest';
import { GamePlatformApiError, type GamePlatformClient, type LocalSaveStorage } from '@bolb23/game-client-sdk';
import { PlatformBridge } from '../systems/PlatformBridge';

const user = (id: string) => ({ id, display_name: id, email: null, avatar_url: null, is_admin: false, role: 'member' as const, last_login_at: null, last_seen_at: null, needs_player_setup: false });

function storage(values = new Map<string, string>()): LocalSaveStorage {
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
}

function fakeClient(revalidate: () => Promise<unknown>, submit: ReturnType<typeof vi.fn>) {
  return {
    auth: { revalidate },
    sessions: { start: vi.fn().mockResolvedValue({ id: 'session-1', session_id: 'session-1' }), heartbeat: vi.fn().mockResolvedValue({}), end: vi.fn().mockResolvedValue({}) },
    leaderboards: { get: vi.fn().mockResolvedValue({ entries: [] }), submit },
  } as unknown as GamePlatformClient;
}

describe('Flappy Mike platform bridge', () => {
  it('keeps a failed score through reload and recovers it from the durable outbox', async () => {
    const values = new Map<string, string>();
    const auth = vi.fn().mockResolvedValue({ status: 'authenticated', session: { user: user('u1'), expiresAt: '', isSliding: false } });
    const failedSubmit = vi.fn().mockRejectedValue(new GamePlatformApiError('offline', undefined, 'network'));
    const first = new PlatformBridge({ client: fakeClient(auth, failedSubmit), storage: storage(values) });
    await first.refreshIdentity();
    first.recordRun(42);
    await Promise.resolve();
    expect([...values.keys()].some((key) => key.includes('leaderboard-outbox'))).toBe(true);
    await first.dispose();

    const submit = vi.fn().mockResolvedValue({ entry: {}, rank: 1 });
    const second = new PlatformBridge({ client: fakeClient(auth, submit), storage: storage(values) });
    await second.refreshIdentity();
    expect(submit).toHaveBeenCalledWith('flappy-mike', expect.objectContaining({ value: 42, idempotencyKey: expect.any(String) }));
    await second.dispose();
  });

  it('keeps local best thresholds isolated when the authenticated account changes', async () => {
    const values = new Map<string, string>([
      ['game-platform/flappy-mike/best-distance/u1', '10'],
      ['game-platform/flappy-mike/best-distance/u2', '3'],
    ]);
    let current = 'u1';
    const auth = vi.fn().mockImplementation(async () => ({ status: 'authenticated', session: { user: user(current), expiresAt: '', isSliding: false } }));
    const bridge = new PlatformBridge({ client: fakeClient(auth, vi.fn().mockResolvedValue({ entry: {}, rank: 1 })), storage: storage(values) });
    await bridge.refreshIdentity();
    expect(bridge.getBest()).toBe(10);
    current = 'u2';
    await bridge.refreshIdentity();
    expect(bridge.getBest()).toBe(3);
    await bridge.dispose();
  });

  it('does not start a session when disposal races authentication', async () => {
    let release!: (value: unknown) => void;
    const auth = vi.fn().mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const client = fakeClient(auth, vi.fn());
    const bridge = new PlatformBridge({ client, storage: storage() });
    bridge.start();
    const disposing = bridge.dispose();
    release({ status: 'authenticated', session: { user: user('u1'), expiresAt: '', isSliding: false } });
    await disposing;
    await bridge.refreshIdentity();
    expect(client.sessions.start).not.toHaveBeenCalled();
  });
});

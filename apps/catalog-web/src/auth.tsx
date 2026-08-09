import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlatformUser } from '@bolb23/game-client-sdk';
import { client, GamePlatformApiError, logout } from './api';

export const ME_QUERY_KEY = ['me'] as const;
export const PLAYER_QUERY_KEY = (userId: string) => ['player', userId] as const;

const AUTH_SYNC_CHANNEL = 'underground-heat-auth';
const AUTH_SYNC_STORAGE_KEY = 'underground-heat-auth-change';
const GOOGLE_LOGIN_INTENT_KEY = 'underground-heat-google-login-intent';

interface AuthValue {
  user: PlatformUser | null;
  isLoading: boolean;
  refetch: () => Promise<PlatformUser | null>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);

function clearSessionScopedCache(queryClient: ReturnType<typeof useQueryClient>) {
  // Keep the current session query so the UI can immediately react to it. Everything
  // else may have been derived from the account that just lost the cookie.
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] });
}

function notifyOtherTabs() {
  try {
    window.localStorage.setItem(AUTH_SYNC_STORAGE_KEY, String(Date.now()));
    window.localStorage.removeItem(AUTH_SYNC_STORAGE_KEY);
  } catch {
    // Storage can be disabled; BroadcastChannel below remains a best-effort signal.
  }
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
  channel.postMessage({ type: 'session-changed' });
  channel.close();
}

/** Marks the tab that starts the OIDC redirect, so its post-callback load can sync peers. */
export function markGoogleLoginIntent() {
  try { window.sessionStorage.setItem(GOOGLE_LOGIN_INTENT_KEY, '1'); } catch { /* best effort */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ME_QUERY_KEY, queryFn: client.auth.getCurrentUser, retry: false });
  const user = query.error instanceof GamePlatformApiError && query.error.status === 401 ? null : query.data ?? null;
  const { isLoading, refetch: queryRefetch } = query;
  const previousUserId = useRef<string | null | undefined>(undefined);
  const refetch = useCallback(async (): Promise<PlatformUser | null> => {
    const result = await queryRefetch();
    if (result.error instanceof GamePlatformApiError && result.error.status === 401) return null;
    if (result.error) throw result.error;
    return result.data ?? null;
  }, [queryRefetch]);

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== currentUserId) {
      clearSessionScopedCache(queryClient);
    }
    previousUserId.current = currentUserId;
  }, [queryClient, user?.id]);

  useEffect(() => {
    const refresh = () => { void refetch().catch(() => undefined); };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === AUTH_SYNC_STORAGE_KEY) refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', onStorage);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channel?.addEventListener('message', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorage);
      channel?.removeEventListener('message', refresh);
      channel?.close();
    };
  }, [refetch]);

  useEffect(() => {
    if (!user) return;
    try {
      if (window.sessionStorage.getItem(GOOGLE_LOGIN_INTENT_KEY) === '1') {
        window.sessionStorage.removeItem(GOOGLE_LOGIN_INTENT_KEY);
        notifyOtherTabs();
      }
    } catch {
      // A successful session is still usable when sessionStorage is unavailable.
    }
  }, [user]);

  const value = useMemo(() => ({
    user, isLoading, refetch,
    signOut: async () => {
      await logout();
      clearSessionScopedCache(queryClient);
      queryClient.setQueryData(ME_QUERY_KEY, null);
      notifyOtherTabs();
    },
  }), [isLoading, queryClient, refetch, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

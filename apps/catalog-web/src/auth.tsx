import { createContext, useContext, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlatformUser } from '@bolb23/game-client-sdk';
import { client, GamePlatformApiError, logout } from './api';

interface AuthValue { user: PlatformUser | null; isLoading: boolean; refetch: () => Promise<unknown>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['me'], queryFn: client.auth.getCurrentUser, retry: false });
  const user = query.error instanceof GamePlatformApiError && query.error.status === 401 ? null : query.data ?? null;
  const value = useMemo(() => ({
    user, isLoading: query.isLoading, refetch: query.refetch,
    signOut: async () => { await logout(); queryClient.setQueryData(['me'], null); },
  }), [query.isLoading, query.refetch, queryClient, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

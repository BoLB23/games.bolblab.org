import { createGamePlatformClient, GamePlatformApiError } from '@bolb23/game-client-sdk';

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001/api/v1';
export const authMode = import.meta.env.VITE_AUTH_MODE ?? 'development';
export const client = createGamePlatformClient({ apiBaseUrl });
export { GamePlatformApiError };

export interface DevelopmentUser { id: string; display_name: string; email: string | null; is_admin: boolean; role: string }

async function devRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new GamePlatformApiError(`Request failed (${response.status})`, response.status);
  return response.json() as Promise<T>;
}

export const getDevelopmentUsers = () => devRequest<DevelopmentUser[]>('/auth/dev/users');
export const devLogin = (userId: string) => devRequest('/auth/dev/login', { user_id: userId });
export async function logout(): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
  if (!response.ok) throw new GamePlatformApiError(`Logout failed (${response.status})`, response.status);
}
export function googleLoginUrl(returnPath: string): string { return `${apiBaseUrl}/auth/login?next=${encodeURIComponent(returnPath)}`; }

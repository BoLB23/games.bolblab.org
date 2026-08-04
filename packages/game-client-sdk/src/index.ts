export type GameStatus = 'development' | 'playable' | 'coming_soon' | 'hidden';

export interface PlatformUser {
  id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  last_login_at: string | null;
}

export interface PlatformGame {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  description: string;
  cover_image_url: string | null;
  launch_url: string;
  status: GameStatus;
  version: string;
  minimum_players: number;
  maximum_players: number;
  supports_cloud_saves: boolean;
  supports_leaderboards: boolean;
  supports_multiplayer: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export class GamePlatformApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: 'unauthorized' | 'not_found' | 'validation' | 'network' | 'timeout' | 'api',
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'GamePlatformApiError';
  }
}

export interface GamePlatformClientOptions {
  apiBaseUrl: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

function parseErrorDetail(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    return typeof detail === 'string' ? detail : undefined;
  }
  return undefined;
}

export function createGamePlatformClient(options: GamePlatformClientOptions) {
  const baseUrl = options.apiBaseUrl.replace(/\/$/, '');
  const requestFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  async function request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await requestFetch(`${baseUrl}${path}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const body: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
      if (!response.ok) {
        const detail = parseErrorDetail(body);
        const code = response.status === 401 ? 'unauthorized'
          : response.status === 404 ? 'not_found'
          : response.status === 422 ? 'validation' : 'api';
        throw new GamePlatformApiError(detail ?? `Request failed (${response.status})`, response.status, code, body);
      }
      return body as T;
    } catch (error) {
      if (error instanceof GamePlatformApiError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new GamePlatformApiError(`Request timed out after ${timeoutMs}ms`, undefined, 'timeout');
      }
      throw new GamePlatformApiError('Network request failed', undefined, 'network', error);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    auth: { getCurrentUser: () => request<PlatformUser>('/auth/me') },
    games: {
      list: () => request<PlatformGame[]>('/games'),
      getBySlug: (slug: string) => request<PlatformGame>(`/games/${encodeURIComponent(slug)}`),
    },
  };
}

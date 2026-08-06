export type GameStatus = 'development' | 'playable' | 'coming_soon' | 'hidden';
export type ClanRole = 'peon' | 'member' | 'staff' | 'overlord';

export interface PlatformUser {
  id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  role: ClanRole;
  last_login_at: string | null;
  last_seen_at: string | null;
}

export interface PlatformPlayer {
  userId: string;
  nickname: string;
  haircut: string;
  hairColor: string;
  tshirtColor: string;
  pantsColor: string;
  shoeColor: string;
}

export interface PlayerProfileResponse {
  id: string;
  user_id: string;
  nickname: string;
  haircut: string;
  hair_color: string;
  tshirt_color: string;
  pants_color: string;
  shoe_color: string;
  created_at: string;
  updated_at: string;
}

export type PlayerAppearanceResponse = Pick<
  PlayerProfileResponse,
  'nickname' | 'haircut' | 'hair_color' | 'tshirt_color' | 'pants_color' | 'shoe_color'
>;

export interface PlayerUpdateInput {
  nickname?: string;
  haircut?: string;
  hair_color?: string;
  tshirt_color?: string;
  pants_color?: string;
  shoe_color?: string;
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

export interface ClanGamePlaytime {
  game_slug: string;
  game_title: string;
  playtime_seconds: number;
}

export interface PlatformClanMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  nickname: string;
  appearance: PlayerAppearanceResponse;
  role: ClanRole;
  is_online: boolean;
  last_seen_at: string | null;
  total_playtime_seconds: number;
  games: ClanGamePlaytime[];
  most_recent_game: { game_slug: string; game_title: string; played_at: string } | null;
}

export interface GameSessionResponse {
  id: string;
  session_id: string;
  user_id: string;
  game_id: string;
  game_slug: string;
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
  credited_playtime_seconds: number;
}

export interface LeaderboardDefinition {
  id: string;
  game_id: string;
  game_slug: string;
  game_title: string;
  key: string;
  display_name: string;
  description: string;
  mission_key: string | null;
  unit: string;
  sort_direction: 'asc' | 'desc';
  aggregation: 'max' | 'min' | 'latest' | 'sum';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardEntry {
  id: string;
  user_id: string;
  rank: number;
  nickname: string;
  display_name: string;
  role: ClanRole;
  appearance: PlayerAppearanceResponse;
  value: number;
  metadata: Record<string, unknown> | null;
  achieved_at: string;
  submitted_at: string;
}

export interface LeaderboardResponse {
  definition: LeaderboardDefinition;
  entries: LeaderboardEntry[];
  current_user_entry: LeaderboardEntry | null;
  current_user_rank: number | null;
}

export interface SubmitLeaderboardEntryInput {
  leaderboardKey: string;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface GameSessionHandle {
  sessionId: string;
  heartbeat(): Promise<void>;
  end(): Promise<void>;
}

export interface GameLabSDK {
  getCurrentPlayer(): Promise<PlatformPlayer>;
  startGameSession(gameSlug: string): Promise<GameSessionHandle>;
  submitLeaderboardEntry(gameSlug: string, input: SubmitLeaderboardEntryInput): Promise<void>;
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
  if (typeof body !== 'object' || body === null || !('detail' in body)) return undefined;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === 'object' && 'msg' in detail[0]) {
    const message = (detail[0] as { msg: unknown }).msg;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

function toPlatformPlayer(profile: PlayerProfileResponse): PlatformPlayer {
  return {
    userId: profile.user_id,
    nickname: profile.nickname,
    haircut: profile.haircut,
    hairColor: profile.hair_color,
    tshirtColor: profile.tshirt_color,
    pantsColor: profile.pants_color,
    shoeColor: profile.shoe_color,
  };
}

export function createGamePlatformClient(options: GamePlatformClientOptions): GamePlatformClient & GameLabSDK {
  const baseUrl = options.apiBaseUrl.replace(/\/$/, '');
  const requestFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json' };
    const requestInit: RequestInit = {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers,
      signal: controller.signal,
    };
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      requestInit.body = JSON.stringify(init.body);
    }
    try {
      const response = await requestFetch(`${baseUrl}${path}`, requestInit);
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

  const auth = { getCurrentUser: () => request<PlatformUser>('/auth/me') };
  const games = {
    list: () => request<PlatformGame[]>('/games'),
    getBySlug: (slug: string) => request<PlatformGame>(`/games/${encodeURIComponent(slug)}`),
    leaderboards: (slug: string) => request<LeaderboardDefinition[]>(`/games/${encodeURIComponent(slug)}/leaderboards`),
  };
  const players = {
    getCurrent: () => request<PlayerProfileResponse>('/me/player'),
    update: (input: PlayerUpdateInput) => request<PlayerProfileResponse>('/me/player', { method: 'PUT', body: input }),
  };
  const presence = {
    heartbeat: () => request<{ online: boolean; last_seen_at: string }>('/presence/heartbeat', { method: 'POST' }),
  };
  const clan = {
    list: () => request<PlatformClanMember[]>('/clan/members'),
    getMember: (userId: string) => request<PlatformClanMember>(`/clan/members/${encodeURIComponent(userId)}`),
    updateRole: (userId: string, role: ClanRole) => request<PlatformClanMember>(`/clan/members/${encodeURIComponent(userId)}/role`, { method: 'PATCH', body: { role } }),
  };
  const sessions = {
    start: (gameSlug: string) => request<GameSessionResponse>(`/games/${encodeURIComponent(gameSlug)}/sessions`, { method: 'POST' }),
    heartbeat: (sessionId: string) => request<GameSessionResponse>(`/game-sessions/${encodeURIComponent(sessionId)}/heartbeat`, { method: 'POST' }),
    end: (sessionId: string) => request<GameSessionResponse>(`/game-sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST' }),
  };
  const leaderboards = {
    list: () => request<LeaderboardDefinition[]>('/leaderboards'),
    forGame: (gameSlug: string) => games.leaderboards(gameSlug),
    get: (leaderboardKey: string, gameSlug?: string, limit = 25) => {
      const query = new URLSearchParams({ limit: String(limit) });
      if (gameSlug) query.set('game_slug', gameSlug);
      return request<LeaderboardResponse>(`/leaderboards/${encodeURIComponent(leaderboardKey)}?${query.toString()}`);
    },
    submit: (gameSlug: string, input: SubmitLeaderboardEntryInput) => request<{ entry: LeaderboardEntry; rank: number }>(`/games/${encodeURIComponent(gameSlug)}/leaderboards/${encodeURIComponent(input.leaderboardKey)}/entries`, { method: 'POST', body: { value: input.value, metadata: input.metadata } }),
  };

  const client = {
    auth,
    games,
    players,
    presence,
    clan,
    sessions,
    leaderboards,
    getCurrentPlayer: async () => toPlatformPlayer(await players.getCurrent()),
    startGameSession: async (gameSlug: string): Promise<GameSessionHandle> => {
      const started = await sessions.start(gameSlug);
      const sessionId = started.session_id || started.id;
      return {
        sessionId,
        heartbeat: async () => { await sessions.heartbeat(sessionId); },
        end: async () => { await sessions.end(sessionId); },
      };
    },
    submitLeaderboardEntry: async (gameSlug: string, input: SubmitLeaderboardEntryInput) => {
      await leaderboards.submit(gameSlug, input);
    },
  };
  return client;
}

interface GamePlatformClient {
  auth: { getCurrentUser: () => Promise<PlatformUser> };
  games: {
    list: () => Promise<PlatformGame[]>;
    getBySlug: (slug: string) => Promise<PlatformGame>;
    leaderboards: (slug: string) => Promise<LeaderboardDefinition[]>;
  };
  players: {
    getCurrent: () => Promise<PlayerProfileResponse>;
    update: (input: PlayerUpdateInput) => Promise<PlayerProfileResponse>;
  };
  presence: { heartbeat: () => Promise<{ online: boolean; last_seen_at: string }> };
  clan: {
    list: () => Promise<PlatformClanMember[]>;
    getMember: (userId: string) => Promise<PlatformClanMember>;
    updateRole: (userId: string, role: ClanRole) => Promise<PlatformClanMember>;
  };
  sessions: {
    start: (gameSlug: string) => Promise<GameSessionResponse>;
    heartbeat: (sessionId: string) => Promise<GameSessionResponse>;
    end: (sessionId: string) => Promise<GameSessionResponse>;
  };
  leaderboards: {
    list: () => Promise<LeaderboardDefinition[]>;
    forGame: (gameSlug: string) => Promise<LeaderboardDefinition[]>;
    get: (leaderboardKey: string, gameSlug?: string, limit?: number) => Promise<LeaderboardResponse>;
    submit: (gameSlug: string, input: SubmitLeaderboardEntryInput) => Promise<{ entry: LeaderboardEntry; rank: number }>;
  };
}

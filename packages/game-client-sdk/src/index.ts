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
  /** True until the player has saved their initial character. */
  needs_player_setup: boolean;
}

/** Metadata from the HTTP-only platform session. No credential is exposed to JavaScript. */
export interface PlatformSessionStatus {
  user: PlatformUser;
  expiresAt: string;
  /** Platform sessions have a fixed lifetime and are not extended by requests. */
  isSliding: false;
}

export type AuthenticationRevalidation =
  | { status: 'authenticated'; session: PlatformSessionStatus }
  | { status: 'reauthentication_required'; error: GamePlatformApiError };

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
  /** Required for callers that may retry a mutation after an ambiguous result. */
  idempotencyKey?: string;
}

export interface GameSaveMetadata {
  id: string;
  slotKey: string;
  gameVersion: string;
  schemaVersion: number;
  revision: number;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface GameSave<T> extends GameSaveMetadata {
  data: T;
}

export interface PutGameSaveInput<T> {
  data: T;
  gameVersion: string;
  schemaVersion: number;
  /** Use null only when creating a slot; use the last read revision to update it. */
  expectedRevision: number | null;
}

export interface CloudSaveClient {
  list(gameSlug: string): Promise<GameSaveMetadata[]>;
  get<T>(gameSlug: string, slotKey: string): Promise<GameSave<T>>;
  put<T>(gameSlug: string, slotKey: string, input: PutGameSaveInput<T>): Promise<GameSave<T>>;
  delete(gameSlug: string, slotKey: string): Promise<void>;
}

export interface LocalSaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GameSaveCache {
  key(gameSlug: string, slotKey: string): string;
  read<T>(gameSlug: string, slotKey: string): GameSave<T> | null;
  write<T>(gameSlug: string, slotKey: string, save: GameSave<T>): boolean;
  remove(gameSlug: string, slotKey: string): boolean;
}

export interface GameSessionHandle {
  sessionId: string;
  heartbeat(): Promise<void>;
  end(): Promise<void>;
}

export interface GameLabSDK {
  getCurrentPlayer(): Promise<PlatformPlayer>;
  revalidateAuthentication(): Promise<AuthenticationRevalidation>;
  startGameSession(gameSlug: string): Promise<GameSessionHandle>;
  submitLeaderboardEntry(gameSlug: string, input: SubmitLeaderboardEntryInput): Promise<{ entry: LeaderboardEntry; rank: number }>;
  saves: CloudSaveClient;
}

export class GamePlatformApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: 'unauthorized' | 'not_found' | 'validation' | 'conflict' | 'network' | 'timeout' | 'api',
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
  if (typeof detail === 'object' && detail !== null && 'message' in detail) {
    const message = (detail as { message: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === 'object' && 'msg' in detail[0]) {
    const message = (detail[0] as { msg: unknown }).msg;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

function toGameSaveMetadata(save: {
  id: string;
  slot_key: string;
  game_version: string;
  schema_version: number;
  revision: number;
  byte_size: number;
  created_at: string;
  updated_at: string;
}): GameSaveMetadata {
  return {
    id: save.id,
    slotKey: save.slot_key,
    gameVersion: save.game_version,
    schemaVersion: save.schema_version,
    revision: save.revision,
    byteSize: save.byte_size,
    createdAt: save.created_at,
    updatedAt: save.updated_at,
  };
}

function toGameSave<T>(save: {
  data: T;
  id: string;
  slot_key: string;
  game_version: string;
  schema_version: number;
  revision: number;
  byte_size: number;
  created_at: string;
  updated_at: string;
}): GameSave<T> {
  return { ...toGameSaveMetadata(save), data: save.data };
}

/**
 * Provides opt-in LocalStorage recovery without automatically uploading or
 * overwriting cloud state. Games should let a player resolve stale copies.
 */
export function createGameSaveCache(options: { storage?: LocalSaveStorage; keyPrefix?: string } = {}): GameSaveCache {
  const storage = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  const keyPrefix = options.keyPrefix ?? '@game-platform/cloud-save';
  const key = (gameSlug: string, slotKey: string) => `${keyPrefix}/${encodeURIComponent(gameSlug)}/${encodeURIComponent(slotKey)}`;
  return {
    key,
    read: <T>(gameSlug: string, slotKey: string): GameSave<T> | null => {
      if (!storage) return null;
      try {
        const raw = storage.getItem(key(gameSlug, slotKey));
        return raw === null ? null : JSON.parse(raw) as GameSave<T>;
      } catch {
        return null;
      }
    },
    write: <T>(gameSlug: string, slotKey: string, save: GameSave<T>): boolean => {
      if (!storage) return false;
      try {
        storage.setItem(key(gameSlug, slotKey), JSON.stringify(save));
        return true;
      } catch {
        return false;
      }
    },
    remove: (gameSlug: string, slotKey: string): boolean => {
      if (!storage) return false;
      try {
        storage.removeItem(key(gameSlug, slotKey));
        return true;
      } catch {
        return false;
      }
    },
  };
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
          : response.status === 422 ? 'validation'
          : response.status === 409 ? 'conflict' : 'api';
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

  const auth = {
    getCurrentUser: () => request<PlatformUser>('/auth/me'),
    revalidate: async (): Promise<AuthenticationRevalidation> => {
      try {
        const response = await request<{ user: PlatformUser; expires_at: string; is_sliding: boolean }>('/auth/session');
        return {
          status: 'authenticated',
          session: { user: response.user, expiresAt: response.expires_at, isSliding: false },
        };
      } catch (error) {
        if (error instanceof GamePlatformApiError && error.code === 'unauthorized') {
          return { status: 'reauthentication_required', error };
        }
        throw error;
      }
    },
  };
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
    submit: (gameSlug: string, input: SubmitLeaderboardEntryInput) => request<{ entry: LeaderboardEntry; rank: number }>(`/games/${encodeURIComponent(gameSlug)}/leaderboards/${encodeURIComponent(input.leaderboardKey)}/entries`, { method: 'POST', body: {
      value: input.value,
      metadata: input.metadata,
      idempotency_key: input.idempotencyKey,
    } }),
  };
  const saves: CloudSaveClient = {
    list: async (gameSlug) => {
      const response = await request<Array<{
        id: string; slot_key: string; game_version: string; schema_version: number; revision: number;
        byte_size: number; created_at: string; updated_at: string;
      }>>(`/games/${encodeURIComponent(gameSlug)}/saves`);
      return response.map(toGameSaveMetadata);
    },
    get: async <T>(gameSlug: string, slotKey: string): Promise<GameSave<T>> => {
      const response = await request<{
        data: T; id: string; slot_key: string; game_version: string; schema_version: number; revision: number;
        byte_size: number; created_at: string; updated_at: string;
      }>(`/games/${encodeURIComponent(gameSlug)}/saves/${encodeURIComponent(slotKey)}`);
      return toGameSave(response);
    },
    put: async <T>(gameSlug: string, slotKey: string, input: PutGameSaveInput<T>): Promise<GameSave<T>> => {
      const response = await request<{
        data: T; id: string; slot_key: string; game_version: string; schema_version: number; revision: number;
        byte_size: number; created_at: string; updated_at: string;
      }>(`/games/${encodeURIComponent(gameSlug)}/saves/${encodeURIComponent(slotKey)}`, {
        method: 'PUT',
        body: {
          data: input.data,
          game_version: input.gameVersion,
          schema_version: input.schemaVersion,
          expected_revision: input.expectedRevision,
        },
      });
      return toGameSave(response);
    },
    delete: async (gameSlug: string, slotKey: string): Promise<void> => {
      await request<void>(`/games/${encodeURIComponent(gameSlug)}/saves/${encodeURIComponent(slotKey)}`, { method: 'DELETE' });
    },
  };

  const client = {
    auth,
    games,
    players,
    presence,
    clan,
    sessions,
    leaderboards,
    saves,
    getCurrentPlayer: async () => toPlatformPlayer(await players.getCurrent()),
    revalidateAuthentication: () => auth.revalidate(),
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
      return leaderboards.submit(gameSlug, input);
    },
  };
  return client;
}

export interface GamePlatformClient {
  auth: {
    getCurrentUser: () => Promise<PlatformUser>;
    revalidate: () => Promise<AuthenticationRevalidation>;
  };
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
  saves: CloudSaveClient;
}

export type DurableSyncStatus = 'dirty' | 'saving' | 'saved' | 'offline' | 'unauthorized' | 'failed' | 'conflict';

export interface DurableSaveState<T> {
  status: DurableSyncStatus;
  pending: PutGameSaveInput<T> | null;
  saved: GameSave<T> | null;
  error?: GamePlatformApiError;
  conflict?: GamePlatformApiError;
}

export interface BrowserEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface DurableSaveOptions<T> {
  client: { auth: Pick<GamePlatformClient['auth'], 'revalidate'>; saves: CloudSaveClient };
  /** Obtain this from auth.revalidate; it is used to isolate browser storage per account. */
  userId: string;
  gameSlug: string;
  slotKey: string;
  storage?: LocalSaveStorage;
  keyPrefix?: string;
  initialSave?: GameSave<T> | null;
  maxRetries?: number;
  retryBaseMs?: number;
  online?: () => boolean;
  events?: BrowserEventTarget;
  visibility?: { hidden: boolean } & BrowserEventTarget;
}

interface PendingSave<T> extends PutGameSaveInput<T> {
  attempts: number;
}

function defaultStorage(): LocalSaveStorage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}

function defaultEvents(): BrowserEventTarget | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

function defaultVisibility(): ({ hidden: boolean } & BrowserEventTarget) | undefined {
  return typeof document === 'undefined' ? undefined : document;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function safelyRead<T>(storage: LocalSaveStorage | undefined, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safelyWrite(storage: LocalSaveStorage | undefined, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safelyRemove(storage: LocalSaveStorage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage can be disabled or full. The in-memory pending write remains intact.
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * Opt-in, account-scoped durable save delivery. A snapshot is persisted before
 * every PUT and is never removed until a server response (or reconciliation)
 * proves that exact snapshot was stored.
 */
export class DurableGameSave<T> {
  private readonly client: { auth: Pick<GamePlatformClient['auth'], 'revalidate'>; saves: CloudSaveClient };
  private readonly storage: LocalSaveStorage | undefined;
  private readonly key: string;
  private readonly online: () => boolean;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly listeners = new Set<(state: DurableSaveState<T>) => void>();
  private pending: PendingSave<T> | null;
  private saved: GameSave<T> | null;
  private stateValue: DurableSaveState<T>;
  private running: Promise<DurableSaveState<T>> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onRetrySignal = () => { void this.flush(); };
  private readonly onVisible = () => { if (!this.visibility?.hidden) void this.flush(); };
  private readonly events?: BrowserEventTarget;
  private readonly visibility?: ({ hidden: boolean } & BrowserEventTarget);

  constructor(private readonly options: DurableSaveOptions<T>) {
    this.client = options.client;
    this.storage = options.storage ?? defaultStorage();
    const prefix = options.keyPrefix ?? '@game-platform/durable-save/v1';
    this.key = `${prefix}/${encodeURIComponent(options.userId)}/${encodeURIComponent(options.gameSlug)}/${encodeURIComponent(options.slotKey)}`;
    this.pending = safelyRead<PendingSave<T>>(this.storage, this.key);
    this.saved = options.initialSave ?? null;
    this.online = options.online ?? isOnline;
    this.maxRetries = options.maxRetries ?? 5;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.events = options.events ?? defaultEvents();
    this.visibility = options.visibility ?? defaultVisibility();
    this.stateValue = { status: this.pending ? 'dirty' : 'saved', pending: this.pending, saved: this.saved };
    this.events?.addEventListener('online', this.onRetrySignal);
    this.visibility?.addEventListener('visibilitychange', this.onVisible);
  }

  get state(): DurableSaveState<T> { return this.stateValue; }

  subscribe(listener: (state: DurableSaveState<T>) => void): () => void {
    this.listeners.add(listener);
    listener(this.stateValue);
    return () => this.listeners.delete(listener);
  }

  /** Persists locally first. It intentionally does not reject due to transient delivery failures. */
  save(input: PutGameSaveInput<T>): DurableSaveState<T> {
    this.pending = { ...input, attempts: 0 };
    safelyWrite(this.storage, this.key, this.pending);
    this.setState({ status: this.online() ? 'dirty' : 'offline', pending: this.pending, saved: this.saved });
    void this.flush();
    return this.stateValue;
  }

  /** Call after a visible-tab revalidation or a user-completed interactive login. */
  async recoverAfterReauthentication(): Promise<DurableSaveState<T>> {
    const authentication = await this.client.auth.revalidate();
    if (authentication.status === 'reauthentication_required') {
      this.setState({ status: 'unauthorized', pending: this.pending, saved: this.saved, error: authentication.error });
      return this.stateValue;
    }
    if (authentication.session.user.id !== this.options.userId) {
      const error = new GamePlatformApiError('Pending save belongs to a different player', undefined, 'unauthorized');
      this.setState({ status: 'unauthorized', pending: this.pending, saved: this.saved, error });
      return this.stateValue;
    }
    return this.flush(true);
  }

  async flush(alreadyRevalidated = false): Promise<DurableSaveState<T>> {
    if (this.running) {
      return this.running.then(() => this.stateValue.status === 'offline' && this.pending && this.online()
        ? this.flush(alreadyRevalidated)
        : this.stateValue);
    }
    this.running = this.flushLoop(alreadyRevalidated).finally(() => { this.running = null; });
    return this.running;
  }

  dispose(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.events?.removeEventListener('online', this.onRetrySignal);
    this.visibility?.removeEventListener('visibilitychange', this.onVisible);
    this.listeners.clear();
  }

  private async flushLoop(alreadyRevalidated: boolean): Promise<DurableSaveState<T>> {
    let authenticated = alreadyRevalidated;
    while (this.pending) {
      if (!this.online()) {
        this.setState({ status: 'offline', pending: this.pending, saved: this.saved });
        return this.stateValue;
      }
      if (!authenticated) {
        try {
          const authentication = await this.client.auth.revalidate();
          if (authentication.status === 'reauthentication_required') {
            this.setState({ status: 'unauthorized', pending: this.pending, saved: this.saved, error: authentication.error });
            return this.stateValue;
          }
          if (authentication.session.user.id !== this.options.userId) {
            const error = new GamePlatformApiError('Pending save belongs to a different player', undefined, 'unauthorized');
            this.setState({ status: 'unauthorized', pending: this.pending, saved: this.saved, error });
            return this.stateValue;
          }
          authenticated = true;
        } catch (error) {
          return this.handleTransportError(this.asApiError(error));
        }
      }
      const pending = this.pending;
      this.setState({ status: 'saving', pending, saved: this.saved });
      try {
        const saved = await this.client.saves.put(this.options.gameSlug, this.options.slotKey, pending);
        this.confirmSaved(pending, saved);
        authenticated = true;
      } catch (error) {
        const apiError = this.asApiError(error);
        if (apiError.code === 'network' || apiError.code === 'timeout') {
          const reconciliation = await this.reconcileUnknownPut(pending);
          if (reconciliation === 'saved') continue;
          if (reconciliation === 'terminal') return this.stateValue;
          return this.handleTransportError(apiError);
        }
        if (apiError.code === 'unauthorized') {
          this.setState({ status: 'unauthorized', pending: this.pending, saved: this.saved, error: apiError });
        } else if (apiError.code === 'conflict') {
          this.setState({ status: 'conflict', pending: this.pending, saved: this.saved, conflict: apiError });
        } else {
          this.setState({ status: 'failed', pending: this.pending, saved: this.saved, error: apiError });
        }
        return this.stateValue;
      }
    }
    return this.stateValue;
  }

  private async reconcileUnknownPut(pending: PendingSave<T>): Promise<'saved' | 'retry' | 'terminal'> {
    try {
      const remote = await this.client.saves.get<T>(this.options.gameSlug, this.options.slotKey);
      if (sameJson(remote.data, pending.data)
        && remote.gameVersion === pending.gameVersion
        && remote.schemaVersion === pending.schemaVersion) {
        this.confirmSaved(pending, remote);
        return 'saved';
      }
      const conflict = new GamePlatformApiError('Save result is ambiguous and remote data differs', 409, 'conflict', { current: remote });
      this.setState({ status: 'conflict', pending: this.pending, saved: this.saved, conflict });
      return 'terminal';
    } catch (error) {
      const apiError = this.asApiError(error);
      if (apiError.code === 'not_found' || apiError.code === 'network' || apiError.code === 'timeout') return 'retry';
      if (apiError.code === 'unauthorized') this.setState({ status: 'unauthorized', pending: this.pending, saved: this.saved, error: apiError });
      else this.setState({ status: 'failed', pending: this.pending, saved: this.saved, error: apiError });
      return 'terminal';
    }
  }

  private confirmSaved(pending: PendingSave<T>, saved: GameSave<T>): void {
    this.saved = saved;
    if (this.pending === pending) {
      this.pending = null;
      safelyRemove(this.storage, this.key);
      this.setState({ status: 'saved', pending: null, saved });
      return;
    }
    // A newer snapshot arrived while this request was in flight. It must use
    // the revision just confirmed, and remains durable until its own PUT wins.
    if (this.pending && this.pending.expectedRevision === pending.expectedRevision) {
      this.pending.expectedRevision = saved.revision;
      safelyWrite(this.storage, this.key, this.pending);
    }
    this.setState({ status: 'dirty', pending: this.pending, saved });
  }

  private handleTransportError(error: GamePlatformApiError): DurableSaveState<T> {
    const pending = this.pending;
    if (!pending) return this.stateValue;
    pending.attempts += 1;
    if (!this.online()) {
      this.setState({ status: 'offline', pending, saved: this.saved, error });
      return this.stateValue;
    }
    if (pending.attempts > this.maxRetries) {
      this.setState({ status: 'failed', pending, saved: this.saved, error });
      return this.stateValue;
    }
    safelyWrite(this.storage, this.key, pending);
    this.setState({ status: 'dirty', pending, saved: this.saved, error });
    const delay = this.retryBaseMs * 2 ** (pending.attempts - 1);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { void this.flush(); }, delay);
    return this.stateValue;
  }

  private asApiError(error: unknown): GamePlatformApiError {
    return error instanceof GamePlatformApiError
      ? error
      : new GamePlatformApiError('Unexpected save delivery failure', undefined, 'api', error);
  }

  private setState(state: DurableSaveState<T>): void {
    this.stateValue = state;
    for (const listener of this.listeners) {
      try { listener(state); } catch { /* A game listener must not break delivery. */ }
    }
  }
}

export function createDurableGameSave<T>(options: DurableSaveOptions<T>): DurableGameSave<T> {
  return new DurableGameSave(options);
}

export type LeaderboardOutboxStatus = 'accepted' | 'queued' | 'unauthorized' | 'permanently_rejected' | 'offline';

export interface LeaderboardOutboxState {
  status: LeaderboardOutboxStatus;
  queuedCount: number;
  error?: GamePlatformApiError;
}

export interface DurableLeaderboardOutboxOptions {
  client: {
    auth: Pick<GamePlatformClient['auth'], 'revalidate'>;
    leaderboards: Pick<GamePlatformClient['leaderboards'], 'submit'>;
  };
  userId: string;
  gameSlug: string;
  storage?: LocalSaveStorage;
  keyPrefix?: string;
  maxRetries?: number;
  retryBaseMs?: number;
  online?: () => boolean;
  events?: BrowserEventTarget;
  visibility?: { hidden: boolean } & BrowserEventTarget;
}

interface OutboxItem {
  idempotencyKey: string;
  input: SubmitLeaderboardEntryInput;
  attempts: number;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Durable, idempotency-protected leaderboard delivery. It is intentionally
 * opt-in because games decide which results are worth retaining locally.
 */
export class DurableLeaderboardOutbox {
  private readonly storage: LocalSaveStorage | undefined;
  private readonly key: string;
  private readonly online: () => boolean;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private queue: OutboxItem[];
  private stateValue: LeaderboardOutboxState;
  private running: Promise<LeaderboardOutboxState> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onRetrySignal = () => { void this.flush(); };
  private readonly onVisible = () => { if (!this.visibility?.hidden) void this.flush(); };
  private readonly events?: BrowserEventTarget;
  private readonly visibility?: ({ hidden: boolean } & BrowserEventTarget);

  constructor(private readonly options: DurableLeaderboardOutboxOptions) {
    this.storage = options.storage ?? defaultStorage();
    const prefix = options.keyPrefix ?? '@game-platform/leaderboard-outbox/v1';
    this.key = `${prefix}/${encodeURIComponent(options.userId)}/${encodeURIComponent(options.gameSlug)}`;
    this.queue = safelyRead<OutboxItem[]>(this.storage, this.key) ?? [];
    this.online = options.online ?? isOnline;
    this.maxRetries = options.maxRetries ?? 5;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.events = options.events ?? defaultEvents();
    this.visibility = options.visibility ?? defaultVisibility();
    this.stateValue = { status: this.queue.length ? 'queued' : 'accepted', queuedCount: this.queue.length };
    this.events?.addEventListener('online', this.onRetrySignal);
    this.visibility?.addEventListener('visibilitychange', this.onVisible);
  }

  get state(): LeaderboardOutboxState { return this.stateValue; }

  enqueue(input: SubmitLeaderboardEntryInput): string {
    const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();
    this.queue.push({ idempotencyKey, input: { ...input, idempotencyKey }, attempts: 0 });
    this.persist();
    this.setState({ status: this.online() ? 'queued' : 'offline', queuedCount: this.queue.length });
    void this.flush();
    return idempotencyKey;
  }

  async recoverAfterReauthentication(): Promise<LeaderboardOutboxState> {
    const authentication = await this.options.client.auth.revalidate();
    if (authentication.status === 'reauthentication_required') {
      this.setState({ status: 'unauthorized', queuedCount: this.queue.length, error: authentication.error });
      return this.stateValue;
    }
    if (authentication.session.user.id !== this.options.userId) {
      this.setState({
        status: 'unauthorized', queuedCount: this.queue.length,
        error: new GamePlatformApiError('Pending events belong to a different player', undefined, 'unauthorized'),
      });
      return this.stateValue;
    }
    return this.flush(true);
  }

  async flush(alreadyRevalidated = false): Promise<LeaderboardOutboxState> {
    if (this.running) {
      return this.running.then(() => this.stateValue.status === 'offline' && this.queue.length && this.online()
        ? this.flush(alreadyRevalidated)
        : this.stateValue);
    }
    this.running = this.flushLoop(alreadyRevalidated).finally(() => { this.running = null; });
    return this.running;
  }

  dispose(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.events?.removeEventListener('online', this.onRetrySignal);
    this.visibility?.removeEventListener('visibilitychange', this.onVisible);
  }

  private async flushLoop(alreadyRevalidated: boolean): Promise<LeaderboardOutboxState> {
    let authenticated = alreadyRevalidated;
    while (this.queue.length) {
      if (!this.online()) {
        this.setState({ status: 'offline', queuedCount: this.queue.length });
        return this.stateValue;
      }
      if (!authenticated) {
        try {
          const authentication = await this.options.client.auth.revalidate();
          if (authentication.status === 'reauthentication_required') {
            this.setState({ status: 'unauthorized', queuedCount: this.queue.length, error: authentication.error });
            return this.stateValue;
          }
          if (authentication.session.user.id !== this.options.userId) {
            this.setState({ status: 'unauthorized', queuedCount: this.queue.length, error: new GamePlatformApiError('Pending events belong to a different player', undefined, 'unauthorized') });
            return this.stateValue;
          }
          authenticated = true;
        } catch (error) {
          return this.retry(this.asApiError(error));
        }
      }
      const item = this.queue[0];
      try {
        await this.options.client.leaderboards.submit(this.options.gameSlug, item.input);
        this.queue.shift();
        this.persist();
        this.setState({ status: this.queue.length ? 'queued' : 'accepted', queuedCount: this.queue.length });
      } catch (error) {
        const apiError = this.asApiError(error);
        if (apiError.code === 'network' || apiError.code === 'timeout') return this.retry(apiError);
        if (apiError.code === 'unauthorized') {
          this.setState({ status: 'unauthorized', queuedCount: this.queue.length, error: apiError });
        } else {
          this.setState({ status: 'permanently_rejected', queuedCount: this.queue.length, error: apiError });
        }
        return this.stateValue;
      }
    }
    return this.stateValue;
  }

  private retry(error: GamePlatformApiError): LeaderboardOutboxState {
    const item = this.queue[0];
    if (!item) return this.stateValue;
    item.attempts += 1;
    this.persist();
    if (!this.online()) {
      this.setState({ status: 'offline', queuedCount: this.queue.length, error });
      return this.stateValue;
    }
    if (item.attempts > this.maxRetries) {
      // Network exhaustion is still recoverable (including after reload); only
      // a server validation/rejection marks an event permanently rejected.
      this.setState({ status: 'queued', queuedCount: this.queue.length, error });
      return this.stateValue;
    }
    this.setState({ status: 'queued', queuedCount: this.queue.length, error });
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { void this.flush(); }, this.retryBaseMs * 2 ** (item.attempts - 1));
    return this.stateValue;
  }

  private persist(): void {
    if (this.queue.length) safelyWrite(this.storage, this.key, this.queue);
    else safelyRemove(this.storage, this.key);
  }

  private setState(state: LeaderboardOutboxState): void { this.stateValue = state; }

  private asApiError(error: unknown): GamePlatformApiError {
    return error instanceof GamePlatformApiError
      ? error
      : new GamePlatformApiError('Unexpected leaderboard delivery failure', undefined, 'api', error);
  }
}

export function createDurableLeaderboardOutbox(options: DurableLeaderboardOutboxOptions): DurableLeaderboardOutbox {
  return new DurableLeaderboardOutbox(options);
}

export type GameSessionLifecycleStatus = 'idle' | 'active' | 'hidden' | 'reauthentication_required' | 'offline' | 'failed';

export interface GameSessionLifecycle {
  readonly status: GameSessionLifecycleStatus;
  start(): Promise<GameSessionLifecycleStatus>;
  end(): Promise<GameSessionLifecycleStatus>;
  dispose(): Promise<void>;
}

export interface GameSessionLifecycleOptions {
  client: {
    auth: Pick<GamePlatformClient['auth'], 'revalidate'>;
    sessions: GamePlatformClient['sessions'];
  };
  gameSlug: string;
  heartbeatIntervalMs?: number;
  events?: BrowserEventTarget;
  visibility?: { hidden: boolean } & BrowserEventTarget;
}

/**
 * Browser-aware play-session coordination. It stops telemetry while hidden
 * and always revalidates the cookie session before beginning visible play.
 */
export function createGameSessionLifecycle(options: GameSessionLifecycleOptions): GameSessionLifecycle {
  const events = options.events ?? defaultEvents();
  const visibility = options.visibility ?? defaultVisibility();
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
  let status: GameSessionLifecycleStatus = visibility?.hidden ? 'hidden' : 'idle';
  let handle: GameSessionHandle | null = null;
  let serial = Promise.resolve<GameSessionLifecycleStatus>(status);
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const clearHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };
  const run = (operation: () => Promise<GameSessionLifecycleStatus>) => {
    serial = serial.then(operation, operation);
    return serial;
  };
  const start = () => run(async () => {
    if (visibility?.hidden) return (status = 'hidden');
    if (handle) return (status = 'active');
    try {
      const authentication = await options.client.auth.revalidate();
      if (authentication.status === 'reauthentication_required') return (status = 'reauthentication_required');
      const started = await options.client.sessions.start(options.gameSlug);
      const sessionId = started.session_id || started.id;
      handle = {
        sessionId,
        heartbeat: () => options.client.sessions.heartbeat(sessionId).then(() => undefined),
        end: () => options.client.sessions.end(sessionId).then(() => undefined),
      };
      status = 'active';
      heartbeatTimer = setInterval(() => { void heartbeat(); }, heartbeatIntervalMs);
      return status;
    } catch (error) {
      const apiError = error instanceof GamePlatformApiError ? error : new GamePlatformApiError('Unable to start game session', undefined, 'api', error);
      status = apiError.code === 'unauthorized' ? 'reauthentication_required'
        : apiError.code === 'network' || apiError.code === 'timeout' ? 'offline' : 'failed';
      return status;
    }
  });
  const end = () => run(async () => {
    clearHeartbeat();
    const current = handle;
    handle = null;
    if (!current) return (status = visibility?.hidden ? 'hidden' : 'idle');
    try {
      await current.end();
    } catch (error) {
      const apiError = error instanceof GamePlatformApiError ? error : undefined;
      if (apiError?.code !== 'not_found' && apiError?.code !== 'conflict' && apiError?.code !== 'unauthorized') status = 'offline';
    }
    return (status = visibility?.hidden ? 'hidden' : 'idle');
  });
  const heartbeat = () => {
    const current = handle;
    if (!current || visibility?.hidden) return;
    void current.heartbeat().catch((error: unknown) => {
      const apiError = error instanceof GamePlatformApiError ? error : new GamePlatformApiError('Game-session heartbeat failed', undefined, 'api', error);
      if (apiError.code === 'not_found' || apiError.code === 'conflict') {
        handle = null;
        clearHeartbeat();
        void start();
      } else if (apiError.code === 'unauthorized') {
        handle = null;
        clearHeartbeat();
        status = 'reauthentication_required';
      } else status = 'offline';
    });
  };
  const onVisibility = () => {
    if (visibility?.hidden) void end();
    else void start();
  };
  const onPageHide = () => { void end(); };
  visibility?.addEventListener('visibilitychange', onVisibility);
  events?.addEventListener('pagehide', onPageHide);
  return {
    get status() { return status; },
    start,
    end,
    async dispose() {
      visibility?.removeEventListener('visibilitychange', onVisibility);
      events?.removeEventListener('pagehide', onPageHide);
      await end();
    },
  };
}

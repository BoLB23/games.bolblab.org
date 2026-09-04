import {
  createDurableLeaderboardOutbox,
  createGamePlatformClient,
  createGameSessionLifecycle,
  type DurableLeaderboardOutbox,
  type GamePlatformClient,
  type GameSessionLifecycle,
  type LeaderboardResponse,
  type LocalSaveStorage,
} from '@bolb23/game-client-sdk';
import { GAME_ID, LEVEL_ID } from '../config/gameplay';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001/api/v1';
const BEST_STORAGE_PREFIX = 'game-platform/flappy-mike/best-distance';

export interface ScoreSubmission {
  gameId: string;
  levelId: string;
  score: number;
}

function readStoredBest(key: string, storage: LocalSaveStorage | undefined): number {
  try {
    const value = Number(storage?.getItem(key));
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  } catch {
    return 0;
  }
}

export class PlatformBridge {
  private readonly client: GamePlatformClient;
  private readonly storage: LocalSaveStorage | undefined;
  private lifecycle: GameSessionLifecycle | null = null;
  private outbox: DurableLeaderboardOutbox | null = null;
  private userId: string | null = null;
  private best = 0;
  private submittedBest = this.best;
  private disposed = false;
  private connectPromise: Promise<void> | null = null;
  private listenersAttached = false;
  private readonly onFocus = () => { void this.connect(); };
  private readonly onOnline = () => { void this.connect(); };

  constructor(options: { client?: GamePlatformClient; storage?: LocalSaveStorage } = {}) {
    this.client = options.client ?? createGamePlatformClient({ apiBaseUrl });
    if (options.storage) this.storage = options.storage;
    else {
      try { this.storage = typeof localStorage === 'undefined' ? undefined : localStorage; } catch { this.storage = undefined; }
    }
    this.best = readStoredBest(`${BEST_STORAGE_PREFIX}/guest`, this.storage);
  }

  getBest(): number {
    return this.best;
  }

  getTopDistances(): Promise<LeaderboardResponse> {
    return this.client.leaderboards.get('distance', GAME_ID, 10);
  }

  /** Revalidates identity after a login or account change in the host tab. */
  async refreshIdentity(): Promise<void> { await this.connect(); }

  start(): void {
    if (!this.listenersAttached) {
      window.addEventListener('focus', this.onFocus);
      window.addEventListener('online', this.onOnline);
      this.listenersAttached = true;
    }
    void this.connect();
  }

  recordRun(score: number): ScoreSubmission | null {
    const retryEqual = score === this.best && ['offline', 'unauthorized', 'permanently_rejected'].includes(this.outbox?.state.status ?? '');
    if (score < this.best || (score === this.best && !retryEqual)) return null;
    this.best = score;
    try { this.storage?.setItem(this.bestStorageKey(), String(score)); } catch { /* local best remains in memory */ }
    const submission: ScoreSubmission = { gameId: GAME_ID, levelId: LEVEL_ID, score };
    if (score > this.submittedBest || retryEqual) {
      this.submittedBest = Math.max(this.submittedBest, score);
      if (this.outbox) this.enqueueScore(score);
    }
    return submission;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.listenersAttached) {
      window.removeEventListener('focus', this.onFocus);
      window.removeEventListener('online', this.onOnline);
      this.listenersAttached = false;
    }
    const lifecycle = this.lifecycle;
    this.lifecycle = null;
    this.outbox?.dispose();
    this.outbox = null;
    await lifecycle?.dispose();
  }

  private connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connectInternal().finally(() => { this.connectPromise = null; });
    return this.connectPromise;
  }

  private async connectInternal(): Promise<void> {
    try {
      const authentication = await this.client.auth.revalidate();
      if (this.disposed) return;
      if (authentication.status !== 'authenticated') {
        await this.lifecycle?.dispose();
        this.outbox?.dispose();
        this.lifecycle = null;
        this.outbox = null;
        this.userId = null;
        this.best = readStoredBest(`${BEST_STORAGE_PREFIX}/guest`, this.storage);
        this.submittedBest = this.best;
        return;
      }
      if (this.userId === authentication.session.user.id && this.lifecycle) return;
      if (this.userId && this.userId !== authentication.session.user.id) {
        await this.lifecycle?.dispose();
        if (this.disposed) return;
        this.outbox?.dispose();
        this.lifecycle = null;
        this.outbox = null;
      }
      this.userId = authentication.session.user.id;
      this.best = readStoredBest(this.bestStorageKey(), this.storage);
      this.submittedBest = this.best;
      this.lifecycle = createGameSessionLifecycle({ client: this.client, gameSlug: GAME_ID });
      this.outbox = createDurableLeaderboardOutbox({ client: this.client, userId: this.userId, gameSlug: GAME_ID, storage: this.storage });
      if (this.best > 0) {
        this.enqueueScore(this.best);
      }
      await this.lifecycle.start();
      await this.outbox.recoverAfterReauthentication();
    } catch {
      // A direct local launch may not have an authenticated platform session; the local best still works.
    }
  }

  private bestStorageKey(): string { return `${BEST_STORAGE_PREFIX}/${this.userId ?? 'guest'}`; }

  private enqueueScore(score: number): void {
    this.outbox?.enqueue({
      leaderboardKey: 'distance',
      value: score,
      metadata: { source: GAME_ID, levelId: LEVEL_ID },
      idempotencyKey: `distance-best-${score}`,
    });
  }
}

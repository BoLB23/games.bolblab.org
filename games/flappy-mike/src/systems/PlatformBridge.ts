import { createGamePlatformClient, type GameSessionHandle } from '@bolb23/game-client-sdk';
import { GAME_ID, LEVEL_ID } from '../config/gameplay';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001/api/v1';
const BEST_STORAGE_KEY = 'game-platform/flappy-mike/best-distance';

export interface ScoreSubmission {
  gameId: string;
  levelId: string;
  score: number;
}

function readStoredBest(): number {
  try {
    const value = Number(localStorage.getItem(BEST_STORAGE_KEY));
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  } catch {
    return 0;
  }
}

export class PlatformBridge {
  private readonly client = createGamePlatformClient({ apiBaseUrl });
  private session: GameSessionHandle | null = null;
  private heartbeatTimer: number | undefined;
  private best = readStoredBest();
  private submittedBest = this.best;

  getBest(): number {
    return this.best;
  }

  start(): void {
    void this.connect();
    window.addEventListener('beforeunload', () => { void this.dispose(); }, { once: true });
  }

  recordRun(score: number): ScoreSubmission | null {
    if (score <= this.best) return null;
    this.best = score;
    try { localStorage.setItem(BEST_STORAGE_KEY, String(score)); } catch { /* local best remains in memory */ }
    const submission: ScoreSubmission = { gameId: GAME_ID, levelId: LEVEL_ID, score };
    if (score > this.submittedBest) {
      this.submittedBest = score;
      void this.client.submitLeaderboardEntry(GAME_ID, {
        leaderboardKey: 'distance',
        value: score,
        metadata: { source: GAME_ID, levelId: LEVEL_ID },
      }).catch(() => { this.submittedBest = Math.min(this.submittedBest, score - 1); });
    }
    return submission;
  }

  async dispose(): Promise<void> {
    if (this.heartbeatTimer !== undefined) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    const session = this.session;
    this.session = null;
    if (session) await session.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    try {
      this.session = await this.client.startGameSession(GAME_ID);
      this.heartbeatTimer = window.setInterval(() => {
        void this.session?.heartbeat().catch(() => undefined);
      }, 45_000);
    } catch {
      // A direct local launch may not have an authenticated platform session; the local best still works.
    }
  }
}

export const GAME_ID = 'flappy-mike';
export const LEVEL_ID = 'level-1';
export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;

export interface GameplayConfig {
  gravity: number;
  flapVelocity: number;
  maxFallVelocity: number;
  worldSpeedStart: number;
  worldSpeedMax: number;
  obstacleGapStart: number;
  obstacleGapMin: number;
  obstacleSpacing: number;
  maxGapShift: number;
  playerHitboxScale: number;
  difficultyRampDistance: number;
  scoreDistanceUnit: number;
  groundHeight: number;
  obstacleWidth: number;
  obstaclePoolSize: number;
  topMargin: number;
  bottomMargin: number;
  hitPauseMs: number;
  gameOverDelayMs: number;
}

export const DEFAULT_GAMEPLAY_CONFIG: Readonly<GameplayConfig> = Object.freeze({
  gravity: 1200,
  flapVelocity: -410,
  maxFallVelocity: 650,
  worldSpeedStart: 220,
  worldSpeedMax: 335,
  obstacleGapStart: 190,
  obstacleGapMin: 158,
  obstacleSpacing: 340,
  maxGapShift: 60,
  playerHitboxScale: 0.78,
  difficultyRampDistance: 16_000,
  scoreDistanceUnit: 10,
  groundHeight: 70,
  obstacleWidth: 108,
  obstaclePoolSize: 8,
  topMargin: 54,
  bottomMargin: 62,
  hitPauseMs: 55,
  gameOverDelayMs: 560,
});

export function createRuntimeGameplayConfig(): GameplayConfig {
  return { ...DEFAULT_GAMEPLAY_CONFIG };
}

export function resetRuntimeGameplayConfig(target: GameplayConfig): void {
  Object.assign(target, DEFAULT_GAMEPLAY_CONFIG);
}

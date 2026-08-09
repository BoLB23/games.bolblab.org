import type { GameplayConfig } from '../config/gameplay';

export interface DifficultySnapshot {
  progress: number;
  worldSpeed: number;
  obstacleGap: number;
}

export class DifficultyDirector {
  getSnapshot(distance: number, config: GameplayConfig): DifficultySnapshot {
    const progress = Math.max(0, Math.min(1, distance / config.difficultyRampDistance));
    return {
      progress,
      worldSpeed: config.worldSpeedStart + (config.worldSpeedMax - config.worldSpeedStart) * progress,
      obstacleGap: config.obstacleGapStart + (config.obstacleGapMin - config.obstacleGapStart) * progress,
    };
  }
}

import type { GameplayConfig } from '../config/gameplay';

export class DistanceManager {
  private traveled = 0;

  reset(): void {
    this.traveled = 0;
  }

  update(worldSpeed: number, deltaMs: number): void {
    this.traveled += worldSpeed * (deltaMs / 1000);
  }

  get distance(): number {
    return this.traveled;
  }

  score(config: GameplayConfig): number {
    return Math.floor(this.traveled / config.scoreDistanceUnit);
  }
}

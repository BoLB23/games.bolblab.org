import { LOGICAL_HEIGHT } from '../config/gameplay';
import type { GameplayConfig } from '../config/gameplay';

export class GapPlanner {
  private previousGapCenter: number | null = null;

  constructor(private readonly random: () => number = Math.random) {}

  reset(): void {
    this.previousGapCenter = null;
  }

  next(gapSize: number, config: GameplayConfig): number {
    const lowest = config.topMargin + gapSize / 2;
    const highest = LOGICAL_HEIGHT - config.groundHeight - config.bottomMargin - gapSize / 2;
    const previous = this.previousGapCenter ?? (lowest + highest) / 2;
    const shift = (this.random() * 2 - 1) * config.maxGapShift;
    const center = Math.max(lowest, Math.min(highest, previous + shift));
    this.previousGapCenter = center;
    return center;
  }
}

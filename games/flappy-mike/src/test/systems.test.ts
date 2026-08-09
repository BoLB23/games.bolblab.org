import { describe, expect, it } from 'vitest';
import { createRuntimeGameplayConfig, DEFAULT_GAMEPLAY_CONFIG } from '../config/gameplay';
import { WorldPhase } from '../config/worldPhases';
import { DifficultyDirector } from '../systems/DifficultyDirector';
import { DistanceManager } from '../systems/DistanceManager';
import { GapPlanner } from '../systems/GapPlanner';
import { ThemeDirector } from '../systems/ThemeDirector';

describe('FlappyMike gameplay systems', () => {
  it('accumulates deterministic distance and rounds it for the HUD', () => {
    const distance = new DistanceManager();
    distance.update(220, 1_000);
    distance.update(220, 1_000);
    expect(distance.distance).toBe(440);
    expect(distance.score(createRuntimeGameplayConfig())).toBe(44);
  });

  it('ramps speed and constrains the gap without exceeding configured limits', () => {
    const config = createRuntimeGameplayConfig();
    const difficulty = new DifficultyDirector();
    const opening = difficulty.getSnapshot(0, config);
    const end = difficulty.getSnapshot(config.difficultyRampDistance * 2, config);
    expect(opening.worldSpeed).toBe(config.worldSpeedStart);
    expect(end.worldSpeed).toBe(config.worldSpeedMax);
    expect(end.obstacleGap).toBe(config.obstacleGapMin);
  });

  it('keeps procedural obstacle gap shifts fair and inside the safe corridor', () => {
    const config = createRuntimeGameplayConfig();
    const planner = new GapPlanner(() => 1);
    const centers = Array.from({ length: 12 }, () => planner.next(config.obstacleGapStart, config));
    const low = config.topMargin + config.obstacleGapStart / 2;
    const high = 540 - config.groundHeight - config.bottomMargin - config.obstacleGapStart / 2;
    centers.forEach((center, index) => {
      expect(center).toBeGreaterThanOrEqual(low);
      expect(center).toBeLessThanOrEqual(high);
      if (index) expect(center - centers[index - 1]).toBeLessThanOrEqual(config.maxGapShift);
    });
  });

  it('moves city → transition → country by distance and evolves obstacle weights', () => {
    const director = new ThemeDirector();
    expect(director.getPhase(0)).toBe(WorldPhase.CITY);
    expect(director.getPhase(13_500)).toBe(WorldPhase.TRANSITION);
    expect(director.getPhase(24_000)).toBe(WorldPhase.COUNTRY);
    const city = director.getObstacleWeights(0);
    const country = director.getObstacleWeights(24_000);
    expect(city.city).toBeGreaterThan(city.country);
    expect(country.country).toBeGreaterThan(country.city);
    expect(DEFAULT_GAMEPLAY_CONFIG.gravity).toBe(1200);
  });
});

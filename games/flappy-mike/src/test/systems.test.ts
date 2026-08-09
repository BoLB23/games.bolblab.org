import { describe, expect, it } from 'vitest';
import { createRuntimeGameplayConfig, DEFAULT_GAMEPLAY_CONFIG } from '../config/gameplay';
import { WorldPhase } from '../config/worldPhases';
import { DifficultyDirector } from '../systems/DifficultyDirector';
import { DistanceManager } from '../systems/DistanceManager';
import { GapPlanner } from '../systems/GapPlanner';
import { getPlayerHitboxSize, PLAYER_COLLISION_REFERENCE_SIZE, PLAYER_VISUAL_SIZE } from '../systems/PlayerController';
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

  it('stages the visual journey by depth instead of fading every layer together', () => {
    const director = new ThemeDirector();
    const transitionStart = 13_200;
    const transitionLength = 9_200;
    const at = (progress: number) => director.getVisualBlend(transitionStart + transitionLength * progress);

    const early = at(0.2);
    expect(early.far).toBeGreaterThan(early.near);
    expect(early.near).toBeLessThan(0.05);

    const outskirts = at(0.5);
    expect(outskirts.far).toBeGreaterThan(outskirts.mid);
    expect(outskirts.mid).toBeGreaterThan(outskirts.near);
    expect(outskirts.ground).toBeLessThan(0.03);

    const firstFarm = at(0.75);
    expect(firstFarm.near).toBeGreaterThan(0);
    expect(firstFarm.ground).toBeGreaterThan(0);
    expect(firstFarm.far).toBeGreaterThan(firstFarm.ground);
  });

  it('keeps Mike’s original collision size while increasing only his display size', () => {
    const config = createRuntimeGameplayConfig();
    expect(PLAYER_VISUAL_SIZE).toBeGreaterThan(PLAYER_COLLISION_REFERENCE_SIZE);
    expect(getPlayerHitboxSize(config)).toBe(70 * config.playerHitboxScale);
  });

  it('brings in obstacle families as a physical city-to-country journey', () => {
    const director = new ThemeDirector();
    const at = (progress: number) => director.getObstacleWeights(13_200 + 9_200 * progress);
    const outerNeighborhoods = at(0.2);
    const edgeOfTown = at(0.62);
    const firstFarm = at(0.8);

    expect(outerNeighborhoods.city).toBeGreaterThan(outerNeighborhoods.country);
    expect(edgeOfTown.transition).toBeGreaterThan(edgeOfTown.city);
    expect(firstFarm.country).toBeGreaterThan(firstFarm.transition);
  });
});

import Phaser from 'phaser';
import type { GameplayConfig } from '../config/gameplay';
import type { ThemeWeights } from '../config/worldPhases';
import { GapPlanner } from './GapPlanner';
import { ObstaclePair, type ObstacleTheme } from './ObstaclePair';

export class ObstacleManager {
  readonly collisionGroup: Phaser.Physics.Arcade.Group;
  private readonly pairs: ObstaclePair[] = [];
  private readonly gapPlanner = new GapPlanner();
  private distanceSinceSpawn = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly config: GameplayConfig) {
    this.collisionGroup = scene.physics.add.group({ allowGravity: false, immovable: true, maxSize: config.obstaclePoolSize * 2 });
    for (let index = 0; index < config.obstaclePoolSize; index += 1) this.pairs.push(new ObstaclePair(scene, this.collisionGroup));
  }

  reset(): void {
    this.distanceSinceSpawn = 0;
    this.gapPlanner.reset();
    this.pairs.forEach((pair) => pair.deactivate());
  }

  start(obstacleGap: number, weights: ThemeWeights): void {
    this.spawn(this.scene.scale.width + 230, obstacleGap, weights);
  }

  update(deltaMs: number, worldSpeed: number, obstacleGap: number, weights: ThemeWeights): void {
    this.pairs.forEach((pair) => {
      pair.setWorldSpeed(worldSpeed);
      if (pair.isOffscreen()) pair.deactivate();
    });
    this.distanceSinceSpawn += worldSpeed * (deltaMs / 1000);
    while (this.distanceSinceSpawn >= this.config.obstacleSpacing) {
      this.distanceSinceSpawn -= this.config.obstacleSpacing;
      this.spawn(this.scene.scale.width + this.config.obstacleWidth, obstacleGap, weights);
    }
  }

  stop(): void {
    this.pairs.forEach((pair) => pair.setWorldSpeed(0));
  }

  getActivePairs(): readonly ObstaclePair[] {
    return this.pairs.filter((pair) => pair.active);
  }

  private spawn(x: number, gap: number, weights: ThemeWeights): void {
    const pair = this.pairs.find((candidate) => !candidate.active);
    if (!pair) return;
    pair.spawn(x, this.gapPlanner.next(gap, this.config), gap, this.chooseTheme(weights), this.config);
  }

  private chooseTheme(weights: ThemeWeights): ObstacleTheme {
    const roll = Math.random();
    if (roll < weights.city) return 'city';
    if (roll < weights.city + weights.transition) return 'transition';
    return 'country';
  }
}

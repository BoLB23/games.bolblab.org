import Phaser from 'phaser';
import { ASSET_KEYS } from '../assets/assetManifest';
import { LOGICAL_WIDTH } from '../config/gameplay';
import { WorldPhase } from '../config/worldPhases';
import type { ThemeDirector } from './ThemeDirector';

interface Decoration {
  image: Phaser.GameObjects.Image;
  speedFactor: number;
}

export class DecorationDirector {
  private readonly active: Decoration[] = [];
  private distanceSinceSpawn = 0;
  private highwaySignShown = false;

  constructor(private readonly scene: Phaser.Scene, private readonly theme: ThemeDirector) {}

  reset(): void {
    this.clear();
    this.distanceSinceSpawn = 0;
    this.highwaySignShown = false;
    this.spawn(ASSET_KEYS.decorCityWaterTower, LOGICAL_WIDTH * 0.82, 340, 0.5, 0.18, 1.6);
  }

  preview(distance: number): void {
    this.clear();
    const phase = this.theme.getPhase(distance);
    if (phase === WorldPhase.CITY) {
      this.spawn(ASSET_KEYS.decorCityWaterTower, LOGICAL_WIDTH * 0.82, 340, 0.5, 0, 1.6);
    } else if (phase === WorldPhase.TRANSITION) {
      this.spawn(ASSET_KEYS.decorHighwaySign, LOGICAL_WIDTH * 0.76, 400, 0.46, 0, 2.7);
    } else {
      this.spawn(ASSET_KEYS.decorCountryCow, LOGICAL_WIDTH * 0.77, 421, 0.58, 0, 2.6);
      this.spawn(ASSET_KEYS.decorCountryBuggy, LOGICAL_WIDTH * 0.3, 426, 0.5, 0, 2.6);
    }
  }

  update(distance: number, worldSpeed: number, deltaMs: number): void {
    const movement = worldSpeed * (deltaMs / 1000);
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const item = this.active[index];
      item.image.x -= movement * item.speedFactor;
      if (item.image.x < -item.image.displayWidth) {
        item.image.destroy();
        this.active.splice(index, 1);
      }
    }

    const progress = this.theme.getTransitionProgress(distance);
    if (!this.highwaySignShown && progress >= 0.22 && progress < 1) {
      this.highwaySignShown = true;
      this.spawn(ASSET_KEYS.decorHighwaySign, LOGICAL_WIDTH + 120, 382, 0.58, 0.42, 2.7);
    }

    this.distanceSinceSpawn += movement;
    if (this.distanceSinceSpawn < 2400) return;
    this.distanceSinceSpawn = 0;
    const phase = this.theme.getPhase(distance);
    if (phase === WorldPhase.CITY) {
      if (Math.random() < 0.62) this.spawn(ASSET_KEYS.decorCityWaterTower, LOGICAL_WIDTH + 90, 338, 0.45, 0.2, 1.6);
      return;
    }
    if (phase === WorldPhase.COUNTRY) {
      const buggy = Math.random() < 0.24;
      this.spawn(
        buggy ? ASSET_KEYS.decorCountryBuggy : ASSET_KEYS.decorCountryCow,
        LOGICAL_WIDTH + 110,
        buggy ? 426 : 421,
        buggy ? 0.55 : 0.58,
        buggy ? 0.5 : 0.36,
        2.6,
      );
    }
  }

  private spawn(key: string, x: number, y: number, scale: number, speedFactor: number, depth: number): void {
    const image = this.scene.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale).setDepth(depth);
    this.active.push({ image, speedFactor });
  }

  private clear(): void {
    this.active.forEach(({ image }) => image.destroy());
    this.active.length = 0;
  }
}

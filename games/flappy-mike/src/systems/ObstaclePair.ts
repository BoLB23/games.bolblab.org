import Phaser from 'phaser';
import { OBSTACLE_KEYS } from '../assets/assetManifest';
import { LOGICAL_HEIGHT } from '../config/gameplay';
import type { GameplayConfig } from '../config/gameplay';

export type ObstacleTheme = 'city' | 'transition' | 'country';

const randomTexture = (theme: ObstacleTheme): string => {
  const choices = OBSTACLE_KEYS[theme];
  return choices[Math.floor(Math.random() * choices.length)];
};

export class ObstaclePair {
  readonly top: Phaser.Physics.Arcade.Image;
  readonly bottom: Phaser.Physics.Arcade.Image;
  active = false;

  constructor(scene: Phaser.Scene, group: Phaser.Physics.Arcade.Group) {
    this.top = scene.physics.add.image(-200, -200, OBSTACLE_KEYS.city[0]).setDepth(8);
    this.bottom = scene.physics.add.image(-200, -200, OBSTACLE_KEYS.city[0]).setDepth(8);
    group.addMultiple([this.top, this.bottom]);
    this.deactivate();
  }

  spawn(x: number, gapCenter: number, gap: number, theme: ObstacleTheme, config: GameplayConfig): void {
    const gapTop = gapCenter - gap / 2;
    const gapBottom = gapCenter + gap / 2;
    const topHeight = gapTop;
    const bottomHeight = LOGICAL_HEIGHT - config.groundHeight - gapBottom;
    // Theme and family are selected only at spawn/recycle time. Active obstacles
    // never swap texture mid-flight during a world-theme transition.
    const texture = randomTexture(theme);
    this.top.setTexture(texture).setDisplaySize(config.obstacleWidth, topHeight);
    this.bottom.setTexture(texture).setDisplaySize(config.obstacleWidth, bottomHeight);
    this.top.enableBody(true, x, topHeight / 2, true, true);
    this.bottom.enableBody(true, x, gapBottom + bottomHeight / 2, true, true);
    for (const obstacle of [this.top, this.bottom]) {
      obstacle.setImmovable(true).setVelocity(0, 0);
      const body = obstacle.body as Phaser.Physics.Arcade.Body;
      body.allowGravity = false;
      body.setSize(config.obstacleWidth, obstacle.displayHeight, true);
    }
    this.active = true;
  }

  setWorldSpeed(speed: number): void {
    if (!this.active) return;
    this.top.setVelocityX(-speed);
    this.bottom.setVelocityX(-speed);
  }

  isOffscreen(): boolean {
    return this.active && this.top.x < -90;
  }

  deactivate(): void {
    this.active = false;
    this.top.disableBody(true, true);
    this.bottom.disableBody(true, true);
  }
}

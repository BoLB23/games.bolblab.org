import Phaser from 'phaser';
import { ASSET_KEYS } from '../assets/assetManifest';

export class EffectsDirector {
  private readonly puff: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly featherA: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly featherB: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private readonly scene: Phaser.Scene) {
    this.puff = scene.add.particles(0, 0, ASSET_KEYS.fxFlapPuff, {
      emitting: false,
      lifespan: 260,
      speedX: { min: -45, max: -20 },
      speedY: { min: -8, max: 8 },
      scale: { start: 0.45, end: 0.08 },
      alpha: { start: 0.48, end: 0 },
      reserve: 4,
    }).setDepth(19);
    this.featherA = this.makeFeathers(ASSET_KEYS.fxFeather01);
    this.featherB = this.makeFeathers(ASSET_KEYS.fxFeather02);
  }

  flap(x: number, y: number): void {
    this.puff.explode(1, x - 28, y + 7);
  }

  impact(x: number, y: number): void {
    this.featherA.explode(2, x, y);
    this.featherB.explode(2, x, y);
    const star = this.scene.add.image(x + 20, y - 8, ASSET_KEYS.fxImpactStar).setScale(0.15).setDepth(24);
    this.scene.tweens.add({
      targets: star,
      scale: 0.58,
      alpha: 0,
      angle: 34,
      duration: 260,
      ease: 'Back.Out',
      onComplete: () => star.destroy(),
    });
  }

  private makeFeathers(key: string): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.scene.add.particles(0, 0, key, {
      emitting: false,
      lifespan: { min: 520, max: 760 },
      speed: { min: 55, max: 135 },
      angle: { min: 155, max: 300 },
      gravityY: 260,
      rotate: { min: -220, max: 220 },
      scale: { start: 0.52, end: 0.16 },
      alpha: { start: 1, end: 0.12 },
      reserve: 6,
    }).setDepth(23);
  }
}

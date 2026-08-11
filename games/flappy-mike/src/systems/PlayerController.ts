import Phaser from 'phaser';
import { ANIMATION_KEYS } from '../assets/assetManifest';
import type { GameplayConfig } from '../config/gameplay';

// Keep the visual atlas and collision body independently tunable so Mike stays
// legible over richer scenery while the gameplay hitbox remains intentional.
export const PLAYER_VISUAL_SIZE = 80;
export const PLAYER_COLLISION_REFERENCE_SIZE = 70;

export function getPlayerHitboxSize(config: GameplayConfig): number {
  return PLAYER_COLLISION_REFERENCE_SIZE * config.playerHitboxScale;
}

export class PlayerController {
  private isReady = true;
  private isDead = false;
  private readyY = 0;
  private readyElapsedMs = 0;
  private flapKickMs = 0;
  private isTumbling = false;
  private readonly baseScaleX: number;
  private readonly baseScaleY: number;

  constructor(private readonly player: Phaser.Physics.Arcade.Sprite, private readonly config: GameplayConfig) {
    this.readyY = player.y;
    this.baseScaleX = player.scaleX;
    this.baseScaleY = player.scaleY;
    this.applyConfig();
  }

  reset(x: number, y: number): void {
    this.isReady = true;
    this.isDead = false;
    this.readyY = y;
    this.readyElapsedMs = 0;
    this.flapKickMs = 0;
    this.isTumbling = false;
    this.player.enableBody(true, x, y, true, true);
    this.player.setAngle(0).setScale(this.baseScaleX, this.baseScaleY);
    this.player.setVelocity(0, 0);
    this.body.allowGravity = false;
    this.player.play(ANIMATION_KEYS.idle, true);
    this.applyConfig();
  }

  applyConfig(): void {
    this.player.setMaxVelocity(0, this.config.maxFallVelocity);
    const hitbox = getPlayerHitboxSize(this.config);
    this.body.setSize(hitbox, hitbox, true);
  }

  begin(): void {
    this.isReady = false;
    this.body.allowGravity = true;
    this.player.play(ANIMATION_KEYS.glide, true);
  }

  flap(): void {
    if (this.isDead) return;
    this.player.setVelocityY(this.config.flapVelocity);
    this.flapKickMs = 115;
    this.player.play(ANIMATION_KEYS.flap);
  }

  holdForImpact(): void {
    this.isDead = true;
    this.player.setVelocity(0, 0);
    this.body.allowGravity = false;
    this.isTumbling = false;
    this.player.play(ANIMATION_KEYS.hit);
  }

  die(): void {
    this.isDead = true;
    this.isTumbling = true;
    this.body.allowGravity = true;
    this.player.setVelocityY(Math.min(80, this.config.maxFallVelocity));
    this.player.play(ANIMATION_KEYS.dead, true);
  }

  update(deltaMs: number): void {
    this.applyConfig();
    if (this.isReady) {
      this.readyElapsedMs += deltaMs;
      this.player.y = this.readyY + Math.sin(this.readyElapsedMs / 260) * 8;
      return;
    }
    if (this.isDead) {
      if (this.isTumbling) this.player.setAngle(Math.min(160, this.player.angle + deltaMs * 0.22));
      return;
    }
    const velocity = this.body.velocity.y;
    const tiltProgress = Math.max(0, Math.min(1, (velocity - this.config.flapVelocity) / (this.config.maxFallVelocity - this.config.flapVelocity)));
    this.player.setAngle(-18 + tiltProgress * 86);
    this.flapKickMs = Math.max(0, this.flapKickMs - deltaMs);
    const kick = this.flapKickMs / 115;
    this.player.setScale(this.baseScaleX * (1 + kick * 0.09), this.baseScaleY * (1 - kick * 0.07));
    if (this.player.anims.getName() === ANIMATION_KEYS.flap && this.player.anims.isPlaying) return;
    this.player.play(velocity > 190 ? ANIMATION_KEYS.fall : ANIMATION_KEYS.glide, true);
  }

  private get body(): Phaser.Physics.Arcade.Body {
    return this.player.body as Phaser.Physics.Arcade.Body;
  }
}

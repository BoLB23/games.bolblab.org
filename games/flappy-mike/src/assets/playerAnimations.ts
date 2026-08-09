import Phaser from 'phaser';
import { ANIMATION_KEYS, ASSET_KEYS } from './assetManifest';

export function createPlayerAnimations(scene: Phaser.Scene): void {
  const create = (key: string, frames: string[], frameRate: number, repeat: number): void => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: frames.map((frame) => ({ key: ASSET_KEYS.playerAtlas, frame })),
      frameRate,
      repeat,
    });
  };

  create(ANIMATION_KEYS.idle, ['idle_0', 'idle_1', 'idle_2', 'idle_3'], 5, -1);
  create(ANIMATION_KEYS.flap, ['flap_0', 'flap_1', 'flap_2', 'flap_3'], 22, 0);
  create(ANIMATION_KEYS.glide, ['glide_0', 'glide_1'], 4, -1);
  create(ANIMATION_KEYS.fall, ['fall_0', 'fall_1'], 5, -1);
  create(ANIMATION_KEYS.hit, ['hit_0', 'hit_1', 'hit_2'], 16, 0);
  create(ANIMATION_KEYS.dead, ['dead_0', 'dead_1'], 5, -1);
}

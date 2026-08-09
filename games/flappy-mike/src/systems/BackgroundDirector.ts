import Phaser from 'phaser';
import { ASSET_KEYS } from '../assets/assetManifest';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../config/gameplay';
import type { GameplayConfig } from '../config/gameplay';
import type { ThemeDirector, ThemeVisualBlend } from './ThemeDirector';

type BlendKey = keyof ThemeVisualBlend;

interface ParallaxLayer {
  city: Phaser.GameObjects.TileSprite;
  transition?: Phaser.GameObjects.TileSprite;
  country: Phaser.GameObjects.TileSprite;
  factor: number;
  blend: BlendKey;
}

function threeWayMix(progress: number): { city: number; transition: number; country: number } {
  if (progress <= 0.5) return { city: 1 - progress * 2, transition: progress * 2, country: 0 };
  return { city: 0, transition: (1 - progress) * 2, country: progress * 2 - 1 };
}

export class BackgroundDirector {
  private readonly layers: ParallaxLayer[];

  constructor(scene: Phaser.Scene, private readonly theme: ThemeDirector, config: GameplayConfig) {
    const makeLayer = (
      cityTexture: string,
      transitionTexture: string | undefined,
      countryTexture: string,
      y: number,
      height: number,
      factor: number,
      blend: BlendKey,
      depth: number,
    ): ParallaxLayer => ({
      city: scene.add.tileSprite(LOGICAL_WIDTH / 2, y, LOGICAL_WIDTH, height, cityTexture).setDepth(depth),
      transition: transitionTexture
        ? scene.add.tileSprite(LOGICAL_WIDTH / 2, y, LOGICAL_WIDTH, height, transitionTexture).setDepth(depth + 0.01).setAlpha(0)
        : undefined,
      country: scene.add.tileSprite(LOGICAL_WIDTH / 2, y, LOGICAL_WIDTH, height, countryTexture).setDepth(depth + 0.02).setAlpha(0),
      factor,
      blend,
    });

    this.layers = [
      makeLayer(ASSET_KEYS.skyCity, undefined, ASSET_KEYS.skyCountry, LOGICAL_HEIGHT / 2, LOGICAL_HEIGHT, 0.05, 'sky', 0),
      makeLayer(ASSET_KEYS.farCity, ASSET_KEYS.farTransition, ASSET_KEYS.farCountry, 332, 230, 0.18, 'far', 1),
      makeLayer(ASSET_KEYS.midCity, ASSET_KEYS.midTransition, ASSET_KEYS.midCountry, 382, 180, 0.36, 'mid', 2),
      makeLayer(ASSET_KEYS.nearCity, ASSET_KEYS.nearTransition, ASSET_KEYS.nearCountry, 420, 145, 0.58, 'near', 3),
      makeLayer(ASSET_KEYS.groundCity, ASSET_KEYS.groundTransition, ASSET_KEYS.groundCountry, LOGICAL_HEIGHT - config.groundHeight / 2, config.groundHeight, 1, 'ground', 4),
    ];
  }

  update(distance: number, worldSpeed: number, deltaMs: number): void {
    const blend = this.theme.getVisualBlend(distance);
    const movement = worldSpeed * (deltaMs / 1000);
    this.layers.forEach((layer) => {
      const change = movement * layer.factor;
      layer.city.tilePositionX += change;
      if (layer.transition) layer.transition.tilePositionX += change;
      layer.country.tilePositionX += change;

      const progress = blend[layer.blend];
      if (!layer.transition) {
        layer.city.setAlpha(1 - progress);
        layer.country.setAlpha(progress);
        return;
      }
      const mix = threeWayMix(progress);
      layer.city.setAlpha(mix.city);
      layer.transition.setAlpha(mix.transition);
      layer.country.setAlpha(mix.country);
    });
  }
}

import Phaser from 'phaser';
import { ASSET_KEYS } from './assetManifest';

type TexturePainter = (graphics: Phaser.GameObjects.Graphics) => void;

function makeTexture(scene: Phaser.Scene, key: string, width: number, height: number, paint: TexturePainter): void {
  if (scene.textures.exists(key)) return;
  const graphics = scene.add.graphics();
  paint(graphics);
  graphics.generateTexture(key, width, height);
  graphics.destroy();
}

function makeObstacle(scene: Phaser.Scene, key: string, mainColor: number, accentColor: number): void {
  makeTexture(scene, key, 128, 512, (graphics) => {
    graphics.fillStyle(mainColor, 1);
    graphics.fillRect(0, 0, 128, 512);
    graphics.fillStyle(accentColor, 0.85);
    for (let y = 12; y < 512; y += 48) {
      for (let x = (y / 48) % 2 ? 12 : 28; x < 128; x += 52) graphics.fillRect(x, y, 22, 24);
    }
    graphics.lineStyle(5, 0x201c1b, 0.45);
    graphics.strokeRect(2, 2, 124, 508);
  });
}

function makeLandscape(scene: Phaser.Scene, key: string, color: number, accent: number, kind: 'sky' | 'far' | 'mid' | 'near' | 'ground'): void {
  const width = 240;
  const height = kind === 'ground' ? 80 : 160;
  makeTexture(scene, key, width, height, (graphics) => {
    graphics.fillStyle(color, 1);
    graphics.fillRect(0, 0, width, height);
    if (kind === 'sky') {
      graphics.fillStyle(accent, 0.35);
      graphics.fillCircle(40, 36, 18);
      graphics.fillCircle(58, 32, 14);
      graphics.fillCircle(78, 38, 20);
      return;
    }
    if (kind === 'far') {
      graphics.fillStyle(accent, 0.8);
      for (let x = 0; x < width; x += 28) {
        const buildingHeight = 28 + ((x * 7) % 58);
        graphics.fillRect(x, height - buildingHeight, 22, buildingHeight);
      }
      return;
    }
    if (kind === 'mid') {
      graphics.fillStyle(accent, 0.85);
      for (let x = 0; x < width; x += 42) {
        graphics.fillTriangle(x, height, x + 21, height - 66, x + 42, height);
      }
      return;
    }
    if (kind === 'near') {
      graphics.fillStyle(accent, 0.9);
      for (let x = 0; x < width; x += 36) {
        graphics.fillRect(x + 15, height - 72, 6, 72);
        graphics.fillCircle(x + 18, height - 82, 24);
      }
      return;
    }
    graphics.fillStyle(accent, 0.7);
    for (let x = -20; x < width; x += 36) graphics.fillTriangle(x, height, x + 18, 14, x + 36, height);
  });
}

export function createPlaceholderTextures(scene: Phaser.Scene): void {
  makeTexture(scene, ASSET_KEYS.player, 72, 72, (graphics) => {
    graphics.fillStyle(0x264d4a, 1);
    graphics.fillEllipse(34, 43, 60, 44);
    graphics.fillStyle(0xf3c59d, 1);
    graphics.fillCircle(38, 27, 22);
    graphics.fillStyle(0xf0d55e, 1);
    graphics.fillTriangle(61, 38, 71, 43, 60, 48);
    graphics.fillStyle(0x1f2328, 1);
    graphics.fillCircle(28, 26, 9);
    graphics.fillCircle(47, 26, 9);
    graphics.fillRect(35, 24, 6, 3);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(29, 26, 3);
    graphics.fillCircle(46, 26, 3);
    graphics.fillStyle(0x2a201d, 1);
    graphics.fillTriangle(29, 40, 38, 34, 38, 44);
    graphics.fillTriangle(47, 40, 38, 34, 38, 44);
    graphics.lineStyle(3, 0x1f2328, 1);
    graphics.strokeCircle(28, 26, 10);
    graphics.strokeCircle(47, 26, 10);
  });
  makeObstacle(scene, ASSET_KEYS.cityObstacle, 0x954a3f, 0xf0c05a);
  makeObstacle(scene, ASSET_KEYS.transitionObstacle, 0x67706d, 0xbac6b1);
  makeObstacle(scene, ASSET_KEYS.countryObstacle, 0xb34a36, 0xf3d275);
  makeLandscape(scene, ASSET_KEYS.skyCity, 0x6e9ec2, 0xdce6ed, 'sky');
  makeLandscape(scene, ASSET_KEYS.skyCountry, 0x8ec6df, 0xf6efbd, 'sky');
  makeLandscape(scene, ASSET_KEYS.farCity, 0x49647e, 0x2f4357, 'far');
  makeLandscape(scene, ASSET_KEYS.farCountry, 0x85a878, 0x5c8061, 'far');
  makeLandscape(scene, ASSET_KEYS.midCity, 0x405564, 0x2d3c49, 'mid');
  makeLandscape(scene, ASSET_KEYS.midCountry, 0x668a5d, 0x416a4d, 'mid');
  makeLandscape(scene, ASSET_KEYS.nearCity, 0x2b3c42, 0x1c2d32, 'near');
  makeLandscape(scene, ASSET_KEYS.nearCountry, 0x4f7c4f, 0x2e603d, 'near');
  makeLandscape(scene, ASSET_KEYS.groundCity, 0x354447, 0x69766b, 'ground');
  makeLandscape(scene, ASSET_KEYS.groundCountry, 0x4f713e, 0x95ad55, 'ground');
}

import Phaser from 'phaser';
import { DEFAULT_GAMEPLAY_CONFIG, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './config/gameplay';
import { FlappyMikeScene } from './scenes/FlappyMikeScene';
import './style.css';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  backgroundColor: '#6e9ec2',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
  },
  input: {
    keyboard: true,
    mouse: true,
    touch: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: DEFAULT_GAMEPLAY_CONFIG.gravity },
      debug: false,
    },
  },
  scene: [FlappyMikeScene],
});

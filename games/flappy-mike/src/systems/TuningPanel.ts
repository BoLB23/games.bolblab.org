import Phaser from 'phaser';
import { resetRuntimeGameplayConfig } from '../config/gameplay';
import type { GameplayConfig } from '../config/gameplay';

export interface TuningSnapshot {
  distance: number;
  phase: string;
  transitionPercent: number;
  showHitboxes: boolean;
  godMode: boolean;
  paused: boolean;
}

interface TuningField {
  key: keyof GameplayConfig;
  label: string;
  step: number;
  minimum: number;
  maximum: number;
}

const FIELDS: TuningField[] = [
  { key: 'gravity', label: 'Gravity', step: 25, minimum: 100, maximum: 2400 },
  { key: 'flapVelocity', label: 'Flap velocity', step: 10, minimum: -900, maximum: -100 },
  { key: 'maxFallVelocity', label: 'Max fall velocity', step: 10, minimum: 200, maximum: 1200 },
  { key: 'worldSpeedStart', label: 'World speed', step: 5, minimum: 80, maximum: 500 },
  { key: 'worldSpeedMax', label: 'World speed max', step: 5, minimum: 100, maximum: 650 },
  { key: 'obstacleGapStart', label: 'Obstacle gap', step: 2, minimum: 120, maximum: 280 },
  { key: 'obstacleGapMin', label: 'Minimum gap', step: 2, minimum: 110, maximum: 260 },
  { key: 'obstacleSpacing', label: 'Obstacle spacing', step: 10, minimum: 220, maximum: 600 },
  { key: 'maxGapShift', label: 'Max gap shift', step: 5, minimum: 0, maximum: 160 },
  { key: 'playerHitboxScale', label: 'Hitbox scale', step: 0.02, minimum: 0.4, maximum: 1 },
];

export class TuningPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly text: Phaser.GameObjects.Text;
  private selected = 0;
  private visible = false;

  constructor(
    scene: Phaser.Scene,
    private readonly config: GameplayConfig,
    private readonly getSnapshot: () => TuningSnapshot,
    private readonly onConfigChanged: () => void,
    private readonly onToggleHitboxes: () => void,
    private readonly onToggleGodMode: () => void,
    private readonly onTogglePause: () => void,
  ) {
    const panel = scene.add.rectangle(0, 0, 344, 412, 0x10262f, 0.94).setOrigin(0).setStrokeStyle(2, 0xf0d275, 0.8);
    this.text = scene.add.text(14, 14, '', { fontFamily: 'monospace', fontSize: '13px', color: '#edf4e8', lineSpacing: 3 });
    this.container = scene.add.container(600, 16, [panel, this.text]).setDepth(40).setVisible(false);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.setVisible(this.visible);
  }

  isVisible(): boolean {
    return this.visible;
  }

  handleKey(code: string): boolean {
    if (!this.visible) return false;
    if (code === 'ArrowUp') { this.selected = (this.selected - 1 + FIELDS.length) % FIELDS.length; return true; }
    if (code === 'ArrowDown') { this.selected = (this.selected + 1) % FIELDS.length; return true; }
    if (code === 'ArrowLeft') { this.adjust(-1); return true; }
    if (code === 'ArrowRight') { this.adjust(1); return true; }
    if (code === 'KeyH') { this.onToggleHitboxes(); return true; }
    if (code === 'KeyG') { this.onToggleGodMode(); return true; }
    if (code === 'KeyP') { this.onTogglePause(); return true; }
    if (code === 'KeyR') { resetRuntimeGameplayConfig(this.config); this.onConfigChanged(); return true; }
    if (code === 'KeyC') { this.exportConfig(); return true; }
    return false;
  }

  update(): void {
    if (!this.visible) return;
    const snapshot = this.getSnapshot();
    const lines = [
      'FLAPPYMIKE TUNING',
      '↑ ↓ select   ← → adjust',
      '',
      ...FIELDS.map((field, index) => `${index === this.selected ? '›' : ' '} ${field.label.padEnd(18)} ${this.config[field.key].toFixed(field.key === 'playerHitboxScale' ? 2 : 0)}`),
      '',
      `Distance            ${Math.floor(snapshot.distance).toLocaleString()}`,
      `Phase               ${snapshot.phase}`,
      `Transition          ${snapshot.transitionPercent}%`,
      `H hitboxes          ${snapshot.showHitboxes ? 'ON' : 'OFF'}`,
      `G god mode          ${snapshot.godMode ? 'ON' : 'OFF'}`,
      `P pause             ${snapshot.paused ? 'ON' : 'OFF'}`,
      'R reset · C download JSON · F2 close',
    ];
    this.text.setText(lines);
  }

  private adjust(direction: number): void {
    const field = FIELDS[this.selected];
    const next = this.config[field.key] + field.step * direction;
    this.config[field.key] = Math.max(field.minimum, Math.min(field.maximum, Number(next.toFixed(3))));
    if (this.config.worldSpeedMax < this.config.worldSpeedStart) this.config.worldSpeedMax = this.config.worldSpeedStart;
    if (this.config.obstacleGapMin > this.config.obstacleGapStart) this.config.obstacleGapMin = this.config.obstacleGapStart;
    this.onConfigChanged();
  }

  private exportConfig(): void {
    const content = JSON.stringify(this.config, null, 2);
    void navigator.clipboard?.writeText(content).catch(() => undefined);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    link.download = 'flappy-mike-tuning.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

import Phaser from 'phaser';
import { ASSET_KEYS, ATLAS_PATHS, IMAGE_PATHS } from '../assets/assetManifest';
import { createPlaceholderTextures } from '../assets/placeholders';
import { createPlayerAnimations } from '../assets/playerAnimations';
import { createRuntimeGameplayConfig, LOGICAL_HEIGHT, LOGICAL_WIDTH, type GameplayConfig } from '../config/gameplay';
import { BackgroundDirector } from '../systems/BackgroundDirector';
import { AudioDirector } from '../systems/AudioDirector';
import { DifficultyDirector } from '../systems/DifficultyDirector';
import { DecorationDirector } from '../systems/DecorationDirector';
import { DistanceManager } from '../systems/DistanceManager';
import { EffectsDirector } from '../systems/EffectsDirector';
import { ObstacleManager } from '../systems/ObstacleManager';
import { PlatformBridge } from '../systems/PlatformBridge';
import { PlayerController } from '../systems/PlayerController';
import { ThemeDirector } from '../systems/ThemeDirector';
import { TuningPanel } from '../systems/TuningPanel';

type RunState = 'READY' | 'PLAYING' | 'DEAD' | 'GAME_OVER';

export class FlappyMikeScene extends Phaser.Scene {
  private readonly runtimeConfig: GameplayConfig = createRuntimeGameplayConfig();
  private readonly distance = new DistanceManager();
  private readonly difficulty = new DifficultyDirector();
  private readonly theme = new ThemeDirector();
  private state: RunState = 'READY';
  private player!: Phaser.Physics.Arcade.Sprite;
  private controller!: PlayerController;
  private obstacles!: ObstacleManager;
  private background!: BackgroundDirector;
  private decorations!: DecorationDirector;
  private effects!: EffectsDirector;
  private audio!: AudioDirector;
  private platform = new PlatformBridge();
  private scoreText!: Phaser.GameObjects.Text;
  private logo!: Phaser.GameObjects.Image;
  private instructionText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private tuningPanel: TuningPanel | null = null;
  private showHitboxes = false;
  private godMode = false;
  private manuallyPaused = false;
  private hitPauseRemainingMs = 0;
  private gameOverRemainingMs = 0;
  private scoreRefreshMs = 0;
  private lastScore = -1;
  private obstacleCollider!: Phaser.Physics.Arcade.Collider;
  private artPreviewDistance: number | null = null;

  constructor() {
    super('FlappyMikeScene');
  }

  preload(): void {
    this.load.atlas(ASSET_KEYS.playerAtlas, ATLAS_PATHS.texture, ATLAS_PATHS.data);
    IMAGE_PATHS.forEach(([key, path]) => this.load.image(key, path));
  }

  create(): void {
    createPlaceholderTextures(this);
    createPlayerAnimations(this);
    this.physics.world.gravity.y = this.runtimeConfig.gravity;
    this.physics.world.setBounds(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT - this.runtimeConfig.groundHeight, false, false, true, true);
    this.background = new BackgroundDirector(this, this.theme, this.runtimeConfig);
    this.decorations = new DecorationDirector(this, this.theme);
    this.effects = new EffectsDirector(this);
    this.audio = new AudioDirector(this);
    this.obstacles = new ObstacleManager(this, this.runtimeConfig);
    this.createPlayer();
    this.createHud();
    this.debugGraphics = this.add.graphics().setDepth(35);
    this.obstacleCollider = this.physics.add.collider(this.player, this.obstacles.collisionGroup, () => this.onCollision());
    this.physics.world.on('worldbounds', (body: Phaser.Physics.Arcade.Body) => {
      if (body.gameObject === this.player) this.onCollision();
    });
    this.setupInput();
    if (import.meta.env.DEV) this.createTuningPanel();
    this.resetRun();
    this.applyArtPreviewFromQuery();
    this.platform.start();
    this.events.once('shutdown', () => { void this.platform.dispose(); });
  }

  update(_time: number, deltaMs: number): void {
    this.tuningPanel?.update();
    if (this.manuallyPaused) {
      this.drawHitboxes();
      return;
    }

    if (this.state === 'READY') {
      this.controller.update(deltaMs);
      this.background.update(this.artPreviewDistance ?? 0, this.runtimeConfig.worldSpeedStart, deltaMs);
    } else if (this.state === 'PLAYING') {
      const snapshot = this.difficulty.getSnapshot(this.distance.distance, this.runtimeConfig);
      this.physics.world.gravity.y = this.runtimeConfig.gravity;
      this.distance.update(snapshot.worldSpeed, deltaMs);
      this.obstacles.update(deltaMs, snapshot.worldSpeed, snapshot.obstacleGap, this.theme.getObstacleWeights(this.distance.distance));
      this.background.update(this.distance.distance, snapshot.worldSpeed, deltaMs);
      this.decorations.update(this.distance.distance, snapshot.worldSpeed, deltaMs);
      this.controller.update(deltaMs);
      this.scoreRefreshMs += deltaMs;
      if (this.scoreRefreshMs >= 90) this.refreshScore();
    } else if (this.state === 'DEAD') {
      this.controller.update(deltaMs);
      this.hitPauseRemainingMs -= deltaMs;
      this.gameOverRemainingMs -= deltaMs;
      if (this.hitPauseRemainingMs <= 0) this.controller.die();
      if (this.gameOverRemainingMs <= 0) this.showGameOver();
    }
    this.drawHitboxes();
  }

  private createPlayer(): void {
    this.player = this.physics.add.sprite(LOGICAL_WIDTH * 0.28, LOGICAL_HEIGHT * 0.5, ASSET_KEYS.playerAtlas, 'idle_0').setDepth(20).setDisplaySize(70, 70);
    this.player.setCollideWorldBounds(true, 0, 0, true);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowRotation(false);
    this.controller = new PlayerController(this.player, this.runtimeConfig);
  }

  private createHud(): void {
    this.logo = this.add.image(LOGICAL_WIDTH / 2, 66, ASSET_KEYS.logo).setDisplaySize(300, 92).setDepth(29);
    this.scoreText = this.add.text(30, 24, 'DISTANCE\n0', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '26px', color: '#ffffff', align: 'left', stroke: '#1d2930', strokeThickness: 5,
    }).setDepth(30);
    this.instructionText = this.add.text(LOGICAL_WIDTH / 2, 130, 'TAP TO FLAP', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '28px', color: '#fff5bd', stroke: '#30434b', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(30);
    this.resultText = this.add.text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 20, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '28px', color: '#ffffff', align: 'center', stroke: '#1d2930', strokeThickness: 7, lineSpacing: 10,
    }).setOrigin(0.5).setDepth(30).setVisible(false);
  }

  private setupInput(): void {
    this.input.on('pointerdown', () => this.flapOrRetry());
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.code === 'F2' && this.tuningPanel) {
        this.tuningPanel.toggle();
        return;
      }
      if (this.tuningPanel?.handleKey(event.code)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        this.flapOrRetry();
      }
    });
  }

  private createTuningPanel(): void {
    this.tuningPanel = new TuningPanel(
      this,
      this.runtimeConfig,
      () => ({
        distance: this.distance.distance,
        phase: this.theme.getPhase(this.distance.distance),
        transitionPercent: Math.round(this.theme.getTransitionProgress(this.distance.distance) * 100),
        showHitboxes: this.showHitboxes,
        godMode: this.godMode,
        paused: this.manuallyPaused,
      }),
      () => { this.physics.world.gravity.y = this.runtimeConfig.gravity; this.controller.applyConfig(); },
      () => { this.showHitboxes = !this.showHitboxes; },
      () => { this.godMode = !this.godMode; },
      () => { this.manuallyPaused = !this.manuallyPaused; },
    );
  }

  private flapOrRetry(): void {
    if (this.manuallyPaused || this.tuningPanel?.isVisible()) return;
    if (this.state === 'READY') {
      this.startRun();
      return;
    }
    if (this.state === 'PLAYING') this.controller.flap();
    if (this.state === 'PLAYING') {
      this.audio.flap();
      this.effects.flap(this.player.x, this.player.y);
    }
    if (this.state === 'GAME_OVER') {
      this.audio.restart();
      this.resetRun();
    }
  }

  private startRun(): void {
    this.state = 'PLAYING';
    this.logo.setVisible(false);
    this.instructionText.setVisible(false);
    this.controller.begin();
    this.controller.flap();
    this.audio.flap();
    this.effects.flap(this.player.x, this.player.y);
    const opening = this.difficulty.getSnapshot(0, this.runtimeConfig);
    this.obstacles.start(opening.obstacleGap, this.theme.getObstacleWeights(0));
  }

  private onCollision(): void {
    if (this.state !== 'PLAYING' || this.godMode) return;
    this.state = 'DEAD';
    this.obstacleCollider.active = false;
    this.obstacles.stop();
    this.controller.holdForImpact();
    this.audio.impact();
    this.effects.impact(this.player.x, this.player.y);
    this.hitPauseRemainingMs = this.runtimeConfig.hitPauseMs;
    this.gameOverRemainingMs = this.runtimeConfig.gameOverDelayMs;
    this.cameras.main.shake(80, 0.006);
  }

  private showGameOver(): void {
    if (this.state !== 'DEAD') return;
    this.state = 'GAME_OVER';
    const score = this.distance.score(this.runtimeConfig);
    const previousBest = this.platform.getBest();
    this.platform.recordRun(score);
    const best = Math.max(previousBest, score);
    this.logo.setVisible(true);
    this.resultText.setText(`DISTANCE\n${score.toLocaleString()}\n\nBEST\n${best.toLocaleString()}\n\nTAP TO RETRY`).setVisible(true);
    this.refreshScore(true);
  }

  private resetRun(): void {
    this.state = 'READY';
    this.distance.reset();
    this.decorations.reset();
    this.obstacles.reset();
    this.obstacleCollider.active = true;
    this.controller.reset(LOGICAL_WIDTH * 0.28, LOGICAL_HEIGHT * 0.5);
    this.instructionText.setVisible(true);
    this.logo.setVisible(true);
    this.resultText.setVisible(false);
    this.hitPauseRemainingMs = 0;
    this.gameOverRemainingMs = 0;
    this.lastScore = -1;
    this.scoreRefreshMs = 0;
    this.refreshScore(true);
  }

  private refreshScore(force = false): void {
    const score = this.distance.score(this.runtimeConfig);
    if (!force && score === this.lastScore) return;
    this.lastScore = score;
    this.scoreRefreshMs = 0;
    this.scoreText.setText(`DISTANCE\n${score.toLocaleString()}`);
  }

  private applyArtPreviewFromQuery(): void {
    if (!import.meta.env.DEV) return;
    const requested = Number(new URLSearchParams(window.location.search).get('artDistance'));
    if (!Number.isFinite(requested) || requested <= 0) return;
    this.artPreviewDistance = requested;
    this.background.update(requested, 0, 0);
    this.decorations.preview(requested);
    this.instructionText.setText(`ART PREVIEW  •  ${this.theme.getPhase(requested).toUpperCase()}`);
  }

  private drawHitboxes(): void {
    this.debugGraphics.clear();
    if (!this.showHitboxes) return;
    this.debugGraphics.lineStyle(2, 0xfaff66, 0.95);
    const drawBody = (body: Phaser.Physics.Arcade.Body) => this.debugGraphics.strokeRect(body.x, body.y, body.width, body.height);
    drawBody(this.player.body as Phaser.Physics.Arcade.Body);
    this.obstacles.getActivePairs().forEach((pair) => {
      drawBody(pair.top.body as Phaser.Physics.Arcade.Body);
      drawBody(pair.bottom.body as Phaser.Physics.Arcade.Body);
    });
  }
}

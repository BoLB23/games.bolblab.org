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
import { PLAYER_VISUAL_SIZE, PlayerController } from '../systems/PlayerController';
import { ThemeDirector } from '../systems/ThemeDirector';
import { TuningPanel } from '../systems/TuningPanel';

type RunState = 'READY' | 'PLAYING' | 'DEAD' | 'GAME_OVER' | 'LEADERBOARD';

const INTRO_SEEN_STORAGE_KEY = 'game-platform/flappy-mike/intro-seen';

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
  private scoreBackdrop!: Phaser.GameObjects.Rectangle;
  private logo!: Phaser.GameObjects.Image;
  private instructionText!: Phaser.GameObjects.Text;
  private journeyText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private playerHalo!: Phaser.GameObjects.Ellipse;
  private introBackdrop!: Phaser.GameObjects.Rectangle;
  private introTitle!: Phaser.GameObjects.Text;
  private introStory!: Phaser.GameObjects.Text;
  private introPrompt!: Phaser.GameObjects.Text;
  private introVisible = false;
  private leaderboardBackdrop!: Phaser.GameObjects.Rectangle;
  private leaderboardTitle!: Phaser.GameObjects.Text;
  private leaderboardText!: Phaser.GameObjects.Text;
  private leaderboardButton!: Phaser.GameObjects.Text;
  private leaderboardBackButton!: Phaser.GameObjects.Text;
  private leaderboardLoading = false;
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
    this.syncPlayerPresentation();
    this.drawHitboxes();
  }

  private createPlayer(): void {
    this.playerHalo = this.add.ellipse(LOGICAL_WIDTH * 0.28, LOGICAL_HEIGHT * 0.5, 106, 88, 0xffe5a8, 0.2).setDepth(18);
    this.player = this.physics.add.sprite(LOGICAL_WIDTH * 0.28, LOGICAL_HEIGHT * 0.5, ASSET_KEYS.playerAtlas, 'idle_0')
      .setDepth(20).setDisplaySize(PLAYER_VISUAL_SIZE, PLAYER_VISUAL_SIZE);
    this.player.setCollideWorldBounds(true, 0, 0, true);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowRotation(false);
    this.controller = new PlayerController(this.player, this.runtimeConfig);
  }

  private createHud(): void {
    this.logo = this.add.image(LOGICAL_WIDTH / 2, 62, ASSET_KEYS.logo).setDisplaySize(314, 96).setDepth(29);
    this.scoreBackdrop = this.add.rectangle(20, 18, 164, 70, 0x183745, 0.56).setOrigin(0, 0).setStrokeStyle(2, 0xffe5a8, 0.35).setDepth(28);
    this.scoreText = this.add.text(30, 24, 'DISTANCE\n0', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '26px', color: '#ffffff', align: 'left', stroke: '#1d2930', strokeThickness: 5,
    }).setDepth(30);
    this.journeyText = this.add.text(LOGICAL_WIDTH / 2, 116, 'PHILADELPHIA  →  LANCASTER', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color: '#fff5bd', letterSpacing: 1.2, stroke: '#30434b', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30);
    this.instructionText = this.add.text(LOGICAL_WIDTH / 2, 146, 'TAP TO FLAP', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '28px', color: '#fff5bd', stroke: '#30434b', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(30);
    this.resultText = this.add.text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 20, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '28px', color: '#ffffff', align: 'center', stroke: '#1d2930', strokeThickness: 7, lineSpacing: 10,
    }).setOrigin(0.5).setDepth(30).setVisible(false);
    this.createIntroStory();
    this.createLeaderboardView();
  }

  private createLeaderboardView(): void {
    this.leaderboardBackdrop = this.add.rectangle(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, LOGICAL_WIDTH - 44, LOGICAL_HEIGHT - 26, 0xf6f0dc, 0.98)
      .setStrokeStyle(4, 0x56372c, 0.95).setDepth(45);
    this.leaderboardTitle = this.add.text(LOGICAL_WIDTH / 2, 42, 'TOP 10 FLIGHTS', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '30px', color: '#56372c', align: 'center', stroke: '#ffd06a', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(46);
    this.leaderboardText = this.add.text(82, 82, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#263a38', lineSpacing: 7,
    }).setDepth(46);
    this.leaderboardButton = this.add.text(LOGICAL_WIDTH / 2, 430, 'VIEW TOP 10 LEADERBOARD', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '19px', color: '#f05a28', align: 'center', stroke: '#fffaf0', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(31).setVisible(false);
    this.leaderboardBackButton = this.add.text(LOGICAL_WIDTH / 2, 503, '‹ BACK TO RESULTS', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '19px', color: '#f05a28', align: 'center', stroke: '#fffaf0', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(46).setInteractive({ useHandCursor: true });
    this.leaderboardBackButton.on('pointerdown', () => this.hideLeaderboard());
    this.setLeaderboardVisible(false);
  }

  private setLeaderboardVisible(visible: boolean): void {
    [this.leaderboardBackdrop, this.leaderboardTitle, this.leaderboardText, this.leaderboardBackButton].forEach((object) => object.setVisible(visible));
  }

  private async showLeaderboard(): Promise<void> {
    if (this.leaderboardLoading) return;
    this.leaderboardLoading = true;
    this.state = 'LEADERBOARD';
    this.logo.setVisible(false);
    this.resultText.setVisible(false);
    this.leaderboardButton.setVisible(false);
    this.leaderboardText.setPosition(82, 82).setOrigin(0, 0);
    this.setLeaderboardVisible(true);
    this.leaderboardText.setText('LOADING THE CREW LEADERBOARD…');
    try {
      const response = await this.platform.getTopDistances();
      const rows = response.entries.slice(0, 10).map((entry) => {
        const player = entry.nickname || entry.display_name || 'Unknown pilot';
        const when = new Date(entry.achieved_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        return `${String(entry.rank).padStart(2, ' ')}  ${player.slice(0, 18).padEnd(18, ' ')}  ${Math.round(entry.value).toLocaleString().padStart(7, ' ')}  ${when}`;
      });
      this.leaderboardText.setText(rows.length ? ['RANK  PLAYER              DISTANCE  DATE / TIME', ...rows].join('\n') : 'NO FLIGHTS RECORDED YET.');
    } catch {
      this.leaderboardText.setText('LEADERBOARD UNAVAILABLE RIGHT NOW.\n\nCHECK YOUR CONNECTION OR SIGN IN\nTO SEE THE CREW\'S TOP FLIGHTS.');
    } finally {
      this.leaderboardLoading = false;
    }
  }

  private hideLeaderboard(): void {
    if (this.state !== 'LEADERBOARD') return;
    this.state = 'GAME_OVER';
    this.setLeaderboardVisible(false);
    this.logo.setVisible(true);
    this.resultText.setVisible(true);
    this.leaderboardButton.setVisible(true);
  }

  private createIntroStory(): void {
    this.introBackdrop = this.add.rectangle(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, LOGICAL_WIDTH - 84, LOGICAL_HEIGHT - 64, 0xf6f0dc, 0.97)
      .setStrokeStyle(4, 0x56372c, 0.95).setDepth(40);
    this.introTitle = this.add.text(LOGICAL_WIDTH / 2, 126, 'THE LONG WAY HOME', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '34px', color: '#56372c', align: 'center', stroke: '#ffd06a', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(41);
    this.introStory = this.add.text(LOGICAL_WIDTH / 2, 218,
      'Flappy Mike was lost in Philadelphia\nfor far too long. Now he needs to find\nhis way back home to Lancaster.', {
        fontFamily: 'Arial, sans-serif', fontSize: '25px', color: '#263a38', align: 'center', lineSpacing: 12,
      }).setOrigin(0.5).setDepth(41);
    this.introPrompt = this.add.text(LOGICAL_WIDTH / 2, 390, 'TAP OR PRESS SPACE TO BEGIN', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#f05a28', align: 'center', stroke: '#fffaf0', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(41);
    this.introVisible = !this.hasSeenIntro();
    this.setIntroVisible(this.introVisible);
  }

  private hasSeenIntro(): boolean {
    try {
      return window.localStorage.getItem(INTRO_SEEN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private setIntroVisible(visible: boolean): void {
    this.introVisible = visible;
    [this.introBackdrop, this.introTitle, this.introStory, this.introPrompt].forEach((object) => object.setVisible(visible));
  }

  private dismissIntro(): void {
    this.setIntroVisible(false);
    try {
      window.localStorage.setItem(INTRO_SEEN_STORAGE_KEY, 'true');
    } catch {
      // The intro remains dismissible when storage is unavailable.
    }
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.state === 'GAME_OVER' && pointer.worldY >= 390 && pointer.worldY <= 480) {
        void this.showLeaderboard();
        return;
      }
      if (this.state === 'GAME_OVER' && pointer.worldY >= 480) return;
      if (this.state === 'LEADERBOARD') return;
      this.flapOrRetry();
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.code === 'F2' && this.tuningPanel) {
        this.tuningPanel.toggle();
        return;
      }
      if (this.tuningPanel?.handleKey(event.code)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (this.state === 'LEADERBOARD') return;
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
    if (this.introVisible) {
      this.dismissIntro();
      this.startRun();
      return;
    }
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
    this.journeyText.setVisible(false);
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
    this.journeyText.setVisible(false);
    this.resultText.setText(`DISTANCE\n${score.toLocaleString()}\n\nBEST\n${best.toLocaleString()}\n\nTAP TO RETRY`).setVisible(true);
    this.leaderboardButton.setVisible(true);
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
    this.journeyText.setVisible(true);
    this.logo.setVisible(true);
    this.resultText.setVisible(false);
    this.leaderboardButton.setVisible(false);
    this.setLeaderboardVisible(false);
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

  private syncPlayerPresentation(): void {
    this.playerHalo.setPosition(this.player.x, this.player.y + 3);
    this.playerHalo.setVisible(this.state === 'READY').setAlpha(0.24);
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

import Phaser from 'phaser';

/**
 * Small synthesized graybox SFX keep the first playable build responsive without
 * blocking on authored files. Replace individual methods with this.sound.play()
 * calls once final flap, impact, and UI keys are loaded.
 */
export class AudioDirector {
  constructor(private readonly scene: Phaser.Scene) {}

  flap(): void {
    this.tone(720, 0.055, 0.035, 'square', 980);
  }

  impact(): void {
    this.tone(115, 0.12, 0.07, 'sawtooth', 55);
  }

  restart(): void {
    this.tone(420, 0.065, 0.035, 'triangle', 650);
  }

  private tone(startFrequency: number, duration: number, volume: number, type: OscillatorType, endFrequency: number): void {
    const context = (this.scene.sound as unknown as { context?: AudioContext }).context;
    if (!context) return;
    const startAt = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), startAt + duration);
    gain.gain.setValueAtTime(volume, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
  }
}

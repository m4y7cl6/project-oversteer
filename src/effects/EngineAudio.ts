import { NITRO } from '../game/config';
import { KartState } from '../vehicle/Kart';

/**
 * Procedural engine sound for the player kart (no audio assets needed):
 * a saw oscillator whose pitch tracks speed, plus a noise burst for nitro.
 */
export class EngineAudio {
  private ctx?: AudioContext;
  private osc?: OscillatorNode;
  private oscGain?: GainNode;
  private noiseGain?: GainNode;
  private started = false;

  /** Must be called from a user gesture (the START button). */
  start(): void {
    if (this.started) return;
    this.started = true;
    try {
      this.ctx = new AudioContext();
      const master = this.ctx.createGain();
      master.gain.value = 0.16;
      master.connect(this.ctx.destination);

      this.osc = this.ctx.createOscillator();
      this.osc.type = 'sawtooth';
      this.osc.frequency.value = 50;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      this.oscGain = this.ctx.createGain();
      this.oscGain.gain.value = 0.5;
      this.osc.connect(filter).connect(this.oscGain).connect(master);
      this.osc.start();

      // white-noise bed for nitro whoosh
      const len = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 900;
      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.value = 0;
      noise.connect(noiseFilter).connect(this.noiseGain).connect(master);
      noise.start();
    } catch {
      // audio is decorative; carry on silently if WebAudio is unavailable
      this.ctx = undefined;
    }
  }

  update(state: KartState): void {
    if (!this.ctx || !this.osc || !this.oscGain || !this.noiseGain) return;
    const t = this.ctx.currentTime;
    const ratio = Math.min(1, Math.abs(state.forwardSpeed) / NITRO.BOOST_MAX_SPEED);
    const idle = Math.abs(state.forwardSpeed) < 0.5;
    this.osc.frequency.setTargetAtTime(45 + ratio * 210, t, 0.05);
    this.oscGain.gain.setTargetAtTime(idle ? 0.28 : 0.5 + ratio * 0.3, t, 0.1);
    this.noiseGain.gain.setTargetAtTime(state.isBoosting ? 0.5 : Math.max(0, ratio - 0.8), t, 0.08);
  }

  stop(): void {
    this.ctx?.suspend();
  }

  resume(): void {
    this.ctx?.resume();
  }
}

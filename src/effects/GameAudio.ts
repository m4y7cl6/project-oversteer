import { NITRO } from '../game/config';
import { KartState } from '../vehicle/Kart';

/**
 * All game audio, no <audio> tags:
 * - procedural engine (saw osc pitched by speed) + nitro whoosh + drift skid
 *   (filtered noise), so the core loop works with zero audio assets
 * - one-shot CC0 samples (Kenney) for impacts/UI/jingles, decoded lazily from
 *   the URLs in `sources`; a missing file just means that cue stays silent
 */
export class GameAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private osc?: OscillatorNode;
  private oscGain?: GainNode;
  private nitroGain?: GainNode;
  private skidGain?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private started = false;

  constructor(private sources: Map<string, string>) {}

  /** Must be called from a user gesture (the START button). */
  start(): void {
    if (this.started) return;
    this.started = true;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.17;
      this.master.connect(this.ctx.destination);

      // engine: lowpassed saw
      this.osc = this.ctx.createOscillator();
      this.osc.type = 'sawtooth';
      this.osc.frequency.value = 50;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 700;
      this.oscGain = this.ctx.createGain();
      this.oscGain.gain.value = 0.5;
      this.osc.connect(engineFilter).connect(this.oscGain).connect(this.master);
      this.osc.start();

      // shared white-noise source feeding nitro whoosh + tire skid branches
      const len = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const nitroFilter = this.ctx.createBiquadFilter();
      nitroFilter.type = 'bandpass';
      nitroFilter.frequency.value = 900;
      this.nitroGain = this.ctx.createGain();
      this.nitroGain.gain.value = 0;
      noise.connect(nitroFilter).connect(this.nitroGain).connect(this.master);

      const skidFilter = this.ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 2200;
      skidFilter.Q.value = 1.2;
      this.skidGain = this.ctx.createGain();
      this.skidGain.gain.value = 0;
      noise.connect(skidFilter).connect(this.skidGain).connect(this.master);

      noise.start();

      void this.decodeAll();
    } catch {
      // audio is decorative; carry on silently if WebAudio is unavailable
      this.ctx = undefined;
    }
  }

  /** Fire a one-shot sample by semantic name (no-op until decoded). */
  play(name: string, volume = 1, rate = 1): void {
    if (!this.ctx || !this.master) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.master);
    src.start();
  }

  update(state: KartState): void {
    if (!this.ctx || !this.osc || !this.oscGain || !this.nitroGain || !this.skidGain) return;
    const t = this.ctx.currentTime;
    const ratio = Math.min(1, Math.abs(state.forwardSpeed) / NITRO.BOOST_MAX_SPEED);
    const idle = Math.abs(state.forwardSpeed) < 0.5;
    this.osc.frequency.setTargetAtTime(45 + ratio * 210, t, 0.05);
    this.oscGain.gain.setTargetAtTime(idle ? 0.28 : 0.5 + ratio * 0.3, t, 0.1);
    this.nitroGain.gain.setTargetAtTime(
      state.isBoosting ? 0.5 : Math.max(0, ratio - 0.8), t, 0.08,
    );
    // skid follows slip angle while drifting
    const skid = state.isDrifting && state.slipAngle > 6
      ? Math.min(0.4, 0.1 + state.slipAngle * 0.008)
      : 0;
    this.skidGain.gain.setTargetAtTime(skid, t, 0.06);
  }

  stop(): void {
    this.ctx?.suspend();
  }

  resume(): void {
    this.ctx?.resume();
  }

  private async decodeAll(): Promise<void> {
    if (!this.ctx) return;
    await Promise.all([...this.sources].map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const raw = await res.arrayBuffer();
        const decoded = await this.ctx!.decodeAudioData(raw);
        this.buffers.set(name, decoded);
      } catch {
        // missing sample: that cue stays silent
      }
    }));
  }
}

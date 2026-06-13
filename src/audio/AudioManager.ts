import { NITRO } from '../game/config';
import { KartState } from '../vehicle/Kart';

/**
 * All game audio, no <audio> tags. Two buses under one master:
 *
 *   music — procedural chiptune BGM
 *   sfx   — procedural engine / nitro whoosh / drift skid, one-shot CC0
 *           samples (Kenney) decoded lazily from `sources`, and synthesized
 *           UI/pickup cues so every sound works with zero audio assets
 *
 * Bus volumes are runtime-settable (wired to the profile's settings).
 */
export class AudioManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfxBus?: GainNode;
  private osc?: OscillatorNode;
  private oscGain?: GainNode;
  private nitroGain?: GainNode;
  private skidGain?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private started = false;

  private bgmVolume = 0.5;
  private sfxVolume = 1.0;

  // chiptune sequencer state
  private musicGain?: GainNode;
  private musicTimer?: number;
  private musicStep = 0;
  private musicNextTime = 0;
  musicMuted = false;

  constructor(private sources: Map<string, string>) {}

  /** Must be called from a user gesture (a menu button). */
  start(): void {
    if (this.started) return;
    this.started = true;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.17;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.master);

      // engine: lowpassed saw
      this.osc = this.ctx.createOscillator();
      this.osc.type = 'sawtooth';
      this.osc.frequency.value = 50;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 700;
      this.oscGain = this.ctx.createGain();
      this.oscGain.gain.value = 0.5;
      this.osc.connect(engineFilter).connect(this.oscGain).connect(this.sfxBus);
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
      noise.connect(nitroFilter).connect(this.nitroGain).connect(this.sfxBus);

      const skidFilter = this.ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 2200;
      skidFilter.Q.value = 1.2;
      this.skidGain = this.ctx.createGain();
      this.skidGain.gain.value = 0;
      noise.connect(skidFilter).connect(this.skidGain).connect(this.sfxBus);

      noise.start();

      this.startMusic();
      void this.decodeAll();
    } catch {
      // audio is decorative; carry on silently if WebAudio is unavailable
      this.ctx = undefined;
    }
  }

  /** Engine/skid layers only make sense in a race; mute them in menus. */
  setEngineEnabled(on: boolean): void {
    if (!this.ctx || !this.oscGain) return;
    const t = this.ctx.currentTime;
    if (!on) {
      this.oscGain.gain.setTargetAtTime(0, t, 0.05);
      this.nitroGain?.gain.setTargetAtTime(0, t, 0.05);
      this.skidGain?.gain.setTargetAtTime(0, t, 0.05);
    }
    this.engineEnabled = on;
  }
  private engineEnabled = true;

  // ---------------- volume settings ----------------

  setBgmVolume(v: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (!this.musicMuted && this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.05);
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  // ---------------- one-shots ----------------

  /**
   * Fire a one-shot by semantic name: a decoded sample when available,
   * otherwise a synthesized fallback for known UI/pickup cues.
   */
  play(name: string, volume = 1, rate = 1): void {
    if (!this.ctx || !this.sfxBus) return;
    const buf = this.buffers.get(name);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(this.sfxBus);
      src.start();
      return;
    }
    this.playSynth(name, volume, rate);
  }

  /** Square-wave blips for cues that ship no sample (coin, UI clicks…). */
  private playSynth(name: string, volume: number, rate: number): void {
    const NOTES: Record<string, { freqs: number[]; dur: number; type: OscillatorType }> = {
      coin: { freqs: [988, 1319], dur: 0.07, type: 'square' },
      pickup: { freqs: [523, 784, 1047], dur: 0.06, type: 'square' },
      purchase: { freqs: [523, 659, 784, 1047], dur: 0.08, type: 'square' },
      denied: { freqs: [196, 165], dur: 0.12, type: 'sawtooth' },
      click: { freqs: [880], dur: 0.04, type: 'square' },
    };
    const def = NOTES[name];
    if (!def || !this.ctx || !this.sfxBus) return;
    const t0 = this.ctx.currentTime;
    def.freqs.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = def.type;
      osc.frequency.value = freq * rate;
      const g = this.ctx!.createGain();
      const t = t0 + i * def.dur;
      g.gain.setValueAtTime(0.25 * volume, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + def.dur);
      osc.connect(g).connect(this.sfxBus!);
      osc.start(t);
      osc.stop(t + def.dur + 0.02);
    });
  }

  // ---------------- per-frame engine model ----------------

  update(state: KartState): void {
    if (!this.ctx || !this.osc || !this.oscGain || !this.nitroGain || !this.skidGain) return;
    if (!this.engineEnabled) return;
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

  toggleMusic(): void {
    this.musicMuted = !this.musicMuted;
    this.musicGain?.gain.setTargetAtTime(
      this.musicMuted ? 0 : this.bgmVolume, this.ctx?.currentTime ?? 0, 0.05,
    );
  }

  /**
   * Tiny procedural chiptune loop (no assets): square-wave arpeggio over a
   * triangle bass in A minor pentatonic, 16 steps at 112 BPM, scheduled
   * ahead of time on the audio clock.
   */
  private startMusic(): void {
    if (!this.ctx || !this.master) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicMuted ? 0 : this.bgmVolume;
    this.musicGain.connect(this.master);

    const stepDur = 60 / 112 / 2; // eighth notes
    // A minor pentatonic riff (Hz); 0 = rest
    const lead = [220, 0, 262, 294, 330, 0, 294, 262, 220, 0, 196, 220, 330, 392, 330, 294];
    const bass = [110, 110, 0, 110, 98, 98, 0, 98, 87, 87, 0, 87, 98, 98, 110, 98];

    this.musicNextTime = this.ctx.currentTime + 0.1;
    const scheduleNote = (freq: number, t: number, dur: number, type: OscillatorType, vol: number) => {
      if (!freq || !this.ctx || !this.musicGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    };

    this.musicTimer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.musicNextTime < this.ctx.currentTime + 0.35) {
        const i = this.musicStep % 16;
        scheduleNote(lead[i], this.musicNextTime, stepDur * 0.9, 'square', 0.10);
        scheduleNote(bass[i], this.musicNextTime, stepDur * 0.95, 'triangle', 0.16);
        this.musicStep++;
        this.musicNextTime += stepDur;
      }
    }, 150);
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

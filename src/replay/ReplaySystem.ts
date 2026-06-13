import * as THREE from 'three';
import { Kart } from '../vehicle/Kart';

/**
 * Replay foundation (Phase 2): records every racer's body pose during a race
 * into a compact, serializable structure, and can play poses back at any
 * race time. A future replay viewer / spectator camera only needs to drive
 * visuals from ReplayPlayback — no physics required.
 *
 * The frame layout matches GhostSystem (x y z qx qy qz qw at 20 Hz).
 */

export const REPLAY_HZ = 20;
const FLOATS_PER_FRAME = 7;

export function encodeFrames(frames: Float32Array): string {
  let bin = '';
  const bytes = new Uint8Array(frames.buffer, frames.byteOffset, frames.byteLength);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function decodeFrames(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export interface ReplayRacerMeta {
  name: string;
  color: number;
  /** Vehicle database id when known (player); undefined for AI karts. */
  vehicleId?: string;
}

export interface ReplayResultRow {
  name: string;
  finishTime: number;
  bestLap: number;
}

/** Self-contained, JSON-serializable replay of one race. */
export interface ReplayData {
  version: 1;
  trackId: string;
  laps: number;
  mode: 'race' | 'timetrial';
  hz: number;
  /** ISO date of the recording. */
  date: string;
  racers: (ReplayRacerMeta & { frames: string })[];
  results: ReplayResultRow[];
}

/** Records all karts each fixed tick; sampled down to REPLAY_HZ. */
export class ReplayRecorder {
  private karts: Kart[] = [];
  private meta: ReplayRacerMeta[] = [];
  private frames: number[][] = [];
  private tick = 0;
  private trackId = '';
  private laps = 0;
  private mode: 'race' | 'timetrial' = 'race';
  recording = false;

  start(
    trackId: string, laps: number, mode: 'race' | 'timetrial',
    karts: Kart[], meta: ReplayRacerMeta[],
  ): void {
    this.trackId = trackId;
    this.laps = laps;
    this.mode = mode;
    this.karts = karts;
    this.meta = meta;
    this.frames = karts.map(() => []);
    this.tick = 0;
    this.recording = true;
  }

  /** Call once per physics tick while the race runs. */
  recordTick(): void {
    if (!this.recording) return;
    if (this.tick % 3 === 0) { // 60 Hz physics → 20 Hz frames
      this.karts.forEach((kart, i) => {
        const t = kart.body.translation();
        const r = kart.body.rotation();
        this.frames[i].push(t.x, t.y, t.z, r.x, r.y, r.z, r.w);
      });
    }
    this.tick++;
  }

  /** Stop recording and pack the replay. */
  finish(results: ReplayResultRow[]): ReplayData {
    this.recording = false;
    return {
      version: 1,
      trackId: this.trackId,
      laps: this.laps,
      mode: this.mode,
      hz: REPLAY_HZ,
      date: new Date().toISOString(),
      racers: this.meta.map((m, i) => ({
        ...m,
        frames: encodeFrames(new Float32Array(this.frames[i])),
      })),
      results,
    };
  }
}

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/** Interpolated pose lookup over a decoded replay. */
export class ReplayPlayback {
  private tracks: Float32Array[];

  constructor(public readonly data: ReplayData) {
    this.tracks = data.racers.map((r) => decodeFrames(r.frames));
  }

  get racerCount(): number {
    return this.tracks.length;
  }

  duration(racer: number): number {
    return (this.tracks[racer].length / FLOATS_PER_FRAME) / this.data.hz;
  }

  /** Write the pose of `racer` at `time` seconds into pos/quat. */
  poseAt(racer: number, time: number, pos: THREE.Vector3, quat: THREE.Quaternion): void {
    const track = this.tracks[racer];
    const frameCount = track.length / FLOATS_PER_FRAME;
    if (frameCount === 0) return;
    const f = Math.max(0, Math.min(time * this.data.hz, frameCount - 1.001));
    const i = Math.floor(f);
    const a = i * FLOATS_PER_FRAME;
    const b = Math.min(i + 1, frameCount - 1) * FLOATS_PER_FRAME;
    const t = f - i;
    _pa.set(track[a], track[a + 1], track[a + 2]);
    _pb.set(track[b], track[b + 1], track[b + 2]);
    _qa.set(track[a + 3], track[a + 4], track[a + 5], track[a + 6]);
    _qb.set(track[b + 3], track[b + 4], track[b + 5], track[b + 6]);
    pos.lerpVectors(_pa, _pb, t);
    quat.copy(_qa).slerp(_qb, t);
  }
}

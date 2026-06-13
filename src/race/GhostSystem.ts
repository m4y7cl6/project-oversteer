import * as THREE from 'three';
import { Kart } from '../vehicle/Kart';
import { KART } from '../game/config';
import { encodeFrames, decodeFrames } from '../replay/ReplaySystem';

const RECORD_HZ = 20; // body pose sampled every 3rd physics tick
const FLOATS_PER_FRAME = 7; // x y z qx qy qz qw

interface StoredGhost {
  time: number;
  hz: number;
  data: string; // base64 Float32Array
}

function storageKey(trackId: string, laps: number): string {
  return `nr-ghost:${trackId}:${laps}`;
}

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/**
 * Time-trial ghost: records the player's body pose at 20 Hz and replays the
 * best stored run (per track + lap count) as a translucent kart. Best runs
 * persist in localStorage.
 */
export class GhostSystem {
  bestTime = Infinity;

  private recording: number[] = [];
  private tick = 0;
  private playback?: Float32Array;
  private visual?: THREE.Object3D;
  private trackId = '';
  private laps = 0;

  /** Begin a time-trial run: load any stored best and show its ghost. */
  start(scene: THREE.Scene, playerKart: Kart, trackId: string, laps: number): void {
    this.dispose(scene);
    this.trackId = trackId;
    this.laps = laps;
    this.recording = [];
    this.tick = 0;
    this.playback = undefined;
    this.bestTime = Infinity;

    try {
      const raw = localStorage.getItem(storageKey(trackId, laps));
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredGhost;
      this.bestTime = stored.time;
      this.playback = decodeFrames(stored.data);
    } catch {
      return; // corrupt/absent ghost: run without one
    }

    // translucent clone of the player's kart (materials cloned, flair removed)
    const ghost = playerKart.visual.clone(true);
    ghost.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const ghostify = (m: THREE.Material): THREE.Material => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = 0.38;
        c.depthWrite = false;
        return c;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(ghostify)
        : ghostify(mesh.material);
    });
    this.visual = ghost;
    scene.add(ghost);
  }

  /** Call once per physics tick while the run is in progress. */
  recordTick(kart: Kart): void {
    if (this.tick % 3 === 0) {
      const t = kart.body.translation();
      const r = kart.body.rotation();
      this.recording.push(t.x, t.y, t.z, r.x, r.y, r.z, r.w);
    }
    this.tick++;
  }

  /** Move the ghost along its recorded run. */
  update(raceTime: number): void {
    if (!this.visual || !this.playback) return;
    const frameCount = this.playback.length / FLOATS_PER_FRAME;
    if (frameCount < 2) return;
    const f = Math.min(raceTime * RECORD_HZ, frameCount - 1.001);
    const i = Math.floor(f);
    const a = i * FLOATS_PER_FRAME;
    const b = Math.min(i + 1, frameCount - 1) * FLOATS_PER_FRAME;
    const t = f - i;
    const p = this.playback;
    _pa.set(p[a], p[a + 1], p[a + 2]);
    _pb.set(p[b], p[b + 1], p[b + 2]);
    _qa.set(p[a + 3], p[a + 4], p[a + 5], p[a + 6]);
    _qb.set(p[b + 3], p[b + 4], p[b + 5], p[b + 6]);
    this.visual.position.lerpVectors(_pa, _pb, t);
    this.visual.position.y -= KART.HALF_HEIGHT; // body center → visual origin
    this.visual.quaternion.copy(_qa).slerp(_qb, t);
  }

  /** Finish the run; persists it when it beats the stored best. Returns true on a new record. */
  finish(totalTime: number): boolean {
    if (totalTime >= this.bestTime) return false;
    try {
      const frames = new Float32Array(this.recording);
      const stored: StoredGhost = { time: totalTime, hz: RECORD_HZ, data: encodeFrames(frames) };
      localStorage.setItem(storageKey(this.trackId, this.laps), JSON.stringify(stored));
    } catch {
      // storage full/blocked: record stands for this session only
    }
    this.bestTime = totalTime;
    return true;
  }

  dispose(scene: THREE.Scene): void {
    if (this.visual) {
      scene.remove(this.visual);
      this.visual = undefined;
    }
  }
}

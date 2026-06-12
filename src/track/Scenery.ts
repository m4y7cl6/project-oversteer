import * as THREE from 'three';
import { TrackData } from './TrackData';
import { TRACK } from '../game/config';
import { mulberry32, trackBounds } from './TrackBuilder';

/** Racing Kit models the scenery dresser wants from the asset manifest. */
export const SCENERY_MODELS = [
  'overheadLights',
  'flagCheckers',
  'flagRed',
  'flagGreen',
  'bannerTowerRed',
  'bannerTowerGreen',
  'grandStand',
  'grandStandCovered',
  'lightPostModern',
  'treeLarge',
  'treeSmall',
  'pylon',
] as const;

/** Kenney Racing Kit units are ~half real-world scale for our 2.3 m karts. */
const KIT_SCALE = 2.5;

const _toTrack = new THREE.Vector3();

/**
 * Dresses the circuit with Kenney Racing Kit props: start gate, flags,
 * banner towers on the big corners, grandstands at the start straight,
 * light posts and trees. Purely visual — physics barriers are unchanged.
 * Does nothing when models are missing (procedural look stays).
 */
export class Scenery {
  private group = new THREE.Group();

  constructor(
    scene: THREE.Scene,
    private data: TrackData,
    private models: Map<string, THREE.Object3D>,
    trackGroup: THREE.Group,
    private seed = 1337,
  ) {
    this.group.name = 'scenery';
    scene.add(this.group);

    if (this.placeStartGate()) {
      trackGroup.getObjectByName('start-gate')?.removeFromParent();
    }
    this.placeFlags();
    this.placeBannerTowers();
    this.placeGrandstands();
    this.placeLightPosts();
    this.placePylons();
    if (this.placeTrees()) {
      trackGroup.getObjectByName('trees')?.removeFromParent();
    }
  }

  /** Remove all placed props (track switch). */
  dispose(): void {
    this.group.removeFromParent();
  }

  /**
   * Clone, scale, sit on the ground centered at pos, yaw to rotY.
   * Kenney prop origins are not always centered, so the model is re-centered
   * inside a wrapper and the wrapper carries position/rotation.
   * Returns the wrapper (null if the model is missing).
   */
  private place(name: string, pos: THREE.Vector3, rotY: number, scale = KIT_SCALE): THREE.Group | null {
    const template = this.models.get(name);
    if (!template) return null;
    const obj = template.clone(true);
    obj.scale.setScalar(scale);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    obj.position.set(-center.x, -box.min.y, -center.z);
    const wrapper = new THREE.Group();
    wrapper.add(obj);
    wrapper.position.copy(pos).setY(0);
    wrapper.rotation.y = rotY;
    this.group.add(wrapper);
    return wrapper;
  }

  /** Width (largest planar extent) of a model at scale 1, for span fitting. */
  private modelWidth(name: string): number {
    const template = this.models.get(name);
    if (!template) return 1;
    const box = new THREE.Box3().setFromObject(template);
    const size = box.getSize(new THREE.Vector3());
    return Math.max(size.x, size.z);
  }

  /** Yaw that makes a +Z-facing prop at `pos` look at the nearest track point. */
  private faceTrack(pos: THREE.Vector3, sampleIdx: number): number {
    const s = this.data.sample(sampleIdx);
    _toTrack.copy(s.pos).sub(pos).setY(0);
    return Math.atan2(_toTrack.x, _toTrack.z);
  }

  private placeStartGate(): boolean {
    const s = this.data.sample(0);
    // scale the gantry so it clears the full road width plus shoulders
    const targetSpan = TRACK.ROAD_HALF_WIDTH * 2 + 4;
    const scale = targetSpan / this.modelWidth('overheadLights');
    return this.place(
      'overheadLights',
      s.pos.clone(),
      Math.atan2(s.tangent.x, s.tangent.z),
      scale,
    ) !== null;
  }

  private placeFlags(): void {
    const n = this.data.sampleCount;
    const step = Math.round(n / 18); // ~18 flags around the lap
    const rand = mulberry32(7);
    for (let i = step; i < n; i += step) {
      const s = this.data.sample(i);
      const side = i % (step * 2) === 0 ? 1 : -1;
      const pos = s.pos.clone().addScaledVector(s.right, side * (TRACK.WALL_OFFSET + 2.2));
      const name = i < step * 2 ? 'flagCheckers' : rand() > 0.5 ? 'flagRed' : 'flagGreen';
      this.place(name, pos, this.faceTrack(pos, i));
    }
  }

  /** Banner towers mark the three sharpest corners, placed outside the bend. */
  private placeBannerTowers(): void {
    const peaks = this.curvaturePeaks(3, 40);
    peaks.forEach((idx, k) => {
      const s = this.data.sample(idx);
      const outside = Math.sign(s.curvature) * -1 || 1; // curvature>0 turns left ⇒ outside is right
      const pos = s.pos.clone().addScaledVector(s.right, outside * (TRACK.WALL_OFFSET + 5));
      this.place(k % 2 === 0 ? 'bannerTowerRed' : 'bannerTowerGreen', pos, this.faceTrack(pos, idx));
    });
  }

  private placeGrandstands(): void {
    // along the outside of the start straight
    const slots = [-14, 14, 42];
    const sampleStep = this.data.totalLength / this.data.sampleCount;
    slots.forEach((back, k) => {
      const idx = Math.round(
        ((this.data.sampleCount - back / sampleStep) % this.data.sampleCount),
      );
      const s = this.data.sample(idx);
      const pos = s.pos.clone().addScaledVector(s.right, TRACK.WALL_OFFSET + 9);
      this.place(k === 1 ? 'grandStandCovered' : 'grandStand', pos, this.faceTrack(pos, idx));
    });
  }

  private placeLightPosts(): void {
    const n = this.data.sampleCount;
    const step = Math.round(n / 10);
    for (let i = Math.round(step / 2); i < n; i += step) {
      const s = this.data.sample(i);
      const side = i % (step * 2) < step ? -1 : 1;
      const pos = s.pos.clone().addScaledVector(s.right, side * (TRACK.WALL_OFFSET + 1.6));
      this.place('lightPostModern', pos, this.faceTrack(pos, i));
    }
  }

  /** A few cones on the inside verge of the sharpest corner (decorative). */
  private placePylons(): void {
    const peaks = this.curvaturePeaks(2, 60);
    for (const idx of peaks) {
      const s = this.data.sample(idx);
      const inside = Math.sign(s.curvature) || 1; // left turn ⇒ inside is... left
      for (const off of [-6, 0, 6]) {
        const sp = this.data.sample(idx + off);
        const pos = sp.pos.clone().addScaledVector(
          sp.right,
          -inside * (TRACK.ROAD_HALF_WIDTH + 1.2),
        );
        this.place('pylon', pos, 0, KIT_SCALE * 0.9);
      }
    }
  }

  private placeTrees(): boolean {
    if (!this.models.has('treeLarge') || !this.models.has('treeSmall')) return false;
    const { min, max } = trackBounds(this.data, 60);
    const rand = mulberry32(this.seed);
    let placed = 0;
    let attempts = 0;
    const p = new THREE.Vector3();
    while (placed < 90 && attempts < 1200) {
      attempts++;
      p.set(min.x + rand() * (max.x - min.x), 0, min.z + rand() * (max.z - min.z));
      let minD = Infinity;
      for (let i = 0; i < this.data.sampleCount; i += 4) {
        minD = Math.min(minD, this.data.samples[i].pos.distanceToSquared(p));
      }
      const sizeRoll = rand();
      if (minD < 19 * 19 || minD > 200 * 200) continue;
      this.place(
        sizeRoll > 0.45 ? 'treeLarge' : 'treeSmall',
        p.clone(),
        rand() * Math.PI * 2,
        KIT_SCALE * (0.9 + rand() * 0.9),
      );
      placed++;
    }
    return placed > 0;
  }

  /** Indices of the `count` highest local |curvature| maxima, min `gap` samples apart. */
  private curvaturePeaks(count: number, gap: number): number[] {
    const n = this.data.sampleCount;
    const sorted = [...Array(n).keys()].sort(
      (a, b) => Math.abs(this.data.samples[b].curvature) - Math.abs(this.data.samples[a].curvature),
    );
    const peaks: number[] = [];
    for (const idx of sorted) {
      if (peaks.every((pk) => {
        const d = Math.abs(idx - pk);
        return Math.min(d, n - d) > gap;
      })) {
        peaks.push(idx);
        if (peaks.length === count) break;
      }
    }
    return peaks;
  }
}

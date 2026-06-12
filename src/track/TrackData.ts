import * as THREE from 'three';

/** One sampled point of the track centerline. */
export interface TrackSample {
  pos: THREE.Vector3;
  /** Unit tangent (direction of travel). */
  tangent: THREE.Vector3;
  /** Unit vector pointing to the right of the direction of travel. */
  right: THREE.Vector3;
  /** Signed curvature (1/m); positive = turning left. */
  curvature: number;
  /** Cumulative arc length from the start line, in m. */
  arc: number;
}

/** Immutable geometry/topology of a built track. */
export class TrackData {
  constructor(
    public readonly samples: TrackSample[],
    public readonly totalLength: number,
    /** Sample indices that act as checkpoints; index 0 is the finish line. */
    public readonly checkpointIndices: number[],
    public readonly roadHalfWidth: number,
  ) {}

  get sampleCount(): number {
    return this.samples.length;
  }

  sample(i: number): TrackSample {
    const n = this.samples.length;
    return this.samples[((i % n) + n) % n];
  }

  /**
   * Index of the sample closest to `pos`. With a `hint` only a window around
   * the previous result is scanned (cheap enough to call per kart per tick).
   */
  closestSampleIndex(pos: THREE.Vector3, hint?: number, window = 25): number {
    const n = this.samples.length;
    let best = -1;
    let bestD = Infinity;
    if (hint === undefined) {
      for (let i = 0; i < n; i++) {
        const d = this.samples[i].pos.distanceToSquared(pos);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }
    for (let off = -window; off <= window; off++) {
      const i = (((hint + off) % n) + n) % n;
      const d = this.samples[i].pos.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Signed lateral offset of `pos` from the centerline at sample `i` (positive = right side). */
  lateralOffset(pos: THREE.Vector3, i: number): number {
    const s = this.sample(i);
    return pos.clone().sub(s.pos).dot(s.right);
  }

  /** Forward distance in samples from a to b along the direction of travel. */
  forwardDelta(a: number, b: number): number {
    const n = this.samples.length;
    return (((b - a) % n) + n) % n;
  }

  /** Max |curvature| over the next `meters` of track from sample i. */
  maxCurvatureAhead(i: number, meters: number): number {
    const step = this.totalLength / this.samples.length;
    const count = Math.ceil(meters / step);
    let max = 0;
    for (let k = 0; k < count; k++) {
      max = Math.max(max, Math.abs(this.sample(i + k).curvature));
    }
    return max;
  }
}

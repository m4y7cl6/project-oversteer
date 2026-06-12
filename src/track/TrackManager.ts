import * as THREE from 'three';
import { TrackData } from './TrackData';
import { TRACK } from '../game/config';

/** Per-kart race progress, updated by TrackManager every physics tick. */
export class Progress {
  /** Index into TrackData.checkpointIndices that must be hit next; 0 = finish line. */
  nextCheckpoint = 0;
  /** Set on the first finish-line crossing right after GO (lap timing begins). */
  started = false;
  lap = 0; // completed laps
  /** Nearest centerline sample (cache/hint for cheap lookups). */
  sampleIndex = 0;
  /** Monotonic ranking score: grows with checkpoints and distance covered. */
  score = 0;
  /** Seconds spent driving against the track direction. */
  wrongWayTime = 0;
  finished = false;

  lapStartTime = 0;
  lapTimes: number[] = [];
  bestLap = Infinity;
  finishTime = Infinity;
}

export interface ProgressEvents {
  checkpoint: boolean;
  lapComplete: boolean;
  finished: boolean;
}

/**
 * Owns the track data and enforces the racing rules on top of it:
 * checkpoints must be crossed in order (CP1 -> CP2 -> ...), a lap counts only
 * after every checkpoint, and the finish line closes the race.
 */
export class TrackManager {
  constructor(public readonly data: TrackData, public totalLaps: number) {}

  /**
   * Advance one kart's progress. `raceTime` is seconds since GO.
   * Returns which events fired this tick.
   */
  updateProgress(
    progress: Progress,
    position: THREE.Vector3,
    forward: THREE.Vector3,
    dt: number,
    raceTime: number,
  ): ProgressEvents {
    const events: ProgressEvents = { checkpoint: false, lapComplete: false, finished: false };
    const data = this.data;

    progress.sampleIndex = data.closestSampleIndex(position, progress.sampleIndex);

    // wrong-way: facing against the local tangent while on/near the road
    const tangent = data.sample(progress.sampleIndex).tangent;
    if (forward.dot(tangent) < -0.35) {
      progress.wrongWayTime += dt;
    } else {
      progress.wrongWayTime = 0;
    }

    if (!progress.finished) {
      // checkpoint crossing: within the sample window of the next gate and on the road
      const cpSample = data.checkpointIndices[progress.nextCheckpoint];
      const delta = Math.min(
        data.forwardDelta(cpSample, progress.sampleIndex),
        data.forwardDelta(progress.sampleIndex, cpSample),
      );
      const onRoad = Math.abs(data.lateralOffset(position, progress.sampleIndex)) <
        TRACK.WALL_OFFSET + 2;
      if (delta <= TRACK.CHECKPOINT_WINDOW && onRoad) {
        events.checkpoint = true;
        const cpCount = data.checkpointIndices.length;
        if (progress.nextCheckpoint === 0) {
          if (!progress.started) {
            // first crossing right after GO: the lap clock starts here
            progress.started = true;
            progress.lapStartTime = raceTime;
          } else {
            const lapTime = raceTime - progress.lapStartTime;
            progress.lapTimes.push(lapTime);
            progress.bestLap = Math.min(progress.bestLap, lapTime);
            progress.lap++;
            progress.lapStartTime = raceTime;
            events.lapComplete = true;
            if (progress.lap >= this.totalLaps) {
              progress.finished = true;
              progress.finishTime = raceTime;
              events.finished = true;
            }
          }
        }
        progress.nextCheckpoint = (progress.nextCheckpoint + 1) % cpCount;
      }
    }

    // ranking score: cleared gates dominate, distance-to-next-gate breaks ties
    const cpCount = data.checkpointIndices.length;
    const gatesInLap = progress.started
      ? (progress.nextCheckpoint === 0 ? cpCount : progress.nextCheckpoint)
      : 0;
    const gatesDone = progress.lap * cpCount + gatesInLap;
    const nextGate = data.sample(data.checkpointIndices[progress.nextCheckpoint]);
    const distToNext = position.distanceTo(nextGate.pos);
    progress.score = gatesDone * 10000 + Math.max(0, 5000 - distToNext);

    return events;
  }

  /** Grid slot (position + heading) for starting place `i` (0 = pole, at the front). */
  startTransform(i: number): { position: THREE.Vector3; rotationY: number } {
    const data = this.data;
    const rowSpacing = 4.5;
    const colOffset = 3.2;
    // grid sits behind the finish line
    const back = 10 + Math.floor(i / 2) * rowSpacing;
    const sampleStep = data.totalLength / data.sampleCount;
    const idx = data.sampleCount - Math.round(back / sampleStep);
    const s = data.sample(idx);
    const side = i % 2 === 0 ? -1 : 1;
    const position = s.pos.clone().addScaledVector(s.right, side * colOffset);
    position.y = 0.36; // collider half-height + a hair, so grid karts rest on the road

    return { position, rotationY: Math.atan2(s.tangent.x, s.tangent.z) };
  }
}

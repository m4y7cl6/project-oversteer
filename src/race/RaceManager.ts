import { Kart } from '../vehicle/Kart';
import { AIController } from '../vehicle/AIController';
import { Progress, TrackManager } from '../track/TrackManager';
import { AI, RACE } from '../game/config';

export type RaceState = 'idle' | 'countdown' | 'racing' | 'postrace';

export interface RacerEntry {
  kart: Kart;
  progress: Progress;
  ai?: AIController;
}

export interface RaceEvents {
  onPlayerLap?(lap: number, totalLaps: number, lapTime: number): void;
  onPlayerCheckpoint?(): void;
  onPlayerFinish?(): void;
  onRacerFinish?(entry: RacerEntry): void;
}

/**
 * Race orchestration: the GO clock, per-kart progress/laps via TrackManager,
 * live ranking, AI rubber-banding and respawns.
 */
export class RaceManager {
  state: RaceState = 'idle';
  raceTime = 0;
  entries: RacerEntry[] = [];
  /** entries sorted best-first; refreshed every tick while racing */
  rankings: RacerEntry[] = [];
  events: RaceEvents = {};

  constructor(public readonly trackManager: TrackManager) {}

  setup(entries: RacerEntry[]): void {
    this.entries = entries;
    this.rankings = [...entries];
    this.raceTime = 0;
    this.state = 'countdown';
    entries.forEach((e, i) => {
      const t = this.trackManager.startTransform(i);
      e.kart.placeAt(t.position, t.rotationY);
      // seed the sample hint so closest-sample searches start near the grid
      e.progress.sampleIndex = this.trackManager.data.closestSampleIndex(t.position);
    });
  }

  go(): void {
    this.state = 'racing';
    this.raceTime = 0;
  }

  get player(): RacerEntry {
    return this.entries[0];
  }

  rankOf(entry: RacerEntry): number {
    return this.rankings.indexOf(entry) + 1;
  }

  fixedUpdate(dt: number): void {
    if (this.state !== 'racing' && this.state !== 'postrace') return;
    this.raceTime += dt;

    for (const e of this.entries) {
      const pos = e.kart.position;
      const ev = this.trackManager.updateProgress(
        e.progress, pos, e.kart.forward, dt, this.raceTime,
      );

      // off-road state feeds the handling model (drag, low grip)
      const lateral = Math.abs(
        this.trackManager.data.lateralOffset(pos, e.progress.sampleIndex),
      );
      e.kart.state.offroad = lateral > this.trackManager.data.roadHalfWidth + 0.4;

      if (pos.y < RACE.RESET_DROP_Y) this.respawn(e);

      const isPlayer = e === this.player;
      if (ev.lapComplete && isPlayer && !e.progress.finished) {
        this.events.onPlayerLap?.(
          e.progress.lap,
          this.trackManager.totalLaps,
          e.progress.lapTimes[e.progress.lapTimes.length - 1],
        );
      }
      if (ev.finished) {
        this.events.onRacerFinish?.(e);
        if (isPlayer) {
          this.state = 'postrace';
          this.events.onPlayerFinish?.();
        }
      }
    }

    this.updateRankings();
    this.updateRubberBand();
  }

  /** Put a kart back on the centerline at its last known sample, facing forward. */
  respawn(e: RacerEntry): void {
    const s = this.trackManager.data.sample(e.progress.sampleIndex);
    const pos = s.pos.clone();
    pos.y = 0.8;
    e.kart.placeAt(pos, Math.atan2(s.tangent.x, s.tangent.z));
  }

  get allFinished(): boolean {
    return this.entries.every((e) => e.progress.finished);
  }

  private updateRankings(): void {
    this.rankings.sort((a, b) => {
      if (a.progress.finished && b.progress.finished) {
        return a.progress.finishTime - b.progress.finishTime;
      }
      if (a.progress.finished !== b.progress.finished) {
        return a.progress.finished ? -1 : 1;
      }
      return b.progress.score - a.progress.score;
    });
  }

  /** Keep the pack close: trailing AI get a touch more speed, leaders less. */
  private updateRubberBand(): void {
    const playerScore = this.player.progress.score;
    for (const e of this.entries) {
      if (!e.ai) continue;
      const gateDiff = (playerScore - e.progress.score) / 10000; // + = AI behind
      e.ai.speedMultiplier = gateDiff >= 0
        ? 1 + Math.min(gateDiff * AI.RUBBER_BAND_BEHIND, 0.14)
        : 1 + Math.max(gateDiff * AI.RUBBER_BAND_AHEAD, -0.08);
    }
  }
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds * 1000) % 1000);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

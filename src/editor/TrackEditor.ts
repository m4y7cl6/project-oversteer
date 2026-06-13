import { TrackDefinition, TrackTheme, THEMES } from '../track/tracks';
import { SaveSystem } from '../save/SaveSystem';

/**
 * Track editor foundation (Phase 2): the data model, validation and storage
 * for user-made circuits. A future editor UI manipulates CustomTrack control
 * points and feeds the result straight into the existing TrackBuilder —
 * custom tracks are plain TrackDefinitions.
 */

export interface CustomTrack extends TrackDefinition {
  /** Marks tracks created by the editor (menu shows them separately). */
  custom: true;
  createdAt: string;
  updatedAt: string;
}

const SLOT = 'custom-tracks';
const VERSION = 1;
const MIN_POINTS = 6;
const MIN_POINT_SPACING = 18; // m between consecutive control points
const MIN_CORRIDOR_CLEARANCE = 30; // m between non-adjacent points (road is ~27 m wide)
const MAX_EXTENT = 450; // m, keeps tracks inside the 1000 m ground plane

/** Human-readable problems; an empty array means the track is buildable. */
export function validateTrack(def: Pick<TrackDefinition, 'controlPoints' | 'theme' | 'name'>): string[] {
  const errors: string[] = [];
  const pts = def.controlPoints;

  if (!def.name.trim()) errors.push('Track needs a name.');
  if (!(def.theme in THEMES)) errors.push(`Unknown theme "${def.theme}".`);
  if (pts.length < MIN_POINTS) {
    errors.push(`Need at least ${MIN_POINTS} control points (got ${pts.length}).`);
    return errors; // the geometric checks below assume a polygon
  }

  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    if (Math.abs(ax) > MAX_EXTENT || Math.abs(az) > MAX_EXTENT) {
      errors.push(`Point ${i} is out of bounds (±${MAX_EXTENT} m).`);
    }
    const [bx, bz] = pts[(i + 1) % pts.length];
    if (Math.hypot(bx - ax, bz - az) < MIN_POINT_SPACING) {
      errors.push(`Points ${i} and ${(i + 1) % pts.length} are closer than ${MIN_POINT_SPACING} m.`);
    }
  }

  // non-adjacent points must keep room for two road corridors
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 2; j < pts.length; j++) {
      if (i === 0 && j === pts.length - 1) continue; // adjacent across the loop seam
      const d = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
      if (d < MIN_CORRIDOR_CLEARANCE) {
        errors.push(`Points ${i} and ${j} are closer than ${MIN_CORRIDOR_CLEARANCE} m — corridors would overlap.`);
      }
    }
  }

  return errors;
}

export function createCustomTrack(
  name: string,
  controlPoints: [number, number][],
  theme: TrackTheme = 'meadow',
): CustomTrack {
  const now = new Date().toISOString();
  return {
    id: `custom-${Date.now().toString(36)}`,
    name,
    controlPoints,
    seed: Math.floor(Math.random() * 0xffff),
    theme,
    unlockCost: 0,
    custom: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** localStorage-backed library of editor tracks. */
export class CustomTrackStore {
  list(): CustomTrack[] {
    return SaveSystem.load<CustomTrack[]>(SLOT, VERSION) ?? [];
  }

  /** Insert or update by id. Returns validation errors (saves only when empty). */
  save(track: CustomTrack): string[] {
    const errors = validateTrack(track);
    if (errors.length > 0) return errors;
    const all = this.list().filter((t) => t.id !== track.id);
    all.push({ ...track, updatedAt: new Date().toISOString() });
    SaveSystem.save(SLOT, VERSION, all);
    return [];
  }

  remove(id: string): void {
    SaveSystem.save(SLOT, VERSION, this.list().filter((t) => t.id !== id));
  }
}

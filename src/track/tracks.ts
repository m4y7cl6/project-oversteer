/** Track definitions: a closed control polygon on the XZ plane (flat). */

export interface TrackDefinition {
  id: string;
  name: string;
  /** Control points in order of travel; the spline closes automatically. */
  controlPoints: [number, number][];
  /** Seed for deterministic scenery scatter. */
  seed: number;
}

/** Original circuit: flowing S-curves with one hairpin-ish top section. */
export const SUNRISE_CIRCUIT: TrackDefinition = {
  id: 'sunrise',
  name: 'SUNRISE CIRCUIT',
  controlPoints: [
    [0, 0],
    [60, 0],
    [110, 14],
    [142, 50],
    [132, 96],
    [92, 122],
    [42, 110],
    [12, 142],
    [-28, 164],
    [-72, 144],
    [-82, 96],
    [-98, 46],
    [-62, 6],
    [-30, -4],
  ],
  seed: 1337,
};

/** Faster layout: long kinked start straight, two sweepers, a top chicane
 *  and a tight S on the way back. */
export const THUNDER_LOOP: TrackDefinition = {
  id: 'thunder',
  name: 'THUNDER LOOP',
  controlPoints: [
    [-60, 0],
    [30, -6],
    [95, 0],
    [135, 35],
    [135, 85],
    [100, 115],
    [105, 150],
    [70, 170],
    [25, 155],
    [35, 110],
    [-5, 95],
    [-45, 120],
    [-85, 100],
    [-95, 50],
    [-90, 10],
  ],
  seed: 4242,
};

export const TRACKS: TrackDefinition[] = [SUNRISE_CIRCUIT, THUNDER_LOOP];

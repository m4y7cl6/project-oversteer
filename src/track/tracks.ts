/** Track definitions: a closed control polygon on the XZ plane (flat). */

export type TrackTheme = 'meadow' | 'forest' | 'desert' | 'city';

/** Visual environment for a theme: sky/fog/light + ground + scattered props. */
export interface TrackThemeConfig {
  skyColor: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  sunColor: number;
  sunIntensity: number;
  /** Procedural ground texture colors (base + two speckle tones). */
  ground: { base: string; speckleA: string; speckleB: string };
  /** Which procedural props TrackBuilder scatters around the circuit. */
  props: 'trees' | 'pines' | 'cacti' | 'buildings';
  /** Whether Kenney kit trees may replace the procedural ones. */
  kitTrees: boolean;
}

export const THEMES: Record<TrackTheme, TrackThemeConfig> = {
  meadow: {
    skyColor: 0x7ec8f0, fogColor: 0x9adcf5, fogNear: 140, fogFar: 480,
    hemiSky: 0xcfeeff, hemiGround: 0x3e6b3a, sunColor: 0xfff4d6, sunIntensity: 1.5,
    ground: { base: '#3d7a35', speckleA: 'rgba(46,98,40,0.6)', speckleB: 'rgba(88,150,70,0.5)' },
    props: 'trees', kitTrees: true,
  },
  forest: {
    skyColor: 0x6fb3d8, fogColor: 0x86c0ad, fogNear: 90, fogFar: 380,
    hemiSky: 0xbfe3d6, hemiGround: 0x1f4d2a, sunColor: 0xf2ffd9, sunIntensity: 1.25,
    ground: { base: '#2c5d28', speckleA: 'rgba(26,66,28,0.65)', speckleB: 'rgba(64,110,48,0.5)' },
    props: 'pines', kitTrees: true,
  },
  desert: {
    skyColor: 0xffd9a0, fogColor: 0xf3c98b, fogNear: 150, fogFar: 520,
    hemiSky: 0xffe8c4, hemiGround: 0x8a6b3d, sunColor: 0xffe2b0, sunIntensity: 1.8,
    ground: { base: '#d2a35c', speckleA: 'rgba(176,128,64,0.55)', speckleB: 'rgba(232,196,128,0.5)' },
    props: 'cacti', kitTrees: false,
  },
  city: {
    skyColor: 0x131a33, fogColor: 0x1b2342, fogNear: 110, fogFar: 420,
    hemiSky: 0x4a5a8a, hemiGround: 0x10141f, sunColor: 0x9db4ff, sunIntensity: 0.9,
    ground: { base: '#2a2d33', speckleA: 'rgba(30,32,38,0.6)', speckleB: 'rgba(62,66,76,0.5)' },
    props: 'buildings', kitTrees: false,
  },
};

export interface TrackDefinition {
  id: string;
  name: string;
  /** Control points in order of travel; the spline closes automatically. */
  controlPoints: [number, number][];
  /** Seed for deterministic scenery scatter. */
  seed: number;
  theme: TrackTheme;
  /** Coins needed to unlock in career mode (0 = free). */
  unlockCost: number;
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
  theme: 'meadow',
  unlockCost: 0,
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
  theme: 'meadow',
  unlockCost: 0,
};

/** Tight, twisty run between the pines — a drift playground. */
export const EMERALD_WOODS: TrackDefinition = {
  id: 'emerald',
  name: 'EMERALD WOODS',
  controlPoints: [
    [0, 0],
    [50, -8],
    [92, 8],
    [120, 42],
    [110, 82],
    [74, 92],
    [60, 126],
    [82, 160],
    [50, 192],
    [4, 182],
    [-26, 150],
    [-14, 114],
    [-46, 92],
    [-82, 102],
    [-106, 70],
    [-96, 28],
    [-58, 4],
    [-28, -6],
  ],
  seed: 9001,
  theme: 'forest',
  unlockCost: 300,
};

/** Wide, flowing sweepers over open dunes — built for top speed. */
export const DUNE_BLAZE: TrackDefinition = {
  id: 'dune',
  name: 'DUNE BLAZE',
  controlPoints: [
    [0, 0],
    [72, -10],
    [132, 10],
    [170, 60],
    [158, 120],
    [108, 150],
    [48, 140],
    [-4, 162],
    [-64, 172],
    [-114, 140],
    [-132, 84],
    [-110, 28],
    [-58, -4],
  ],
  seed: 7077,
  theme: 'desert',
  unlockCost: 500,
};

/** Night street circuit: squared-off blocks and short straights. */
export const NEON_DISTRICT: TrackDefinition = {
  id: 'neon',
  name: 'NEON DISTRICT',
  controlPoints: [
    [0, 0],
    [58, 0],
    [98, 6],
    [104, 46],
    [98, 84],
    [60, 90],
    [56, 128],
    [90, 136],
    [94, 174],
    [54, 180],
    [0, 174],
    [-52, 180],
    [-96, 168],
    [-100, 124],
    [-62, 118],
    [-56, 80],
    [-96, 74],
    [-100, 30],
    [-58, 4],
  ],
  seed: 2077,
  theme: 'city',
  unlockCost: 800,
};

export const TRACKS: TrackDefinition[] = [
  SUNRISE_CIRCUIT,
  THUNDER_LOOP,
  EMERALD_WOODS,
  DUNE_BLAZE,
  NEON_DISTRICT,
];

export function trackById(id: string): TrackDefinition {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

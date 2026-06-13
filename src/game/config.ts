/** Central tuning constants for NITRO RUSH. All units are SI (m, s, kg) unless noted. */

export const PHYSICS = {
  /** Fixed physics timestep (Hz). */
  TICK_RATE: 60,
  GRAVITY: -19.62, // 2x earth gravity keeps karts planted (arcade feel)
};

export const KART = {
  // chassis collider half-extents
  HALF_WIDTH: 0.75,
  HALF_HEIGHT: 0.35,
  HALF_LENGTH: 1.05,
  MASS: 180,

  // drive
  ENGINE_ACCEL: 26, // m/s^2 at standstill, tapers toward max speed
  BRAKE_DECEL: 30,
  REVERSE_ACCEL: 14,
  MAX_SPEED: 30, // ~108 km/h
  MAX_REVERSE_SPEED: 10,
  ROLLING_DRAG: 1.1, // 1/s decay of forward speed when coasting
  OFFROAD_DRAG: 2.4,
  OFFROAD_MAX_SPEED: 16,

  // steering
  STEER_RATE: 1.9, // rad/s yaw at full lock, low speed
  STEER_HIGH_SPEED_FALLOFF: 0.45, // fraction of steer kept at max speed
  MIN_STEER_SPEED: 0.8, // below this the kart doesn't yaw

  // grip (per-second decay rate of lateral velocity)
  GRIP_NORMAL: 9.0,
  GRIP_DRIFT: 2.4,
  GRIP_OFFROAD: 5.0,
};

export const DRIFT = {
  MIN_SPEED: 11, // m/s needed to start/maintain a drift
  MIN_STEER: 0.25,
  YAW_BOOST: 1.55, // steering multiplier while drifting
  COUNTER_STEER_GRIP: 4.0, // extra grip when counter-steering, lets you straighten out
  MIN_SLIP_DEG: 8, // slip angle that starts counting score
  SCORE_RATE: 22, // points per second per radian of slip
  GAUGE_PER_SCORE: 0.030, // nitro gauge % gained per drift point

  MINI_BOOST_ACCEL: 24, // extra m/s^2 while a mini-boost is active
};

/** One release-boost tier (KartRider-style spark color). */
export interface DriftTier {
  name: 'BLUE' | 'RED' | 'PURPLE';
  /** Drift score required to reach this tier. */
  score: number;
  /** Spark/smoke color while sliding at this tier. */
  color: number;
  /** Seconds of extra accel after release. */
  boostTime: number;
  /** Instant m/s on release. */
  kick: number;
  /** Max-speed headroom while the mini-boost runs. */
  maxBonus: number;
  /** Bonus nitro gauge granted on release — better drifts charge nitro faster. */
  nitroBonus: number;
}

/** Release-boost tiers, ascending: hold a drift longer for a bigger reward. */
export const DRIFT_TIERS: DriftTier[] = [
  { name: 'BLUE',   score: 40,  color: 0x55d6ff, boostTime: 1.1, kick: 3.5, maxBonus: 5,  nitroBonus: 6 },
  { name: 'RED',    score: 110, color: 0xff5252, boostTime: 2.0, kick: 6.0, maxBonus: 9,  nitroBonus: 14 },
  { name: 'PURPLE', score: 210, color: 0xd05cff, boostTime: 3.0, kick: 8.5, maxBonus: 13, nitroBonus: 28 },
];

export const NITRO = {
  GAUGE_MAX: 100,
  BOOST_DURATION: 2.6, // s
  BOOST_MAX_SPEED: 41, // ~148 km/h
  BOOST_ACCEL: 38,
  BOOST_KICK_IMPULSE: 6, // instant m/s added on activation (clamped by max speed)
};

export const CAMERA = {
  DISTANCE: 7.2,
  HEIGHT: 3.1,
  LOOK_AHEAD: 6.5,
  POS_LERP: 5.5, // 1/s smoothing
  FOV_BASE: 68,
  FOV_NITRO: 84,
  FOV_SPEED_GAIN: 6, // extra fov at max normal speed
  FOV_LERP: 4.0,
};

export const TRACK = {
  ROAD_HALF_WIDTH: 8,
  WALL_OFFSET: 13.5, // distance from centerline to barriers
  WALL_HEIGHT: 1.1,
  SAMPLES: 420, // centerline resolution
  CHECKPOINTS: 12,
  CHECKPOINT_WINDOW: 5, // sample tolerance when crossing a checkpoint (~±10 m)
};

export const RACE = {
  KART_COUNT: 8, // 1 player + 7 AI
  COUNTDOWN_SECONDS: 3,
  WRONG_WAY_GRACE: 1.2, // s of driving backwards before warning shows
  RESET_DROP_Y: -5, // auto-respawn if a kart falls below this
};

export const AI = {
  LOOKAHEAD_MIN: 7,
  LOOKAHEAD_SPEED_FACTOR: 0.55, // extra lookahead per m/s
  STEER_GAIN: 1.4,
  CORNER_LAT_ACCEL: 11, // m/s^2 cornering limit; target speed = sqrt(a/curvature)
  AVOID_RADIUS: 4.2,
  AVOID_STEER: 0.55,
  NITRO_STRAIGHT_CURVATURE: 0.012, // may boost when curvature ahead is below this
  /** Rubber banding: speed multiplier slope per checkpoint behind/ahead of the player. */
  RUBBER_BAND_BEHIND: 0.022,
  RUBBER_BAND_AHEAD: 0.012,
};

export interface RacerSpec {
  name: string;
  color: number;
  accent: number;
  /** AI skill multiplier on target speed (player entry ignored). */
  skill: number;
  /** Preferred lateral offset from racing line, in m. */
  lineOffset: number;
  /** glTF model name from the asset manifest (procedural kart when absent/unloadable). */
  model?: string;
}

export const RACERS: RacerSpec[] = [
  { name: 'YOU',    color: 0x00e5ff, accent: 0x055a66, skill: 1.0,  lineOffset: 0,    model: 'kart-oobi' },
  { name: 'VIPER',  color: 0xff1744, accent: 0x5d0a1a, skill: 1.0,  lineOffset: -2.2, model: 'kart-oodi' },
  { name: 'JOLT',   color: 0xffea00, accent: 0x665e00, skill: 0.97, lineOffset: 2.4,  model: 'kart-ooli' },
  { name: 'TURBO',  color: 0xff9100, accent: 0x663a00, skill: 0.95, lineOffset: -4.0, model: 'kart-oopi' },
  { name: 'NEON',   color: 0xd500f9, accent: 0x4f005c, skill: 0.93, lineOffset: 3.8,  model: 'kart-oozi' },
  { name: 'BLITZ',  color: 0x00e676, accent: 0x00592e, skill: 0.91, lineOffset: -1.2, model: 'race' },
  { name: 'COMET',  color: 0x2979ff, accent: 0x0d2c66, skill: 0.89, lineOffset: 1.4,  model: 'race-future' },
  { name: 'DRIFTA', color: 0xffffff, accent: 0x555555, skill: 0.87, lineOffset: -3.0, model: 'raceCarWhite' },
];

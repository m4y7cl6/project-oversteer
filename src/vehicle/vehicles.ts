/**
 * Vehicle database + upgrade system.
 *
 * Stats are multipliers (1.0 = the baseline KART/NITRO tuning in config.ts)
 * applied by Kart.fixedUpdate, so every point here changes real physics:
 *   speed    → max speed (normal and nitro)
 *   accel    → engine acceleration
 *   handling → lateral grip and steering rate
 *   nitro    → boost duration, gauge fill rate and drift-tier nitro bonuses
 */

export interface VehicleStats {
  speed: number;
  accel: number;
  handling: number;
  nitro: number;
}

export const DEFAULT_STATS: VehicleStats = { speed: 1, accel: 1, handling: 1, nitro: 1 };

export interface VehicleDefinition {
  id: string;
  name: string;
  description: string;
  /** Coin price in the garage; 0 = owned from the start. */
  cost: number;
  color: number;
  accent: number;
  /** glTF model name from the asset manifest (procedural kart when absent). */
  model?: string;
  stats: VehicleStats;
}

export const VEHICLES: VehicleDefinition[] = [
  {
    id: 'volt',
    name: 'VOLT GT',
    description: 'Balanced all-rounder. Where every career begins.',
    cost: 0,
    color: 0x00e5ff,
    accent: 0x055a66,
    model: 'kart-oobi',
    stats: { speed: 1.0, accel: 1.0, handling: 1.0, nitro: 1.0 },
  },
  {
    id: 'aero',
    name: 'AERO ONE',
    description: 'Slippery top-speed machine. Needs long straights.',
    cost: 600,
    color: 0x2979ff,
    accent: 0x0d2c66,
    model: 'race-future',
    stats: { speed: 1.08, accel: 0.94, handling: 0.95, nitro: 1.0 },
  },
  {
    id: 'brute',
    name: 'BRUTE X',
    description: 'Monster launch off every corner; a handful in the bends.',
    cost: 900,
    color: 0xff9100,
    accent: 0x663a00,
    model: 'race',
    stats: { speed: 0.98, accel: 1.12, handling: 0.93, nitro: 1.02 },
  },
  {
    id: 'drifta',
    name: 'DRIFTA SE',
    description: 'Razor-sharp steering built for drift chains.',
    cost: 1200,
    color: 0xffffff,
    accent: 0x555555,
    model: 'raceCarWhite',
    stats: { speed: 0.97, accel: 1.0, handling: 1.12, nitro: 1.04 },
  },
  {
    id: 'nitrox',
    name: 'NITRO-X',
    description: 'Experimental nitro plant. Lives on the boost gauge.',
    cost: 1500,
    color: 0xd500f9,
    accent: 0x4f005c,
    model: 'kart-oozi',
    stats: { speed: 1.0, accel: 0.97, handling: 0.98, nitro: 1.22 },
  },
];

export function vehicleById(id: string): VehicleDefinition {
  return VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
}

// ---------------- upgrades ----------------

export type UpgradeKey = 'engine' | 'tires' | 'nitroTank' | 'steering';

/** Upgrade levels per slot for one vehicle (0 = stock). */
export type UpgradeLevels = Record<UpgradeKey, number>;

export const STOCK_UPGRADES: UpgradeLevels = { engine: 0, tires: 0, nitroTank: 0, steering: 0 };

export interface UpgradeDefinition {
  key: UpgradeKey;
  name: string;
  description: string;
  /** Coin cost of each level (length = max level). */
  costs: number[];
  /** Additive stat bonus per level, applied on top of the vehicle's base stats. */
  bonus: Partial<VehicleStats>;
}

export const UPGRADES: UpgradeDefinition[] = [
  {
    key: 'engine',
    name: 'ENGINE',
    description: 'Top speed & acceleration',
    costs: [200, 450, 900],
    bonus: { speed: 0.03, accel: 0.03 },
  },
  {
    key: 'tires',
    name: 'TIRES',
    description: 'Cornering grip',
    costs: [150, 350, 700],
    bonus: { handling: 0.04 },
  },
  {
    key: 'nitroTank',
    name: 'NITRO TANK',
    description: 'Boost duration & charge rate',
    costs: [180, 400, 800],
    bonus: { nitro: 0.06 },
  },
  {
    key: 'steering',
    name: 'STEERING',
    description: 'Steering response',
    costs: [150, 350, 700],
    bonus: { handling: 0.025, accel: 0.01 },
  },
];

export function upgradeByKey(key: UpgradeKey): UpgradeDefinition {
  return UPGRADES.find((u) => u.key === key)!;
}

/** Base vehicle stats + every purchased upgrade level. */
export function effectiveStats(
  vehicle: VehicleDefinition,
  upgrades: UpgradeLevels = STOCK_UPGRADES,
): VehicleStats {
  const out: VehicleStats = { ...vehicle.stats };
  for (const def of UPGRADES) {
    const level = upgrades[def.key] ?? 0;
    for (const [stat, inc] of Object.entries(def.bonus) as [keyof VehicleStats, number][]) {
      out[stat] += inc * level;
    }
  }
  return out;
}

/** 0..5 bar rating for garage UI (1.0 multiplier ≈ 2.5 bars). */
export function statBars(value: number): number {
  return Math.max(0.5, Math.min(5, ((value - 0.85) / 0.3) * 5));
}

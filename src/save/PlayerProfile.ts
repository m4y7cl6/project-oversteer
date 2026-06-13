import { SaveSystem } from './SaveSystem';
import {
  UpgradeKey, UpgradeLevels, STOCK_UPGRADES, VEHICLES, VehicleStats,
  effectiveStats, upgradeByKey, vehicleById,
} from '../vehicle/vehicles';

/** Per-track career records. Best race times are keyed by lap count. */
export interface TrackRecord {
  bestLap: number;
  bestTimes: Record<number, number>;
  racesCompleted: number;
  wins: number;
}

export interface ProfileSettings {
  bgmVolume: number; // 0..1
  sfxVolume: number; // 0..1
}

interface ProfileData {
  coins: number;
  totalRaces: number;
  totalWins: number;
  totalDriftScore: number;
  selectedVehicle: string;
  unlockedVehicles: string[];
  unlockedTracks: string[];
  /** vehicle id → upgrade levels */
  upgrades: Record<string, UpgradeLevels>;
  records: Record<string, TrackRecord>;
  settings: ProfileSettings;
}

const SLOT = 'profile';
const VERSION = 1;

/** Tracks playable without spending coins. */
const FREE_TRACKS = ['sunrise', 'thunder'];

function defaults(): ProfileData {
  return {
    coins: 0,
    totalRaces: 0,
    totalWins: 0,
    totalDriftScore: 0,
    selectedVehicle: VEHICLES[0].id,
    unlockedVehicles: VEHICLES.filter((v) => v.cost === 0).map((v) => v.id),
    unlockedTracks: [...FREE_TRACKS],
    upgrades: {},
    records: {},
    settings: { bgmVolume: 0.5, sfxVolume: 1.0 },
  };
}

/**
 * The player's career: coins, owned vehicles/upgrades, unlocked tracks,
 * per-track records and settings. Every mutation auto-saves to localStorage.
 */
export class PlayerProfile {
  private data: ProfileData;

  constructor() {
    const loaded = SaveSystem.load<ProfileData>(SLOT, VERSION);
    // merge over defaults so older saves gain new fields transparently
    this.data = { ...defaults(), ...(loaded ?? {}) };
    if (loaded) {
      this.data.settings = { ...defaults().settings, ...loaded.settings };
    }
  }

  private persist(): void {
    SaveSystem.save(SLOT, VERSION, this.data);
  }

  // ---------------- coins ----------------

  get coins(): number { return this.data.coins; }
  get totalRaces(): number { return this.data.totalRaces; }
  get totalWins(): number { return this.data.totalWins; }

  addCoins(amount: number): void {
    this.data.coins += Math.max(0, Math.round(amount));
    this.persist();
  }

  /** Spend coins; returns false (and changes nothing) when balance is short. */
  spendCoins(amount: number): boolean {
    if (this.data.coins < amount) return false;
    this.data.coins -= amount;
    this.persist();
    return true;
  }

  // ---------------- vehicles & upgrades ----------------

  get selectedVehicleId(): string { return this.data.selectedVehicle; }

  selectVehicle(id: string): void {
    if (!this.ownsVehicle(id)) return;
    this.data.selectedVehicle = id;
    this.persist();
  }

  ownsVehicle(id: string): boolean {
    return this.data.unlockedVehicles.includes(id);
  }

  /** Buy a vehicle with coins; returns success. */
  buyVehicle(id: string): boolean {
    const v = vehicleById(id);
    if (this.ownsVehicle(id) || !this.spendCoins(v.cost)) return false;
    this.data.unlockedVehicles.push(id);
    this.persist();
    return true;
  }

  upgradesOf(vehicleId: string): UpgradeLevels {
    return { ...STOCK_UPGRADES, ...this.data.upgrades[vehicleId] };
  }

  upgradeLevel(vehicleId: string, key: UpgradeKey): number {
    return this.upgradesOf(vehicleId)[key];
  }

  /** Buy the next level of an upgrade for an owned vehicle; returns success. */
  buyUpgrade(vehicleId: string, key: UpgradeKey): boolean {
    if (!this.ownsVehicle(vehicleId)) return false;
    const levels = this.upgradesOf(vehicleId);
    const def = upgradeByKey(key);
    const cost = def.costs[levels[key]];
    if (cost === undefined || !this.spendCoins(cost)) return false;
    levels[key]++;
    this.data.upgrades[vehicleId] = levels;
    this.persist();
    return true;
  }

  /** Physics multipliers for the currently selected vehicle + its upgrades. */
  currentStats(): VehicleStats {
    return effectiveStats(
      vehicleById(this.data.selectedVehicle),
      this.upgradesOf(this.data.selectedVehicle),
    );
  }

  // ---------------- tracks ----------------

  ownsTrack(id: string): boolean {
    return this.data.unlockedTracks.includes(id);
  }

  buyTrack(id: string, cost: number): boolean {
    if (this.ownsTrack(id) || !this.spendCoins(cost)) return false;
    this.data.unlockedTracks.push(id);
    this.persist();
    return true;
  }

  // ---------------- records & progress ----------------

  record(trackId: string): TrackRecord {
    return this.data.records[trackId] ?? {
      bestLap: Infinity, bestTimes: {}, racesCompleted: 0, wins: 0,
    };
  }

  /**
   * Log a finished race. Returns which records were broken so the results
   * screen can celebrate them.
   */
  recordRaceResult(args: {
    trackId: string;
    laps: number;
    finishTime: number;
    bestLap: number;
    rank: number;
    driftScore: number;
  }): { newBestLap: boolean; newBestTime: boolean } {
    const rec = this.record(args.trackId);
    const newBestLap = args.bestLap < rec.bestLap;
    const prevBest = rec.bestTimes[args.laps] ?? Infinity;
    const newBestTime = args.finishTime < prevBest;

    if (newBestLap) rec.bestLap = args.bestLap;
    if (newBestTime) rec.bestTimes[args.laps] = args.finishTime;
    rec.racesCompleted++;
    if (args.rank === 1) {
      rec.wins++;
      this.data.totalWins++;
    }
    this.data.records[args.trackId] = rec;
    this.data.totalRaces++;
    this.data.totalDriftScore += args.driftScore;
    this.persist();
    return { newBestLap, newBestTime };
  }

  // ---------------- settings ----------------

  get settings(): ProfileSettings { return this.data.settings; }

  updateSettings(patch: Partial<ProfileSettings>): void {
    Object.assign(this.data.settings, patch);
    this.persist();
  }

  /** Wipe the career (dev/debug; not exposed in UI yet). */
  reset(): void {
    this.data = defaults();
    SaveSystem.remove(SLOT);
  }
}

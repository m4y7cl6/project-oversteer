/**
 * Thin, versioned localStorage wrapper. All persistent game data goes through
 * here so storage failures (private mode, quota) degrade to in-memory play
 * and future schema migrations have one home.
 */

const PREFIX = 'nitro-rush:';

interface Envelope<T> {
  version: number;
  data: T;
}

export class SaveSystem {
  /**
   * Load a slot. `migrate` receives older envelopes and returns upgraded data
   * (or null to discard); absent/corrupt slots return null.
   */
  static load<T>(
    slot: string,
    currentVersion: number,
    migrate?: (oldVersion: number, data: unknown) => T | null,
  ): T | null {
    try {
      const raw = localStorage.getItem(PREFIX + slot);
      if (!raw) return null;
      const env = JSON.parse(raw) as Envelope<T>;
      if (env.version === currentVersion) return env.data;
      return migrate?.(env.version, env.data) ?? null;
    } catch {
      return null;
    }
  }

  /** Persist a slot; returns false when storage is unavailable/full. */
  static save<T>(slot: string, version: number, data: T): boolean {
    try {
      const env: Envelope<T> = { version, data };
      localStorage.setItem(PREFIX + slot, JSON.stringify(env));
      return true;
    } catch {
      return false;
    }
  }

  static remove(slot: string): void {
    try {
      localStorage.removeItem(PREFIX + slot);
    } catch {
      // nothing to do
    }
  }
}

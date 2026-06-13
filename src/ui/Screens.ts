import { RacerEntry, formatTime } from '../race/RaceManager';
import { PlayerProfile } from '../save/PlayerProfile';
import {
  VEHICLES, UPGRADES, effectiveStats, statBars, vehicleById,
} from '../vehicle/vehicles';
import { TRACKS } from '../track/tracks';

export type ScreenName =
  | 'splash' | 'menu' | 'garage' | 'settings' | 'setup' | 'results' | 'none';

/** Coin breakdown shown on the results screen. */
export interface RaceRewards {
  placeCoins: number;
  driftCoins: number;
  collectedCoins: number;
  total: number;
  balance: number;
  newBestLap: boolean;
  newBestTime: boolean;
}

/**
 * All DOM screens of the game flow:
 * splash → main menu → (garage / settings / race setup) → race → results.
 * Pure view layer — every decision is delegated to callbacks set by Game.
 */
export class Screens {
  private screens: Record<Exclude<ScreenName, 'none'>, HTMLElement> = {
    splash: document.getElementById('splash-screen')!,
    menu: document.getElementById('main-menu')!,
    garage: document.getElementById('garage-screen')!,
    settings: document.getElementById('settings-screen')!,
    setup: document.getElementById('setup-screen')!,
    results: document.getElementById('results-screen')!,
  };
  private countdownEl = document.getElementById('countdown')!;
  private splashButton = document.getElementById('splash-start') as HTMLButtonElement;
  private startButton = document.getElementById('start-button') as HTMLButtonElement;
  private loadingStatus = document.getElementById('loading-status')!;
  private resultsBody = document.getElementById('results-body')!;
  private rewardsEl = document.getElementById('results-rewards')!;
  private trackOptions = document.getElementById('track-options')!;
  private trackRecord = document.getElementById('track-record')!;

  selectedLaps = 3;
  selectedTrack = 'sunrise';
  selectedMode: 'race' | 'timetrial' = 'race';

  // ---- navigation callbacks (wired by Game) ----
  onSplashStart?: () => void;
  onMenuRace?: () => void;
  onMenuGarage?: () => void;
  onMenuSettings?: () => void;
  onBackToMenu?: () => void;
  onResultsMenu?: () => void;
  /** Set by Game so the menu background can preview the selected track. */
  onTrackChange?: (trackId: string) => void;
  onTrackBuy?: (trackId: string) => void;
  onVehicleSelect?: (vehicleId: string) => void;
  onVehicleBuy?: (vehicleId: string) => void;
  onUpgradeBuy?: (vehicleId: string, key: string) => void;
  onSettingsChange?: (patch: { bgmVolume?: number; sfxVolume?: number }) => void;
  /** Any button press (UI click feedback). */
  onUiClick?: () => void;

  constructor() {
    const click = (id: string, fn: () => void) => {
      document.getElementById(id)!.addEventListener('click', () => {
        this.onUiClick?.();
        fn();
      });
    };
    click('splash-start', () => this.onSplashStart?.());
    click('menu-race', () => this.onMenuRace?.());
    click('menu-garage', () => this.onMenuGarage?.());
    click('menu-settings', () => this.onMenuSettings?.());
    click('garage-back', () => this.onBackToMenu?.());
    click('settings-back', () => this.onBackToMenu?.());
    click('setup-back', () => this.onBackToMenu?.());
    click('results-menu', () => this.onResultsMenu?.());

    document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedMode = btn.dataset.mode as 'race' | 'timetrial';
      });
    });
    document.querySelectorAll<HTMLButtonElement>('.lap-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lap-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedLaps = parseInt(btn.dataset.laps!, 10);
      });
    });

    this.bindVolumeSlider('bgm-volume', (v) => this.onSettingsChange?.({ bgmVolume: v }));
    this.bindVolumeSlider('sfx-volume', (v) => this.onSettingsChange?.({ sfxVolume: v }));
  }

  /** Show one screen, hide the rest ('none' hides all — racing). */
  show(name: ScreenName): void {
    for (const [key, el] of Object.entries(this.screens)) {
      el.classList.toggle('hidden', key !== name);
    }
  }

  setLoading(text: string, ready: boolean): void {
    this.loadingStatus.textContent = text;
    this.splashButton.disabled = !ready;
  }

  // ---------------- main menu ----------------

  updateProfileBar(profile: PlayerProfile): void {
    document.getElementById('profile-coins')!.textContent = profile.coins.toString();
    document.getElementById('profile-races')!.textContent = profile.totalRaces.toString();
    document.getElementById('profile-wins')!.textContent = profile.totalWins.toString();
  }

  // ---------------- garage ----------------

  /** (Re)build vehicle cards + the upgrade panel for the selected vehicle. */
  renderGarage(profile: PlayerProfile): void {
    document.getElementById('garage-coins')!.textContent = profile.coins.toString();

    const list = document.getElementById('vehicle-list')!;
    list.innerHTML = '';
    for (const v of VEHICLES) {
      const owned = profile.ownsVehicle(v.id);
      const selected = profile.selectedVehicleId === v.id;
      const stats = effectiveStats(v, profile.upgradesOf(v.id));

      const card = document.createElement('div');
      card.className = 'vehicle-card' +
        (selected ? ' selected' : '') + (owned ? '' : ' locked');
      const bars = (label: string, value: number) => {
        const filled = Math.round(statBars(value));
        return `<div class="stat-row"><span>${label}</span><span class="bars">` +
          '▰'.repeat(filled) + '▱'.repeat(5 - filled) + '</span></div>';
      };
      card.innerHTML =
        `<div class="vehicle-name" style="color:#${v.color.toString(16).padStart(6, '0')}">${v.name}</div>` +
        `<p class="vehicle-desc">${v.description}</p>` +
        bars('SPD', stats.speed) + bars('ACC', stats.accel) +
        bars('HDL', stats.handling) + bars('NOS', stats.nitro) +
        (owned
          ? `<div class="vehicle-status">${selected ? '✓ SELECTED' : 'TAP TO SELECT'}</div>`
          : `<div class="vehicle-status price">🪙 ${v.cost}</div>`);
      card.addEventListener('click', () => {
        this.onUiClick?.();
        if (owned) this.onVehicleSelect?.(v.id);
        else this.onVehicleBuy?.(v.id);
      });
      list.appendChild(card);
    }

    // upgrade panel for the currently selected vehicle
    const panel = document.getElementById('upgrade-panel')!;
    panel.innerHTML = '';
    const vid = profile.selectedVehicleId;
    const title = document.createElement('p');
    title.className = 'menu-label';
    title.textContent = `UPGRADES — ${vehicleById(vid).name}`;
    panel.appendChild(title);
    const rows = document.createElement('div');
    rows.className = 'upgrade-rows';
    for (const def of UPGRADES) {
      const level = profile.upgradeLevel(vid, def.key);
      const max = def.costs.length;
      const cost = def.costs[level];
      const row = document.createElement('button');
      row.className = 'upgrade-row' + (level >= max ? ' maxed' : '');
      row.innerHTML =
        `<span class="upgrade-name">${def.name}</span>` +
        `<span class="upgrade-pips">${'●'.repeat(level)}${'○'.repeat(max - level)}</span>` +
        `<span class="upgrade-cost">${level >= max ? 'MAX' : `🪙 ${cost}`}</span>` +
        `<span class="upgrade-desc">${def.description}</span>`;
      row.addEventListener('click', () => {
        this.onUiClick?.();
        if (level < max) this.onUpgradeBuy?.(vid, def.key);
      });
      rows.appendChild(row);
    }
    panel.appendChild(rows);
  }

  // ---------------- settings ----------------

  renderSettings(settings: { bgmVolume: number; sfxVolume: number }): void {
    this.setSlider('bgm-volume', settings.bgmVolume);
    this.setSlider('sfx-volume', settings.sfxVolume);
  }

  private setSlider(id: string, value01: number): void {
    const input = document.getElementById(id) as HTMLInputElement;
    input.value = Math.round(value01 * 100).toString();
    document.getElementById(`${id}-value`)!.textContent = `${input.value}%`;
  }

  private bindVolumeSlider(id: string, fn: (v: number) => void): void {
    const input = document.getElementById(id) as HTMLInputElement;
    input.addEventListener('input', () => {
      document.getElementById(`${id}-value`)!.textContent = `${input.value}%`;
      fn(parseInt(input.value, 10) / 100);
    });
  }

  // ---------------- race setup ----------------

  /** Build track buttons with lock/price state from the profile. */
  renderTracks(profile: PlayerProfile): void {
    this.trackOptions.innerHTML = '';
    if (!profile.ownsTrack(this.selectedTrack)) this.selectedTrack = TRACKS[0].id;
    for (const t of TRACKS) {
      const owned = profile.ownsTrack(t.id);
      const btn = document.createElement('button');
      btn.className = 'track-btn' +
        (t.id === this.selectedTrack ? ' selected' : '') + (owned ? '' : ' locked');
      btn.dataset.track = t.id; // stable hook for automation scripts
      btn.innerHTML = owned ? t.name : `🔒 ${t.name}<span class="price">🪙 ${t.unlockCost}</span>`;
      btn.addEventListener('click', () => {
        this.onUiClick?.();
        if (!owned) {
          this.onTrackBuy?.(t.id);
          return;
        }
        this.selectedTrack = t.id;
        this.trackOptions.querySelectorAll('.track-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.updateTrackRecord(profile);
        this.onTrackChange?.(t.id);
      });
      this.trackOptions.appendChild(btn);
    }
    this.updateTrackRecord(profile);
  }

  /** Best lap / best time line under the track picker. */
  private updateTrackRecord(profile: PlayerProfile): void {
    const rec = profile.record(this.selectedTrack);
    const best = rec.bestTimes[this.selectedLaps];
    const parts: string[] = [];
    if (isFinite(rec.bestLap)) parts.push(`BEST LAP ${formatTime(rec.bestLap)}`);
    if (best !== undefined) parts.push(`BEST TIME ${formatTime(best)}`);
    this.trackRecord.textContent = parts.join(' · ');
  }

  /** Online lobby line under the title; pass null to hide. */
  setOnlineStatus(text: string | null, isError = false): void {
    const el = document.getElementById('online-status')!;
    el.classList.toggle('hidden', text === null);
    el.classList.toggle('error', isError);
    if (text !== null) el.textContent = text;
  }

  /** Guests wait for the host: relabel/disable the start button. */
  setStartButton(label: string, enabled: boolean): void {
    this.startButton.textContent = label;
    this.startButton.disabled = !enabled;
  }

  onStart(fn: () => void): void {
    this.startButton.addEventListener('click', fn);
  }

  onRestart(fn: () => void): void {
    document.getElementById('restart-button')!.addEventListener('click', fn);
  }

  /**
   * Browser chrome eats screen space on phones. Android gets a fullscreen
   * button; iPhone Safari has no Fullscreen API, so we hint Add to Home
   * Screen (the PWA manifest makes that launch fullscreen).
   */
  setupFullscreenHelpers(isTouchDevice: boolean): void {
    if (!isTouchDevice) return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return; // already chrome-free

    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS || !document.documentElement.requestFullscreen) {
      document.getElementById('ios-hint')?.classList.remove('hidden');
      return;
    }

    const btn = document.getElementById('fullscreen-button') as HTMLButtonElement;
    btn.classList.remove('hidden');
    btn.addEventListener('click', async () => {
      try {
        await document.documentElement.requestFullscreen();
        // best effort: lock to landscape where supported
        const orientation = screen.orientation as unknown as {
          lock?: (o: string) => Promise<void>;
        };
        await orientation.lock?.('landscape');
      } catch {
        // fullscreen/lock denied: nothing to do
      }
    });
  }

  // ---------------- countdown & results ----------------

  /** value: 3, 2, 1 then 'GO!'. */
  showCountdown(value: string, isGo = false): void {
    this.countdownEl.classList.remove('hidden');
    this.countdownEl.classList.toggle('go', isGo);
    this.countdownEl.textContent = value;
  }

  hideCountdown(): void {
    this.countdownEl.classList.add('hidden');
  }

  /**
   * Render/refresh the results table (rankings may still update as AI
   * finish). Rewards render once, when provided.
   */
  showResults(rankings: RacerEntry[], playerEntry: RacerEntry, rewards?: RaceRewards): void {
    this.show('results');
    this.resultsBody.innerHTML = '';
    rankings.forEach((e, i) => {
      const tr = document.createElement('tr');
      if (e === playerEntry) tr.classList.add('player');
      const total = e.progress.finished ? formatTime(e.progress.finishTime) : 'racing…';
      const best = isFinite(e.progress.bestLap) ? formatTime(e.progress.bestLap) : '-';
      tr.innerHTML =
        `<td class="rank">${i + 1}</td><td>${e.kart.spec.name}</td>` +
        `<td>${total}</td><td>${best}</td>`;
      this.resultsBody.appendChild(tr);
    });

    if (rewards) {
      const lines: string[] = [];
      if (rewards.placeCoins > 0) lines.push(`PLACE BONUS <b>+${rewards.placeCoins}</b>`);
      if (rewards.driftCoins > 0) lines.push(`DRIFT BONUS <b>+${rewards.driftCoins}</b>`);
      if (rewards.collectedCoins > 0) lines.push(`COINS COLLECTED <b>+${rewards.collectedCoins}</b>`);
      if (rewards.newBestLap) lines.push(`<span class="record">★ NEW BEST LAP</span>`);
      if (rewards.newBestTime) lines.push(`<span class="record">★ NEW BEST TIME</span>`);
      lines.push(`🪙 <b>+${rewards.total}</b> → ${rewards.balance}`);
      this.rewardsEl.innerHTML = lines.map((l) => `<span>${l}</span>`).join('');
      this.rewardsEl.classList.remove('hidden');
    }
  }

  hideResults(): void {
    this.screens.results.classList.add('hidden');
    this.rewardsEl.classList.add('hidden');
  }
}

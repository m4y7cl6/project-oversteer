import { RacerEntry, formatTime } from '../race/RaceManager';

/** Start menu, countdown overlay and the results table. */
export class Screens {
  private startScreen = document.getElementById('start-screen')!;
  private resultsScreen = document.getElementById('results-screen')!;
  private countdownEl = document.getElementById('countdown')!;
  private startButton = document.getElementById('start-button') as HTMLButtonElement;
  private restartButton = document.getElementById('restart-button') as HTMLButtonElement;
  private loadingStatus = document.getElementById('loading-status')!;
  private resultsBody = document.getElementById('results-body')!;

  selectedLaps = 3;
  selectedTrack = 'sunrise';
  selectedMode: 'race' | 'timetrial' = 'race';

  constructor() {
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
    document.querySelectorAll<HTMLButtonElement>('.track-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.track-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedTrack = btn.dataset.track!;
        this.onTrackChange?.(this.selectedTrack);
      });
    });
  }

  /** Set by Game so the menu background can preview the selected track. */
  onTrackChange?: (trackId: string) => void;

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

  setLoading(text: string, ready: boolean): void {
    this.loadingStatus.textContent = text;
    this.startButton.disabled = !ready;
  }

  onStart(fn: () => void): void {
    this.startButton.addEventListener('click', fn);
  }

  onRestart(fn: () => void): void {
    this.restartButton.addEventListener('click', fn);
  }

  showStart(): void {
    this.startScreen.classList.remove('hidden');
    this.resultsScreen.classList.add('hidden');
  }

  hideStart(): void {
    this.startScreen.classList.add('hidden');
  }

  /** value: 3, 2, 1 then 'GO!'. */
  showCountdown(value: string, isGo = false): void {
    this.countdownEl.classList.remove('hidden');
    this.countdownEl.classList.toggle('go', isGo);
    this.countdownEl.textContent = value;
  }

  hideCountdown(): void {
    this.countdownEl.classList.add('hidden');
  }

  /** Render/refresh the results table (rankings may still update as AI finish). */
  showResults(rankings: RacerEntry[], playerEntry: RacerEntry): void {
    this.resultsScreen.classList.remove('hidden');
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
  }

  hideResults(): void {
    this.resultsScreen.classList.add('hidden');
  }
}

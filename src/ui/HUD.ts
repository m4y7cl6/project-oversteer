import { KartState } from '../vehicle/Kart';
import { Progress } from '../track/TrackManager';
import { formatTime } from '../race/RaceManager';
import { RACE } from '../game/config';

const ORDINALS = ['st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th'];

/** DOM overlay: speed, position, lap, clock, nitro gauge, drift score, messages. */
export class HUD {
  private root = document.getElementById('hud')!;
  private speedEl = document.getElementById('speed-value')!;
  private posEl = document.getElementById('position-value')!;
  private posSuffixEl = document.getElementById('position-suffix')!;
  private lapEl = document.getElementById('lap-value')!;
  private timeEl = document.getElementById('time-value')!;
  private lastTimeEl = document.getElementById('lasttime-value')!;
  private nitroFill = document.getElementById('nitro-fill')!;
  private nitroReady = document.getElementById('nitro-ready')!;
  private driftBox = document.getElementById('drift-score')!;
  private driftValue = document.getElementById('drift-value')!;
  private messageEl = document.getElementById('hud-message')!;
  private wrongWayEl = document.getElementById('wrong-way')!;

  private messageTimer = 0;
  private driftLinger = 0;

  show(): void { this.root.classList.remove('hidden'); }
  hide(): void { this.root.classList.add('hidden'); }

  flashMessage(text: string, seconds = 2.2): void {
    this.messageEl.textContent = text;
    this.messageEl.classList.remove('hidden');
    this.messageTimer = seconds;
  }

  update(
    dt: number,
    state: KartState,
    progress: Progress,
    rank: number,
    totalLaps: number,
    raceTime: number,
  ): void {
    this.speedEl.textContent = Math.round(state.speedKmh).toString();

    this.posEl.textContent = rank.toString();
    this.posSuffixEl.textContent = ORDINALS[rank - 1] ?? 'th';

    const lapShown = Math.min(progress.lap + 1, totalLaps);
    this.lapEl.textContent = `${progress.finished ? totalLaps : lapShown}/${totalLaps}`;
    this.timeEl.textContent = formatTime(
      progress.finished ? progress.finishTime : raceTime,
    );
    const last = progress.lapTimes[progress.lapTimes.length - 1];
    this.lastTimeEl.textContent = last !== undefined ? formatTime(last) : '--:--.---';

    // nitro
    const pct = Math.round(state.nitroGauge);
    this.nitroFill.style.width = `${pct}%`;
    this.nitroFill.classList.toggle('full', state.nitroReady);
    this.nitroReady.classList.toggle('hidden', !state.nitroReady || state.isBoosting);

    // drift score lingers briefly after the slide ends
    if (state.isDrifting && state.driftScore > 1) {
      this.driftLinger = 1.0;
      this.driftValue.textContent = Math.floor(state.driftScore).toString();
    } else {
      this.driftLinger -= dt;
    }
    this.driftBox.classList.toggle('hidden', this.driftLinger <= 0);

    // transient center message
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.messageEl.classList.add('hidden');
    }

    this.wrongWayEl.classList.toggle(
      'hidden',
      progress.wrongWayTime < RACE.WRONG_WAY_GRACE || progress.finished,
    );
  }
}

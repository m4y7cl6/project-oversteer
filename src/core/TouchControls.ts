/**
 * On-screen controls for touch devices. Shown only when touch is available;
 * while active the kart auto-accelerates (mobile kart convention) so the
 * player's thumbs only handle steering, drift, brake and nitro.
 */
export class TouchControls {
  /** Whether this device got touch controls at all. */
  readonly enabled: boolean;

  steer = 0; // -1 right .. 1 left (matches keyboard convention)
  brake = false;
  drift = false;
  nitro = false;

  private leftHeld = false;
  private rightHeld = false;

  constructor() {
    this.enabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const root = document.getElementById('touch-controls');
    if (!root) {
      this.enabled = false;
      return;
    }
    if (!this.enabled) {
      root.classList.add('hidden');
      return;
    }
    document.body.classList.add('touch-mode');

    this.bindHold('touch-left', (held) => {
      this.leftHeld = held;
      this.updateSteer();
    });
    this.bindHold('touch-right', (held) => {
      this.rightHeld = held;
      this.updateSteer();
    });
    this.bindHold('touch-brake', (held) => (this.brake = held));
    this.bindHold('touch-drift', (held) => (this.drift = held));
    this.bindHold('touch-nitro', (held) => (this.nitro = held));
  }

  private updateSteer(): void {
    this.steer = (this.leftHeld ? 1 : 0) + (this.rightHeld ? -1 : 0);
  }

  /** Press-and-hold semantics with multi-touch support per button. */
  private bindHold(id: string, set: (held: boolean) => void): void {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e: Event) => {
      e.preventDefault();
      el.classList.add('held');
      set(true);
    };
    const up = (e: Event) => {
      e.preventDefault();
      el.classList.remove('held');
      set(false);
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    // pointer events as fallback (also lets desktop devtools emulation work)
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
  }
}

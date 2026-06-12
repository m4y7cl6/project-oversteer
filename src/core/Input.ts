import { TouchControls } from './TouchControls';

/**
 * Keyboard (+ optional touch) input mapped to game actions. Polled by
 * controllers each tick. In touch mode the kart auto-accelerates unless the
 * brake is held (so reverse still works).
 */
export class Input {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();

  constructor(private touch?: TouchControls) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedThisFrame.add(e.code);
      // keep the page from scrolling / triggering browser shortcuts mid-race
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // gamepad state, refreshed once per frame by pollGamepad()
  private padSteer = 0;
  private padThrottle = 0;
  private padBrake = 0;
  private padDrift = false;
  private padNitro = false;

  /** Standard-mapping gamepad: left stick steers, RT/LT drive, A drift, B/X nitro. */
  pollGamepad(): void {
    this.padSteer = 0;
    this.padThrottle = 0;
    this.padBrake = 0;
    this.padDrift = false;
    this.padNitro = false;
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad || pad.mapping !== 'standard') continue;
      const x = pad.axes[0] ?? 0;
      if (Math.abs(x) > 0.18) this.padSteer = -x; // stick right = steer right (-1)
      this.padThrottle = Math.max(this.padThrottle, pad.buttons[7]?.value ?? 0);
      this.padBrake = Math.max(this.padBrake, pad.buttons[6]?.value ?? 0);
      if (pad.buttons[0]?.pressed) this.padDrift = true; // A / Cross
      if (pad.buttons[1]?.pressed || pad.buttons[2]?.pressed) this.padNitro = true; // B/X
      break;
    }
  }

  get throttle(): boolean {
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.padThrottle > 0.15) return true;
    return !!this.touch?.enabled && !this.touch.brake; // touch: auto-accelerate
  }
  get brake(): boolean {
    return this.keys.has('KeyS') || this.keys.has('ArrowDown') ||
      this.padBrake > 0.15 || !!this.touch?.brake;
  }
  get steer(): number {
    let s = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s -= 1;
    s += (this.touch?.steer ?? 0) + this.padSteer;
    return Math.max(-1, Math.min(1, s));
  }
  get drift(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ||
      this.padDrift || !!this.touch?.drift;
  }
  get nitro(): boolean {
    return this.keys.has('ControlLeft') || this.keys.has('ControlRight') ||
      this.padNitro || !!this.touch?.nitro;
  }
  /** True once when M is pressed (music mute toggle). */
  get muteToggle(): boolean { return this.consumePress('KeyM'); }
  get reset(): boolean { return this.consumePress('KeyR'); }

  /** True once per physical key press (cleared after read). */
  private consumePress(code: string): boolean {
    if (this.pressedThisFrame.has(code)) {
      this.pressedThisFrame.delete(code);
      return true;
    }
    return false;
  }

  /** Call at end of each frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
  }
}

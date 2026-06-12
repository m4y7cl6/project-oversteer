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

  get throttle(): boolean {
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) return true;
    return !!this.touch?.enabled && !this.touch.brake; // touch: auto-accelerate
  }
  get brake(): boolean {
    return this.keys.has('KeyS') || this.keys.has('ArrowDown') || !!this.touch?.brake;
  }
  get steer(): number {
    let s = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s -= 1;
    s += this.touch?.steer ?? 0;
    return Math.max(-1, Math.min(1, s));
  }
  get drift(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || !!this.touch?.drift;
  }
  get nitro(): boolean {
    return this.keys.has('ControlLeft') || this.keys.has('ControlRight') || !!this.touch?.nitro;
  }
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

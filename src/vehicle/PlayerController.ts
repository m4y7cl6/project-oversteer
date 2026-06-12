import { Input } from '../core/Input';
import { Kart } from './Kart';

/** Maps keyboard state onto a kart's input intents. */
export class PlayerController {
  constructor(private input: Input, private kart: Kart) {}

  fixedUpdate(enabled: boolean): void {
    const ki = this.kart.input;
    ki.clear();
    if (!enabled) return;
    ki.throttle = this.input.throttle ? 1 : 0;
    ki.brake = this.input.brake ? 1 : 0;
    ki.steer = this.input.steer;
    ki.drift = this.input.drift;
    ki.nitro = this.input.nitro;
  }
}

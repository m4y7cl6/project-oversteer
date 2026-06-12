import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../game/config';

/** Wraps Rapier init + world stepping at a fixed tick rate. */
export class Physics {
  static api: typeof RAPIER;
  world!: RAPIER.World;

  /** Must complete before any physics objects are created (WASM load). */
  static async init(): Promise<void> {
    await RAPIER.init();
    Physics.api = RAPIER;
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.GRAVITY, z: 0 });
    this.world.timestep = 1 / PHYSICS.TICK_RATE;
  }

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}

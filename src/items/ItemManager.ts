import * as THREE from 'three';
import { Kart } from '../vehicle/Kart';
import { TrackData } from '../track/TrackData';
import { mulberry32 } from '../track/TrackBuilder';
import { ItemDefinition, ITEM_COIN, ITEM_NITRO } from './ItemDefinition';
import { ItemEffectContext } from './ItemEffect';

interface PickupInstance {
  def: ItemDefinition;
  visual: THREE.Object3D;
  position: THREE.Vector3;
  /** 0 = collectable; counts down after collection. */
  respawnLeft: number;
  /** Per-instance phase so bobbing isn't synchronized. */
  phase: number;
}

const COIN_GROUP_SPACING = 90; // m of track between coin lines
const NITRO_SPACING = 140; // m of track between nitro canisters
const FLOAT_HEIGHT = 1.0;

/**
 * Owns all pickups on the current circuit: deterministic placement from the
 * track seed, proximity collection, respawn timers and idle animation.
 * Effects are delegated to each ItemDefinition's ItemEffect.
 */
export class ItemManager {
  private group = new THREE.Group();
  private pickups: PickupInstance[] = [];
  private time = 0;

  /** (Re)place pickups for a circuit. Call on every track change. */
  build(scene: THREE.Scene, data: TrackData, seed: number): void {
    this.dispose();
    this.group = new THREE.Group();
    this.group.name = 'items';
    scene.add(this.group);

    const rand = mulberry32(seed ^ 0x9e3779b9);
    const sampleStep = data.totalLength / data.sampleCount;

    // coin lines: three across the road, every COIN_GROUP_SPACING meters
    for (let arc = COIN_GROUP_SPACING * 0.7; arc < data.totalLength; arc += COIN_GROUP_SPACING) {
      const s = data.sample(Math.round(arc / sampleStep));
      for (const lateral of [-3.2, 0, 3.2]) {
        const pos = s.pos.clone().addScaledVector(s.right, lateral);
        this.place(ITEM_COIN, pos);
      }
    }

    // nitro canisters: single, alternating sides, offset from the coin rhythm
    let side = rand() > 0.5 ? 1 : -1;
    for (let arc = NITRO_SPACING * 0.5; arc < data.totalLength; arc += NITRO_SPACING) {
      const s = data.sample(Math.round(arc / sampleStep));
      const pos = s.pos.clone().addScaledVector(s.right, side * 4.5);
      this.place(ITEM_NITRO, pos);
      side = -side;
    }
  }

  private place(def: ItemDefinition, position: THREE.Vector3): void {
    const visual = def.buildVisual();
    visual.position.copy(position).setY(FLOAT_HEIGHT);
    this.group.add(visual);
    this.pickups.push({
      def, visual, position, respawnLeft: 0, phase: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Fixed-tick update: respawn timers + collection checks. `makeContext`
   * builds the effect context for whichever kart collected the pickup.
   */
  fixedUpdate(dt: number, karts: Kart[], makeContext: (kart: Kart) => ItemEffectContext): void {
    for (const p of this.pickups) {
      if (p.respawnLeft > 0) {
        p.respawnLeft -= dt;
        if (p.respawnLeft <= 0) p.visual.visible = true;
        continue;
      }
      const r2 = p.def.radius * p.def.radius;
      for (const kart of karts) {
        const t = kart.body.translation();
        const dx = t.x - p.position.x;
        const dz = t.z - p.position.z;
        if (dx * dx + dz * dz > r2) continue;
        p.def.effect.apply(makeContext(kart));
        p.respawnLeft = p.def.respawnTime;
        p.visual.visible = false;
        break;
      }
    }
  }

  /** Per-frame idle animation: spin + bob. */
  update(dt: number): void {
    this.time += dt;
    for (const p of this.pickups) {
      if (!p.visual.visible) continue;
      p.visual.rotation.y += dt * 2.2;
      p.visual.position.y = FLOAT_HEIGHT + Math.sin(this.time * 2.4 + p.phase) * 0.18;
    }
  }

  /** Reset all pickups to collectable (race restart). */
  resetAll(): void {
    for (const p of this.pickups) {
      p.respawnLeft = 0;
      p.visual.visible = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.pickups = [];
  }
}

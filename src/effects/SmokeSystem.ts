import * as THREE from 'three';
import { Kart } from '../vehicle/Kart';
import { smokeTexture } from '../track/textures';

interface Particle {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
  velocity: THREE.Vector3;
  baseScale: number;
  baseOpacity: number;
}

const POOL_SIZE = 160;
const _rear = new THREE.Vector3();
const _right = new THREE.Vector3();

/** Pooled sprite particles: tire smoke while drifting, dust when off-road. */
export class SmokeSystem {
  private pool: Particle[] = [];
  private cursor = 0;
  private spawnAccum = new Map<Kart, number>();

  constructor(scene: THREE.Scene) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    for (let i = 0; i < POOL_SIZE; i++) {
      const sprite = new THREE.Sprite(mat.clone());
      sprite.visible = false;
      scene.add(sprite);
      this.pool.push({
        sprite,
        life: 0,
        maxLife: 1,
        velocity: new THREE.Vector3(),
        baseScale: 1,
        baseOpacity: 0.55,
      });
    }
  }

  update(karts: Kart[], dt: number): void {
    // emit
    for (const kart of karts) {
      const st = kart.state;
      const drifting = st.isDrifting && st.slipAngle > 6;
      const offroadDust = st.offroad && Math.abs(st.forwardSpeed) > 6;
      if (!drifting && !offroadDust) continue;

      const sparking = drifting && st.driftTier > 0;
      const rate = (drifting ? 38 : 14) + (sparking ? 30 : 0); // particles per second
      const acc = (this.spawnAccum.get(kart) ?? 0) + rate * dt;
      const count = Math.floor(acc);
      this.spawnAccum.set(kart, acc - count);

      const fwd = kart.forward;
      _right.set(-fwd.z, 0, fwd.x);
      const pos = kart.position;
      for (let i = 0; i < count; i++) {
        const side = Math.random() > 0.5 ? 1 : -1;
        _rear.copy(pos)
          .addScaledVector(fwd, -1.0)
          .addScaledVector(_right, side * 0.7)
          .setY(0.25);
        // roughly every other particle becomes a tier spark
        if (sparking && i % 2 === 0) {
          this.spawn(_rear, st.driftTier === 2 ? 0xffae3d : 0x55d6ff, drifting, true);
        } else {
          this.spawn(_rear, drifting ? 0xffffff : 0xc2a76b, drifting);
        }
      }
    }

    // simulate
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.addScaledVector(p.velocity, dt);
      const t = 1 - p.life / p.maxLife;
      p.sprite.scale.setScalar(p.baseScale * (0.6 + t * 1.8));
      (p.sprite.material as THREE.SpriteMaterial).opacity = p.baseOpacity * (1 - t);
    }
  }

  private spawn(pos: THREE.Vector3, color: number, drift: boolean, spark = false): void {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % POOL_SIZE;
    if (spark) {
      // small, bright, fast and short-lived
      p.life = p.maxLife = 0.25 + Math.random() * 0.15;
      p.baseScale = 0.35;
      p.velocity.set(
        (Math.random() - 0.5) * 4.5,
        0.6 + Math.random() * 2.2,
        (Math.random() - 0.5) * 4.5,
      );
    } else {
      p.life = p.maxLife = drift ? 0.7 + Math.random() * 0.3 : 0.5;
      p.baseScale = drift ? 0.9 : 0.7;
      p.velocity.set(
        (Math.random() - 0.5) * 1.6,
        1.2 + Math.random() * 1.2,
        (Math.random() - 0.5) * 1.6,
      );
    }
    p.sprite.position.copy(pos);
    p.sprite.scale.setScalar(p.baseScale);
    p.baseOpacity = spark ? 0.95 : 0.55;
    const mat = p.sprite.material as THREE.SpriteMaterial;
    mat.color.setHex(color);
    mat.opacity = p.baseOpacity;
    mat.blending = spark ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.sprite.visible = true;
  }
}

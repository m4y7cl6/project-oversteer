import * as THREE from 'three';
import { Kart } from '../vehicle/Kart';
import { CAMERA, KART, NITRO } from '../game/config';

const _desired = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/**
 * Third-person chase camera: trails the kart with smoothing, widens FOV with
 * speed and pulls back hard while nitro is active.
 */
export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV_BASE, aspect, 0.1, 900);
    this.camera.position.set(0, 6, -12);
  }

  /** Snap behind the kart (race start / respawn). */
  snapTo(kart: Kart): void {
    _fwd.copy(kart.forward);
    const p = kart.position;
    this.camera.position.copy(p)
      .addScaledVector(_fwd, -CAMERA.DISTANCE)
      .add(new THREE.Vector3(0, CAMERA.HEIGHT, 0));
    this.camera.lookAt(p);
  }

  update(kart: Kart, dt: number): void {
    const p = kart.position;
    _fwd.copy(kart.forward);

    const boosting = kart.state.isBoosting;
    const extraBack = boosting ? 1.6 : 0;
    _desired.copy(p)
      .addScaledVector(_fwd, -(CAMERA.DISTANCE + extraBack))
      .add(new THREE.Vector3(0, CAMERA.HEIGHT, 0));

    const k = 1 - Math.exp(-CAMERA.POS_LERP * dt);
    this.camera.position.lerp(_desired, k);

    _lookAt.copy(p).addScaledVector(_fwd, CAMERA.LOOK_AHEAD).setY(p.y + 0.8);
    this.camera.lookAt(_lookAt);

    // FOV: widen with speed, surge during boost
    const speedRatio = THREE.MathUtils.clamp(
      Math.abs(kart.state.forwardSpeed) / NITRO.BOOST_MAX_SPEED, 0, 1,
    );
    const normalRatio = THREE.MathUtils.clamp(Math.abs(kart.state.forwardSpeed) / KART.MAX_SPEED, 0, 1);
    const targetFov = boosting
      ? THREE.MathUtils.lerp(CAMERA.FOV_BASE, CAMERA.FOV_NITRO, 0.4 + 0.6 * speedRatio)
      : CAMERA.FOV_BASE + CAMERA.FOV_SPEED_GAIN * normalRatio;
    const fk = 1 - Math.exp(-CAMERA.FOV_LERP * dt);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, fk);
    this.camera.updateProjectionMatrix();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

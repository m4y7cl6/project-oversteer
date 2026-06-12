import * as THREE from 'three';
import { Kart } from './Kart';
import { TrackData } from '../track/TrackData';
import { AI, KART, NITRO } from '../game/config';

const _toTarget = new THREE.Vector3();
const _toOther = new THREE.Vector3();

/**
 * Waypoint-following driver. Steers toward a speed-scaled lookahead point on
 * the centerline (offset by the racer's preferred line), brakes for corners,
 * sidesteps karts ahead, and reverses out when stuck.
 */
export class AIController {
  /** Rubber-band factor set by RaceManager (1 = neutral). */
  speedMultiplier = 1;

  private sampleHint = 0;
  private stuckTime = 0;
  private reverseTime = 0;
  private nitroChargeRate: number;
  private nitroCooldown = 0;

  constructor(
    private kart: Kart,
    private track: TrackData,
    private getOthers: () => Kart[],
  ) {
    // AI charge nitro passively over time instead of via drift scoring
    this.nitroChargeRate = 3.5 + Math.random() * 3.5;
  }

  fixedUpdate(dt: number, enabled: boolean): void {
    const ki = this.kart.input;
    ki.clear();
    if (!enabled) return;

    const st = this.kart.state;
    const pos = this.kart.position;
    const fwd = this.kart.forward;
    const speed = st.forwardSpeed;

    this.sampleHint = this.track.closestSampleIndex(pos, this.sampleHint);
    const sampleStep = this.track.totalLength / this.track.sampleCount;

    // ---- stuck recovery: back out with inverted steering ----
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      ki.brake = 1;
      ki.steer = this.steerTowardTrack(pos, fwd) * -1;
      return;
    }
    if (Math.abs(speed) < 1.2) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.6) {
        this.stuckTime = 0;
        this.reverseTime = 1.1;
      }
    } else {
      this.stuckTime = 0;
    }

    // ---- steering toward lookahead point ----
    const lookahead = AI.LOOKAHEAD_MIN + Math.max(0, speed) * AI.LOOKAHEAD_SPEED_FACTOR;
    const targetIdx = this.sampleHint + Math.round(lookahead / sampleStep);
    const target = this.track.sample(targetIdx);
    const maxOffset = this.track.roadHalfWidth - 2.5;
    const offset = THREE.MathUtils.clamp(this.kart.spec.lineOffset, -maxOffset, maxOffset);
    _toTarget.copy(target.pos).addScaledVector(target.right, offset).sub(pos).setY(0);

    const crossY = fwd.z * _toTarget.x - fwd.x * _toTarget.z;
    const dot = fwd.dot(_toTarget);
    const angle = Math.atan2(crossY, dot); // signed angle to target, left positive
    let steer = THREE.MathUtils.clamp(AI.STEER_GAIN * angle, -1, 1);

    // ---- collision avoidance: nudge around karts ahead ----
    let blockedAhead = false;
    for (const other of this.getOthers()) {
      if (other === this.kart) continue;
      _toOther.copy(other.position).sub(pos).setY(0);
      const d = _toOther.length();
      if (d > AI.AVOID_RADIUS || d < 0.01) continue;
      const ahead = _toOther.dot(fwd) / d;
      if (ahead < 0.35) continue;
      const side = Math.sign(fwd.z * _toOther.x - fwd.x * _toOther.z) || 1;
      steer += -side * AI.AVOID_STEER * (1 - d / AI.AVOID_RADIUS) * 2;
      if (ahead > 0.85 && other.state.forwardSpeed < speed - 1) blockedAhead = true;
    }
    ki.steer = THREE.MathUtils.clamp(steer, -1, 1);

    // ---- speed control: corner-limited target speed ----
    const brakeDistance = 10 + Math.max(0, speed) * 0.9;
    const curvAhead = this.track.maxCurvatureAhead(this.sampleHint, brakeDistance);
    const cornerSpeed = curvAhead > 1e-4
      ? Math.sqrt(AI.CORNER_LAT_ACCEL / curvAhead)
      : Infinity;
    const targetSpeed = Math.min(
      KART.MAX_SPEED * this.kart.spec.skill * this.speedMultiplier,
      cornerSpeed,
    );

    if (blockedAhead) {
      ki.throttle = 0.25;
    } else if (speed < targetSpeed - 0.5) {
      ki.throttle = 1;
    } else if (speed > targetSpeed + 1.5) {
      ki.brake = 1;
    }

    // ---- nitro: charge passively, fire on straights ----
    this.nitroCooldown = Math.max(0, this.nitroCooldown - dt);
    if (!st.isBoosting) {
      st.nitroGauge = Math.min(NITRO.GAUGE_MAX, st.nitroGauge + this.nitroChargeRate * dt);
    }
    const straightAhead = this.track.maxCurvatureAhead(this.sampleHint, 45);
    if (
      st.nitroReady &&
      this.nitroCooldown <= 0 &&
      straightAhead < AI.NITRO_STRAIGHT_CURVATURE &&
      !blockedAhead
    ) {
      ki.nitro = true;
      this.nitroCooldown = 6;
    }
  }

  /** Steer value that points the nose back at the local centerline direction. */
  private steerTowardTrack(pos: THREE.Vector3, fwd: THREE.Vector3): number {
    const s = this.track.sample(this.sampleHint + 4);
    _toTarget.copy(s.pos).sub(pos).setY(0);
    const crossY = fwd.z * _toTarget.x - fwd.x * _toTarget.z;
    return THREE.MathUtils.clamp(crossY * 0.5, -1, 1);
  }
}

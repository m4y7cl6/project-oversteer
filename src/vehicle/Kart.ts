import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../core/Physics';
import { KART, DRIFT, NITRO, RacerSpec } from '../game/config';
import { blobShadowTexture } from '../track/textures';

/** Driving intents for one tick, produced by Player/AI controllers. */
export class KartInput {
  throttle = 0; // 0..1
  brake = 0; // 0..1
  steer = 0; // -1 (right) .. 1 (left)
  drift = false;
  nitro = false; // fire-and-forget request

  clear(): void {
    this.throttle = 0;
    this.brake = 0;
    this.steer = 0;
    this.drift = false;
    this.nitro = false;
  }
}

/** Gameplay state owned by the kart's physics model. */
export class KartState {
  forwardSpeed = 0;
  lateralSpeed = 0;
  /** deg, between velocity and facing */
  slipAngle = 0;
  isDrifting = false;
  driftScore = 0; // points in the current drift
  totalDriftScore = 0;
  nitroGauge = 0; // 0..100
  boostTimer = 0;
  offroad = false;

  get isBoosting(): boolean {
    return this.boostTimer > 0;
  }
  get nitroReady(): boolean {
    return this.nitroGauge >= NITRO.GAUGE_MAX;
  }
  get speedKmh(): number {
    return Math.abs(this.forwardSpeed) * 3.6;
  }
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _quat = new THREE.Quaternion();

/**
 * One racer: a Rapier dynamic body driven by an arcade handling model, plus
 * a procedural low-poly kart mesh. The model only re-shapes the body's
 * velocity (grip, drive force, drift) — collisions, gravity and wall bounces
 * remain fully physical.
 */
export class Kart {
  readonly body: RAPIER.RigidBody;
  readonly visual: THREE.Group;
  readonly input = new KartInput();
  readonly state = new KartState();

  private wheels: THREE.Object3D[] = [];
  private frontWheels: THREE.Object3D[] = [];
  private chassis!: THREE.Group;
  private flames: THREE.Mesh[] = [];
  private wheelSpin = 0;

  // previous tick transform, for render interpolation
  private prevPos = new THREE.Vector3();
  private prevRot = new THREE.Quaternion();

  constructor(
    physics: Physics,
    public readonly spec: RacerSpec,
    public readonly isPlayer: boolean,
    /** Loaded glTF scene to use as the body (cloned); procedural kart when omitted. */
    private modelTemplate?: THREE.Object3D,
  ) {
    const R = Physics.api;
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setAngularDamping(0.5),
    );
    this.body.setEnabledRotations(false, true, false, true);
    // friction 0 + Min combine: the handling model owns all tire forces;
    // contact friction would otherwise fight engine acceleration
    const collider = R.ColliderDesc.cuboid(KART.HALF_WIDTH, KART.HALF_HEIGHT, KART.HALF_LENGTH)
      .setMass(KART.MASS)
      .setFriction(0)
      .setFrictionCombineRule(R.CoefficientCombineRule.Min)
      .setRestitution(0.3);
    physics.world.createCollider(collider, this.body);

    this.visual = this.buildVisual();
  }

  /** Teleport to a pose and zero all motion (grid placement / respawn). */
  placeAt(position: THREE.Vector3, rotationY: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevPos.copy(position);
    this.prevRot.copy(q);
    this.state.forwardSpeed = 0;
    this.state.lateralSpeed = 0;
    this.state.isDrifting = false;
    this.syncVisual(1);
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get forward(): THREE.Vector3 {
    const r = this.body.rotation();
    _quat.set(r.x, r.y, r.z, r.w);
    return new THREE.Vector3(0, 0, 1).applyQuaternion(_quat).setY(0).normalize();
  }

  /** Run the handling model for one fixed tick. Call before physics.step(). */
  fixedUpdate(dt: number): void {
    const st = this.state;
    const inp = this.input;

    // remember transform for interpolation
    const tr = this.body.translation();
    const ro = this.body.rotation();
    this.prevPos.set(tr.x, tr.y, tr.z);
    this.prevRot.set(ro.x, ro.y, ro.z, ro.w);

    // local frame (planar)
    _quat.set(ro.x, ro.y, ro.z, ro.w);
    _fwd.set(0, 0, 1).applyQuaternion(_quat).setY(0).normalize();
    _right.set(-_fwd.z, 0, _fwd.x); // forward x up

    const lv = this.body.linvel();
    _vel.set(lv.x, 0, lv.z);
    let fwdSpeed = _vel.dot(_fwd);
    let latSpeed = _vel.dot(_right);

    // ---- nitro ----
    if (inp.nitro && st.nitroReady && !st.isBoosting) {
      st.nitroGauge = 0;
      st.boostTimer = NITRO.BOOST_DURATION;
      fwdSpeed = Math.min(fwdSpeed + NITRO.BOOST_KICK_IMPULSE, NITRO.BOOST_MAX_SPEED);
    }
    if (st.isBoosting) st.boostTimer = Math.max(0, st.boostTimer - dt);

    const boosting = st.isBoosting;
    let maxSpeed = boosting ? NITRO.BOOST_MAX_SPEED : KART.MAX_SPEED;
    if (st.offroad && !boosting) maxSpeed = Math.min(maxSpeed, KART.OFFROAD_MAX_SPEED);

    // ---- drift state ----
    const speedOk = fwdSpeed > DRIFT.MIN_SPEED * (st.isDrifting ? 0.7 : 1);
    const wantsDrift = inp.drift && Math.abs(inp.steer) > (st.isDrifting ? 0 : DRIFT.MIN_STEER);
    if (!st.isDrifting && wantsDrift && speedOk) {
      st.isDrifting = true;
      st.driftScore = 0;
      latSpeed += inp.steer * 2.6; // outward kick to break traction
    } else if (st.isDrifting && (!inp.drift || !speedOk)) {
      st.isDrifting = false;
      st.driftScore = 0;
    }

    // ---- longitudinal ----
    let accel = 0;
    const engineAccel = boosting ? NITRO.BOOST_ACCEL : KART.ENGINE_ACCEL;
    const throttle = boosting ? 1 : inp.throttle;
    if (throttle > 0 && fwdSpeed < maxSpeed) {
      accel += throttle * engineAccel * (1 - Math.max(0, fwdSpeed) / maxSpeed);
    }
    if (inp.brake > 0) {
      if (fwdSpeed > 0.4) {
        accel -= inp.brake * KART.BRAKE_DECEL;
      } else if (fwdSpeed > -KART.MAX_REVERSE_SPEED) {
        accel -= inp.brake * KART.REVERSE_ACCEL;
      }
    }
    if (throttle === 0 && inp.brake === 0) {
      accel -= fwdSpeed * KART.ROLLING_DRAG;
    }
    if (st.offroad) accel -= fwdSpeed * KART.OFFROAD_DRAG * (boosting ? 0.3 : 1);
    if (fwdSpeed > maxSpeed) accel -= (fwdSpeed - maxSpeed) * 2.5; // soft cap after boost ends
    fwdSpeed += accel * dt;

    // ---- lateral grip ----
    let grip = st.isDrifting ? KART.GRIP_DRIFT : KART.GRIP_NORMAL;
    if (st.offroad) grip = Math.min(grip, KART.GRIP_OFFROAD);
    if (st.isDrifting && Math.sign(inp.steer) !== 0 &&
        Math.sign(inp.steer) === -Math.sign(latSpeed)) {
      // counter-steering against the slide recovers grip faster
      grip += DRIFT.COUNTER_STEER_GRIP;
    }
    latSpeed *= Math.exp(-grip * dt);

    // ---- steering ----
    const dir = fwdSpeed < -0.5 ? -1 : 1;
    const speedFactor = THREE.MathUtils.clamp(Math.abs(fwdSpeed) / 6, 0, 1);
    const falloff = THREE.MathUtils.lerp(
      1,
      KART.STEER_HIGH_SPEED_FALLOFF,
      THREE.MathUtils.clamp(Math.abs(fwdSpeed) / KART.MAX_SPEED, 0, 1),
    );
    let yawRate = inp.steer * KART.STEER_RATE * speedFactor * falloff * dir;
    if (st.isDrifting) yawRate *= DRIFT.YAW_BOOST;
    if (Math.abs(fwdSpeed) < KART.MIN_STEER_SPEED) yawRate = 0;
    const av = this.body.angvel();
    const smoothedYaw = THREE.MathUtils.lerp(av.y, yawRate, Math.min(1, 12 * dt));
    this.body.setAngvel({ x: 0, y: smoothedYaw, z: 0 }, true);

    // ---- drift scoring & nitro gauge ----
    st.slipAngle = Math.abs(fwdSpeed) > 1
      ? THREE.MathUtils.radToDeg(Math.atan2(Math.abs(latSpeed), Math.abs(fwdSpeed)))
      : 0;
    if (st.isDrifting && st.slipAngle > DRIFT.MIN_SLIP_DEG && fwdSpeed > 5) {
      const slipRad = THREE.MathUtils.degToRad(st.slipAngle);
      const gained = slipRad * DRIFT.SCORE_RATE * dt * (fwdSpeed / KART.MAX_SPEED) * 10;
      st.driftScore += gained;
      st.totalDriftScore += gained;
      st.nitroGauge = Math.min(NITRO.GAUGE_MAX, st.nitroGauge + gained * DRIFT.GAUGE_PER_SCORE * 10);
    }

    // ---- write back velocity (keep vertical component: gravity / bumps) ----
    const vy = lv.y;
    this.body.setLinvel(
      {
        x: _fwd.x * fwdSpeed + _right.x * latSpeed,
        y: vy,
        z: _fwd.z * fwdSpeed + _right.z * latSpeed,
      },
      true,
    );

    st.forwardSpeed = fwdSpeed;
    st.lateralSpeed = latSpeed;
  }

  /** Copy interpolated physics transform to the visual, animate wheels & flair. */
  syncVisual(alpha: number): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.visual.position.set(
      THREE.MathUtils.lerp(this.prevPos.x, t.x, alpha),
      THREE.MathUtils.lerp(this.prevPos.y, t.y, alpha) - KART.HALF_HEIGHT,
      THREE.MathUtils.lerp(this.prevPos.z, t.z, alpha),
    );
    _quat.set(r.x, r.y, r.z, r.w);
    this.visual.quaternion.copy(this.prevRot).slerp(_quat, alpha);

    // wheels
    this.wheelSpin += this.state.forwardSpeed * 0.016 / 0.32;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    const steerVis = this.input.steer * 0.42;
    for (const fw of this.frontWheels) fw.rotation.y = steerVis;

    // body lean into corners / drift
    const lean = THREE.MathUtils.clamp(
      this.state.lateralSpeed * 0.022 + this.input.steer * Math.abs(this.state.forwardSpeed) * 0.0035,
      -0.18,
      0.18,
    );
    this.chassis.rotation.z = THREE.MathUtils.lerp(this.chassis.rotation.z, lean, 0.2);

    // nitro flames
    const flameOn = this.state.isBoosting;
    for (const f of this.flames) {
      f.visible = flameOn;
      if (flameOn) {
        const s = 0.8 + Math.random() * 0.5;
        f.scale.set(s, 1 + Math.random() * 0.8, s);
      }
    }
  }

  private buildVisual(): THREE.Group {
    const g = new THREE.Group();
    this.chassis = new THREE.Group();
    g.add(this.chassis);

    if (this.modelTemplate) this.buildFromModel(this.modelTemplate);
    else this.buildProcedural();

    // exhaust flames (visible while boosting)
    const flameGeo = new THREE.ConeGeometry(0.13, 0.9, 8);
    flameGeo.rotateX(Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x55ccff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const sx of [-0.3, 0.3]) {
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(sx, 0.42, -1.35);
      flame.visible = false;
      this.chassis.add(flame);
      this.flames.push(flame);
    }

    // cheap blob shadow
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 3.0),
      new THREE.MeshBasicMaterial({
        map: blobShadowTexture(),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.045;
    g.add(shadow);

    return g;
  }

  /** Use a glTF car: normalize size/origin, wire up named wheel nodes. */
  private buildFromModel(template: THREE.Object3D): void {
    const model = template.clone(true);

    // normalize: length (z) ~2.3 m, centered on x/z, base on the ground
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = 2.3 / (size.z || 1);
    model.scale.setScalar(scale);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    // wheel nodes spin; front wheels (toward +z) also steer (Y before X)
    model.traverse((node) => {
      if (/wheel/i.test(node.name)) {
        node.rotation.order = 'YXZ';
        this.wheels.push(node);
        if (node.position.z > 0) this.frontWheels.push(node);
        return;
      }
      // tint body meshes to the racer color so karts match HUD/minimap.
      // Only textured materials (palette colormap carries the detail);
      // untextured ones (racing-kit cars) keep their authored colors.
      if (/character/i.test(node.name)) return;
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const tint = (m: THREE.Material): THREE.Material => {
        const std = m as THREE.MeshStandardMaterial;
        if (!std.map) return m;
        const tinted = std.clone();
        tinted.color.set(this.spec.color);
        return tinted;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(tint)
        : tint(mesh.material);
    });

    this.chassis.add(model);
  }

  private buildProcedural(): void {
    const color = this.spec.color;
    const accent = this.spec.accent;

    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1f26 });
    const accentMat = new THREE.MeshLambertMaterial({ color: accent });

    // main hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 2.1), bodyMat);
    hull.position.y = 0.42;
    this.chassis.add(hull);

    // nose cone
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.22, 0.5), bodyMat);
    nose.position.set(0, 0.4, 1.18);
    this.chassis.add(nose);

    // side pods
    for (const sx of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 1.0), accentMat);
      pod.position.set(sx * 0.66, 0.38, -0.1);
      this.chassis.add(pod);
    }

    // seat + driver
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.24), darkMat);
    seat.position.set(0, 0.72, -0.55);
    this.chassis.add(seat);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.3), accentMat);
    torso.position.set(0, 0.78, -0.3);
    this.chassis.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 12, 10),
      new THREE.MeshLambertMaterial({ color }),
    );
    head.position.set(0, 1.08, -0.3);
    this.chassis.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), darkMat);
    visor.position.set(0, 1.08, -0.12);
    this.chassis.add(visor);

    // rear wing
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.3), bodyMat);
    wing.position.set(0, 0.78, -1.0);
    this.chassis.add(wing);
    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.2), darkMat);
      strut.position.set(sx * 0.4, 0.6, -1.0);
      this.chassis.add(strut);
    }

    // wheels: front pair steers (extra pivot group), all spin
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.26, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x15161a });
    const hubGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.28, 8);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMat = new THREE.MeshLambertMaterial({ color: 0xb0bec5 });
    for (const [sx, sz] of [[-0.72, 0.72], [0.72, 0.72], [-0.72, -0.78], [0.72, -0.78]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx, 0.3, sz);
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(wheelGeo, wheelMat));
      wheel.add(new THREE.Mesh(hubGeo, hubMat));
      pivot.add(wheel);
      this.chassis.add(pivot);
      this.wheels.push(wheel);
      if (sz > 0) this.frontWheels.push(pivot);
    }
  }
}

import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { TrackData, TrackSample } from './TrackData';
import { TRACK } from '../game/config';
import { roadTexture, checkerTexture, barrierTexture, grassTexture } from './textures';
import { TrackDefinition } from './tracks';

/**
 * Builds a circuit from a TrackDefinition: centerline samples,
 * road/wall/scenery meshes and the static Rapier colliders (ground + barriers).
 */
export class TrackBuilder {
  build(def: TrackDefinition): { data: TrackData; group: THREE.Group } {
    const curve = new THREE.CatmullRomCurve3(
      def.controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );

    const samples = this.sampleCurve(curve, TRACK.SAMPLES);
    const totalLength = samples[samples.length - 1].arc +
      samples[samples.length - 1].pos.distanceTo(samples[0].pos);

    const checkpointIndices: number[] = [];
    for (let c = 0; c < TRACK.CHECKPOINTS; c++) {
      checkpointIndices.push(Math.round((c * samples.length) / TRACK.CHECKPOINTS));
    }

    const data = new TrackData(samples, totalLength, checkpointIndices, TRACK.ROAD_HALF_WIDTH);

    const group = new THREE.Group();
    group.add(this.buildGround(data));
    group.add(this.buildRoad(data));
    group.add(this.buildStartLine(data));
    group.add(this.buildWalls(data));
    // named so Scenery can swap them for glTF versions when assets exist
    const gate = this.buildStartGate(data);
    gate.name = 'start-gate';
    group.add(gate);
    const trees = this.buildTrees(data, def.seed);
    trees.name = 'trees';
    group.add(trees);
    return { data, group };
  }

  /**
   * Static physics: flat ground plus barrier segments along both road edges.
   * Returns the created colliders so a track switch can remove them.
   */
  buildPhysics(data: TrackData, rapier: typeof RAPIER, world: RAPIER.World): RAPIER.Collider[] {
    const colliders: RAPIER.Collider[] = [];
    // ground: one huge cuboid whose top face is y=0
    colliders.push(world.createCollider(
      rapier.ColliderDesc.cuboid(500, 1, 500).setTranslation(0, -1, 0).setFriction(1.0),
    ));

    // barrier colliders: one cuboid per stretch of samples, per side
    const step = 6;
    const n = data.sampleCount;
    for (let side of [-1, 1]) {
      for (let i = 0; i < n; i += step) {
        const a = data.sample(i);
        const b = data.sample(i + step);
        const pa = a.pos.clone().addScaledVector(a.right, side * TRACK.WALL_OFFSET);
        const pb = b.pos.clone().addScaledVector(b.right, side * TRACK.WALL_OFFSET);
        const mid = pa.clone().add(pb).multiplyScalar(0.5);
        const len = pa.distanceTo(pb);
        const angle = Math.atan2(pb.x - pa.x, pb.z - pa.z);
        const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        colliders.push(world.createCollider(
          rapier.ColliderDesc.cuboid(0.4, TRACK.WALL_HEIGHT, len / 2 + 0.5)
            .setTranslation(mid.x, TRACK.WALL_HEIGHT, mid.z)
            .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
            .setFriction(0.1)
            .setRestitution(0.4),
        ));
      }
    }
    return colliders;
  }

  private sampleCurve(curve: THREE.CatmullRomCurve3, count: number): TrackSample[] {
    const samples: TrackSample[] = [];
    let arc = 0;
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const pos = curve.getPointAt(t);
      pos.y = 0;
      const tangent = curve.getTangentAt(t);
      tangent.y = 0;
      tangent.normalize();
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
      if (prev) arc += pos.distanceTo(prev);
      prev = pos;
      samples.push({ pos, tangent, right, curvature: 0, arc });
    }
    // signed curvature from tangent angle change between neighbours
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const t0 = samples[(i - 1 + n) % n].tangent;
      const t1 = samples[(i + 1) % n].tangent;
      const cross = t0.x * t1.z - t0.z * t1.x; // y of cross product
      const angle = Math.asin(THREE.MathUtils.clamp(cross, -1, 1));
      const ds = samples[(i + 1) % n].pos.distanceTo(samples[(i - 1 + n) % n].pos);
      // positive curvature = turning left (negative cross in this handedness)
      samples[i].curvature = ds > 0 ? -angle / ds : 0;
    }
    return samples;
  }

  private buildGround(data: TrackData): THREE.Mesh {
    const { center } = trackBounds(data);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshLambertMaterial({ map: grassTexture() }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, -0.02, center.z);
    return mesh;
  }

  private buildRoad(data: TrackData): THREE.Mesh {
    const n = data.sampleCount;
    const hw = data.roadHalfWidth;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= n; i++) {
      const s = data.sample(i);
      const left = s.pos.clone().addScaledVector(s.right, -hw);
      const right = s.pos.clone().addScaledVector(s.right, hw);
      positions.push(left.x, 0.02, left.z, right.x, 0.02, right.z);
      const v = (i === n ? data.totalLength : s.arc) / 14; // texture repeats every 14 m
      uvs.push(0, v, 1, v);
      if (i < n) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: roadTexture() }));
  }

  private buildStartLine(data: TrackData): THREE.Group {
    const s = data.sample(0);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(data.roadHalfWidth * 2, 2.4),
      new THREE.MeshBasicMaterial({ map: checkerTexture() }),
    );
    mesh.rotation.x = -Math.PI / 2;
    const wrapper = new THREE.Group();
    wrapper.add(mesh);
    wrapper.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    wrapper.position.copy(s.pos).setY(0.035);
    return wrapper;
  }

  private buildWalls(data: TrackData): THREE.Group {
    const group = new THREE.Group();
    const tex = barrierTexture();
    tex.repeat.set(0.25, 1);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const n = data.sampleCount;

    for (const side of [-1, 1]) {
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i <= n; i++) {
        const s = data.sample(i);
        const base = s.pos.clone().addScaledVector(s.right, side * TRACK.WALL_OFFSET);
        positions.push(base.x, 0, base.z, base.x, TRACK.WALL_HEIGHT * 2, base.z);
        const v = (i === n ? data.totalLength : s.arc) / 4;
        uvs.push(v, 0, v, 1);
        if (i < n) {
          const a = i * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.material.side = THREE.DoubleSide;
      group.add(mesh);
    }
    return group;
  }

  private buildStartGate(data: TrackData): THREE.Group {
    const s = data.sample(0);
    const group = new THREE.Group();
    const pillarGeo = new THREE.BoxGeometry(0.8, 7, 0.8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x222831 });
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, mat);
      pillar.position
        .copy(s.pos)
        .addScaledVector(s.right, side * (data.roadHalfWidth + 1.2))
        .setY(3.5);
      group.add(pillar);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry((data.roadHalfWidth + 1.6) * 2, 1.4, 1),
      new THREE.MeshLambertMaterial({ color: 0x00b8d4 }),
    );
    beam.position.copy(s.pos).setY(7);
    beam.rotation.y = Math.atan2(s.right.x, s.right.z) - Math.PI / 2;
    group.add(beam);
    return group;
  }

  private buildTrees(data: TrackData, seed: number): THREE.Group {
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6);
    const crownGeo = new THREE.ConeGeometry(1.6, 3.6, 7);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6d4c2f });
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    const crownMat2 = new THREE.MeshLambertMaterial({ color: 0x388e3c });

    const { min, max } = trackBounds(data, 60);
    const rand = mulberry32(seed);
    let placed = 0;
    let attempts = 0;
    while (placed < 90 && attempts < 1200) {
      attempts++;
      const x = min.x + rand() * (max.x - min.x);
      const z = min.z + rand() * (max.z - min.z);
      const p = new THREE.Vector3(x, 0, z);
      // keep trees off the road corridor
      let minD = Infinity;
      for (let i = 0; i < data.sampleCount; i += 4) {
        minD = Math.min(minD, data.samples[i].pos.distanceToSquared(p));
      }
      if (minD < 19 * 19 || minD > 200 * 200) continue;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.8;
      const crown = new THREE.Mesh(crownGeo, rand() > 0.5 ? crownMat : crownMat2);
      crown.position.y = 3.2;
      const scale = 0.8 + rand() * 0.9;
      tree.add(trunk, crown);
      tree.scale.setScalar(scale);
      tree.position.copy(p);
      group.add(tree);
      placed++;
    }
    return group;
  }
}

/** Planar bounds of the centerline, padded by `margin` meters. */
export function trackBounds(data: TrackData, margin = 0): {
  min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3;
} {
  const min = new THREE.Vector3(Infinity, 0, Infinity);
  const max = new THREE.Vector3(-Infinity, 0, -Infinity);
  for (const s of data.samples) {
    min.x = Math.min(min.x, s.pos.x); min.z = Math.min(min.z, s.pos.z);
    max.x = Math.max(max.x, s.pos.x); max.z = Math.max(max.z, s.pos.z);
  }
  min.x -= margin; min.z -= margin;
  max.x += margin; max.z += margin;
  return { min, max, center: min.clone().add(max).multiplyScalar(0.5) };
}

/** Deterministic PRNG so scenery layout is stable between runs. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

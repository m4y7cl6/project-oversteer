import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { TrackData, TrackSample } from './TrackData';
import { TRACK } from '../game/config';
import { roadTexture, checkerTexture, barrierTexture, groundTexture, buildingTexture } from './textures';
import { TrackDefinition, TrackThemeConfig, THEMES } from './tracks';

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

    const theme = THEMES[def.theme];
    const group = new THREE.Group();
    group.add(this.buildGround(data, theme));
    group.add(this.buildRoad(data));
    group.add(this.buildStartLine(data));
    group.add(this.buildWalls(data));
    // named so Scenery can swap them for glTF versions when assets exist
    const gate = this.buildStartGate(data);
    gate.name = 'start-gate';
    group.add(gate);
    const props = this.buildProps(data, def.seed, theme);
    props.name = 'trees';
    group.add(props);
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

  private buildGround(data: TrackData, theme: TrackThemeConfig): THREE.Mesh {
    const { center } = trackBounds(data);
    const g = theme.ground;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshLambertMaterial({ map: groundTexture(g.base, g.speckleA, g.speckleB) }),
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

  /**
   * Scatter theme props (trees / pines / cacti / buildings) on the terrain,
   * keeping a clear corridor around the road. Deterministic via the seed.
   */
  private buildProps(data: TrackData, seed: number, theme: TrackThemeConfig): THREE.Group {
    const group = new THREE.Group();
    const builders: Record<TrackThemeConfig['props'], (rand: () => number) => THREE.Object3D> = {
      trees: (rand) => this.makeTree(rand, 0x2e7d32, 0x388e3c),
      pines: (rand) => this.makeTree(rand, 0x1b5e20, 0x2e7d32, 1.4),
      cacti: (rand) => this.makeCactus(rand),
      buildings: (rand) => this.makeBuilding(rand),
    };
    const make = builders[theme.props];
    // buildings sit further back and are sparser than vegetation
    const isCity = theme.props === 'buildings';
    const clearance = isCity ? 26 : 19;
    const count = theme.props === 'pines' ? 130 : isCity ? 55 : 90;

    const { min, max } = trackBounds(data, isCity ? 80 : 60);
    const rand = mulberry32(seed);
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < 1600) {
      attempts++;
      const x = min.x + rand() * (max.x - min.x);
      const z = min.z + rand() * (max.z - min.z);
      const p = new THREE.Vector3(x, 0, z);
      // keep props off the road corridor
      let minD = Infinity;
      for (let i = 0; i < data.sampleCount; i += 4) {
        minD = Math.min(minD, data.samples[i].pos.distanceToSquared(p));
      }
      if (minD < clearance * clearance || minD > 200 * 200) continue;
      const prop = make(rand);
      prop.position.copy(p);
      group.add(prop);
      placed++;
    }
    return group;
  }

  private treeGeos?: { trunk: THREE.CylinderGeometry; crown: THREE.ConeGeometry };

  private makeTree(rand: () => number, crownA: number, crownB: number, heightScale = 1): THREE.Group {
    this.treeGeos ??= {
      trunk: new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6),
      crown: new THREE.ConeGeometry(1.6, 3.6, 7),
    };
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      this.treeGeos.trunk, new THREE.MeshLambertMaterial({ color: 0x6d4c2f }),
    );
    trunk.position.y = 0.8;
    const crown = new THREE.Mesh(
      this.treeGeos.crown,
      new THREE.MeshLambertMaterial({ color: rand() > 0.5 ? crownA : crownB }),
    );
    crown.position.y = 3.2;
    crown.scale.y = heightScale;
    tree.add(trunk, crown);
    tree.scale.setScalar(0.8 + rand() * 0.9);
    return tree;
  }

  private makeCactus(rand: () => number): THREE.Group {
    const cactus = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: rand() > 0.4 ? 0x4c8c3f : 0x6aa84f });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 3.4, 7), mat);
    trunk.position.y = 1.7;
    cactus.add(trunk);
    // 1–2 arms: short cylinders sprouting sideways then up
    const arms = 1 + Math.floor(rand() * 2);
    for (let a = 0; a < arms; a++) {
      const side = a === 0 ? 1 : -1;
      const out = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 1.0, 6), mat);
      out.rotation.z = side * Math.PI / 2;
      out.position.set(side * 0.85, 1.4 + rand() * 0.8, 0);
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 1.3, 6), mat);
      up.position.set(side * 1.3, out.position.y + 0.75, 0);
      cactus.add(out, up);
    }
    cactus.scale.setScalar(0.7 + rand() * 0.9);
    cactus.rotation.y = rand() * Math.PI * 2;
    return cactus;
  }

  private buildingMat?: THREE.MeshLambertMaterial;
  private buildingRoofMat?: THREE.MeshLambertMaterial;

  private makeBuilding(rand: () => number): THREE.Group {
    this.buildingMat ??= new THREE.MeshLambertMaterial({ map: buildingTexture() });
    this.buildingRoofMat ??= new THREE.MeshLambertMaterial({ color: 0x10131c });
    const w = 10 + rand() * 14;
    const d = 10 + rand() * 14;
    const h = 18 + rand() * 42;
    const block = new THREE.Group();
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      [
        this.buildingMat, this.buildingMat, // ±x facades
        this.buildingRoofMat, this.buildingRoofMat, // roof + base
        this.buildingMat, this.buildingMat, // ±z facades
      ],
    );
    tower.position.y = h / 2;
    block.add(tower);
    block.rotation.y = Math.floor(rand() * 4) * (Math.PI / 2) + (rand() - 0.5) * 0.2;
    return block;
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

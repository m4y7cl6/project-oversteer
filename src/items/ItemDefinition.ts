import * as THREE from 'three';
import { ItemEffect, NitroChargeEffect, CoinEffect } from './ItemEffect';

/**
 * Static description of one pickup type. Future items (shields, missiles,
 * traps…) add an entry here plus an ItemEffect — no manager changes needed.
 */
export interface ItemDefinition {
  id: string;
  name: string;
  effect: ItemEffect;
  /** Collection radius in m (distance from kart center). */
  radius: number;
  /** Seconds before a collected pickup reappears; Infinity = one-shot. */
  respawnTime: number;
  /** Builds the floating visual; called once per placed instance. */
  buildVisual(): THREE.Object3D;
}

export const ITEM_NITRO: ItemDefinition = {
  id: 'nitro-pickup',
  name: 'Nitro Canister',
  effect: new NitroChargeEffect(35),
  radius: 2.4,
  respawnTime: 6,
  buildVisual(): THREE.Object3D {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.2, 10),
      new THREE.MeshLambertMaterial({ color: 0x00e5ff, emissive: 0x0288a8 }),
    );
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 0.3, 8),
      new THREE.MeshLambertMaterial({ color: 0xb0bec5 }),
    );
    cap.position.y = 0.75;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.05, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0x55d6ff, transparent: true, opacity: 0.7 }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(body, cap, ring);
    return group;
  },
};

export const ITEM_COIN: ItemDefinition = {
  id: 'coin-pickup',
  name: 'Coin',
  effect: new CoinEffect(5),
  radius: 2.0,
  respawnTime: 10,
  buildVisual(): THREE.Object3D {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16),
      new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0x8a6d1a }),
    );
    coin.rotation.z = Math.PI / 2; // stand it on edge so the spin reads
    const group = new THREE.Group();
    group.add(coin);
    return group;
  },
};

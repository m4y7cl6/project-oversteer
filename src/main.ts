import * as THREE from 'three';
import { Physics } from './core/Physics';
import { AssetManager, AssetManifestEntry } from './core/AssetManager';
import { Game } from './game/Game';
import { RACERS } from './game/config';
import { SCENERY_MODELS } from './track/Scenery';

async function fetchManifest(): Promise<AssetManifestEntry[]> {
  try {
    const res = await fetch('assets/manifest.json');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return []; // no published assets: fully procedural mode
  }
}

/**
 * Load the kart models named in RACERS plus the scenery props from the
 * published asset manifest. Missing manifest / failed loads are fine — karts
 * fall back to procedural meshes and scenery simply stays procedural.
 */
async function loadModels(
  assets: AssetManager,
  manifest: AssetManifestEntry[],
): Promise<Map<string, THREE.Object3D>> {
  const models = new Map<string, THREE.Object3D>();
  const wanted = [...new Set([
    ...RACERS.map((r) => r.model).filter((m): m is string => !!m),
    ...SCENERY_MODELS,
  ])];
  await Promise.all(wanted.map(async (name) => {
    const entry = manifest.find(
      (e) => e.type === 'gltf' && e.key.toLowerCase().endsWith(`.${name.toLowerCase()}`),
    );
    if (!entry) return;
    try {
      const gltf = await assets.loadGLTF(name, entry.url);
      models.set(name, gltf.scene);
    } catch (err) {
      console.warn(`kart model "${name}" failed to load, using procedural`, err);
    }
  }));
  return models;
}

async function boot(): Promise<void> {
  const status = document.getElementById('loading-status')!;
  try {
    status.textContent = 'loading physics...';
    await Physics.init(); // Rapier WASM

    status.textContent = 'loading models...';
    const assets = new AssetManager();
    const manifest = await fetchManifest();
    const models = await loadModels(assets, manifest);

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    new Game(canvas, assets, models, manifest);
  } catch (err) {
    console.error(err);
    status.textContent = 'failed to start — see console';
  }
}

boot();

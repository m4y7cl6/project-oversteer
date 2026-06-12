import * as THREE from 'three';
import { Physics } from './core/Physics';
import { AssetManager, AssetManifestEntry } from './core/AssetManager';
import { Game } from './game/Game';
import { RACERS } from './game/config';

/**
 * Load the kart models named in RACERS from the published asset manifest.
 * Missing manifest / failed loads are fine — those karts fall back to the
 * procedural mesh.
 */
async function loadKartModels(assets: AssetManager): Promise<Map<string, THREE.Object3D>> {
  const models = new Map<string, THREE.Object3D>();
  let manifest: AssetManifestEntry[];
  try {
    const res = await fetch('assets/manifest.json');
    if (!res.ok) return models;
    manifest = await res.json();
  } catch {
    return models; // no published assets: fully procedural mode
  }

  const wanted = [...new Set(RACERS.map((r) => r.model).filter((m): m is string => !!m))];
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
    const kartModels = await loadKartModels(assets);

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    new Game(canvas, assets, kartModels);
  } catch (err) {
    console.error(err);
    status.textContent = 'failed to start — see console';
  }
}

boot();

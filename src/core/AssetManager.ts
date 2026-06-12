import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export interface AssetManifestEntry {
  key: string;
  url: string;
  type: 'gltf' | 'texture' | 'audio';
}

/**
 * Central asset cache: glTF models, textures and audio buffers.
 * NITRO RUSH ships with procedural assets, so the manifest is empty by
 * default — but the pipeline (scripts/) drops files into /assets and a
 * manifest.json that this class can preload.
 */
export class AssetManager {
  private gltfLoader: GLTFLoader;
  private textureLoader = new THREE.TextureLoader();
  private audioLoader = new THREE.AudioLoader();

  private gltfCache = new Map<string, GLTF>();
  private textureCache = new Map<string, THREE.Texture>();
  private audioCache = new Map<string, AudioBuffer>();

  constructor() {
    this.gltfLoader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.gltfLoader.setDRACOLoader(draco);
  }

  /** Preload everything listed in a manifest; reports progress 0..1. */
  async preload(entries: AssetManifestEntry[], onProgress?: (p: number) => void): Promise<void> {
    let done = 0;
    await Promise.all(entries.map(async (e) => {
      switch (e.type) {
        case 'gltf': await this.loadGLTF(e.key, e.url); break;
        case 'texture': await this.loadTexture(e.key, e.url); break;
        case 'audio': await this.loadAudio(e.key, e.url); break;
      }
      done++;
      onProgress?.(done / entries.length);
    }));
  }

  async loadGLTF(key: string, url: string): Promise<GLTF> {
    const cached = this.gltfCache.get(key);
    if (cached) return cached;
    const gltf = await this.gltfLoader.loadAsync(url);
    this.gltfCache.set(key, gltf);
    return gltf;
  }

  async loadTexture(key: string, url: string): Promise<THREE.Texture> {
    const cached = this.textureCache.get(key);
    if (cached) return cached;
    const tex = await this.textureLoader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textureCache.set(key, tex);
    return tex;
  }

  async loadAudio(key: string, url: string): Promise<AudioBuffer> {
    const cached = this.audioCache.get(key);
    if (cached) return cached;
    const buf = await this.audioLoader.loadAsync(url);
    this.audioCache.set(key, buf);
    return buf;
  }

  /** Register a runtime-generated texture (procedural canvas art etc.). */
  registerTexture(key: string, tex: THREE.Texture): void {
    this.textureCache.set(key, tex);
  }

  getTexture(key: string): THREE.Texture | undefined { return this.textureCache.get(key); }
  getGLTF(key: string): GLTF | undefined { return this.gltfCache.get(key); }
  getAudio(key: string): AudioBuffer | undefined { return this.audioCache.get(key); }

  dispose(): void {
    this.textureCache.forEach((t) => t.dispose());
    this.gltfCache.clear();
    this.textureCache.clear();
    this.audioCache.clear();
  }
}

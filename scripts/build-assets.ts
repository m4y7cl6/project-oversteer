/**
 * Asset pipeline step 3: publish processed assets to public/assets and emit
 * a manifest.json that AssetManager.preload() can consume.
 *
 *   npm run assets:build
 */
import * as fs from 'fs';
import * as path from 'path';

const PROCESSED_DIR = path.resolve(__dirname, '..', 'assets', 'processed');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public', 'assets');

interface ManifestEntry {
  key: string;
  url: string;
  type: 'gltf' | 'texture' | 'audio';
}

function typeOf(file: string): ManifestEntry['type'] | null {
  if (/\.(glb|gltf)$/i.test(file)) return 'gltf';
  if (/\.(png|jpe?g|webp|ktx2)$/i.test(file)) return 'texture';
  if (/\.(ogg|mp3|wav)$/i.test(file)) return 'audio';
  return null;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function main(): void {
  const files = walk(PROCESSED_DIR);
  if (files.length === 0) {
    console.log('Nothing in assets/processed/. Run the earlier pipeline steps first.');
    return;
  }
  fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
  const manifest: ManifestEntry[] = [];
  for (const src of files) {
    const type = typeOf(src);
    if (!type) continue;
    const rel = path.relative(PROCESSED_DIR, src).split(path.sep).join('/');
    const dest = path.join(PUBLIC_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    manifest.push({
      key: rel.replace(/\.[^.]+$/, '').replace(/\//g, '.'),
      url: `assets/${rel}`,
      type,
    });
  }
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`Published ${manifest.length} asset(s) + manifest.json to public/assets/.`);
}

main();

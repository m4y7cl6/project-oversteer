/**
 * Asset pipeline step 2: glTF optimization.
 *
 * Walks assets/raw/** for .gltf/.glb files and writes Draco-compressed,
 * texture-optimized copies to assets/processed/, preserving relative paths.
 * Uses @gltf-transform/cli via npx (downloaded on first use). If the CLI is
 * unavailable (old Node etc.) the file is copied through unmodified — Kenney
 * models are tiny, optimization is a nice-to-have.
 *
 *   npm run assets:optimize [-- --filter <regex>]
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const RAW_DIR = path.resolve(__dirname, '..', 'assets', 'raw');
const OUT_DIR = path.resolve(__dirname, '..', 'assets', 'processed');

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(glb|gltf|ogg|mp3|wav)$/i.test(name)) out.push(p);
  }
  return out;
}

function main(): void {
  const filterIdx = process.argv.indexOf('--filter');
  const filter = filterIdx > -1 ? new RegExp(process.argv[filterIdx + 1], 'i') : null;

  let models = walk(RAW_DIR);
  if (filter) models = models.filter((m) => filter.test(m));
  if (models.length === 0) {
    console.log('No matching glTF models under assets/raw/. Run npm run assets:download first.');
    return;
  }
  console.log(`Optimizing ${models.length} model(s)...`);
  let ok = 0;
  let copied = 0;
  for (const src of models) {
    const rel = path.relative(RAW_DIR, src).replace(/\.gltf$/i, '.glb');
    const dest = path.join(OUT_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (/\.(ogg|mp3|wav)$/i.test(src)) {
      // audio passes through as-is
      fs.copyFileSync(src, dest);
      copied++;
      continue;
    }
    try {
      execSync(
        `npx --yes @gltf-transform/cli optimize "${src}" "${dest}" --compress draco --texture-compress webp`,
        { stdio: 'pipe' },
      );
      console.log(`  ok ${rel}`);
      ok++;
    } catch {
      fs.copyFileSync(src, dest);
      console.log(`  copied unoptimized ${rel}`);
      copied++;
    }
  }
  // external textures referenced by .glb files (e.g. Kenney colormap.png)
  for (const dir of new Set(models.map((m) => path.dirname(m)))) {
    const texDir = path.join(dir, 'Textures');
    if (!fs.existsSync(texDir)) continue;
    for (const tex of fs.readdirSync(texDir)) {
      const destTex = path.join(OUT_DIR, path.relative(RAW_DIR, texDir), tex);
      fs.mkdirSync(path.dirname(destTex), { recursive: true });
      fs.copyFileSync(path.join(texDir, tex), destTex);
    }
  }
  console.log(`\n${ok} optimized, ${copied} copied into assets/processed/.`);
  console.log('Next: npm run assets:build');
}

main();

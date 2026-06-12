/**
 * Asset pipeline step 1: download CC0 / free-commercial asset packs.
 *
 * NITRO RUSH renders everything procedurally by default, so this step is
 * OPTIONAL — run it only when you want to swap in real models/sounds.
 * Every source listed here is CC0 (redistribution allowed). URLs on these
 * sites occasionally move; a failed download is reported, not fatal.
 *
 *   npm run assets:download
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';

interface AssetSource {
  name: string;
  url: string;
  license: 'CC0';
  attribution: string;
  /** target folder under assets/raw */
  dir: string;
}

const SOURCES: AssetSource[] = [
  {
    name: 'Kenney Racing Kit (race cars + track props)',
    url: 'https://kenney.nl/media/pages/assets/racing-kit/933b8fd9fd-1677580949/kenney_racing-kit.zip',
    license: 'CC0',
    attribution: 'Kenney.nl',
    dir: 'kenney-racing-kit',
  },
  {
    name: 'Kenney Car Kit (stylized low-poly cars)',
    url: 'https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip',
    license: 'CC0',
    attribution: 'Kenney.nl',
    dir: 'kenney-car-kit',
  },
];

const RAW_DIR = path.resolve(__dirname, '..', 'assets', 'raw');

function download(url: string, dest: string, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).href, dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    }).on('error', reject);
  });
}

function extract(zipPath: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force '${zipPath}' '${destDir}'"`,
      { stdio: 'inherit' },
    );
  } else {
    execSync(`unzip -o '${zipPath}' -d '${destDir}'`, { stdio: 'inherit' });
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  let ok = 0;
  for (const src of SOURCES) {
    const zipPath = path.join(RAW_DIR, `${src.dir}.zip`);
    const destDir = path.join(RAW_DIR, src.dir);
    process.stdout.write(`-> ${src.name} ... `);
    try {
      await download(src.url, zipPath);
      extract(zipPath, destDir);
      fs.writeFileSync(
        path.join(destDir, 'LICENSE.txt'),
        `${src.license} — ${src.attribution}\nSource: ${src.url}\n`,
      );
      console.log('ok');
      ok++;
    } catch (err) {
      console.log(`FAILED (${(err as Error).message}) — update the URL in scripts/download-assets.ts`);
    }
  }
  console.log(`\n${ok}/${SOURCES.length} packs downloaded to assets/raw/.`);
  console.log('Next: npm run assets:optimize');
}

main();

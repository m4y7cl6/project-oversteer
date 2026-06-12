/* Captures top-down + start-line views of the track for layout debugging.
 * The menu camera is free (ChaseCamera.update only runs while racing), so we
 * hide the start screen and reposition the camera directly.
 * Usage: node scripts/overview-shot.cjs
 */
const { chromium } = require('playwright-core');
const path = require('path');

const URL = process.env.GAME_URL || 'http://localhost:5173';
const SHOT_DIR = path.resolve(__dirname, '..', '.smoke');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#start-button:not([disabled])', { timeout: 30000 });

  await page.evaluate(() => {
    document.getElementById('start-screen').classList.add('hidden');
    const cam = window.__NITRO_RUSH__.chaseCam.camera;
    cam.position.set(20, 300, 80);
    cam.lookAt(20, 0, 80);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT_DIR, 'overview-top.png') });

  await page.evaluate(() => {
    const cam = window.__NITRO_RUSH__.chaseCam.camera;
    cam.position.set(-25, 6, -22);
    cam.lookAt(15, 2, 5);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT_DIR, 'overview-start.png') });

  console.log('overview screenshots saved');
  await browser.close();
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});

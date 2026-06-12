/* Headless smoke test: boots the game in system Edge, starts a race,
 * drives forward for a few seconds and reports HUD state + console errors.
 * Usage: node scripts/smoke-test.cjs
 */
const { chromium } = require('playwright-core');
const path = require('path');

const URL = process.env.GAME_URL || 'http://localhost:5173';
const SHOT_DIR = path.resolve(__dirname, '..', '.smoke');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`HTTP ${res.status()} ${res.url()}`);
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

  // start screen ready (Rapier WASM loaded)
  await page.waitForSelector('#start-button:not([disabled])', { timeout: 30000 });
  await page.screenshot({ path: path.join(SHOT_DIR, '1-start.png') });
  console.log('start screen OK');

  await page.click('#start-button');
  await page.waitForSelector('#countdown:not(.hidden)', { timeout: 5000 });
  console.log('countdown OK:', (await page.textContent('#countdown')).trim());
  await page.screenshot({ path: path.join(SHOT_DIR, '2-countdown.png') });

  // wait for GO then hold W (+a drift burst) for a few seconds
  await page.waitForFunction(
    () => document.getElementById('countdown').classList.contains('hidden'),
    { timeout: 8000 },
  );
  await page.keyboard.down('w');
  await page.waitForTimeout(2500);

  // sample HUD on the opening straight, at full tilt
  const readHud = () => page.evaluate(() => ({
    speed: document.getElementById('speed-value').textContent,
    pos: document.getElementById('position-value').textContent,
    lap: document.getElementById('lap-value').textContent,
    time: document.getElementById('time-value').textContent,
    nitro: document.getElementById('nitro-fill').style.width,
  }));
  const straight = await readHud();
  console.log('HUD on straight:', JSON.stringify(straight));

  // drift burst into the first corner (steer right, matching the track)
  await page.keyboard.down('d');
  await page.keyboard.down('Shift');
  await page.waitForTimeout(700);
  await page.keyboard.up('Shift');
  await page.keyboard.up('d');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOT_DIR, '3-racing.png') });
  const afterDrift = await readHud();
  await page.keyboard.up('w');
  console.log('HUD after drift:', JSON.stringify(afterDrift));

  const speed = parseInt(straight.speed, 10);
  if (!(speed > 70)) throw new Error(`kart too slow on straight (speed=${straight.speed})`);
  if (straight.time === '0:00.000') throw new Error('race clock not running');
  if (parseInt(afterDrift.nitro, 10) <= 0) throw new Error('drift did not charge nitro');
  if (errors.length) {
    console.log('CONSOLE ERRORS:');
    errors.forEach((e) => console.log('  ' + e));
    throw new Error(`${errors.length} console error(s)`);
  }

  console.log('SMOKE TEST PASSED');
  await browser.close();
})().catch((err) => {
  console.error('SMOKE TEST FAILED:', err.message);
  process.exit(1);
});

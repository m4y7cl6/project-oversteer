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
    if (msg.type() !== 'error') return;
    // the optional asset manifest 404s in procedural mode — not a failure
    if ((msg.location()?.url ?? '').includes('assets/manifest.json')) return;
    errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on('response', (res) => {
    // the asset manifest is optional (procedural mode when the pipeline hasn't run)
    if (res.url().endsWith('assets/manifest.json')) return;
    if (res.status() >= 400) errors.push(`HTTP ${res.status()} ${res.url()}`);
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

  // splash ready (Rapier WASM loaded), then navigate to race setup
  await page.waitForSelector('#splash-start:not([disabled])', { timeout: 30000 });
  await page.screenshot({ path: path.join(SHOT_DIR, '1-start.png') });
  console.log('splash screen OK');
  await page.click('#splash-start');
  await page.click('#menu-race');

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
  const readKartState = () => page.evaluate(() => {
    const st = window.__NITRO_RUSH__.raceManager.player.kart.state;
    return {
      drifting: st.isDrifting,
      score: Math.round(st.driftScore),
      tier: st.driftTier,
      miniTier: st.miniBoostTier,
      miniTimer: +st.miniBoostTimer.toFixed(2),
    };
  });
  await page.keyboard.down('d');
  await page.keyboard.down('Shift');
  await page.waitForTimeout(1100);
  const midDrift = await readKartState();
  await page.screenshot({ path: path.join(SHOT_DIR, '3-racing.png') });
  await page.keyboard.up('Shift');
  await page.keyboard.up('d');
  await page.waitForTimeout(200);
  const released = await readKartState();
  await page.waitForTimeout(1000);
  const afterDrift = await readHud();
  await page.keyboard.up('w');
  console.log('mid-drift:', JSON.stringify(midDrift));
  console.log('released:', JSON.stringify(released));
  console.log('HUD after drift:', JSON.stringify(afterDrift));

  if (!midDrift.drifting || midDrift.score <= 0) throw new Error('drift did not register');
  if (midDrift.tier >= 1 && released.miniTier < 1) {
    throw new Error('tier earned but no mini-boost on release');
  }
  if (midDrift.tier === 0) console.log('note: drift too short for tier 1 this run');

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

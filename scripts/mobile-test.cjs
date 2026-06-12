/* Mobile smoke test: emulated touch device (landscape phone), starts a race,
 * drives via the on-screen controls and checks HUD/auto-throttle/drift.
 * Usage: node scripts/mobile-test.cjs   (GAME_URL env to target live site)
 */
const { chromium } = require('playwright-core');
const path = require('path');

const URL = process.env.GAME_URL || 'http://localhost:5173';
const SHOT_DIR = path.resolve(__dirname, '..', '.smoke');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 }, // iPhone-ish landscape
    hasTouch: true,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#start-button:not([disabled])', { timeout: 30000 });

  const touchMode = await page.evaluate(() => document.body.classList.contains('touch-mode'));
  if (!touchMode) throw new Error('touch mode not detected on emulated device');
  console.log('touch mode detected');

  await page.tap('#start-button');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 5000 });
  const controlsVisible = await page.isVisible('#touch-controls');
  if (!controlsVisible) throw new Error('touch controls not visible during race');
  await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-countdown.png') });

  // wait for GO; auto-throttle should move the kart with no input at all
  await page.waitForSelector('#countdown:not(.hidden)', { timeout: 5000 });
  await page.waitForFunction(
    () => document.getElementById('countdown').classList.contains('hidden'),
    { timeout: 9000 },
  );
  // sample while still on the opening straight (no steering yet)
  await page.waitForTimeout(1200);
  const speed1 = await page.evaluate(
    () => window.__NITRO_RUSH__.raceManager.player.kart.state.speedKmh,
  );
  console.log('auto-throttle speed:', Math.round(speed1), 'km/h');
  if (speed1 < 50) throw new Error('auto-throttle did not move the kart');

  // hold steer-right + drift via touchscreen; sample the slide as it happens
  const hold = (sel) => page.dispatchEvent(sel, 'touchstart');
  const release = (sel) => page.dispatchEvent(sel, 'touchend');
  await hold('#touch-right');
  await hold('#touch-drift');
  let best = { drifting: false, score: 0 };
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const st = window.__NITRO_RUSH__.raceManager.player.kart.state;
      return { drifting: st.isDrifting, score: Math.round(st.driftScore) };
    });
    if (s.score >= best.score) best = s;
  }
  await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-racing.png') });
  await release('#touch-drift');
  await release('#touch-right');
  console.log('touch drift (best sample):', JSON.stringify(best));
  if (best.score <= 0) throw new Error('touch drift did not register');

  if (errors.length) {
    console.log('PAGE ERRORS:', errors);
    throw new Error('page errors');
  }
  console.log('MOBILE TEST PASSED');
  await browser.close();
})().catch((err) => {
  console.error('MOBILE TEST FAILED:', err.message);
  process.exit(1);
});

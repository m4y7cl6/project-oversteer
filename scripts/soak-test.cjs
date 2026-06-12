/* AI soak test: start a 1-lap race with no player input and verify all 7 AI
 * navigate the full circuit (ordered checkpoints) and finish.
 * Usage: node scripts/soak-test.cjs
 */
const { chromium } = require('playwright-core');

const URL = process.env.GAME_URL || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#start-button:not([disabled])', { timeout: 30000 });
  await page.click('.lap-btn[data-laps="1"]');
  await page.click('#start-button');

  const snapshot = () => page.evaluate(() => {
    const rm = window.__NITRO_RUSH__.raceManager;
    return {
      time: rm.raceTime,
      racers: rm.entries.map((e) => ({
        name: e.kart.spec.name,
        lap: e.progress.lap,
        cp: e.progress.nextCheckpoint,
        finished: e.progress.finished,
        speed: Math.round(e.kart.state.forwardSpeed * 3.6),
      })),
    };
  });

  const deadline = Date.now() + 150000;
  let snap;
  for (;;) {
    await page.waitForTimeout(5000);
    snap = await snapshot();
    const ai = snap.racers.slice(1);
    const done = ai.filter((r) => r.finished).length;
    console.log(
      `t=${snap.time.toFixed(0).padStart(3)}s  finished=${done}/7  ` +
      ai.map((r) => `${r.name}:${r.finished ? 'FIN' : `cp${r.cp} ${r.speed}km/h`}`).join('  '),
    );
    if (done === 7) break;
    if (Date.now() > deadline) {
      console.error('SOAK TEST FAILED: AI did not all finish in 150s');
      console.error(JSON.stringify(snap, null, 2));
      process.exit(1);
    }
  }

  if (errors.length) {
    console.error('PAGE ERRORS:', errors);
    process.exit(1);
  }
  console.log('SOAK TEST PASSED — all 7 AI finished a full lap');
  await browser.close();
})().catch((err) => {
  console.error('SOAK TEST FAILED:', err.message);
  process.exit(1);
});

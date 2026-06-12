/* Time-trial E2E: runs a full 1-lap time trial with an autopilot driving the
 * player kart, verifies the ghost is saved, then starts a second run and
 * verifies the ghost replays.
 * Usage: node scripts/timetrial-test.cjs
 */
const { chromium } = require('playwright-core');

const URL = process.env.GAME_URL || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#start-button:not([disabled])', { timeout: 30000 });
  await page.click('.mode-btn[data-mode="timetrial"]');
  await page.click('.lap-btn[data-laps="1"]');
  await page.click('#start-button');

  // autopilot: borrow an AI controller class and drive the player kart
  await page.evaluate(() => {
    const g = window.__NITRO_RUSH__;
    const AICtor = g.entries[1].ai.constructor;
    const auto = new AICtor(g.playerKart, g.trackManager.data, () => []);
    g.playerController.fixedUpdate = (enabled) => auto.fixedUpdate(1 / 60, enabled);
  });

  const aiHidden = await page.evaluate(
    () => window.__NITRO_RUSH__.entries[1].kart.visual.visible === false,
  );
  if (!aiHidden) throw new Error('AI karts visible during time trial');
  console.log('AI parked & hidden in time trial');

  // wait for the lap to finish (autopilot pace ~45 s)
  await page.waitForFunction(
    () => window.__NITRO_RUSH__.raceManager.player.progress.finished,
    null,
    { timeout: 120000, polling: 1000 },
  );
  const run1 = await page.evaluate(() => {
    const g = window.__NITRO_RUSH__;
    const key = `nr-ghost:${g.currentTrackId}:1`;
    const stored = localStorage.getItem(key);
    return {
      time: g.raceManager.player.progress.finishTime,
      saved: !!stored,
      bytes: stored ? stored.length : 0,
    };
  });
  console.log('run 1:', JSON.stringify(run1));
  if (!run1.saved) throw new Error('ghost not saved to localStorage');

  // second run: ghost should load and replay
  await page.click('#restart-button');
  await page.waitForTimeout(6000); // countdown + a few seconds of racing
  const run2 = await page.evaluate(() => {
    const g = window.__NITRO_RUSH__;
    const ghostObj = g.ghost.visual;
    return {
      bestTime: g.ghost.bestTime,
      ghostInScene: !!ghostObj && !!ghostObj.parent,
      ghostMoved: !!ghostObj && ghostObj.position.lengthSq() > 1,
    };
  });
  console.log('run 2:', JSON.stringify(run2));
  if (!run2.ghostInScene) throw new Error('ghost visual missing on second run');
  if (!run2.ghostMoved) throw new Error('ghost did not move');
  if (!isFinite(run2.bestTime)) throw new Error('best time not loaded');

  if (errors.length) {
    console.log('PAGE ERRORS:', errors);
    throw new Error('page errors');
  }
  console.log('TIME TRIAL TEST PASSED');
  await browser.close();
})().catch((err) => {
  console.error('TIME TRIAL TEST FAILED:', err.message);
  process.exit(1);
});

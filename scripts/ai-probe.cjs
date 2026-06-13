/* AI diagnosis probe: 3-lap race on a chosen track, no player input.
 * Samples each AI twice a second and reports anomalies: stuck (slow for
 * sustained time), off-road excursions, and where on the track they happen.
 * Usage: TRACK=thunder node scripts/ai-probe.cjs
 */
const { chromium } = require('playwright-core');

const URL = process.env.GAME_URL || 'http://localhost:5173';
const TRACK = process.env.TRACK || 'thunder';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // unlock every track so the probe can select any of them
  await page.addInitScript(() => {
    localStorage.setItem('nitro-rush:profile', JSON.stringify({
      version: 1,
      data: { unlockedTracks: ['sunrise', 'thunder', 'emerald', 'dune', 'neon'] },
    }));
  });
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#splash-start:not([disabled])', { timeout: 30000 });
  await page.click('#splash-start');
  await page.click('#menu-race');
  await page.click(`.track-btn[data-track="${TRACK}"]`);
  await page.waitForTimeout(400);
  await page.click('.lap-btn[data-laps="3"]');
  await page.click('#start-button');
  await page.waitForTimeout(500);
  console.log('track:', await page.evaluate(() => window.__NITRO_RUSH__.currentTrackId));

  if (process.env.PLAYER === 'auto') {
    // realistic race: an autopilot drives the player kart among the AI
    await page.evaluate(() => {
      const g = window.__NITRO_RUSH__;
      const AICtor = g.entries[1].ai.constructor;
      const auto = new AICtor(
        g.playerKart, g.trackManager.data, () => g.entries.map((e) => e.kart),
      );
      g.playerController.fixedUpdate = (enabled) => auto.fixedUpdate(1 / 60, enabled);
    });
    console.log('player: autopilot');
  }

  const snapshot = () => page.evaluate(() => {
    const g = window.__NITRO_RUSH__;
    const rm = g.raceManager;
    const data = g.trackManager.data;
    return {
      time: rm.raceTime,
      state: rm.state,
      racers: rm.entries.map((e, i) => {
        const p = e.kart.position;
        const lat = data.lateralOffset(p, e.progress.sampleIndex);
        return {
          name: e.kart.spec.name,
          isAI: i > 0,
          lap: e.progress.lap,
          cp: e.progress.nextCheckpoint,
          speed: e.kart.state.forwardSpeed,
          x: Math.round(p.x), z: Math.round(p.z),
          lat: +lat.toFixed(1),
          offroad: e.kart.state.offroad,
          wrongWay: e.progress.wrongWayTime > 1.2,
          finished: e.progress.finished,
          score: e.progress.score,
        };
      }),
    };
  });

  const stuck = new Map(); // name -> consecutive slow samples
  const incidents = [];
  const offroadTime = new Map();
  let lastScores = new Map();
  const deadline = Date.now() + 360000;

  for (;;) {
    await page.waitForTimeout(500);
    const snap = await snapshot();
    if (snap.state !== 'racing' && snap.state !== 'postrace') continue;
    const ai = snap.racers.filter((r) => r.isAI && !r.finished);
    if (ai.length === 0) break;

    for (const r of ai) {
      // stuck: slow for > 3 s
      const s = (stuck.get(r.name) ?? 0) + (Math.abs(r.speed) < 3 ? 1 : -(stuck.get(r.name) ?? 0));
      stuck.set(r.name, Math.max(0, s));
      if (s === 4) {
        incidents.push(`t=${snap.time.toFixed(0)}s STUCK ${r.name} at (${r.x},${r.z}) lap${r.lap} cp${r.cp} lat=${r.lat}`);
      }
      if (r.wrongWay) {
        incidents.push(`t=${snap.time.toFixed(0)}s WRONG-WAY ${r.name} at (${r.x},${r.z}) lap${r.lap} cp${r.cp}`);
      }
      if (r.offroad) {
        offroadTime.set(r.name, (offroadTime.get(r.name) ?? 0) + 0.5);
        incidents.push(`t=${snap.time.toFixed(0)}s OFFROAD ${r.name} at (${r.x},${r.z}) lap${r.lap} cp${r.cp} lat=${r.lat} v=${Math.round(r.speed * 3.6)}km/h`);
      }
      // score regression = lost progress (respawn or driving backwards)
      const prev = lastScores.get(r.name);
      if (prev !== undefined && r.score < prev - 8000) {
        incidents.push(`t=${snap.time.toFixed(0)}s SCORE DROP ${r.name} at (${r.x},${r.z}) cp${r.cp} (${prev} -> ${r.score})`);
      }
      lastScores.set(r.name, r.score);
    }
    if (Date.now() > deadline) {
      incidents.push('TIMEOUT: race did not finish in 6 min');
      break;
    }
  }

  console.log('--- incidents ---');
  incidents.forEach((i) => console.log(i));
  console.log('--- offroad seconds per AI ---');
  for (const [name, t] of offroadTime) console.log(`${name}: ${t.toFixed(1)}s`);
  if (errors.length) console.log('PAGE ERRORS:', errors);
  console.log('done');
  await browser.close();
})().catch((err) => {
  console.error('PROBE FAILED:', err.message);
  process.exit(1);
});

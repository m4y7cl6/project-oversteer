/* Deep-dive one AI's steering state while it is offroad (wall-pinned bug).
 * Usage: TRACK=emerald AI_NAME=JOLT node scripts/ai-debug.cjs
 */
const { chromium } = require('playwright-core');

const URL = process.env.GAME_URL || 'http://localhost:5173';
const TRACK = process.env.TRACK || 'emerald';
const AI_NAME = process.env.AI_NAME || 'JOLT';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

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

  const probe = (name) => page.evaluate((aiName) => {
    const g = window.__NITRO_RUSH__;
    const e = g.raceManager.entries.find((x) => x.kart.spec.name === aiName);
    if (!e) return null;
    const kart = e.kart;
    const data = g.trackManager.data;
    const pos = kart.position;
    const fwd = kart.forward;
    const ai = e.ai;
    const hint = ai ? ai.sampleHint : -1;
    const trueIdx = data.closestSampleIndex(pos);
    const s = data.sample(hint);
    return {
      t: +g.raceManager.raceTime.toFixed(1),
      pos: [Math.round(pos.x), Math.round(pos.z)],
      offroad: kart.state.offroad,
      speed: +(kart.state.forwardSpeed * 3.6).toFixed(0),
      steer: +kart.input.steer.toFixed(2),
      throttle: kart.input.throttle,
      brake: kart.input.brake,
      fwd: [+fwd.x.toFixed(2), +fwd.z.toFixed(2)],
      tangent: [+s.tangent.x.toFixed(2), +s.tangent.z.toFixed(2)],
      hint,
      trueIdx,
      hintPos: [Math.round(s.pos.x), Math.round(s.pos.z)],
      lat: +data.lateralOffset(pos, hint).toFixed(1),
      reverseTime: ai ? +ai.reverseTime.toFixed(2) : 0,
      stuckTime: ai ? +ai.stuckTime.toFixed(2) : 0,
      y: +kart.body.translation().y.toFixed(2),
      linvel: (() => { const v = kart.body.linvel(); return [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)]; })(),
      angvelY: +kart.body.angvel().y.toFixed(2),
      latSpeed: +kart.state.lateralSpeed.toFixed(1),
      nearest: (() => {
        let best = 1e9; let who = '';
        for (const o of g.raceManager.entries) {
          if (o.kart === kart) continue;
          const d = o.kart.position.distanceTo(pos);
          if (d < best) { best = d; who = o.kart.spec.name; }
        }
        return `${who}@${best.toFixed(1)}`;
      })(),
    };
  }, name);

  const deadline = Date.now() + 200000;
  let offroadSamples = 0;
  while (Date.now() < deadline && offroadSamples < 30) {
    await page.waitForTimeout(300);
    const s = await probe(AI_NAME);
    if (!s) continue;
    if (s.offroad) {
      offroadSamples++;
      console.log(JSON.stringify(s));
    }
  }
  console.log('done');
  await browser.close();
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});

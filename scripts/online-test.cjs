/* Online E2E: room server + two browser pages in one room. The host starts
 * the race; both must enter countdown, and the guest must see the host's
 * kart move via network state (the host drives by autopilot).
 * Prereqs: dev server on :5173 and room server on :8787.
 * Usage: node scripts/online-test.cjs
 */
const { chromium } = require('playwright-core');

const URL = process.env.GAME_URL || 'http://localhost:5173';
const ROOM = `T${Date.now() % 100000}`;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const host = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const guest = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  host.on('pageerror', (e) => errors.push(`host: ${e.message}`));
  guest.on('pageerror', (e) => errors.push(`guest: ${e.message}`));

  await host.goto(`${URL}/?room=${ROOM}&name=HOSTY`, { waitUntil: 'load' });
  await host.waitForSelector('#splash-start:not([disabled])', { timeout: 30000 });
  await host.click('#splash-start');
  await host.click('#menu-race');
  await guest.goto(`${URL}/?room=${ROOM}&name=GUESTY`, { waitUntil: 'load' });
  await guest.waitForFunction(
    () => window.__NITRO_RUSH__ && window.__NITRO_RUSH__.net &&
      window.__NITRO_RUSH__.net.connected,
    null, { timeout: 15000 },
  );

  // lobby: both see 2 players; guest start button disabled
  await host.waitForFunction(
    () => window.__NITRO_RUSH__.net.members.length === 2, null, { timeout: 10000 },
  );
  const lobby = {
    hostIsHost: await host.evaluate(() => window.__NITRO_RUSH__.net.isHost),
    guestIsHost: await guest.evaluate(() => window.__NITRO_RUSH__.net.isHost),
    guestStartDisabled: await guest.evaluate(
      () => document.getElementById('start-button').disabled,
    ),
  };
  console.log('lobby:', JSON.stringify(lobby));
  if (!lobby.hostIsHost || lobby.guestIsHost) throw new Error('host flags wrong');
  if (!lobby.guestStartDisabled) throw new Error('guest start button should be disabled');

  // host autopilot, then start a 1-lap race for the room
  await host.evaluate(() => {
    const g = window.__NITRO_RUSH__;
    const AICtor = g.entries[1].ai.constructor;
    const auto = new AICtor(g.playerKart, g.trackManager.data, () => []);
    g.playerController.fixedUpdate = (enabled) => auto.fixedUpdate(1 / 60, enabled);
  });
  await host.click('.lap-btn[data-laps="1"]');
  await host.click('#start-button');

  // both clients must enter the same race
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    await page.waitForFunction(
      () => ['countdown', 'racing'].includes(window.__NITRO_RUSH__.raceManager.state),
      null, { timeout: 10000 },
    );
    console.log(`${label}: race started`);
  }

  // let the host drive a while; guest's remote kart must track it
  await guest.waitForTimeout(9000);
  const seen = await guest.evaluate(() => {
    const g = window.__NITRO_RUSH__;
    const r = [...g.remotes.values()][0];
    return {
      remotes: g.remotes.size,
      samples: r ? r.samples.length : 0,
      visible: r ? r.kart.visual.visible : false,
      pos: r ? [Math.round(r.kart.visual.position.x), Math.round(r.kart.visual.position.z)] : null,
      lastScore: r && r.last ? r.last.score : -1,
    };
  });
  console.log('guest sees host kart:', JSON.stringify(seen));
  if (seen.remotes !== 1) throw new Error('guest has no remote kart');
  if (seen.samples < 10) throw new Error('no state samples received');
  if (!seen.visible) throw new Error('remote kart not visible');
  if (!seen.pos || (Math.abs(seen.pos[0]) > 300 || Math.abs(seen.pos[1]) > 300)) {
    throw new Error('remote kart not on track (still parked?)');
  }
  if (seen.lastScore <= 0) throw new Error('remote score not progressing');

  // host should outrank the idle guest
  const guestRank = await guest.evaluate(() => {
    const g = window.__NITRO_RUSH__;
    return g.onlineRank();
  });
  console.log('guest rank (should be 2):', guestRank);
  if (guestRank !== 2) throw new Error(`guest rank expected 2, got ${guestRank}`);

  if (errors.length) {
    console.log('PAGE ERRORS:', errors);
    throw new Error('page errors');
  }
  console.log('ONLINE TEST PASSED');
  await browser.close();
})().catch((err) => {
  console.error('ONLINE TEST FAILED:', err.message);
  process.exit(1);
});

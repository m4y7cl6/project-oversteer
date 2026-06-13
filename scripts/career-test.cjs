/* Career E2E: full Phase-2 loop — splash → menu → race (autopilot, 1 lap)
 * → coin rewards on results → profile persisted → garage stats → settings.
 * Usage: node scripts/career-test.cjs
 */
const { chromium } = require('playwright-core');

const URL = process.env.GAME_URL || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#splash-start:not([disabled])', { timeout: 30000 });
  await page.click('#splash-start');

  // main menu: fresh profile shows 0 coins
  const coins0 = await page.textContent('#profile-coins');
  console.log('fresh profile coins:', coins0);
  if (coins0 !== '0') throw new Error('fresh profile should start with 0 coins');

  // garage: 5 vehicles, starter selected, locked ones show prices
  await page.click('#menu-garage');
  const garage = await page.evaluate(() => ({
    cards: document.querySelectorAll('.vehicle-card').length,
    selected: document.querySelector('.vehicle-card.selected .vehicle-name')?.textContent,
    locked: document.querySelectorAll('.vehicle-card.locked').length,
    upgradeRows: document.querySelectorAll('.upgrade-row').length,
  }));
  console.log('garage:', JSON.stringify(garage));
  if (garage.cards !== 5) throw new Error('expected 5 vehicle cards');
  if (garage.selected !== 'VOLT GT') throw new Error('starter vehicle not selected');
  if (garage.upgradeRows !== 4) throw new Error('expected 4 upgrade rows');

  // buying an unaffordable vehicle must not change ownership
  await page.click('.vehicle-card.locked');
  const stillLocked = await page.evaluate(
    () => document.querySelectorAll('.vehicle-card.locked').length,
  );
  if (stillLocked !== garage.locked) throw new Error('locked vehicle bought with 0 coins');
  await page.click('#garage-back');

  // race 1 lap with autopilot
  await page.click('#menu-race');
  await page.click('.lap-btn[data-laps="1"]');
  await page.click('#start-button');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const g = window.__NITRO_RUSH__;
    const AICtor = g.entries[1].ai.constructor;
    const auto = new AICtor(
      g.playerKart, g.trackManager.data, () => g.entries.map((e) => e.kart),
    );
    g.playerController.fixedUpdate = (enabled) => auto.fixedUpdate(1 / 60, enabled);
  });
  await page.waitForFunction(
    () => window.__NITRO_RUSH__.raceManager.player.progress.finished,
    null, { timeout: 150000, polling: 1000 },
  );
  await page.waitForTimeout(500);

  const results = await page.evaluate(() => ({
    rewardsVisible: !document.getElementById('results-rewards').classList.contains('hidden'),
    rewardsText: document.getElementById('results-rewards').textContent,
    raceCoins: window.__NITRO_RUSH__.raceCoins,
    profileCoins: window.__NITRO_RUSH__.profile.coins,
    stored: JSON.parse(localStorage.getItem('nitro-rush:profile') || 'null'),
  }));
  console.log('rewards:', results.rewardsText.trim().replace(/\s+/g, ' '));
  console.log('picked up during race:', results.raceCoins, '| balance:', results.profileCoins);
  if (!results.rewardsVisible) throw new Error('rewards not shown on results');
  if (results.profileCoins <= 0) throw new Error('no coins earned from race');
  if (!results.stored || results.stored.data.coins !== results.profileCoins) {
    throw new Error('profile not persisted to localStorage');
  }
  if (results.stored.data.totalRaces !== 1) throw new Error('totalRaces not recorded');

  // back to menu: profile bar reflects earnings; records line in setup
  await page.click('#results-menu');
  const coinsAfter = await page.textContent('#profile-coins');
  console.log('menu coins after race:', coinsAfter);
  if (parseInt(coinsAfter, 10) !== results.profileCoins) {
    throw new Error('profile bar not updated');
  }
  await page.click('#menu-race');
  const recordLine = await page.textContent('#track-record');
  console.log('track record line:', recordLine);
  if (!recordLine.includes('BEST LAP')) throw new Error('best lap record not shown');
  await page.click('#setup-back');

  // settings: change BGM volume, must persist
  await page.click('#menu-settings');
  await page.evaluate(() => {
    const el = document.getElementById('bgm-volume');
    el.value = '20';
    el.dispatchEvent(new Event('input'));
  });
  const savedVol = await page.evaluate(
    () => JSON.parse(localStorage.getItem('nitro-rush:profile')).data.settings.bgmVolume,
  );
  console.log('saved bgm volume:', savedVol);
  if (Math.abs(savedVol - 0.2) > 0.001) throw new Error('settings not persisted');

  if (errors.length) {
    console.log('PAGE ERRORS:', errors);
    throw new Error('page errors');
  }
  console.log('CAREER TEST PASSED');
  await browser.close();
})().catch((err) => {
  console.error('CAREER TEST FAILED:', err.message);
  process.exit(1);
});

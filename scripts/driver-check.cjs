const { chromium } = require('playwright-core');
const path = require('path');
const URL = process.env.GAME_URL || 'http://localhost:5173';
const SHOT_DIR = path.resolve(__dirname, '..', '.smoke');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#splash-start:not([disabled])', { timeout: 30000 });
  await page.click('#splash-start');
  await page.click('#menu-race');
  await page.click('#start-button');
  await page.waitForSelector('#countdown:not(.hidden)', { timeout: 5000 });
  // let countdown finish so chase cam is running
  await page.waitForFunction(
    () => document.getElementById('countdown').classList.contains('hidden'),
    { timeout: 8000 },
  );
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.keyboard.up('w');
  await page.waitForTimeout(300);

  // Test each race car model on the player kart
  const models = [
    { name: 'race',         color: 0x00e676, accent: 0x00592e },  // BLITZ
    { name: 'race-future',  color: 0x2979ff, accent: 0x0d2c66 },  // COMET/AERO ONE
    { name: 'raceCarWhite', color: 0xffffff, accent: 0x555555 },  // DRIFTA SE
  ];

  for (const m of models) {
    await page.evaluate(({ model, color, accent }) => {
      const g = window.__NITRO_RUSH__;
      const tmpl = g.models.get(model);
      g.playerKart.applyVehicle(color, accent, tmpl);
    }, m);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, `driver-${m.name}.png`) });
    console.log(`Shot: player with ${m.name} model`);
  }

  await browser.close();
})().catch(err => { console.error(err.message); process.exit(1); });

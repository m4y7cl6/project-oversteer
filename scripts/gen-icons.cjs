/* Renders the app icon in headless Chromium and saves the PNG sizes needed
 * for the PWA manifest + iOS home screen.
 * Usage: node scripts/gen-icons.cjs
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', 'public', 'icons');

const HTML = `<!DOCTYPE html><html><head><style>
  body { margin: 0; }
  #icon {
    width: 512px; height: 512px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: radial-gradient(circle at 35% 30%, #16324f 0%, #05070d 75%);
    font-family: Arial, sans-serif;
  }
  #emoji { font-size: 230px; line-height: 1; }
  #label {
    margin-top: 18px;
    font-size: 72px; font-weight: 900; letter-spacing: 4px;
    color: #00e5ff;
  }
  #label span { color: #ff9100; }
</style></head><body>
  <div id="icon"><div id="emoji">🏎️</div><div id="label">NITRO<span>RUSH</span></div></div>
</body></html>`;

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.setContent(HTML);
  const el = page.locator('#icon');
  for (const size of [512, 192, 180]) {
    const buf = await el.screenshot();
    if (size === 512) {
      fs.writeFileSync(path.join(OUT_DIR, 'icon-512.png'), buf);
    } else {
      // re-render at target size for crisp downscale
      await page.setViewportSize({ width: size, height: size });
      await page.evaluate((s) => {
        const icon = document.getElementById('icon');
        icon.style.transform = `scale(${s / 512})`;
        icon.style.transformOrigin = 'top left';
      }, size);
      const clipped = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } });
      const name = size === 192 ? 'icon-192.png' : 'apple-touch-icon.png';
      fs.writeFileSync(path.join(OUT_DIR, name), clipped);
    }
  }
  console.log('icons written to public/icons/');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });

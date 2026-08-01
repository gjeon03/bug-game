// Dev-time visual capture. Drives the real game in Chromium and writes PNGs for inspection.
//   node scripts/shot.mjs [url] [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:5273/';
const outDir = process.argv[3] ?? 'artifacts/evidence/shots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__roach?.ready === true, null, { timeout: 15000 });
await page.evaluate(() => window.__roach.newRun(20260801));
await page.waitForTimeout(700);

const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });

await shot('01-boot');

// Walk right out of the crack.
await page.evaluate(() => window.__roach.input.press('right'));
await page.waitForTimeout(1400);
await shot('02-move');

// Lay a trail toward the dishwasher crumbs.
await page.evaluate(() => {
  window.__roach.input.press('lay');
  window.__roach.input.press('down');
});
await page.waitForTimeout(1600);
await page.evaluate(() => window.__roach.input.release('down'));
await page.waitForTimeout(2600);
await page.evaluate(() => window.__roach.input.releaseAll());
await shot('03-trail');

await page.waitForTimeout(9000);
await shot('04-workers');

const state = await page.evaluate(() => window.__roach.state());
console.log(
  JSON.stringify(
    {
      time: state.time.toFixed(1),
      routes: state.routes,
      deliveries: state.stats.deliveries,
      food: state.colony.food.toFixed(1),
      pop: state.colony.population,
      counts: state.counts,
    },
    null,
    2,
  ),
);
console.log('errors:', errors);

await browser.close();

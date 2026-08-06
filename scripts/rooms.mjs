/**
 * Label-free room portraits.
 *
 * The HUD is hidden before every shot. A room has to be identifiable from architecture, landmark
 * props, materials, lighting, scale and clutter — never from a panel that names it. An independent
 * critic could not name the kitchen from the previous build's evidence, and every one of those
 * frames had `주방` printed in the corner.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4273/';
const OUT = resolve('artifacts/evidence/completion/rooms');
mkdirSync(OUT, { recursive: true });

const ROOMS = [
  { id: 'kitchen', near: 1500, wide: 4200 },
  { id: 'hallway', near: 1500, wide: 5200 },
  { id: 'living', near: 1600, wide: 5000 },
  { id: 'bedroom', near: 1600, wide: 4600 },
  { id: 'bathroom', near: 1400, wide: 3200 },
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.keyboard.press('Space');
await page.waitForTimeout(600);

// Hide every scrap of UI. Nothing that names a room may be in shot.
await page.addStyleTag({ content: '#hud,#choice,#curtain{display:none !important}' });
await page.waitForTimeout(300);

const MM = 35 / 26;
for (const room of ROOMS) {
  for (const [tag, mmDist] of [['near', room.near], ['wide', room.wide]]) {
    await page.evaluate(
      ([id, d]) => window.__game.viewRegion(id, d),
      [room.id, mmDist / MM],
    );
    // Long enough for several animation frames, so the lock is proven to hold rather than assumed.
    await page.waitForTimeout(900);
    const name = `${room.id}-${tag}.png`;
    await page.screenshot({ path: resolve(OUT, name) });
    console.log(`  ${name}`);
  }
}

await page.evaluate(() => window.__game.releaseView());
console.log('console errors:', errors.length, errors.slice(0, 4));
await browser.close();

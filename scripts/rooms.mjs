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

/**
 * Both distances must lie inside the camera's own zoom range, `CAM_NEAR_MM` 900 .. `CAM_FAR_MM`
 * 3200 (default 1900).
 *
 * The first version of this file shot "wide" at 4200–5200 mm. Those frames put the camera outside
 * the room's walls, so a quarter to a half of every one of them was the unlit exterior of a wall
 * against the void — `bedroom-wide.png` measured 28.0 % pure `srgb(0,0,0)` and `bathroom-wide.png`
 * 47.7 %. I spent a while treating that black wedge as a lighting defect before checking the number
 * against `camera.ts`; it is not a defect, it is a camera position no player can reach.
 *
 * Evidence has to be shot through the lens the game actually uses, or it proves nothing about the
 * game. Anything outside this range is a picture of a different product.
 *
 * The two values are therefore not artistic choices: `near` is `CAM_DEFAULT_MM`, the framing a
 * player spends the whole run in, and `wide` is `CAM_FAR_MM`, the most room they can ever buy
 * themselves. Correcting the first overshoot downward to 1200-1300 mm was just as useless in the
 * other direction — `bedroom-near.png` at 1300 mm was an unbroken mattress edge across the frame.
 *
 * Worth stating plainly, because it constrains the "identify each room without HUD labels" gate: at
 * 35 mm creature scale inside a 3.2 m ceiling, NO legal camera position sees a whole room. A player
 * never gets an establishing shot. Room identity has to survive being read from characteristic
 * detail at floor level — worn toe-kick and tile grout, or skirting and parquet — and judging it
 * from an impossible vantage point would certify something the game cannot deliver.
 */
const ROOMS = [
  { id: 'kitchen', near: 1900, wide: 3200 },
  { id: 'hallway', near: 1900, wide: 3200 },
  { id: 'living', near: 1900, wide: 3200 },
  { id: 'bedroom', near: 1900, wide: 3200 },
  { id: 'bathroom', near: 1900, wide: 3200 },
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

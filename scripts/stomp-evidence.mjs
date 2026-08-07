/**
 * Evidence that being seen has a consequence, captured from the shipped build.
 *
 * Deliberately NOT a unit test in a browser costume. The unit suite already proves the mechanism
 * against the simulation; what it cannot prove is that a player sees any of it — that the hand is
 * drawn, that the meter appears, that the log says so in Korean, and that control comes back. Those
 * are the parts that were missing last time, and the parts a passing test suite certified anyway.
 *
 * Everything here is driven through the keyboard, because that is the only input the game has.
 *
 *   node scripts/stomp-evidence.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4278/bug-game/';
const OUT = resolve('artifacts/evidence/completion/stomp');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.keyboard.press('Space');
await page.waitForTimeout(500);

/** The simulation facts a screenshot cannot carry. */
const probe = () =>
  page.evaluate(() => {
    const run = window.__game.run;
    return {
      time: +run.time.toFixed(1),
      state: run.scout.state,
      seen: +run.scout.seen.toFixed(3),
      caught: +run.scout.caught.toFixed(3),
      downFor: +run.scout.downFor.toFixed(2),
      scoutsLost: run.stats.scoutsLost,
      sightings: run.stats.sightings,
      population: run.colony.population,
      threats: run.threats.map((t) => ({ kind: t.kind, phase: t.phase })),
      status: run.status,
    };
  });

/**
 * Walk into the light until the household notices.
 *
 * The exposed ground is the open floor away from the cabinets, so the scout is driven out of the
 * toe-kick and held there. `sprint` is on because sprinting is loud — it raises the rate at which
 * `seen` fills, which is the game's own stated way to be noticed faster, not a cheat.
 */
async function walkUntilSeen(limitMs = 90_000) {
  const started = Date.now();
  await page.keyboard.down('Shift');
  let held = 'KeyS';
  await page.keyboard.down(held);

  while (Date.now() - started < limitMs) {
    const state = await probe();
    if (state.sightings > 0) {
      await page.keyboard.up(held);
      await page.keyboard.up('Shift');
      return state;
    }
    // Sweep the open floor rather than pinning into a corner, where exposure is lowest.
    const next = ['KeyS', 'KeyD', 'KeyW', 'KeyA'][Math.floor((Date.now() - started) / 2500) % 4];
    if (next !== held) {
      await page.keyboard.up(held);
      held = next;
      await page.keyboard.down(held);
    }
    await page.waitForTimeout(250);
  }
  await page.keyboard.up(held);
  await page.keyboard.up('Shift');
  return null;
}

const log = [];
const record = (label, data) => {
  log.push({ label, ...data });
  console.log(label, JSON.stringify(data));
};

record('boot', await probe());

const seen = await walkUntilSeen();
if (!seen) {
  console.error('FAILED: the scout was never noticed inside the time limit.');
  await page.screenshot({ path: resolve(OUT, 'never-seen.png') });
  await browser.close();
  process.exit(1);
}
record('sighting', seen);
await page.screenshot({ path: resolve(OUT, '1-sighting.png') });

/*
 * Stand still. This is the whole point of the mechanic: the swat is aimed where the sighting
 * happened, so the player who does nothing is the player who gets hit.
 */
let landed = null;
for (let i = 0; i < 40; i++) {
  const state = await probe();
  if (state.threats.some((t) => t.kind === 'swat' && t.phase === 'active') && !landed) {
    landed = state;
    await page.screenshot({ path: resolve(OUT, '2-hand-down.png') });
  }
  if (state.scoutsLost > 0) {
    record('stomped', state);
    await page.screenshot({ path: resolve(OUT, '3-stomped.png') });
    break;
  }
  await page.waitForTimeout(100);
}
if (landed) record('hand-down', landed);

const after = await probe();
record('after', after);

// Control has to come back, and the run has to still be a run.
await page.waitForTimeout(4500);
const revived = await probe();
record('revived', revived);
await page.screenshot({ path: resolve(OUT, '4-revived.png') });

// Prove the replacement is actually drivable, not just alive in a struct.
const before = await page.evaluate(() => ({
  x: window.__game.run.scout.x,
  z: window.__game.run.scout.z,
}));
await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyW');
const moved = await page.evaluate(
  ([b]) => {
    const s = window.__game.run.scout;
    return +Math.hypot(s.x - b.x, s.z - b.z).toFixed(1);
  },
  [before],
);
record('replacement-walks', { moved });

/** Korean-only check on everything the player can currently read. */
const visibleText = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#hud, #hud *, #curtain, #curtain *'))
    .filter((n) => n.offsetParent !== null)
    .map((n) => n.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' '),
);
const latin = visibleText.match(/[A-Za-z]{3,}/g) ?? [];
record('korean', { latinWords: [...new Set(latin)].slice(0, 12), consoleErrors: errors.length });

writeFileSync(resolve(OUT, 'stomp.json'), JSON.stringify({ log, errors }, null, 2));
console.log('console errors:', errors.length, errors.slice(0, 4));
await browser.close();

const ok =
  revived.scoutsLost > 0 && revived.downFor === 0 && revived.status === 'playing' && moved > 1;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);

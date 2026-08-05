/**
 * Real-runtime evidence capture.
 *
 * Drives the built game in a real browser engine and records what it actually shows. Headless
 * Chromium renders WebGL2 through ANGLE/SwiftShader, which is software rasterisation — that makes
 * it DETERMINISTIC, which is exactly what makes screenshot comparison meaningful, and it makes it
 * USELESS for frame timing. Nothing in this script reports a frame-time verdict.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4273/';
const OUT = resolve(process.argv[2] ?? 'artifacts/evidence/whole-home-reboot-final');
mkdirSync(OUT, { recursive: true });

const errors = [];
const missingRequests = [];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) missingRequests.push(`${r.status()} ${r.url()}`);
});

const externalRequests = [];
page.on('request', (r) => {
  const url = r.url();
  if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) {
    externalRequests.push(url);
  }
});

const shot = async (name) => {
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  console.log(`  captured ${name}.png`);
};

const state = () =>
  page.evaluate(() => {
    const g = window.__game;
    if (!g) return null;
    const r = g.run;
    return {
      status: r.status,
      time: Math.round(r.time),
      chapter: r.chapter,
      population: r.colony.population,
      capacity: r.colony.capacity,
      food: Math.round(r.colony.food),
      moisture: Math.round(r.colony.moisture),
      routes: r.routes.length,
      deliveries: r.stats.deliveries,
      openGates: [...r.openGates],
      claimed: [...r.footholds.values()].filter((f) => f.claimed).length,
      objectiveTitle: r.objective.titleKey,
      blocker: r.objective.blockerKey,
      scout: { surface: r.scout.surface, x: Math.round(r.scout.x), z: Math.round(r.scout.z) },
      stats: g.stats,
      frame: g.frame,
    };
  });

console.log(`booting ${BASE}`);
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, { timeout: 30000 });
// Let a few frames land so the first screenshot is a real frame, not a clear.
await page.waitForTimeout(2500);

console.log('01 cold launch (help card, Korean)');
await shot('01-cold-launch-help-ko');

const boot = await state();
console.log('  boot state:', JSON.stringify(boot, null, 0).slice(0, 400));

// Dismiss the help card the way a player does.
await page.keyboard.press('Space');
await page.waitForTimeout(1200);
console.log('02 kitchen, first view');
await shot('02-kitchen-start');

/*
 * Draw a route between two things that actually exist: the home nest and the nearest discovered
 * source on the same surface.
 *
 * Done BEFORE walking anywhere, and that ordering is load-bearing. The camera follows the scout, so
 * a world point projected after the scout has crossed the room lands outside the viewport and the
 * pointer events go nowhere — which is exactly how an earlier version of this script reported
 * "routes: 0" for a mechanic that was working perfectly.
 */
const drag = await page.evaluate(() => {
  const g = window.__game;
  const run = g.run;
  const nest = run.house.footholds.get('kitchen.undersink');
  let best = null;
  let bestD = Infinity;
  for (const [id, st] of run.resources) {
    if (!st.found || st.remaining <= 0) continue;
    const site = run.house.resources.get(id);
    if (!site || site.surface !== nest.surface) continue;
    const d = Math.hypot(site.at.x - nest.at.x, site.at.z - nest.at.z);
    if (d < bestD) {
      bestD = d;
      best = site;
    }
  }
  if (!best) return null;
  const y = run.house.surfaces.get(nest.surface)?.y ?? 0;
  const steps = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    steps.push(
      g.project(
        nest.at.x + (best.at.x - nest.at.x) * t,
        y,
        nest.at.z + (best.at.z - nest.at.z) * t,
      ),
    );
  }
  return { target: best.id, steps };
});

if (drag) {
  console.log(`  drawing route to ${drag.target}`);
  await page.mouse.move(drag.steps[0].x, drag.steps[0].y);
  await page.mouse.down();
  for (const p of drag.steps.slice(1)) {
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
} else {
  console.log('  no reachable source found to draw to');
}
await page.waitForTimeout(2000);
console.log('04 first route');
await shot('04-route-drawn');
const afterRoute = await state();
console.log('  after route:', JSON.stringify(afterRoute).slice(0, 320));

// A second, longer route to the food waste bin — the richest and loudest source in chapter 1.
const long = await page.evaluate(() => {
  const g = window.__game;
  const run = g.run;
  const nest = run.house.footholds.get('kitchen.undersink');
  const bin = run.house.resources.get('kitchen.bin');
  if (!run.resources.get('kitchen.bin')?.found) return null;
  const y = run.house.surfaces.get(nest.surface)?.y ?? 0;
  const steps = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    steps.push(
      g.project(nest.at.x + (bin.at.x - nest.at.x) * t, y, nest.at.z + (bin.at.z - nest.at.z) * t),
    );
  }
  return { steps };
});
if (long) {
  await page.mouse.move(long.steps[0].x, long.steps[0].y);
  await page.mouse.down();
  for (const p of long.steps.slice(1)) {
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(28);
  }
  await page.mouse.up();
  await page.waitForTimeout(1500);
}

// Walk, so the camera, gait and occlusion all have something to do.
for (const [key, ms] of [
  ['KeyW', 800],
  ['KeyD', 650],
  ['KeyW', 550],
]) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
await page.waitForTimeout(600);
console.log('03 after moving');
await shot('03-kitchen-moved');

// Let the colony work so deliveries, growth and household routines actually happen.
await page.waitForTimeout(30000);
console.log('05 colony working');
await shot('05-colony-working');
const working = await state();
console.log('  working:', JSON.stringify(working).slice(0, 320));

// Resolution sweep.
for (const [w, h, name] of [
  [1280, 720, '06-1280x720'],
  [1440, 900, '07-1440x900'],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(1200);
  await shot(name);
}
await page.setViewportSize({ width: 1920, height: 1080 });

// DPR 2.
const dpr2 = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
});
const dprPage = await dpr2.newPage();
await dprPage.goto(BASE, { waitUntil: 'load' });
await dprPage.waitForFunction(() => window.__game !== undefined, { timeout: 30000 });
await dprPage.waitForTimeout(2500);
await dprPage.screenshot({ path: resolve(OUT, '08-dpr2-1280x720.png') });
console.log('  captured 08-dpr2-1280x720.png');
await dpr2.close();

// Restart five times and confirm the opening state is identical each time.
const restarts = [];
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.__game.restart());
  await page.waitForTimeout(1400);
  const s = await state();
  restarts.push({
    population: s.population,
    capacity: s.capacity,
    routes: s.routes,
    gates: s.openGates.length,
    claimed: s.claimed,
    scout: s.scout,
    status: s.status,
  });
}
await shot('09-after-five-restarts');
const identical = restarts.every((r) => JSON.stringify(r) === JSON.stringify(restarts[0]));
console.log(`  five restarts identical: ${identical}`);

const final = await state();
const report = {
  base: BASE,
  bootState: boot,
  afterRoute,
  working,
  restarts,
  restartsIdentical: identical,
  finalStats: final.stats,
  consoleErrors: errors,
  failedRequests: missingRequests,
  externalRequests,
  note: 'Headless SwiftShader. Screenshot and logic evidence only — NOT frame-time evidence.',
};
writeFileSync(resolve(OUT, 'runtime-report.json'), JSON.stringify(report, null, 2));

console.log('\n=== SUMMARY ===');
console.log('console errors :', errors.length, errors.slice(0, 5));
console.log('failed requests:', missingRequests.length, missingRequests.slice(0, 5));
console.log('external reqs  :', externalRequests.length, externalRequests.slice(0, 5));
console.log(
  'missing props  :',
  final.stats?.missingProps?.length ?? '?',
  (final.stats?.missingProps ?? []).slice(0, 10),
);
console.log('draw calls     :', final.stats?.drawCalls, 'triangles:', final.stats?.triangles);
console.log('restarts equal :', identical);

await browser.close();
process.exit(errors.length === 0 && missingRequests.length === 0 ? 0 : 1);

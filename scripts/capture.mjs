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
import { layRoute, nearestSupplyPair } from './lib/walk.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4273/';
/*
 * The default output is a scratch directory, NOT the phase evidence set.
 *
 * It used to default straight to `whole-home-reboot-final/`, and a bare `node scripts/capture.mjs`
 * run during the completion pass silently overwrote ten committed baseline images — the exact thing
 * the evidence contract forbids, because a baseline you can overwrite is not a comparison basis.
 * Writing a phase set is now something you have to ask for by name.
 */
const OUT = resolve(process.argv[2] ?? 'artifacts/evidence/completion/runtime');
mkdirSync(OUT, { recursive: true });

const errors = [];
const missingRequests = [];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

/*
 * Warnings are collected too, and they were not.
 *
 * This listener counted `error` only, so `configureRenderer` naming a constant three.js deprecated
 * in the pinned r185 produced `WebGLShadowMap: PCFSoftShadowMap has been deprecated` on every boot
 * and this gate reported "console errors: 0" underneath it. A library telling us we are holding it
 * wrong is exactly the class of message a capture gate exists to surface. Warnings do not fail the
 * run — they are printed, so they cannot be silently accumulated.
 */
const warnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  else if (m.type() === 'warning') warnings.push(m.text());
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
 * Lay a route by WALKING it, because that is the only way the shipped game lays one.
 *
 * This block used to be two `page.mouse.down/move/up` drags over projected world points. Pointer
 * route drawing was deleted from `src/game/input.ts` twenty-two commits earlier — the file states
 * outright that there is no pointer path — so both drags were mime, and the script said so in its
 * own output without anybody reading it: `afterRoute` recorded `routes: 0, deliveries: 0`, and the
 * t=40 "colony working" sample recorded `routes: 0, deliveries: 0, population 2`. The two frames
 * named `02-kitchen-start` and `05-colony-working` had identical HUDs, because in forty seconds of
 * capture the colony had done nothing at all.
 *
 * Everything below presses keys. If the route does not appear, the script fails loudly rather than
 * photographing an empty room and calling it evidence.
 */
const pair = await nearestSupplyPair(page);
if (!pair) throw new Error('no found source on the nest surface — nothing to route to');

console.log(`  walking a route to ${pair.source.id}`);
const laid = await layRoute(page, pair);
console.log(`  route: ${JSON.stringify(laid)}`);
if (!laid.ok) throw new Error(`route was never laid: ${laid.why}`);

await page.waitForTimeout(2000);
console.log('04 first route');
await shot('04-route-drawn');
const afterRoute = await state();
console.log('  after route:', JSON.stringify(afterRoute).slice(0, 320));
if (afterRoute.routes < 1) {
  throw new Error('the run reports no routes after one was laid — the capture proves nothing');
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

/*
 * Restart twenty times and confirm BOTH that the opening state repeats and that nothing accumulates.
 *
 * This loop used to run five times and compare a hand-picked subset of fields that deliberately
 * excluded `s.stats`. It therefore printed `five restarts identical: true` directly above a report
 * recording `textures 25` at boot and `textures 30` at the end — a gate whose name claimed restart
 * leakage and whose assertion could not see it. The renderer's own comment calls this "the
 * five-restart leak gate"; nothing in the repository was checking it.
 *
 * Twenty rather than five because a per-restart leak of one texture is arguable at five and
 * unmistakable at twenty.
 */
const RESTARTS = 20;
const restarts = [];
/*
 * The baseline is taken after the FIRST restart, not at boot.
 *
 * Pools allocate lazily: the route ribbon, the worker instances and the threat bodies each take
 * their geometry the first time they are used, so a boot-time snapshot has none of it and the
 * comparison charges warm-up as leakage. Measured: geometries 97 -> 100 across twenty restarts,
 * which is +3 total and plateaus, versus textures which were rising by exactly one every time.
 * Only the second kind is a leak, and only the second kind should fail this gate.
 */
let baseline = null;
for (let i = 0; i < RESTARTS; i++) {
  await page.evaluate(() => window.__game.restart());
  await page.waitForTimeout(700);
  const s = await state();
  if (i === 0) baseline = s.stats;
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
console.log(`  ${RESTARTS} restarts identical: ${identical}`);

const COUNTED = ['textures', 'geometries', 'materials', 'meshes'];
const afterRestarts = await state();
console.log(
  `  GPU objects boot ${COUNTED.map((k) => `${k} ${boot.stats[k]}`).join(' ')}`,
);
console.log(
  `  GPU objects restart 1 -> ${RESTARTS}: ` +
    COUNTED.map((k) => `${k} ${baseline[k]}->${afterRestarts.stats[k]}`).join(', '),
);
const grew = COUNTED.filter((key) => afterRestarts.stats[key] > baseline[key]);
if (grew.length > 0) {
  throw new Error(
    `restart leaks GPU objects over ${RESTARTS - 1} restarts: ${grew
      .map((k) => `${k} ${baseline[k]} -> ${afterRestarts.stats[k]}`)
      .join(', ')}`,
  );
}

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
console.log('console warns  :', warnings.length, warnings.slice(0, 5));
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

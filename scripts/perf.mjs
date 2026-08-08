/**
 * Performance capture on REAL hardware.
 *
 * Launches the installed Google Chrome (`channel: 'chrome'`), NOT the bundled Chromium, and NOT
 * headless. That distinction is the whole point: headless Chromium renders through ANGLE over
 * SwiftShader — software rasterisation — which is deterministic and completely useless for frame
 * time. Only real Chrome on this machine's GPU produces a number worth reporting.
 *
 * The script drives the game the way a player does (walk, draw routes, let the colony work) and
 * profiles ACTIVE PLAY, not an idle title screen.
 */
import { chromium } from '@playwright/test';
import { layRoute } from './lib/walk.mjs';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, loadavg } from 'node:os';

/*
 * Refuse to measure a busy machine, for the same reason the dirty-tree guard below refuses to stamp
 * a profile with a hash it does not describe.
 *
 * Measured: this profile reported p50 16.70 ms on an idle machine and **32.20 ms** on the same
 * commit while a nine-agent workflow was running, load average 4.25. The commit under test added
 * one boolean flag to one resource and had no path to frame cost at all. Without this guard that
 * number goes into `performance.json`, gets read back as a regression, and somebody spends a
 * session bisecting a load average.
 *
 * The line is a third of the cores. It is not a physical constant and it is deliberately
 * conservative: the bad reading happened at 4.25 on eight cores, and nobody has measured where
 * below that the timings go clean again. A refused measurement costs a wait; a believed one costs
 * a session — this repo has thirteen recorded instances of the second. `PERF_ALLOW_BUSY=1`
 * overrides it for anyone who knows what they are doing and says so out loud.
 */
const CORES = cpus().length;
const LOAD_LIMIT = CORES / 3;
const load1 = loadavg()[0];
if (load1 > LOAD_LIMIT && process.env.PERF_ALLOW_BUSY !== '1') {
  throw new Error(
    `machine is busy — load average ${load1.toFixed(2)} against a limit of ${LOAD_LIMIT.toFixed(1)} ` +
      `on ${CORES} cores. Frame timings measured under load describe the load, not the build. ` +
      `Wait, or set PERF_ALLOW_BUSY=1 to override.`,
  );
}

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4273/';
const OUT = resolve(process.argv[2] ?? 'artifacts/evidence/whole-home-reboot-final');
const SECONDS = Number(process.env.PERF_SECONDS ?? 45);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--window-size=1920,1080', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 });
await page.waitForTimeout(3000);

const renderer = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
    vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unknown',
    timerQuery: !!gl?.getExtension('EXT_disjoint_timer_query_webgl2'),
  };
});
console.log('GPU:', renderer.renderer);
console.log('timer query available:', renderer.timerQuery);

await page.keyboard.press('Space');
await page.waitForTimeout(800);

/*
 * Build up some actual load: routes walked with the keyboard, then a colony working them.
 *
 * This was three `page.mouse` drags at a mechanic deleted from the game twenty-two commits earlier,
 * so the profile it produced was of an empty room with two idle workers in it — the exact
 * "screensaver profile" the comment below warns against, written by somebody who had already
 * spotted the risk and then measured it anyway. Every frame-time number on this branch came from
 * that run.
 */
const nest = await page.evaluate(() => {
  const site = window.__game.run.house.footholds.get('kitchen.undersink');
  return site ? { x: site.at.x, z: site.at.z } : null;
});
if (!nest) throw new Error('no starting refuge — nothing to route from');

const wanted = ['kitchen.drip.trap', 'kitchen.crumbs.toekick', 'kitchen.bin'];
let laidCount = 0;
for (const id of wanted) {
  const source = await page.evaluate((resourceId) => {
    const run = window.__game.run;
    const site = run.house.resources.get(resourceId);
    if (!site || !run.resources.get(resourceId)?.found) return null;
    return { id: resourceId, x: site.at.x, z: site.at.z };
  }, id);
  if (!source) {
    console.log(`  ${id}: not discovered yet, skipped`);
    continue;
  }
  const result = await layRoute(page, { nest, source });
  console.log(`  ${id}: ${JSON.stringify(result)}`);
  if (result.ok) laidCount++;
  await page.waitForTimeout(400);
}
if (laidCount === 0) {
  throw new Error('no route was laid — this would profile an empty room, which proves nothing');
}

// Let the colony grow so the profile covers a POPULATED scene. A profile of an empty room is a
// profile of a screensaver — the contract asks for peak play.
await page.waitForTimeout(40000);
const before = await page.evaluate(() => ({
  pop: window.__game.run.colony.population,
  routes: window.__game.run.routes.length,
}));
console.log('before profiling:', JSON.stringify(before));

console.log(`profiling ${SECONDS}s of active play...`);
await page.evaluate(() => window.__game.beginProfile('active-play'));

// Keep the player moving for the whole window — an idle capture measures an idle game.
const until = Date.now() + SECONDS * 1000;
const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
let i = 0;
while (Date.now() < until) {
  const k = keys[i++ % keys.length];
  await page.keyboard.down(k);
  await page.waitForTimeout(700);
  await page.keyboard.up(k);
  await page.waitForTimeout(120);
}

const result = await page.evaluate(() => ({
  profile: window.__game.profile(),
  stats: window.__game.stats,
  run: {
    time: Math.round(window.__game.run.time),
    population: window.__game.run.colony.population,
    workers: window.__game.run.workers.filter((w) => w.alive).length,
    routes: window.__game.run.routes.length,
    threats: window.__game.run.threats.length,
    deliveries: window.__game.run.stats.deliveries,
  },
  audio: window.__game.audio,
}));

await page.screenshot({ path: resolve(OUT, '10-perf-active-play.png') });

/*
 * Stamp the commit the numbers describe, and refuse to stamp a dirty tree.
 *
 * The committed `performance.json` was three commits and one light behind HEAD, and nothing said
 * so — a reviewer had to notice that its `lights: 2` disagreed with a runtime report's `lights: 3`
 * to work out that the frame times described a build that no longer existed. Comparing incidental
 * scene counts is a fragile way to detect that; the commit hash is not.
 *
 * A dirty tree is refused outright rather than recorded, because "that sha plus some edits" is not
 * a state anybody can return to, and §11 asks for evidence tied to a specific claim.
 */
const headSha = execSync('git rev-parse HEAD').toString().trim();
const dirty = execSync('git status --porcelain -- src scripts index.html').toString().trim();
if (dirty) {
  throw new Error(
    `working tree is dirty — a profile stamped ${headSha.slice(0, 7)} would not describe it:\n${dirty}`,
  );
}

const p = result.profile;
const report = {
  headSha,
  hardware: renderer,
  window: { seconds: SECONDS, frames: p?.frames, measuredSeconds: p?.seconds },
  duringCapture: result.run,
  audio: result.audio,
  presented: { p50: p?.p50, p95: p?.p95, p99: p?.p99, worst: p?.worst },
  cpu: { p50: p?.cpuP50, p99: p?.cpuP99 },
  gpu: { p50: p?.gpuP50, p99: p?.gpuP99, samples: p?.gpuSamples },
  frameTails: {
    over16: p?.over16,
    over33: p?.over33,
    over50: p?.over50,
    over100: p?.over100,
    over50Pct: p?.over50Pct,
  },
  scene: result.stats,
  consoleErrors: errors,
};
writeFileSync(resolve(OUT, 'performance.json'), JSON.stringify(report, null, 2));

console.log('\n=== ACTIVE PLAY, REAL CHROME ===');
console.log('GPU            ', renderer.renderer);
console.log('frames         ', p?.frames, 'over', p?.seconds?.toFixed(1), 's');
console.log(
  'scene          ',
  `pop ${result.run.population} workers ${result.run.workers} routes ${result.run.routes} threats ${result.run.threats}`,
);
console.log(
  'presented ms   ',
  `p50 ${p?.p50?.toFixed(2)}  p95 ${p?.p95?.toFixed(2)}  p99 ${p?.p99?.toFixed(2)}  worst ${p?.worst?.toFixed(2)}`,
);
console.log('CPU ms         ', `p50 ${p?.cpuP50?.toFixed(2)}  p99 ${p?.cpuP99?.toFixed(2)}`);
console.log(
  'GPU ms         ',
  p?.gpuP50 === null
    ? 'UNMEASURED (no timer query)'
    : `p50 ${p?.gpuP50?.toFixed(2)}  p99 ${p?.gpuP99?.toFixed(2)}  (${p?.gpuSamples} samples)`,
);
console.log(
  'tails          ',
  `>16ms ${p?.over16}  >33ms ${p?.over33}  >50ms ${p?.over50}  >100ms ${p?.over100}`,
);
console.log('draw calls     ', result.stats.drawCalls, 'triangles', result.stats.triangles);
console.log('audio          ', JSON.stringify(result.audio));
console.log('console errors ', errors.length);

/*
 * The verdict, and a non-zero exit when it fails.
 *
 * `judge()` existed, was tested, and was called by nothing outside its own test — so this script
 * printed a table and exited 0 no matter what the numbers said, and `pnpm review` did not run it at
 * all. §10's performance section was, in practice, unenforced. Everything below is the enforcement.
 */
const verdict = await page.evaluate(
  ([profile, stats]) =>
    window.__game.judge({
      label: 'active play',
      frames: profile?.frames ?? 0,
      seconds: profile?.seconds ?? 0,
      p50: profile?.p50 ?? Infinity,
      p95: profile?.p95 ?? Infinity,
      p99: profile?.p99 ?? Infinity,
      worst: profile?.worst ?? Infinity,
      cpuP50: profile?.cpuP50 ?? null,
      cpuP99: profile?.cpuP99 ?? null,
      gpuP50: profile?.gpuP50 ?? null,
      gpuP99: profile?.gpuP99 ?? null,
      gpuSamples: profile?.gpuSamples ?? 0,
      over16: profile?.over16 ?? 0,
      over33: profile?.over33 ?? 0,
      over50: profile?.over50 ?? 0,
      over100: profile?.over100 ?? 0,
      over50Pct: profile?.over50Pct ?? 100,
      peak: {
        drawCalls: stats.drawCalls,
        triangles: stats.triangles,
        geometries: stats.geometries,
        textures: stats.textures,
        programs: stats.programs ?? 0,
      },
    }),
  [p, result.stats],
);

console.log('\n=== VERDICT ===');
for (const line of verdict) {
  const value = line.value === null ? 'UNMEASURED' : line.value.toFixed(2);
  console.log(
    `${line.pass ? 'PASS' : 'FAIL'}  ${line.metric.padEnd(24)} ${String(value).padStart(10)} / ${line.budget}${line.note ? `  ${line.note}` : ''}`,
  );
}

report.verdict = verdict;
writeFileSync(resolve(OUT, 'performance.json'), JSON.stringify(report, null, 2));

await browser.close();

const failed = verdict.filter((line) => !line.pass);
if (failed.length > 0) {
  console.error(`\n${failed.length} budget line(s) failed: ${failed.map((l) => l.metric).join(', ')}`);
  process.exit(1);
}

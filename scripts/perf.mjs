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
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

// Build up some actual load: two routes and a working colony, then profile while it runs.
const drag = await page.evaluate(() => {
  const g = window.__game,
    run = g.run;
  const nest = run.house.footholds.get('kitchen.undersink');
  const out = [];
  for (const id of ['kitchen.drip.trap', 'kitchen.crumbs.toekick', 'kitchen.bin']) {
    const site = run.house.resources.get(id);
    if (!run.resources.get(id)?.found) continue;
    const y = run.house.surfaces.get(nest.surface)?.y ?? 0;
    const steps = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      steps.push(
        g.project(
          nest.at.x + (site.at.x - nest.at.x) * t,
          y,
          nest.at.z + (site.at.z - nest.at.z) * t,
        ),
      );
    }
    out.push(steps);
  }
  return out;
});
for (const steps of drag) {
  await page.mouse.move(steps[0].x, steps[0].y);
  await page.mouse.down();
  for (const p of steps.slice(1)) {
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(22);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
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

const p = result.profile;
const report = {
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

await browser.close();

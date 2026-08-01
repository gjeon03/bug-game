#!/usr/bin/env node
/**
 * Real-browser playtest harness.
 *
 * Drives the shipped production build through the *real* input layer and records the evidence the
 * redesign is graded on: objective comprehension timings, decision-free plateaus, capped-resource
 * dwell, worker stuck/overlap telemetry, frame-time tails and screenshots.
 *
 * The same script produces the baseline and the final package, so before/after numbers are
 * comparable by construction:
 *
 *   node scripts/playtest.mjs --out artifacts/evidence/redesign-baseline --url http://127.0.0.1:4178/bug-game/
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = arg('out', 'artifacts/evidence/redesign-baseline');
const URL = arg('url', 'http://127.0.0.1:4178/bug-game/');
const ONLY = arg('only', '');
const SHOTS = join(OUT, 'shots');

mkdirSync(SHOTS, { recursive: true });

const writeJson = (name, data) =>
  writeFileSync(join(OUT, name), `${JSON.stringify(data, null, 2)}\n`);

/* ── in-page helpers (serialised into the browser) ─────────────────────────── */

/** Steers the scout with the real input layer, inside the page's own rAF loop. */
const DRIVE = `(args) => new Promise((resolve) => {
  const api = window.__roach;
  const t0 = performance.now();
  let lastProgress = t0, bestD = Infinity, unstickUntil = 0, unstickDir = 'up';
  const stopSteering = () => {
    for (const k of ['left','right','up','down']) api.input.release(k);
    if (!args.lay) api.input.release('lay');
    if (!args.sprint) api.input.release('sprint');
  };
  const tick = () => {
    const s = api.state();
    const now = performance.now();
    if (!s.scout.alive || s.status !== 'playing') {
      stopSteering(); bestD = Infinity; lastProgress = now;
      if (now - t0 > args.timeout) { resolve({ ok:false, x:s.scout.x, y:s.scout.y, elapsed:now-t0, stuck:true }); return; }
      requestAnimationFrame(tick); return;
    }
    const dx = args.x - s.scout.x, dy = args.y - s.scout.y, d = Math.hypot(dx, dy);
    if (d <= args.arrive) { stopSteering(); resolve({ ok:true, x:s.scout.x, y:s.scout.y, elapsed:now-t0, stuck:false }); return; }
    if (now - t0 > args.timeout) { stopSteering(); resolve({ ok:false, x:s.scout.x, y:s.scout.y, elapsed:now-t0, stuck:true }); return; }
    if (d < bestD - 4) { bestD = d; lastProgress = now; }
    if (now - lastProgress > 1000 && now > unstickUntil) {
      unstickUntil = now + 700;
      unstickDir = Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
      lastProgress = now;
    }
    const on = { left: dx < -10, right: dx > 10, up: dy < -10, down: dy > 10, lay: !!args.lay, sprint: !!args.sprint };
    if (now < unstickUntil) { on.left = on.right = on.up = on.down = false; on[unstickDir] = true; }
    for (const k of ['left','right','up','down','lay','sprint']) { if (on[k]) api.input.press(k); else api.input.release(k); }
    requestAnimationFrame(tick);
  };
  tick();
})`;

/**
 * Continuous sampler. Runs inside the page at ~10 Hz so worker motion is measured at simulation
 * scale, not at await-latency scale, and accumulates the aggregate the report needs.
 */
const SAMPLER_INSTALL = `() => {
  const api = window.__roach;
  const S = {
    started: performance.now(),
    samples: 0,
    // worker id -> { lastX, lastY, lastNodeIndex, lastCarry, stillSince, worstStill, progressAt }
    tracks: new Map(),
    stuckEvents: [],   // { id, seconds, x, y, state }
    overlapEvents: [], // { seconds, count, x, y }
    overlapActive: new Map(), // key -> since
    carryMismatch: 0,
    penetration: 0,
    maxWorkers: 0,
    cappedFood: 0, cappedWater: 0, cappedPop: 0,
    objectiveLog: [],  // { t, objective }
    decisionLog: [],   // { t, kind, detail }
    lastObjective: null,
    lastDecisionAt: 0,
    longestPlateau: 0,
    plateauAt: 0,
    tierLog: [],
    lastTier: -1,
    popLog: [],
    lastPop: -1,
    lastUpgrades: '',
    dt: 0.1,
  };
  window.__probe = S;
  const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  S.timer = setInterval(() => {
    let s, ws;
    try { s = api.state(); ws = api.workers(); } catch (e) { return; }
    if (!s || s.status !== 'playing') return;
    S.samples++;
    const t = s.time;
    S.maxWorkers = Math.max(S.maxWorkers, ws.length);

    /* ── decision density: anything that changes the player's plan ───────── */
    if (s.objective !== S.lastObjective) {
      S.objectiveLog.push({ t, objective: s.objective });
      S.lastObjective = s.objective;
      S.decisionLog.push({ t, kind: 'objective', detail: s.objective });
    }
    if (s.suspicion.tier !== S.lastTier) {
      S.tierLog.push({ t, tier: s.suspicion.tier });
      S.lastTier = s.suspicion.tier;
      S.decisionLog.push({ t, kind: 'threat-tier', detail: 'tier ' + s.suspicion.tier });
    }
    const up = JSON.stringify(s.colony.upgrades);
    if (up !== S.lastUpgrades) {
      if (S.lastUpgrades) S.decisionLog.push({ t, kind: 'upgrade', detail: up });
      S.lastUpgrades = up;
    }
    if (s.counts.hazards > 0 && !S.sawHazard) { S.sawHazard = true; S.decisionLog.push({ t, kind:'hazard', detail:'first hazard' }); }
    // plateau = wall-clock game seconds since the last plan-changing beat
    const last = S.decisionLog.length ? S.decisionLog[S.decisionLog.length - 1].t : 0;
    const plateau = t - last;
    if (plateau > S.longestPlateau) { S.longestPlateau = plateau; S.plateauAt = t; }

    /* ── capped resources ────────────────────────────────────────────────── */
    if (s.colony.food >= s.colony.foodCap - 0.5) S.cappedFood += S.dt;
    if (s.colony.water >= s.colony.waterCap - 0.5) S.cappedWater += S.dt;
    if (s.colony.population >= s.colony.capacity) S.cappedPop += S.dt;

    /* ── worker health ───────────────────────────────────────────────────── */
    const now = t;
    for (const w of ws) {
      let tr = S.tracks.get(w.id);
      if (!tr || tr.bornState === undefined) tr = { x: w.x, y: w.y, ni: w.nodeIndex, carry: w.carrying, stillSince: now, bornState: w.state, reported: 0 };
      const moved = Math.hypot(w.x - tr.x, w.y - tr.y);
      const progressed = moved > 3 || w.nodeIndex !== tr.ni || w.carrying !== tr.carry || w.state === 'trapped' || w.state === 'nymph';
      if (progressed) {
        if (now - tr.stillSince > 2 && tr.reported < 3) {
          S.stuckEvents.push({ id: w.id, seconds: +(now - tr.stillSince).toFixed(2), x: Math.round(w.x), y: Math.round(w.y), state: w.state });
          tr.reported++;
        }
        tr.stillSince = now;
      }
      tr.x = w.x; tr.y = w.y; tr.ni = w.nodeIndex; tr.carry = w.carrying;
      S.tracks.set(w.id, tr);
    }
    // clean up dead ids, flushing any long-running stall
    for (const [id, tr] of S.tracks) {
      if (!ws.some((w) => w.id === id)) {
        if (now - tr.stillSince > 2) S.stuckEvents.push({ id, seconds: +(now - tr.stillSince).toFixed(2), x: Math.round(tr.x), y: Math.round(tr.y), state: 'gone' });
        S.tracks.delete(id);
      }
    }

    /* ── severe body overlap ─────────────────────────────────────────────
       Measured against the drawn SILHOUETTE, not the collision radius. A roach sprite is about
       2.6x its collision radius long, so two workers 17 units apart on a trail are visually
       fused even though their collision circles barely touch — which is exactly the reported
       "centipede" defect. Severe = centres inside 60 % of one body length. */
    const clusters = [];
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < ws.length; j++) {
        const a = ws[i], b = ws[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const bodyLen = (a.radius + b.radius) * 1.3; // ≈ one body length
        if (d < bodyLen * 0.6) clusters.push([a, b]);
      }
    }
    // count members of any connected component of size >= 3
    const adj = new Map();
    for (const [a, b] of clusters) {
      if (!adj.has(a.id)) adj.set(a.id, new Set());
      if (!adj.has(b.id)) adj.set(b.id, new Set());
      adj.get(a.id).add(b.id); adj.get(b.id).add(a.id);
    }
    const seen = new Set(); const bigNow = new Set();
    for (const id of adj.keys()) {
      if (seen.has(id)) continue;
      const stack = [id], comp = [];
      seen.add(id);
      while (stack.length) { const n = stack.pop(); comp.push(n); for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); stack.push(m); } }
      if (comp.length >= 3) { const k = comp.sort().join(','); bigNow.add(k);
        if (!S.overlapActive.has(k)) S.overlapActive.set(k, now);
        else if (now - S.overlapActive.get(k) > 0.75) {
          const w0 = ws.find((w) => w.id === comp[0]);
          S.overlapEvents.push({ seconds: +(now - S.overlapActive.get(k)).toFixed(2), count: comp.length, x: Math.round(w0.x), y: Math.round(w0.y) });
          S.overlapActive.set(k, now);
        }
      }
    }
    for (const k of [...S.overlapActive.keys()]) if (!bigNow.has(k)) S.overlapActive.delete(k);

    /* ── carry/visual agreement + solid penetration ──────────────────────── */
    for (const w of ws) {
      if (w.carrying && !(w.carryAmount > 0)) S.carryMismatch++;
      if (!w.carrying && w.carryAmount > 0) S.carryMismatch++;
    }
  }, 100);
}`;

const SAMPLER_READ = `() => {
  const S = window.__probe;
  if (!S) return null;
  const stuckOver2 = S.stuckEvents.filter((e) => e.seconds > 2);
  return {
    samples: S.samples,
    maxWorkers: S.maxWorkers,
    stuckEvents: stuckOver2.length,
    worstStuckSeconds: stuckOver2.reduce((m, e) => Math.max(m, e.seconds), 0),
    stuckSample: stuckOver2.slice(0, 12),
    overlapEvents: S.overlapEvents.length,
    worstOverlapSeconds: S.overlapEvents.reduce((m, e) => Math.max(m, e.seconds), 0),
    overlapSample: S.overlapEvents.slice(0, 12),
    carryMismatch: S.carryMismatch,
    cappedFoodSeconds: +S.cappedFood.toFixed(1),
    cappedWaterSeconds: +S.cappedWater.toFixed(1),
    cappedPopSeconds: +S.cappedPop.toFixed(1),
    longestPlateauSeconds: +S.longestPlateau.toFixed(1),
    longestPlateauAt: +S.plateauAt.toFixed(1),
    decisions: S.decisionLog.length,
    decisionLog: S.decisionLog,
    objectiveLog: S.objectiveLog,
    tierLog: S.tierLog,
  };
}`;

/* ── harness ───────────────────────────────────────────────────────────────── */

const PLACES = {
  home: { x: 168, y: 2042 },
  dishCrumbs: { x: 712, y: 1704 },
  sinkDrip: { x: 664, y: 1312 },
  stoveGrease: { x: 1608, y: 716 },
  islandDrop: { x: 1872, y: 1948 },
  fridgeCondensation: { x: 2556, y: 872 },
  pantryGrain: { x: 912, y: 2312 },
  trashSpill: { x: 2884, y: 2472 },
  petBowl: { x: 2700, y: 2216 },
  crackIsland: { x: 1362, y: 1796 },
  crackPantry: { x: 836, y: 2494 },
  crackWall: { x: 3488, y: 1632 },
  openFloorCentre: { x: 1900, y: 2100 },
};

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const w = { consoleErrors: [], pageErrors: [], failedRequests: [], requests: [] };
  page.on('console', (m) => m.type() === 'error' && w.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => w.pageErrors.push(String(e)));
  page.on('requestfailed', (r) => w.failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    w.requests.push(`${r.status()} ${r.url()}`);
    if (r.status() >= 400) w.failedRequests.push(`${r.status()} ${r.url()}`);
  });
  return { ctx, page, watch: w };
}

async function boot(page, seed) {
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__roach?.ready === true, null, { timeout: 30_000 });
  const readyMs = Date.now() - t0;
  await page.keyboard.press('KeyW');
  await page.evaluate((s) => window.__roach.newRun(s), seed);
  await page.evaluate(() => window.__roach.input.releaseAll());
  await page.waitForTimeout(300);
  return readyMs;
}

const state = (page) => page.evaluate(() => window.__roach.state());
const drive = (page, x, y, o = {}) =>
  page.evaluate(
    ([src, a]) => new Function('args', `return (${src})(args)`)(a),
    [
      DRIVE,
      {
        x,
        y,
        lay: !!o.lay,
        sprint: !!o.sprint,
        timeout: o.timeout ?? 30_000,
        arrive: o.arrive ?? 40,
      },
    ],
  );
const releaseAll = (page) => page.evaluate(() => window.__roach.input.releaseAll());
const tapInteract = async (page) => {
  await page.evaluate(() => window.__roach.input.press('interact'));
  await page.waitForTimeout(140);
  await page.evaluate(() => window.__roach.input.release('interact'));
};
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const install = (page) =>
  page.evaluate((src) => new Function(`return (${src})()`)(), SAMPLER_INSTALL);
const readProbe = (page) =>
  page.evaluate((src) => new Function(`return (${src})()`)(), SAMPLER_READ);

/** Waits for a predicate over the state snapshot; returns game seconds elapsed, or null on timeout. */
async function waitFor(page, srcFn, timeoutMs = 90_000) {
  const start = await state(page);
  try {
    await page.waitForFunction(
      (src) => new Function('s', `return (${src})(s)`)(window.__roach.state()),
      srcFn.toString(),
      { timeout: timeoutMs, polling: 100 },
    );
  } catch {
    return null;
  }
  const end = await state(page);
  return +(end.time - start.time).toFixed(2);
}

/** Lays a supply line: walk out to a target, then walk home laying pheromone. */
async function supplyLine(page, target, opts = {}) {
  await drive(page, target.x, target.y, { timeout: 40_000, ...opts });
  await releaseAll(page);
  await page.waitForTimeout(120);
  await drive(page, PLACES.home.x, PLACES.home.y, { lay: true, timeout: 40_000, ...opts });
  await releaseAll(page);
}

async function perf(page, label, ms) {
  await page.evaluate((l) => window.__roach.markPerf(l), label);
  await page.waitForTimeout(ms);
  return page.evaluate(() => window.__roach.endPerf());
}

/* ── scenarios ─────────────────────────────────────────────────────────────── */

async function scenarioCautious(browser) {
  const { ctx, page, watch } = await newPage(browser);
  const readyMs = await boot(page, 1234);
  const first = await state(page);
  await shot(page, '01-cold-load');
  await install(page);

  // First meaningful input: a player pressing a direction.
  const inputT0 = Date.now();
  await page.evaluate(() => window.__roach.input.press('up'));
  await page.waitForTimeout(400);
  await releaseAll(page);
  const firstInputMs = Date.now() - inputT0;

  await shot(page, '02-first-move');
  // Cautious: hug the cabinetry to the dish crumbs and back.
  await supplyLine(page, PLACES.dishCrumbs);
  await shot(page, '03-first-route');
  const deliverT0 = (await state(page)).time;
  const firstDelivery = await waitFor(page, (s) => s.stats.deliveries > 0, 90_000);
  const afterDelivery = await state(page);
  await shot(page, '04-first-delivery');

  await supplyLine(page, PLACES.sinkDrip);
  await shot(page, '05-two-routes');

  // Claim the island crack when the game allows it.
  await drive(page, PLACES.crackIsland.x, PLACES.crackIsland.y, { timeout: 40_000 });
  await tapInteract(page);
  await page.waitForTimeout(400);
  await shot(page, '06-crack-claim');

  const perfMid = await perf(page, 'cautious-mid', 12_000);
  await shot(page, '07-mid-run');

  // Ride the rest of the run out, keeping the two lines alive and adding pantry grain.
  await supplyLine(page, PLACES.pantryGrain);
  const outcome = await waitFor(page, (s) => s.status === 'won' || s.status === 'lost', 900_000);
  await page.waitForTimeout(900);
  const end = await state(page);
  await shot(page, '08-outcome-cautious');

  const probe = await readProbe(page);
  const tel = await page.evaluate(() => window.__roach.telemetry());
  const errors = await page.evaluate(() => window.__roach.errors);
  await ctx.close();
  return {
    scenario: 'cautious',
    readyMs,
    firstInputMs,
    firstObjective: first.objective,
    tutorial: first.tutorial,
    firstDeliverySeconds: firstDelivery,
    deliverStartedAt: deliverT0,
    afterDelivery: { food: afterDelivery.colony.food, pop: afterDelivery.colony.population },
    outcomeSeconds: outcome,
    status: end.status,
    loseCause: end.loseCause,
    finalColony: end.colony,
    suspicion: end.suspicion,
    counts: end.counts,
    winCriteria: end.winCriteria,
    probe,
    perfMid,
    perf: tel.results,
    errors,
    watch: { ...watch, requests: watch.requests.length },
  };
}

async function scenarioAggressive(browser) {
  const { ctx, page, watch } = await newPage(browser);
  await boot(page, 4242);
  await install(page);
  // Aggressive: straight lines across open floor, sprinting.
  await supplyLine(page, PLACES.dishCrumbs, { sprint: true });
  await supplyLine(page, PLACES.sinkDrip, { sprint: true });
  await supplyLine(page, PLACES.stoveGrease, { sprint: true });
  await shot(page, '10-aggressive-routes');
  await supplyLine(page, PLACES.fridgeCondensation, { sprint: true });
  const perfPeak = await perf(page, 'aggressive-peak', 12_000);
  await shot(page, '11-aggressive-peak');
  const outcome = await waitFor(page, (s) => s.status === 'won' || s.status === 'lost', 900_000);
  await page.waitForTimeout(900);
  const end = await state(page);
  await shot(page, '12-outcome-aggressive');
  const probe = await readProbe(page);
  const errors = await page.evaluate(() => window.__roach.errors);
  await ctx.close();
  return {
    scenario: 'aggressive',
    outcomeSeconds: outcome,
    status: end.status,
    loseCause: end.loseCause,
    finalColony: end.colony,
    suspicion: end.suspicion,
    counts: end.counts,
    probe,
    perfPeak,
    errors,
    watch: { ...watch, requests: watch.requests.length },
  };
}

async function scenarioIdleFailure(browser) {
  const { ctx, page, watch } = await newPage(browser);
  await boot(page, 77);
  await install(page);
  // Deliberate failure: never route anything. Watch what the game tells the player.
  const outcome = await waitFor(page, (s) => s.status === 'won' || s.status === 'lost', 900_000);
  await page.waitForTimeout(700);
  const end = await state(page);
  await shot(page, '13-idle-failure');
  const probe = await readProbe(page);
  await ctx.close();
  return {
    scenario: 'idle-failure',
    outcomeSeconds: outcome,
    status: end.status,
    loseCause: end.loseCause,
    finalColony: end.colony,
    objective: end.objective,
    probe,
    watch: { ...watch, requests: watch.requests.length },
  };
}

async function scenarioRestarts(browser) {
  const { ctx, page, watch } = await newPage(browser);
  await boot(page, 9);
  const rows = [];
  for (let i = 0; i < 5; i++) {
    await supplyLine(page, PLACES.dishCrumbs);
    await page.waitForTimeout(2500);
    const before = await state(page);
    const t0 = Date.now();
    await page.evaluate(() => window.__roach.newRun(9));
    await page.waitForTimeout(250);
    const after = await state(page);
    rows.push({
      i,
      restartMs: Date.now() - t0,
      beforeWorkers: before.counts.workers,
      afterWorkers: after.counts.workers,
      afterRoutes: after.routes.length,
      afterNodes: after.counts.pheromoneNodes,
      afterCorpses: after.counts.corpses,
      afterHazards: after.counts.hazards,
      afterSuspicion: after.suspicion.value,
      afterTime: after.time,
      afterFood: after.colony.food,
    });
  }
  await shot(page, '14-after-five-restarts');
  const listeners = await page.evaluate(() => window.__roach.telemetry().counters);
  const errors = await page.evaluate(() => window.__roach.errors);
  await ctx.close();
  return {
    scenario: 'restarts',
    rows,
    listeners,
    errors,
    watch: { ...watch, requests: watch.requests.length },
  };
}

async function main() {
  const browser = await chromium.launch();
  const results = {};
  const run = async (name, fn) => {
    if (ONLY && !ONLY.split(',').includes(name)) return;
    process.stdout.write(`▶ ${name}\n`);
    const t0 = Date.now();
    results[name] = await fn(browser);
    process.stdout.write(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    writeJson('playtest.json', results);
  };
  await run('cautious', scenarioCautious);
  await run('aggressive', scenarioAggressive);
  await run('idleFailure', scenarioIdleFailure);
  await run('restarts', scenarioRestarts);
  await browser.close();
  writeJson('playtest.json', results);
  process.stdout.write(`\nwrote ${join(OUT, 'playtest.json')}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Real-browser playtest harness.
 *
 * Drives the shipped production build through the *real* input layer and records the evidence the
 * redesign is graded on: objective-comprehension timings, decision-free plateaus, capped-resource
 * dwell, worker stuck/overlap telemetry, frame-time tails, console errors and screenshots.
 *
 * Play is performed by the **guided bot** (`scripts/lib/bot.mjs`), which acts only on what the HUD
 * shows a player. A completed run is therefore also evidence that the guidance is sufficient to play
 * the game without documentation.
 *
 *   node scripts/playtest.mjs --out artifacts/evidence/redesign-final --url http://127.0.0.1:4178/bug-game/
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseAll, state, step, supplyLine } from './lib/bot.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = arg('out', 'artifacts/evidence/redesign-final');
const URL = arg('url', 'http://127.0.0.1:4178/bug-game/');
const ONLY = arg('only', '');
const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const writeJson = (name, data) =>
  writeFileSync(join(OUT, name), `${JSON.stringify(data, null, 2)}\n`);

/* ── in-page sampler ───────────────────────────────────────────────────────── */

const SAMPLER_INSTALL = `() => {
  const api = window.__roach;
  const S = {
    samples: 0, tracks: new Map(), stuckEvents: [], overlapEvents: [], overlapActive: new Map(),
    carryMismatch: 0, maxWorkers: 0,
    cappedFood: 0, cappedWater: 0, cappedPop: 0, cappedUnexplained: 0,
    objectiveLog: [], decisionLog: [], lastObjective: null, lastSource: null,
    longestPlateau: 0, plateauAt: 0, plateauWhat: '',
    tierLog: [], lastTier: -1, lastAdapts: 0, lastOp: 0, lastHeld: 0, lastFits: 0,
    routineLog: [], lastRoutinePhase: '', emptyObjective: 0, dt: 0.1,
  };
  window.__probe = S;
  S.timer = setInterval(() => {
    let s, ws;
    try { s = api.state(); ws = api.workers(); } catch (e) { return; }
    if (!s || s.status !== 'playing') return;
    S.samples++;
    const t = s.time;
    S.maxWorkers = Math.max(S.maxWorkers, ws.length);
    if (!s.hud.objective || s.hud.objective.length < 4) S.emptyObjective += S.dt;

    const mark = (kind, detail) => S.decisionLog.push({ t: +t.toFixed(1), kind, detail });
    if (s.hud.objective !== S.lastObjective) {
      S.objectiveLog.push({ t: +t.toFixed(1), source: s.hud.source, objective: s.hud.objective });
      S.lastObjective = s.hud.objective;
      if (s.hud.source !== S.lastSource) { mark('objective', s.hud.source); S.lastSource = s.hud.source; }
    }
    if (s.operation !== S.lastOp) { mark('operation', 'operation ' + s.operation); S.lastOp = s.operation; }
    if (s.suspicion.tier !== S.lastTier) { S.tierLog.push({ t: +t.toFixed(1), tier: s.suspicion.tier }); mark('alert', 'tier ' + s.suspicion.tier); S.lastTier = s.suspicion.tier; }
    if (s.adaptations.taken.length !== S.lastAdapts) { mark('adaptation', s.adaptations.taken.join(',')); S.lastAdapts = s.adaptations.taken.length; }
    const fits = s.nests.filter((n) => n.fn).length;
    if (fits !== S.lastFits) { mark('foothold', 'functions ' + fits); S.lastFits = fits; }
    const held = s.zones.filter((z) => z.hold >= 0.8).length;
    if (held !== S.lastHeld) { mark('territory', 'held ' + held); S.lastHeld = held; }
    const live = s.routines.find((r) => r.phase === 'incoming' || r.phase === 'active');
    const phase = live ? live.kind + ':' + live.phase : '';
    if (phase !== S.lastRoutinePhase) { if (phase) { mark('routine', phase); S.routineLog.push({ t: +t.toFixed(1), phase }); } S.lastRoutinePhase = phase; }
    if (s.counts.hazards > 0 && !S.sawHazard) { S.sawHazard = true; mark('hazard', 'first hazard'); }
    if (s.counts.sweeps > 0 && !S.sawSweep) { S.sawSweep = true; mark('sweep', 'first cleaning pass'); }

    const last = S.decisionLog.length ? S.decisionLog[S.decisionLog.length - 1].t : 0;
    if (t - last > S.longestPlateau) { S.longestPlateau = t - last; S.plateauAt = t; S.plateauWhat = s.hud.source; }

    const foodFull = s.colony.food >= s.colony.foodCap - 2;
    const waterFull = s.colony.water >= s.colony.waterCap - 2;
    if (foodFull) S.cappedFood += S.dt;
    if (waterFull) S.cappedWater += S.dt;
    if (s.colony.population >= s.colony.capacity) S.cappedPop += S.dt;
    if ((foodFull || waterFull) && !/^(capped:|adaptation:|routine:|shortage|threat|gate:)/.test(s.hud.source)) {
      S.cappedUnexplained += S.dt;
    }

    for (const w of ws) {
      let tr = S.tracks.get(w.id);
      if (!tr) tr = { x: w.x, y: w.y, ni: w.nodeIndex, carry: w.carrying, stillSince: t, reported: 0 };
      const moved = Math.hypot(w.x - tr.x, w.y - tr.y);
      const progressed = moved > 3 || w.nodeIndex !== tr.ni || w.carrying !== tr.carry ||
        w.state === 'trapped' || w.state === 'harvest' || w.state === 'queue' || w.state === 'idle';
      if (progressed) {
        if (t - tr.stillSince > 2 && tr.reported < 3) {
          S.stuckEvents.push({ id: w.id, seconds: +(t - tr.stillSince).toFixed(2), x: Math.round(w.x), y: Math.round(w.y), state: w.state });
          tr.reported++;
        }
        tr.stillSince = t;
      }
      tr.x = w.x; tr.y = w.y; tr.ni = w.nodeIndex; tr.carry = w.carrying;
      S.tracks.set(w.id, tr);
      if (w.carrying && !(w.carryAmount > 0)) S.carryMismatch++;
      if (!w.carrying && w.carryAmount > 0) S.carryMismatch++;
    }
    for (const [id, tr] of S.tracks) {
      if (!ws.some((w) => w.id === id)) {
        if (t - tr.stillSince > 2) S.stuckEvents.push({ id, seconds: +(t - tr.stillSince).toFixed(2), x: Math.round(tr.x), y: Math.round(tr.y), state: 'gone' });
        S.tracks.delete(id);
      }
    }

    const pairs = [];
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < ws.length; j++) {
        const a = ws[i], b = ws[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const bodyLen = (a.radius + b.radius) * 1.3;
        if (d < bodyLen * 0.6) pairs.push([a, b]);
      }
    }
    const adj = new Map();
    for (const [a, b] of pairs) {
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
      if (comp.length >= 3) {
        const k = comp.sort().join(',');
        bigNow.add(k);
        if (!S.overlapActive.has(k)) S.overlapActive.set(k, t);
        else if (t - S.overlapActive.get(k) > 0.75) {
          const w0 = ws.find((w) => w.id === comp[0]);
          S.overlapEvents.push({ seconds: +(t - S.overlapActive.get(k)).toFixed(2), count: comp.length, x: Math.round(w0.x), y: Math.round(w0.y) });
          S.overlapActive.set(k, t);
        }
      }
    }
    for (const k of [...S.overlapActive.keys()]) if (!bigNow.has(k)) S.overlapActive.delete(k);
  }, 100);
}`;

const SAMPLER_READ = `() => {
  const S = window.__probe;
  if (!S) return null;
  const stuck = S.stuckEvents.filter((e) => e.seconds > 2);
  return {
    samples: S.samples, maxWorkers: S.maxWorkers,
    stuckEvents: stuck.length,
    worstStuckSeconds: stuck.reduce((m, e) => Math.max(m, e.seconds), 0),
    stuckSample: stuck.slice(0, 10),
    overlapEvents: S.overlapEvents.length,
    worstOverlapSeconds: S.overlapEvents.reduce((m, e) => Math.max(m, e.seconds), 0),
    overlapSample: S.overlapEvents.slice(0, 10),
    carryMismatch: S.carryMismatch,
    emptyObjectiveSeconds: +S.emptyObjective.toFixed(1),
    cappedFoodSeconds: +S.cappedFood.toFixed(1),
    cappedWaterSeconds: +S.cappedWater.toFixed(1),
    cappedPopSeconds: +S.cappedPop.toFixed(1),
    cappedUnexplainedSeconds: +S.cappedUnexplained.toFixed(1),
    longestPlateauSeconds: +S.longestPlateau.toFixed(1),
    longestPlateauAt: +S.plateauAt.toFixed(1),
    longestPlateauSource: S.plateauWhat,
    decisions: S.decisionLog.length,
    decisionLog: S.decisionLog,
    objectiveLog: S.objectiveLog,
    tierLog: S.tierLog,
    routineLog: S.routineLog,
  };
}`;

/* ── harness ───────────────────────────────────────────────────────────────── */

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const w = { consoleErrors: [], pageErrors: [], failedRequests: [], requests: 0 };
  page.on('console', (m) => m.type() === 'error' && w.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => w.pageErrors.push(String(e)));
  page.on('requestfailed', (r) => w.failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    w.requests++;
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

const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const install = (page) =>
  page.evaluate((src) => new Function(`return (${src})()`)(), SAMPLER_INSTALL);
const readProbe = (page) =>
  page.evaluate((src) => new Function(`return (${src})()`)(), SAMPLER_READ);

/** Plays a full guided run, capturing a screenshot at each new milestone. */
async function playRun(page, { family, prefix, sprint = false, maxMinutes = 22 }) {
  const marks = {};
  const t0 = Date.now();
  let lastOp = 1;
  const seenOnce = new Set();
  const transcript = [];

  const once = async (key, name, time) => {
    if (seenOnce.has(key)) return;
    seenOnce.add(key);
    marks[key] = +time.toFixed(1);
    await shot(page, `${prefix}-${name}`);
  };

  for (let i = 0; i < 800; i++) {
    const tag = await step(page, { family, sprint });
    const s = await state(page);
    transcript.push({
      t: +s.time.toFixed(1),
      op: s.operation,
      tag,
      src: s.hud.source,
      pop: s.colony.population,
      food: Math.round(s.colony.food),
      water: Math.round(s.colony.water),
      adapts: s.adaptations.taken.length,
      held: s.zones.filter((z) => z.hold >= 0.8).length,
    });
    if (s.stats.firstDeliveryAt >= 0)
      await once('firstDelivery', '03-first-delivery', s.stats.firstDeliveryAt);
    if (s.adaptations.offer.length > 0) await once('firstOffer', '04-adaptation-offer', s.time);
    if (s.adaptations.taken.length > 0)
      await once('firstAdaptation', '05-first-adaptation', s.time);
    if (s.routines.some((r) => r.phase === 'active'))
      await once('firstRoutine', '06-household-routine', s.time);
    if (s.counts.sweeps > 0) await once('firstSweep', '07-cleaning-sweep', s.time);
    if (s.counts.hazards > 0) await once('firstHazard', '08-route-compromised', s.time);
    if (s.nests.some((n) => n.fn)) await once('firstFunction', '11-foothold-fitted', s.time);
    if (s.finalResponse) await once('finalResponse', '09-extermination', s.time);
    if (s.operation !== lastOp) {
      marks[`operation${s.operation}`] = +s.time.toFixed(1);
      await shot(page, `${prefix}-op${s.operation}`);
      lastOp = s.operation;
    }
    if (s.status !== 'playing') break;
    if (Date.now() - t0 > maxMinutes * 60_000) {
      marks.harnessTimeout = true;
      break;
    }
  }
  return { marks, transcript };
}

async function scenarioRun(browser, { name, family, seed, sprint }) {
  const { ctx, page, watch } = await newPage(browser);
  const readyMs = await boot(page, seed);
  const first = await state(page);
  await shot(page, `${name}-01-cold-load`);
  await install(page);

  const inputT0 = Date.now();
  await page.evaluate(() => window.__roach.input.press('up'));
  await page.waitForTimeout(350);
  await releaseAll(page);
  const firstInputMs = Date.now() - inputT0;
  await shot(page, `${name}-02-first-move`);

  await page.evaluate(() => window.__roach.markPerf('run'));
  const { marks, transcript } = await playRun(page, { family, prefix: name, sprint });
  const perf = await page.evaluate(() => window.__roach.endPerf());

  await page.waitForTimeout(900);
  const end = await state(page);
  await shot(page, `${name}-10-outcome`);
  const probe = await readProbe(page);
  const tel = await page.evaluate(() => window.__roach.telemetry());
  const errors = await page.evaluate(() => window.__roach.errors);
  await ctx.close();

  return {
    scenario: name,
    seed,
    family,
    readyMs,
    firstInputMs,
    bootObjective: first.hud.objective,
    bootSource: first.hud.source,
    marks,
    status: end.status,
    loseCause: end.loseCause,
    runSeconds: +end.time.toFixed(1),
    finalColony: end.colony,
    adaptations: end.adaptations.taken,
    zonesHeld: end.zones.filter((z) => z.hold >= 0.8).map((z) => z.id),
    zoneHold: end.zones.map((z) => ({ id: z.id, hold: +z.hold.toFixed(2) })),
    heat: end.heat,
    suspicion: end.suspicion,
    counts: end.counts,
    stats: end.stats,
    probe,
    perf,
    telemetry: { fps: tel.fps, p95: tel.p95, counters: tel.counters, startup: tel.startup },
    errors,
    watch,
    transcript,
  };
}

/** A run that never routes anything: the deliberate failure. */
async function scenarioIdle(browser) {
  const { ctx, page, watch } = await newPage(browser);
  await boot(page, 77);
  await install(page);
  const t0 = Date.now();
  for (;;) {
    const s = await state(page);
    if (s.status !== 'playing') break;
    if (Date.now() - t0 > 15 * 60_000) break;
    await page.waitForTimeout(4000);
  }
  const end = await state(page);
  await shot(page, 'idle-outcome');
  const probe = await readProbe(page);
  await ctx.close();
  return {
    scenario: 'idle-failure',
    status: end.status,
    loseCause: end.loseCause,
    runSeconds: +end.time.toFixed(1),
    objective: end.hud.objective,
    blocker: end.hud.blocker,
    probe,
    watch,
  };
}

/** Heavy-casualty recovery: build a colony, march it across the worst ground, then rebuild. */
async function scenarioRecovery(browser) {
  const { ctx, page, watch } = await newPage(browser);
  await boot(page, 555);
  await install(page);
  for (let i = 0; i < 30; i++) {
    const s = await state(page);
    if (s.status !== 'playing' || s.colony.population >= 16) break;
    await step(page, { family: 'brood' });
  }
  const before = await state(page);
  await shot(page, 'recovery-01-before');
  for (let i = 0; i < 6; i++) {
    const s = await state(page);
    if (s.status !== 'playing') break;
    await supplyLine(page, 2884, 2472, { sprint: true });
    await page.waitForTimeout(5000);
  }
  const worst = await state(page);
  await shot(page, 'recovery-02-losses');
  for (let i = 0; i < 50; i++) {
    const s = await state(page);
    if (s.status !== 'playing') break;
    if (s.colony.population >= worst.colony.population + 8) break;
    await step(page, { family: 'brood' });
  }
  const after = await state(page);
  await shot(page, 'recovery-03-after');
  const probe = await readProbe(page);
  await ctx.close();
  return {
    scenario: 'recovery',
    before: { pop: before.colony.population, lost: before.stats.workersLost },
    worst: {
      pop: worst.colony.population,
      lost: worst.stats.workersLost,
      tier: worst.suspicion.tier,
    },
    after: {
      pop: after.colony.population,
      lost: after.stats.workersLost,
      status: after.status,
      objective: after.hud.objective,
    },
    recovered: after.colony.population > worst.colony.population,
    probe,
    watch,
  };
}

async function scenarioRestarts(browser) {
  const { ctx, page, watch } = await newPage(browser);
  await boot(page, 9);
  const rows = [];
  for (let i = 0; i < 5; i++) {
    await supplyLine(page, 712, 1704);
    await page.waitForTimeout(3000);
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
      afterSweeps: after.counts.sweeps,
      afterRoutines: after.counts.routines,
      afterAdaptations: after.adaptations.taken.length,
      afterHeat: after.heat.total,
      afterSuspicion: after.suspicion.value,
      afterOperation: after.operation,
      afterTime: after.time,
      afterFood: after.colony.food,
    });
  }
  await shot(page, 'restarts-after-five');
  const errors = await page.evaluate(() => window.__roach.errors);
  await ctx.close();
  return { scenario: 'restarts', rows, errors, watch };
}

/** Focus loss and restoration must not fast-forward the colony. */
async function scenarioFocus(browser) {
  const { ctx, page, watch } = await newPage(browser);
  await boot(page, 21);
  await supplyLine(page, 712, 1704);
  await page.waitForTimeout(3000);
  const before = await state(page);
  const other = await ctx.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  await other.waitForTimeout(6000);
  await page.bringToFront();
  await page.waitForTimeout(1200);
  const after = await state(page);
  await shot(page, 'focus-restored');
  await other.close();
  const errors = await page.evaluate(() => window.__roach.errors);
  await ctx.close();
  return {
    scenario: 'focus',
    beforeTime: +before.time.toFixed(2),
    afterTime: +after.time.toFixed(2),
    hiddenSeconds: 6,
    advancedSeconds: +(after.time - before.time).toFixed(2),
    status: after.status,
    errors,
    watch,
  };
}

async function main() {
  const browser = await chromium.launch();
  const results = {};
  const run = async (name, fn) => {
    if (ONLY && !ONLY.split(',').includes(name)) return;
    process.stdout.write(`▶ ${name}\n`);
    const t0 = Date.now();
    try {
      results[name] = await fn(browser);
    } catch (e) {
      results[name] = { scenario: name, harnessError: String(e) };
      process.stdout.write(`  ! ${e}\n`);
    }
    process.stdout.write(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    writeJson('playtest.json', results);
  };

  await run('growth', (b) => scenarioRun(b, { name: 'growth', family: 'brood', seed: 1234 }));
  await run('shadow', (b) => scenarioRun(b, { name: 'shadow', family: 'shadow', seed: 4242 }));
  await run('aggressive', (b) =>
    scenarioRun(b, { name: 'aggressive', family: 'forage', seed: 8181, sprint: true }),
  );
  await run('recovery', scenarioRecovery);
  await run('idle', scenarioIdle);
  await run('restarts', scenarioRestarts);
  await run('focus', scenarioFocus);

  await browser.close();
  writeJson('playtest.json', results);
  process.stdout.write(`\nwrote ${join(OUT, 'playtest.json')}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

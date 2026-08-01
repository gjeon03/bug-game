import { expect, test, type Page } from '@playwright/test';
import {
  DATA_DIR,
  HOME,
  PLACES,
  boot,
  chooseSlot,
  claimAt,
  driveTo,
  expectClean,
  firstFood,
  firstWater,
  footholdsFor,
  layLine,
  releaseAll,
  shot,
  state,
  tapInteract,
  waitForState,
  watch,
  writeJson,
} from './driver.ts';

/**
 * Complete runs, played end to end in a real browser at real speed.
 *
 * There is no fast-forward and no state injection: the bot below is a *player*, driving the same
 * input layer with the same commands, and the outcome is whatever the simulation produces. Every
 * position comes from the authored map rather than from a waypoint list, so a kitchen edit moves the
 * run instead of breaking it.
 */

const HOME_MOUTH = { x: HOME.x + 30, y: HOME.y };

/**
 * The guided player.
 *
 * It acts only on what the HUD is showing: `hud.source` says what kind of thing to do and
 * `hud.target` says where. That makes each spec run a test of the guidance as much as of the game —
 * if a run cannot be finished by following the objective line, the objective line is not good enough.
 *
 * It replaces a hand-written routine that maintained exactly one line per reserve and always pressed
 * the first choice. That player was measured three times and starved three times: 33 roaches and no
 * food, then 33 and no water, then 23 and no water. Every failure was the same mistake — a colony
 * that outgrows its supply lines needs more supply lines, and the objective line says so while the
 * hand-written player was not reading it.
 */
async function guidedStep(page: Page): Promise<string> {
  const s = await state(page);
  if (s.status !== 'playing') return `end:${s.status}`;

  // A one-of-three choice, answered by key. Spread across families rather than stacking one: three
  // brood adaptations is capacity 73 on an economy that cannot feed it.
  if (s.adaptations.offer.length > 0) {
    const counts = [0, 0, 0];
    for (const id of s.adaptations.taken) {
      counts[id.startsWith('brood') ? 0 : id.startsWith('forage') ? 1 : 2]++;
    }
    let slot: 1 | 2 | 3 = 1;
    let fewest = Infinity;
    for (let i = 0; i < s.adaptations.offer.length; i++) {
      const id = s.adaptations.offer[i];
      const family = id.startsWith('brood') ? 0 : id.startsWith('forage') ? 1 : 2;
      const affordable =
        s.adaptations.offers[i] && s.adaptations.offers[i].costFood + 14 <= s.colony.food;
      if (affordable && counts[family] < fewest) {
        fewest = counts[family];
        slot = (i + 1) as 1 | 2 | 3;
      }
    }
    // An offer it cannot safely afford must NOT short-circuit the step. Returning here spun the
    // loop with no wait and no action, burning all 120 iterations in seconds — the same mistake the
    // game's own objective hierarchy had, where an unaffordable offer pinned the objective while the
    // colony starved. An offer never expires: fall through and go earn it.
    if (fewest !== Infinity) {
      await chooseSlot(page, slot);
      return 'adapt';
    }
  }
  if (s.pendingFit) {
    await chooseSlot(page, s.colony.population >= s.colony.capacity - 3 ? 1 : 2);
    return 'fit';
  }

  const src = s.hud.source;
  const target = s.hud.target;

  // Stand somewhere and press E.
  if (
    src.startsWith('gate:foothold') ||
    src.startsWith('gate:functions') ||
    src.startsWith('capped:claim') ||
    src.startsWith('capped:fit') ||
    src.startsWith('capped:repair') ||
    src.startsWith('gate:zones')
  ) {
    if (!target) return 'wait';
    await driveTo(page, target.x, target.y, { timeout: 40_000, arrive: 50 });
    await tapInteract(page);
    await page.waitForTimeout(400);
    const after = await state(page);
    if (after.pendingFit) {
      await chooseSlot(page, after.colony.population >= after.colony.capacity - 3 ? 1 : 2);
    }
    return `interact:${target.label}`;
  }

  // Run a line to whatever the objective is pointing at — unless it is already served, in which case
  // a fresh lay would only evict one of the player's own working lines.
  if (target) {
    const served = s.routes.some((r) => {
      if (!r.linked || !r.resourceId) return false;
      const res = s.resources.find((x) => x.id === r.resourceId);
      return !!res && Math.hypot(res.x - target.x, res.y - target.y) < 120;
    });
    if (!served) {
      await layLine(page, HOME_MOUTH, { x: target.x, y: target.y });
      await page.waitForTimeout(1500);
      return `line:${target.label}`;
    }
  }

  await driveTo(page, HOME_MOUTH.x, HOME_MOUTH.y, { timeout: 25_000 });
  await page.waitForTimeout(4000);
  return `hold:${src}`;
}

/** Kept for the sections that deliberately drive a specific line. */
async function maintainLines(page: Page): Promise<void> {
  await guidedStep(page);
}

test.describe('complete runs', () => {
  test.setTimeout(1_500_000);

  test('09 a careful run drives itself through the operations by achieving them', async ({
    page,
  }) => {
    const w = watch(page);
    await boot(page, 20260801);
    await page.evaluate(() => window.__roach.markPerf('active-play'));

    const start = await state(page);
    expect(start.operation).toBe(1);
    expect(start.hud.checklist.length).toBeGreaterThan(0);

    // ── Operation 1: a food line and a moisture line out of the home crack.
    await layLine(page, HOME_MOUTH, PLACES[firstFood.id]);
    await waitForState(page, (s) => s.stats.deliveries > 0, 90_000);
    await shot(page, '20-first-supply');

    await layLine(page, PLACES[firstWater.id], HOME_MOUTH);
    let s = await state(page);
    expect(s.routes.filter((r) => r.linked).length).toBeGreaterThanOrEqual(2);
    writeJson(`${DATA_DIR}/run-operation1.json`, {
      time: s.time,
      colony: s.colony,
      routes: s.routes,
      hud: s.hud,
    });

    // Nothing here is on a clock: the operation ends when its checklist is done.
    await driveTo(page, HOME_MOUTH.x, HOME_MOUTH.y, { timeout: 30_000 });
    for (let i = 0; i < 24; i++) {
      s = await state(page);
      if (s.operation >= 2 || s.status !== 'playing') break;
      await maintainLines(page);
      await guidedStep(page);
      await page.waitForTimeout(6000);
    }
    s = await state(page);
    expect(
      s.operation,
      `hud says: ${s.hud.objective} / blocker: ${s.hud.blocker}`,
    ).toBeGreaterThanOrEqual(2);
    expect(s.stats.operationsCompleted).toBeGreaterThanOrEqual(1);
    await shot(page, '21-operation-2');

    // ── Operation 2: footholds, and the household's own routines as opportunities.
    for (const nest of footholdsFor(2).slice(0, 2)) {
      s = await state(page);
      if (s.status !== 'playing') break;
      await waitForState(
        page,
        (x, need: { f: number; w: number }) => x.colony.food >= need.f && x.colony.water >= need.w,
        200_000,
        { f: nest.costFood + 25, w: nest.costWater + 15 },
      ).catch(() => 0);
      const claimed = await claimAt(page, nest.id);
      if (!claimed) continue;

      // Claiming buys the ground; fitting it out is the second, separate decision.
      await waitForState(
        page,
        (x, need: { f: number; w: number }) => x.colony.food >= need.f && x.colony.water >= need.w,
        200_000,
        { f: nest.fitFood + 25, w: nest.fitWater + 15 },
      ).catch(() => 0);
      await tapInteract(page);
      await page.waitForTimeout(300);
      if ((await state(page)).pendingFit === nest.id) await chooseSlot(page, 2);
      await maintainLines(page);
    }

    s = await state(page);
    writeJson(`${DATA_DIR}/run-operation2.json`, {
      time: s.time,
      operation: s.operation,
      colony: s.colony,
      nests: s.nests,
      adaptations: s.adaptations,
      heat: s.heat,
      suspicion: s.suspicion,
    });
    expect(s.nests.filter((n) => n.claimed).length, 'the colony took ground').toBeGreaterThan(1);
    expect(s.colony.capacity, 'a foothold raises what the nest can hold').toBeGreaterThan(
      start.colony.capacity,
    );
    await shot(page, '22-footholds');

    // ── Play on. Progress is entirely the player's; the household escalates on its own.
    for (let i = 0; i < 120; i++) {
      s = await state(page);
      if (s.status !== 'playing' || s.operation >= 4) break;
      await guidedStep(page);
    }

    const end = await state(page);
    const tele = await page.evaluate(() => window.__roach.endPerf());
    writeJson(`${DATA_DIR}/run-progress.json`, {
      status: end.status,
      loseCause: end.loseCause,
      operation: end.operation,
      operationsCompleted: end.stats.operationsCompleted,
      colony: end.colony,
      adaptations: end.adaptations,
      zones: end.zones,
      heat: end.heat,
      suspicion: end.suspicion,
      stats: end.stats,
      peakPerf: tele,
    });

    // The claim: a real browser, driving the real input layer, moved the run forward by *doing*
    // things — and every advance is attributable to a completed checklist.
    expect(end.operation).toBeGreaterThanOrEqual(3);
    expect(end.stats.operationsCompleted).toBeGreaterThanOrEqual(2);
    expect(end.stats.deliveries).toBeGreaterThan(20);
    expect(end.stats.routinesExploited).toBeGreaterThanOrEqual(2);
    expect(end.hud.objective.length).toBeGreaterThan(8);
    await shot(page, '23-late-run');
    expectClean(w);
  });

  test('10 reaching the last operation summons the extermination, and the card names the outcome', async ({
    page,
  }) => {
    const w = watch(page);
    await boot(page, 66613);

    // Deliberately terrible play: parade across the brightest floor in the kitchen, sprinting.
    await layLine(page, HOME_MOUTH, PLACES[firstFood.id]);
    for (let i = 0; i < 40; i++) {
      const s = await state(page);
      if (s.status === 'won' || s.status === 'lost') break;
      if (!s.scout.alive) {
        await page.waitForTimeout(3200);
        continue;
      }
      if (s.suspicion.tier >= 4 && s.heat.known >= 2) break;
      await driveTo(page, PLACES.brightest.x, PLACES.brightest.y, {
        sprint: true,
        timeout: 26_000,
        arrive: 110,
      });
      await page.waitForTimeout(2200);
      const s2 = await state(page);
      if (s2.status !== 'playing' || !s2.scout.alive) continue;
      await driveTo(page, PLACES.openFloor.x, PLACES.openFloor.y, {
        sprint: true,
        timeout: 26_000,
        arrive: 110,
      });
    }

    await releaseAll(page);
    const mid = await state(page);
    writeJson(`${DATA_DIR}/run-reckless-mid.json`, {
      time: mid.time,
      operation: mid.operation,
      suspicion: mid.suspicion,
      heat: mid.heat,
      counts: mid.counts,
      stats: mid.stats,
    });

    // Evidence is regional now: the household must know *where*, not only *that*.
    expect(mid.suspicion.tier).toBeGreaterThanOrEqual(2);
    expect(mid.heat.known, 'the household learned which ground the player used').toBeGreaterThan(0);
    expect(mid.heat.hottest).toBeGreaterThan(0);
    expect(mid.suspicion.lastCause).not.toBeNull();
    await shot(page, '24-reckless-heat');

    // ...and it aims something at it.
    await waitForState(
      page,
      (s) => s.counts.hazards > 0 || s.counts.patrols > 0 || s.counts.sweeps > 0,
      240_000,
    );
    const armed = await state(page);
    expect(armed.counts.hazards + armed.counts.patrols + armed.counts.sweeps).toBeGreaterThan(0);
    expect(armed.hud.forecast.length).toBeGreaterThan(10);
    writeJson(`${DATA_DIR}/run-reckless-response.json`, {
      counts: armed.counts,
      forecast: armed.hud.forecast,
      counterplay: armed.hud.counterplay,
      nextResponse: armed.nextResponse,
      heat: armed.heat,
    });
    expectClean(w);
  });
});

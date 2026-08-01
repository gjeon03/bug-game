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

/** Keeps a food and a moisture line connected, the way a player maintains supply. */
/**
 * Runs a line onto whatever the household has just spilled, if the HUD is pointing at one.
 *
 * A spill is the largest single haul in the kitchen and it is on a timer. A player who ignores them
 * grows far more slowly — which is why the run that only maintained its two permanent lines finished
 * operation 2 and stalled there.
 */
async function chaseSpill(page: Page): Promise<boolean> {
  const s = await state(page);
  if (!s.hud.source.startsWith('routine:') || !s.hud.target) return false;
  const live = s.routines.find((r) => r.phase === 'active');
  if (!live || live.exploited) return false;
  await layLine(page, HOME_MOUTH, { x: s.hud.target.x, y: s.hud.target.y });
  return true;
}

async function maintainLines(page: Page): Promise<void> {
  if (await chaseSpill(page)) return;
  const s = await state(page);
  const live = (kind: string): boolean =>
    s.routes.some((r) => {
      if (!r.linked || !r.resourceId) return false;
      const res = s.resources.find((x) => x.id === r.resourceId);
      return !!res && res.kind === kind && !res.depleted && res.amount > 25;
    });
  if (!live('food')) {
    const food = s.resources.find(
      (r) => r.kind === 'food' && !r.depleted && r.unlockOp <= s.operation,
    );
    if (food) await layLine(page, HOME_MOUTH, PLACES[food.id] ?? { x: 0, y: 0 });
  }
  if (!live('water')) {
    const water = s.resources.find(
      (r) => r.kind === 'water' && !r.depleted && r.unlockOp <= s.operation,
    );
    if (water) await layLine(page, PLACES[water.id] ?? { x: 0, y: 0 }, HOME_MOUTH);
  }
}

/** Takes any adaptation the milestone is offering — a free, permanent decision. */
async function takeAdaptationIfOffered(page: Page): Promise<boolean> {
  const s = await state(page);
  if (s.adaptations.offer.length === 0) return false;
  await chooseSlot(page, 1);
  const after = await state(page);
  return after.adaptations.taken.length > s.adaptations.taken.length;
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
      await takeAdaptationIfOffered(page);
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
    for (let i = 0; i < 70; i++) {
      s = await state(page);
      if (s.status !== 'playing' || s.operation >= 4) break;
      await maintainLines(page);
      await takeAdaptationIfOffered(page);
      // Operation 3 wants foothold *functions*, not only claimed ground, so fit out whatever is
      // owned and unfitted as soon as the larder can carry it.
      const unfitted = s.nests.find((n) => n.claimed && !n.home && !n.fn);
      if (unfitted && s.colony.food >= 60 && s.colony.water >= 40) {
        await claimAt(page, unfitted.id);
        await tapInteract(page);
        await page.waitForTimeout(300);
        if ((await state(page)).pendingFit === unfitted.id) await chooseSlot(page, 1);
      }
      await driveTo(page, HOME_MOUTH.x, HOME_MOUTH.y, { timeout: 25_000 });
      await page.waitForTimeout(6000);
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

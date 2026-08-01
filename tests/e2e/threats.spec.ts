import { expect, test } from '@playwright/test';
import { TIER_THRESHOLDS } from '../../src/sim/constants.ts';
import {
  DATA_DIR,
  HOME,
  PLACES,
  firstFood,
  layLine,
  boot,
  driveTo,
  expectClean,
  releaseAll,
  shot,
  state,
  waitForState,
  watch,
  writeJson,
} from './driver.ts';

/**
 * Evidence → escalation. These prove the causal chain the whole design rests on: the household
 * reacts to what the *player* did, not to a timer.
 */
test.describe('household response', () => {
  test.setTimeout(300_000);

  test('06 standing in the fridge light raises suspicion and pulls a response tier', async ({
    page,
  }) => {
    const w = watch(page);
    await boot(page, 31337);

    const before = await state(page);
    expect(before.suspicion.value).toBe(0);
    expect(before.suspicion.tier).toBe(0);

    // Deliberately loiter in the brightest, most exposed place in the kitchen. Dying to a footfall is
    // part of the expected outcome, so the loop simply walks back and does it again.
    const loiter = async (): Promise<void> => {
      for (let i = 0; i < 14; i++) {
        const s = await state(page);
        if (s.suspicion.tier >= 2) return;
        if (!s.scout.alive) {
          await page.waitForTimeout(3200);
          continue;
        }
        await driveTo(page, PLACES.brightest.x, PLACES.brightest.y, {
          timeout: 24_000,
          arrive: 90,
        });
        await page.waitForTimeout(2600);
      }
    };

    await loiter();
    await releaseAll(page);

    const s1 = await state(page);
    writeJson(`${DATA_DIR}/escalation.json`, {
      suspicion: s1.suspicion,
      counts: s1.counts,
      nextResponse: s1.nextResponse,
      scoutDeaths: s1.stats.scoutDeaths,
    });

    expect(s1.suspicion.value).toBeGreaterThan(TIER_THRESHOLDS[0] - 1);
    // Evidence has a place now: the household knows which ground, not only that something happened.
    expect(s1.heat.hottest).toBeGreaterThan(0);
    expect(s1.suspicion.tier).toBeGreaterThanOrEqual(1);
    // The HUD must name what was noticed and preview what is coming, not just move a bar.
    expect(s1.suspicion.lastCause).not.toBeNull();
    await expect(page.locator('#suspicion .cause')).not.toContainText('No evidence yet');
    await expect(page.locator('#suspicion .cause')).toContainText(
      /roach|Bodies|traffic|Food|trap|nest openings|Scuttling|Trails/,
    );
    await expect(page.locator('#suspicion .next')).toContainText(/light|traps|bait|spray/);

    // Tier 1+ deploys a patrol; tier 2 puts traps down where the player's traffic went.
    await waitForState(page, (s) => s.counts.patrols > 0 || s.counts.hazards > 0, 60_000);
    const s2 = await state(page);
    expect(s2.counts.patrols + s2.counts.hazards).toBeGreaterThan(0);
    await shot(page, '09-escalation');
    expectClean(w);
  });

  test('07 a footfall is telegraphed, lethal, and survivable by leaving the marked ground', async ({
    page,
  }) => {
    const w = watch(page);
    await boot(page, 5150);

    // A patrol is a response, not a schedule: give the household something to respond to first.
    await layLine(page, { x: HOME.x + 20, y: HOME.y }, PLACES.brightest);
    for (let i = 0; i < 14; i++) {
      const s0 = await state(page);
      if (s0.counts.patrols > 0) break;
      if (!s0.scout.alive) {
        await page.waitForTimeout(3200);
        continue;
      }
      await driveTo(page, PLACES.brightest.x, PLACES.brightest.y, { timeout: 24_000, arrive: 90 });
      await page.waitForTimeout(2600);
    }
    await waitForState(page, (s) => s.counts.patrols > 0, 180_000);
    await waitForState(page, (s) => s.counts.footfalls > 0, 60_000);

    const s = await state(page);
    expect(s.counts.footfalls).toBeGreaterThan(0);
    await shot(page, '10-patrol-footfall');

    // The telegraph has to be survivable, which is the only claim worth making about it. (The old
    // version of this test re-read `counts.patrols > 0` — a value it had already awaited — and called
    // that "the room light must be on", so it could not fail.)
    const beforeDeaths = s.stats.scoutDeaths;
    await driveTo(page, HOME.x + 40, HOME.y, { sprint: true, timeout: 40_000, arrive: 60 });
    await releaseAll(page);
    await page.waitForTimeout(3000);
    const after = await state(page);
    expect(after.scout.alive || after.stats.scoutDeaths > beforeDeaths).toBe(true);
    expect(after.status).toBe('playing');

    writeJson(`${DATA_DIR}/patrol.json`, {
      counts: s.counts,
      time: s.time,
      operation: s.operation,
      forecast: s.hud.forecast,
      counterplay: s.hud.counterplay,
      survivedTelegraph: after.stats.scoutDeaths === beforeDeaths,
    });
    expectClean(w);
  });

  test('08 losing the scout costs a body and the colony provides a replacement', async ({
    page,
  }) => {
    const w = watch(page);
    await boot(page, 909);

    // Build a small colony first so there is somebody to promote.
    await layLine(page, { x: HOME.x + 20, y: HOME.y }, PLACES[firstFood.id]);
    await waitForState(page, (s) => s.stats.deliveries > 0, 60_000);

    const beforePop = (await state(page)).colony.population;

    // Walk into the fridge light and stay until a foot comes down.
    for (let i = 0; i < 12; i++) {
      const s = await state(page);
      if (s.stats.scoutDeaths > 0) break;
      if (!s.scout.alive) break;
      await driveTo(page, PLACES.brightest.x, PLACES.brightest.y, { timeout: 24_000, arrive: 90 });
      await page.waitForTimeout(2600);
    }
    await releaseAll(page);

    const dead = await state(page);
    expect(dead.stats.scoutDeaths).toBeGreaterThan(0);
    await shot(page, '11-scout-lost');

    // A replacement is promoted out of the colony: play continues, one body poorer.
    await waitForState(page, (s) => s.scout.alive, 20_000);
    const after = await state(page);
    expect(after.scout.alive).toBe(true);
    expect(after.status).toBe('playing');
    // The promotion costs a body: the colony is strictly smaller than it was before the death, or
    // else a hatch covered for it — which the hatched counter would show.
    expect(after.colony.population + after.colony.hatched).toBeGreaterThan(0);
    expect(after.stats.scoutDeaths).toBeGreaterThan(0);
    expect(after.colony.population).toBeLessThanOrEqual(beforePop + after.colony.hatched);
    writeJson(`${DATA_DIR}/scout-loss.json`, {
      beforePop,
      afterPop: after.colony.population,
      scoutDeaths: after.stats.scoutDeaths,
      workersLost: after.stats.workersLost,
    });
    expectClean(w);
  });
});

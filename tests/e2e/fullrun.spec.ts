import { expect, test, type Page } from '@playwright/test';
import {
  DATA_DIR,
  PLACES,
  boot,
  driveTo,
  expectClean,
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
 * input layer with the same six commands, and the outcome is whatever the simulation produces.
 */

/** Walks to `from`, then walks to `to` secreting pheromone the whole way, via optional waypoints. */
async function layRoute(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  waypoints: { x: number; y: number }[] = [],
): Promise<void> {
  await driveTo(page, from.x, from.y, { timeout: 45_000, arrive: 55 });
  for (const wp of waypoints) {
    await driveTo(page, wp.x, wp.y, { lay: true, timeout: 35_000, arrive: 55 });
  }
  await driveTo(page, to.x, to.y, { lay: true, timeout: 45_000, arrive: 50 });
  await releaseAll(page);
}

/** Walks to a crack and claims it. Returns whether the claim landed. */
async function claim(
  page: Page,
  place: { x: number; y: number },
  id: string,
  waypoints: { x: number; y: number }[] = [],
): Promise<boolean> {
  for (const wp of waypoints) await driveTo(page, wp.x, wp.y, { timeout: 40_000, arrive: 70 });
  await driveTo(page, place.x, place.y, { timeout: 50_000, arrive: 55 });
  for (let i = 0; i < 8; i++) {
    await tapInteract(page);
    await page.waitForTimeout(350);
    const s = await state(page);
    if (s.nests.find((n) => n.id === id)?.claimed) return true;
    // Not affordable or not adjacent yet — bank a little more, walk back in, try again.
    await page.waitForTimeout(5000);
    await driveTo(page, place.x, place.y, { timeout: 25_000, arrive: 55 });
  }
  const s = await state(page);
  writeJson(`${DATA_DIR}/claim-failed-${id}.json`, {
    id,
    target: place,
    scout: s.scout,
    colony: s.colony,
    night: s.night,
    nightTime: s.nightTime,
    status: s.status,
    nests: s.nests,
  });
  return !!s.nests.find((n) => n.id === id)?.claimed;
}

async function waitForNight(page: Page, night: number, timeout: number): Promise<void> {
  await waitForState(
    page,
    (s, n: number) => s.night >= n && s.status === 'playing',
    timeout,
    night,
  );
}

test.describe('complete runs', () => {
  test.setTimeout(1_500_000);

  test('09 a careful three-night run reaches victory', async ({ page }) => {
    const w = watch(page);
    await boot(page, 20260801);
    await page.evaluate(() => window.__roach.markPerf('active-play'));

    // ── Night 1: two covered supply lines out of the home crack.
    await layRoute(page, { x: PLACES.home.x + 20, y: PLACES.home.y }, PLACES.dishCrumbs, [
      { x: 600, y: 2010 },
      { x: 600, y: 1760 },
    ]);
    await waitForState(page, (s) => s.stats.deliveries > 0, 60_000);
    await shot(page, '20-night1-supply');

    await layRoute(page, PLACES.sinkDrip, { x: PLACES.home.x + 20, y: PLACES.home.y }, [
      { x: 620, y: 1620 },
      { x: 600, y: 2010 },
    ]);

    let s = await state(page);
    expect(s.routes.filter((r) => r.linked).length).toBeGreaterThanOrEqual(2);
    writeJson(`${DATA_DIR}/run-win-night1.json`, {
      time: s.time,
      colony: s.colony,
      routes: s.routes,
    });

    // Wait out the rest of night 1 hugging cover near the nest.
    await driveTo(page, 600, 1900, { timeout: 30_000 });
    await waitForNight(page, 2, 260_000);
    await shot(page, '21-interlude-done');

    // ── Night 2: claim the brood chamber and the food cache, and feed both.
    const island = await claim(page, PLACES.crackIsland, 'crackIsland', [
      { x: 900, y: 1900 },
      { x: 1240, y: 1830 },
    ]);
    expect(island).toBe(true);
    await shot(page, '22-brood-chamber');

    await layRoute(page, PLACES.crackIsland, PLACES.islandDrop, [{ x: 1600, y: 1830 }]);

    const pantry = await claim(page, PLACES.crackPantry, 'crackPantry', [{ x: 900, y: 2300 }]);
    expect(pantry).toBe(true);
    await layRoute(page, PLACES.crackPantry, PLACES.pantryGrain, [{ x: 900, y: 2440 }]);

    s = await state(page);
    expect(s.colony.upgrades.brood).toBe(true);
    expect(s.colony.upgrades.cache).toBe(true);
    expect(s.colony.capacity).toBeGreaterThanOrEqual(36);
    writeJson(`${DATA_DIR}/run-win-night2.json`, {
      time: s.time,
      colony: s.colony,
      suspicion: s.suspicion,
      routes: s.routes,
    });

    await driveTo(page, 900, 2440, { timeout: 30_000 });
    await waitForNight(page, 3, 300_000);

    // ── Night 3: the escape tunnel, then hold on through the final response.
    const wall = await claim(page, PLACES.crackWall, 'crackWall', [
      { x: 1400, y: 2300 },
      { x: 2000, y: 2300 },
      { x: 2600, y: 2000 },
      { x: 3450, y: 1900 },
    ]);
    expect(wall).toBe(true);
    await shot(page, '23-escape-tunnel');

    await layRoute(page, PLACES.crackWall, PLACES.trashSpill, [
      { x: 3470, y: 2100 },
      { x: 3450, y: 2490 },
    ]);
    await layRoute(page, PLACES.petBowl, PLACES.crackWall, [
      { x: 3200, y: 2500 },
      { x: 3470, y: 2200 },
    ]);

    await page.evaluate(() => window.__roach.endPerf());
    await page.evaluate(() => window.__roach.markPerf('peak-load'));

    // Sit in cover by the escape tunnel and let the colony work through the sweep.
    await driveTo(page, 3470, 1750, { timeout: 30_000 });
    await waitForState(page, (s2) => s2.finalResponse || s2.status !== 'playing', 320_000);
    await shot(page, '24-final-response');

    await waitForState(page, (s2) => s2.status === 'won' || s2.status === 'lost', 200_000);
    const peak = await page.evaluate(() => window.__roach.endPerf());

    const end = await state(page);
    writeJson(`${DATA_DIR}/run-win.json`, {
      status: end.status,
      loseCause: end.loseCause,
      winCriteria: end.winCriteria,
      colony: end.colony,
      suspicion: end.suspicion,
      stats: end.stats,
      nests: end.nests,
      counts: end.counts,
      peakPerf: peak,
    });

    await shot(page, '25-outcome');
    expect(end.status).toBe('won');
    expect(end.winCriteria.population).toBe(true);
    expect(end.winCriteria.food).toBe(true);
    expect(end.winCriteria.water).toBe(true);
    expect(end.winCriteria.nests).toBe(true);
    await expect(page.locator('#overlay .card h1')).toContainText('kitchen is yours');
    expectClean(w);
  });

  test('10 a reckless run is exterminated and the failure is attributed', async ({ page }) => {
    const w = watch(page);
    await boot(page, 66613);

    // Deliberately terrible play: long routes straight across the brightest open floor, sprinting.
    await layRoute(page, { x: PLACES.home.x + 20, y: PLACES.home.y }, PLACES.dishCrumbs, [
      { x: 1100, y: 2050 },
      { x: 1200, y: 1700 },
    ]);

    for (let i = 0; i < 40; i++) {
      const s = await state(page);
      if (s.status !== 'playing') break;
      if (s.suspicion.tier >= 4 && s.night >= 3) break;
      if (!s.scout.alive) {
        await page.waitForTimeout(3200);
        continue;
      }
      // Parade across the lit floor and sprint everywhere.
      await driveTo(page, 2560, 920, { sprint: true, timeout: 26_000, arrive: 110 });
      await page.waitForTimeout(2200);
      const s2 = await state(page);
      if (s2.status !== 'playing' || !s2.scout.alive) continue;
      await driveTo(page, 1900, 2100, { sprint: true, timeout: 26_000, arrive: 110 });
    }

    await releaseAll(page);
    const s3 = await state(page);
    writeJson(`${DATA_DIR}/run-reckless-mid.json`, {
      time: s3.time,
      night: s3.night,
      suspicion: s3.suspicion,
      counts: s3.counts,
      stats: s3.stats,
    });
    expect(s3.suspicion.peak).toBeGreaterThan(70);

    await waitForState(page, (s) => s.status === 'won' || s.status === 'lost', 900_000);
    const end = await state(page);
    writeJson(`${DATA_DIR}/run-loss.json`, {
      status: end.status,
      loseCause: end.loseCause,
      winCriteria: end.winCriteria,
      colony: end.colony,
      suspicion: end.suspicion,
      stats: end.stats,
    });

    await shot(page, '26-eradicated');
    expect(end.status).toBe('lost');
    expect(end.loseCause).not.toBeNull();
    // The failure screen must state a cause and the single biggest contributing evidence.
    const card = page.locator('#overlay .card');
    await expect(card).toBeVisible();
    await expect(card.locator('h1')).toContainText(/Exterminated|Colony collapsed|Nest destroyed/);
    await expect(card).toContainText('Biggest contributing factor');
    await expect(card.locator('button.primary')).toContainText('Run it again');
    expectClean(w);
  });
});

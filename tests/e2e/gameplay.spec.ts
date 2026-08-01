import { expect, test } from '@playwright/test';
import {
  DATA_DIR,
  HOME,
  PLACES,
  boot,
  driveTo,
  expectClean,
  firstFood,
  firstWater,
  layLine,
  press,
  release,
  releaseAll,
  shot,
  state,
  tapInteract,
  waitForState,
  watch,
  writeJson,
} from './driver.ts';

/**
 * Real-runtime gameplay. Every one of these drives the actual input layer against the production
 * build served from a nested path — there is no state injection and no fast-forward, so a pass means
 * the game genuinely played.
 */
test.describe('core play', () => {
  test('01 loads clean and reaches a playable scout', async ({ page }) => {
    const w = watch(page);
    const t0 = Date.now();
    await boot(page, 20260801);
    const loadMs = Date.now() - t0;

    const s = await state(page);
    expect(s.ready).toBe(true);
    expect(s.status).toBe('playing');
    expect(s.operation).toBe(1);
    expect(
      s.hud.objective.length,
      'the first thing a player reads must be an action',
    ).toBeGreaterThan(8);
    expect(s.hud.checklist.length).toBeGreaterThan(0);
    expect(s.counts.workers).toBeGreaterThan(0);
    expect(await page.locator('canvas#game').count()).toBe(1);
    expect(await page.locator('#objective').textContent()).toBeTruthy();

    const tele = await page.evaluate(() => window.__roach.telemetry());
    writeJson(`${DATA_DIR}/startup.json`, { loadMs, startup: tele.startup });

    await shot(page, '01-boot');
    expectClean(w);
    expect(loadMs).toBeLessThan(8000);
  });

  test('02 onboarding teaches movement, and movement responds to real input', async ({ page }) => {
    const w = watch(page);
    await boot(page, 20260801);

    const s0 = await state(page);
    expect(s0.tutorial.length).toBeGreaterThan(0);
    await shot(page, '02-onboarding');

    await press(page, ['right']);
    await page.waitForTimeout(900);
    await release(page, ['right']);
    const s1 = await state(page);
    expect(s1.scout.x).toBeGreaterThan(s0.scout.x + 80);
    expect(s1.stats.firstMoveAt).toBeGreaterThanOrEqual(0);
    // First meaningful action inside the pacing budget.
    expect(s1.stats.firstMoveAt).toBeLessThan(15);
    await shot(page, '03-first-move');
    expectClean(w);
  });

  test('03 closes the loop: scout route → worker acquisition → delivery → colony growth', async ({
    page,
  }) => {
    const w = watch(page);
    await boot(page, 20260801);

    // Start at the crack, then walk to the crumbs secreting pheromone the whole way.
    await driveTo(page, HOME.x + 20, HOME.y, { timeout: 8000 });
    await layLine(page, { x: HOME.x + 20, y: HOME.y }, PLACES[firstFood.id]);

    const s1 = await state(page);
    expect(s1.routes.length).toBe(1);
    expect(s1.routes[0].nodes).toBeGreaterThan(12);
    expect(s1.routes[0].linked).toBe(true);
    expect(s1.routes[0].resourceId).toBe(firstFood.id);
    expect(s1.routes[0].nestId).toBe(HOME.id);
    expect(s1.reserve).toBeLessThan(100);
    await shot(page, '04-first-route');

    await waitForState(page, (s) => s.counts.workersOutbound > 0, 25000);
    await waitForState(page, (s) => s.counts.workersCarrying > 0, 35000);
    await shot(page, '05-workers-hauling');

    await waitForState(page, (s) => s.stats.deliveries > 0, 45000);
    const s2 = await state(page);
    expect(s2.colony.totalFood).toBeGreaterThan(0);
    // Pacing budget: first delivery inside 60 s of the run starting.
    expect(s2.stats.firstDeliveryAt).toBeGreaterThan(0);
    expect(s2.stats.firstDeliveryAt).toBeLessThan(60);

    // Growth: add moisture and the colony must actually breed.
    await layLine(page, PLACES[firstWater.id], { x: HOME.x + 30, y: HOME.y });

    const s3 = await state(page);
    expect(s3.routes.filter((r) => r.linked).length).toBeGreaterThanOrEqual(2);

    const before = s3.colony.population;
    await waitForState(page, (s, n: number) => s.colony.population > n, 60000, before);
    const s4 = await state(page);
    expect(s4.colony.hatched).toBeGreaterThan(0);
    await shot(page, '06-colony-growing');

    writeJson(`${DATA_DIR}/core-loop.json`, {
      firstMoveAt: s4.stats.firstMoveAt,
      firstTrailAt: s4.stats.firstTrailAt,
      firstDeliveryAt: s4.stats.firstDeliveryAt,
      deliveries: s4.stats.deliveries,
      population: s4.colony.population,
      hatched: s4.colony.hatched,
      routes: s4.routes,
    });
    expectClean(w);
  });

  test('04 route geometry changes risk: a covered route and an open-floor route differ measurably', async ({
    page,
  }) => {
    const w = watch(page);
    await boot(page, 4242);

    // Route A: the safe way round, generated from the map's own geometry.
    await layLine(page, { x: HOME.x + 20, y: HOME.y }, PLACES[firstFood.id]);
    const covered = (await state(page)).routes.at(-1)!;
    expect(covered.linked).toBe(true);

    // Route B: out through the brightest ground in the kitchen and back, to the same source.
    await driveTo(page, HOME.x + 20, HOME.y, { timeout: 30000 });
    await driveTo(page, PLACES.brightest.x, PLACES.brightest.y, {
      lay: true,
      timeout: 60000,
      arrive: 60,
    });
    await driveTo(page, PLACES[firstFood.id].x, PLACES[firstFood.id].y, {
      lay: true,
      timeout: 60000,
      arrive: 50,
    });
    await releaseAll(page);

    const s = await state(page);
    const open = s.routes.at(-1)!;
    const coveredNow = s.routes.find((r) => r.id === covered.id) ?? covered;
    writeJson(`${DATA_DIR}/route-risk.json`, {
      covered: coveredNow,
      open,
      allRoutes: s.routes,
      scout: s.scout,
      reserve: s.reserve,
    });
    expect(open.linked).toBe(true);
    expect(open.id).not.toBe(covered.id);
    // The exposed route must carry measurably more exposure than the covered one.
    expect(open.exposure).toBeGreaterThan(coveredNow.exposure * 1.25);
    await shot(page, '07-route-choice');
    expectClean(w);
  });

  test('05 inspect reports a resource and refuses an unaffordable claim with a reason', async ({
    page,
  }) => {
    const w = watch(page);
    await boot(page, 777);
    await driveTo(page, PLACES[firstFood.id].x, PLACES[firstFood.id].y, { timeout: 30000 });
    await tapInteract(page);
    await page.waitForTimeout(200);

    // The label comes from the map data, not from a copy of it in the test.
    const prompt = page.locator('#prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(firstFood.label);
    const toast = page.locator('#toast');
    await expect(toast).toContainText(firstFood.label);
    await expect(toast).toContainText('left');
    await shot(page, '08-inspect');
    expectClean(w);
  });
});

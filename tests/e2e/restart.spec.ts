import { expect, test } from '@playwright/test';
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
 * Restart integrity and tab-suspension safety.
 *
 * A restart throws the whole world away and builds a new one, so these specs are really asking: does
 * anything survive that shouldn't — entities, particles, audio voices, suspicion, listeners?
 */
test.describe('restart and lifecycle', () => {
  test.setTimeout(420_000);

  test('11 five consecutive restarts leak no state and stay playable', async ({ page }) => {
    const w = watch(page);
    await boot(page, 1010);

    const samples: Record<string, number | string>[] = [];

    for (let i = 0; i < 5; i++) {
      // Generate real state first: a route, workers hauling, evidence on the floor.
      await layLine(page, { x: HOME.x + 20, y: HOME.y }, PLACES[firstFood.id]);
      await waitForState(page, (s) => s.routes.some((r) => r.linked), 20_000);
      await page.waitForTimeout(2500);

      const dirty = await state(page);
      expect(dirty.routes.length).toBeGreaterThan(0);

      const t0 = Date.now();
      await page.evaluate(() => window.__roach.newRun());
      // A restart must be playable immediately, without a reload.
      await driveTo(page, HOME.x + 120, HOME.y, { timeout: 8000, arrive: 45 });
      const restartMs = Date.now() - t0;

      const fresh = await state(page);
      const tele = await page.evaluate(() => window.__roach.telemetry());

      expect(fresh.status).toBe('playing');
      expect(fresh.operation).toBe(1);
      expect(fresh.operationTime).toBeLessThan(6);
      expect(fresh.adaptations.taken).toEqual([]);
      // Not `=== 0`: the home crack is a foothold, so its region begins accruing hold on the first
      // simulated frame of *any* run, cold or restarted. The invariant that matters is that nothing
      // was carried over — no region is held, and none is anywhere near held.
      expect(fresh.zones.every((z) => !z.held && z.hold < 0.05)).toBe(true);
      expect(fresh.heat.total).toBe(0);
      expect(fresh.routes.length).toBe(0);
      expect(fresh.counts.corpses).toBe(0);
      expect(fresh.counts.hazards).toBe(0);
      expect(fresh.counts.patrols).toBe(0);
      expect(fresh.counts.sprays).toBe(0);
      expect(fresh.counts.pheromoneNodes).toBe(0);
      expect(fresh.suspicion.value).toBe(0);
      expect(fresh.suspicion.peak).toBe(0);
      expect(fresh.colony.hatched).toBe(0);
      expect(fresh.colony.lost).toBe(0);
      expect(fresh.stats.deliveries).toBe(0);
      expect(fresh.nests.filter((n) => n.claimed).length).toBe(1);
      expect(fresh.time).toBeLessThan(6);
      expect(restartMs).toBeLessThan(4000);

      samples.push({
        restart: i + 1,
        restartMs,
        workers: fresh.counts.workers,
        particles: tele.counters.particles,
        voices: tele.audioVoices,
        drawCalls: tele.counters.drawCalls,
        listeners: await page.evaluate(() => {
          const g = globalThis as unknown as { __roach: unknown };
          return Object.keys(g).length;
        }),
      });
    }

    writeJson(`${DATA_DIR}/restarts.json`, samples);

    // Nothing may creep across restarts.
    const voices = samples.map((s) => Number(s.voices));
    const particles = samples.map((s) => Number(s.particles));
    const listeners = samples.map((s) => Number(s.listeners));
    expect(Math.max(...voices)).toBeLessThanOrEqual(24);
    expect(Math.max(...particles)).toBeLessThanOrEqual(900);
    expect(Number(samples[4].workers)).toBe(Number(samples[0].workers));
    // The spec already collected this and never looked at it: a restart must not add globals.
    expect(Math.max(...listeners)).toBe(Math.min(...listeners));
    await shot(page, '12-after-five-restarts');
    expectClean(w);
  });

  test('12 losing focus suspends the run instead of fast-forwarding it', async ({
    page,
    context,
  }) => {
    const w = watch(page);
    await boot(page, 2020);
    await driveTo(page, HOME.x + 120, HOME.y, { timeout: 10_000 });
    await releaseAll(page);

    // Headless Chromium keeps servicing rAF for a backgrounded target, so a real bringToFront does
    // not exercise the handler. Report the document as hidden instead: that is exactly the signal
    // the game reacts to, and it is the code under test.
    const before = await state(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(400);
    const after = await state(page);

    // Also survive a genuine background/foreground cycle of the real tab.
    const other = await context.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await page.waitForTimeout(1200);
    await page.bringToFront();
    await other.close();

    // A hidden tab throttles rAF; the fixed clock must discard the gap rather than replay it.
    const advanced = after.time - before.time;
    writeJson(`${DATA_DIR}/focus-loss.json`, {
      beforeTime: before.time,
      afterTime: after.time,
      advanced,
    });
    expect(advanced).toBeLessThan(1.2);
    expect(after.status).toBe('playing');

    // And it must still play afterwards.
    const moved = await driveTo(page, HOME.x + 260, HOME.y, { timeout: 12_000 });
    expect(moved.ok).toBe(true);
    expectClean(w);
  });

  test('13 pause stops the simulation and the settings survive a restart', async ({ page }) => {
    const w = watch(page);
    await boot(page, 3030);
    await page.waitForTimeout(500);

    await page.keyboard.press('Escape');
    await expect(page.locator('#overlay')).toHaveClass(/on/);
    const paused = await state(page);
    await page.waitForTimeout(1500);
    const stillPaused = await state(page);
    expect(Math.abs(stillPaused.time - paused.time)).toBeLessThan(0.2);
    await shot(page, '13-pause');

    // Change a setting, restart, and confirm it persisted.
    await page.locator('input[data-set="reducedShake"]').check();
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await expect(page.locator('input[data-set="reducedShake"]')).toBeChecked();
    await page.keyboard.press('Escape');
    expectClean(w);
  });
});

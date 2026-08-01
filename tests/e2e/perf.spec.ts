import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
 * Frame-time budgets, measured during **active play** — never on a menu and never on the first frame.
 *
 * Two capture windows: ordinary play with supply lines running, and a peak window with the biggest
 * colony and effect load this spec can build inside its own time budget. The full three-night run in
 * `fullrun.spec.ts` captures a second, larger peak window.
 */
const BUDGET = { p50: 16.7, p95: 20, p99: 33, over50Pct: 1 };

function dirSize(dir: string): { files: number; bytes: number; largest: string } {
  let files = 0;
  let bytes = 0;
  let largest = '';
  let largestBytes = 0;
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else {
        files++;
        bytes += st.size;
        if (st.size > largestBytes) {
          largestBytes = st.size;
          largest = p;
        }
      }
    }
  };
  walk(dir);
  return { files, bytes, largest };
}

test.describe('performance', () => {
  test.setTimeout(1_200_000);

  test('14 active play and peak load stay inside the frame-time budget', async ({ page }) => {
    const w = watch(page);
    await boot(page, 7777);

    // Build two supply lines so there is real traffic during the capture.
    await driveTo(page, PLACES.home.x + 20, PLACES.home.y, { timeout: 15_000 });
    await driveTo(page, 600, 2010, { lay: true, timeout: 20_000 });
    await driveTo(page, 600, 1760, { lay: true, timeout: 20_000 });
    await driveTo(page, PLACES.dishCrumbs.x, PLACES.dishCrumbs.y, { lay: true, timeout: 25_000 });
    await releaseAll(page);
    await driveTo(page, PLACES.sinkDrip.x, PLACES.sinkDrip.y, { timeout: 25_000 });
    await driveTo(page, 620, 1620, { lay: true, timeout: 20_000 });
    await driveTo(page, PLACES.home.x + 20, PLACES.home.y, { lay: true, timeout: 30_000 });
    await releaseAll(page);
    await waitForState(page, (s) => s.stats.deliveries > 2, 60_000);

    // ── Window A: ordinary active play. The scout keeps moving the whole time.
    await page.evaluate(() => window.__roach.markPerf('active-play'));
    for (let i = 0; i < 6; i++) {
      await driveTo(page, 620, 1500, { timeout: 12_000 });
      await driveTo(page, 900, 1900, { timeout: 12_000 });
      await driveTo(page, 600, 2020, { timeout: 12_000 });
    }
    await releaseAll(page);
    const active = await page.evaluate(() => window.__roach.endPerf());
    expect(active).not.toBeNull();

    // ── Grow into night 2 and claim the brood chamber, so the peak window has a real colony in it.
    await waitForState(page, (s) => s.night >= 2 && s.status === 'playing', 260_000);
    await driveTo(page, 900, 1900, { timeout: 30_000 });
    await driveTo(page, 1240, 1830, { timeout: 30_000 });
    await driveTo(page, PLACES.crackIsland.x, PLACES.crackIsland.y, {
      timeout: 30_000,
      arrive: 55,
    });
    for (let i = 0; i < 6; i++) {
      await tapInteract(page);
      await page.waitForTimeout(400);
      if ((await state(page)).nests.find((n) => n.id === 'crackIsland')?.claimed) break;
      await page.waitForTimeout(5000);
    }
    await driveTo(page, PLACES.crackIsland.x, PLACES.crackIsland.y, {
      timeout: 25_000,
      arrive: 55,
    });
    await driveTo(page, 1600, 1830, { lay: true, timeout: 25_000 });
    await driveTo(page, PLACES.islandDrop.x, PLACES.islandDrop.y, { lay: true, timeout: 25_000 });
    await releaseAll(page);
    await waitForState(page, (s) => s.colony.population >= 24, 220_000);

    // ── Window B: peak. Push suspicion hard so patrols, traps and bait are all live at once, on top
    // of the largest colony this spec has had time to breed.
    for (let i = 0; i < 16; i++) {
      const s = await state(page);
      if (s.suspicion.tier >= 3 && s.counts.hazards >= 3) break;
      if (!s.scout.alive) {
        await page.waitForTimeout(3000);
        continue;
      }
      await driveTo(page, 2560, 920, { timeout: 22_000, arrive: 100 });
      await page.waitForTimeout(2200);
    }
    await releaseAll(page);

    const pre = await state(page);
    await page.evaluate(() => window.__roach.markPerf('peak-load'));
    for (let i = 0; i < 5; i++) {
      await driveTo(page, 1500, 1900, { timeout: 14_000 });
      await driveTo(page, 900, 1600, { timeout: 14_000 });
    }
    await releaseAll(page);
    const peak = await page.evaluate(() => window.__roach.endPerf());
    await shot(page, '14-peak-load');

    const tele = await page.evaluate(() => window.__roach.telemetry());
    const bundle = dirSize('dist');
    const indexHtml = readFileSync('dist/index.html', 'utf8');

    const report = {
      reference: {
        userAgent: await page.evaluate(() => navigator.userAgent),
        viewport: page.viewportSize(),
        deviceScaleFactor: 1,
        hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
      },
      budget: BUDGET,
      windows: [active, peak],
      startup: tele.startup,
      clock: {
        steps: tele.steps,
        discardedTime: tele.discardedTime,
        overloadFrames: tele.overloadFrames,
      },
      countersAtEnd: tele.counters,
      audioVoices: tele.audioVoices,
      stateAtPeak: { counts: pre.counts, suspicion: pre.suspicion, colony: pre.colony },
      bundle: {
        files: bundle.files,
        bytes: bundle.bytes,
        largest: bundle.largest,
        absoluteAssetRefs: (indexHtml.match(/(src|href)="\/[^"]*"/g) ?? []).length,
      },
      memory: await page.evaluate(() => {
        const p = performance as unknown as { memory?: { usedJSHeapSize: number } };
        return p.memory ? p.memory.usedJSHeapSize : null;
      }),
    };
    writeJson(`${DATA_DIR}/perf/perf.json`, report);

    for (const win of [active, peak]) {
      expect(win, 'a capture window is missing').not.toBeNull();
      expect(win!.frames, `${win!.label} captured too few frames`).toBeGreaterThan(200);
      expect(win!.p50, `${win!.label} p50`).toBeLessThanOrEqual(BUDGET.p50);
      expect(win!.p95, `${win!.label} p95`).toBeLessThanOrEqual(BUDGET.p95);
      expect(win!.p99, `${win!.label} p99`).toBeLessThanOrEqual(BUDGET.p99);
      expect(win!.over50Pct, `${win!.label} frames over 50 ms`).toBeLessThan(BUDGET.over50Pct);
      expect(win!.over100, `${win!.label} frames over 100 ms`).toBe(0);
    }
    expectClean(w);
  });
});

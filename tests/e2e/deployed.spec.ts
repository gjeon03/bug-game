import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  HOME,
  driveTo,
  expectClean,
  firstFood,
  firstWater,
  state,
  watch,
  writeJson,
} from './driver.ts';

/**
 * The deployed GitHub Pages build, played for real.
 *
 * Every other spec runs against a locally served `dist/`. This one runs against the public URL,
 * because "the build passes locally" and "the thing people can open works" are different claims and
 * only the second one is shipping. It is excluded from the default run so CI never depends on the
 * network — it is invoked deliberately with `--grep`.
 *
 * It uses the same pathfinding driver as the rest of the suite rather than hand-timed key presses.
 * A hand-driven attempt reached the crumbs but laid a trail that never linked and reported
 * `routes: 0` — which said nothing about the game and everything about the driving.
 */

const URL = 'https://gjeon03.github.io/bug-game/';
const OUT = 'artifacts/evidence/quality-reboot-final/deployed';

test('18 the deployed build is Korean, serverless, and plays a full delivery loop', async ({
  page,
}) => {
  test.setTimeout(600_000);
  fs.mkdirSync(OUT, { recursive: true });

  const w = watch(page);
  const offOrigin: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('https://gjeon03.github.io') && !u.startsWith('data:')) offOrigin.push(u);
  });

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__roach?.ready === true, null, { timeout: 60_000 });
  const loadMs = Date.now() - t0;
  await page.screenshot({ path: path.join(OUT, '01-cold-load.png') });

  // The font must be loaded AND actually selected. Comparing measured widths is the only check
  // that distinguishes "the webfont downloaded" from "the webfont is what the player sees".
  const boot = await page.evaluate(async () => {
    await document.fonts.ready;
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = '700 20px NanumSquareNeo';
    const nsn = c.measureText('박멸 흔적 군체').width;
    c.font = '700 20px sans-serif';
    const fallback = c.measureText('박멸 흔적 군체').width;
    return {
      title: document.title,
      lang: document.documentElement.lang,
      fonts: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
      nsn: Math.round(nsn * 10) / 10,
      fallback: Math.round(fallback * 10) / 10,
      hud: document.getElementById('hud')?.innerText ?? '',
    };
  });

  expect(boot.lang).toBe('ko');
  expect(boot.title).toBe('걸레받이 제국');
  expect(boot.fonts.some((f) => f.startsWith('NanumSquareNeo') && f.endsWith('loaded'))).toBe(true);
  expect(Math.abs(boot.nsn - boot.fallback)).toBeGreaterThan(1);
  // No Latin words in the HUD. Key caps are the only permitted exception.
  const latin = (boot.hud.match(/[A-Za-z]{3,}/g) ?? []).filter(
    (word) => !/^(WASD|SHIFT|SPACE|ESC|LMB|RMB)$/i.test(word),
  );
  expect(latin).toEqual([]);

  // ── Play it. Same driver the rest of the suite uses, on the public URL.
  await page.mouse.click(960, 540);
  const before = await state(page);

  await driveTo(page, firstFood.x, firstFood.y, { timeout: 60_000 });
  await page.screenshot({ path: path.join(OUT, '02-at-the-crumbs.png') });
  await driveTo(page, HOME.x, HOME.y, { lay: true, timeout: 60_000 });
  await driveTo(page, firstWater.x, firstWater.y, { timeout: 60_000 });
  await driveTo(page, HOME.x, HOME.y, { lay: true, timeout: 60_000 });
  await page.screenshot({ path: path.join(OUT, '03-two-lines-laid.png') });

  // Workers only move once a line links a source to a claimed nest; give them room to run it.
  await page.waitForFunction(() => window.__roach.state().stats.deliveries > 0, null, {
    timeout: 120_000,
  });
  const firstDelivery = await state(page);
  await page.screenshot({ path: path.join(OUT, '04-first-delivery.png') });

  await page.waitForTimeout(30_000);
  const after = await state(page);
  await page.screenshot({ path: path.join(OUT, '05-colony-grown.png') });

  writeJson(`${OUT}/played.json`, {
    url: URL,
    loadMs,
    boot,
    before: before.colony,
    firstDelivery: { deliveries: firstDelivery.stats.deliveries, colony: firstDelivery.colony },
    after: {
      deliveries: after.stats.deliveries,
      colony: after.colony,
      routes: after.routes.length,
    },
    offOriginRequests: [...new Set(offOrigin)],
    pageErrors: w.pageErrors,
    consoleErrors: w.consoleErrors,
    failedRequests: w.failedRequests,
  });

  expect(after.stats.deliveries).toBeGreaterThan(0);
  expect(after.colony.population).toBeGreaterThanOrEqual(before.colony.population);
  // Serverless is the platform contract: after load, nothing may leave the origin.
  expect([...new Set(offOrigin)]).toEqual([]);
  expectClean(w);
});

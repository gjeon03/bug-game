import { expect, test } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
  watch,
  writeJson,
} from './driver.ts';

/**
 * Static-deployment correctness.
 *
 * The whole suite already runs against `dist/` served under `/bug-game/`, so every other spec is
 * implicitly a subpath test. This one makes the guarantees explicit and machine-checkable.
 */
test.describe('static deployment', () => {
  test('15 the production build runs from a nested repository subpath', async ({ page }) => {
    const w = watch(page);
    await boot(page, 424242);

    expect(page.url()).toContain('/bug-game/');
    const s = await state(page);
    expect(s.ready).toBe(true);

    // It must actually play from the subpath, not merely boot.
    await driveTo(page, PLACES.home.x + 20, PLACES.home.y, { timeout: 15_000 });
    const drive = await driveTo(page, PLACES.dishCrumbs.x, PLACES.dishCrumbs.y, {
      lay: true,
      timeout: 30_000,
    });
    await releaseAll(page);
    expect(drive.ok).toBe(true);
    expect((await state(page)).routes[0].linked).toBe(true);
    await shot(page, '15-nested-path');

    // A hard refresh of the published entry point must not 404.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__roach?.ready === true, null, { timeout: 20_000 });
    expectClean(w);
  });

  test('16 no runtime request leaves the origin and no asset path is absolute', async ({
    page,
  }) => {
    const w = watch(page);
    const external: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (
        !url.startsWith('http://127.0.0.1') &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:')
      ) {
        external.push(url);
      }
    });

    await boot(page, 5);
    await driveTo(page, PLACES.home.x + 200, PLACES.home.y, { timeout: 12_000 });
    await releaseAll(page);
    await page.waitForTimeout(3000);

    const audit = await page.evaluate(() => window.__roach.assetAudit());
    const html = readFileSync('dist/index.html', 'utf8');
    const absolute = html.match(/(src|href)="\/[^"]*"/g) ?? [];
    const distFiles = readdirSync('dist', { recursive: true }) as string[];

    writeJson(`${DATA_DIR}/deployment.json`, {
      url: page.url(),
      externalRequests: external,
      absoluteAssetRefs: absolute,
      distFiles,
      nojekyll: existsSync(join('dist', '.nojekyll')),
      assetAudit: audit,
      requests: w.requests,
    });

    expect(external, `external requests: ${external.join(', ')}`).toEqual([]);
    expect(audit.externalRequests).toEqual([]);
    expect(absolute, `absolute asset references in index.html: ${absolute.join(', ')}`).toEqual([]);
    expect(existsSync(join('dist', '.nojekyll'))).toBe(true);
    expectClean(w);
  });

  test('17 every visible and audible element is a shipping asset, not a placeholder', async ({
    page,
  }) => {
    const w = watch(page);
    await boot(page, 6);
    await driveTo(page, PLACES.home.x + 20, PLACES.home.y, { timeout: 15_000 });
    await driveTo(page, PLACES.dishCrumbs.x, PLACES.dishCrumbs.y, { lay: true, timeout: 30_000 });
    await releaseAll(page);
    await page.waitForTimeout(2500);

    const audit = await page.evaluate(() => window.__roach.assetAudit());
    const s = await state(page);

    // Procedural atlases must have been generated, not skipped.
    expect((audit.roachAtlas as { w: number; h: number }).w).toBeGreaterThan(512);
    expect((audit.floorTile as { w: number }).w).toBeGreaterThan(512);
    expect((audit.debris as { w: number }).w).toBeGreaterThan(512);
    expect((audit.materials as string[]).length).toBeGreaterThanOrEqual(5);
    expect(audit.glowTints).toBe(6);
    expect(audit.audioStarted).toBe(true);

    // No unstyled text, no debug rectangles: the HUD is real DOM with real content.
    await expect(page.locator('#objective')).not.toBeEmpty();
    await expect(page.locator('#suspicion .tier-name')).not.toBeEmpty();
    expect(await page.locator('#hud svg.ic').count()).toBeGreaterThanOrEqual(6);

    writeJson(`${DATA_DIR}/asset-audit.json`, {
      generatedFinal: audit,
      temporaryAssets: [],
      hudIcons: await page.locator('#hud svg.ic').count(),
      objective: s.objective,
      note: 'All sprites, textures, VFX and audio are generated procedurally at boot; see ASSET_MANIFEST.md.',
    });
    expectClean(w);
  });
});

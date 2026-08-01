// Verifies the *deployed* GitHub Pages site: loads it, plays it, and records what happened.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = 'https://gjeon03.github.io/bug-game/';
const OUT = 'artifacts/evidence';
mkdirSync(`${OUT}/shots`, { recursive: true });

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const consoleErrors = [],
  pageErrors = [],
  failed = [],
  requests = [],
  external = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('requestfailed', (r) => failed.push(`${r.url()} :: ${r.failure()?.errorText}`));
page.on('request', (r) => {
  const u = r.url();
  requests.push(u);
  if (!u.startsWith(URL) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
});
page.on('response', (r) => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
});

const t0 = Date.now();
const resp = await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__roach?.ready === true, null, { timeout: 30000 });
const loadMs = Date.now() - t0;

await page.keyboard.press('KeyW');
await page.evaluate(() => window.__roach.newRun(20260801));
await page.evaluate(() => window.__roach.input.releaseAll());
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/shots/30-live-boot.png` });

// Play it: walk out of the crack to the crumbs laying pheromone, then wait for a delivery.
const drive = (x, y, lay, timeout) =>
  page.evaluate(
    (a) =>
      new Promise((res) => {
        const api = window.__roach;
        const t = performance.now();
        const tick = () => {
          const s = api.state();
          const dx = a.x - s.scout.x,
            dy = a.y - s.scout.y;
          if (Math.hypot(dx, dy) < 45 || performance.now() - t > a.timeout) {
            for (const k of ['left', 'right', 'up', 'down']) api.input.release(k);
            if (!a.lay) api.input.release('lay');
            return res(Math.hypot(dx, dy) < 45);
          }
          for (const [k, on] of [
            ['left', dx < -10],
            ['right', dx > 10],
            ['up', dy < -10],
            ['down', dy > 10],
            ['lay', a.lay],
          ]) {
            if (on) api.input.press(k);
            else api.input.release(k);
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
    { x, y, lay, timeout },
  );

await drive(188, 2042, false, 12000);
await drive(600, 2010, true, 20000);
await drive(600, 1760, true, 20000);
await drive(712, 1704, true, 25000);
await page.evaluate(() => window.__roach.input.releaseAll());
await page.screenshot({ path: `${OUT}/shots/31-live-route.png` });

await page.waitForFunction(() => window.__roach.state().stats.deliveries > 0, null, {
  timeout: 60000,
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/shots/32-live-delivery.png` });

const s = await page.evaluate(() => window.__roach.state());
const tele = await page.evaluate(() => window.__roach.telemetry());

// A hard refresh of the published entry point must not 404.
const reload = await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__roach?.ready === true, null, { timeout: 30000 });

const record = {
  url: URL,
  verifiedAt: new Date().toISOString(),
  httpStatus: resp?.status(),
  reloadStatus: reload?.status(),
  loadMs,
  requests: [...new Set(requests)],
  externalRequests: external,
  failedRequests: failed,
  consoleErrors,
  pageErrors,
  played: {
    routes: s.routes,
    deliveries: s.stats.deliveries,
    population: s.colony.population,
    food: s.colony.food,
    firstDeliveryAt: s.stats.firstDeliveryAt,
  },
  startup: tele.startup,
};
writeFileSync(`${OUT}/deployment-live.json`, `${JSON.stringify(record, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      httpStatus: record.httpStatus,
      reloadStatus: record.reloadStatus,
      loadMs,
      linkedRoutes: s.routes.filter((r) => r.linked).length,
      deliveries: s.stats.deliveries,
      firstDeliveryAt: s.stats.firstDeliveryAt,
      external,
      failed,
      consoleErrors,
      pageErrors,
    },
    null,
    2,
  ),
);
await browser.close();

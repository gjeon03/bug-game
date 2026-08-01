import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StateSnapshot, TestApi } from '../../src/testapi.ts';
import { NESTS, RESOURCES } from '../../src/sim/kitchen.ts';
import { mostExposedPoint, mostOpenPoint, path as walkPath, type Pt } from '../map.ts';

declare global {
  interface Window {
    __roach: TestApi;
  }
}

export const SHOT_DIR = 'artifacts/evidence/shots';
export const DATA_DIR = 'artifacts/evidence';

/** Everything a spec needs to know about a page's runtime health. */
export interface PageWatch {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  requests: string[];
}

export function watch(page: Page): PageWatch {
  const w: PageWatch = { consoleErrors: [], pageErrors: [], failedRequests: [], requests: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') w.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => w.pageErrors.push(String(e)));
  page.on('requestfailed', (r) => w.failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    w.requests.push(`${r.status()} ${r.url()}`);
    if (r.status() >= 400) w.failedRequests.push(`${r.status()} ${r.url()}`);
  });
  return w;
}

/** Loads the game and starts a deterministic run. */
export async function boot(page: Page, seed: number): Promise<void> {
  await page.goto('./', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__roach?.ready === true, null, { timeout: 30_000 });
  // A real key press so the audio context is allowed to start, exactly like a player's first input.
  await page.keyboard.press('KeyW');
  await page.evaluate((s) => window.__roach.newRun(s), seed);
  await page.evaluate(() => window.__roach.input.releaseAll());
  await page.waitForTimeout(250);
}

export async function state(page: Page): Promise<StateSnapshot> {
  return page.evaluate(() => window.__roach.state());
}

export async function press(page: Page, keys: string[]): Promise<void> {
  await page.evaluate((k) => {
    for (const key of k) window.__roach.input.press(key as never);
  }, keys);
}

export async function release(page: Page, keys: string[]): Promise<void> {
  await page.evaluate((k) => {
    for (const key of k) window.__roach.input.release(key as never);
  }, keys);
}

export async function releaseAll(page: Page): Promise<void> {
  await page.evaluate(() => window.__roach.input.releaseAll());
}

export interface DriveResult {
  ok: boolean;
  x: number;
  y: number;
  elapsed: number;
  stuck: boolean;
}

/**
 * Steers the scout to a world position using the real input layer, inside the page's own rAF loop so
 * steering is frame-accurate rather than poll-accurate.
 *
 * This is genuine play: movement, collision, pheromone secretion and every consequence run normally.
 */
export async function driveTo(
  page: Page,
  x: number,
  y: number,
  opts: { lay?: boolean; sprint?: boolean; timeout?: number; arrive?: number } = {},
): Promise<DriveResult> {
  return page.evaluate(
    (args) =>
      new Promise<DriveResult>((resolve) => {
        const api = window.__roach;
        const t0 = performance.now();
        let lastProgress = t0;
        let bestD = Infinity;
        let unstickUntil = 0;
        let unstickDir: 'up' | 'down' | 'left' | 'right' = 'up';

        // Releasing `lay` between waypoints would end the route and start a new one on the next
        // segment, so only the steering keys are dropped when a waypoint is reached. The caller
        // decides when a route ends by calling releaseAll().
        const stopSteering = (): void => {
          for (const key of ['left', 'right', 'up', 'down'] as const) api.input.release(key);
          if (!args.lay) api.input.release('lay');
          if (!args.sprint) api.input.release('sprint');
        };

        const tick = (): void => {
          const s = api.state();
          const now = performance.now();

          // A dead scout is a normal part of play: stop steering, wait for the colony to promote a
          // replacement, then carry on from the nest. Only the overall timeout applies.
          if (!s.scout.alive || s.status !== 'playing') {
            stopSteering();
            bestD = Infinity;
            lastProgress = now;
            if (now - t0 > args.timeout) {
              resolve({ ok: false, x: s.scout.x, y: s.scout.y, elapsed: now - t0, stuck: true });
              return;
            }
            requestAnimationFrame(tick);
            return;
          }

          const dx = args.x - s.scout.x;
          const dy = args.y - s.scout.y;
          const d = Math.hypot(dx, dy);

          if (d <= args.arrive) {
            stopSteering();
            resolve({ ok: true, x: s.scout.x, y: s.scout.y, elapsed: now - t0, stuck: false });
            return;
          }
          if (now - t0 > args.timeout) {
            stopSteering();
            resolve({ ok: false, x: s.scout.x, y: s.scout.y, elapsed: now - t0, stuck: true });
            return;
          }
          if (d < bestD - 4) {
            bestD = d;
            lastProgress = now;
          }

          // Cabinetry is convex but corners still catch a naive straight-line drive. If no progress
          // has been made for a second, slide along one axis for a moment and try again.
          if (now - lastProgress > 1000 && now > unstickUntil) {
            unstickUntil = now + 700;
            unstickDir =
              Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? 'down' : 'up') : dx > 0 ? 'right' : 'left';
            lastProgress = now;
          }

          const on: Record<string, boolean> = {
            left: dx < -10,
            right: dx > 10,
            up: dy < -10,
            down: dy > 10,
            lay: !!args.lay,
            sprint: !!args.sprint,
          };
          if (now < unstickUntil) {
            on.left = on.right = on.up = on.down = false;
            on[unstickDir] = true;
          }
          for (const key of ['left', 'right', 'up', 'down', 'lay', 'sprint'] as const) {
            if (on[key]) api.input.press(key);
            else api.input.release(key);
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
    {
      x,
      y,
      lay: opts.lay ?? false,
      sprint: opts.sprint ?? false,
      timeout: opts.timeout ?? 30_000,
      arrive: opts.arrive ?? 40,
    },
  );
}

/**
 * Waits until a predicate on the state snapshot holds, and returns the game seconds it took.
 *
 * The predicate is serialised into the page, so it cannot close over test-scope variables — pass
 * anything it needs through `arg`, which is cloned into the browser alongside it.
 */
export async function waitForState<T = undefined>(
  page: Page,
  predicate: (s: StateSnapshot, arg: T) => boolean,
  timeoutMs = 60_000,
  arg?: T,
): Promise<number> {
  const start = await state(page);
  await page.waitForFunction(
    ({ src, a }) => {
      const fn = new Function('s', 'arg', `return (${src})(s, arg)`) as (
        s: StateSnapshot,
        arg: unknown,
      ) => boolean;
      return fn(window.__roach.state(), a);
    },
    { src: predicate.toString(), a: arg as unknown },
    { timeout: timeoutMs, polling: 100 },
  );
  const end = await state(page);
  return end.time - start.time;
}

export async function tapInteract(page: Page): Promise<void> {
  await page.evaluate(() => window.__roach.input.press('interact'));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__roach.input.release('interact'));
}

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

/** Fails the spec on any console error, page error or failed request. */
export function expectClean(w: PageWatch, testInfo?: TestInfo): void {
  if (testInfo) testInfo.attach('requests', { body: w.requests.join('\n') }).catch(() => {});
  expect(w.pageErrors, `page errors: ${w.pageErrors.join(' | ')}`).toEqual([]);
  expect(w.consoleErrors, `console errors: ${w.consoleErrors.join(' | ')}`).toEqual([]);
  expect(w.failedRequests, `failed requests: ${w.failedRequests.join(' | ')}`).toEqual([]);
}

/**
 * Positions *generated* from the authored map, so specs read like a player's intent and the map has
 * exactly one source of truth.
 *
 * The old version of this was a literal second copy of every coordinate in `kitchen.ts`, and every
 * E2E spec depended on it — which made a map edit a seventeen-spec change.
 */
export const PLACES: Record<string, Pt> = {
  ...Object.fromEntries(RESOURCES.map((r) => [r.id, { x: r.x, y: r.y }])),
  ...Object.fromEntries(NESTS.map((n) => [n.id, { x: n.x, y: n.y }])),
  /** The darkest, most open floor in the kitchen. */
  openFloor: mostOpenPoint(),
  /** The brightest ground a roach can stand on — where a player goes to get noticed. */
  brightest: mostExposedPoint(),
};

export const HOME = NESTS[0];
export const firstFood = RESOURCES.find((r) => r.kind === 'food' && r.unlockOp === 1)!;
export const firstWater = RESOURCES.find((r) => r.kind === 'water' && r.unlockOp === 1)!;

/** Every crack the given operation opens, nearest to home first. */
export function footholdsFor(op: number): typeof NESTS {
  return NESTS.filter((n) => !n.home && n.unlockOp <= op).sort(
    (a, b) => Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
  ) as unknown as typeof NESTS;
}

/**
 * Walks the scout to a world point along generated, walkable waypoints.
 *
 * Straight-line steering catches on cabinetry corners; the specs used to work around that with
 * hand-written waypoint lists per route. This derives them from the map instead.
 */
export async function walkTo(
  page: Page,
  to: Pt,
  opts: { lay?: boolean; sprint?: boolean; timeout?: number } = {},
): Promise<DriveResult> {
  const s = await state(page);
  const legs = walkPath({ x: s.scout.x, y: s.scout.y }, to, opts.lay ? 'covered' : 'covered');
  let last: DriveResult = { ok: false, x: s.scout.x, y: s.scout.y, elapsed: 0, stuck: false };
  for (const leg of legs) {
    last = await driveTo(page, leg.x, leg.y, {
      lay: opts.lay,
      sprint: opts.sprint,
      timeout: opts.timeout ?? 30_000,
      arrive: 46,
    });
  }
  return last;
}

/** Walks quietly to `from`, then to `to` secreting pheromone: one supply line, as a player lays it. */
export async function layLine(page: Page, from: Pt, to: Pt, timeout = 40_000): Promise<void> {
  await walkTo(page, from, { timeout });
  await walkTo(page, to, { lay: true, timeout });
  await releaseAll(page);
}

/** Walks to a crack and presses E until it is claimed. */
export async function claimAt(page: Page, id: string, attempts = 8): Promise<boolean> {
  const place = PLACES[id];
  await walkTo(page, place, { timeout: 60_000 });
  for (let i = 0; i < attempts; i++) {
    await tapInteract(page);
    await page.waitForTimeout(300);
    const s = await state(page);
    if (s.nests.find((n) => n.id === id)?.claimed) return true;
    await page.waitForTimeout(5000);
    await driveTo(page, place.x, place.y, { timeout: 25_000, arrive: 50 });
  }
  return !!(await state(page)).nests.find((n) => n.id === id)?.claimed;
}

/** Presses a real number key — the adaptation and fit-out choices are keyboard, not `input`. */
export async function chooseSlot(page: Page, slot: 1 | 2 | 3): Promise<void> {
  await page.keyboard.press(`Digit${slot}`);
  await page.waitForTimeout(150);
}

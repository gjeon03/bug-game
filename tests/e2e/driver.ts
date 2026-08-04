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
        let settled = false;
        const finish = (r: DriveResult): void => {
          if (settled) return;
          settled = true;
          resolve(r);
        };
        // rAF is the steering clock, but a browser that decides this page is not visible throttles
        // or stops rAF entirely — and a `page.evaluate` promise that never settles cannot be
        // interrupted by Playwright's own test timeout, so the run hangs past it rather than
        // failing. This watchdog is on a timer, which is not throttled to a stop, and guarantees the
        // promise settles.
        const watchdog = setTimeout(() => {
          const s = api.state();
          finish({ ok: false, x: s.scout.x, y: s.scout.y, elapsed: args.timeout, stuck: true });
        }, args.timeout + 2_000);
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
          if (settled) return;
          const s = api.state();
          const now = performance.now();

          // A dead scout is a normal part of play: stop steering, wait for the colony to promote a
          // replacement, then carry on from the nest. Only the overall timeout applies.
          if (!s.scout.alive || s.status !== 'playing') {
            stopSteering();
            bestD = Infinity;
            lastProgress = now;
            if (now - t0 > args.timeout) {
              clearTimeout(watchdog);
              finish({ ok: false, x: s.scout.x, y: s.scout.y, elapsed: now - t0, stuck: true });
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
            clearTimeout(watchdog);
            finish({ ok: true, x: s.scout.x, y: s.scout.y, elapsed: now - t0, stuck: false });
            return;
          }
          if (now - t0 > args.timeout) {
            stopSteering();
            clearTimeout(watchdog);
            finish({ ok: false, x: s.scout.x, y: s.scout.y, elapsed: now - t0, stuck: true });
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

/* ── Guided player ──────────────────────────────────────────────────────────
 *
 * Lives here rather than in a spec because two specs now need it: the local full run and the
 * deployed-build run. Importing it from a spec file would re-register that spec's tests inside the
 * importer, so the shared driver is the only correct home for it.
 */
export const HOME_MOUTH = { x: HOME.x + 30, y: HOME.y };
/**
 * The guided player.
 *
 * It acts only on what the HUD is showing: `hud.source` says what kind of thing to do and
 * `hud.target` says where. That makes each spec run a test of the guidance as much as of the game —
 * if a run cannot be finished by following the objective line, the objective line is not good enough.
 *
 * It replaces a hand-written routine that maintained exactly one line per reserve and always pressed
 * the first choice. That player was measured three times and starved three times: 33 roaches and no
 * food, then 33 and no water, then 23 and no water. Every failure was the same mistake — a colony
 * that outgrows its supply lines needs more supply lines, and the objective line says so while the
 * hand-written player was not reading it.
 */
export async function guidedStep(page: Page): Promise<string> {
  const s = await state(page);
  if (s.status !== 'playing') return `end:${s.status}`;

  // A one-of-three choice, answered by key. Spread across families rather than stacking one: three
  // brood adaptations is capacity 73 on an economy that cannot feed it.
  if (s.adaptations.offer.length > 0) {
    const counts = [0, 0, 0];
    for (const id of s.adaptations.taken) {
      counts[id.startsWith('brood') ? 0 : id.startsWith('forage') ? 1 : 2]++;
    }
    let slot: 1 | 2 | 3 = 1;
    let fewest = Infinity;
    for (let i = 0; i < s.adaptations.offer.length; i++) {
      const id = s.adaptations.offer[i];
      const family = id.startsWith('brood') ? 0 : id.startsWith('forage') ? 1 : 2;
      const affordable =
        s.adaptations.offers[i] && s.adaptations.offers[i].costFood + 14 <= s.colony.food;
      if (affordable && counts[family] < fewest) {
        fewest = counts[family];
        slot = (i + 1) as 1 | 2 | 3;
      }
    }
    // An offer it cannot safely afford must NOT short-circuit the step. Returning here spun the
    // loop with no wait and no action, burning all 120 iterations in seconds — the same mistake the
    // game's own objective hierarchy had, where an unaffordable offer pinned the objective while the
    // colony starved. An offer never expires: fall through and go earn it.
    if (fewest !== Infinity) {
      await chooseSlot(page, slot);
      return 'adapt';
    }
  }
  if (s.pendingFit) {
    await chooseSlot(page, s.colony.population >= s.colony.capacity - 3 ? 1 : 2);
    return 'fit';
  }

  const src = s.hud.source;
  const target = s.hud.target;

  // Stand somewhere and press E.
  if (
    src.startsWith('gate:foothold') ||
    src.startsWith('gate:functions') ||
    src.startsWith('capped:claim') ||
    src.startsWith('capped:fit') ||
    src.startsWith('capped:repair') ||
    src.startsWith('gate:zones')
  ) {
    if (!target) {
      await page.waitForTimeout(2500);
      return 'wait';
    }
    await driveTo(page, target.x, target.y, { timeout: 40_000, arrive: 50 });
    await tapInteract(page);
    await page.waitForTimeout(400);
    const after = await state(page);
    if (after.pendingFit) {
      await chooseSlot(page, after.colony.population >= after.colony.capacity - 3 ? 1 : 2);
    }
    return `interact:${target.label}`;
  }

  // Run a line to whatever the objective is pointing at — unless it is already served, in which case
  // a fresh lay would only evict one of the player's own working lines.
  //
  // "Already served" is not a reason to ignore a *shortage*, though. A shortage means the lines that
  // exist are not keeping up, and its blocker says so in as many words: add a second source. Treating
  // the existing line as an answer is how this player lost a colony on a slow CI host — it spent
  // 89 % of a 320 s run standing at the crack being told moisture was running low, laid 62 trail
  // nodes all run, and starved twenty-three roaches at alert tier 0.
  const supplyUrgent = src === 'shortage' || src.endsWith(':saving');
  if (target) {
    const servedBy = (tx: number, ty: number): boolean =>
      s.routes.some((r) => {
        if (!r.linked || !r.resourceId) return false;
        const res = s.resources.find((x) => x.id === r.resourceId);
        return !!res && Math.hypot(res.x - tx, res.y - ty) < 120;
      });

    let go: { x: number; y: number; label: string } | null = servedBy(target.x, target.y)
      ? null
      : target;

    // Under a shortage, if the objective's own target is served, go find one that is not.
    if (!go && supplyUrgent && s.routes.length < 6) {
      const kind = /moisture|water/i.test(s.hud.objective) ? 'water' : 'food';
      let bestD = Infinity;
      for (const res of s.resources) {
        if (res.kind !== kind || res.depleted || res.unlockOp > s.operation) continue;
        if (servedBy(res.x, res.y)) continue;
        const d = Math.hypot(res.x - s.scout.x, res.y - s.scout.y);
        if (d < bestD) {
          bestD = d;
          go = { x: res.x, y: res.y, label: res.id };
        }
      }
    }

    if (go) {
      await layLine(page, HOME_MOUTH, { x: go.x, y: go.y });
      await page.waitForTimeout(1500);
      return `line:${go.label}`;
    }
  }

  await driveTo(page, HOME_MOUTH.x, HOME_MOUTH.y, { timeout: 25_000 });
  await page.waitForTimeout(4000);
  return `hold:${src}`;
}

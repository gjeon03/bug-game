import { COVER_RADIUS, SCOUT_RADIUS, WORLD_H, WORLD_W } from '../src/sim/constants.ts';
import {
  coverAt,
  distToSolid2,
  exposureFrom,
  isInsideSolid,
  staticLightAt,
} from '../src/sim/field.ts';
import { NESTS, RESOURCES, SOLIDS, type NestSpec, type ResourceSpec } from '../src/sim/kitchen.ts';
import type { Solid } from '../src/sim/types.ts';

/**
 * Every map coordinate the test suite uses, derived from the authored data rather than copied out of
 * it.
 *
 * The technical audit's single largest finding about the old suite was that ~40 % of it encoded the
 * current kitchen's coordinates instead of the properties those coordinates were chosen to
 * demonstrate: one helper hardcoding `(600, 2010)` broke eight tests at once, and `PLACES` in the E2E
 * driver was a literal second copy of the whole map. Nothing below contains a coordinate. Move a
 * cabinet and the routes move with it.
 */

export interface Pt {
  x: number;
  y: number;
}

export const HOME = NESTS[0];

export function solid(id: string): Solid {
  const s = SOLIDS.find((x) => x.id === id);
  if (!s) throw new Error(`no solid '${id}' in the authored kitchen`);
  return s;
}

export function nestSpec(id: string): NestSpec {
  const n = NESTS.find((x) => x.id === id);
  if (!n) throw new Error(`no nest '${id}' in the authored kitchen`);
  return n;
}

export function resourceSpec(id: string): ResourceSpec {
  const r = RESOURCES.find((x) => x.id === id);
  if (!r) throw new Error(`no resource '${id}' in the authored kitchen`);
  return r;
}

export const pt = (o: { x: number; y: number }): Pt => ({ x: o.x, y: o.y });

/** The first authored resource of a kind that is reachable in the given operation. */
export function firstResource(kind: 'food' | 'water', op = 1): ResourceSpec {
  const r = RESOURCES.find((x) => x.kind === kind && x.unlockOp <= op);
  if (!r) throw new Error(`no ${kind} source unlocked by operation ${op}`);
  return r;
}

/** Every satellite crack claimable in the given operation, nearest to the home crack first. */
export function satellitesFor(op: number): NestSpec[] {
  return NESTS.filter((n) => !n.home && n.unlockOp <= op).sort(
    (a, b) => dist(a, HOME) - dist(b, HOME),
  );
}

export function dist(a: Pt | { x: number; y: number }, b: Pt | { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* ── Derived probe points ──────────────────────────────────────────────────── */

/** Roughly a toe-kick's depth: close enough to a solid that cover is near maximal. */
export const HUG_GAP = SCOUT_RADIUS + 6;

/** A point hard against a solid's right-hand face, at a given height. */
export function hugRight(s: Solid, y: number, gap = HUG_GAP): Pt {
  return { x: s.x + s.w + gap, y };
}

/** A point one full cover band out from a solid's right-hand face — cover, but weak. */
export function nearRight(s: Solid, y: number): Pt {
  return { x: s.x + s.w + COVER_RADIUS * 0.55, y };
}

/**
 * Standing risk at a point, from the authored lights and the authored geometry.
 *
 * This is the number the whole game is played against, and it is emphatically *not* "distance from a
 * cabinet": the darkest part of the room is the middle of the floor, while the safest-looking
 * toe-kick under the sink lamp is one of the brightest tiles in the kitchen. Any test that wants a
 * risky route has to ask for risk, not for open floor.
 */
export function staticExposureAt(x: number, y: number): number {
  return exposureFrom(staticLightAt(x, y), coverAt(x, y));
}

/** The point on the floor furthest from any cabinetry — zero cover, by construction. */
export function mostOpenPoint(): Pt {
  let best: Pt = { x: WORLD_W / 2, y: WORLD_H / 2 };
  let bestD = -1;
  for (let x = 120; x < WORLD_W - 120; x += 40) {
    for (let y = 120; y < WORLD_H - 120; y += 40) {
      const d = distToSolid2(x, y);
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/**
 * The most dangerous tile a roach can stand on: found, not authored.
 *
 * The old suite loitered at a written-down `(2560, 920)` — the fridge light — to provoke the
 * household. This computes the same kind of place from `LIGHTS` and `SOLIDS`, so moving the fridge
 * moves the test.
 */
export function mostExposedPoint(): Pt {
  let best: Pt = { x: WORLD_W / 2, y: WORLD_H / 2 };
  let bestRisk = -1;
  for (let x = 120; x < WORLD_W - 120; x += 40) {
    for (let y = 120; y < WORLD_H - 120; y += 40) {
      if (isInsideSolid(x, y) || distToSolid2(x, y) < (SCOUT_RADIUS + 20) ** 2) continue;
      const risk = staticExposureAt(x, y);
      if (risk > bestRisk) {
        bestRisk = risk;
        best = { x, y };
      }
    }
  }
  return best;
}

/* ── Navigation ────────────────────────────────────────────────────────────── */

const CELL = 50;
const COLS = Math.ceil(WORLD_W / CELL);
const ROWS = Math.ceil(WORLD_H / CELL);
/** How far a cell centre must sit from cabinetry to count as walkable for the scout. */
const CLEARANCE = SCOUT_RADIUS + 16;

const centreX = (cx: number): number => (cx + 0.5) * CELL;
const centreY = (cy: number): number => (cy + 0.5) * CELL;

const walkable: boolean[] = (() => {
  const out: boolean[] = new Array(COLS * ROWS);
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const x = centreX(cx);
      const y = centreY(cy);
      out[cy * COLS + cx] =
        x < WORLD_W && y < WORLD_H && !isInsideSolid(x, y) && distToSolid2(x, y) > CLEARANCE ** 2;
    }
  }
  return out;
})();

function nearestWalkable(p: Pt): number {
  let best = -1;
  let bestD = Infinity;
  const cx0 = Math.floor(p.x / CELL);
  const cy0 = Math.floor(p.y / CELL);
  for (let r = 0; r <= 12 && best < 0; r++) {
    for (let cy = cy0 - r; cy <= cy0 + r; cy++) {
      for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) continue;
        const i = cy * COLS + cx;
        if (!walkable[i]) continue;
        const d = (centreX(cx) - p.x) ** 2 + (centreY(cy) - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
  }
  return best;
}

/** Minimal binary heap keyed on cost; a plain array scan made the Dijkstra below quadratic. */
class Heap {
  private readonly ids: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(p, i);
      i = p;
    }
  }

  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop() as number;
    const lastKey = this.keys.pop() as number;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(m, i);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

export type PathStyle = 'covered' | 'open' | 'short';

/**
 * Cost of stepping into a cell.
 *
 * `covered` hugs cabinetry, `open` deliberately crosses bare tile, `short` ignores both. Expressing
 * the two route archetypes as a *preference* rather than as waypoints is what lets the exposure tests
 * survive a map change: whatever the kitchen looks like, one of these routes is the safe way round
 * and the other is the exposed way round.
 */
function stepCost(i: number, style: PathStyle): number {
  if (style === 'short') return 1;
  // Cover, not exposure. Weighting by exposure sounds more correct and is worse in practice: the
  // sink drip sits inside the under-sink lamp, so an exposure-averse router walked halfway round the
  // kitchen rather than fetch water from two body-lengths away. A careful player hugs the units and
  // accepts the lamp; the genuinely reckless archetype is `detourPath`, which goes looking for light.
  const cover = coverAt(centreX(i % COLS), centreY(Math.floor(i / COLS)));
  return style === 'covered' ? 1 + (1 - cover) * 7 : 1 + cover * 7;
}

/**
 * A walkable line of waypoints between two world points.
 *
 * Straight-line steering is what the drivers do, so the path is simplified down to the fewest
 * waypoints whose connecting segments all stay in walkable space — a naive cell-by-cell list would
 * make the scout stutter, and a straight line to the target would jam it in the cabinetry.
 */
export function path(from: Pt, to: Pt, style: PathStyle = 'covered'): Pt[] {
  const start = nearestWalkable(from);
  const goal = nearestWalkable(to);
  if (start < 0 || goal < 0) return [to];

  const cost = new Float64Array(COLS * ROWS).fill(Infinity);
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  const done = new Uint8Array(COLS * ROWS);
  const heap = new Heap();
  cost[start] = 0;
  heap.push(start, 0);

  while (heap.size > 0) {
    const i = heap.pop();
    if (done[i]) continue;
    done[i] = 1;
    if (i === goal) break;
    const cx = i % COLS;
    const cy = (i - cx) / COLS;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = ny * COLS + nx;
        if (!walkable[j] || done[j]) continue;
        const step = stepCost(j, style) * (dx !== 0 && dy !== 0 ? 1.4142 : 1);
        const c = cost[i] + step;
        if (c < cost[j]) {
          cost[j] = c;
          prev[j] = i;
          heap.push(j, c);
        }
      }
    }
  }

  if (cost[goal] === Infinity) return [to];
  const cells: number[] = [];
  for (let i = goal; i >= 0; i = prev[i]) cells.push(i);
  cells.reverse();

  const pts = cells.map((i) => ({ x: centreX(i % COLS), y: centreY(Math.floor(i / COLS)) }));
  return simplify(pts).concat([{ x: to.x, y: to.y }]);
}

function clearLine(a: Pt, b: Pt): boolean {
  const steps = Math.ceil(dist(a, b) / (CELL * 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (isInsideSolid(x, y) || distToSolid2(x, y) <= CLEARANCE ** 2) return false;
  }
  return true;
}

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clearLine(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/**
 * `count` walkable points near `near`, at least `minGap` apart.
 *
 * For tests that need several unrelated trail stubs on the floor at once. Generated, so a map change
 * moves them instead of breaking them.
 */
export function spreadPoints(count: number, near: Pt = HOME, minGap = 420): Pt[] {
  const candidates: Pt[] = [];
  for (let i = 0; i < walkable.length; i++) {
    if (!walkable[i]) continue;
    candidates.push({ x: centreX(i % COLS), y: centreY(Math.floor(i / COLS)) });
  }
  candidates.sort((a, b) => dist(a, near) - dist(b, near));
  const out: Pt[] = [];
  for (const c of candidates) {
    if (out.every((p) => dist(p, c) >= minGap)) out.push(c);
    if (out.length === count) break;
  }
  return out;
}

/**
 * A deliberately incriminating line between two points.
 *
 * `path(_, 'open')` only prefers risk among the cells it would have crossed anyway, which on a short
 * leg is barely a choice at all. A route that is *meant* to be reckless has to go somewhere it will
 * be seen, so this one detours through the brightest exposed tile in the kitchen and back.
 */
export function detourPath(from: Pt, to: Pt): Pt[] {
  const lit = mostExposedPoint();
  return [...path(from, lit, 'open'), ...path(lit, to, 'open')];
}

/**
 * The brightest walkable point that does not make the trip much longer.
 *
 * `detourPath` goes to the worst tile in the kitchen, which is the right archetype for "reckless" but
 * the wrong one for comparing two lines *to the same source*: a five-times-longer route differs in
 * length as well as in risk. This finds a short way to be seen — the equivalent of the old test's
 * hand-placed waypoints out across the bare tile — so exposure is the only thing that changes.
 */
export function nearbyLitPoint(from: Pt, to: Pt, slack = 1.6): Pt {
  const direct = dist(from, to);
  let best: Pt = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  let bestRisk = -1;
  for (let i = 0; i < walkable.length; i++) {
    if (!walkable[i]) continue;
    const p = { x: centreX(i % COLS), y: centreY(Math.floor(i / COLS)) };
    if (dist(from, p) + dist(p, to) > direct * slack + 200) continue;
    const risk = staticExposureAt(p.x, p.y);
    if (risk > bestRisk) {
      bestRisk = risk;
      best = p;
    }
  }
  return best;
}

/** A short line between two points that deliberately passes through the light. */
export function litDetourPath(from: Pt, to: Pt): Pt[] {
  const lit = nearbyLitPoint(from, to);
  return [...path(from, lit, 'open'), ...path(lit, to, 'open')];
}

/** Mean cover along a path — the number the covered/open route archetypes are meant to differ in. */
export function pathCover(points: Pt[]): number {
  let total = 0;
  let n = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const steps = Math.max(1, Math.ceil(dist(a, b) / 30));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      total += coverAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      n++;
    }
  }
  return n === 0 ? 0 : total / n;
}

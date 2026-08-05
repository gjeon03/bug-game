import { GRID_CELL_MM, mm } from './units';
import type { Link, Rect, Surface, Vec2 } from './types';

/**
 * The navigation substrate: one occupancy-and-exposure grid per walkable surface, joined by
 * authored climbs, with a single A* over the union.
 *
 * ## Why a grid and not a navmesh
 *
 * Three things need the same spatial answer and they must not disagree: can a body stand here, how
 * visible is a body standing here, and what is the cheapest way from A to B. A navmesh answers the
 * first well and the second badly. A uniform 60 mm grid answers all three from one array, is
 * trivially deterministic, and is small — the whole apartment is about 26 000 cells, which fits in
 * a few hundred kilobytes and rebuilds in a couple of milliseconds.
 *
 * ## Why exposure is a pathfinding cost and not a separate system
 *
 * The hallway chapter is *about* the difference between the fast way and the safe way. If exposure
 * lived outside the path cost, that difference would have to be communicated by a warning label.
 * Here it is structural: `findPath` with a high `exposureWeight` hugs the baseboards and takes
 * longer, with a low one cuts straight across the lit floor. The player's route drawing sets the
 * geometry; this is what repairs and validates it.
 */

/** Cell is solid — furniture, a carcass, a wall. */
const BLOCKED = 1;

export interface SurfaceGrid {
  readonly id: string;
  readonly surface: Surface;
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly x0: number;
  readonly z0: number;
  /** `0` walkable, `BLOCKED` solid. */
  readonly flags: Uint8Array;
  /** Static exposure 0..1 before routine-driven zones are applied. */
  readonly baseExposure: Float32Array;
  /** Live exposure — base plus whatever routines are currently running. Recomputed on change. */
  readonly exposure: Float32Array;
}

export interface NavPoint {
  readonly surface: string;
  readonly x: number;
  readonly z: number;
}

export interface Nav {
  readonly grids: ReadonlyMap<string, SurfaceGrid>;
  readonly order: readonly string[];
  /** Links keyed by the surface they leave, so neighbour expansion is a map lookup not a scan. */
  readonly linksFrom: ReadonlyMap<string, readonly Link[]>;
  readonly links: readonly Link[];
}

export interface PathResult {
  readonly points: readonly NavPoint[];
  /** Total world-unit length, ignoring exposure weighting. */
  readonly length: number;
  /** Mean exposure along the path, 0..1 — what the UI shows as route risk. */
  readonly exposure: number;
  /** Links the path passes through, in order. Used for capacity and congestion. */
  readonly links: readonly string[];
  readonly ok: boolean;
}

export function buildGrid(surface: Surface, blockers: readonly Rect[]): SurfaceGrid {
  const cell = mm(GRID_CELL_MM);
  const { x0, z0, x1, z1 } = surface.bounds;
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell));
  const rows = Math.max(1, Math.ceil((z1 - z0) / cell));
  const flags = new Uint8Array(cols * rows);
  const baseExposure = new Float32Array(cols * rows);

  /*
   * Blockers are rasterised by CELL CENTRE, not by overlap.
   *
   * Overlap rasterisation (`ceil` on the far edge) grows every blocker by up to a full cell, and
   * measurement showed exactly what that costs: the 100 mm toe-kick recess under the kitchen units
   * — the darkest continuous run in the flat and the colony's home corridor — was being eaten by
   * the carcass behind it, because the carcass edge at z = -2740 rounded forward past z = -2700.
   *
   * Every gap this game is built on is between 60 mm and 100 mm: the toe-kick, the wardrobe skirt,
   * the void behind a bed head, the gap under a shower tray lip. Conservative rasterisation is not
   * a tolerance tweak here, it is the difference between those gaps existing and not.
   */
  for (const rect of blockers) {
    const c0 = Math.max(0, Math.round((rect.x0 - x0) / cell - 0.5));
    const c1 = Math.min(cols - 1, Math.round((rect.x1 - x0) / cell - 0.5) - 1);
    const r0 = Math.max(0, Math.round((rect.z0 - z0) / cell - 0.5));
    const r1 = Math.min(rows - 1, Math.round((rect.z1 - z0) / cell - 0.5) - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) flags[r * cols + c] = BLOCKED;
    }
  }

  // The surface's own multiplier is the floor of its exposure: a worktop is never as safe as the
  // void under it, whatever else is or is not happening in the room.
  const base = Math.min(1, surface.exposure * 0.34);
  baseExposure.fill(base);

  return {
    id: surface.id,
    surface,
    cols,
    rows,
    cell,
    x0,
    z0,
    flags,
    baseExposure,
    exposure: Float32Array.from(baseExposure),
  };
}

/**
 * Paint an exposure rectangle into a grid's base layer.
 *
 * Authored zones OVERWRITE rather than accumulate. They used to take the maximum, which silently
 * deleted every zone that was darker than the surface's own baseline: the baseline is
 * `surface.exposure * 0.34` = 0.425 for the hallway floor, and the hallway's four cover strips are
 * authored at 0.14-0.30. An independent critic measured 13 of the apartment's 50 zones as inert,
 * including every cover zone in the hallway and the bedroom — which is the entire "fast lit route
 * versus slow safe route" mechanic chapter 2 is built on.
 *
 * Authored data is more specific than a surface-wide default, so it wins. Later zones over earlier
 * ones in file order, which is how a lamp pool sits on top of a room's ambient level.
 */
export function paintExposure(grid: SurfaceGrid, rect: Rect, level: number): void {
  paintInto(grid, grid.baseExposure, rect, level, false);
}

/** Reset live exposure to the static layer. Routine zones are painted on top each time they change. */
export function resetExposure(grid: SurfaceGrid): void {
  grid.exposure.set(grid.baseExposure);
}

/**
 * Routine-driven light, painted on top of the static layer each tick.
 *
 * This one DOES take the maximum: a light coming on can only ever make a place more visible, never
 * less, so a lamp must not erase the cover a sofa provides.
 */
export function paintLiveExposure(grid: SurfaceGrid, rect: Rect, level: number): void {
  paintInto(grid, grid.exposure, rect, level, true);
}

function paintInto(
  grid: SurfaceGrid,
  target: Float32Array,
  rect: Rect,
  level: number,
  keepBrighter: boolean,
): void {
  const c0 = Math.max(0, Math.floor((rect.x0 - grid.x0) / grid.cell));
  const c1 = Math.min(grid.cols - 1, Math.ceil((rect.x1 - grid.x0) / grid.cell) - 1);
  const r0 = Math.max(0, Math.floor((rect.z0 - grid.z0) / grid.cell));
  const r1 = Math.min(grid.rows - 1, Math.ceil((rect.z1 - grid.z0) / grid.cell) - 1);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * grid.cols + c;
      if (!keepBrighter || level > (target[i] ?? 0)) target[i] = level;
    }
  }
}

export function cellIndex(grid: SurfaceGrid, x: number, z: number): number {
  const c = Math.floor((x - grid.x0) / grid.cell);
  const r = Math.floor((z - grid.z0) / grid.cell);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
  return r * grid.cols + c;
}

export function cellCentre(grid: SurfaceGrid, index: number): Vec2 {
  const c = index % grid.cols;
  const r = (index - c) / grid.cols;
  return { x: grid.x0 + (c + 0.5) * grid.cell, z: grid.z0 + (r + 0.5) * grid.cell };
}

export function isWalkable(nav: Nav, surface: string, x: number, z: number): boolean {
  const grid = nav.grids.get(surface);
  if (!grid) return false;
  const i = cellIndex(grid, x, z);
  return i >= 0 && grid.flags[i] === 0;
}

export function exposureAt(nav: Nav, surface: string, x: number, z: number): number {
  const grid = nav.grids.get(surface);
  if (!grid) return 0;
  const i = cellIndex(grid, x, z);
  if (i < 0) return 0;
  return grid.exposure[i] ?? 0;
}

/**
 * Nearest walkable cell to a point, searched in expanding rings.
 *
 * Authored coordinates land inside furniture more often than anyone expects — a foothold "under the
 * wardrobe" is, geometrically, inside the wardrobe's blocker. Rather than demand millimetre-perfect
 * authoring, resolve to the nearest legal cell and record how far it moved so a test can fail if a
 * site is nowhere near walkable space.
 */
export function nearestWalkable(
  nav: Nav,
  surface: string,
  x: number,
  z: number,
  maxRings = 12,
): { readonly index: number; readonly point: Vec2; readonly moved: number } | null {
  const grid = nav.grids.get(surface);
  if (!grid) return null;
  const c0 = Math.floor((x - grid.x0) / grid.cell);
  const r0 = Math.floor((z - grid.z0) / grid.cell);

  for (let ring = 0; ring <= maxRings; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        // Only the shell of each ring — the interior was covered by a previous iteration.
        if (ring > 0 && Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
        const i = r * grid.cols + c;
        if (grid.flags[i] !== 0) continue;
        const point = cellCentre(grid, i);
        return { index: i, point, moved: Math.hypot(point.x - x, point.z - z) };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ pathing */

interface OpenNode {
  readonly key: number;
  readonly f: number;
}

/** Surface index packed into the node key so one A* covers every plane in the flat. */
const SURFACE_STRIDE = 1 << 20;

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Nominal ground speed used to price a climb against a horizontal detour, world units/second. */
const NOMINAL_SPEED = 260;

export interface PathOptions {
  /**
   * How much a fully exposed cell costs relative to a hidden one.
   *
   * 0 gives the shortest path regardless of danger. 4 makes a cockroach take a route four times as
   * long rather than cross open lit floor — which is exactly what a real one does.
   */
  readonly exposureWeight?: number;
  /** Links this path may not use — a washed pipe, a climb over capacity, a gate still shut. */
  readonly closedLinks?: ReadonlySet<string>;
  readonly maxExpansions?: number;
}

/**
 * A* from one point on one surface to another, crossing authored climbs.
 *
 * Returns `ok: false` with the best partial path when no route exists, because "your route is
 * disconnected, and here is how far it got" is a usable message and "null" is not.
 */
export function findPath(
  nav: Nav,
  from: NavPoint,
  to: NavPoint,
  options: PathOptions = {},
): PathResult {
  const exposureWeight = options.exposureWeight ?? 1.6;
  const maxExpansions = options.maxExpansions ?? 40_000;
  const closed = options.closedLinks;

  const startCell = nearestWalkable(nav, from.surface, from.x, from.z);
  const goalCell = nearestWalkable(nav, to.surface, to.x, to.z);
  if (!startCell || !goalCell) return EMPTY_PATH;

  const surfaceIndex = new Map<string, number>();
  nav.order.forEach((id, i) => surfaceIndex.set(id, i));
  const key = (surface: string, cell: number): number =>
    (surfaceIndex.get(surface) ?? 0) * SURFACE_STRIDE + cell;

  const startKey = key(from.surface, startCell.index);
  const goalKey = key(to.surface, goalCell.index);

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const cameVia = new Map<number, string>();
  const surfaceOf = new Map<number, string>();
  surfaceOf.set(startKey, from.surface);
  gScore.set(startKey, 0);

  // A binary heap would be faster, but the whole apartment is ~26 000 cells and a sorted insert
  // over a bounded frontier measures under a millisecond. Simplicity wins until it does not.
  const open: OpenNode[] = [{ key: startKey, f: heuristic(startCell.point, goalCell.point) }];

  let expansions = 0;
  let bestKey = startKey;
  let bestH = heuristic(startCell.point, goalCell.point);

  while (open.length > 0 && expansions < maxExpansions) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    if (!current) break;
    expansions++;

    if (current.key === goalKey) {
      return reconstruct(nav, cameFrom, cameVia, surfaceOf, current.key, true);
    }

    const surfaceId = surfaceOf.get(current.key);
    if (!surfaceId) continue;
    const grid = nav.grids.get(surfaceId);
    if (!grid) continue;
    const cell = current.key % SURFACE_STRIDE;
    const g = gScore.get(current.key) ?? Infinity;

    const c = cell % grid.cols;
    const r = (cell - c) / grid.cols;

    for (const [dc, dr, mult] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      const ni = nr * grid.cols + nc;
      if (grid.flags[ni] !== 0) continue;
      // Refuse to cut a diagonal through the corner of a blocker; a body has width.
      if (dc !== 0 && dr !== 0) {
        if (grid.flags[r * grid.cols + nc] !== 0) continue;
        if (grid.flags[nr * grid.cols + c] !== 0) continue;
      }
      const step = grid.cell * mult * (1 + exposureWeight * (grid.exposure[ni] ?? 0));
      const nKey = key(surfaceId, ni);
      const tentative = g + step;
      if (tentative >= (gScore.get(nKey) ?? Infinity)) continue;
      gScore.set(nKey, tentative);
      cameFrom.set(nKey, current.key);
      surfaceOf.set(nKey, surfaceId);
      const h = heuristic(cellCentre(grid, ni), goalCell.point);
      if (h < bestH) {
        bestH = h;
        bestKey = nKey;
      }
      open.push({ key: nKey, f: tentative + h });
    }

    // Climbs. A link is only usable from the cell it physically occupies.
    for (const link of nav.linksFrom.get(surfaceId) ?? []) {
      if (closed?.has(link.id)) continue;
      // A link is authored from `from` at `at` and lands on `to` at `exitAt` (default `at`).
      // Traversed the other way those two swap, which is what makes a long pipe symmetric.
      const forward = link.from === surfaceId;
      const mouth = forward ? link.at : (link.exitAt ?? link.at);
      const landingAt = forward ? (link.exitAt ?? link.at) : link.at;
      const here = cellIndex(grid, mouth.x, mouth.z);
      if (here !== cell) continue;
      const other = forward ? link.to : link.from;
      const landing = nearestWalkable(nav, other, landingAt.x, landingAt.z);
      if (!landing) continue;
      const nKey = key(other, landing.index);
      // Climbing costs time, not distance. Converting at a nominal ground speed is what makes the
      // comparison with a horizontal detour meaningful rather than arbitrary.
      const tentative = g + link.seconds * NOMINAL_SPEED;
      if (tentative >= (gScore.get(nKey) ?? Infinity)) continue;
      gScore.set(nKey, tentative);
      cameFrom.set(nKey, current.key);
      cameVia.set(nKey, link.id);
      surfaceOf.set(nKey, other);
      open.push({ key: nKey, f: tentative + heuristic(landing.point, goalCell.point) });
    }
  }

  return reconstruct(nav, cameFrom, cameVia, surfaceOf, bestKey, false);
}

const EMPTY_PATH: PathResult = { points: [], length: 0, exposure: 0, links: [], ok: false };

function heuristic(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function reconstruct(
  nav: Nav,
  cameFrom: ReadonlyMap<number, number>,
  cameVia: ReadonlyMap<number, string>,
  surfaceOf: ReadonlyMap<number, string>,
  endKey: number,
  ok: boolean,
): PathResult {
  const keys: number[] = [];
  let cursor: number | undefined = endKey;
  const guard = new Set<number>();
  while (cursor !== undefined && !guard.has(cursor)) {
    guard.add(cursor);
    keys.push(cursor);
    cursor = cameFrom.get(cursor);
  }
  keys.reverse();

  const points: NavPoint[] = [];
  const links: string[] = [];
  let length = 0;
  let exposureSum = 0;

  for (const k of keys) {
    const surface = surfaceOf.get(k);
    if (!surface) continue;
    const grid = nav.grids.get(surface);
    if (!grid) continue;
    const centre = cellCentre(grid, k % SURFACE_STRIDE);
    const previous = points[points.length - 1];
    if (previous && previous.surface === surface) {
      length += Math.hypot(centre.x - previous.x, centre.z - previous.z);
    }
    exposureSum += grid.exposure[k % SURFACE_STRIDE] ?? 0;
    points.push({ surface, x: centre.x, z: centre.z });
    const via = cameVia.get(k);
    if (via) links.push(via);
  }

  return {
    points,
    length,
    exposure: points.length > 0 ? exposureSum / points.length : 0,
    links,
    ok: ok && points.length > 0,
  };
}

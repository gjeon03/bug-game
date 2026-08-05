import { findPath, isWalkable, nearestWalkable, type NavPoint } from '../world/nav';
import { mm } from '../world/units';
import type { RegionId } from '../world/types';
import { ROUTE_DECAY, logEvent, pushCue } from './state';
import type { Route, RouteHealth, Run } from './types';

/**
 * Pheromone routes: the supply lines the player draws.
 *
 * ## The drawn line is the player's, the walkability is ours
 *
 * A route is not "an A* result the player asked for". The player drags a line and that line's
 * *geometry* is kept — it decides which cells the column walks, and therefore how much light it
 * crosses and how much evidence it leaves. We only repair the parts that are physically impossible.
 *
 * That distinction is the whole mechanic. If we replaced the drawing with a shortest path, every
 * player would get the same route and the hallway chapter would have nothing to be about.
 */

/** Drawn points closer together than this are dropped; the player's hand is not a spline. */
const MIN_SPACING = mm(70);
/** A drawn segment longer than this is subdivided before validation, so it cannot skip a wall. */
const MAX_SEGMENT = mm(190);
/** How far a route end may sit from its nest or target and still count as connected. */
export const LINK_RADIUS = mm(230);

export interface DrawnPoint {
  readonly surface: string;
  readonly x: number;
  readonly z: number;
}

/**
 * Turn a drawn polyline into a route.
 *
 * Returns `null` when the drawing cannot be made into anything usable — too short, or naming a
 * nest or source that does not exist. Every other failure produces a route with an unhealthy
 * `health`, because a route the player can see is broken is far more useful than one that never
 * appeared at all.
 */
export function createRoute(
  run: Run,
  nestId: string,
  targetId: string,
  drawn: readonly DrawnPoint[],
): Route | null {
  const nest = run.house.footholds.get(nestId);
  const target = run.house.resources.get(targetId);
  if (!nest || !target) return null;

  const points = repair(run, drawn);
  if (points.length < 2) return null;

  const route: Route = {
    id: `route.${run.nextRouteId++}`,
    nest: nestId,
    target: targetId,
    points,
    links: [],
    strength: 1,
    exposure: 0,
    length: 0,
    health: 'ok',
    deliveries: 0,
    assigned: 0,
    washedFor: 0,
    regions: [],
  };

  measure(run, route);
  route.health = evaluate(run, route);
  run.routes.push(route);

  const head = points[0]!;
  const y = run.house.surfaces.get(head.surface)?.y ?? 0;
  pushCue(run, 'route.laid', head.x, y, head.z);
  logEvent(run, 'log.route.laid', 'good', { target: target.labelKey });
  return route;
}

/**
 * Make a drawn line walkable without discarding its shape.
 *
 * Walkable stretches are kept verbatim. Where the line crosses something solid — a fridge, a sofa
 * leg, a wall — the impassable span is replaced by an A* detour between the last good point and the
 * next one, with exposure weighting turned right down so the repair takes the *short* way round
 * rather than quietly rerouting the player's whole line along the baseboards.
 */
function repair(run: Run, drawn: readonly DrawnPoint[]): NavPoint[] {
  const dense = densify(drawn);
  const out: NavPoint[] = [];
  let gapStart: NavPoint | null = null;

  for (const point of dense) {
    if (!isWalkable(run.nav, point.surface, point.x, point.z)) {
      // Inside something solid. Remember where we left legal space and keep scanning.
      if (!gapStart) gapStart = out[out.length - 1] ?? null;
      continue;
    }

    if (gapStart) {
      const detour = findPath(run.nav, gapStart, point, { exposureWeight: 0.15 });
      if (detour.ok) for (const p of detour.points) out.push(p);
      gapStart = null;
    }

    const last = out[out.length - 1];
    if (!last || last.surface !== point.surface || dist(last, point) >= MIN_SPACING) {
      out.push({ surface: point.surface, x: point.x, z: point.z });
    }
  }

  return out;
}

function densify(drawn: readonly DrawnPoint[]): DrawnPoint[] {
  const out: DrawnPoint[] = [];
  for (let i = 0; i < drawn.length; i++) {
    const a = drawn[i]!;
    out.push(a);
    const b = drawn[i + 1];
    if (!b || b.surface !== a.surface) continue;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.floor(d / MAX_SEGMENT);
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      out.push({ surface: a.surface, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

function dist(a: NavPoint, b: NavPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Recompute length, exposure and which regions a route passes through. */
export function measure(run: Run, route: Route): void {
  let length = 0;
  let exposureSum = 0;
  const regions = new Set<RegionId>();
  const links: string[] = [];

  for (let i = 0; i < route.points.length; i++) {
    const p = route.points[i]!;
    const grid = run.nav.grids.get(p.surface);
    if (grid) {
      const c = Math.floor((p.x - grid.x0) / grid.cell);
      const r = Math.floor((p.z - grid.z0) / grid.cell);
      if (c >= 0 && r >= 0 && c < grid.cols && r < grid.rows) {
        exposureSum += grid.exposure[r * grid.cols + c] ?? 0;
      }
    }
    const region = run.house.regionOf.get(p.surface);
    if (region) regions.add(region);

    const previous = route.points[i - 1];
    if (!previous) continue;
    if (previous.surface === p.surface) {
      length += dist(previous, p);
    } else {
      // A surface change can only have happened through a link; find which one.
      const link = run.nav.links.find(
        (l) =>
          (l.from === previous.surface && l.to === p.surface) ||
          (l.to === previous.surface && l.from === p.surface),
      );
      if (link) links.push(link.id);
    }
  }

  route.length = length;
  route.exposure = route.points.length > 0 ? exposureSum / route.points.length : 0;
  route.regions = [...regions];
  route.links = links;
}

/**
 * What is wrong with this route, in the order the player can act on it.
 *
 * The ordering matters more than the values: "washed" beats "disconnected" beats "congested",
 * because telling someone their route is busy while it is actually under a wet cloth is worse than
 * saying nothing.
 */
export function evaluate(run: Run, route: Route): RouteHealth {
  if (route.washedFor > 0) return 'washed';

  const nest = run.house.footholds.get(route.nest);
  const target = run.house.resources.get(route.target);
  const nestState = run.footholds.get(route.nest);
  if (!nest || !target) return 'disconnected';
  if (!nestState?.claimed || nestState.damage >= 1) return 'disconnected';

  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  if (!first || !last) return 'incomplete';

  const nearNest = Math.hypot(first.x - nest.at.x, first.z - nest.at.z) <= LINK_RADIUS;
  const nearTarget = Math.hypot(last.x - target.at.x, last.z - target.at.z) <= LINK_RADIUS;
  if (!nearNest || !nearTarget) return 'incomplete';

  // Every link the route uses must still exist in the current graph — a gate can be re-sealed and
  // a pipe can be flooded.
  for (const id of route.links) {
    if (!run.nav.links.some((l) => l.id === id)) return 'disconnected';
  }

  const resource = run.resources.get(route.target);
  if (resource && resource.remaining <= 0) return 'blocked';

  // Congestion is per link capacity, not per route: three routes sharing one cable is the classic
  // way a player's network stops scaling, and it should say so.
  for (const id of route.links) {
    const link = run.nav.links.find((l) => l.id === id);
    if (!link) continue;
    const users = run.workers.filter((w) => w.alive && w.climb?.link === id).length;
    if (users > link.capacity) return 'congested';
  }

  const region = route.regions[route.regions.length - 1];
  if (region) {
    const state = run.regions.get(region);
    if (state && state.alert >= 3) return 'compromised';
  }

  return 'ok';
}

export function updateRoutes(run: Run, dt: number): void {
  for (let i = run.routes.length - 1; i >= 0; i--) {
    const route = run.routes[i]!;

    if (route.washedFor > 0) route.washedFor = Math.max(0, route.washedFor - dt);

    // Traffic holds a route open; neglect closes it. A route nobody walks fades out on its own,
    // which is what stops the map filling with abandoned lines the player never has to tidy.
    const traffic = route.assigned > 0 ? route.assigned * 0.05 : 0;
    route.strength = Math.min(1, Math.max(0, route.strength - (ROUTE_DECAY - traffic) * dt));

    route.health = evaluate(run, route);

    if (route.strength <= 0) {
      run.routes.splice(i, 1);
      for (const worker of run.workers) {
        if (worker.route === route.id) {
          worker.route = '';
          worker.state = 'idle';
        }
      }
      logEvent(run, 'log.route.faded', 'warn', {});
    }
  }
}

export function eraseRoute(run: Run, id: string): void {
  const index = run.routes.findIndex((r) => r.id === id);
  if (index < 0) return;
  const [removed] = run.routes.splice(index, 1);
  for (const worker of run.workers) {
    if (worker.route === id) {
      worker.route = '';
      worker.state = 'idle';
    }
  }
  const head = removed?.points[0];
  if (head) {
    const y = run.house.surfaces.get(head.surface)?.y ?? 0;
    pushCue(run, 'route.erased', head.x, y, head.z);
  }
}

/**
 * Rebuild every route against the current navigation graph.
 *
 * Called when a gate opens, because a new link can turn a disconnected route into a working one —
 * and because a route drawn through a doorway that has just been sealed must stop pretending.
 */
export function revalidateRoutes(run: Run): void {
  for (const route of run.routes) {
    // Snap any point that is no longer legal back to the nearest cell that is.
    route.points = route.points.map((p) => {
      if (isWalkable(run.nav, p.surface, p.x, p.z)) return p;
      const hit = nearestWalkable(run.nav, p.surface, p.x, p.z);
      return hit ? { surface: p.surface, x: hit.point.x, z: hit.point.z } : p;
    });
    measure(run, route);
    route.health = evaluate(run, route);
  }
}

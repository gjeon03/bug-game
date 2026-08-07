import { LINK_RADIUS, createRoute, eraseRoute, type DrawnPoint } from './routes';
import { logEvent } from './state';
import { mm } from '../world/units';
import type { Run } from './types';

/**
 * Laying a pheromone route by walking it.
 *
 * ## Why this lives in the simulation and not in the input layer
 *
 * It used to live in `game/boot.ts` as a pointer drag, and `tests/bot.ts` could not reach it — so
 * the bot called `createRoute` directly with a polyline from `findPath`, conjuring a route between
 * two points it had never travelled. Every balance number this project has ever recorded was
 * measured through a path no player can use. A reviewer put it plainly: a bot allowed to skip the
 * mechanic proves the balance of a game nobody plays.
 *
 * Here, both the keyboard and the bot call the same three functions, and neither can produce a
 * route without the scout physically walking it.
 *
 * ## Why walking fixes vertical routes
 *
 * A drag sampled screen points and stamped every one onto `run.scout.surface` as it was at the
 * moment of the drag, so a route could never cross from the floor to the worktop — vertical routes
 * were structurally impossible in a game whose entire subject is vertical space. The trail records
 * the surface the scout is actually standing on at each step, so climbing mid-trail just works.
 */

/** How far the scout must travel before the trail records another point. */
const TRAIL_STEP = mm(70);

/** The scout must be this close to a refuge to start, or to a source to seal. */
export const TRAIL_REACH = LINK_RADIUS;

/**
 * Fewest samples a sealed trail may hold.
 *
 * Two, and it stays two. Raising it to four looked like the right hardening after a two-point route
 * turned out to render as nothing — and it immediately refused the first route the game offers,
 * because `kitchen.drip.trap` sits under the same sink as `kitchen.undersink` and a supply line
 * between them is legitimately about 150 mm long. A minimum length would have deleted real content
 * to paper over a renderer bug.
 *
 * The invisibility was never about the number of points. `view/routes.ts` tapered its ribbon to
 * exactly zero width at both ends, so a two-point line had no non-degenerate triangles at all; the
 * taper now has a floor and a short route draws as a short route.
 */
const MIN_TRAIL_POINTS = 2;

export interface Trail {
  readonly nest: string;
  readonly points: DrawnPoint[];
}

/** The claimed refuge within reach on the scout's own surface, if any. */
export function nestInReach(run: Run): string {
  let best = '';
  let distance = TRAIL_REACH;
  for (const [id, state] of run.footholds) {
    if (!state.claimed || state.damage >= 1) continue;
    const site = run.house.footholds.get(id);
    if (!site || site.surface !== run.scout.surface) continue;
    const d = Math.hypot(site.at.x - run.scout.x, site.at.z - run.scout.z);
    if (d < distance) {
      distance = d;
      best = id;
    }
  }
  return best;
}

/** The discovered source within reach on the scout's own surface, if any. */
export function sourceInReach(run: Run): string {
  let best = '';
  let distance = TRAIL_REACH;
  for (const [id, state] of run.resources) {
    if (!state.found || state.remaining <= 0) continue;
    const site = run.house.resources.get(id);
    if (!site || site.surface !== run.scout.surface) continue;
    const d = Math.hypot(site.at.x - run.scout.x, site.at.z - run.scout.z);
    if (d < distance) {
      distance = d;
      best = id;
    }
  }
  return best;
}

/** Begin laying. Only possible standing on a claimed refuge. Returns whether it started. */
export function startTrail(run: Run): boolean {
  if (run.trail) return false;
  const nest = nestInReach(run);
  if (!nest) {
    logEvent(run, 'log.route.needNest', 'warn', {});
    return false;
  }
  run.trail = {
    nest,
    points: [{ surface: run.scout.surface, x: run.scout.x, z: run.scout.z }],
  };
  logEvent(run, 'log.route.started', 'info', {});
  run.idleFor = 0;
  return true;
}

/**
 * Record where the scout is, if it has moved far enough to be worth a point.
 *
 * Called from inside the fixed simulation step, so the recorded line is the line the scout actually
 * walked rather than whatever the render clock happened to catch.
 */
export function extendTrail(run: Run): void {
  const trail = run.trail;
  if (!trail) return;
  const last = trail.points[trail.points.length - 1];
  const moved =
    !last ||
    last.surface !== run.scout.surface ||
    Math.hypot(last.x - run.scout.x, last.z - run.scout.z) >= TRAIL_STEP;
  if (moved) trail.points.push({ surface: run.scout.surface, x: run.scout.x, z: run.scout.z });
}

/** Finish at a source. Returns whether a route was created. */
export function sealTrail(run: Run): boolean {
  const trail = run.trail;
  if (!trail) return false;
  extendTrail(run);
  const target = sourceInReach(run);
  if (!target) {
    logEvent(run, 'log.route.needSource', 'warn', {});
    return false;
  }
  /*
   * A line has to be long enough to be a line.
   *
   * Two points is 70 mm — half the scout's own reach, and shorter than the 230 mm radius that
   * decides whether the ends are attached to anything. It produced routes the HUD listed as
   * `· 2 · 정상` and the renderer drew as a stub, which is how a two-vertex ribbon with a
   * taper-to-zero end cap ended up invisible without anybody noticing the route was degenerate
   * either. Four points is a walk, not a twitch.
   */
  if (trail.points.length < MIN_TRAIL_POINTS) {
    logEvent(run, 'log.route.tooShort', 'warn', {});
    return false;
  }
  const made = createRoute(run, trail.nest, target, trail.points);
  run.trail = null;
  run.idleFor = 0;
  return made !== null;
}

export function cancelTrail(run: Run): void {
  if (!run.trail) return;
  run.trail = null;
  logEvent(run, 'log.route.cancelled', 'info', {});
}

/** Drop the route whose nearest point is closest to the scout. */
export function eraseNearestRoute(run: Run): boolean {
  if (run.trail) {
    cancelTrail(run);
    return true;
  }
  let bestId = '';
  let best = TRAIL_REACH * 3;
  for (const route of run.routes) {
    for (const point of route.points) {
      if (point.surface !== run.scout.surface) continue;
      const d = Math.hypot(point.x - run.scout.x, point.z - run.scout.z);
      if (d < best) {
        best = d;
        bestId = route.id;
      }
    }
  }
  if (!bestId) {
    logEvent(run, 'log.route.noneNear', 'warn', {});
    return false;
  }
  eraseRoute(run, bestId);
  run.idleFor = 0;
  return true;
}

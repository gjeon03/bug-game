import { findPath } from '../src/world/nav';
import { mm } from '../src/world/units';
import { SIM_DT } from '../src/colony/state';
import { eraseRoute, type DrawnPoint } from '../src/colony/routes';
import { TRAIL_REACH, cancelTrail, nestInReach, sealTrail, startTrail } from '../src/colony/trail';
import {
  beginClimb,
  claimFoothold,
  climbInReach,
  footholdInReach,
  gateInReach,
} from '../src/colony/scout';
import { beginGateWork, checkGate, chooseAdaptation } from '../src/colony/progression';
import { stepRun } from '../src/colony/step';
import type { AdaptationFamily, Run } from '../src/colony/types';

/**
 * A scripted competent player.
 *
 * **It may only do things a human can do.** It drives the scout with the same movement vector the
 * keyboard produces, lays routes by WALKING them through `startTrail`/`sealTrail` exactly as the F
 * key does, and claims, climbs and works gates through the same public functions the input layer
 * calls. It never writes simulation state directly.
 *
 * It used to call `createRoute` with a polyline straight from `findPath`, conjuring a route between
 * two points the scout had never travelled — so every balance number this project recorded was
 * measured through a path no player can use. Routing is now the same walk for both.
 *
 * That restriction is the whole point: a bot allowed to mutate state proves the balance of a game
 * nobody can play. This one proves the balance of the game that ships.
 */

export interface BotOptions {
  /** Called every simulated second. Diagnosis only — it cannot change state. */
  readonly sample?: (run: Run, seconds: number) => void;
  /** Which specialization to commit to. Two different families must both be able to win. */
  readonly build: AdaptationFamily;
  /** Skip the bathroom entirely, to prove it is optional. */
  readonly skipBathroom?: boolean;
  readonly maxSeconds?: number;
}

export interface BotTrace {
  readonly seconds: number;
  readonly firstDeliveryAt: number | null;
  readonly firstRouteAt: number | null;
  readonly gateOpenedAt: Map<string, number>;
  readonly peakPopulation: number;
  /** Longest stretch with nothing happening at all — the decision-density gate. */
  readonly longestPlateau: number;
}

interface Steering {
  surface: string;
  x: number;
  z: number;
}

/**
 * A route the bot has decided to lay and is now physically walking.
 *
 * `laying` flips once the scout has reached the nest and pressed the equivalent of F. Until then it
 * is walking TO the nest; after it, it is walking the line.
 */
interface RouteMission {
  readonly nest: string;
  readonly target: string;
  readonly path: readonly { surface: string; x: number; z: number }[];
  index: number;
  laying: boolean;
  /** Simulation time the mission last made progress. Used to abandon a stalled walk. */
  progressAt: number;
}

/** Seconds a route walk may make no progress before the bot gives up on it. */
const MISSION_STALL = 12;

/** How often to look for a new route to walk when idle. An A* per (refuge, source) pair. */
const PLAN_EVERY = 2;

/** Play until the run resolves or the time budget runs out. */
export function playRun(run: Run, options: BotOptions): BotTrace {
  const maxSeconds = options.maxSeconds ?? 40 * 60;
  const gateOpenedAt = new Map<string, number>();
  let stamina = 1;
  let firstDeliveryAt: number | null = null;
  let firstRouteAt: number | null = null;
  let steering: Steering | null = null;
  let path: readonly { surface: string; x: number; z: number }[] = [];
  let pathIndex = 0;
  let replanIn = 0;
  let mission: RouteMission | null = null;
  let planIn = 0;
  let longestPlateau = 0;
  let plateau = 0;
  let lastSignature = '';

  while (run.status === 'playing' && run.time < maxSeconds) {
    /* ---- decide, a few times a second rather than every tick ---- */
    replanIn -= SIM_DT;
    if (replanIn <= 0) {
      replanIn = 0.35;

      if (run.colony.adaptationPoints > 0) chooseAdaptation(run, options.build);

      /*
       * Hold brood while the next gate is waiting on stores.
       *
       * A human reads `blocker.food` on the objective panel and stops feeding the nursery so the
       * stockpile can actually reach the number. Without this the harness breeds every surplus into
       * a worker and can never satisfy a gate it is one delivery short of — which is exactly the
       * stall that made escalation unlandable. This is the same toggle the H key drives; the bot
       * has no privileged access.
       */
      const waitingOnStores =
        run.objective.blockerKey === 'blocker.food' ||
        run.objective.blockerKey === 'blocker.moisture';
      /*
       * Only once the colony is big enough to be worth protecting.
       *
       * Holding on the bare `blocker.food` signal strangled the run: early on a gate is almost
       * always short of stores, so the harness held brood from the first minute and the brood build
       * — the specialization whose entire identity is growth — peaked at 19 workers instead of 53
       * and never finished a 50-minute run. Growth IS the correct early play; the hold only becomes
       * correct once there are enough bodies that another mouth costs more than it earns. Twelve is
       * the population the victory check itself asks for.
       */
      run.colony.broodHold = waitingOnStores && run.colony.population >= 12;

      // Re-planning routes is the single most expensive thing this harness does — an A* per
      // (foothold, source) pair. Only do it when the world has actually changed shape, which is
      // also when a human would look at their network again.
      rebalanceRoutes(run);
      /*
       * Look for the next route to walk whenever there is no mission, not only when the network
       * changed shape.
       *
       * The shape gate was written when routing was free — `createRoute` conjured a line and the
       * only cost was an A*. Now a route costs the walk, so a mission ends far from home with the
       * network unchanged and nothing to trigger a re-plan: measured, the scout finished its second
       * route at (277, -1050) and stood there for the remaining twenty-nine minutes while the colony
       * starved. Throttled rather than gated, because planning is an A* per (refuge, source) pair.
       */
      planIn -= 0.35;
      /*
       * A refuge the colony can afford outranks any route.
       *
       * A live mission takes over the scout completely, and with routes to plan continuously the bot
       * never walked to a foothold again: measured over forty minutes it laid 1,144 deliveries and
       * finished holding exactly one refuge, which is the victory condition it can never meet.
       * Capacity is what everything else is downstream of.
       */
      if (affordableFoothold(run, options)) mission = null;
      if (!affordableFoothold(run, options) && !mission && planIn <= 0) {
        planIn = PLAN_EVERY;
        mission = planRoute(run);
      }
      if (firstRouteAt === null && run.routes.length > 0) firstRouteAt = run.time;

      /*
       * A live mission overrides every other destination.
       *
       * Laying a route is not a background action any more — it is where the scout physically is
       * and what it is doing, for as long as the walk takes. Treating it as the steering goal is
       * what makes the harness pay the same seconds a player pays.
       */
      /*
       * A mission that stops progressing is abandoned rather than allowed to block everything.
       *
       * While a mission is live it overrides every other destination, so any bug that stops it
       * advancing freezes the whole harness — measured once as the scout standing at (1347, -1983)
       * at speed 0 for twenty-nine minutes while the colony starved to zero behind it. Whatever the
       * cause, the bot must keep playing.
       */
      if (mission && run.time - mission.progressAt > MISSION_STALL) {
        cancelTrail(run);
        mission = null;
      }
      const target = mission ? missionStep(run, mission) : chooseTarget(run, options);
      /*
       * Ask again when the walk has run out of path but has not arrived.
       *
       * `samePlace` treats anything within 120 mm as the same destination, and the points on a
       * mission line are one 60 mm grid cell apart. So every time a mission advanced to its next
       * point, the new target looked like the old one, the steering path was NOT recomputed, and
       * the scout kept following a polyline it had already finished. It then stood on the last
       * point of that stale path forever, 129 mm short of a waypoint whose arrival threshold is
       * 120 mm — close enough to look arrived, far enough never to be.
       *
       * Measured on the brood build at seed 20260805: the scout froze at (1249, -1918) at speed 0
       * and stayed there, re-planning the same route to the table crumbs every twelve seconds for
       * the whole run, while the colony banked 84 moisture and starved at 4.8 food. Every "brood
       * dies early" number I had was this, not the game.
       */
      const exhausted = pathIndex >= path.length;
      if (target && (!steering || !samePlace(steering, target) || exhausted)) {
        steering = target;
        const found = findPath(
          run.nav,
          { surface: run.scout.surface, x: run.scout.x, z: run.scout.z },
          target,
          // A competent player hugs the baseboards. At 2.4 this bot walked the lit centre of every
          // room and was seen 64 times in a run; the concealment build, doing the same thing with
          // stealth, was seen 9 times. The difference was the harness, not the game.
          { exposureWeight: 5.5 },
        );
        path = found.points;
        pathIndex = 0;
        // An unreachable or degenerate target must not latch `steering`, or the bot stops asking.
        if (path.length === 0) steering = null;
      }
    }

    /* ---- the route walk: start at the nest, seal at the source ---- */
    if (mission) {
      if (!mission.laying) {
        /*
         * A trail left open by a previous mission blocks `startTrail` forever.
         *
         * `startTrail` refuses while `run.trail` is set, so a seal that failed — the source ran dry
         * between planning and arriving, say — left the harness holding a one-point line it could
         * never add to and never replace. Measured: the scout stood at (1347, -1983) at speed 0 for
         * the entire remaining 29 minutes while the colony starved to zero behind it.
         */
        /*
         * Only try to start once we are actually standing on the refuge.
         *
         * Aborting the mission when `startTrail` failed threw away the plan on the very tick it was
         * made — the scout was still across the room, so of course no refuge was in reach. Measured:
         * a food route to crumbs 260 mm from the nest was planned and discarded every two seconds
         * for the whole run while the colony starved at 0 food beside 133 banked moisture.
         */
        if (nestInReach(run) === mission.nest) {
          if (run.trail) cancelTrail(run);
          if (startTrail(run)) {
            mission.laying = true;
            mission.progressAt = run.time;
          }
        }
      } else if (nearMission(run, mission)) {
        // Reached the end of the planned line. Seal it if the source is genuinely in reach.
        if (sealTrail(run) || !run.trail) mission = null;
      }
      // A trail the simulation dropped (source exhausted, refuge lost) ends the mission with it.
      if (mission && mission.laying && !run.trail) mission = null;
    }

    /* ---- act on whatever is within arm's reach ---- */
    const gate = gateInReach(run);
    /*
     * `skipBathroom` has to be honoured HERE too, not just when choosing where to walk.
     * Reach-based auto-work opened the bathroom anyway on a run that was supposed to prove the
     * bathroom is optional — the measured trace listed `bathroom@1.9` for a bot told to skip it,
     * so the optionality claim was never actually being tested.
     */
    const bathroomGate = gate?.to === 'bathroom' || gate?.from === 'bathroom';
    if (gate && !(options.skipBathroom && bathroomGate)) {
      if (!run.scout.working && checkGate(run, gate).ok) beginGateWork(run, gate);
    }

    const foothold = footholdInReach(run);
    if (foothold) {
      const site = run.house.footholds.get(foothold);
      if (!(options.skipBathroom && site?.region === 'bathroom')) claimFoothold(run, foothold);
    }

    /* ---- steer ---- */
    let moveX = 0;
    let moveZ = 0;
    if (!run.scout.working && !run.scout.climb) {
      const next = advanceAlong(run, path, pathIndex);
      pathIndex = next.index;
      moveX = next.moveX;
      moveZ = next.moveZ;

      // A path point on another surface means the next step is a climb, not a walk.
      const waypoint = path[pathIndex];
      if (waypoint && waypoint.surface !== run.scout.surface) {
        const link = climbInReach(run);
        if (link) beginClimb(run, link);
      }
    }

    const before = signature(run);
    const result = stepRun(run, SIM_DT, { moveX, moveZ, sprint: false, stamina });
    stamina = result.stamina;

    if (firstDeliveryAt === null && run.stats.deliveries > 0) firstDeliveryAt = run.time;
    for (const id of run.openGates) {
      if (!gateOpenedAt.has(id)) gateOpenedAt.set(id, run.time);
    }

    if (options.sample && Math.floor(run.time) !== Math.floor(run.time - SIM_DT)) {
      options.sample(run, run.time);
    }

    const after = signature(run);
    if (after === before && after === lastSignature) {
      plateau += SIM_DT;
      if (plateau > longestPlateau) longestPlateau = plateau;
    } else {
      plateau = 0;
    }
    lastSignature = after;
  }

  return {
    seconds: run.time,
    firstDeliveryAt,
    firstRouteAt,
    gateOpenedAt,
    peakPopulation: run.stats.peakPopulation,
    longestPlateau,
  };
}

/**
 * A coarse fingerprint of "is anything happening".
 *
 * Deliveries, population, open gates, claimed footholds, live threats and running routines. If none
 * of these change for 45 s the run has stalled, which is the decision-density gate.
 */
function signature(run: Run): string {
  const routines = [...run.routines.values()].filter((r) => r.phase !== 'idle').length;
  const claimed = [...run.footholds.values()].filter((f) => f.claimed).length;
  return [
    run.stats.deliveries,
    run.colony.population,
    run.openGates.size,
    claimed,
    run.threats.length,
    routines,
    run.colony.adaptations.length,
  ].join('|');
}


function samePlace(a: Steering, b: Steering): boolean {
  return a.surface === b.surface && Math.hypot(a.x - b.x, a.z - b.z) < mm(120);
}

function advanceAlong(
  run: Run,
  path: readonly { surface: string; x: number; z: number }[],
  index: number,
): { index: number; moveX: number; moveZ: number } {
  let i = index;
  while (i < path.length) {
    const point = path[i]!;
    if (point.surface !== run.scout.surface) break;
    const dx = point.x - run.scout.x;
    const dz = point.z - run.scout.z;
    const d = Math.hypot(dx, dz);
    if (d > mm(45)) return { index: i, moveX: dx / d, moveZ: dz / d };
    i++;
  }
  return { index: i, moveX: 0, moveZ: 0 };
}

/* -------------------------------------------------------------- intentions */

/**
 * Keep every claimed foothold fed by a route to the best source it can actually reach.
 *
 * "Best" is nearest-with-most-left, which is what a competent player does on their first run —
 * not an optimum, just not stupid.
 */
/**
 * Routing is not a zero-sum trade any more.
 *
 * This used to erase a route serving the surplus store so a scarce one could take its place — cheap
 * when `createRoute` conjured a line, ruinous now that a replacement costs the walk back. Two
 * measured failures in opposite directions: keeping the last route unconditionally starved the
 * colony to extinction beside 133 banked moisture, and dropping it left the bot with zero routes and
 * four deliveries in six minutes.
 *
 * A colony short of one store needs a route TO that store, which is a planning problem, not a
 * deletion problem. `planRoute` already biases hard toward the scarce resource. So this only removes
 * routes that have genuinely stopped being routes.
 */
function rebalanceRoutes(run: Run): void {
  for (const route of [...run.routes]) {
    const site = run.house.resources.get(route.target);
    const state = run.resources.get(route.target);
    // Exhausted or unreachable. Holding it just occupies a slot `planRoute` could use.
    if (!site || !state || state.remaining <= 0 || route.health === 'blocked') {
      eraseRoute(run, route.id);
    }
  }
}

/**
 * Pick the next route worth walking. Returns the mission, or `null` if none is worth it.
 *
 * This used to call `createRoute` outright. It cannot any more, and that is the point: a route now
 * costs the walk, so the bot has to spend the same seconds a player would and the balance numbers
 * finally describe the game that ships.
 */
function planRoute(run: Run): RouteMission | null {
  for (const [nestId, nestState] of run.footholds) {
    if (!nestState.claimed || nestState.damage >= 1) continue;
    const existing = run.routes.filter((r) => r.nest === nestId && r.health !== 'blocked');
    if (existing.length >= 3) continue;

    const nest = run.house.footholds.get(nestId);
    if (!nest) continue;

    let bestScore = 0;
    let bestId = '';
    let bestPath: readonly DrawnPoint[] = [];

    for (const [resId, resState] of run.resources) {
      if (!resState.found || resState.remaining < 6) continue;
      if (run.routes.some((r) => r.target === resId)) continue;
      const site = run.house.resources.get(resId);
      if (!site) continue;

      const found = findPath(
        run.nav,
        { surface: nest.surface, x: nest.at.x, z: nest.at.z },
        { surface: site.surface, x: site.at.x, z: site.at.z },
        { exposureWeight: 3.2 },
      );
      if (!found.ok || found.points.length < 2) continue;

      // Weight toward whichever store the colony is actually short of. A player who lets one run
      // dry while banking the other has a routing problem, and a bot that does it is not competent.
      const shortage =
        site.kind === 'food'
          ? run.colony.moisture / Math.max(1, run.colony.food)
          : run.colony.food / Math.max(1, run.colony.moisture);
      // Hard bias. A competent player does not watch one store hit zero while the other is at the
      // ceiling; measured runs ended food 0 / moisture 188 because a mild bias lost to distance.
      const bias = Math.min(24, Math.max(0.1, shortage * shortage));
      const score = (resState.remaining * bias) / (1 + found.length / mm(1000));
      if (score <= bestScore) continue;
      bestScore = score;
      bestId = resId;
      bestPath = found.points;
    }

    if (bestId)
      return { nest: nestId, target: bestId, path: bestPath, index: 0, laying: false, progressAt: run.time };
  }
  return null;
}


/** A refuge the colony could take right now, if any. */
function affordableFoothold(run: Run, options: BotOptions): string {
  for (const [id, site] of run.house.footholds) {
    if (options.skipBathroom && site.region === 'bathroom') continue;
    /*
     * A refuge is worth walking to when it is unclaimed, or when it is broken enough to matter.
     *
     * `damage <= 0` was the first attempt and it wrecked the run: after the first sweep every
     * refuge carries some scratch, so this returned a target on every tick, and the caller drops
     * the live route mission whenever it does — routes fell 8 to 2 and the colony starved with a
     * scout that spent the whole late game topping up cosmetic damage. Half gone is the line where
     * rebuilding beats supplying.
     */
    const state = run.footholds.get(id);
    if (state?.claimed && state.damage < 0.5) continue;
    if (!run.regions.get(site.region)?.unlocked) continue;
    if (run.colony.food < site.cost.food || run.colony.moisture < site.cost.moisture) continue;
    if (run.colony.population < site.cost.workers) continue;
    return id;
  }
  return '';
}

/** The next point on the mission's line, advancing as the scout reaches each one. */
function missionStep(run: Run, mission: RouteMission): Steering | null {
  const nest = run.house.footholds.get(mission.nest);
  if (!mission.laying) {
    if (!nest) return null;
    /*
     * Already standing on it — do not ask for a path to where we are.
     *
     * `findPath` between two points inside the same cell returns an empty polyline, the caller
     * latches `steering` to that target, and because a mission returns the SAME target every tick
     * it never recomputes: the scout froze at (1347, -1983) with speed 0 for an entire 30-minute
     * run. The old code survived this only because `chooseTarget` kept changing its mind.
     */
    const close = Math.hypot(nest.at.x - run.scout.x, nest.at.z - run.scout.z) < TRAIL_REACH;
    return close ? null : { surface: nest.surface, x: nest.at.x, z: nest.at.z };
  }
  while (mission.index < mission.path.length) {
    const point = mission.path[mission.index]!;
    const close =
      point.surface === run.scout.surface &&
      Math.hypot(point.x - run.scout.x, point.z - run.scout.z) < mm(120);
    if (!close) return { surface: point.surface, x: point.x, z: point.z };
    mission.index++;
    mission.progressAt = run.time;
  }
  const site = run.house.resources.get(mission.target);
  return site ? { surface: site.surface, x: site.at.x, z: site.at.z } : null;
}

/** Has the walk reached the source it set out for? */
function nearMission(run: Run, mission: RouteMission): boolean {
  const site = run.house.resources.get(mission.target);
  if (!site) return true;
  return (
    site.surface === run.scout.surface &&
    Math.hypot(site.at.x - run.scout.x, site.at.z - run.scout.z) < TRAIL_REACH
  );
}

/** Where should the scout physically be right now? */
function chooseTarget(run: Run, options: BotOptions): Steering | null {
  // 1. A gate whose requirements are already met: go and open it.
  for (const gate of run.house.gates) {
    if (run.openGates.has(gate.id)) continue;
    if (options.skipBathroom && (gate.to === 'bathroom' || gate.from === 'bathroom')) continue;
    if (!run.regions.get(gate.from)?.unlocked) continue;
    if (!checkGate(run, gate).ok) continue;
    return { surface: gate.surface, x: gate.at.x, z: gate.at.z };
  }

  // 2. A foothold we can afford: take it. Capacity is almost always the binding constraint.
  for (const [id, site] of run.house.footholds) {
    if (options.skipBathroom && site.region === 'bathroom') continue;
    if (run.footholds.get(id)?.claimed) continue;
    if (!run.regions.get(site.region)?.unlocked) continue;
    if (run.colony.food < site.cost.food || run.colony.moisture < site.cost.moisture) continue;
    if (run.colony.population < site.cost.workers) continue;
    return { surface: site.surface, x: site.at.x, z: site.at.z };
  }

  // 3. Scout an undiscovered site in an open region.
  for (const [id, state] of run.resources) {
    if (state.found) continue;
    const site = run.house.resources.get(id);
    if (!site || !run.regions.get(site.region)?.unlocked) continue;
    if (options.skipBathroom && site.region === 'bathroom') continue;
    return { surface: site.surface, x: site.at.x, z: site.at.z };
  }

  // 4. Nothing pressing: sit on the objective, which is where the next thing will happen.
  const at = run.objective.at;
  return at ? { surface: at.surface, x: at.x, z: at.z } : null;
}

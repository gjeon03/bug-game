import { findPath } from '../src/world/nav';
import { mm } from '../src/world/units';
import { SIM_DT } from '../src/colony/state';
import { createRoute, eraseRoute, type DrawnPoint } from '../src/colony/routes';
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
 * keyboard produces, draws routes by handing `createRoute` a polyline the way a mouse drag does,
 * and claims, climbs and works gates through the same public functions the input layer calls. It
 * never writes simulation state directly.
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
  let longestPlateau = 0;
  let plateau = 0;
  let lastSignature = '';
  let lastShape = '';

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
      const shape = routeShape(run);
      if (shape !== lastShape) {
        lastShape = shape;
        maybeDrawRoute(run);
      }
      if (firstRouteAt === null && run.routes.length > 0) firstRouteAt = run.time;

      const target = chooseTarget(run, options);
      if (target && (!steering || !samePlace(steering, target))) {
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
      }
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

/** Changes only when the set of nests, routes or known sources changes. */
function routeShape(run: Run): string {
  const claimed = [...run.footholds.entries()].filter(([, f]) => f.claimed && f.damage < 1).length;
  const found = [...run.resources.values()].filter((r) => r.found && r.remaining >= 6).length;
  const starved = run.colony.food < 6 ? 'F' : run.colony.moisture < 6 ? 'M' : '-';
  return `${claimed}|${found}|${run.routes.length}|${starved}|${run.routes.map((r) => r.target).join(',')}`;
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
 * Abandon a route so a starving store can be served.
 *
 * A competent player does not watch one resource hit zero while every one of their supply lines
 * feeds the other. This harness used to: `maybeDrawRoute` caps each foothold at two routes and only
 * reconsiders when the network's shape changes, so once all eight routes served food the colony
 * died of thirst standing next to a full drain trap — measured with `driedUp: 0`, moisture 0,
 * population 0, 270 deliveries.
 */
function rebalanceRoutes(run: Run): void {
  const { food, moisture } = run.colony;
  const starving: 'food' | 'moisture' | null =
    moisture < 6 && food > moisture * 3
      ? 'moisture'
      : food < 6 && moisture > food * 3
        ? 'food'
        : null;
  if (!starving) return;

  const serves = (kind: 'food' | 'moisture'): number =>
    run.routes.filter((r) => run.house.resources.get(r.target)?.kind === kind && r.health === 'ok')
      .length;
  if (serves(starving) > 0) return;

  // Drop the least productive route feeding the resource we already have too much of.
  const surplus = starving === 'food' ? 'moisture' : 'food';
  const victim = run.routes
    .filter((r) => run.house.resources.get(r.target)?.kind === surplus)
    .sort((a, b) => a.deliveries - b.deliveries)[0];
  if (victim) eraseRoute(run, victim.id);
}

function maybeDrawRoute(run: Run): void {
  for (const [nestId, nestState] of run.footholds) {
    if (!nestState.claimed || nestState.damage >= 1) continue;
    const existing = run.routes.filter((r) => r.nest === nestId && r.health !== 'blocked');
    if (existing.length >= 2) continue;

    const nest = run.house.footholds.get(nestId);
    if (!nest) continue;

    let bestId = '';
    let bestScore = 0;
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

    if (bestId) createRoute(run, nestId, bestId, bestPath);
  }
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

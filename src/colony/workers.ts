import { findPath, isWalkable, nearestWalkable } from '../world/nav';
import { mm } from '../world/units';
import {
  CARGO_VALUE,
  EVIDENCE_PER_DELIVERY,
  ROUTE_REINFORCE,
  WORKER_SPEED,
  logEvent,
  pushCue,
  regionState,
} from './state';
import type { Route, Run, Worker } from './types';

/**
 * Worker behaviour.
 *
 * ## The reliability contract is a feature, not a QA item
 *
 * A colony game lives or dies on whether the little bodies look like they are *doing something*.
 * The previous build's worst-reviewed defect was workers piling into a chain at a route endpoint,
 * and the fix is not "better pathfinding" — it is an explicit recovery ladder plus endpoint
 * queueing, both of which are visible in the fiction rather than hidden corrections:
 *
 * - a worker with no useful progress enters a **visible** recovery state (it stops and casts about,
 *   then re-plans) rather than being silently teleported;
 * - the ladder escalates — swap lanes, skip the waypoint, and only then a walk of shame home;
 * - collection points hold a fixed number of slots, so a queue forms *beside* the food rather than
 *   inside it.
 */

/** How close counts as arrived at a route point. */
const ARRIVE = mm(58);
/** Below this much movement per second, a worker is not making useful progress. */
const PROGRESS_EPSILON = mm(26);
/** Seconds without progress before recovery begins. The contract's threshold is 2 s. */
const STUCK_LIMIT = 1.7;
/** Bodies closer than this push each other apart. A German cockroach is ~12 mm across. */
const PERSONAL_SPACE = mm(17);
/** Concurrent collectors per resource site. Beyond this, workers wait in the queue ring. */
const COLLECT_SLOTS = 3;

const SEPARATION_STRENGTH = 5.2;

export function updateWorkers(run: Run, dt: number): void {
  assignRoutes(run);

  for (const route of run.routes) route.assigned = 0;

  for (const worker of run.workers) {
    if (!worker.alive) continue;
    worker.prevX = worker.x;
    worker.prevZ = worker.z;
    worker.prevY = worker.y;
    worker.age += dt;

    const route = worker.route ? run.routes.find((r) => r.id === worker.route) : undefined;
    if (route) route.assigned++;

    if (worker.climb) {
      advanceClimb(run, worker, dt);
      continue;
    }

    switch (worker.state) {
      case 'outbound':
      case 'inbound':
        travel(run, worker, dt, route);
        break;
      case 'collecting':
        collect(run, worker, dt, route);
        break;
      case 'delivering':
        deliver(run, worker, route);
        break;
      case 'fleeing':
        flee(run, worker, dt);
        break;
      default:
        loiter(run, worker, dt);
    }
  }

  separate(run, dt);
  detectStuck(run, dt);
}

/* -------------------------------------------------------------- assignment */

/**
 * Give idle workers the route that most needs them.
 *
 * "Most needs them" is deliberately simple — fewest workers per unit of route length — because a
 * cleverer allocator makes the player's own routing decisions matter less. The colony should
 * faithfully execute a bad plan.
 */
function assignRoutes(run: Run): void {
  const usable = run.routes.filter((r) => r.health === 'ok' || r.health === 'congested');
  if (usable.length === 0) return;

  for (const worker of run.workers) {
    if (!worker.alive || worker.route || worker.state !== 'idle') continue;

    let best: Route | null = null;
    let bestLoad = Infinity;
    for (const route of usable) {
      const load = route.assigned / Math.max(1, route.length / mm(400));
      if (load < bestLoad) {
        bestLoad = load;
        best = route;
      }
    }
    if (!best) continue;

    worker.route = best.id;
    worker.leg = 0;
    worker.state = 'outbound';
    best.assigned++;

    // A worker hatched at a satellite must be able to actually reach the route head. If it cannot,
    // the route is not connected to this worker's nest and the assignment is withdrawn.
    const head = best.points[0];
    if (head && (worker.surface !== head.surface || far(worker, head, mm(900)))) {
      const path = findPath(
        run.nav,
        { surface: worker.surface, x: worker.x, z: worker.z },
        { surface: head.surface, x: head.x, z: head.z },
      );
      if (!path.ok) {
        worker.route = '';
        worker.state = 'idle';
        best.assigned--;
      }
    }
  }
}

function far(worker: Worker, point: { x: number; z: number }, limit: number): boolean {
  return Math.hypot(worker.x - point.x, worker.z - point.z) > limit;
}

/* ------------------------------------------------------------------ travel */

function travel(run: Run, worker: Worker, dt: number, route: Route | undefined): void {
  if (!route || route.points.length < 2) {
    worker.state = 'idle';
    worker.route = '';
    return;
  }

  const outbound = worker.state === 'outbound';
  const target = route.points[worker.leg];
  if (!target) {
    // Ran off the end of the polyline: that is the arrival condition for both directions.
    worker.state = outbound ? 'collecting' : 'delivering';
    worker.leg = outbound ? route.points.length - 1 : 0;
    return;
  }

  if (target.surface !== worker.surface) {
    beginClimb(run, worker, target.surface, dt);
    return;
  }

  // The lane offset is applied perpendicular to the direction of travel, which is what turns a
  // shared route into a column of bodies rather than a single-file conga line.
  const ahead = route.points[worker.leg + (outbound ? 1 : -1)] ?? target;
  let nx = ahead.x - worker.x;
  let nz = ahead.z - worker.z;
  const nlen = Math.hypot(nx, nz) || 1;
  nx /= nlen;
  nz /= nlen;
  const goalX = target.x - nz * worker.lane;
  const goalZ = target.z + nx * worker.lane;

  const remaining = moveToward(run, worker, goalX, goalZ, WORKER_SPEED * speedScale(run) * dt);

  if (remaining <= ARRIVE) {
    worker.leg += outbound ? 1 : -1;
    if (outbound && worker.leg >= route.points.length) {
      worker.state = 'collecting';
      worker.leg = route.points.length - 1;
    } else if (!outbound && worker.leg < 0) {
      worker.state = 'delivering';
      worker.leg = 0;
    }
  }
}

/** Scavenging adaptations make the whole column quicker. */
function speedScale(run: Run): number {
  const tiers = run.colony.adaptations.filter((a) => a.family === 'scavenging').length;
  return 1 + 0.16 * tiers;
}

/**
 * Move toward a goal, sliding along anything solid instead of stopping dead against it.
 *
 * Returns the remaining distance to the goal so the caller can decide whether it arrived.
 */
function moveToward(
  run: Run,
  worker: Worker,
  goalX: number,
  goalZ: number,
  budget: number,
): number {
  const dx = goalX - worker.x;
  const dz = goalZ - worker.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-4) return 0;

  const stepLength = Math.min(budget, distance);
  const ux = dx / distance;
  const uz = dz / distance;

  const nextX = worker.x + ux * stepLength;
  const nextZ = worker.z + uz * stepLength;

  if (isWalkable(run.nav, worker.surface, nextX, nextZ)) {
    worker.x = nextX;
    worker.z = nextZ;
  } else if (isWalkable(run.nav, worker.surface, nextX, worker.z)) {
    worker.x = nextX; // slide along a Z-facing wall
  } else if (isWalkable(run.nav, worker.surface, worker.x, nextZ)) {
    worker.z = nextZ; // slide along an X-facing wall
  }

  worker.heading = Math.atan2(ux, uz);
  worker.speed = stepLength;
  return Math.hypot(goalX - worker.x, goalZ - worker.z);
}

/* ------------------------------------------------------------------ climbs */

function beginClimb(run: Run, worker: Worker, toSurface: string, dt: number): void {
  const link = run.nav.links.find(
    (l) =>
      (l.from === worker.surface && l.to === toSurface) ||
      (l.to === worker.surface && l.from === toSurface),
  );
  if (!link) {
    worker.state = 'idle';
    worker.route = '';
    return;
  }

  const forward = link.from === worker.surface;
  const mouth = forward ? link.at : (link.exitAt ?? link.at);

  // Capacity is enforced at the mouth, so a queue forms on the floor where the player can see it
  // rather than inside the geometry of the cable.
  const onLink = run.workers.filter((w) => w.alive && w.climb?.link === link.id).length;
  if (onLink >= link.capacity) {
    moveToward(run, worker, mouth.x, mouth.z, WORKER_SPEED * 0.35 * dt);
    return;
  }

  const remaining = moveToward(run, worker, mouth.x, mouth.z, WORKER_SPEED * dt);
  if (remaining > ARRIVE) return;

  worker.climb = { link: link.id, progress: 0, from: worker.surface, to: toSurface };
  worker.state = 'climbing';
}

function advanceClimb(run: Run, worker: Worker, dt: number): void {
  const climb = worker.climb;
  if (!climb) return;
  const link = run.nav.links.find((l) => l.id === climb.link);
  if (!link) {
    worker.climb = null;
    worker.state = 'idle';
    return;
  }

  climb.progress += dt / link.seconds;

  const fromY = run.house.surfaces.get(climb.from)?.y ?? 0;
  const toY = run.house.surfaces.get(climb.to)?.y ?? 0;
  const forward = link.from === climb.from;
  const mouth = forward ? link.at : (link.exitAt ?? link.at);
  const landing = forward ? (link.exitAt ?? link.at) : link.at;
  const t = Math.min(1, climb.progress);

  worker.x = mouth.x + (landing.x - mouth.x) * t;
  worker.z = mouth.z + (landing.z - mouth.z) * t;
  worker.y = fromY + (toY - fromY) * t;

  if (climb.progress < 1) return;

  worker.surface = climb.to;
  worker.y = toY;
  const spot = nearestWalkable(run.nav, climb.to, worker.x, worker.z);
  if (spot) {
    worker.x = spot.point.x;
    worker.z = spot.point.z;
  }
  worker.climb = null;
  worker.state = worker.cargo > 0 ? 'inbound' : 'outbound';
}

/* --------------------------------------------------------- collect, deliver */

function collect(run: Run, worker: Worker, dt: number, route: Route | undefined): void {
  if (!route) {
    worker.state = 'idle';
    return;
  }
  const site = run.house.resources.get(route.target);
  const state = run.resources.get(route.target);
  if (!site || !state || state.remaining <= 0) {
    worker.state = 'inbound';
    worker.leg = Math.max(0, route.points.length - 1);
    return;
  }

  // Queue discipline: only the first few workers at a site actually extract. The rest hold a ring
  // around it, which is what a real cluster looks like and what stops the pile-up.
  const collectors = run.workers.filter(
    (w) => w.alive && w.state === 'collecting' && w.route === worker.route,
  );
  const rank = collectors.indexOf(worker);
  if (rank >= COLLECT_SLOTS) {
    const angle = (rank / Math.max(1, collectors.length)) * Math.PI * 2;
    moveToward(
      run,
      worker,
      site.at.x + Math.cos(angle) * mm(120),
      site.at.z + Math.sin(angle) * mm(120),
      WORKER_SPEED * 0.5 * dt,
    );
    return;
  }

  const capacityTiers = run.colony.adaptations.filter((a) => a.family === 'scavenging').length;
  const rate = site.rate * (1 + 0.25 * capacityTiers);
  const taken = Math.min(dt * rate * 0.22, state.remaining, 1 - worker.cargo);
  worker.cargo += taken;
  state.remaining -= taken;
  state.disturbed = Math.min(1, state.disturbed + taken * site.disturbance * 0.12);
  worker.cargoKind = site.kind;
  worker.speed = 0;

  if (worker.cargo >= 1 || state.remaining <= 0) {
    worker.state = 'inbound';
    worker.leg = Math.max(0, route.points.length - 1);
    pushCue(run, 'worker.pickup', worker.x, worker.y, worker.z);
  }
}

function deliver(run: Run, worker: Worker, route: Route | undefined): void {
  if (!route) {
    worker.state = 'idle';
    return;
  }
  const amount = worker.cargo;
  if (amount > 0 && worker.cargoKind) {
    const scavenging = run.colony.adaptations.filter((a) => a.family === 'scavenging').length;
    const yielded = amount * CARGO_VALUE * (1 + 0.2 * scavenging);
    if (worker.cargoKind === 'food') run.colony.food += yielded;
    else run.colony.moisture += yielded;

    route.deliveries++;
    route.strength = Math.min(1, route.strength + ROUTE_REINFORCE);
    run.stats.deliveries++;

    // Evidence is the price of the delivery, and it is charged where the traffic actually was.
    const site = run.house.resources.get(route.target);
    const shadow = run.colony.adaptations.filter((a) => a.family === 'shadow').length;
    const stealth = 1 / (1 + 0.3 * shadow);
    const cost =
      EVIDENCE_PER_DELIVERY * (0.4 + route.exposure) * (1 + (site?.disturbance ?? 0) * 2) * stealth;
    for (const region of route.regions) {
      const state = regionState(run, region);
      state.evidence = Math.min(1, state.evidence + cost);
    }

    pushCue(run, 'worker.deliver', worker.x, worker.y, worker.z, yielded);
    if (run.stats.deliveries === 1) logEvent(run, 'log.firstDelivery', 'good', {});
  }

  worker.cargo = 0;
  worker.cargoKind = null;
  worker.state = 'outbound';
  worker.leg = 0;
}

/* ---------------------------------------------------------- idle and panic */

function loiter(run: Run, worker: Worker, dt: number): void {
  const site = run.house.footholds.get(worker.home);
  if (!site) return;
  const wander = mm(90);
  const goalX = site.at.x + Math.cos(worker.age * 0.8 + worker.id) * wander;
  const goalZ = site.at.z + Math.sin(worker.age * 0.6 + worker.id) * wander;
  moveToward(run, worker, goalX, goalZ, WORKER_SPEED * 0.32 * dt);
}

function flee(run: Run, worker: Worker, dt: number): void {
  const site = run.house.footholds.get(worker.home);
  if (!site) {
    worker.state = 'idle';
    return;
  }
  if (worker.surface !== site.surface) {
    beginClimb(run, worker, site.surface, dt);
    return;
  }
  const remaining = moveToward(run, worker, site.at.x, site.at.z, WORKER_SPEED * 1.45 * dt);
  if (remaining <= ARRIVE) worker.state = 'idle';
}

/** Send everything within `radius` of a point running for its home nest. */
export function panic(run: Run, x: number, z: number, radius: number): void {
  for (const worker of run.workers) {
    if (!worker.alive || worker.climb) continue;
    if (Math.hypot(worker.x - x, worker.z - z) > radius) continue;
    worker.state = 'fleeing';
    worker.cargo = 0;
    worker.cargoKind = null;
    worker.route = '';
  }
}

/* ------------------------------------------------- separation and recovery */

/**
 * Push overlapping bodies apart.
 *
 * Bucketed by nav cell so this stays linear in worker count. Workers on different surfaces never
 * interact, which matters: a worker on the worktop is 880 mm above one on the floor and they are
 * not, in fact, standing on each other.
 */
function separate(run: Run, dt: number): void {
  const buckets = new Map<string, Worker[]>();
  const size = PERSONAL_SPACE * 2;

  for (const worker of run.workers) {
    if (!worker.alive || worker.climb) continue;
    const key = `${worker.surface}|${Math.floor(worker.x / size)}|${Math.floor(worker.z / size)}`;
    const list = buckets.get(key);
    if (list) list.push(worker);
    else buckets.set(key, [worker]);
  }

  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= PERSONAL_SPACE || d < 1e-5) continue;
        const push = ((PERSONAL_SPACE - d) / PERSONAL_SPACE) * SEPARATION_STRENGTH * dt * 60;
        const ux = (dx / d) * push;
        const uz = (dz / d) * push;
        if (isWalkable(run.nav, a.surface, a.x - ux, a.z - uz)) {
          a.x -= ux;
          a.z -= uz;
        }
        if (isWalkable(run.nav, b.surface, b.x + ux, b.z + uz)) {
          b.x += ux;
          b.z += uz;
        }
      }
    }
  }
}

/**
 * The recovery ladder.
 *
 * Each rung is more disruptive than the last and every one of them is visible: the worker stops and
 * casts about before it does anything, so the player reads "it is confused" rather than "the game
 * glitched". Only the final rung abandons the job, and that one is rare enough to be worth the
 * honesty of an explicit cue.
 */
function detectStuck(run: Run, dt: number): void {
  for (const worker of run.workers) {
    if (!worker.alive || worker.climb) continue;

    if (worker.recoverFor > 0) {
      worker.recoverFor -= dt;
      worker.speed = 0;
      continue;
    }

    const moved = Math.hypot(worker.x - worker.prevX, worker.z - worker.prevZ) / Math.max(dt, 1e-6);
    const settled = worker.state === 'collecting' || worker.state === 'idle';
    if (moved > PROGRESS_EPSILON || settled) {
      worker.stuckFor = 0;
      continue;
    }

    worker.stuckFor += dt;
    if (worker.stuckFor < STUCK_LIMIT) continue;

    // Rung 1: swap lanes. Two workers deadlocked in a doorway resolve here most of the time.
    if (worker.stuckFor < STUCK_LIMIT * 2) {
      worker.lane = -worker.lane || mm(24);
      worker.recoverFor = 0.25;
      continue;
    }

    // Rung 2: give up on this waypoint and aim at the next one.
    const route = run.routes.find((r) => r.id === worker.route);
    if (route && worker.stuckFor < STUCK_LIMIT * 3) {
      worker.leg = Math.max(
        0,
        Math.min(route.points.length - 1, worker.leg + (worker.state === 'outbound' ? 1 : -1)),
      );
      worker.recoverFor = 0.3;
      worker.stuckFor = STUCK_LIMIT * 2.1;
      continue;
    }

    // Rung 3: walk of shame. Drop the cargo, go home, start again.
    pushCue(run, 'worker.recover', worker.x, worker.y, worker.z);
    worker.cargo = 0;
    worker.cargoKind = null;
    worker.route = '';
    worker.state = 'fleeing';
    worker.stuckFor = 0;
    worker.recoverFor = 0.4;
  }
}

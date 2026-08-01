import { clamp01, dist2 } from '../core/math.ts';
import {
  ADOPT_MIN_ALIGN,
  ERASE_RADIUS,
  EVIDENCE_BASELINE,
  ERASE_RATE,
  FOLLOW_RADIUS,
  LINK_RADIUS,
  MAX_NODES_PER_ROUTE,
  MAX_ROUTES,
  NODE_LIFE,
  NODE_SPACING,
  RESERVE_COST,
  RESERVE_MAX,
  RESERVE_REGEN,
} from './constants.ts';
import { coverAt, exposureFrom, staticLightAt } from './field.ts';
import type { Route, TrailNode } from './types.ts';
import type { World } from './world.ts';

/**
 * Pheromone routing — the game's differentiator.
 *
 * A route is a polyline of decaying nodes secreted by the scout's own body. It only does work when
 * one end sits on a claimed nest and the other on a live resource; that "linked" state is the single
 * most important readout in the game, so it is recomputed every step and edge-detected for feedback.
 */

function newRoute(world: World): Route {
  const route: Route = {
    id: world.nextRouteId++,
    nodes: [],
    nestEnd: -1,
    resEnd: -1,
    resourceId: null,
    nestId: null,
    linked: false,
    dry: false,
    wasLinked: false,
    wasDry: false,
    exposure: 0,
    traffic: 0,
    age: 0,
  };
  world.routes.push(route);
  // Retire the oldest route rather than refusing input: the player should never feel blocked. But
  // say so — an eviction that deletes the colony's only water line in silence is the worst kind of
  // failure this game can produce.
  while (world.routes.length > MAX_ROUTES) {
    const victim = world.routes.shift();
    if (!victim) break;
    releaseWorkers(world, victim.id);
    const last = victim.nodes[victim.nodes.length - 1];
    world.events.push({ t: 'routeLost', x: last?.x ?? 0, y: last?.y ?? 0 });
    world.hint = `Only ${MAX_ROUTES} trails at once — the oldest one dissolved.`;
    world.hintKey = 'evicted';
    world.hintTime = 5;
  }
  return route;
}

function releaseWorkers(world: World, routeId: number): void {
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive || w.routeId !== routeId) continue;
    w.routeId = -1;
    w.nodeIndex = -1;
    // A worker mid-haul keeps its cargo and walks home on its own.
    w.state = w.carrying ? 'inbound' : 'idle';
  }
}

/** Called from the scout update while the lay input is held. */
export function layTrail(world: World, x: number, y: number, heading: number): void {
  if (world.reserve < RESERVE_COST) return;

  let route = world.activeRouteId >= 0 ? getRoute(world, world.activeRouteId) : null;
  if (!route) {
    // Starting a lay right where an existing trail ends *continues* that trail rather than opening a
    // new one. Without this, every touch-up of an existing route burned a slot, so the cap meant
    // "five key presses" instead of "five supply lines" and quietly evicted a line the player needed.
    route = adoptNearbyRoute(world, x, y, heading);
    if (!route) route = newRoute(world);
    world.activeRouteId = route.id;
  }

  const nodes = route.nodes;
  const last = nodes.length > 0 ? nodes[nodes.length - 1] : null;
  let dx: number;
  let dy: number;
  if (last) {
    const d2 = dist2(last.x, last.y, x, y);
    if (d2 < NODE_SPACING * NODE_SPACING) return;
    const d = Math.sqrt(d2);
    dx = (x - last.x) / d;
    dy = (y - last.y) / d;
  } else {
    dx = Math.cos(heading);
    dy = Math.sin(heading);
  }

  if (nodes.length >= MAX_NODES_PER_ROUTE) {
    // Rolling window: the head of a very long trail evaporates as the tail extends.
    nodes.shift();
  }

  const cover = coverAt(x, y);
  const node: TrailNode = {
    x,
    y,
    dx,
    dy,
    life: NODE_LIFE,
    i: nodes.length > 0 ? nodes[nodes.length - 1].i + 1 : 0,
    exposure: exposureFrom(staticLightAt(x, y), cover),
  };
  nodes.push(node);
  world.reserve -= RESERVE_COST;
  world.stats.trailNodesLaid++;
  if (world.stats.firstTrailAt < 0) world.stats.firstTrailAt = world.time;
  world.events.push({ t: 'trailLaid', x, y });
}

/**
 * Finds a route the scout is *continuing*, so a lay extends it instead of burning a slot.
 *
 * Proximity alone cannot decide this. Every route anchored on a nest has to start inside
 * LINK_RADIUS to link at all, so several genuinely different supply lines out of the same crack
 * are unavoidably clustered — measured at under one node spacing apart. A distance-only rule loose
 * enough to catch a real re-lay would merge them, and the player could never build a second line
 * from the same door. Heading is what separates them: continuing a line points the same way the
 * line was already going; fanning a new line out of the same crack does not.
 */
function adoptNearbyRoute(world: World, x: number, y: number, heading: number): Route | null {
  // Generous, because heading is doing the discriminating now: a lay stops laying up to a full
  // node spacing before the scout stops walking, so a genuine resume starts ~2 spacings out.
  const reach = NODE_SPACING * 2.5;
  const hx = Math.cos(heading);
  const hy = Math.sin(heading);
  let best: Route | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < world.routes.length; i++) {
    const r = world.routes[i];
    if (r.nodes.length === 0) continue;
    const tail = r.nodes[r.nodes.length - 1];
    const d = dist2(tail.x, tail.y, x, y);
    if (d > reach * reach) continue;
    // Within ~60 degrees of the direction that trail was last heading.
    const align = tail.dx * hx + tail.dy * hy;
    if (align < ADOPT_MIN_ALIGN) continue;
    // Re-laying is overwhelmingly about repairing a line whose source ran dry, or finishing one
    // that never reached anything — prefer those over a healthy, linked line.
    const score = align + (r.dry || !r.linked ? 1 : 0) - d / (reach * reach);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

export function getRoute(world: World, id: number): Route | null {
  for (let i = 0; i < world.routes.length; i++) {
    if (world.routes[i].id === id) return world.routes[i];
  }
  return null;
}

/** Dissolves pheromone near a point. Breaking a route in the middle truncates it, as expected. */
export function eraseTrail(world: World, x: number, y: number, dt: number): boolean {
  const r2 = ERASE_RADIUS * ERASE_RADIUS;
  let touched = false;
  for (let i = 0; i < world.routes.length; i++) {
    const nodes = world.routes[i].nodes;
    for (let j = 0; j < nodes.length; j++) {
      const n = nodes[j];
      if (dist2(n.x, n.y, x, y) > r2) continue;
      n.life -= ERASE_RATE * dt;
      touched = true;
    }
  }
  return touched;
}

/** Sends every worker back to the colony and drops all route assignments. */
export function recallWorkers(world: World): void {
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive) continue;
    if (w.state === 'trapped') continue;
    w.routeId = -1;
    w.nodeIndex = -1;
    w.state = w.carrying ? 'inbound' : 'idle';
    w.lostTime = 0;
  }
}

/** Removes dead nodes and truncates a route to its longest surviving contiguous run. */
function compactRoute(route: Route): void {
  const nodes = route.nodes;
  let anyDead = false;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].life <= 0) {
      anyDead = true;
      break;
    }
  }
  if (!anyDead) return;

  let bestStart = 0;
  let bestLen = 0;
  let start = -1;
  for (let i = 0; i <= nodes.length; i++) {
    const alive = i < nodes.length && nodes[i].life > 0;
    if (alive) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      const len = i - start;
      if (len > bestLen) {
        bestLen = len;
        bestStart = start;
      }
      start = -1;
    }
  }
  route.nodes = bestLen > 0 ? nodes.slice(bestStart, bestStart + bestLen) : [];
}

export function updatePheromone(world: World, dt: number): void {
  world.reserve = Math.min(RESERVE_MAX, world.reserve + RESERVE_REGEN * dt);

  let exposedTrail = 0;
  let totalNodes = 0;

  for (let i = world.routes.length - 1; i >= 0; i--) {
    const route = world.routes[i];
    route.age += dt;
    const nodes = route.nodes;

    // A live supply line is maintained by the colony itself and decays at less than half rate; an
    // unlinked trail evaporates at full rate. Without this, a patrol scattering the workforce for a
    // few seconds was enough to lose every route the player had built.
    const decay = dt * (route.linked ? 0.4 : 1);
    // `shadow1` — Wall-hugging scent. A node laid under cabinetry lasts longer, which is the whole
    // point of paying for it. This effect existed in the trait struct and was read nowhere, so the
    // adaptation was a pure downside: 22 food for a 12 % hauling penalty.
    const coveredLife = world.traits.coveredTrailLifeMult;
    for (let j = 0; j < nodes.length; j++) {
      const n = nodes[j];
      n.life -= n.exposure <= EVIDENCE_BASELINE ? decay / coveredLife : decay;
    }
    compactRoute(route);

    if (route.nodes.length === 0) {
      if (route.linked) world.events.push({ t: 'routeLost', x: 0, y: 0 });
      releaseWorkers(world, route.id);
      if (world.activeRouteId === route.id) world.activeRouteId = -1;
      world.routes.splice(i, 1);
      continue;
    }

    totalNodes += route.nodes.length;

    // Link detection: either end may be the nest end, whichever the player walked first.
    const a = route.nodes[0];
    const b = route.nodes[route.nodes.length - 1];
    const nestA = nearestNest(world, a.x, a.y);
    const nestB = nearestNest(world, b.x, b.y);
    const resA = nearestResource(world, a.x, a.y);
    const resB = nearestResource(world, b.x, b.y);

    route.nestEnd = -1;
    route.resEnd = -1;
    route.nestId = null;
    route.resourceId = null;

    if (nestA && resB) {
      route.nestEnd = 0;
      route.resEnd = 1;
      route.nestId = nestA;
      route.resourceId = resB;
    } else if (nestB && resA) {
      route.nestEnd = 1;
      route.resEnd = 0;
      route.nestId = nestB;
      route.resourceId = resA;
    } else if (nestA) {
      route.nestEnd = 0;
      route.nestId = nestA;
    } else if (nestB) {
      route.nestEnd = 1;
      route.nestId = nestB;
    }

    // A route whose source has been stripped bare is *not* linked — no worker can use it — but it
    // stays on screen, flagged dry, so the player can see which supply ran out instead of watching a
    // line silently stop working while the HUD still counts it.
    const anchored = route.nestEnd >= 0 && route.resEnd >= 0 && route.nodes.length >= 3;
    const res = route.resourceId === null ? null : findResourceById(world, route.resourceId);
    route.dry = anchored && !!res && res.depleted;
    if (route.dry && !route.wasDry && res) {
      world.events.push({ t: 'routeDry', x: res.x, y: res.y, resource: res.label });
    }
    route.wasDry = route.dry;
    const linked = anchored && !route.dry;
    if (linked && !route.wasLinked) {
      world.events.push({ t: 'routeLinked', x: b.x, y: b.y });
    } else if (!linked && route.wasLinked) {
      world.events.push({ t: 'routeLost', x: b.x, y: b.y });
      releaseWorkers(world, route.id);
    }
    route.linked = linked;
    route.wasLinked = linked;

    let expSum = 0;
    for (let j = 0; j < route.nodes.length; j++) expSum += route.nodes[j].exposure;
    route.exposure = route.nodes.length ? expSum / route.nodes.length : 0;

    if (linked) {
      // `shadow1` also makes a covered line quieter, so the same geometry leaves less evidence.
      const covered = route.exposure <= EVIDENCE_BASELINE ? world.traits.coveredEvidenceMult : 1;
      for (let j = 0; j < route.nodes.length; j++) {
        const e = route.nodes[j].exposure;
        if (e > EVIDENCE_BASELINE) exposedTrail += (e - EVIDENCE_BASELINE) * covered;
      }
    }

    route.traffic = 0;
  }

  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive || w.routeId < 0) continue;
    const r = getRoute(world, w.routeId);
    if (r) r.traffic++;
  }

  world.exposedTrail = exposedTrail;
  world.pheromoneNodeCount = totalNodes;
}

function findResourceById(world: World, id: string) {
  for (let i = 0; i < world.resources.length; i++) {
    if (world.resources[i].id === id) return world.resources[i];
  }
  return null;
}

function nearestNest(world: World, x: number, y: number): string | null {
  const r2 = LINK_RADIUS * LINK_RADIUS;
  let best: string | null = null;
  let bestD = r2;
  for (let i = 0; i < world.nests.length; i++) {
    const n = world.nests[i];
    if (!n.claimed) continue;
    const d = dist2(n.x, n.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

function nearestResource(world: World, x: number, y: number): string | null {
  const r2 = LINK_RADIUS * LINK_RADIUS;
  let best: string | null = null;
  let bestD = r2;
  for (let i = 0; i < world.resources.length; i++) {
    const r = world.resources[i];
    // A drained node still anchors its route: the line stays on screen so the player can see which
    // supply ran dry, instead of the whole route silently vanishing along with its workforce.
    if (r.unlockOp > world.operation) continue;
    const d = dist2(r.x, r.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = r.id;
    }
  }
  return best;
}

/**
 * Finds the array index of the route node nearest to (x, y), using `hint` for a local search first.
 * Returns -1 when nothing is within {@link FOLLOW_RADIUS}.
 */
export function nearestNodeIndex(route: Route, x: number, y: number, hint: number): number {
  const nodes = route.nodes;
  const n = nodes.length;
  if (n === 0) return -1;
  const limit = FOLLOW_RADIUS * FOLLOW_RADIUS;

  let best = -1;
  let bestD = limit;

  if (hint >= 0) {
    const lo = Math.max(0, hint - 14);
    const hi = Math.min(n - 1, hint + 14);
    for (let i = lo; i <= hi; i++) {
      const d = dist2(nodes[i].x, nodes[i].y, x, y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) return best;
  }

  for (let i = 0; i < n; i++) {
    const d = dist2(nodes[i].x, nodes[i].y, x, y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Route strength at a node index, used for rendering and for worker confidence. */
export function nodeStrength(node: TrailNode): number {
  return clamp01(node.life / NODE_LIFE);
}

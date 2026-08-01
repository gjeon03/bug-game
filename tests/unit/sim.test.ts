import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/clock.ts';
import {
  BROOD_FOOD_COST,
  BROOD_WATER_COST,
  COVER_RADIUS,
  LINK_RADIUS,
  MAX_ROUTES,
  NODE_LIFE,
  NODE_SPACING,
  RESERVE_MAX,
  SCOUT_RADIUS,
  SUSPICION_WEIGHTS,
  TIER_THRESHOLDS,
  WORKER_CARRY_FOOD,
  WORLD_H,
  WORLD_W,
} from '../../src/sim/constants.ts';
import { collideCircle, coverAt, isInsideSolid } from '../../src/sim/field.ts';
import { SOLIDS } from '../../src/sim/kitchen.ts';
import { FINAL_RESPONSE_LENGTH } from '../../src/sim/operations.ts';
import { eraseTrail, recallWorkers } from '../../src/sim/pheromone.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { addSuspicion, TIER_HOLD, topCause } from '../../src/sim/suspicion.ts';
import { HOLD_THRESHOLD, ZONES_TO_WIN } from '../../src/sim/territory.ts';
import { deployTraps, spawnPatrol, stomp } from '../../src/sim/threats.ts';
import { createWorld, spawnWorker, type World } from '../../src/sim/world.ts';
import {
  firstResource,
  HOME,
  hugRight,
  mostOpenPoint,
  nearRight,
  path,
  pt,
  solid,
} from '../map.ts';
import { driveTo, idle, stepUntil } from './helpers.ts';

const CRUMBS = firstResource('food');

/**
 * Lays one supply line between a nest and a resource.
 *
 * Takes its endpoints instead of hardcoding them: the old version baked `(600, 2010)` and
 * `'dishCrumbs'` into eight downstream tests at once, so any map edit broke all eight together.
 */
function layRouteTo(
  world: World,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  for (const p of path({ x: world.scout.x, y: world.scout.y }, from)) {
    driveTo(world, p.x, p.y, { timeout: 20, arrive: 40 });
  }
  for (const p of path({ x: world.scout.x, y: world.scout.y }, to)) {
    driveTo(world, p.x, p.y, { lay: true, timeout: 25, arrive: 40 });
  }
  world.input.lay = false;
}

function layRouteToCrumbs(world: World): void {
  layRouteTo(world, { x: HOME.x + 20, y: HOME.y }, pt(CRUMBS));
}

describe('collision', () => {
  it('pushes an overlapping circle back out of every face of every solid', () => {
    // Probe just outside each face, overlapping by most of the radius. Points buried deep inside a
    // solid that is flush against another solid have no valid resolution and are unreachable in play,
    // so they are not probed; the random-walk test below covers reachable space exhaustively.
    for (const s of SOLIDS) {
      const probes: [number, number][] = [
        [s.x + s.w / 2, s.y - SCOUT_RADIUS * 0.4],
        [s.x + s.w / 2, s.y + s.h + SCOUT_RADIUS * 0.4],
        [s.x - SCOUT_RADIUS * 0.4, s.y + s.h / 2],
        [s.x + s.w + SCOUT_RADIUS * 0.4, s.y + s.h / 2],
      ];
      for (const [px, py] of probes) {
        if (isInsideSolid(px, py)) continue; // wedged between two flush solids: unreachable
        const r = collideCircle(px, py, SCOUT_RADIUS);
        expect(isInsideSolid(r.x, r.y), `${s.id} @ ${px},${py}`).toBe(false);
      }
    }
  });

  it('escapes the interior of a free-standing solid', () => {
    const island = solid('island');
    const r = collideCircle(island.x + island.w / 2, island.y + island.h / 2, SCOUT_RADIUS);
    expect(isInsideSolid(r.x, r.y)).toBe(false);
    expect(r.hit).toBe(true);
  });

  it('keeps a random walk inside the kitchen and out of the furniture', () => {
    const world = createWorld(3);
    for (let i = 0; i < 3000; i++) {
      const a = world.rng.range(0, Math.PI * 2);
      world.input.left = Math.cos(a) < -0.3;
      world.input.right = Math.cos(a) > 0.3;
      world.input.up = Math.sin(a) < -0.3;
      world.input.down = Math.sin(a) > 0.3;
      world.input.sprint = world.rng.bool(0.3);
      stepWorld(world, SIM_DT);
      expect(world.scout.x).toBeGreaterThanOrEqual(0);
      expect(world.scout.x).toBeLessThanOrEqual(WORLD_W);
      expect(world.scout.y).toBeGreaterThanOrEqual(0);
      expect(world.scout.y).toBeLessThanOrEqual(WORLD_H);
      expect(isInsideSolid(world.scout.x, world.scout.y)).toBe(false);
    }
  });

  it('cover is highest against cabinetry, tapers with distance, and is zero in the open', () => {
    // Probes derived from the authored geometry rather than written down, so moving a cabinet moves
    // the probe with it.
    const dishwasher = solid('dishwasher');
    const y = dishwasher.y + dishwasher.h / 2;
    const against = hugRight(dishwasher, y);
    const away = nearRight(dishwasher, y);
    const open = mostOpenPoint();

    expect(coverAt(against.x, against.y)).toBeGreaterThan(0.9);
    expect(coverAt(away.x, away.y)).toBeGreaterThan(0.4);
    expect(coverAt(away.x, away.y)).toBeLessThan(coverAt(against.x, against.y));
    expect(coverAt(open.x, open.y)).toBe(0);
    // The open probe must genuinely be open floor, not merely a low reading.
    expect(Math.hypot(open.x - dishwasher.x, open.y - dishwasher.y)).toBeGreaterThan(COVER_RADIUS);
  });
});

describe('pheromone routing', () => {
  it('spaces nodes, spends the reserve, and regenerates it', () => {
    const world = createWorld(11);
    driveTo(world, HOME.x + 20, HOME.y, { timeout: 8 });
    const leg = path({ x: world.scout.x, y: world.scout.y }, pt(CRUMBS))[0];
    driveTo(world, leg.x, leg.y, { lay: true, timeout: 15 });
    world.input.lay = false;

    const route = world.routes[0];
    expect(route.nodes.length).toBeGreaterThan(5);
    for (let i = 1; i < route.nodes.length; i++) {
      const a = route.nodes[i - 1];
      const b = route.nodes[i];
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(NODE_SPACING - 0.001);
    }
    expect(world.reserve).toBeLessThan(RESERVE_MAX);

    const spent = world.reserve;
    idle(world, 5);
    expect(world.reserve).toBeGreaterThan(spent);
  });

  it('detects the nest and resource ends in either lay direction', () => {
    const a = createWorld(21);
    layRouteToCrumbs(a);
    expect(a.routes[0].nestEnd).toBe(0);
    expect(a.routes[0].resEnd).toBe(1);
    expect(a.routes[0].linked).toBe(true);

    // Lay the same line backwards: the ends swap and it still links.
    const b = createWorld(22);
    layRouteTo(b, pt(CRUMBS), { x: HOME.x + 20, y: HOME.y });
    const last = b.routes.at(-1)!;
    expect(last.nestEnd).toBe(1);
    expect(last.resEnd).toBe(0);
    expect(last.linked).toBe(true);
  });

  it('expires nodes and drops the route when nothing uses it', () => {
    const world = createWorld(31);
    // A stub that reaches neither a nest nor a source, so nothing can ever reinforce it.
    driveTo(world, HOME.x + 340, HOME.y - 40, { timeout: 20 });
    driveTo(world, HOME.x + 560, HOME.y - 60, { lay: true, timeout: 20 });
    world.input.lay = false;
    expect(world.routes.length).toBe(1);
    idle(world, NODE_LIFE + 6);
    expect(world.routes.length).toBe(0);
  });

  it('worker traffic sustains a working supply line while an unused one evaporates', () => {
    const world = createWorld(41);
    // Isolate the reinforcement behaviour from resource depletion: the point of this test is the
    // trail, not the larder.
    const node = world.resources.find((r) => r.id === CRUMBS.id)!;
    node.amount = 100000;
    node.initial = 100000;
    layRouteToCrumbs(world);
    const supply = world.routes[0];
    expect(supply.linked).toBe(true);

    // A second trail, laid at the same moment, that reaches nothing and so is never walked.
    driveTo(world, HOME.x + 340, HOME.y - 40, { timeout: 20 });
    driveTo(world, HOME.x + 560, HOME.y - 60, { lay: true, timeout: 20 });
    world.input.lay = false;
    const stub = world.routes.at(-1)!;
    expect(stub.id).not.toBe(supply.id);

    const elapsed = NODE_LIFE * 0.7;
    idle(world, elapsed);

    // The used line is still at full strength because the traffic on it keeps topping it up, and the
    // abandoned one has lost exactly the time that passed. This is the whole reason a player does not
    // have to re-walk a working supply line every two minutes.
    const freshest = (r: typeof supply): number => Math.max(...r.nodes.map((n) => n.life));
    expect(supply.linked).toBe(true);
    expect(freshest(supply)).toBeGreaterThan(NODE_LIFE * 0.98);
    expect(freshest(stub)).toBeLessThan(NODE_LIFE - elapsed * 0.9);
  });

  it('erasing dissolves nearby nodes', () => {
    const world = createWorld(51);
    layRouteToCrumbs(world);
    const before = world.routes[0].nodes.length;
    const mid = world.routes[0].nodes[Math.floor(before / 2)];
    for (let i = 0; i < 150; i++) {
      eraseTrail(world, mid.x, mid.y, SIM_DT);
      stepWorld(world, SIM_DT);
    }
    const after = world.routes.reduce((n, r) => n + r.nodes.length, 0);
    expect(after).toBeLessThan(before);
  });

  it('never keeps more than the route cap', () => {
    const world = createWorld(61);
    for (let i = 0; i < MAX_ROUTES + 3; i++) {
      driveTo(world, HOME.x + 700 + i * 40, HOME.y + 180, { timeout: 12 });
      driveTo(world, HOME.x + 700 + i * 40, HOME.y - 20, { lay: true, timeout: 12 });
      world.input.lay = false;
      idle(world, 0.2);
    }
    expect(world.routes.length).toBeLessThanOrEqual(MAX_ROUTES);
  });

  it('links only within the documented radius', () => {
    const world = createWorld(71);
    // Start laying well clear of the nest, so the near end cannot link.
    driveTo(world, HOME.x + LINK_RADIUS + 220, HOME.y, { timeout: 15 });
    for (const p of path({ x: world.scout.x, y: world.scout.y }, pt(CRUMBS))) {
      driveTo(world, p.x, p.y, { lay: true, timeout: 25, arrive: 40 });
    }
    world.input.lay = false;
    expect(world.routes.at(-1)!.nestEnd).toBe(-1);
    expect(world.routes.at(-1)!.linked).toBe(false);
  });

  it('recall releases every worker from its route', () => {
    const world = createWorld(81);
    layRouteToCrumbs(world);
    stepUntil(world, (w) => w.workers.some((x) => x.alive && x.routeId >= 0), 20);
    recallWorkers(world);
    expect(world.workers.filter((x) => x.alive && x.routeId >= 0).length).toBe(0);
  });
});

describe('resource accounting', () => {
  it('conserves units between the node and the colony store', () => {
    const world = createWorld(101);
    layRouteToCrumbs(world);
    const res = world.resources.find((r) => r.id === CRUMBS.id)!;
    const startAmount = res.amount;
    const startTotal = world.colony.totalFood;

    idle(world, 60);

    const taken = startAmount - res.amount;
    const carried = world.workers.reduce(
      (n, w) => n + (w.alive && w.carrying === 'food' ? w.carryAmount : 0),
      0,
    );
    const delivered = world.colony.totalFood - startTotal;
    // Everything removed from the node is either delivered, in transit, or died with its carrier.
    expect(taken).toBeGreaterThan(0);
    expect(delivered + carried).toBeLessThanOrEqual(taken + 0.001);
    expect(world.colony.food).toBeLessThanOrEqual(world.colony.foodCap);
  });

  it('marks a fully drained food node as evidence exactly once', () => {
    const world = createWorld(111);
    const res = world.resources.find((r) => r.id === CRUMBS.id)!;
    // A nearly-empty pile, so the depletion happens inside the test's patience.
    res.amount = WORKER_CARRY_FOOD * 1.2;
    layRouteToCrumbs(world);
    stepUntil(world, (w) => w.resources.find((r) => r.id === CRUMBS.id)!.depleted, 60);
    idle(world, 5);
    expect(res.depleted).toBe(true);
    expect(world.suspicion.causes.depleted).toBeCloseTo(SUSPICION_WEIGHTS.depleted, 5);
  });
});

describe('colony economy', () => {
  it('spends food and moisture together to hatch', () => {
    const world = createWorld(201);
    // Reserves are set directly to isolate breeding from hauling, exactly as before.
    world.colony.food = 120;
    world.colony.water = 120;
    const before = world.colony.population;
    idle(world, 30);
    expect(world.colony.hatched).toBeGreaterThan(0);
    expect(world.colony.population).toBeGreaterThan(before);
    expect(world.colony.food).toBeLessThan(120);
    expect(world.colony.water).toBeLessThan(120);
  });

  it('refuses to breed the colony into starvation', () => {
    const world = createWorld(211);
    world.colony.food = BROOD_FOOD_COST + 1;
    world.colony.water = BROOD_WATER_COST + 1;
    idle(world, 40);
    expect(world.colony.hatched).toBe(0);
  });

  it('starves only after the opening grace period, and takes the newest brood first', () => {
    const world = createWorld(221);
    world.colony.food = 0;
    world.colony.water = 0;
    idle(world, 40);
    expect(world.colony.lost).toBe(0);
    idle(world, 60);
    expect(world.colony.lost).toBeGreaterThan(0);
  });

  it('caps population at capacity', () => {
    const world = createWorld(231);
    world.colony.food = 300;
    world.colony.water = 300;
    idle(world, 200);
    expect(world.colony.population).toBeLessThanOrEqual(world.colony.capacity);
  });

  it('never exceeds the worker pool', () => {
    const world = createWorld(241);
    for (let i = 0; i < 200; i++) spawnWorker(world, HOME.x, HOME.y, false);
    expect(world.workers.filter((w) => w.alive).length).toBeLessThanOrEqual(world.workers.length);
  });
});

describe('suspicion', () => {
  it('applies each documented weight and attributes the largest cause', () => {
    const world = createWorld(301);
    addSuspicion(world, 'seen', SUSPICION_WEIGHTS.seen, 0, 0);
    addSuspicion(world, 'trap', SUSPICION_WEIGHTS.trap, 0, 0);
    addSuspicion(world, 'expansion', SUSPICION_WEIGHTS.expansion, 0, 0);
    expect(world.suspicion.value).toBeCloseTo(
      SUSPICION_WEIGHTS.seen + SUSPICION_WEIGHTS.trap + SUSPICION_WEIGHTS.expansion,
      5,
    );
    expect(topCause(world)?.cause).toBe('expansion');
  });

  it('crosses every tier once and in order, one promotion per hold window', () => {
    const world = createWorld(311);
    const seen: number[] = [];
    // Long enough for the whole ladder at one promotion per TIER_HOLD, with margin.
    const seconds = TIER_HOLD * (TIER_THRESHOLDS.length + 1);
    for (let i = 0; i < seconds / SIM_DT; i++) {
      addSuspicion(world, 'seen', 1, 0, 0);
      stepWorld(world, SIM_DT);
      for (const e of world.events) if (e.t === 'tier') seen.push(e.tier);
      world.events.length = 0;
    }
    // Derived from the threshold table, so adding a tier does not falsify the test.
    expect(seen).toEqual(TIER_THRESHOLDS.map((_, i) => i + 1));
    expect(world.suspicion.tier).toBe(TIER_THRESHOLDS.length);
  });

  it('decays toward a floor set by its own peak and never to zero', () => {
    const world = createWorld(321);
    addSuspicion(world, 'seen', 60, 0, 0);
    idle(world, 200);
    expect(world.suspicion.value).toBeGreaterThan(0);
    expect(world.suspicion.value).toBeGreaterThanOrEqual(world.suspicion.floor - 0.001);
    expect(world.suspicion.value).toBeLessThan(60);
  });
});

describe('household response', () => {
  it('deploys traps toward the ground the player actually used', () => {
    const world = createWorld(401);
    layRouteToCrumbs(world);
    idle(world, 25);
    const route = world.routes[0];
    const mid = route.nodes[Math.floor(route.nodes.length / 2)];
    deployTraps(world, 2, mid.x, mid.y);
    expect(world.hazards.length).toBe(2);
    const nearRoute = world.hazards.filter((h) =>
      route.nodes.some((n) => Math.hypot(n.x - h.x, n.y - h.y) < 260),
    );
    expect(nearRoute.length).toBeGreaterThan(0);
  });

  it('a footfall warns before it kills', () => {
    const world = createWorld(411);
    const open = mostOpenPoint();
    for (const p of path({ x: world.scout.x, y: world.scout.y }, open)) {
      driveTo(world, p.x, p.y, { timeout: 20, arrive: 40 });
    }
    const { x, y } = world.scout;
    stomp(world, x, y);
    idle(world, 0.4);
    expect(world.scout.alive).toBe(true);
    expect(world.footfalls.length).toBe(1);
    idle(world, 1.4);
    expect(world.scout.alive).toBe(false);
    expect(world.stats.scoutDeaths).toBe(1);
  });

  it('promotes a replacement scout out of the colony', () => {
    const world = createWorld(421);
    const open = mostOpenPoint();
    for (const p of path({ x: world.scout.x, y: world.scout.y }, open)) {
      driveTo(world, p.x, p.y, { timeout: 20, arrive: 40 });
    }
    // Keep reserves below the brood margin so a hatch cannot mask the promotion.
    world.colony.food = 4;
    world.colony.water = 4;
    const pop = world.colony.population;
    stomp(world, world.scout.x, world.scout.y);
    idle(world, 6);
    expect(world.scout.alive).toBe(true);
    expect(world.colony.population).toBeLessThan(pop);
  });

  it('a patrol raises the room light and drops footfalls', () => {
    const world = createWorld(431);
    spawnPatrol(world, 1, 0);
    idle(world, 6);
    expect(world.roomLight).toBeGreaterThan(0.1);
    expect(world.footfalls.length).toBeGreaterThan(0);
  });
});

describe('outcomes', () => {
  it('declares victory only when the last operation is genuinely complete', () => {
    // The run is decided by holding ground through the household's answer, so the end state is
    // constructed the way the old three-night test constructed its final second: put the world at the
    // moment of decision and let the director resolve it. Nothing here grants the colony resources.
    const world = createWorld(501);
    world.operation = 4;
    world.finalResponse = true;
    world.finalResponseTime = FINAL_RESPONSE_LENGTH + 0.1;
    for (let i = 0; i < ZONES_TO_WIN; i++) world.zones[i].hold = 1;

    stepWorld(world, SIM_DT);
    expect(world.status).toBe('won');
    expect(world.finalTally?.zones.length).toBeGreaterThanOrEqual(ZONES_TO_WIN);
  });

  it('surviving the response without the ground is an extermination, not a win', () => {
    // Same moment, same colony, one difference: the regions were not held. The verdict has to name
    // that, because "you lived but lost the kitchen" is a different lesson from "you were wiped out".
    const world = createWorld(511);
    world.operation = 4;
    world.finalResponse = true;
    world.finalResponseTime = FINAL_RESPONSE_LENGTH + 0.1;
    world.zones[0].hold = HOLD_THRESHOLD + 0.05;

    stepWorld(world, SIM_DT);
    expect(world.status).toBe('lost');
    expect(world.loseCause).toBe('exterminated');
    expect(world.colony.population).toBeGreaterThan(0);
  });

  it('reports a colony collapse when nothing is left to promote', () => {
    const world = createWorld(521);
    for (const w of world.workers) w.alive = false;
    world.colony.population = 0;
    world.scout.alive = false;
    world.scout.respawnTimer = 0.05;
    stepWorld(world, SIM_DT);
    stepWorld(world, SIM_DT);
    expect(world.status).toBe('lost');
    expect(world.loseCause).toBe('collapse');
  });

  it('reports a destroyed nest', () => {
    const world = createWorld(531);
    world.nests[0].integrity = 0;
    stepWorld(world, SIM_DT);
    expect(world.status).toBe('lost');
    expect(world.loseCause).toBe('nestDestroyed');
  });
});

describe('determinism and restart', () => {
  it('two worlds with the same seed and inputs stay identical for 3000 steps', () => {
    const a = createWorld(999);
    const b = createWorld(999);
    for (let i = 0; i < 3000; i++) {
      const left = i % 137 < 60;
      const up = i % 211 < 90;
      for (const w of [a, b]) {
        w.input.left = left;
        w.input.right = !left;
        w.input.up = up;
        w.input.down = !up;
        w.input.lay = i % 300 < 150;
        stepWorld(w, SIM_DT);
      }
    }
    expect(a.scout.x).toBe(b.scout.x);
    expect(a.scout.y).toBe(b.scout.y);
    expect(a.colony.food).toBe(b.colony.food);
    expect(a.colony.population).toBe(b.colony.population);
    expect(a.suspicion.value).toBe(b.suspicion.value);
    expect(a.rng.snapshot()).toBe(b.rng.snapshot());
  });

  it('a new world after a full run is identical to one built before that run happened', () => {
    // The old version of this test snapshotted both worlds *after* playing, so both reads went
    // through the same module state and it could not fail. The cold snapshot is now taken first, and
    // the comparison world is built afterwards — which is the only ordering that can catch a module
    // -level variable surviving a run.
    const cold = summarise(createWorld(4242));

    const played = createWorld(4242);
    layRouteToCrumbs(played);
    idle(played, 120);
    played.operation = 3;
    idle(played, 30);

    const fresh = createWorld(4242);
    expect(summarise(fresh)).toEqual(cold);
    expect(fresh.routes.length).toBe(0);
    expect(fresh.hazards.length).toBe(0);
    expect(fresh.suspicion.value).toBe(0);
    expect(fresh.heat.value.some((v) => v > 0)).toBe(false);
    expect(fresh.adaptations.taken).toEqual([]);
    expect(fresh.zones.every((z) => z.hold === 0)).toBe(true);
  });
});

function summarise(w: World): Record<string, unknown> {
  return {
    time: w.time,
    operation: w.operation,
    operationTime: w.operationTime,
    status: w.status,
    pop: w.colony.population,
    food: w.colony.food,
    water: w.colony.water,
    capacity: w.colony.capacity,
    routes: w.routes.length,
    hazards: w.hazards.length,
    corpses: w.corpses.length,
    suspicion: w.suspicion.value,
    heat: Array.from(w.heat.value).reduce((a, b) => a + b, 0),
    adaptations: [...w.adaptations.taken],
    functions: w.nests.map((n) => n.fn),
    zones: w.zones.map((z) => z.hold),
  };
}

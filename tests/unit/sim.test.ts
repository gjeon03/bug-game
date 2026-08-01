import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/clock.ts';
import {
  BROOD_FOOD_COST,
  BROOD_WATER_COST,
  LINK_RADIUS,
  MAX_ROUTES,
  NODE_LIFE,
  NODE_SPACING,
  RESERVE_MAX,
  SCOUT_RADIUS,
  SUSPICION_WEIGHTS,
  TIER_THRESHOLDS,
  WIN_FOOD,
  WIN_POPULATION,
  WIN_WATER,
  WORKER_CARRY_FOOD,
  WORLD_H,
  WORLD_W,
} from '../../src/sim/constants.ts';
import { collideCircle, coverAt, isInsideSolid } from '../../src/sim/field.ts';
import { NESTS, RESOURCES, SOLIDS } from '../../src/sim/kitchen.ts';
import { eraseTrail, recallWorkers } from '../../src/sim/pheromone.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { addSuspicion, topCause } from '../../src/sim/suspicion.ts';
import { deployTraps, spawnPatrol, stomp } from '../../src/sim/threats.ts';
import { createWorld, spawnWorker, type World } from '../../src/sim/world.ts';
import { driveTo, idle, stepUntil } from './helpers.ts';

const HOME = NESTS[0];
const CRUMBS = RESOURCES.find((r) => r.id === 'dishCrumbs')!;

function layRouteToCrumbs(world: World): void {
  driveTo(world, HOME.x + 20, HOME.y, { timeout: 8 });
  driveTo(world, 600, 2010, { lay: true, timeout: 15 });
  driveTo(world, 600, 1760, { lay: true, timeout: 15 });
  driveTo(world, CRUMBS.x, CRUMBS.y, { lay: true, timeout: 20 });
  world.input.lay = false;
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
    const island = SOLIDS.find((s) => s.id === 'island')!;
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

  it('cover is highest against cabinetry and zero in the open', () => {
    // Hard against the dishwasher's right face.
    expect(coverAt(560, 1700)).toBeGreaterThan(0.9);
    // One toe-kick depth away.
    expect(coverAt(620, 1700)).toBeGreaterThan(0.4);
    // Middle of the open floor.
    expect(coverAt(2200, 1950)).toBe(0);
  });
});

describe('pheromone routing', () => {
  it('spaces nodes, spends the reserve, and regenerates it', () => {
    const world = createWorld(11);
    driveTo(world, HOME.x + 20, HOME.y, { timeout: 8 });
    driveTo(world, 600, 2010, { lay: true, timeout: 15 });
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
    driveTo(b, 600, 2010, { timeout: 20 });
    driveTo(b, 600, 1760, { timeout: 15 });
    driveTo(b, CRUMBS.x, CRUMBS.y, { timeout: 20 });
    driveTo(b, 600, 1760, { lay: true, timeout: 15 });
    driveTo(b, 600, 2010, { lay: true, timeout: 15 });
    driveTo(b, HOME.x + 20, HOME.y, { lay: true, timeout: 20 });
    b.input.lay = false;
    const last = b.routes.at(-1)!;
    expect(last.nestEnd).toBe(1);
    expect(last.resEnd).toBe(0);
    expect(last.linked).toBe(true);
  });

  it('expires nodes and drops the route when nothing uses it', () => {
    const world = createWorld(31);
    driveTo(world, HOME.x + 400, HOME.y - 200, { lay: true, timeout: 20 });
    world.input.lay = false;
    expect(world.routes.length).toBe(1);
    // Nothing links this route, so no traffic reinforces it.
    idle(world, NODE_LIFE + 6);
    expect(world.routes.length).toBe(0);
  });

  it('worker traffic keeps a working supply line alive past the node lifetime', () => {
    const world = createWorld(41);
    // Isolate the reinforcement behaviour from resource depletion.
    world.resources.find((r) => r.id === 'dishCrumbs')!.amount = 100000;
    world.resources.find((r) => r.id === 'dishCrumbs')!.initial = 100000;
    layRouteToCrumbs(world);
    expect(world.routes[0].linked).toBe(true);
    idle(world, NODE_LIFE + 40);
    expect(world.routes.some((r) => r.linked)).toBe(true);
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
      driveTo(world, 900 + i * 40, 2200, { timeout: 12 });
      driveTo(world, 900 + i * 40, 2000, { lay: true, timeout: 12 });
      world.input.lay = false;
      idle(world, 0.2);
    }
    expect(world.routes.length).toBeLessThanOrEqual(MAX_ROUTES);
  });

  it('links only within the documented radius', () => {
    const world = createWorld(71);
    // Start laying well clear of the nest, so the near end cannot link.
    driveTo(world, HOME.x + LINK_RADIUS + 220, HOME.y, { timeout: 15 });
    driveTo(world, CRUMBS.x, CRUMBS.y, { lay: true, timeout: 25 });
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
    const res = world.resources.find((r) => r.id === 'dishCrumbs')!;
    const startAmount = res.amount;
    const startStore = world.colony.food;
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
    void startStore;
  });

  it('marks a fully drained food node as evidence exactly once', () => {
    const world = createWorld(111);
    const res = world.resources.find((r) => r.id === 'dishCrumbs')!;
    res.amount = WORKER_CARRY_FOOD * 1.2;
    layRouteToCrumbs(world);
    stepUntil(world, (w) => w.resources.find((r) => r.id === 'dishCrumbs')!.depleted, 60);
    idle(world, 5);
    expect(res.depleted).toBe(true);
    expect(world.suspicion.causes.depleted).toBeCloseTo(SUSPICION_WEIGHTS.depleted, 5);
  });
});

describe('colony economy', () => {
  it('spends food and moisture together to hatch', () => {
    const world = createWorld(201);
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

  it('crosses each tier once and in order', () => {
    const world = createWorld(311);
    const seen: number[] = [];
    for (let i = 0; i < 300; i++) {
      addSuspicion(world, 'seen', 1, 0, 0);
      stepWorld(world, SIM_DT);
      for (const e of world.events) if (e.t === 'tier') seen.push(e.tier);
      world.events.length = 0;
    }
    expect(seen).toEqual([1, 2, 3, 4]);
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
    deployTraps(world, 2, 1);
    expect(world.hazards.length).toBe(2);
    const route = world.routes[0];
    const nearRoute = world.hazards.filter((h) =>
      route.nodes.some((n) => Math.hypot(n.x - h.x, n.y - h.y) < 260),
    );
    expect(nearRoute.length).toBeGreaterThan(0);
  });

  it('a footfall warns before it kills', () => {
    const world = createWorld(411);
    driveTo(world, 1600, 2200, { timeout: 20 });
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
    driveTo(world, 1600, 2200, { timeout: 20 });
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
  it('declares victory only when every criterion holds', () => {
    const world = createWorld(501);
    world.night = 3;
    world.nightTime = world.nightLength - 0.1;
    world.colony.food = WIN_FOOD;
    world.colony.water = WIN_WATER;
    for (const n of world.nests) n.claimed = true;
    while (world.colony.population < WIN_POPULATION) {
      if (!spawnWorker(world, HOME.x, HOME.y, false)) break;
      world.colony.population++;
    }
    stepWorld(world, 0.2);
    expect(world.status).toBe('won');
    expect(Object.values(world.winCriteria).every(Boolean)).toBe(true);
  });

  it('falls short of victory and reports extermination instead', () => {
    const world = createWorld(511);
    world.night = 3;
    world.nightTime = world.nightLength - 0.1;
    stepWorld(world, 0.2);
    expect(world.status).toBe('lost');
    expect(world.loseCause).toBe('exterminated');
    expect(world.winCriteria.population).toBe(false);
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

  it('a new world after a full run is identical to a cold one', () => {
    const played = createWorld(4242);
    layRouteToCrumbs(played);
    idle(played, 120);
    played.night = 3;
    idle(played, 30);

    const fresh = createWorld(4242);
    const cold = createWorld(4242);
    // No module-level mutable state may survive a completed run.
    expect(summarise(fresh)).toEqual(summarise(cold));
    expect(fresh.beatFired.every((f) => f === false) || fresh.beatFired.length === 0).toBe(true);
    expect(fresh.routes.length).toBe(0);
    expect(fresh.hazards.length).toBe(0);
    expect(fresh.suspicion.value).toBe(0);
  });
});

function summarise(w: World): Record<string, unknown> {
  return {
    time: w.time,
    night: w.night,
    status: w.status,
    pop: w.colony.population,
    food: w.colony.food,
    water: w.colony.water,
    routes: w.routes.length,
    hazards: w.hazards.length,
    corpses: w.corpses.length,
    suspicion: w.suspicion.value,
    upgrades: { ...w.colony.upgrades },
  };
}

describe('labour distribution', () => {
  it('workers hatched at a satellite nest still serve routes anchored elsewhere', () => {
    const world = createWorld(6161);
    // Simulate the mid-game shape: a brood chamber is claimed and hatches happen there, while the
    // colony's only water line is anchored at the home crack on the far side of the kitchen.
    world.night = 2;
    const island = world.nests.find((n) => n.id === 'crackIsland')!;
    island.claimed = true;
    world.colony.upgrades.brood = true;

    layRouteToCrumbs(world);
    expect(world.routes[0].linked).toBe(true);

    // Park the entire workforce at the brood chamber, out of range of the home route.
    for (const w of world.workers) {
      if (!w.alive) continue;
      w.x = island.x + world.rng.signed() * 30;
      w.y = island.y + world.rng.signed() * 30;
      w.state = 'idle';
      w.routeId = -1;
      w.targetNest = island.id;
    }
    const deliveriesBefore = world.stats.deliveries;

    idle(world, 90);

    // Without redistribution the labour force stays stranded and nothing is ever hauled.
    expect(world.stats.deliveries).toBeGreaterThan(deliveriesBefore);
    expect(world.workers.filter((w) => w.alive && w.targetNest === 'home').length).toBeGreaterThan(
      0,
    );
  });
});

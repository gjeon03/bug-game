import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/clock.ts';
import {
  MAX_ROUTES,
  NIGHT_LENGTH,
  WIN_FOOD,
  WIN_POPULATION,
  WIN_WATER,
} from '../../src/sim/constants.ts';
import { NESTS, RESOURCES } from '../../src/sim/kitchen.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { createWorld, type World } from '../../src/sim/world.ts';
import { driveTo, idle } from './helpers.ts';

/**
 * Balance regressions.
 *
 * Every test here exists because an independent critic measured the shipped numbers and found the
 * game unwinnable, or found route geometry to be mechanically inert. These lock in the corrections.
 */

const HOME = NESTS[0];
const P = Object.fromEntries(RESOURCES.map((r) => [r.id, r])) as Record<
  string,
  (typeof RESOURCES)[number]
>;
const NEST = Object.fromEntries(NESTS.map((n) => [n.id, n])) as Record<
  string,
  (typeof NESTS)[number]
>;

type Pt = [number, number];

/** Walks the legs without laying, then walks the rest laying — one continuous route. */
function route(world: World, approach: Pt[], lay: Pt[]): void {
  for (const [x, y] of approach) driveTo(world, x, y, { timeout: 45, arrive: 55 });
  for (const [x, y] of lay) driveTo(world, x, y, { lay: true, timeout: 45, arrive: 50 });
  world.input.lay = false;
}

function claimAt(world: World, approach: Pt[], id: string): boolean {
  for (const [x, y] of approach) driveTo(world, x, y, { timeout: 45, arrive: 60 });
  const nest = NEST[id];
  driveTo(world, nest.x, nest.y, { timeout: 45, arrive: 50 });
  for (let attempt = 0; attempt < 6; attempt++) {
    world.input.interactPressed = true;
    stepWorld(world, SIM_DT);
    if (world.nests.find((n) => n.id === id)!.claimed) return true;
    idle(world, 8);
    driveTo(world, nest.x, nest.y, { timeout: 20, arrive: 50 });
  }
  return world.nests.find((n) => n.id === id)!.claimed;
}

describe('route geometry has mechanical consequence', () => {
  /** Runs one night 1 with the given route shape and reports what the household noticed. */
  function nightOne(shape: 'covered' | 'open'): { peak: number; exposedTrail: number } {
    const world = createWorld(31415);
    if (shape === 'covered') {
      route(
        world,
        [[HOME.x + 20, HOME.y]],
        [
          [600, 2010],
          [600, 1760],
          [P.dishCrumbs.x, P.dishCrumbs.y],
        ],
      );
    } else {
      route(
        world,
        [[HOME.x + 20, HOME.y]],
        [
          [1250, 2250],
          [1250, 1900],
          [1050, 1500],
          [800, 1250],
          [P.dishCrumbs.x, P.dishCrumbs.y],
        ],
      );
    }
    // Park the scout in deep cover and hold moisture steady, so the only variable is route shape.
    driveTo(world, 600, 1900, { timeout: 30 });
    world.colony.water = 400;
    world.colony.waterCap = 400;
    let maxExposed = 0;
    while (world.time < 140) {
      stepWorld(world, SIM_DT);
      if (world.exposedTrail > maxExposed) maxExposed = world.exposedTrail;
    }
    return { peak: world.suspicion.peak, exposedTrail: maxExposed };
  }

  it('an open-floor supply line is measurably more incriminating than a covered one', () => {
    const covered = nightOne('covered');
    const open = nightOne('open');

    // The open route must actually register as exposed trail at all...
    expect(open.exposedTrail).toBeGreaterThan(covered.exposedTrail * 5);
    // ...and it must move the meter far more, which is the whole thesis of the game.
    expect(open.peak).toBeGreaterThan(18);
    expect(covered.peak).toBeLessThan(5);
  });

  it('open-floor traffic alone can carry suspicion past a response tier', () => {
    const world = createWorld(2718);
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [1250, 2250],
        [1250, 1900],
        [1050, 1500],
        [800, 1250],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    driveTo(world, 600, 1900, { timeout: 30 });
    world.colony.water = 400;
    world.colony.waterCap = 400;
    idle(world, 150);
    // Tier 1 at 25 means the household reacts to logistics, not just to the scout standing in a light.
    expect(world.suspicion.value).toBeGreaterThan(25);
    expect(world.suspicion.causes.droppings + world.suspicion.causes.traffic).toBeGreaterThan(20);
  });

  it('the HUD can name a continuous cause, not only one-shots', () => {
    const world = createWorld(1618);
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [1250, 2250],
        [1250, 1900],
        [1050, 1500],
        [800, 1250],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    driveTo(world, 600, 1900, { timeout: 30 });
    idle(world, 90);
    expect(['droppings', 'traffic']).toContain(world.suspicion.lastCause);
  });
});

describe('resource economy', () => {
  it('a node backs a full night of traffic instead of being stripped in a minute', () => {
    const world = createWorld(9001);
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [600, 2010],
        [600, 1760],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    idle(world, NIGHT_LENGTH[1] - world.time - 2);
    const node = world.resources.find((r) => r.id === 'dishCrumbs')!;
    expect(node.depleted).toBe(false);
    expect(node.amount).toBeGreaterThan(0);
  });

  it('a drained source partly returns the next night', () => {
    const world = createWorld(9002);
    const node = world.resources.find((r) => r.id === 'dishCrumbs')!;
    node.amount = 1;
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [600, 2010],
        [600, 1760],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    idle(world, 25);
    expect(node.depleted).toBe(true);
    // Fast-forward to night 2 the way the director does.
    idle(world, NIGHT_LENGTH[1] + 14 - world.time);
    expect(world.night).toBe(2);
    expect(node.amount).toBeGreaterThan(0);
    expect(node.depleted).toBe(false);
  });

  it('a route whose node runs dry stays visible instead of silently vanishing', () => {
    const world = createWorld(9003);
    const node = world.resources.find((r) => r.id === 'dishCrumbs')!;
    node.amount = 4;
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [600, 2010],
        [600, 1760],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    idle(world, 30);
    expect(node.depleted).toBe(true);
    expect(world.routes.length).toBe(1);
    expect(world.routes[0].resourceId).toBe('dishCrumbs');
  });
});

describe('a competently played run is winnable', () => {
  it('reaches the win population and banks the win reserves inside three nights', () => {
    const world = createWorld(20260801);

    // ── Night 1: two covered lines out of the home crack.
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [600, 2010],
        [600, 1760],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    route(
      world,
      [
        [620, 1620],
        [P.sinkDrip.x, P.sinkDrip.y],
      ],
      [
        [620, 1620],
        [600, 2010],
        [HOME.x + 20, HOME.y],
      ],
    );
    expect(world.routes.filter((r) => r.linked).length).toBe(2);
    while (world.night < 2 && world.status !== 'lost') idle(world, 1);

    // ── Night 2: brood chamber + food cache, each with its own supply line.
    expect(
      claimAt(
        world,
        [
          [900, 1900],
          [1240, 1830],
        ],
        'crackIsland',
      ),
    ).toBe(true);
    route(
      world,
      [],
      [
        [1600, 1830],
        [P.islandDrop.x, P.islandDrop.y],
      ],
    );
    route(
      world,
      [[NEST.crackIsland.x, NEST.crackIsland.y]],
      [
        [2560, 1800],
        [2560, 1000],
        [P.fridgeCondensation.x, P.fridgeCondensation.y],
      ],
    );
    expect(
      claimAt(
        world,
        [
          [1240, 1830],
          [1000, 2350],
          [1000, 2450],
        ],
        'crackPantry',
      ),
    ).toBe(true);
    route(
      world,
      [],
      [
        [900, 2440],
        [P.pantryGrain.x, P.pantryGrain.y],
      ],
    );

    expect(world.colony.upgrades.brood).toBe(true);
    expect(world.colony.upgrades.cache).toBe(true);
    while (world.night < 3 && world.status !== 'won' && world.status !== 'lost') idle(world, 1);
    expect(world.status).toBe('playing');
    expect(world.colony.population).toBeGreaterThan(12);

    // ── Night 3: escape tunnel plus the two big far sources.
    expect(
      claimAt(
        world,
        [
          [1000, 2450],
          [1400, 2300],
          [2000, 2300],
          [2600, 2000],
          [3450, 1900],
        ],
        'crackWall',
      ),
    ).toBe(true);
    route(
      world,
      [
        [3450, 2490],
        [3000, 2500],
        [P.petBowl.x, P.petBowl.y],
      ],
      [
        [3200, 2470],
        [3470, 2200],
        [NEST.crackWall.x, NEST.crackWall.y],
      ],
    );
    route(
      world,
      [],
      [
        [3470, 2100],
        [3450, 2490],
        [P.trashSpill.x, P.trashSpill.y],
      ],
    );

    // Sit in cover and keep the lines alive through the sweep, as a player would.
    for (let k = 0; k < 16 && world.status === 'playing'; k++) {
      driveTo(world, 3470, 1750, { timeout: 30 });
      idle(world, 12);
      if (world.status === 'playing' && world.routes.filter((r) => r.linked).length < 3) {
        route(
          world,
          [[3470, 2100]],
          [
            [3450, 2490],
            [P.trashSpill.x, P.trashSpill.y],
          ],
        );
      }
    }
    while (world.status === 'playing') idle(world, 1);

    const c = world.colony;
    const summary = {
      status: world.status,
      loseCause: world.loseCause,
      population: c.population,
      food: Math.round(c.food),
      water: Math.round(c.water),
      hatched: c.hatched,
      lost: c.lost,
      suspicionPeak: Math.round(world.suspicion.peak),
      criteria: world.winCriteria,
    };

    expect(summary, JSON.stringify(summary)).toMatchObject({ status: 'won' });
    expect(c.population).toBeGreaterThanOrEqual(WIN_POPULATION);
    expect(c.food).toBeGreaterThanOrEqual(WIN_FOOD);
    expect(c.water).toBeGreaterThanOrEqual(WIN_WATER);
  });
});

describe('the colony responds to the player, not just to the map', () => {
  it('labour shifts onto whichever reserve is running out', () => {
    const world = createWorld(7311);
    // Two lines out of the home crack, one food and one water, both equally convenient.
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [600, 2010],
        [600, 1760],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    route(
      world,
      [
        [620, 1620],
        [P.sinkDrip.x, P.sinkDrip.y],
      ],
      [
        [620, 1620],
        [600, 2010],
        [HOME.x + 20, HOME.y],
      ],
    );
    expect(world.routes.filter((r) => r.linked).length).toBe(2);

    const foodRoute = world.routes.find((r) => r.resourceId === 'dishCrumbs')!;
    const waterRoute = world.routes.find((r) => r.resourceId === 'sinkDrip')!;

    // Starve the colony of moisture while food is plentiful, then let it re-plan.
    world.colony.food = world.colony.foodCap * 0.95;
    world.colony.water = world.colony.waterCap * 0.05;

    let warned = false;
    let waterShare = 0;
    let foodShare = 0;
    for (let t = 0; t < 40 / SIM_DT; t++) {
      stepWorld(world, SIM_DT);
      if (world.shortage === 'water') warned = true;
      waterShare += world.workers.filter((w) => w.alive && w.routeId === waterRoute.id).length;
      foodShare += world.workers.filter((w) => w.alive && w.routeId === foodRoute.id).length;
    }

    // The HUD warned...
    expect(warned, 'the shortage must be signalled').toBe(true);
    // ...and the colony itself redeployed, which is what makes the warning actionable.
    expect(
      waterShare,
      `expected labour to favour the failing reserve: water=${waterShare} food=${foodShare}`,
    ).toBeGreaterThan(foodShare);
  });

  it('re-laying from where a trail ends extends it instead of burning a route slot', () => {
    const world = createWorld(7312);
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [600, 2010],
        [600, 1760],
      ],
    );
    expect(world.routes.length).toBe(1);
    const id = world.routes[0].id;
    const before = world.routes[0].nodes.length;

    // Release, then start laying again from the same spot — the natural "touch up my trail" action.
    idle(world, 1);
    driveTo(world, P.dishCrumbs.x, P.dishCrumbs.y, { lay: true, timeout: 25, arrive: 50 });
    world.input.lay = false;
    idle(world, 0.2);

    expect(world.routes.length, 'a touch-up must not allocate a second route').toBe(1);
    expect(world.routes[0].id).toBe(id);
    expect(world.routes[0].nodes.length).toBeGreaterThan(before);
    expect(world.routes[0].linked).toBe(true);
  });

  it('evicting the oldest trail is announced rather than silent', () => {
    const world = createWorld(7313);
    // Lay MAX_ROUTES + 1 clearly separate trails.
    for (let i = 0; i <= MAX_ROUTES; i++) {
      driveTo(world, 900 + i * 260, 2300, { timeout: 25, arrive: 45 });
      driveTo(world, 900 + i * 260, 2150, { lay: true, timeout: 20, arrive: 45 });
      world.input.lay = false;
      idle(world, 0.3);
    }
    expect(world.routes.length).toBeLessThanOrEqual(MAX_ROUTES);
    expect(world.hint, 'the player must be told a trail was dissolved').toContain('dissolved');
    expect(world.events.some((e) => e.t === 'routeLost')).toBe(true);
  });
});

describe('a failing reserve cannot conscript the whole colony', () => {
  it('an unrecoverable shortage still leaves labour on the other line', () => {
    const world = createWorld(7311);
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [600, 2010],
        [600, 1760],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    route(
      world,
      [
        [620, 1620],
        [P.sinkDrip.x, P.sinkDrip.y],
      ],
      [
        [620, 1620],
        [600, 2010],
        [HOME.x + 20, HOME.y],
      ],
    );
    const waterRoute = world.routes.find((r) => r.resourceId === 'sinkDrip')!;
    const foodRoute = world.routes.find((r) => r.resourceId === 'dishCrumbs')!;

    // A reserve the colony cannot actually refill — the deliveries never move the needle. This is
    // night 2 with water only reachable down a long, lit line: the player may rationally choose to
    // run thin on moisture rather than march bodies through the fridge light, and the colony must
    // not override that by pinning every worker on the most exposed route in the game.
    world.colony.food = world.colony.foodCap * 0.95;
    let worstShare = 0;
    for (let t = 0; t < 120 / SIM_DT; t++) {
      world.colony.water = world.colony.waterCap * 0.05;
      stepWorld(world, SIM_DT);
      const onWater = world.workers.filter((w) => w.alive && w.routeId === waterRoute.id).length;
      const onFood = world.workers.filter((w) => w.alive && w.routeId === foodRoute.id).length;
      if (onWater + onFood >= 4) worstShare = Math.max(worstShare, onWater / (onWater + onFood));
    }

    expect(
      worstShare,
      `a failing reserve took ${(worstShare * 100).toFixed(0)}% of all labour`,
    ).toBeLessThanOrEqual(0.85);
  });

  it('the colony prefers the safer of two lines to the same resource', () => {
    const world = createWorld(7311);
    // Hug the cabinet run to the crumbs.
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [600, 2010],
        [600, 1760],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    // A second line to the *same* crumbs, out across the open floor instead of along the units.
    // Same endpoints, so distance is held constant and exposure is the only thing that differs.
    route(
      world,
      [[HOME.x + 20, HOME.y]],
      [
        [820, 2050],
        [1200, 2100],
        [1200, 1750],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    const linked = world.routes.filter((r) => r.linked);
    expect(linked.length).toBe(2);
    const safe = linked.reduce((a, b) => (a.exposure <= b.exposure ? a : b));
    const risky = linked.reduce((a, b) => (a.exposure > b.exposure ? a : b));
    expect(risky.exposure, 'the two lines must actually differ in exposure').toBeGreaterThan(
      safe.exposure * 1.3,
    );

    let onSafe = 0;
    let onRisky = 0;
    for (let t = 0; t < 60 / SIM_DT; t++) {
      stepWorld(world, SIM_DT);
      onSafe += world.workers.filter((w) => w.alive && w.routeId === safe.id).length;
      onRisky += world.workers.filter((w) => w.alive && w.routeId === risky.id).length;
    }

    // Route geometry is the game's central currency; it should steer the colony's own labour, not
    // only the evidence the household finds.
    expect(
      onSafe,
      `exposure ${safe.exposure.toFixed(2)} drew ${onSafe} vs ${risky.exposure.toFixed(2)} drawing ${onRisky}`,
    ).toBeGreaterThan(onRisky);
  });
});

describe('a lay near an existing trail extends it only when it is the same line', () => {
  it('three supply lines fanning out of the same crack stay three routes', () => {
    const world = createWorld(4242);
    const home = world.nests.find((n) => n.home)!;

    // Three genuinely different directions out of one door. Every route anchored on a nest must
    // start inside LINK_RADIUS to link at all, so their start points are unavoidably clustered —
    // in practice within one node spacing of each other. Heading is the only thing that separates
    // them, which is why proximity alone cannot be the rule.
    const targets = [
      { x: home.x + 420, y: home.y - 60 },
      { x: home.x + 120, y: home.y - 430 },
      { x: home.x + 130, y: home.y + 400 },
    ];
    const starts: { x: number; y: number }[] = [];
    for (const t of targets) {
      driveTo(world, home.x, home.y, { timeout: 25 });
      starts.push({ x: world.scout.x, y: world.scout.y });
      driveTo(world, t.x, t.y, { lay: true, timeout: 30 });
      idle(world, 0.4);
    }

    let spread = 0;
    for (let i = 0; i < starts.length; i++)
      for (let j = i + 1; j < starts.length; j++)
        spread = Math.max(spread, Math.hypot(starts[i].x - starts[j].x, starts[i].y - starts[j].y));

    expect(
      world.routes.length,
      `three lines out of one crack (start points within ${spread.toFixed(0)}u) must stay separate`,
    ).toBe(3);
  });

  it('resuming the same line where it ended extends it instead of allocating a new one', () => {
    const world = createWorld(4242);
    const home = world.nests.find((n) => n.home)!;
    driveTo(world, home.x, home.y, { timeout: 25 });
    driveTo(world, home.x + 260, home.y, { lay: true, timeout: 30 });
    const after = world.routes.length;
    const tail = world.routes[world.routes.length - 1].nodes.length;

    // Let go of the key mid-line, then carry on in the same direction — one supply line, one route.
    idle(world, 0.6);
    driveTo(world, home.x + 520, home.y, { lay: true, timeout: 30 });

    expect(world.routes.length, 'continuing the line must not allocate a second route').toBe(after);
    expect(world.routes[world.routes.length - 1].nodes.length).toBeGreaterThan(tail);
  });
});

describe('turning out of a trail end starts a new line', () => {
  it('a short stub east does not swallow a line laid north from the same crack', () => {
    const world = createWorld(4242);
    const home = world.nests.find((n) => n.home)!;
    driveTo(world, home.x, home.y, { timeout: 25 });
    driveTo(world, home.x + 70, home.y, { lay: true, timeout: 20 });
    expect(world.routes.length).toBe(1);

    // Walk back onto that stub's end and head off at a right angle. This is a different supply
    // line, not a continuation, and it merged into the stub before the heading gate existed.
    idle(world, 0.5);
    driveTo(world, home.x + 40, home.y, { timeout: 20 });
    driveTo(world, home.x + 60, home.y - 400, { lay: true, timeout: 30 });

    expect(world.routes.length, 'a right-angle turn is a new line, not an extension').toBe(2);
  });
});

describe('the debrief cannot contradict itself', () => {
  it('a colony that collapses with a full larder is told it had the food', () => {
    const world = createWorld(4242);
    // Bank plenty of food, then take the colony away. This is the night-2 collapse the end card
    // used to describe as "120 food banked" with a red cross beside the number 199.
    world.colony.food = WIN_FOOD + 79;
    for (const w of world.workers) w.alive = false;
    world.colony.population = 0;
    world.scout.alive = false;
    idle(world, 2);

    expect(world.status).toBe('lost');
    expect(
      world.finalTally,
      'the numbers behind the verdict must be frozen with it',
    ).not.toBeNull();
    const tally = world.finalTally!;
    expect(tally.food).toBeGreaterThanOrEqual(WIN_FOOD);
    expect(
      world.winCriteria.food,
      `card would show ${Math.floor(tally.food)} against a target of ${WIN_FOOD}`,
    ).toBe(true);
    expect(world.winCriteria.population).toBe(false);
    // The count and its label come from the same number, so "all 3" can never be scored out of 4.
    expect(tally.functionsTotal).toBe(world.nests.filter((n) => !n.home).length);
    expect(tally.functionsBuilt).toBeLessThanOrEqual(tally.functionsTotal);
  });
});

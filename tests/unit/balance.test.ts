import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/clock.ts';
import { NIGHT_LENGTH, WIN_FOOD, WIN_POPULATION, WIN_WATER } from '../../src/sim/constants.ts';
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

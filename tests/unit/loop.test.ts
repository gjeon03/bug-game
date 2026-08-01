import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/sim/world.ts';
import { RESOURCES, NESTS } from '../../src/sim/kitchen.ts';
import { driveTo, idle, stepUntil } from './helpers.ts';

const HOME = NESTS[0];
const CRUMBS = RESOURCES.find((r) => r.id === 'dishCrumbs')!;
const DRIP = RESOURCES.find((r) => r.id === 'sinkDrip')!;

/**
 * The end-to-end micro-loop: leave the nest, walk to food while secreting pheromone, and have the
 * colony turn that route into delivered resources without any further player input.
 */
describe('core loop', () => {
  it('turns a scout-laid route into worker deliveries', () => {
    const world = createWorld(1234);

    // Walk from the nest to the crumbs, laying the whole way.
    expect(driveTo(world, HOME.x + 40, HOME.y, { timeout: 6 })).toBe(true);
    expect(driveTo(world, CRUMBS.x, CRUMBS.y, { lay: true, timeout: 25 })).toBe(true);

    const route = world.routes[0];
    expect(route).toBeDefined();
    expect(route.nodes.length).toBeGreaterThan(10);
    expect(route.linked).toBe(true);
    expect(route.resourceId).toBe('dishCrumbs');
    expect(route.nestId).toBe('home');

    const acquired = stepUntil(world, (w) => w.workers.some((x) => x.state === 'outbound'), 12);
    expect(acquired).toBeGreaterThanOrEqual(0);

    const foodBefore = world.colony.food;
    const delivered = stepUntil(world, (w) => w.stats.deliveries > 0, 45);
    expect(delivered).toBeGreaterThanOrEqual(0);
    // Upkeep runs the whole time, so the meaningful assertion is that income arrived at all and that
    // the reserve stepped up on the delivery frame.
    expect(world.colony.totalFood).toBeGreaterThan(0);
    expect(world.colony.food).toBeGreaterThan(foodBefore - 45 * 0.03 * world.colony.population);
  });

  it('hits the first-delivery pacing budget of 60 seconds', () => {
    const world = createWorld(99);
    driveTo(world, CRUMBS.x, CRUMBS.y, { lay: true, timeout: 25 });
    stepUntil(world, (w) => w.stats.deliveries > 0, 45);
    expect(world.stats.firstDeliveryAt).toBeGreaterThan(0);
    expect(world.stats.firstDeliveryAt).toBeLessThan(60);
  });

  it('grows the colony when both food and moisture flow', () => {
    const world = createWorld(7);
    driveTo(world, CRUMBS.x, CRUMBS.y, { lay: true, timeout: 25 });
    driveTo(world, DRIP.x, DRIP.y, { timeout: 25 });
    driveTo(world, HOME.x, HOME.y, { lay: true, timeout: 30 });

    const linked = world.routes.filter((r) => r.linked);
    expect(linked.length).toBe(2);

    const before = world.colony.population;
    idle(world, 90);
    expect(world.colony.population).toBeGreaterThan(before);
    expect(world.colony.hatched).toBeGreaterThan(0);
  });
});

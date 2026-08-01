import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/sim/world.ts';
import { firstResource, HOME, path, pt } from '../map.ts';
import { driveTo, idle, stepUntil } from './helpers.ts';
import { layLine } from './play.ts';

const CRUMBS = firstResource('food');
const DRIP = firstResource('water');

/**
 * The end-to-end micro-loop: leave the nest, walk to food while secreting pheromone, and have the
 * colony turn that route into delivered resources without any further player input.
 */
describe('core loop', () => {
  it('turns a scout-laid route into worker deliveries', () => {
    const world = createWorld(1234);

    // Walk from the nest to the crumbs, laying the whole way.
    expect(driveTo(world, HOME.x + 40, HOME.y, { timeout: 6 })).toBe(true);
    for (const p of path({ x: world.scout.x, y: world.scout.y }, pt(CRUMBS))) {
      driveTo(world, p.x, p.y, { lay: true, timeout: 25, arrive: 40 });
    }
    world.input.lay = false;

    const route = world.routes[0];
    expect(route).toBeDefined();
    expect(route.nodes.length).toBeGreaterThan(10);
    expect(route.linked).toBe(true);
    expect(route.resourceId).toBe(CRUMBS.id);
    expect(route.nestId).toBe(HOME.id);

    const acquired = stepUntil(world, (w) => w.workers.some((x) => x.state === 'outbound'), 12);
    expect(acquired).toBeGreaterThanOrEqual(0);

    // The old assertion here compared food against a hand-computed upkeep allowance, which is
    // near-vacuous — it passed whether or not anything was ever delivered. What the loop actually
    // promises is that the *store* goes up across the delivery frame, so that is what is measured.
    const totalBefore = world.colony.totalFood;
    let stepped = 0;
    let jumped = false;
    while (stepped < 45 && !jumped) {
      const before = world.colony.food;
      const deliveries = world.stats.deliveries;
      idle(world, 1 / 60);
      stepped += 1 / 60;
      if (world.stats.deliveries > deliveries) jumped = world.colony.food > before;
    }
    expect(jumped, 'the larder must step up on the frame a delivery lands').toBe(true);
    expect(world.colony.totalFood).toBeGreaterThan(totalBefore);
    expect(world.stats.deliveries).toBeGreaterThan(0);
  });

  it('hits the first-delivery pacing budget of 60 seconds', () => {
    const world = createWorld(99);
    for (const p of path({ x: world.scout.x, y: world.scout.y }, pt(CRUMBS))) {
      driveTo(world, p.x, p.y, { lay: true, timeout: 25, arrive: 40 });
    }
    world.input.lay = false;
    stepUntil(world, (w) => w.stats.deliveries > 0, 45);
    expect(world.stats.firstDeliveryAt).toBeGreaterThan(0);
    expect(world.stats.firstDeliveryAt).toBeLessThan(60);
  });

  it('grows the colony when both food and moisture flow', () => {
    const world = createWorld(7);
    layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(CRUMBS));
    layLine(world, pt(DRIP), { x: HOME.x + 30, y: HOME.y });

    const linked = world.routes.filter((r) => r.linked);
    expect(linked.length).toBe(2);

    const before = world.colony.population;
    idle(world, 90);
    expect(world.colony.population).toBeGreaterThan(before);
    expect(world.colony.hatched).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/clock.ts';
import { doInteract, interactTarget } from '../../src/sim/colony.ts';
import { NESTS } from '../../src/sim/kitchen.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { createWorld } from '../../src/sim/world.ts';
import { dist, path, pt } from '../map.ts';
import { driveTo } from './helpers.ts';

/**
 * Every authored foothold must be physically reachable and claimable once its operation arrives.
 *
 * The old version of this kept a hand-written `legs` record keyed by crack id, so adding or renaming
 * a crack made `legs[spec.id]` `undefined` and the test *threw* instead of failing informatively.
 * The walk is generated from the map now, so the property holds for whatever cracks exist.
 */
describe('footholds', () => {
  for (const spec of NESTS.filter((n) => !n.home)) {
    it(`${spec.id} is reachable and claimable in operation ${spec.unlockOp}`, () => {
      const world = createWorld(4242);
      // Placed at the operation that opens this crack — the equivalent of the old `world.night =
      // spec.unlockNight` — with the reserves to pay for it, because the subject is reachability.
      world.operation = spec.unlockOp;
      world.colony.food = 200;
      world.colony.water = 200;

      for (const p of path({ x: world.scout.x, y: world.scout.y }, pt(spec))) {
        driveTo(world, p.x, p.y, { timeout: 40, arrive: 44 });
      }

      expect(dist(world.scout, spec), `scout could not reach ${spec.id}`).toBeLessThan(100);

      const target = interactTarget(world);
      expect(target?.id).toBe(spec.id);
      expect(target?.kind).toBe('claim');
      expect(target?.affordable).toBe(true);

      // Read the reserves at the moment of the claim: upkeep has been running the whole walk.
      const foodBefore = world.colony.food;
      const waterBefore = world.colony.water;
      doInteract(world);
      const nest = world.nests.find((n) => n.id === spec.id)!;
      expect(nest.claimed).toBe(true);
      // Claiming buys ground, and the ground is worth capacity before it is fitted out.
      expect(world.colony.food).toBeCloseTo(foodBefore - spec.costFood, 5);
      expect(world.colony.water).toBeCloseTo(waterBefore - spec.costWater, 5);
      expect(nest.fn).toBeNull();
      expect(world.stats.firstClaimAt).toBeGreaterThanOrEqual(0);
    }, 30_000);
  }

  it('a crack that has not opened yet reports when it will, instead of failing silently', () => {
    const later = NESTS.find((n) => !n.home && n.unlockOp > 1);
    expect(later, 'the map must gate at least one crack behind a later operation').toBeDefined();

    const world = createWorld(9);
    world.colony.food = 200;
    world.colony.water = 200;
    for (const p of path({ x: world.scout.x, y: world.scout.y }, pt(later!))) {
      driveTo(world, p.x, p.y, { timeout: 40, arrive: 44 });
    }

    const target = interactTarget(world);
    expect(target?.kind).toBe('sealed');
    world.input.interactPressed = true;
    stepWorld(world, SIM_DT);

    expect(world.nests.find((n) => n.id === later!.id)!.claimed).toBe(false);
    expect(world.hint).toContain(String(later!.unlockOp));
    expect(world.hint.toLowerCase()).toContain('operation');
  }, 30_000);
});

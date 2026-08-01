import { describe, expect, it } from 'vitest';
import { doInteract, interactTarget } from '../../src/sim/colony.ts';
import { NESTS } from '../../src/sim/kitchen.ts';
import { createWorld } from '../../src/sim/world.ts';
import { driveTo } from './helpers.ts';

/** Every authored crack must be physically reachable and claimable once its night arrives. */
describe('expansion nodes', () => {
  for (const spec of NESTS.filter((n) => !n.home)) {
    it(`${spec.id} is reachable and claimable on night ${spec.unlockNight}`, () => {
      const world = createWorld(4242);
      world.night = spec.unlockNight;
      world.colony.food = 200;
      world.colony.water = 200;

      // Walk there in stages so the straight-line driver does not fight the cabinetry.
      const legs: Record<string, [number, number][]> = {
        crackIsland: [
          [700, 2000],
          [1100, 1900],
          [spec.x, spec.y],
        ],
        crackPantry: [
          [800, 2050],
          [900, 2450],
          [spec.x, spec.y],
        ],
        crackWall: [
          [900, 2050],
          [1400, 2490],
          [2400, 2500],
          [3450, 2490],
          [3480, 1950],
          [spec.x, spec.y],
        ],
      };

      for (const [x, y] of legs[spec.id]) {
        driveTo(world, x, y, { timeout: 40, arrive: 46 });
      }

      const dx = world.scout.x - spec.x;
      const dy = world.scout.y - spec.y;
      expect(Math.hypot(dx, dy), `scout could not reach ${spec.id}`).toBeLessThan(100);

      const target = interactTarget(world);
      expect(target?.id).toBe(spec.id);
      expect(target?.affordable).toBe(true);

      doInteract(world);
      const nest = world.nests.find((n) => n.id === spec.id)!;
      expect(nest.claimed).toBe(true);
      if (spec.upgrade) expect(world.colony.upgrades[spec.upgrade]).toBe(true);
    });
  }

  it('a claim is refused with a reason when the colony cannot pay', () => {
    const world = createWorld(9);
    world.night = 2;
    world.colony.food = 1;
    world.colony.water = 1;
    driveTo(world, 700, 2000, { timeout: 30 });
    driveTo(world, 1100, 1900, { timeout: 30 });
    driveTo(world, 1362, 1796, { timeout: 30, arrive: 46 });

    doInteract(world);
    expect(world.nests.find((n) => n.id === 'crackIsland')!.claimed).toBe(false);
    expect(world.hint).toContain('needs');
  });
});

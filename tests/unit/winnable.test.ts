import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/sim/world.ts';
import { heldZones, ZONES_TO_WIN } from '../../src/sim/territory.ts';
import { playFor } from './play.ts';

/**
 * The game must be winnable *by playing it*.
 *
 * An independent verifier found that nothing in the suite ever reached `status === 'won'` without
 * writing the win condition into the world first — `world.zones[i].hold = 1` — which means the
 * territory rates, the economy and the extermination could all have become unsurvivable in practice
 * and every test would have stayed green.
 *
 * This closes that hole. The player here is the same intent-driven one the other suites use: keep
 * both reserves supplied, take the growth decisions as they are offered, spend a full larder on the
 * things that raise its ceilings, push lines into the regions the objective names, and ride out the
 * response. It never writes a colony value and never touches `zones`.
 */
describe('the game can be won by playing it', () => {
  it.each([20260801, 4242, 31337])(
    'seed %i: a competent run takes the kitchen and survives',
    (seed) => {
      const world = createWorld(seed);
      // 24 simulated minutes is well past the 15–18 minute design target, so a failure here is a
      // failure to *ever* win rather than a failure to win quickly.
      for (let i = 0; i < 96 && world.status === 'playing'; i++) playFor(world, 15);

      expect(
        world.status,
        `run ended ${world.status}${world.loseCause ? ` (${world.loseCause})` : ''} at ${world.time.toFixed(0)}s, ` +
          `operation ${world.operation}, pop ${world.colony.population}, ` +
          `held ${heldZones(world).length}/${ZONES_TO_WIN}, adaptations ${world.adaptations.taken.length}`,
      ).toBe('won');

      // The win has to be the *designed* win, not an accident of some other end condition.
      expect(world.operation).toBe(4);
      expect(world.finalResponse, 'the household must actually have come for them').toBe(true);
      expect(world.finalTally?.zones.length ?? 0).toBeGreaterThanOrEqual(ZONES_TO_WIN);
      expect(world.adaptations.taken.length, 'a full run specialises').toBeGreaterThanOrEqual(3);
      expect(
        world.stats.functionsBuilt,
        'a full run builds out its footholds',
      ).toBeGreaterThanOrEqual(2);
    },
    240_000,
  );
});

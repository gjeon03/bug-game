import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/clock.ts';
import { cappedAdvice, resolveHud } from '../../src/sim/operations.ts';
import { recomputeTraits } from '../../src/sim/adaptations.ts';
import { ROUTINE_SPECS, startRoutine } from '../../src/sim/routines.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { createWorld } from '../../src/sim/world.ts';
import { SCOUT_SPEED } from '../../src/sim/constants.ts';
import { heldZones } from '../../src/sim/territory.ts';
import { stepUntil } from './helpers.ts';

/**
 * Regressions for defects found by the independent critics.
 *
 * Each of these shipped once. Each is cheap to re-break.
 */
describe('defects found by independent critique', () => {
  it('every household routine is reachable inside its own window', () => {
    // Measured defect: two of three anchors were 2 574 and 2 824 units from the home crack against
    // 34 s and 30 s windows — 24–26 s of walking before the trail is even laid. A timed opportunity
    // the player cannot physically reach is not a decision.
    const world = createWorld(11);
    const home = world.nests.find((n) => n.home)!;
    for (const spec of ROUTINE_SPECS) {
      const distance = Math.hypot(spec.x - home.x, spec.y - home.y);
      // Out at full speed, back at the slower laying pace, plus a little slack for cabinetry.
      const roundTrip = distance / SCOUT_SPEED + distance / (SCOUT_SPEED * 0.82);
      expect(
        spec.incoming + spec.active,
        `${spec.title}: ${Math.round(roundTrip)}s round trip against a ${spec.incoming + spec.active}s window`,
      ).toBeGreaterThan(roundTrip * 1.15);
    }
  });

  it('the extermination outranks every other objective', () => {
    // Shipped defect: at the climax the objective line read "Washing up in 5s — Standing water is
    // free moisture…" while the forecast read "EXTERMINATION — 1s".
    const world = createWorld(12);
    world.operation = 4;
    world.finalResponse = true;
    world.finalResponseTime = 5;
    startRoutine(world, 'snack');
    stepUntil(world, (w) => w.routines.some((r) => r.phase === 'incoming'), 2);
    const hud = resolveHud(world);
    expect(hud.source).toBe('final');
    expect(hud.objective.toLowerCase()).not.toContain('snack');
  });

  it('a counterplay hint expires with the threat that caused it', () => {
    const world = createWorld(13);
    world.counterplay = 'Traps land where your traffic went.';
    world.counterplayTime = 1;
    stepUntil(world, (w) => w.counterplay === null, 6);
    expect(world.counterplay).toBeNull();
  });

  it('capped advice never names an action it has already ruled out', () => {
    // Constructed dead end from the critique: everything claimed and fitted, population at capacity,
    // larder full. The old code answered "claim or fit out a foothold" with nothing left to do.
    const world = createWorld(14);
    world.operation = 4;
    for (const n of world.nests) {
      n.claimed = true;
      if (!n.home) n.fn = 'cache';
    }
    world.colony.food = world.colony.foodCap;
    world.colony.water = world.colony.waterCap;
    world.colony.population = world.colony.capacity;
    const advice = cappedAdvice(world);
    expect(advice, 'a capped reserve must always say something').not.toBeNull();
    if (advice?.source === 'capped:capacity') {
      const buildable = world.nests.some(
        (n) =>
          (!n.claimed && n.unlockOp <= world.operation) || (n.claimed && !n.home && n.fn === null),
      );
      expect(buildable, 'only name a foothold when one is actually available').toBe(true);
    }
  });

  it('shadow1 buys something, not only a penalty', () => {
    // It shipped with exactly one live effect — a 12 % hauling penalty. Its two benefits were in the
    // trait struct and read nowhere in the simulation.
    const world = createWorld(15);
    world.adaptations.taken = ['shadow1'];
    recomputeTraits(world);
    expect(world.traits.coveredTrailLifeMult).toBeGreaterThan(1);
    expect(world.traits.coveredEvidenceMult).toBeLessThan(1);

    // And the covered-trail benefit is actually applied by the pheromone system.
    const covered = createWorld(15);
    covered.adaptations.taken = ['shadow1'];
    recomputeTraits(covered);
    const plain = createWorld(15);
    for (const w of [covered, plain]) {
      w.scout.x = 168 + 40;
      w.scout.y = 2042;
      w.input.lay = true;
      w.input.right = true;
      for (let i = 0; i < 90; i++) stepWorld(w, SIM_DT);
      w.input.lay = false;
      w.input.right = false;
      for (let i = 0; i < 600; i++) stepWorld(w, SIM_DT);
    }
    const life = (w: typeof covered): number =>
      w.routes[0]?.nodes.reduce((m, n) => Math.max(m, n.life), 0) ?? 0;
    expect(life(covered), 'a covered trail lasts longer with wall-hugging scent').toBeGreaterThan(
      life(plain),
    );
  });

  it('the region the home crack sits in does not count toward taking the kitchen', () => {
    // It was being "held" 35 s into the tutorial, because operation 1's mandatory opening route runs
    // from the home crack to the first food source and both are inside the same region.
    const world = createWorld(16);
    for (const z of world.zones) {
      z.hold = 1;
      z.held = true;
    }
    expect(heldZones(world).length).toBe(world.zones.length - 1);
  });
});

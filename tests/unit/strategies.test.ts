import { expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/clock.ts';
import { NESTS, RESOURCES } from '../../src/sim/kitchen.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { createWorld, type World } from '../../src/sim/world.ts';
import { driveTo, idle } from './helpers.ts';

const HOME = NESTS[0];
const P = Object.fromEntries(RESOURCES.map((r) => [r.id, r])) as Record<
  string,
  (typeof RESOURCES)[number]
>;
const N = Object.fromEntries(NESTS.map((n) => [n.id, n])) as Record<string, (typeof NESTS)[number]>;
type Pt = [number, number];
function route(w: World, approach: Pt[], lay: Pt[]): void {
  for (const [x, y] of approach) driveTo(w, x, y, { timeout: 45, arrive: 55 });
  for (const [x, y] of lay) driveTo(w, x, y, { lay: true, timeout: 45, arrive: 50 });
  w.input.lay = false;
}
function claimAt(w: World, approach: Pt[], id: string): boolean {
  for (const [x, y] of approach) driveTo(w, x, y, { timeout: 45, arrive: 60 });
  const nest = N[id];
  driveTo(w, nest.x, nest.y, { timeout: 45, arrive: 50 });
  for (let a = 0; a < 6; a++) {
    w.input.interactPressed = true;
    stepWorld(w, SIM_DT);
    if (w.nests.find((n) => n.id === id)!.claimed) return true;
    idle(w, 8);
    driveTo(w, nest.x, nest.y, { timeout: 20, arrive: 50 });
  }
  return w.nests.find((n) => n.id === id)!.claimed;
}
interface Outcome {
  status: string;
  tier: number;
  droppings: number;
  population: number;
}

function outcome(w: World): Outcome {
  return {
    status: w.status,
    tier: w.suspicion.reachedTier,
    droppings: w.suspicion.causes.droppings,
    population: w.colony.population,
  };
}

/**
 * The three playtest strategies from TEST_PLAN, played headless end to end.
 *
 * This is the design thesis as an executable claim: careful routing wins, aggressive routing grows
 * faster and gets caught, and routing across bare tile through the light kills the colony outright.
 */
it('cautious play wins where aggressive and reckless routing do not', () => {
  let cautious: Outcome, aggressive: Outcome, poor: Outcome;

  // ── Cautious: cover-hugging everywhere, minimal exposure.
  {
    const w = createWorld(31337);
    route(
      w,
      [[HOME.x + 20, HOME.y]],
      [
        [600, 2010],
        [600, 1760],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    route(
      w,
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
    while (w.night < 2 && w.status !== 'lost') idle(w, 1);
    claimAt(
      w,
      [
        [900, 1900],
        [1240, 1830],
      ],
      'crackIsland',
    );
    route(
      w,
      [],
      [
        [1600, 1820],
        [1872, 1830],
        [P.islandDrop.x, P.islandDrop.y],
      ],
    );
    claimAt(
      w,
      [
        [1240, 1830],
        [1000, 2350],
        [1000, 2450],
      ],
      'crackPantry',
    );
    route(
      w,
      [],
      [
        [900, 2440],
        [P.pantryGrain.x, P.pantryGrain.y],
      ],
    );
    while (w.night < 3 && w.status === 'playing') idle(w, 1);
    claimAt(
      w,
      [
        [1000, 2450],
        [1400, 2300],
        [2000, 2300],
        [2600, 2000],
        [3450, 1900],
      ],
      'crackWall',
    );
    route(
      w,
      [
        [3450, 2490],
        [3000, 2500],
        [P.petBowl.x, P.petBowl.y],
      ],
      [
        [3200, 2470],
        [3470, 2200],
        [N.crackWall.x, N.crackWall.y],
      ],
    );
    route(
      w,
      [],
      [
        [3470, 2100],
        [3450, 2490],
        [P.trashSpill.x, P.trashSpill.y],
      ],
    );
    for (let k = 0; k < 16 && w.status === 'playing'; k++) {
      driveTo(w, 3470, 1750, { timeout: 30 });
      idle(w, 12);
      if (w.status === 'playing' && w.routes.filter((r) => r.linked).length < 3)
        route(
          w,
          [[3470, 2100]],
          [
            [3450, 2490],
            [P.trashSpill.x, P.trashSpill.y],
          ],
        );
    }
    while (w.status === 'playing') idle(w, 2);
    cautious = outcome(w);
  }

  // ── Aggressive: shortest lines straight across the open middle, sprinting between them.
  {
    const w = createWorld(31337);
    route(
      w,
      [[HOME.x + 20, HOME.y]],
      [
        [900, 1950],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    route(
      w,
      [[P.sinkDrip.x, P.sinkDrip.y]],
      [
        [900, 1600],
        [HOME.x + 20, HOME.y],
      ],
    );
    while (w.night < 2 && w.status !== 'lost') idle(w, 1);
    claimAt(w, [[1100, 1950]], 'crackIsland');
    route(
      w,
      [],
      [
        [1700, 2000],
        [P.islandDrop.x, P.islandDrop.y],
      ],
    );
    claimAt(w, [[1200, 2300]], 'crackPantry');
    route(
      w,
      [],
      [
        [950, 2380],
        [P.pantryGrain.x, P.pantryGrain.y],
      ],
    );
    while (w.night < 3 && w.status === 'playing') idle(w, 1);
    claimAt(
      w,
      [
        [2000, 2200],
        [3000, 1900],
        [3450, 1800],
      ],
      'crackWall',
    );
    route(
      w,
      [
        [3200, 2300],
        [P.petBowl.x, P.petBowl.y],
      ],
      [
        [3300, 2100],
        [N.crackWall.x, N.crackWall.y],
      ],
    );
    for (let k = 0; k < 16 && w.status === 'playing'; k++) {
      driveTo(w, 2600, 1900, { sprint: true, timeout: 30 });
      idle(w, 12);
    }
    while (w.status === 'playing') idle(w, 2);
    aggressive = outcome(w);
  }

  // ── Deliberately poor: long loops across bare tile and through the under-sink light.
  {
    const w = createWorld(31337);
    route(
      w,
      [[HOME.x + 20, HOME.y]],
      [
        [1250, 2250],
        [1250, 1900],
        [1050, 1500],
        [800, 1250],
        [P.dishCrumbs.x, P.dishCrumbs.y],
      ],
    );
    route(
      w,
      [[P.sinkDrip.x, P.sinkDrip.y]],
      [
        [1000, 1300],
        [1200, 1900],
        [900, 2300],
        [HOME.x + 20, HOME.y],
      ],
    );
    while (w.status === 'playing' || w.status === 'interlude') {
      driveTo(w, 2560, 920, { sprint: true, timeout: 26, arrive: 110 });
      idle(w, 6);
      if (w.status !== 'playing' && w.status !== 'interlude') break;
      driveTo(w, 1900, 2100, { sprint: true, timeout: 26, arrive: 110 });
      idle(w, 6);
    }
    poor = outcome(w);
  }

  const summary = JSON.stringify({ cautious, aggressive, poor });

  // Careful routing wins and never provokes the extermination tier.
  expect(cautious.status, summary).toBe('won');
  expect(cautious.tier, summary).toBeLessThan(4);

  // Aggressive routing lays down several times as much evidence and does provoke it.
  expect(aggressive.droppings, summary).toBeGreaterThan(cautious.droppings * 3);
  expect(aggressive.tier, summary).toBe(4);
  expect(aggressive.status, summary).not.toBe('won');

  // Routing across bare tile and through the light kills the colony outright.
  expect(poor.status, summary).toBe('lost');
  expect(poor.population, summary).toBe(0);
});

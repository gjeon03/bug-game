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

/**
 * The win must be a property of the strategy, not of one lucky seed — and losing must never be the
 * game's fault.
 *
 * A full three-night run is played headless on several seeds with the same competent strategy. Over a
 * fourteen-seed sweep (recorded in `artifacts/evidence/seed-sweep.md`) twelve won, and the two that
 * did not fell short on population alone after claiming everything. That is the shape asserted here:
 * a clear majority win, and **no** competent run may ever end in collapse or a destroyed nest.
 */
it('a competent strategy wins on most seeds and never loses unfairly', () => {
  const results: string[] = [];
  let won = 0;
  for (const seed of [20260801, 7, 31337, 909, 5150, 66613]) {
    const w = createWorld(seed);
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
    const i1 = claimAt(
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
    const i2 = claimAt(
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
    while (w.night < 3 && w.status !== 'won' && w.status !== 'lost') idle(w, 1);
    const i3 = claimAt(
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
      if (w.status === 'playing' && w.routes.filter((r) => r.linked).length < 3) {
        route(
          w,
          [[3470, 2100]],
          [
            [3450, 2490],
            [P.trashSpill.x, P.trashSpill.y],
          ],
        );
      }
    }
    while (w.status === 'playing') idle(w, 2);
    const line = `seed ${seed}: ${w.status}${w.loseCause ? ` (${w.loseCause})` : ''} pop=${w.colony.population} food=${Math.round(w.colony.food)} water=${Math.round(w.colony.water)} suspicionPeak=${Math.round(w.suspicion.peak)} claims=${[i1, i2, i3].filter(Boolean).length}/3`;
    results.push(line);
    if (w.status === 'won') won++;

    // Whatever happens, competent play always gets its three cracks built...
    expect([i1, i2, i3], line).toEqual([true, true, true]);
    // ...and never dies to a colony collapse or a destroyed nest. Falling short of the population
    // threshold is a legitimate loss; being wiped out while playing well is not.
    expect(['won', 'lost'], line).toContain(w.status);
    if (w.status === 'lost') expect(w.loseCause, line).toBe('notEstablished');
  }

  const summary = results.join('\n');
  expect(won, summary).toBeGreaterThanOrEqual(4);
});

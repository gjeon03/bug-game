import { describe, it } from 'vitest';
import { createRun } from '../../src/colony/state';
import { playRun } from '../bot';
import type { AdaptationFamily } from '../../src/colony/types';
function run1(seed: number, build: AdaptationFamily, skip: boolean, tag: string) {
  const run = createRun(seed);
  const t = playRun(run, { build, skipBathroom: skip, maxSeconds: 50 * 60 });
  const claimed = [...run.footholds.entries()].filter(([, f]) => f.claimed && f.damage < 1);
  const dry = [...run.resources.entries()].filter(([, r]) => r.found && r.remaining < 5).length;
  console.log(
    tag +
      ' ' +
      JSON.stringify({
        status: run.status,
        min: +(t.seconds / 60).toFixed(1),
        gates: [...t.gateOpenedAt].map(
          ([k, v]) =>
            `${k.replace('gate.hallway.', '').replace('gate.', '')}@${(v / 60).toFixed(1)}`,
        ),
        peak: t.peakPopulation,
        pop: run.colony.population,
        cap: run.colony.capacity,
        claimed: claimed.length,
        claimedIds: claimed.map(([id]) => id.split('.').slice(-1)[0]).join(','),
        food: Math.round(run.colony.food),
        moist: Math.round(run.colony.moisture),
        routes: run.routes.length,
        deliveries: run.stats.deliveries,
        sight: run.stats.sightings,
        lost: run.stats.workersLost,
        sweeps: run.stats.exterminationSweeps,
        driedUp: dry,
        alerts: [...run.regions.values()].map((r) => r.alert).join(''),
        blocker: run.objective.blockerKey,
        plateau: +t.longestPlateau.toFixed(1),
      }),
  );
}
describe('probe', () => {
  it('brood', () => run1(20260805, 'brood', false, 'BROOD'), 1800000);
  it('shadow', () => run1(4242, 'shadow', true, 'SHADOW'), 1800000);
});

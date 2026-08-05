import { describe, it } from 'vitest';
import { createRun } from '../../src/colony/state';
import { playRun } from '../bot';
describe('probe', () => {
  it('brood', () => {
    const run = createRun(20260805);
    const t = playRun(run, { build: 'brood', maxSeconds: 50 * 60 });
    console.log(
      'BROOD ' +
        JSON.stringify({
          status: run.status,
          min: +(t.seconds / 60).toFixed(1),
          gates: [...t.gateOpenedAt].map(
            ([k, v]) =>
              `${k.replace('gate.hallway.', '').replace('gate.', '')}@${(v / 60).toFixed(1)}`,
          ),
          peak: t.peakPopulation,
          pop: run.colony.population,
          food: Math.round(run.colony.food),
          moist: Math.round(run.colony.moisture),
          sight: run.stats.sightings,
          lost: run.stats.workersLost,
          plateau: +t.longestPlateau.toFixed(1),
        }),
    );
  }, 1200000);
  it('shadow no bathroom', () => {
    const run = createRun(4242);
    const t = playRun(run, { build: 'shadow', skipBathroom: true, maxSeconds: 50 * 60 });
    console.log(
      'SHADOW ' +
        JSON.stringify({
          status: run.status,
          min: +(t.seconds / 60).toFixed(1),
          gates: [...t.gateOpenedAt].map(
            ([k, v]) =>
              `${k.replace('gate.hallway.', '').replace('gate.', '')}@${(v / 60).toFixed(1)}`,
          ),
          peak: t.peakPopulation,
          sight: run.stats.sightings,
          plateau: +t.longestPlateau.toFixed(1),
        }),
    );
  }, 1200000);
});

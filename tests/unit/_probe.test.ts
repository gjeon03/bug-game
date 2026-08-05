import { describe, it } from 'vitest';
import { createRun } from '../../src/colony/state';
import { playRun } from '../bot';
const fmt = (run: ReturnType<typeof createRun>, t: ReturnType<typeof playRun>, tag: string) =>
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
        sight: run.stats.sightings,
        lost: run.stats.workersLost,
        sweeps: run.stats.exterminationSweeps,
        plateau: +t.longestPlateau.toFixed(1),
      }),
  );
describe('probe', () => {
  it('brood', () => {
    const r = createRun(20260805);
    fmt(r, playRun(r, { build: 'brood', maxSeconds: 55 * 60 }), 'BROOD');
  }, 1800000);
  it('shadow', () => {
    const r = createRun(4242);
    fmt(r, playRun(r, { build: 'shadow', skipBathroom: true, maxSeconds: 55 * 60 }), 'SHADOW');
  }, 1800000);
});

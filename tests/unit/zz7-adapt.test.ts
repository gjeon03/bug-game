import { describe, expect, it } from 'vitest';
import { createWorld, type World } from '../../src/sim/world.ts';
import { ADAPTATIONS, chooseAdaptation, recomputeTraits } from '../../src/sim/adaptations.ts';
import { firstResource, HOME, pt, satellitesFor } from '../map.ts';
import { claimNest, fitOut, layLine, playFor, type PlayerOptions } from './play.ts';
import { UPKEEP_FOOD, UPKEEP_WATER } from '../../src/sim/constants.ts';

const COVERED: PlayerOptions = { style: 'covered' };

/** Same seed, same player, only the adaptation family differs. */
function runFamily(seed: number, family: string, seconds: number) {
  const world = createWorld(seed);
  layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), COVERED);
  layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y }, COVERED);
  const until = world.time + seconds;
  while (world.time < until && world.status === 'playing') {
    // Take only from the named family; never spread.
    for (const id of [...world.adaptations.offer]) {
      if (id.startsWith(family)) chooseAdaptation(world, id);
    }
    playFor(world, 15, { ...COVERED, holdAdaptations: true });
    for (const sat of satellitesFor(world.operation)) {
      const n = world.nests.find((x) => x.id === sat.id)!;
      if (n.claimed || world.colony.food < sat.costFood + 25) continue;
      claimNest(world, sat.id, COVERED);
      break;
    }
    for (const n of world.nests) {
      if (!n.claimed || n.home || n.fn !== null) continue;
      if (world.colony.food < n.fitFood + 20) continue;
      fitOut(world, n.id, 'cache', COVERED);
      break;
    }
  }
  return world;
}

const row = (label: string, w: World): string =>
  `${label.padEnd(10)} t=${w.time.toFixed(0).padStart(4)} ${w.status.padEnd(8)} op=${w.operation} pop=${String(w.colony.population).padStart(2)}/${w.colony.capacity} peakPop=${w.stats.peakPopulation} deliv=${String(w.stats.deliveries).padStart(3)} totalFood=${w.colony.totalFood.toFixed(0)} totalWater=${w.colony.totalWater.toFixed(0)} lost=${w.colony.lost} tier=${w.suspicion.tier} peakSusp=${w.suspicion.peak.toFixed(0)} took=[${w.adaptations.taken.join(',')}]`;

describe('zz adaptations', () => {
  it('three families, same seed, same player', () => {
    const out: string[] = [];
    for (const seed of [31337, 909]) {
      out.push(`── seed ${seed} ──`);
      out.push(row('none', runFamily(seed, 'zzz', 420)));
      for (const f of ['brood', 'forage', 'shadow']) out.push(row(f, runFamily(seed, f, 420)));
    }
    console.log(out.join('\n'));
    expect(out.length).toBeGreaterThan(0);
  }, 900_000);

  it('what each adaptation is actually worth, in numbers', () => {
    const lines: string[] = [];
    for (const a of ADAPTATIONS) {
      const w = createWorld(1);
      w.adaptations.taken = [a.id];
      recomputeTraits(w);
      const t = w.traits;
      const live: string[] = [];
      const dead: string[] = [];
      const base = {
        capacityBonus: 0,
        broodRateMult: 1,
        nymphTimeMult: 1,
        upkeepMult: 1,
        carryMult: 1,
        harvestTimeMult: 1,
        harvestSlotBonus: 0,
        depletionMult: 1,
        eventYieldMult: 1,
        eventDurationMult: 1,
        coveredTrailLifeMult: 1,
        coveredEvidenceMult: 1,
        trafficEvidenceMult: 1,
        openEventEvidenceMult: 1,
        panicLead: 0,
        panicSpeedMult: 1,
        refugeReachMult: 1,
        haulSpeedMult: 1,
      } as Record<string, number>;
      // Traits with no reader anywhere in src/ outside adaptations.ts.
      const DEAD = new Set([
        'depletionMult',
        'coveredTrailLifeMult',
        'coveredEvidenceMult',
        'panicLead',
      ]);
      for (const [k, v] of Object.entries(t as unknown as Record<string, number>)) {
        if (v === base[k]) continue;
        (DEAD.has(k) ? dead : live).push(`${k}=${v}`);
      }
      lines.push(
        `${a.id.padEnd(8)} ${a.costFood}f/${a.costWater}w  LIVE: ${live.join(' ') || '(nothing)'}${dead.length ? `   DEAD: ${dead.join(' ')}` : ''}`,
      );
    }
    console.log(lines.join('\n'));
    console.log(
      `\nupkeep at pop 20: food ${(UPKEEP_FOOD * 20).toFixed(2)}/s, water ${(UPKEEP_WATER * 20).toFixed(2)}/s` +
        `\n  brood1+brood2+brood3 -> upkeepMult ${(1.25 * 1.25 * 1.3).toFixed(2)} = food ${(UPKEEP_FOOD * 20 * 1.25 * 1.25 * 1.3).toFixed(2)}/s`,
    );
  });

  it('is capacity ever the binding constraint', () => {
    const w = runFamily(31337, 'zzz', 420);
    console.log(
      `no-adaptation run: population ${w.colony.population}, capacity ${w.colony.capacity}, headroom ${w.colony.capacity - w.colony.population}` +
        `\n  peak population ${w.stats.peakPopulation}` +
        `\n  a brood adaptation adds +10..+18 capacity to headroom that is already ${w.colony.capacity - w.stats.peakPopulation} at peak`,
    );
  }, 300_000);
});

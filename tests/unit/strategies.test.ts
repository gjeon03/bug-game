import { describe, expect, it } from 'vitest';
import { createWorld, type World } from '../../src/sim/world.ts';
import { knownCellCount, totalHeat } from '../../src/sim/heat.ts';
import { firstResource, HOME, pt, satellitesFor } from '../map.ts';
import { bankUntil, claimNest, layLine, playFor, type PlayerOptions } from './play.ts';

/**
 * Two ways to play the same seed.
 *
 * This is the design thesis as an executable claim: cover-hugging routing and routing through the
 * light produce different growth *and* different household pressure. The old version of this test was
 * three hand-scripted 120-line runs across three fixed nights; this one asks the same player for two
 * different *intents* and lets `tests/map.ts` work out the geometry.
 */

const CAUTIOUS: PlayerOptions = { style: 'covered' };
const RECKLESS: PlayerOptions = { style: 'open', detour: true, reckless: true };

interface Outcome {
  operation: number;
  status: string;
  loseCause: string | null;
  tier: number;
  droppings: number;
  heat: number;
  knownCells: number;
  population: number;
  peakPopulation: number;
  deliveries: number;
  scoutDeaths: number;
}

function play(seed: number, opts: PlayerOptions, seconds: number): Outcome {
  const world = createWorld(seed);
  layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), opts);
  layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y }, opts);

  const until = world.time + seconds;
  while (world.time < until && world.status === 'playing') {
    playFor(world, 25, opts);
    // Both players take ground when they can afford it; only the routing differs.
    for (const sat of satellitesFor(world.operation)) {
      if (world.nests.find((n) => n.id === sat.id)!.claimed) continue;
      if (world.colony.food < sat.costFood + 30) continue;
      claimNest(world, sat.id, opts);
      break;
    }
  }
  return summarise(world);
}

function summarise(world: World): Outcome {
  return {
    operation: world.operation,
    status: world.status,
    loseCause: world.loseCause,
    tier: world.suspicion.reachedTier,
    droppings: world.suspicion.causes.droppings,
    heat: totalHeat(world),
    knownCells: knownCellCount(world),
    population: world.colony.population,
    peakPopulation: world.stats.peakPopulation,
    deliveries: world.stats.deliveries,
    scoutDeaths: world.stats.scoutDeaths,
  };
}

describe('routing style changes the run', () => {
  it('cautious and reckless play produce different growth and a different price per haul', () => {
    const cautious = play(31337, CAUTIOUS, 320);
    const reckless = play(31337, RECKLESS, 320);
    const note = JSON.stringify({ cautious, reckless });

    // ── Growth. A line that goes the long way through the light is slow as well as loud, so the
    // careful colony is simply further along the run.
    expect(cautious.deliveries, note).toBeGreaterThan(reckless.deliveries * 3);
    expect(cautious.peakPopulation, note).toBeGreaterThan(reckless.peakPopulation);
    expect(cautious.operation, note).toBeGreaterThanOrEqual(reckless.operation);

    // ── Price. The honest comparison is not total evidence — the careful colony runs for longer and
    // hauls far more — but what each haul *cost*. This is the number the whole design turns on.
    const cost = (o: Outcome): number => o.droppings / Math.max(1, o.deliveries);
    expect(
      cost(reckless),
      `evidence per delivery: reckless ${cost(reckless).toFixed(2)} vs cautious ${cost(cautious).toFixed(2)}`,
    ).toBeGreaterThan(cost(cautious) * 3);

    // ── Both are real runs, not one run and one stalled world.
    expect(reckless.deliveries, note).toBeGreaterThan(0);
    expect(cautious.deliveries, note).toBeGreaterThan(0);
  }, 90_000);

  it('a careful run is never wiped out by the household inside the opening operations', () => {
    const cautious = play(31337, CAUTIOUS, 320);
    const note = JSON.stringify(cautious);
    // Falling short is a legitimate loss; being exterminated for playing carefully is not.
    expect(['playing', 'won'], note).toContain(cautious.status);
    expect(cautious.loseCause, note).toBeNull();
  }, 60_000);

  it('the household ends up knowing about the ground the player used, on either strategy', () => {
    const cautious = play(66613, CAUTIOUS, 260);
    const reckless = play(66613, RECKLESS, 260);
    const note = JSON.stringify({ cautious, reckless });
    // Evidence can never be ground to zero, whichever way the player routes.
    expect(cautious.tier + reckless.tier, note).toBeGreaterThan(0);
    expect(Math.max(cautious.heat, reckless.heat), note).toBeGreaterThan(0);
  }, 90_000);
});

describe('a competent opening is reproducible', () => {
  it('supplies itself and finishes the first operation on every seed tried', () => {
    const lines: string[] = [];
    for (const seed of [20260801, 7, 31337, 909, 5150]) {
      const world = createWorld(seed);
      layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')));
      layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y });
      for (let k = 0; k < 30 && world.operation < 2 && world.status === 'playing'; k++) {
        playFor(world, 20);
      }
      // Take the first crack the new operation opens, to prove the economy carries into it.
      const sat = satellitesFor(world.operation)[0];
      if (sat) {
        bankUntil(world, sat.costFood + 30, sat.costWater + 20, 200);
        claimNest(world, sat.id);
      }

      const line = `seed ${seed}: op=${world.operation} ${world.status} pop=${world.colony.population} deliveries=${world.stats.deliveries} claimed=${world.nests.filter((n) => n.claimed).length}`;
      lines.push(line);

      // The win is a property of the strategy, not of the seed: every one of these must complete
      // operation 1, keep a colony alive, and never lose the home crack.
      expect(world.operation, line).toBeGreaterThanOrEqual(2);
      expect(world.status, line).toBe('playing');
      expect(world.stats.deliveries, line).toBeGreaterThan(8);
      expect(world.loseCause, line).toBeNull();
      expect(world.nests.filter((n) => n.claimed).length, line).toBeGreaterThan(1);
    }
    expect(lines.length).toBe(5);
  }, 120_000);
});

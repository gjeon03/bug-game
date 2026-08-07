import { describe, expect, it } from 'vitest';
import { spawnSwat } from '../../src/colony/household';
import { CAUGHT_SECONDS, SCOUT_DOWN_SECONDS, createRun } from '../../src/colony/state';
import { stepRun } from '../../src/colony/step';
import type { Run } from '../../src/colony/types';

/**
 * Can the household hurt the player?
 *
 * For the whole of the previous build the answer was no, and nothing in the suite said so. Every
 * one of the seven authored responses carried a `lethality`, `tickThreat` spent that number killing
 * workers, and the block that handled the scout raised an information meter and returned. A player
 * reported it in plain words — the getting-stomped content had disappeared — after seventeen
 * headless gates had all gone green.
 *
 * The reason no gate caught it is worth stating, because it decides what this file has to assert.
 * Every existing test measured the run: was it won, how long did it take, how many workers died.
 * A scout that cannot die changes none of those numbers — it makes the run *easier*, and "easier"
 * looks exactly like "balanced" from the outside. The absent mechanic had no observable signature
 * at the level anything was looking at.
 *
 * So these assertions are deliberately at the level of the body: put the scout under the thing,
 * step the real simulation, and check that the specific person holding the keyboard died.
 */

const DT = 1 / 60;
const STILL = { moveX: 0, moveZ: 0, sprint: false, stamina: 1 };

/** Advance the real fixed-step simulation. No state is written by hand. */
function advance(run: Run, seconds: number, input = STILL): void {
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) stepRun(run, DT, input);
}

/**
 * A run with a swat already committed exactly where the scout is standing.
 *
 * The scout walks out of the nest first. Not for realism — because the nest is where the starting
 * workers are, and a swat landing on it wipes the colony before the scout finishes dying, which
 * silently changed what several of these assertions were measuring.
 */
function swatOnScout(seed = 20260807): Run {
  const run = createRun(seed);
  advance(run, 4, { moveX: 1, moveZ: 0.4, sprint: false, stamina: 1 });

  const region = run.house.regionOf.get(run.scout.surface);
  if (!region) throw new Error('the scout is not in a region');
  spawnSwat(run, region, run.scout.surface, run.scout.x, run.scout.z);
  return run;
}

describe('being seen has a consequence for the scout’s body', () => {
  it('a sighting sends a hand down where the scout was standing', () => {
    const run = swatOnScout();
    const swat = run.threats.find((t) => t.kind === 'swat');

    expect(swat, 'no swat was created').toBeDefined();
    expect(swat!.phase).toBe('telegraph');
    // Aimed at the sighting, not tracked to the scout. Moving has to be the answer.
    expect(swat!.x).toBeCloseTo(run.scout.x, 6);
    expect(swat!.z).toBeCloseTo(run.scout.z, 6);
  });

  it('the telegraph alone never hurts anybody', () => {
    const run = swatOnScout();
    // Just short of the telegraph expiring. Nothing has landed yet, so nothing may have happened.
    advance(run, 1.2);

    expect(run.threats[0]?.phase).toBe('telegraph');
    expect(run.scout.caught).toBe(0);
    expect(run.stats.scoutsLost).toBe(0);
  });

  it('standing under it crushes the scout', () => {
    const run = swatOnScout();
    const before = run.colony.population;
    expect(before, 'the colony has to start with somebody to promote').toBeGreaterThan(0);

    advance(run, 3);

    expect(run.stats.scoutsLost, 'the scout survived a direct hit').toBe(1);
    expect(run.scout.state).toBe('dead');
    expect(run.scout.downFor).toBeGreaterThan(0);
    // The price is a body, taken out of the workforce rather than counted as a casualty.
    expect(run.colony.population).toBe(before - 1);
    expect(run.stats.workersLost).toBe(0);
  });

  it('walking out of the core survives it', () => {
    const run = swatOnScout();
    // Away from the impact for the whole of the active window. Same threat, same timing, one
    // different decision — which is the property that makes the death attributable.
    advance(run, 3, { moveX: 1, moveZ: 1, sprint: true, stamina: 1 });

    expect(run.stats.scoutsLost, 'running away did not save the scout').toBe(0);
    expect(run.scout.state).not.toBe('dead');
  });

  it('the crush meter fills no faster than the scout can outrun it', () => {
    const run = swatOnScout();
    advance(run, 1.5 + CAUGHT_SECONDS * 0.4);

    /*
     * Sampled mid-fill on purpose. If this ever reads 1 the meter has become instant, at which
     * point the telegraph is decoration and the player is being killed by a die roll wearing a
     * progress bar.
     */
    expect(run.scout.caught).toBeGreaterThan(0);
    expect(run.scout.caught).toBeLessThan(1);
  });
});

describe('the colony sends up its next scout', () => {
  it('returns control at the home nest after the blackout', () => {
    const run = swatOnScout();
    advance(run, 3);
    const diedAt = { x: run.scout.x, z: run.scout.z };

    advance(run, SCOUT_DOWN_SECONDS + 0.5);

    expect(run.scout.state).not.toBe('dead');
    expect(run.scout.downFor).toBe(0);
    expect(run.scout.caught).toBe(0);
    expect(run.status).toBe('playing');
    // Back at the bottom of the kitchen, not where the last one fell. Re-walking the route is the
    // part of the loss that is actually felt.
    const moved = Math.hypot(run.scout.x - diedAt.x, run.scout.z - diedAt.z);
    expect(moved, 'the replacement spawned on the corpse').toBeGreaterThan(0);
    expect(run.scout.surface).toBe(run.house.footholds.get('kitchen.undersink')?.surface);
  });

  it('the replacement is not visible the instant it steps out', () => {
    const run = swatOnScout();
    advance(run, 3 + SCOUT_DOWN_SECONDS + 0.5);
    // Without the grace period a run in a lit kitchen spirals: seen, swatted, replaced, seen again.
    expect(run.scout.seenCooldown).toBeGreaterThan(0);
  });

  it('a colony with nobody left to promote loses the run', () => {
    const run = swatOnScout();
    for (const worker of run.workers) worker.alive = false;
    run.colony.population = 0;

    advance(run, 3);

    expect(run.status).toBe('lost');
    expect(run.log.some((entry) => entry.key === 'log.lost.noScout')).toBe(true);
  });
});

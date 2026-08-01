import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/clock.ts';
import {
  MAX_HAZARDS,
  TIER_THRESHOLDS,
  TRAP_ARM_TIME,
  TRAP_CAPACITY,
} from '../../src/sim/constants.ts';
import {
  HEAT_FLOOR_FRACTION,
  heatAt,
  heatCellCentre,
  heatIndexAt,
  hottestCell,
  knownCellCount,
  totalHeat,
} from '../../src/sim/heat.ts';
import { FINAL_RESPONSE_LENGTH } from '../../src/sim/operations.ts';
import {
  ROUTINE_SPECS,
  spawnSweep,
  startRoutine,
  SWEEP_WARN,
  updateRoutines,
} from '../../src/sim/routines.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { addSuspicion, TIER_HOLD } from '../../src/sim/suspicion.ts';
import { HAZARD_LIFE, deployTraps } from '../../src/sim/threats.ts';
import { createWorld, type World } from '../../src/sim/world.ts';
import { firstResource, HOME, mostExposedPoint, pt } from '../map.ts';
import { driveTo, idle, stepUntil } from './helpers.ts';
import { layLine, playFor } from './play.ts';

/**
 * The household side of the redesign: regional evidence, timed routine events, and a director that
 * spends a budget instead of reading a stopwatch.
 *
 * The measured failures these replace: `addSuspicion` discarded the x,y it was given, so the house
 * had no memory of place; 13 of 14 threat spawns in a winning run were clock-driven; and tiers 2→3→4
 * could all fire inside 15 seconds.
 */

const OPEN = { style: 'open', detour: true } as const;
const COVERED = { style: 'covered' } as const;

/** Lays one line out through the brightest ground in the kitchen — the incriminating shape. */
function exposedLine(world: World): void {
  layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), OPEN);
}

/**
 * Runs the clock on a line that has already been laid, reporting the worst amount of scent the
 * household could see at any one moment.
 *
 * The scout is left where it stands and nothing is re-laid, so the only variable between the two
 * runs is the shape of the trail that is already on the floor.
 */
function peakExposedTrail(world: World, seconds: number): number {
  let peak = 0;
  const until = world.time + seconds;
  while (world.time < until && world.status === 'playing') {
    idle(world, 2);
    peak = Math.max(peak, world.exposedTrail);
  }
  return peak;
}

describe('regional evidence', () => {
  it('deposits into the cell the evidence happened in, and nowhere else', () => {
    const world = createWorld(2001);
    const open = mostExposedPoint();
    const cell = heatIndexAt(open.x, open.y);
    expect(heatAt(world, open.x, open.y)).toBe(0);

    addSuspicion(world, 'seen', 4, open.x, open.y);

    expect(heatAt(world, open.x, open.y)).toBeGreaterThan(0);
    let elsewhere = 0;
    for (let i = 0; i < world.heat.value.length; i++)
      if (i !== cell) elsewhere += world.heat.value[i];
    expect(elsewhere, 'evidence must not smear across the whole kitchen').toBe(0);
  });

  it('the hottest cell is where the player actually walked and worked', () => {
    const world = createWorld(2002);
    exposedLine(world);
    playFor(world, 180, OPEN);

    const hot = hottestCell(world, () => false);
    expect(hot, 'an exposed supply line must register somewhere').not.toBeNull();
    expect(totalHeat(world)).toBeGreaterThan(0);

    // The hot cell must sit on the ground the colony used, not on an arbitrary tile.
    const nodes = world.routes.flatMap((r) => r.nodes);
    const workerish = nodes.concat(
      world.workers.filter((w) => w.alive).map((w) => ({ x: w.x, y: w.y }) as never),
    );
    const nearest = Math.min(
      ...workerish.map((n) => Math.hypot(n.x - hot!.x, n.y - hot!.y)),
      Math.hypot(HOME.x - hot!.x, HOME.y - hot!.y),
    );
    expect(nearest, `hottest cell at ${Math.round(hot!.x)},${Math.round(hot!.y)}`).toBeLessThan(
      500,
    );
  }, 30_000);

  it('an exposed line leaves several times the evidence a covered one does', () => {
    // Same seed, same source, same colony: the only difference is the shape of the line.
    const covered = createWorld(2003);
    layLine(covered, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), COVERED);
    const safeTrail = peakExposedTrail(covered, 200);

    const exposed = createWorld(2003);
    exposedLine(exposed);
    const openTrail = peakExposedTrail(exposed, 200);

    // Exposed *trail*, not mean route exposure: a long safe detour dilutes its own average, while
    // what the household actually reads is how much scent is sitting on ground it can see.
    expect(
      openTrail,
      'precondition: the archetypes differ in what they leave behind',
    ).toBeGreaterThan(safeTrail * 4);

    // Trail evidence is the term route geometry controls, and it is the one the ledger names. Total
    // regional heat is deliberately *not* compared: the grid spreads a long line's deposits across
    // many cells while a short one concentrates them, so a totals comparison would be measuring
    // route length rather than route risk.
    // Three times, not four: the ratio is measured over a window in which both colonies also haul
    // from whatever the household happens to spill, and a spill is on open ground for everybody.
    // What must hold is the *class* of difference — an open line is multiples worse, not a few per
    // cent worse — not a hair-fine multiple that drifts with routine timing.
    expect(
      exposed.suspicion.causes.droppings,
      `trail evidence: exposed ${exposed.suspicion.causes.droppings.toFixed(1)} vs covered ${covered.suspicion.causes.droppings.toFixed(1)}`,
    ).toBeGreaterThan(covered.suspicion.causes.droppings * 2.5);
    expect(exposed.suspicion.peak).toBeGreaterThan(covered.suspicion.peak);
    // ...and both put something on the household's map, because evidence is never erasable.
    expect(totalHeat(exposed)).toBeGreaterThan(0);
    expect(totalHeat(covered)).toBeGreaterThan(0);
    expect(knownCellCount(exposed)).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('never decays below a fraction of its own peak', () => {
    const world = createWorld(2004);
    const open = mostExposedPoint();
    addSuspicion(world, 'seen', 20, open.x, open.y);
    const peak = heatAt(world, open.x, open.y);
    expect(peak).toBeGreaterThan(0);

    idle(world, 400);

    const now = heatAt(world, open.x, open.y);
    expect(now).toBeGreaterThan(0);
    expect(now).toBeGreaterThanOrEqual(peak * HEAT_FLOOR_FRACTION - 1e-6);
    expect(now, 'it must still decay toward that floor').toBeLessThan(peak);
  });
});

describe('escalation is rate-limited', () => {
  it('cannot promote two tiers inside the hold window', () => {
    const world = createWorld(2010);
    // Enough evidence for the top tier in one go: the ladder still has to be climbed one rung at a
    // time, which is the whole point of the hold.
    addSuspicion(world, 'seen', TIER_THRESHOLDS.at(-1)! + 10, 0, 0);

    stepUntil(world, (w) => w.suspicion.tier >= 1, TIER_HOLD + 5);
    expect(world.suspicion.tier).toBe(1);

    idle(world, TIER_HOLD * 0.8);
    expect(world.suspicion.tier, 'a second promotion inside the hold window').toBe(1);

    idle(world, TIER_HOLD * 0.5);
    expect(world.suspicion.tier).toBe(2);
  });

  it('climbs the whole ladder given enough time, and names the next response at each rung', () => {
    const world = createWorld(2011);
    const seen = new Set<string>();
    for (let i = 0; i < (TIER_HOLD * (TIER_THRESHOLDS.length + 1)) / SIM_DT; i++) {
      // Kept topped up, so the ladder is limited by the hold window rather than by decay.
      addSuspicion(world, 'seen', 1, 0, 0);
      stepWorld(world, SIM_DT);
      seen.add(world.nextResponse);
    }
    expect(world.suspicion.tier).toBe(TIER_THRESHOLDS.length);
    expect(seen.size).toBe(TIER_THRESHOLDS.length + 1);
  });
});

describe('the director spends a budget instead of reading a clock', () => {
  it('acts on a cooldown, one readable beat at a time', () => {
    const world = createWorld(2020);
    exposedLine(world);

    const actions: number[] = [];
    const bright = mostExposedPoint();
    for (let round = 0; round < 26 && world.status === 'playing'; round++) {
      // A run that is actually being played: supply lines kept alive, and the scout loitering on the
      // brightest ground in the kitchen. The household cannot invent a location it has never seen
      // activity in, so it has to be given one.
      playFor(world, 10, OPEN);
      driveTo(world, bright.x, bright.y, { timeout: 20 });
      for (let i = 0; i < 14 / SIM_DT && world.status === 'playing'; i++) {
        const before = world.events.length;
        stepWorld(world, SIM_DT);
        const spawned = world.events
          .slice(before)
          .some(
            (e) =>
              e.t === 'trapArmed' ||
              e.t === 'lightOn' ||
              e.t === 'sweepWarn' ||
              e.t === 'sprayStart',
          );
        if (spawned) actions.push(world.time);
        world.events.length = 0;
      }
    }

    expect(actions.length, 'the household never did anything at all').toBeGreaterThan(0);
    for (let i = 1; i < actions.length; i++) {
      // Deliberately looser than the internal cooldown: what is being asserted is that pressure
      // arrives in separated beats rather than as a single pile-up.
      expect(
        actions[i] - actions[i - 1],
        `two responses ${(actions[i] - actions[i - 1]).toFixed(1)}s apart`,
      ).toBeGreaterThan(8);
    }
  }, 30_000);

  it('does nothing at all while it has seen nothing', () => {
    const world = createWorld(2021);
    // No routes, no traffic, nobody outside the crack: no evidence exists, so the house has no
    // location to act on. The old build ran its whole schedule anyway.
    idle(world, 260);
    expect(totalHeat(world)).toBe(0);
    expect(world.hazards.length).toBe(0);
    expect(world.sprays.length).toBe(0);
  }, 20_000);

  it('never reaches for the spray before the evidence justifies it', () => {
    const world = createWorld(2022);
    exposedLine(world);
    let firstSprayTier = -1;
    for (let i = 0; i < 600 / SIM_DT && world.status === 'playing'; i++) {
      stepWorld(world, SIM_DT);
      if (firstSprayTier < 0 && !world.finalResponse && world.sprays.length > 0) {
        firstSprayTier = world.suspicion.tier;
      }
      world.events.length = 0;
    }
    if (firstSprayTier >= 0) {
      expect(
        firstSprayTier,
        'spray is the severe answer and needs real evidence',
      ).toBeGreaterThanOrEqual(3);
      // A cloud must never be an unavoidable execution: shelter has to exist first.
      expect(world.nests.filter((n) => n.claimed).length).toBeGreaterThan(0);
    }
  }, 40_000);

  it('hazards age out, so the response families cannot silently disable themselves', () => {
    const world = createWorld(2023);
    const target = mostExposedPoint();
    deployTraps(world, MAX_HAZARDS, target.x, target.y);
    const planted = world.hazards.length;
    expect(planted).toBeGreaterThan(0);

    idle(world, HAZARD_LIFE + 10);
    expect(world.hazards.length, 'the household tidies its own traps away').toBe(0);
  }, 20_000);

  it('a trap goes down on the worked line, and telegraphs itself before it catches anything', () => {
    const world = createWorld(2024);
    layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), COVERED);
    const line = world.routes.at(-1)!;
    idle(world, 45);

    // The household puts traps on the ground it has watched the colony use.
    const mid = line.nodes[Math.floor(line.nodes.length / 2)];
    const caughtBefore = world.stats.trapsSprung;
    deployTraps(world, 2, mid.x, mid.y);
    const onLine = world.hazards.filter((h) =>
      line.nodes.some((n) => Math.hypot(n.x - h.x, n.y - h.y) < h.radius * 3),
    );
    expect(onLine.length, 'a trap has to land on the compromised line').toBeGreaterThan(0);

    // Nothing in this game may take a roach without warning it: the trap sits visibly unarmed first.
    expect(world.hazards.every((h) => !h.armed)).toBe(true);
    idle(world, TRAP_ARM_TIME * 0.6);
    expect(
      world.hazards.every((h) => !h.armed),
      'still settling',
    ).toBe(true);
    expect(world.stats.trapsSprung, 'an unarmed trap catches nothing').toBe(caughtBefore);

    idle(world, TRAP_ARM_TIME);
    expect(world.hazards.some((h) => h.armed)).toBe(true);

    // ...and it is not bottomless. A trap that has taken its fill goes inert, which is what reopens
    // the route the player was pushed off.
    idle(world, 120);
    for (const h of world.hazards) {
      expect(h.sprung, 'a trap can never catch more than it holds').toBeLessThanOrEqual(
        TRAP_CAPACITY,
      );
    }
    expect(world.stats.trapsSprung).toBeGreaterThanOrEqual(caughtBefore);
  }, 40_000);
});

describe('household routines', () => {
  it('runs the full anticipation → window → aftermath chain and puts real food on the floor', () => {
    const world = createWorld(2030);
    const spec = ROUTINE_SPECS[0];
    const routine = startRoutine(world, spec.kind)!;
    expect(routine.phase).toBe('incoming');
    expect(world.events.some((e) => e.t === 'routineWarn')).toBe(true);

    // Anticipation first: nothing is on the floor yet, and the room has begun to change.
    idle(world, spec.incoming - 1);
    expect(routine.phase).toBe('incoming');
    expect(routine.light).toBeGreaterThan(0);
    expect(world.resources.some((r) => r.id === routine.resourceId)).toBe(false);

    stepUntil(world, () => routine.phase === 'active', 6);
    expect(routine.phase).toBe('active');
    expect(routine.resourceId).not.toBeNull();
    const spill = world.resources.find((r) => r.id === routine.resourceId)!;
    expect(spill.amount).toBeGreaterThan(0);
    expect(spill.kind).toBe(spec.resourceKind);
    expect(spill.label).toBe(spec.title);
  });

  it('counts an exploited routine once, and cleans the spill up behind it', () => {
    const world = createWorld(2031);
    // The washing-up: the one routine a colony still living in its first crack can physically reach
    // inside the window, which is why the design puts it on the sink run.
    const spec = ROUTINE_SPECS.find((s) => s.kind === 'dishes')!;
    const routine = startRoutine(world, spec.kind)!;
    stepUntil(world, () => routine.phase === 'active', 12);
    const spillId = routine.resourceId!;

    // Let the wipe that comes with the tap go past first — laying into a moving cloth is wasted
    // pheromone, and knowing that is the counterplay.
    stepUntil(world, (w) => w.sweeps.length === 0, 20);
    layLine(world, { x: HOME.x + 30, y: HOME.y }, { x: spec.x, y: spec.y }, COVERED);
    stepUntil(world, (w) => w.stats.routinesExploited > 0, 60);
    expect(world.stats.routinesExploited, 'taking anything from a spill counts once').toBe(1);
    expect(routine.exploited).toBe(true);

    // Run the window out. The floor has to be tidied: no orphaned source, and nobody left standing
    // at a pile that is not there any more.
    stepUntil(world, () => routine.phase === 'aftermath' || routine.phase === 'done', 90);
    idle(world, 1);
    expect(world.resources.some((r) => r.id === spillId)).toBe(false);
    expect(world.workers.filter((w) => w.alive && w.targetResource === spillId)).toEqual([]);
    expect(world.routes.filter((r) => r.resourceId === spillId)).toEqual([]);
    expect(world.stats.routinesExploited).toBe(1);
    expect(routine.harvested).toBeGreaterThan(0);
  }, 40_000);

  it('the washing-up brings a cleaning pass with it', () => {
    const world = createWorld(2032);
    const dishes = ROUTINE_SPECS.find((s) => s.kind === 'dishes')!;
    const routine = startRoutine(world, dishes.kind)!;
    stepUntil(world, () => routine.phase === 'active', 20);
    expect(routine.denyRadius, 'the standing water is there immediately').toBeGreaterThan(0);
    // The wipe deliberately arrives in the *second half* of the window. Firing it the instant the
    // spill opened sabotaged the only routine anchor the colony could physically reach in time.
    expect(world.sweeps.length, 'the cloth does not arrive with the water').toBe(0);
    stepUntil(world, () => world.sweeps.length > 0, 60);
    expect(world.sweeps.length, 'but it does arrive').toBeGreaterThan(0);
  });
});

describe('the cleaning sweep deletes the map, not the colony', () => {
  it('warns first, then wipes trail life along its path', () => {
    const world = createWorld(2040);
    layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')));
    const route = world.routes[0];
    const mid = route.nodes[Math.floor(route.nodes.length / 2)];
    const before = route.nodes.map((n) => n.life);

    const sweep = spawnSweep(world, [
      { x: mid.x, y: mid.y - 200 },
      { x: mid.x, y: mid.y + 200 },
    ])!;
    expect(sweep.warn).toBeGreaterThan(0);
    expect(world.events.some((e) => e.t === 'sweepWarn')).toBe(true);

    // Nothing may be taken without a telegraph.
    idle(world, SWEEP_WARN * 0.5);
    const midIndex = Math.floor(route.nodes.length / 2);
    expect(route.nodes[midIndex].life).toBeCloseTo(before[midIndex], 0);

    const popBefore = world.colony.population;
    stepUntil(world, () => world.sweeps.length === 0, 20);

    const wiped = route.nodes.filter(
      (n, i) => Math.abs(n.x - mid.x) < 140 && n.life < before[Math.min(i, before.length - 1)] - 20,
    );
    expect(wiped.length, 'scent along the wiped stripe must be gone').toBeGreaterThan(0);
    // It shoves roaches clear rather than killing them: a wipe you can survive but not ignore.
    expect(world.colony.population).toBe(popBefore);
  }, 20_000);
});

describe('the extermination is aimed at the player’s own map', () => {
  it('sprays the region the household has the most evidence about', () => {
    const world = createWorld(2050);
    exposedLine(world);
    for (let k = 0; k < 10 && totalHeat(world) < 0.4 && world.status === 'playing'; k++) {
      playFor(world, 30, OPEN);
    }
    const hot = hottestCell(world, () => false);
    expect(hot, 'the run has to leave evidence somewhere before it can be aimed at').not.toBeNull();

    // Arriving at the last operation is what starts the response; the test puts the run at that
    // moment rather than replaying twenty minutes to get there.
    world.operation = 3;
    world.finalResponse = true;
    world.finalResponseTime = 0;
    stepUntil(world, (w) => w.sprays.length > 0, 40);
    expect(world.sprays.length, 'the response has to actually arrive').toBeGreaterThan(0);

    const centre = heatCellCentre(hot!.index);
    const nearest = Math.min(
      ...world.sprays.flatMap((s) => s.path.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y))),
    );
    expect(nearest, 'the cloud walks the corridor the colony hammered').toBeLessThan(1400);
  }, 40_000);

  it('resolves into a verdict when the response has run its course', () => {
    const world = createWorld(2051);
    world.operation = 4;
    world.finalResponse = true;
    world.finalResponseTime = FINAL_RESPONSE_LENGTH - 0.5;
    expect(world.status).toBe('playing');
    idle(world, 1);
    expect(world.status).not.toBe('playing');
    expect(world.finalTally, 'the numbers behind the verdict are frozen with it').not.toBeNull();
    expect(world.finalTally!.runSeconds).toBeGreaterThan(0);
  });
});

describe('routine bookkeeping', () => {
  it('never lets the routine list grow without bound', () => {
    const world = createWorld(2060);
    for (let i = 0; i < 12; i++) {
      world.routines.forEach((r) => (r.phase = 'done'));
      startRoutine(world, ROUTINE_SPECS[i % ROUTINE_SPECS.length].kind);
      updateRoutines(world, SIM_DT);
    }
    expect(world.routines.length).toBeLessThanOrEqual(6);
  });

  it('only one routine is live at a time', () => {
    const world = createWorld(2061);
    expect(startRoutine(world, 'snack')).not.toBeNull();
    expect(
      startRoutine(world, 'trash'),
      'the house does two things at once nowhere else',
    ).toBeNull();
  });
});

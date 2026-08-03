import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n/index.ts';
import { zoneAt, ZONES_TO_WIN } from '../../src/sim/territory.ts';
import { SIM_DT } from '../../src/core/clock.ts';
import {
  ADAPTATIONS,
  chooseAdaptation,
  MILESTONE_POPULATION,
  specById,
} from '../../src/sim/adaptations.ts';
import { chooseFunction, doInteract, recomputeLimits } from '../../src/sim/colony.ts';
import {
  BASE_CAPACITY,
  BOLTHOLE_CAPACITY,
  CACHE_FOOD_BONUS,
  CACHE_WATER_BONUS,
  CAPACITY_PER_NEST,
  NURSERY_CAPACITY,
} from '../../src/sim/constants.ts';
import {
  cappedAdvice,
  currentGate,
  gateSatisfied,
  operationCardLines,
  operationSpec,
  OPERATIONS,
  resolveHud,
} from '../../src/sim/operations.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { killWorker } from '../../src/sim/workers.ts';
import type { FootholdFunction } from '../../src/sim/types.ts';
import { createWorld, type World } from '../../src/sim/world.ts';
import { firstResource, HOME, nestSpec, pt, satellitesFor } from '../map.ts';
import { idle, stepUntil } from './helpers.ts';
import {
  bankUntil,
  claimNest,
  fitOut,
  layLine,
  playFor,
  takeAdaptation,
  walkTo,
  type PlayerOptions,
} from './play.ts';

/**
 * The four operations, the objective hierarchy and the growth choices.
 *
 * The measured failure this replaces: progress was gated on `nightTime >=`, so nothing the player did
 * moved the schedule; and a capped larder produced no next action for 58 % of a run.
 */

const COVERED: PlayerOptions = { style: 'covered' };
/** For tests whose subject is the adaptation itself: do not spend the choice on the way in. */
const SAVING: PlayerOptions = { style: 'covered', holdAdaptations: true };

/**
 * Plays operation 1 to completion: two supply lines and a colony grown to the gate.
 *
 * `opts` is passed straight through, so a test that is about adaptations can tell the player to hold
 * its choices rather than spending them on the way here.
 */
function playThroughOperationOne(world: World, opts: PlayerOptions = COVERED): void {
  layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), opts);
  layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y }, opts);
  for (let k = 0; k < 40 && world.operation < 2 && world.status === 'playing'; k++) {
    playFor(world, 20, opts);
  }
  expect(world.operation, 'operation 1 has to be completable by playing it').toBeGreaterThanOrEqual(
    2,
  );
}

/** ...and then buys the first crack operation 2 opens, with food the roaches carried home. */
function playToFirstFoothold(world: World, opts: PlayerOptions = COVERED): string {
  playThroughOperationOne(world, opts);
  const sat = satellitesFor(world.operation)[0];
  bankUntil(world, sat.costFood + 30, sat.costWater + 20, 220, opts);
  expect(claimNest(world, sat.id, opts)).toBe(true);
  return sat.id;
}

describe('operations advance on achievement, never on a clock', () => {
  it('does not advance while a gate is unmet, however long it takes', () => {
    const world = createWorld(1001);
    const spec = operationSpec(1);
    // Well past the soft timer, which is meant to cost pressure, not progress.
    idle(world, spec.softTime + 60);

    expect(world.operationTime).toBeGreaterThan(spec.softTime);
    expect(world.operation).toBe(1);
    expect(currentGate(world)).not.toBeNull();
    expect(world.stats.operationsCompleted).toBe(0);
  });

  it('overrunning the soft time raises household pressure instead of failing the run', () => {
    const world = createWorld(1002);
    // A colony that is actually being supplied, so the only thing under test is the overrun.
    layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')));
    layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y });
    const softTime = operationSpec(1).softTime;
    stepUntil(world, (w) => w.operationTime >= softTime - 5, softTime);
    const before = world.suspicion.value;
    playFor(world, 90);

    expect(world.status).toBe('playing');
    expect(world.operationTime).toBeGreaterThan(softTime);
    expect(world.suspicion.value).toBeGreaterThan(before);
  }, 20_000);

  it('closes a gate by achieving it, and holds the operation while another is still open', () => {
    const world = createWorld(20260801);
    playThroughOperationOne(world);
    expect(world.operation).toBe(2);

    // At the instant operation 2 opens, no satellite can have been claimed — every crack is sealed
    // until this operation. So this gate is unmet by construction, and the operation must sit still
    // no matter how long the player spends not claiming one.
    const footholdGate = operationSpec(2).gates.find((g) => g.id === 'foothold1')!;
    expect(gateSatisfied(world, footholdGate)).toBe(false);
    playFor(world, 60);
    expect(world.operation, 'an unmet gate holds the operation, whatever the clock says').toBe(2);
    expect(world.operationTime).toBeGreaterThan(55);

    const first = satellitesFor(2)[0];
    bankUntil(world, first.costFood + 30, first.costWater + 20, 220);
    claimNest(world, first.id);

    expect(gateSatisfied(world, footholdGate), 'claiming a crack closes its gate').toBe(true);
    expect(world.stats.operationsCompleted).toBeGreaterThanOrEqual(1);

    // One gate closed and one still open is the interesting case: the operation must *not* move, and
    // the objective must be talking about the gate that is actually holding it up.
    const routineGate = operationSpec(2).gates.find((g) => g.id === 'routines')!;
    expect(gateSatisfied(world, routineGate)).toBe(false);
    for (const sat of satellitesFor(2).slice(1)) {
      if (world.status !== 'playing') break;
      bankUntil(world, sat.costFood + 40, sat.costWater + 26, 200);
      claimNest(world, sat.id);
      bankUntil(world, sat.fitFood + 40, sat.fitWater + 26, 200);
      fitOut(world, sat.id, world.colony.caches === 0 ? 'cache' : 'nursery');
      playFor(world, 25);
    }

    if (!gateSatisfied(world, routineGate)) {
      expect(world.operation, 'one open gate is enough to hold the operation').toBe(2);
      expect(currentGate(world)?.id).toBe(routineGate.id);
      expect(resolveHud(world).checklist.find((c) => c.label === routineGate.label)?.done).toBe(
        false,
      );
    } else {
      expect(world.operation).toBeGreaterThanOrEqual(3);
      expect(world.stats.operationsCompleted).toBeGreaterThanOrEqual(2);
    }
    expect(world.stats.functionsBuilt).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('completing the third operation is what summons the extermination', () => {
    // Operation 3's gates are three adaptations, two fitted footholds and 26 roaches. All three are
    // bought below through the real interfaces; the run is placed at operation 3 rather than played
    // to it, the same way the old suite placed a run at the last second of night 3.
    const world = createWorld(1004);
    world.operation = 3;

    for (const sat of satellitesFor(3).slice(0, 3)) {
      world.colony.food = 400;
      world.colony.water = 400;
      walkTo(world, pt(sat), COVERED);
      world.input.interactPressed = true;
      stepWorld(world, SIM_DT);
      world.colony.food = 400;
      world.colony.water = 400;
      world.input.interactPressed = true;
      stepWorld(world, SIM_DT);
      if (world.pendingFit === sat.id)
        chooseFunction(world, world.colony.nurseries === 0 ? 'nursery' : 'bolthole');
    }
    expect(world.stats.functionsBuilt).toBeGreaterThanOrEqual(2);

    // Grow into the milestones and take the choices they open.
    for (
      let k = 0;
      k < 60 && world.adaptations.taken.length < 3 && world.status === 'playing';
      k++
    ) {
      world.colony.food = 400;
      world.colony.water = 400;
      idle(world, 10);
      takeAdaptation(world);
    }
    expect(world.adaptations.taken.length).toBe(3);

    world.colony.food = 400;
    world.colony.water = 400;
    stepUntil(world, (w) => w.operation >= 4, 200);

    expect(world.operation, 'the last gate closed, so the operation advanced').toBe(4);
    // Arriving at the final operation must NOT summon the response. The colony has to take the
    // kitchen first — otherwise the player is handed a 62-second extermination while still needing
    // to establish three regions from scratch, which is a combination with no counterplay.
    expect(world.finalResponse, 'arriving alone does not summon the response').toBe(false);
    expect(world.status).toBe('playing');

    // Holding the third region is what brings the can out.
    // The region the home crack sits in does not count toward taking the kitchen, so grant the
    // hold on regions away from home — exactly what `heldZones` counts.
    const homeZone = zoneAt(world.nests.find((n) => n.home)!.x, world.nests.find((n) => n.home)!.y);
    let granted = 0;
    for (const z of world.zones) {
      if (granted >= ZONES_TO_WIN) break;
      if (z.id === homeZone?.id) continue;
      z.hold = 0.95;
      z.held = true;
      granted++;
    }
    stepWorld(world, SIM_DT);
    expect(world.finalResponse, 'taking the kitchen summons the response').toBe(true);
    expect(world.events.some((e) => e.t === 'finalResponse')).toBe(true);
  }, 60_000);

  it('every operation card names its brief and its checklist', () => {
    const world = createWorld(1003);
    for (const spec of OPERATIONS) {
      world.operation = spec.index;
      const lines = operationCardLines(world);
      expect(lines[0].length).toBeGreaterThan(20);
      expect(lines.length).toBe(spec.gates.length + 1);
      expect(resolveHud(world).checklist.map((c) => c.label)).toEqual(
        spec.gates.map((g) => g.label),
      );
    }
  });
});

describe('the objective always says something useful', () => {
  it('names an action on every frame of a played run', () => {
    const world = createWorld(1010);
    layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')));
    layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y });

    const sources = new Set<string>();
    for (let i = 0; i < 300 / SIM_DT; i++) {
      stepWorld(world, SIM_DT);
      if (i % 30 !== 0) continue;
      const hud = resolveHud(world);
      expect(hud.objective.trim().length, `empty objective at t=${world.time}`).toBeGreaterThan(8);
      expect(hud.operation).toContain(t('term.operation'));
      expect(hud.forecast.trim().length).toBeGreaterThan(0);
      expect(hud.source).not.toBe('');
      sources.add(hud.source.split(':')[0]);
    }
    // The hierarchy is not decoration: more than one rule actually fires over a real run.
    expect(sources.size).toBeGreaterThan(1);
  });

  it('a capped reserve always names a spend, a cap-raiser or the real bottleneck', () => {
    const world = createWorld(1011);
    layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')));
    layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y });

    let cappedFrames = 0;
    for (let pass = 0; pass < 45 && world.status === 'playing'; pass++) {
      // Played, not idled: sources run dry and cleaning passes wipe trails, so a colony that stood
      // still would never fill its larder in the first place.
      playFor(world, 20);
      const c = world.colony;
      const atCap = c.food >= c.foodCap - 2 || c.water >= c.waterCap - 2;
      if (!atCap) continue;
      cappedFrames++;

      const advice = cappedAdvice(world);
      expect(advice, `no advice at cap, t=${Math.round(world.time)}`).not.toBeNull();
      expect(advice!.text.length).toBeGreaterThan(20);
      expect(advice!.source.startsWith('capped:')).toBe(true);

      // The hud must either be saying it, or saying something that outranks it — a free adaptation,
      // a closing household window, a shortage, a live threat, or the extermination itself. It may
      // never be silent. `final` belongs on this list on purpose: while the can is out, surviving
      // genuinely outranks spending the larder.
      const source = resolveHud(world).source;
      const outranks =
        source.startsWith('capped:') ||
        source.startsWith('adaptation:') ||
        source.startsWith('routine:') ||
        source.endsWith(':saving') ||
        source === 'shortage' ||
        source === 'threat' ||
        source === 'final';
      expect(outranks, `hud said '${source}' while a reserve was full`).toBe(true);
    }
    expect(cappedFrames, 'the run never reached a cap, so nothing was tested').toBeGreaterThan(0);
  }, 30_000);

  it('names the real reason when a gate is blocked', () => {
    const world = createWorld(1012);
    // Both supply lines running, so the blocked gate is the population one and not a missing trail.
    layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')));
    layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y });
    // Reserves are set directly so the test is about the blocker text, not about how long hauling
    // takes to reach the ceiling.
    world.colony.food = 300;
    world.colony.water = 300;
    stepUntil(world, (w) => w.colony.population >= w.colony.capacity, 200);
    world.colony.food = 300;
    world.colony.water = 300;
    idle(world, 2);

    // The population gate is the one that is genuinely stuck, and it has to say why.
    const popGate = operationSpec(1).gates.find((g) => g.id.startsWith('pop'))!;
    expect(world.colony.population).toBe(world.colony.capacity);
    const blocker = popGate.blocker(world);
    expect(blocker, 'a colony at its ceiling must be told so').not.toBeNull();
    expect(blocker!).toContain(t('term.capacityFull'));
    expect(blocker!).toContain(String(world.colony.capacity));
    // ...and it has to name what would raise it, not merely restate the number.
    expect(blocker!).toMatch(new RegExp(`${t('term.foothold')}|${t('term.adaptation')}`));
  });

  it('names the cost when a foothold is unaffordable', () => {
    const world = createWorld(1013);
    world.operation = 2;
    const sat = satellitesFor(2)[0];
    world.colony.food = 1;
    world.colony.water = 1;
    idle(world, 1);

    const gate = operationSpec(2).gates.find((g) => g.id === 'foothold1')!;
    const blocker = gate.blocker(world);
    expect(blocker).not.toBeNull();
    expect(blocker!).toContain(sat.label);
    expect(blocker!).toMatch(new RegExp(`(${t('unit.foodNoun')}|${t('unit.waterNoun')})\\s*\\d+`));
  });

  it('a claim the colony cannot pay for is refused with a reason', () => {
    const world = createWorld(1014);
    world.operation = 2;
    const sat = satellitesFor(2)[0];
    world.colony.food = 1;
    world.colony.water = 1;
    walkTo(world, pt(sat), COVERED);
    doInteract(world);

    expect(world.nests.find((n) => n.id === sat.id)!.claimed).toBe(false);
    expect(world.hint).toContain(t('term.cost'));
    expect(world.hint).toContain(String(sat.costFood));
  });
});

describe('adaptations', () => {
  it('offers three families, one tier at a time, and never more choices than milestones', () => {
    expect(ADAPTATIONS.length).toBe(9);
    for (const family of ['brood', 'forage', 'shadow'] as const) {
      const tiers = ADAPTATIONS.filter((a) => a.family === family).map((a) => a.tier);
      expect(tiers.sort()).toEqual([1, 2, 3]);
    }
    // A run affords roughly four of nine — which is the entire point of the system.
    expect(MILESTONE_POPULATION.length).toBeLessThan(ADAPTATIONS.length);
  });

  it('opens a choice at the population milestone, spends the cost, and closes the milestone', () => {
    const world = createWorld(1020);
    playToFirstFoothold(world, SAVING);
    // Reserves set directly so the test measures the adaptation, not the haul that paid for it.
    world.colony.food = 300;
    world.colony.water = 300;
    stepUntil(world, (w) => w.adaptations.offer.length > 0, 200);

    const offer = [...world.adaptations.offer];
    expect(offer.length, 'a milestone offers one adaptation per family').toBe(3);
    expect(new Set(offer.map((id) => specById(id)!.family)).size).toBe(3);
    expect(world.colony.population).toBeGreaterThanOrEqual(MILESTONE_POPULATION[0]);

    const chosen = specById(offer[0])!;
    world.colony.food = 300;
    world.colony.water = 300;
    expect(chooseAdaptation(world, chosen.id)).toBe('ok');
    expect(world.colony.food).toBeCloseTo(300 - chosen.costFood, 5);
    expect(world.colony.water).toBeCloseTo(300 - chosen.costWater, 5);
    expect(world.adaptations.taken).toEqual([chosen.id]);
    expect(world.adaptations.milestonesUsed).toBe(1);
    expect(world.adaptations.offer).toEqual([]);

    // Taking one closes the milestone: the other two are gone, not banked.
    expect(chooseAdaptation(world, offer[1])).toBe('notOffered');
    expect(chooseAdaptation(world, offer[2])).toBe('notOffered');
    expect(world.adaptations.taken.length).toBe(1);
  }, 30_000);

  it('refuses an adaptation the colony cannot pay for, without consuming the offer', () => {
    const world = createWorld(1021);
    playToFirstFoothold(world, SAVING);
    world.colony.food = 300;
    world.colony.water = 300;
    stepUntil(world, (w) => w.adaptations.offer.length > 0, 200);
    const id = world.adaptations.offer[0];

    world.colony.food = 0;
    world.colony.water = 0;
    expect(chooseAdaptation(world, id)).toBe('tooPoor');
    expect(world.adaptations.offer).toContain(id);
    expect(world.adaptations.taken).toEqual([]);
  }, 30_000);

  it('changes simulation traits, not just a displayed number', () => {
    const world = createWorld(1022);
    playToFirstFoothold(world, SAVING);
    world.colony.food = 400;
    world.colony.water = 400;
    stepUntil(world, (w) => w.adaptations.offer.length > 0, 200);

    const brood = world.adaptations.offer.find((id) => id.startsWith('brood'));
    expect(brood, 'the brood family is always on offer at the first milestone').toBeDefined();
    const capacityBefore = world.colony.capacity;
    expect(world.traits.capacityBonus).toBe(0);
    expect(world.traits.upkeepMult).toBe(1);

    expect(chooseAdaptation(world, brood!)).toBe('ok');
    expect(world.traits.capacityBonus).toBeGreaterThan(0);
    expect(world.traits.upkeepMult, 'every benefit carries a readable cost').toBeGreaterThan(1);

    recomputeLimits(world);
    expect(world.colony.capacity).toBe(capacityBefore + world.traits.capacityBonus);
  }, 30_000);

  it('a run cannot buy the whole tree', () => {
    const world = createWorld(1023);
    // Even with an infinite larder the milestone count is the limit, not the money.
    world.adaptations.milestonesUsed = MILESTONE_POPULATION.length;
    world.colony.population = 90;
    world.colony.food = 9999;
    world.colony.water = 9999;
    idle(world, 5);
    expect(world.adaptations.offer).toEqual([]);
    expect(world.adaptations.taken.length).toBeLessThanOrEqual(MILESTONE_POPULATION.length);
  });
});

describe('capacity is a function of what the player built', () => {
  /**
   * Claims and fits a crack with the reserves already in hand.
   *
   * The subject here is the arithmetic — what a foothold is worth — not how long the haul that paid
   * for it takes, so the reserves are set the way the existing hatch tests set them.
   */
  function buy(world: World, id: string, fn: FootholdFunction): void {
    world.colony.food = 400;
    world.colony.water = 400;
    walkTo(world, pt(nestSpec(id)), COVERED);
    world.input.interactPressed = true;
    stepWorld(world, SIM_DT);
    expect(world.nests.find((n) => n.id === id)!.claimed, `claim ${id}`).toBe(true);

    world.colony.food = 400;
    world.colony.water = 400;
    world.input.interactPressed = true;
    stepWorld(world, SIM_DT);
    expect(world.pendingFit, `fit prompt for ${id}`).toBe(id);
    expect(chooseFunction(world, fn)).toBe('ok');
  }

  it('claiming raises it, fitting a nursery raises it further, and a cache raises storage', () => {
    const world = createWorld(1030);
    expect(world.colony.capacity).toBe(BASE_CAPACITY);
    const baseFoodCap = world.colony.foodCap;
    const baseWaterCap = world.colony.waterCap;
    world.operation = 2;

    const [first, second] = satellitesFor(2);
    buy(world, first.id, 'nursery');
    expect(world.colony.nurseries).toBe(1);
    expect(world.colony.capacity).toBe(BASE_CAPACITY + CAPACITY_PER_NEST + NURSERY_CAPACITY);
    expect(world.colony.foodCap, 'a nursery is bodies, not storage').toBe(baseFoodCap);

    buy(world, second.id, 'cache');
    expect(world.colony.caches).toBe(1);
    expect(world.colony.foodCap).toBe(baseFoodCap + CACHE_FOOD_BONUS);
    expect(world.colony.waterCap).toBe(baseWaterCap + CACHE_WATER_BONUS);
    expect(world.colony.capacity).toBe(BASE_CAPACITY + CAPACITY_PER_NEST * 2 + NURSERY_CAPACITY);
    expect(world.stats.functionsBuilt).toBe(2);
  }, 30_000);

  it('a bolt-hole is a third, different answer to the same ground', () => {
    const world = createWorld(1032);
    world.operation = 2;
    const id = satellitesFor(2)[0].id;
    buy(world, id, 'bolthole');
    expect(world.colony.boltholes).toBe(1);
    expect(world.colony.capacity).toBe(BASE_CAPACITY + CAPACITY_PER_NEST + BOLTHOLE_CAPACITY);
  }, 20_000);

  it('a fit-out is a second, separate decision from the claim', () => {
    const world = createWorld(1031);
    const id = playToFirstFoothold(world);
    const nest = world.nests.find((n) => n.id === id)!;
    expect(nest.claimed).toBe(true);
    expect(nest.fn, 'claiming buys the ground, not the capability').toBeNull();

    world.colony.food = 300;
    world.colony.water = 300;
    walkTo(world, pt(nest), COVERED);
    world.input.interactPressed = true;
    stepWorld(world, SIM_DT);
    expect(world.pendingFit, 'the fit-out opens a choice rather than resolving itself').toBe(id);
    expect(chooseFunction(world, 'bolthole')).toBe('ok');
    expect(nest.fn).toBe('bolthole');
    expect(world.pendingFit).toBeNull();
  }, 30_000);
});

describe('recovery', () => {
  it('a colony that loses bodies breeds back up while the reserves hold', () => {
    const world = createWorld(1040);
    world.colony.food = 400;
    world.colony.water = 400;
    stepUntil(world, (w) => w.colony.population >= w.colony.capacity, 200);
    const full = world.colony.population;
    expect(full).toBeGreaterThan(4);

    // A footfall's worth of casualties, applied the way the household applies them.
    let killed = 0;
    for (const w of world.workers) {
      if (killed >= Math.floor(full / 2)) break;
      if (!w.alive) continue;
      killWorker(world, w, 'foot');
      killed++;
    }
    idle(world, 1);
    const after = world.colony.population;
    expect(after).toBeLessThan(full);
    expect(world.colony.lost).toBe(killed);

    world.colony.food = 400;
    world.colony.water = 400;
    idle(world, 180);
    expect(world.colony.population, 'the colony must be able to come back').toBeGreaterThan(after);
    expect(world.stats.workersLost).toBe(killed);
  }, 30_000);
});

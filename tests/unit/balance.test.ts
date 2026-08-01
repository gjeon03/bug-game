import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/clock.ts';
import { LABOUR_SHARE_CAP, MAX_ROUTES, TIER_THRESHOLDS } from '../../src/sim/constants.ts';
import { operationSpec } from '../../src/sim/operations.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { heldZones, zoneName } from '../../src/sim/territory.ts';
import { createWorld, type World } from '../../src/sim/world.ts';
import { firstResource, HOME, path, pt, satellitesFor, spreadPoints } from '../map.ts';
import { driveTo, idle, stepUntil } from './helpers.ts';
import { bankUntil, claimNest, fitOut, layLine, playFor, type PlayerOptions } from './play.ts';

/**
 * Balance regressions.
 *
 * Every test here exists because an independent critic measured the shipped numbers and found the
 * game unwinnable, or found route geometry to be mechanically inert. These lock in the corrections.
 *
 * Nothing below contains a map coordinate: the two route archetypes are *asked for* — the safe way
 * round and the way that gets you seen — and `tests/map.ts` works out where those are.
 */

const FOOD = firstResource('food');
const WATER = firstResource('water');
const COVERED: PlayerOptions = { style: 'covered' };
const RECKLESS: PlayerOptions = { style: 'open', detour: true };

function coveredLine(world: World, to = pt(FOOD)): void {
  layLine(world, { x: HOME.x + 30, y: HOME.y }, to, COVERED);
}

function recklessLine(world: World, to = pt(FOOD)): void {
  layLine(world, { x: HOME.x + 30, y: HOME.y }, to, RECKLESS);
}

describe('route geometry has mechanical consequence', () => {
  /** Runs one supply line of the given shape and reports what the household noticed. */
  function run(shape: 'covered' | 'reckless'): {
    peak: number;
    exposedTrail: number;
    droppings: number;
  } {
    const world = createWorld(31415);
    const lay = shape === 'covered' ? coveredLine : recklessLine;
    lay(world);

    // Hold moisture steady so the only variable is the shape of this one line, and re-lay *the same*
    // line if a cleaning pass wipes it — which is what a player does, and what stops the comparison
    // from turning into "whose trail happened to survive one household event".
    let maxExposed = 0;
    const until = world.time + 140;
    while (world.time < until && world.status === 'playing') {
      world.colony.water = 400;
      world.colony.waterCap = 400;
      if (!world.routes.some((r) => r.linked)) lay(world);
      idle(world, 5);
      maxExposed = Math.max(maxExposed, world.exposedTrail);
    }
    return {
      peak: world.suspicion.peak,
      exposedTrail: maxExposed,
      droppings: world.suspicion.causes.droppings,
    };
  }

  it('a supply line through the light is measurably more incriminating than one along the units', () => {
    const covered = run('covered');
    const reckless = run('reckless');

    // Ratios, not calibrated peaks. The literal `open.peak > 18 / covered.peak < 5` in the old test
    // was a measurement of one particular kitchen and would be wrong the day the map moved; what has
    // to survive is that the difference is large, and it is the whole thesis of the game.
    expect(
      reckless.exposedTrail,
      `exposed trail: reckless ${reckless.exposedTrail.toFixed(2)} vs covered ${covered.exposedTrail.toFixed(2)}`,
    ).toBeGreaterThan(covered.exposedTrail * 4);
    expect(
      reckless.droppings,
      `trail evidence: reckless ${reckless.droppings.toFixed(1)} vs covered ${covered.droppings.toFixed(1)}`,
    ).toBeGreaterThan(covered.droppings * 4);
    expect(
      reckless.peak,
      `suspicion peak: reckless ${reckless.peak.toFixed(1)} vs covered ${covered.peak.toFixed(1)}`,
    ).toBeGreaterThan(covered.peak * 1.4);
  }, 30_000);

  it('exposed traffic alone can carry suspicion past a response tier', () => {
    const world = createWorld(2718);
    recklessLine(world);
    world.colony.water = 400;
    world.colony.waterCap = 400;
    for (let k = 0; k < 15 && world.status === 'playing'; k++) playFor(world, 10, RECKLESS);

    // The threshold, not a copy of it: the household has to react to logistics, not only to the
    // scout standing in a light.
    expect(world.suspicion.value).toBeGreaterThan(TIER_THRESHOLDS[0]);
    expect(world.suspicion.causes.droppings + world.suspicion.causes.traffic).toBeGreaterThan(
      TIER_THRESHOLDS[0] * 0.7,
    );
  }, 30_000);

  it('the HUD can name a continuous cause, not only one-shots', () => {
    const world = createWorld(1618);
    recklessLine(world);
    for (let k = 0; k < 9 && world.status === 'playing'; k++) playFor(world, 10, RECKLESS);
    expect(['droppings', 'traffic']).toContain(world.suspicion.lastCause);
  }, 30_000);
});

describe('resource economy', () => {
  it('a source backs an operation of traffic instead of being stripped in a minute', () => {
    const world = createWorld(9001);
    coveredLine(world);
    const node = world.resources.find((r) => r.id === FOOD.id)!;
    // The soft time of operation 1 is the design's own statement of how long that stretch of the run
    // should take, so it is the right yardstick for "one source lasts a while".
    idle(world, operationSpec(1).softTime * 0.75);
    expect(node.depleted).toBe(false);
    expect(node.amount).toBeGreaterThan(0);
  }, 30_000);

  it('a route whose source runs dry stays visible instead of silently vanishing', () => {
    const world = createWorld(9003);
    const node = world.resources.find((r) => r.id === FOOD.id)!;
    // A nearly-empty pile, so the run-dry happens inside the test rather than ten minutes later.
    node.amount = 4;
    coveredLine(world);
    idle(world, 30);
    expect(node.depleted).toBe(true);
    expect(world.routes.length).toBe(1);
    expect(world.routes[0].resourceId).toBe(FOOD.id);
    expect(world.routes[0].dry, 'the player has to be able to see why nothing is arriving').toBe(
      true,
    );
  }, 30_000);
});

describe('a competently played run makes real progress', () => {
  it('supplies itself, claims and fits out footholds, and specialises', () => {
    const world = createWorld(20260801);
    coveredLine(world);
    layLine(world, pt(WATER), { x: HOME.x + 30, y: HOME.y }, COVERED);

    for (let k = 0; k < 40 && world.operation < 2 && world.status === 'playing'; k++) {
      playFor(world, 20);
    }
    expect(world.operation, 'operation 1 is completable by playing it').toBeGreaterThanOrEqual(2);
    expect(world.stats.deliveries).toBeGreaterThan(10);

    for (const sat of satellitesFor(2)) {
      if (world.status !== 'playing') break;
      bankUntil(world, sat.costFood + 40, sat.costWater + 26, 200);
      claimNest(world, sat.id);
      bankUntil(world, sat.fitFood + 40, sat.fitWater + 26, 200);
      fitOut(world, sat.id, world.colony.caches === 0 ? 'cache' : 'nursery');
      playFor(world, 25);
    }
    // Play on so the colony has to live with what it built.
    for (let k = 0; k < 12 && world.status === 'playing' && world.operation < 3; k++) {
      playFor(world, 30);
    }

    const summary = {
      operation: world.operation,
      status: world.status,
      population: world.colony.population,
      claimed: world.nests.filter((n) => n.claimed).length,
      functions: world.stats.functionsBuilt,
      adaptations: world.adaptations.taken.length,
      routines: world.stats.routinesExploited,
      peakPopulation: world.stats.peakPopulation,
      zones: heldZones(world).map((z) => zoneName(z.id)),
    };
    const note = JSON.stringify(summary);

    expect(summary.operation, note).toBeGreaterThanOrEqual(2);
    // If the run did end, it ended for a reason the debrief can name.
    if (summary.status === 'lost') {
      expect(['collapse', 'nestDestroyed', 'exterminated'], note).toContain(world.loseCause);
    }
    expect(summary.claimed, note).toBeGreaterThan(2);
    expect(summary.functions, note).toBeGreaterThanOrEqual(1);
    // Peak, not the final count: a colony that spent four adaptations and four footholds on itself
    // is deliberately living close to what its supply lines can feed.
    expect(summary.peakPopulation, note).toBeGreaterThan(12);
    // Caps rise only by building, so a colony that built things has a bigger larder and a bigger
    // nest than a colony that did not.
    const cold = createWorld(1);
    expect(world.colony.foodCap, note).toBeGreaterThan(cold.colony.foodCap);
    expect(world.colony.capacity, note).toBeGreaterThan(cold.colony.capacity);
  }, 90_000);
});

describe('the colony responds to the player, not just to the map', () => {
  it('labour shifts onto whichever reserve is running out', () => {
    const world = createWorld(7311);
    coveredLine(world);
    layLine(world, pt(WATER), { x: HOME.x + 30, y: HOME.y }, COVERED);
    expect(world.routes.filter((r) => r.linked).length).toBe(2);

    const foodRoute = world.routes.find((r) => r.resourceId === FOOD.id)!;
    const waterRoute = world.routes.find((r) => r.resourceId === WATER.id)!;

    // A shortage only counts once the colony is big enough for it to bite, so let it grow first —
    // the opening minute of every run must not open with a false emergency.
    world.colony.food = 200;
    world.colony.water = 200;
    stepUntil(world, (w) => w.colony.population > 8 && w.time > 30, 120);

    // Starve the colony of moisture while food is plentiful, then let it re-plan.
    world.colony.food = world.colony.foodCap * 0.95;
    world.colony.water = world.colony.waterCap * 0.05;

    let warned = false;
    let waterShare = 0;
    let foodShare = 0;
    for (let t = 0; t < 40 / SIM_DT; t++) {
      stepWorld(world, SIM_DT);
      if (world.shortage === 'water') warned = true;
      waterShare += world.workers.filter((w) => w.alive && w.routeId === waterRoute.id).length;
      foodShare += world.workers.filter((w) => w.alive && w.routeId === foodRoute.id).length;
    }

    // The HUD warned...
    expect(warned, 'the shortage must be signalled').toBe(true);
    // ...and the colony itself redeployed, which is what makes the warning actionable.
    expect(
      waterShare,
      `expected labour to favour the failing reserve: water=${waterShare} food=${foodShare}`,
    ).toBeGreaterThan(foodShare);
  }, 30_000);

  it('an unrecoverable shortage still leaves labour on the other line', () => {
    const world = createWorld(7311);
    coveredLine(world);
    layLine(world, pt(WATER), { x: HOME.x + 30, y: HOME.y }, COVERED);
    const waterRoute = world.routes.find((r) => r.resourceId === WATER.id)!;
    const foodRoute = world.routes.find((r) => r.resourceId === FOOD.id)!;

    // A reserve the colony cannot actually refill — the deliveries never move the needle. A player
    // may rationally decide to run thin on one reserve rather than march bodies through a light, and
    // without the cap the colony overrules that decision and there is no way to express it.
    world.colony.food = world.colony.foodCap * 0.95;
    let worstShare = 0;
    for (let t = 0; t < 120 / SIM_DT; t++) {
      world.colony.water = world.colony.waterCap * 0.05;
      stepWorld(world, SIM_DT);
      const onWater = world.workers.filter((w) => w.alive && w.routeId === waterRoute.id).length;
      const onFood = world.workers.filter((w) => w.alive && w.routeId === foodRoute.id).length;
      if (onWater + onFood >= 4) worstShare = Math.max(worstShare, onWater / (onWater + onFood));
    }

    expect(
      worstShare,
      `a failing reserve took ${(worstShare * 100).toFixed(0)}% of all labour`,
    ).toBeLessThanOrEqual(LABOUR_SHARE_CAP + 0.1);
  }, 30_000);

  it('prefers the safer of two lines to the same source', () => {
    const world = createWorld(7311);
    // Same endpoints, and a bounded detour rather than a trip across the kitchen, so distance is
    // held roughly constant and the risk of the geometry is the only thing that differs.
    coveredLine(world);
    layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(FOOD), { style: 'open', litDetour: true });

    const linked = world.routes.filter((r) => r.linked);
    expect(linked.length).toBe(2);
    const safe = linked.reduce((a, b) => (a.exposure <= b.exposure ? a : b));
    const risky = linked.reduce((a, b) => (a.exposure > b.exposure ? a : b));
    expect(risky.exposure, 'the two lines must actually differ in exposure').toBeGreaterThan(
      safe.exposure * 1.2,
    );

    let onSafe = 0;
    let onRisky = 0;
    for (let t = 0; t < 60 / SIM_DT; t++) {
      stepWorld(world, SIM_DT);
      onSafe += world.workers.filter((w) => w.alive && w.routeId === safe.id).length;
      onRisky += world.workers.filter((w) => w.alive && w.routeId === risky.id).length;
    }

    // Route geometry is the game's central currency; it should steer the colony's own labour, not
    // only the evidence the household finds.
    expect(
      onSafe,
      `exposure ${safe.exposure.toFixed(2)} drew ${onSafe} vs ${risky.exposure.toFixed(2)} drawing ${onRisky}`,
    ).toBeGreaterThan(onRisky);
  }, 30_000);

  it('workers hatched at a satellite still serve routes anchored elsewhere', () => {
    const world = createWorld(6161);
    // The mid-game shape: a fitted-out satellite hatches brood on one side of the kitchen while the
    // colony's supply line is anchored at the home crack on the other.
    world.operation = 2;
    const sat = satellitesFor(2)[0];
    world.colony.food = 400;
    world.colony.water = 400;
    for (const p of path({ x: world.scout.x, y: world.scout.y }, pt(sat))) {
      driveTo(world, p.x, p.y, { timeout: 30, arrive: 44 });
    }
    world.input.interactPressed = true;
    stepWorld(world, SIM_DT);
    world.input.interactPressed = true;
    stepWorld(world, SIM_DT);
    const island = world.nests.find((n) => n.id === sat.id)!;
    expect(island.claimed).toBe(true);

    coveredLine(world);
    expect(world.routes.some((r) => r.linked)).toBe(true);

    // Park the entire workforce at the satellite, out of range of the home route.
    for (const w of world.workers) {
      if (!w.alive) continue;
      w.x = island.x + world.rng.signed() * 30;
      w.y = island.y + world.rng.signed() * 30;
      w.state = 'idle';
      w.routeId = -1;
      w.targetNest = island.id;
    }
    const deliveriesBefore = world.stats.deliveries;

    idle(world, 90);

    // Without redistribution the labour force stays stranded and nothing is ever hauled.
    expect(world.stats.deliveries).toBeGreaterThan(deliveriesBefore);
    expect(world.workers.filter((w) => w.alive && w.targetNest === HOME.id).length).toBeGreaterThan(
      0,
    );
  }, 60_000);
});

describe('trail affordances', () => {
  it('re-laying from where a trail ends extends it instead of burning a route slot', () => {
    const world = createWorld(7312);
    const legs = path({ x: HOME.x + 30, y: HOME.y }, pt(FOOD));
    driveTo(world, HOME.x + 30, HOME.y, { timeout: 20 });
    driveTo(world, legs[0].x, legs[0].y, { lay: true, timeout: 25, arrive: 40 });
    world.input.lay = false;
    expect(world.routes.length).toBe(1);
    const id = world.routes[0].id;
    const before = world.routes[0].nodes.length;

    // Release, then start laying again from the same spot — the natural "touch up my trail" action.
    idle(world, 1);
    for (const p of legs.slice(1)) driveTo(world, p.x, p.y, { lay: true, timeout: 25, arrive: 40 });
    world.input.lay = false;
    idle(world, 0.2);

    expect(world.routes.length, 'a touch-up must not allocate a second route').toBe(1);
    expect(world.routes[0].id).toBe(id);
    expect(world.routes[0].nodes.length).toBeGreaterThan(before);
    expect(world.routes[0].linked).toBe(true);
  }, 30_000);

  it('evicting the oldest trail is announced rather than silent', () => {
    const world = createWorld(7313);
    // One more separate trail than the game will hold, on generated walkable ground.
    const spots = spreadPoints(MAX_ROUTES + 1);
    expect(spots.length).toBe(MAX_ROUTES + 1);
    for (const spot of spots) {
      for (const p of path({ x: world.scout.x, y: world.scout.y }, spot)) {
        driveTo(world, p.x, p.y, { timeout: 25, arrive: 44 });
      }
      const d = Math.max(1, Math.hypot(HOME.x - spot.x, HOME.y - spot.y));
      driveTo(
        world,
        spot.x + ((HOME.x - spot.x) / d) * 150,
        spot.y + ((HOME.y - spot.y) / d) * 150,
        {
          lay: true,
          timeout: 20,
          arrive: 44,
        },
      );
      world.input.lay = false;
      idle(world, 0.3);
    }
    expect(world.routes.length).toBeLessThanOrEqual(MAX_ROUTES);
    expect(world.hint, 'the player must be told a trail was dissolved').toContain('dissolved');
    expect(world.events.some((e) => e.t === 'routeLost')).toBe(true);
  }, 30_000);

  it('three supply lines fanning out of the same crack stay three routes', () => {
    const world = createWorld(4242);
    const home = world.nests.find((n) => n.home)!;

    // Three genuinely different directions out of one door. Every route anchored on a nest must
    // start inside LINK_RADIUS to link at all, so their start points are unavoidably clustered —
    // in practice within one node spacing of each other. Heading is the only thing that separates
    // them, which is why proximity alone cannot be the rule.
    const targets = [
      { x: home.x + 420, y: home.y - 60 },
      { x: home.x + 120, y: home.y - 430 },
      { x: home.x + 130, y: home.y + 400 },
    ];
    const starts: { x: number; y: number }[] = [];
    for (const t of targets) {
      driveTo(world, home.x, home.y, { timeout: 25 });
      starts.push({ x: world.scout.x, y: world.scout.y });
      driveTo(world, t.x, t.y, { lay: true, timeout: 30 });
      world.input.lay = false;
      idle(world, 0.4);
    }

    let spread = 0;
    for (let i = 0; i < starts.length; i++)
      for (let j = i + 1; j < starts.length; j++)
        spread = Math.max(spread, Math.hypot(starts[i].x - starts[j].x, starts[i].y - starts[j].y));

    expect(
      world.routes.length,
      `three lines out of one crack (start points within ${spread.toFixed(0)}u) must stay separate`,
    ).toBe(3);
  }, 30_000);

  it('resuming the same line where it ended extends it instead of allocating a new one', () => {
    const world = createWorld(4242);
    const home = world.nests.find((n) => n.home)!;
    driveTo(world, home.x, home.y, { timeout: 25 });
    driveTo(world, home.x + 260, home.y, { lay: true, timeout: 30 });
    const after = world.routes.length;
    const tail = world.routes[world.routes.length - 1].nodes.length;

    // Let go of the key mid-line, then carry on in the same direction — one supply line, one route.
    idle(world, 0.6);
    driveTo(world, home.x + 520, home.y, { lay: true, timeout: 30 });

    expect(world.routes.length, 'continuing the line must not allocate a second route').toBe(after);
    expect(world.routes[world.routes.length - 1].nodes.length).toBeGreaterThan(tail);
  }, 30_000);

  it('a right-angle turn out of a trail end starts a new line', () => {
    const world = createWorld(4242);
    const home = world.nests.find((n) => n.home)!;
    driveTo(world, home.x, home.y, { timeout: 25 });
    driveTo(world, home.x + 70, home.y, { lay: true, timeout: 20 });
    world.input.lay = false;
    expect(world.routes.length).toBe(1);

    // Walk back onto that stub's end and head off at a right angle. This is a different supply
    // line, not a continuation, and it merged into the stub before the heading gate existed.
    idle(world, 0.5);
    driveTo(world, home.x + 40, home.y, { timeout: 20 });
    driveTo(world, home.x + 60, home.y - 400, { lay: true, timeout: 30 });

    expect(world.routes.length, 'a right-angle turn is a new line, not an extension').toBe(2);
  }, 30_000);
});

describe('the debrief cannot contradict itself', () => {
  it('the end card is built from numbers frozen at the moment the run was decided', () => {
    const world = createWorld(4242);
    // Bank plenty of food, then take the colony away: the collapse the old end card used to describe
    // with a red cross beside a number that met its own target.
    world.colony.food = world.colony.foodCap;
    for (const w of world.workers) w.alive = false;
    world.colony.population = 0;
    world.scout.alive = false;
    const bankedFood = Math.floor(world.colony.food);
    const deliveries = world.stats.deliveries;

    idle(world, 2);

    expect(world.status).toBe('lost');
    expect(world.loseCause).toBe('collapse');
    const tally = world.finalTally;
    expect(tally, 'the numbers behind the verdict must be frozen with it').not.toBeNull();

    // Every field of the card has to agree with the world it was taken from.
    expect(tally!.population).toBe(0);
    expect(tally!.food).toBe(bankedFood);
    expect(tally!.deliveries).toBe(deliveries);
    expect(tally!.operations).toBe(world.operation);
    expect(tally!.adaptations).toBe(world.adaptations.taken.length);
    expect(tally!.zones).toEqual(heldZones(world).map((z) => zoneName(z.id)));
    expect(tally!.runSeconds).toBeGreaterThan(0);
    expect(tally!.runSeconds).toBeLessThanOrEqual(world.time);
    expect(tally!.peakSuspicion).toBe(Math.round(world.suspicion.peak));

    // And it must not drift afterwards: the card is a snapshot, not a live read.
    idle(world, 5);
    expect(world.finalTally!.runSeconds).toBe(tally!.runSeconds);
  }, 30_000);
});

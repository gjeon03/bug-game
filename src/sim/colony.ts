import { dist2 } from '../core/math.ts';
import {
  BASE_CAPACITY,
  BOLTHOLE_CAPACITY,
  NURSERY_CAPACITY,
  BROOD_RESERVE_MARGIN_FOOD,
  BROOD_RESERVE_MARGIN_WATER,
  BROOD_CHAMBER_MULT,
  BROOD_FOOD_COST,
  BROOD_RATE,
  BROOD_WATER_COST,
  CACHE_FOOD_BONUS,
  CAPACITY_PER_NEST,
  NEST_REPAIR_RATE,
  CACHE_WATER_BONUS,
  FOOD_CAP,
  STARVE_DEATH_INTERVAL,
  STARVE_GRACE,
  SUSPICION_WEIGHTS,
  UPKEEP_FOOD,
  UPKEEP_WATER,
  WATER_CAP,
  WORKER_CAP,
} from './constants.ts';
import { addSuspicion } from './suspicion.ts';
import type { FootholdFunction } from './types.ts';
import { killWorker } from './workers.ts';
import { homeNest, spawnWorker, type World } from './world.ts';

const INTERACT_RADIUS = 104;

/**
 * Every ceiling in the colony is a pure function of what the player has built.
 *
 * This is the rule that turns a full larder back into a decision: a cap is never a constant the
 * player can only stare at, it is a number with a named thing attached to it that would raise it.
 */
export function recomputeLimits(world: World): void {
  const c = world.colony;
  let satellites = 0;
  let nurseries = 0;
  let caches = 0;
  let boltholes = 0;
  for (let i = 0; i < world.nests.length; i++) {
    const n = world.nests[i];
    if (n.home || !n.claimed) continue;
    satellites++;
    if (n.fn === 'nursery') nurseries++;
    else if (n.fn === 'cache') caches++;
    else if (n.fn === 'bolthole') boltholes++;
  }
  c.capacity = Math.min(
    WORKER_CAP,
    BASE_CAPACITY +
      satellites * CAPACITY_PER_NEST +
      nurseries * NURSERY_CAPACITY +
      boltholes * BOLTHOLE_CAPACITY +
      world.traits.capacityBonus,
  );
  c.foodCap = FOOD_CAP + caches * CACHE_FOOD_BONUS;
  c.waterCap = WATER_CAP + caches * CACHE_WATER_BONUS;
  c.nurseries = nurseries;
  c.caches = caches;
  c.boltholes = boltholes;
}

export function updateColony(world: World, dt: number): void {
  const c = world.colony;
  recomputeLimits(world);

  // ── Upkeep. A big colony is expensive, which is why expansion has to pay for itself.
  const pop = c.population;
  const upkeep = world.traits.upkeepMult;
  c.food = Math.max(0, c.food - UPKEEP_FOOD * pop * upkeep * dt);
  c.water = Math.max(0, c.water - UPKEEP_WATER * pop * upkeep * dt);

  const grace = world.time < STARVE_GRACE;

  if (c.food <= 0 && pop > 0 && !grace) {
    c.starving += dt;
    if (c.starving >= STARVE_DEATH_INTERVAL) {
      c.starving = 0;
      cullWeakest(world, 'starve');
    }
  } else {
    c.starving = Math.max(0, c.starving - dt * 0.5);
  }

  if (c.water <= 0 && pop > 0 && !grace) {
    c.thirsting += dt;
    if (c.thirsting >= STARVE_DEATH_INTERVAL * 0.75) {
      c.thirsting = 0;
      cullWeakest(world, 'thirst');
    }
  } else {
    c.thirsting = Math.max(0, c.thirsting - dt * 0.5);
  }

  // ── Brood. Needs food AND water, so a food-only strategy stalls; it never spends the colony into
  // starvation; and a colony that has already reached fighting strength stops breeding so the larder
  // can actually fill. Without that last rule breeding and banking compete forever and the win
  // thresholds are unreachable by construction.
  // Reserve margins keep breeding from eating the colony's own seed stock, but they are flat now:
  // the old population-scaled margin meant a large colony could never afford to breed at all, and
  // the `banking` mode that was supposed to fix it never once fired in a measured run.
  const surge = world.adaptations.surgeTime > 0 ? 2 : 1;
  // The margin is an upkeep runway, not a fraction of storage.
  //
  // A flat margin let a big colony breed itself to zero. A fraction of the *cap* over-corrected the
  // other way: at base storage it demanded 39 food before a single egg, which a six-roach colony
  // paying for its first adaptation could not hold, so the opening simply stopped growing. Scaling
  // with population keeps roughly a minute of upkeep in reserve at every size, which is what the
  // margin was always meant to mean.
  const runway = c.population * 1.2;
  const foodNeeded = BROOD_FOOD_COST + Math.max(BROOD_RESERVE_MARGIN_FOOD, runway);
  const waterNeeded = BROOD_WATER_COST + Math.max(BROOD_RESERVE_MARGIN_WATER, runway * 0.7);
  world.banking = false;
  if (
    c.population < c.capacity &&
    c.food >= foodNeeded &&
    c.water >= waterNeeded &&
    world.status === 'playing'
  ) {
    c.brood +=
      BROOD_RATE *
      (1 + c.nurseries * (BROOD_CHAMBER_MULT - 1)) *
      world.traits.broodRateMult *
      surge *
      dt;
    if (c.brood >= 1) {
      c.brood -= 1;
      c.food -= BROOD_FOOD_COST;
      c.water -= BROOD_WATER_COST;
      const nest = broodNest(world);
      const w = spawnWorker(world, nest.x, nest.y, true, nest.id);
      if (w) {
        c.hatched++;
        world.events.push({ t: 'hatch', x: nest.x, y: nest.y });
      }
    }
  } else if (c.brood > 0) {
    c.brood = Math.max(0, c.brood - dt * 0.05);
  }

  // ── The home crack heals between sweeps. Without this, integrity was a one-way ratchet with no
  // counterplay whatsoever: surviving a spray pass still guaranteed eventual destruction.
  const home = homeNest(world);
  const sprayNear = world.sprays.some(
    (s) => dist2(s.x, s.y, home.x, home.y) < (s.radius + 220) * (s.radius + 220),
  );
  if (!sprayNear && home.integrity > 0 && home.integrity < 1) {
    home.integrity = Math.min(1, home.integrity + NEST_REPAIR_RATE * dt);
  }

  // ── Cosmetic nest growth level, so the hub visibly thickens as the colony grows.
  home.growth = c.population >= 34 ? 3 : c.population >= 22 ? 2 : c.population >= 12 ? 1 : 0;
  for (let i = 0; i < world.nests.length; i++) {
    if (world.nests[i].claimed) world.nests[i].age += dt;
  }
}

function broodNest(world: World) {
  // Round-robin across nurseries so a colony with two of them visibly grows in both places rather
  // than piling every hatch into whichever one was authored first.
  const nurseries = world.nests.filter((n) => n.claimed && n.fn === 'nursery');
  if (nurseries.length > 0) return nurseries[world.colony.hatched % nurseries.length];
  return homeNest(world);
}

function cullWeakest(world: World, cause: 'starve' | 'thirst'): void {
  // Nymphs go first — the colony sacrifices the newest brood, which reads correctly.
  let victim = -1;
  let bestScore = -1;
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive || w.state === 'trapped') continue;
    const score = (w.nymphTime > 0 ? 100 : 0) + (w.carrying ? 0 : 10) + world.rng.next();
    if (score > bestScore) {
      bestScore = score;
      victim = i;
    }
  }
  if (victim >= 0) killWorker(world, world.workers[victim], cause);
}

export interface InteractTarget {
  kind: 'claim' | 'fit' | 'repair' | 'resource' | 'sealed';
  id: string;
  label: string;
  affordable: boolean;
  costFood: number;
  costWater: number;
  x: number;
  y: number;
}

/** What the scout is currently standing next to — drives the contextual `E` prompt. */
export function interactTarget(world: World): InteractTarget | null {
  const s = world.scout;
  if (!s.alive) return null;
  const r2 = INTERACT_RADIUS * INTERACT_RADIUS;
  const c = world.colony;

  let best: InteractTarget | null = null;
  let bestD = r2;

  for (let i = 0; i < world.nests.length; i++) {
    const n = world.nests[i];
    const d = dist2(n.x, n.y, s.x, s.y);
    if (d >= bestD) continue;
    if (!n.claimed && n.unlockOp > world.operation) {
      // Scouting ahead is the point of being a scout: a sealed crack is worth finding early.
      bestD = d;
      best = {
        kind: 'sealed',
        id: n.id,
        label: `${n.label} — opens in operation ${n.unlockOp}`,
        affordable: false,
        costFood: n.costFood,
        costWater: n.costWater,
        x: n.x,
        y: n.y,
      };
    } else if (!n.claimed) {
      bestD = d;
      best = {
        kind: 'claim',
        id: n.id,
        label: `Claim ${n.label}`,
        affordable: c.food >= n.costFood && c.water >= n.costWater,
        costFood: n.costFood,
        costWater: n.costWater,
        x: n.x,
        y: n.y,
      };
    } else if (!n.home && n.fn === null) {
      bestD = d;
      best = {
        kind: 'fit',
        id: n.id,
        label: `Fit out ${n.label}`,
        affordable: c.food >= n.fitFood && c.water >= n.fitWater,
        costFood: n.fitFood,
        costWater: n.fitWater,
        x: n.x,
        y: n.y,
      };
    } else if (n.integrity < 0.985) {
      bestD = d;
      best = {
        kind: 'repair',
        id: n.id,
        label: `Repair ${n.label} — ${Math.round(n.integrity * 100)}%`,
        affordable: c.water >= REPAIR_WATER,
        costFood: 0,
        costWater: REPAIR_WATER,
        x: n.x,
        y: n.y,
      };
    }
  }

  for (let i = 0; i < world.resources.length; i++) {
    const res = world.resources[i];
    if (res.unlockOp > world.operation || res.depleted) continue;
    const d = dist2(res.x, res.y, s.x, s.y);
    if (d >= bestD) continue;
    bestD = d;
    best = {
      kind: 'resource',
      id: res.id,
      label: `${res.label} — ${Math.ceil(res.amount)} left`,
      affordable: true,
      costFood: 0,
      costWater: 0,
      x: res.x,
      y: res.y,
    };
  }

  return best;
}

/** Moisture spent patching a crack back up after a spray pass. */
export const REPAIR_WATER = 16;
/** Fraction of integrity one repair restores. */
export const REPAIR_AMOUNT = 0.34;

export function doInteract(world: World): void {
  const target = interactTarget(world);
  if (!target) {
    world.hint = 'Nothing to inspect here.';
    world.hintKey = 'nothing';
    return;
  }

  if (target.kind === 'sealed') {
    const nest = world.nests.find((n) => n.id === target.id);
    if (nest) {
      world.hint = `${nest.label}: sealed until operation ${nest.unlockOp}. It will cost ${nest.costFood} food and ${nest.costWater} moisture.`;
      world.hintKey = `sealed:${nest.id}`;
    }
    return;
  }

  if (target.kind === 'resource') {
    const res = world.resources.find((r) => r.id === target.id);
    if (res) {
      world.hint = `${res.label}: ${Math.ceil(res.amount)} ${res.kind === 'food' ? 'food' : 'moisture'} left. Run a trail here.`;
      world.hintKey = `inspect:${res.id}`;
    }
    return;
  }

  const nest = world.nests.find((n) => n.id === target.id);
  if (!nest) return;
  const c = world.colony;

  if (target.kind === 'repair') {
    if (c.water < REPAIR_WATER) {
      world.hint = `Patching the crack needs ${REPAIR_WATER} moisture.`;
      world.hintKey = `repair:${nest.id}`;
      return;
    }
    c.water -= REPAIR_WATER;
    nest.integrity = Math.min(1, nest.integrity + REPAIR_AMOUNT);
    world.events.push({ t: 'repair', x: nest.x, y: nest.y });
    world.hint = `${nest.label} patched to ${Math.round(nest.integrity * 100)}%.`;
    world.hintKey = `repaired:${nest.id}`;
    return;
  }

  if (target.kind === 'fit') {
    if (c.food < nest.fitFood || c.water < nest.fitWater) {
      world.hint = `Fitting out ${nest.label} needs ${nest.fitFood} food and ${nest.fitWater} moisture.`;
      world.hintKey = `fitcost:${nest.id}`;
      return;
    }
    // Opens the same one-of-three choice UI the adaptations use. Claiming buys the ground; this is
    // where the player decides what the ground is for.
    world.pendingFit = nest.id;
    world.hint = `${nest.label}: choose what to build — 1 nursery, 2 cache, 3 bolt-hole.`;
    world.hintKey = `fit:${nest.id}`;
    return;
  }

  // Claim.
  if (nest.claimed) return;
  if (c.food < nest.costFood || c.water < nest.costWater) {
    world.hint = `${nest.label} needs ${nest.costFood} food and ${nest.costWater} moisture.`;
    world.hintKey = `cost:${nest.id}`;
    return;
  }
  c.food -= nest.costFood;
  c.water -= nest.costWater;
  nest.claimed = true;
  nest.age = 0;
  recomputeLimits(world);
  if (world.stats.firstClaimAt < 0) world.stats.firstClaimAt = world.time;
  world.events.push({ t: 'claim', x: nest.x, y: nest.y, node: nest.id });
  addSuspicion(world, 'expansion', SUSPICION_WEIGHTS.expansion, nest.x, nest.y);

  // A new crack immediately seeds a couple of bodies so the reward is visible, not just numeric.
  for (let i = 0; i < 2; i++) spawnWorker(world, nest.x, nest.y, true, nest.id);
}

export type FitResult = 'ok' | 'noneOpen' | 'tooPoor';

/** Completes a fit-out chosen from the three-way prompt. */
export function chooseFunction(world: World, fn: FootholdFunction): FitResult {
  const id = world.pendingFit;
  if (!id) return 'noneOpen';
  const nest = world.nests.find((n) => n.id === id);
  if (!nest || !nest.claimed || nest.fn !== null) {
    world.pendingFit = null;
    return 'noneOpen';
  }
  const c = world.colony;
  if (c.food < nest.fitFood || c.water < nest.fitWater) return 'tooPoor';
  c.food -= nest.fitFood;
  c.water -= nest.fitWater;
  nest.fn = fn;
  world.pendingFit = null;
  world.stats.functionsBuilt++;
  recomputeLimits(world);
  world.events.push({ t: 'fitOut', x: nest.x, y: nest.y, fn });
  addSuspicion(world, 'expansion', SUSPICION_WEIGHTS.expansion * 0.6, nest.x, nest.y);
  if (fn === 'nursery')
    for (let i = 0; i < 2; i++) spawnWorker(world, nest.x, nest.y, true, nest.id);
  return 'ok';
}

export const FUNCTION_LABELS: Record<FootholdFunction, { name: string; blurb: string }> = {
  nursery: { name: 'Nursery', blurb: '+10 capacity, and brood hatches here.' },
  cache: { name: 'Cache', blurb: '+90 food and +60 moisture storage.' },
  bolthole: {
    name: 'Bolt-hole',
    blurb: '+2 capacity, and roaches shelter here from further away.',
  },
};

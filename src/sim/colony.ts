import { dist2 } from '../core/math.ts';
import {
  BASE_CAPACITY,
  BROOD_CHAMBER_CAPACITY,
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
  WIN_FOOD,
  WIN_POPULATION,
  WIN_WATER,
  WORKER_CAP,
} from './constants.ts';
import { addSuspicion } from './suspicion.ts';
import { killWorker } from './workers.ts';
import { homeNest, spawnWorker, type World } from './world.ts';

const INTERACT_RADIUS = 104;

/** Population capacity and storage caps are pure functions of which nests are claimed. */
export function recomputeLimits(world: World): void {
  const c = world.colony;
  let satellites = 0;
  for (let i = 0; i < world.nests.length; i++) {
    if (!world.nests[i].home && world.nests[i].claimed) satellites++;
  }
  c.capacity = Math.min(
    WORKER_CAP,
    BASE_CAPACITY +
      satellites * CAPACITY_PER_NEST +
      (c.upgrades.brood ? BROOD_CHAMBER_CAPACITY : 0),
  );
  c.foodCap = FOOD_CAP + (c.upgrades.cache ? CACHE_FOOD_BONUS : 0);
  c.waterCap = WATER_CAP + (c.upgrades.cache ? CACHE_WATER_BONUS : 0);
}

export function updateColony(world: World, dt: number): void {
  const c = world.colony;
  recomputeLimits(world);

  // ── Upkeep. A big colony is expensive, which is why expansion has to pay for itself.
  const pop = c.population;
  c.food = Math.max(0, c.food - UPKEEP_FOOD * pop * dt);
  c.water = Math.max(0, c.water - UPKEEP_WATER * pop * dt);

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
  const bankingFirst =
    c.population >= WIN_POPULATION && (c.food < WIN_FOOD + 15 || c.water < WIN_WATER + 15);
  world.banking = bankingFirst;
  const foodNeeded = BROOD_FOOD_COST + BROOD_RESERVE_MARGIN_FOOD + c.population * 0.8;
  const waterNeeded = BROOD_WATER_COST + BROOD_RESERVE_MARGIN_WATER + c.population * 0.5;
  if (
    !bankingFirst &&
    c.population < c.capacity &&
    c.food >= foodNeeded &&
    c.water >= waterNeeded &&
    world.status === 'playing'
  ) {
    c.brood += BROOD_RATE * (c.upgrades.brood ? BROOD_CHAMBER_MULT : 1) * dt;
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
  for (let i = 0; i < world.nests.length; i++) {
    const n = world.nests[i];
    if (n.claimed && n.upgrade === 'brood') return n;
  }
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
  kind: 'nest' | 'escape' | 'resource' | 'sealed';
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

  let best: InteractTarget | null = null;
  let bestD = r2;

  for (let i = 0; i < world.nests.length; i++) {
    const n = world.nests[i];
    const d = dist2(n.x, n.y, s.x, s.y);
    if (d >= bestD) continue;
    if (n.unlockNight > world.night) {
      // Scouting ahead is the point of being a scout: a sealed crack is worth finding early.
      bestD = d;
      best = {
        kind: 'sealed',
        id: n.id,
        label: `${n.label} — sealed until night ${n.unlockNight}`,
        affordable: false,
        costFood: n.costFood,
        costWater: n.costWater,
        x: n.x,
        y: n.y,
      };
    } else if (!n.claimed) {
      bestD = d;
      best = {
        kind: 'nest',
        id: n.id,
        label: n.label,
        affordable: world.colony.food >= n.costFood && world.colony.water >= n.costWater,
        costFood: n.costFood,
        costWater: n.costWater,
        x: n.x,
        y: n.y,
      };
    } else if (n.upgrade === 'escape') {
      bestD = d;
      best = {
        kind: 'escape',
        id: n.id,
        label: 'Escape tunnel — bolt home',
        affordable: true,
        costFood: 0,
        costWater: 0,
        x: n.x,
        y: n.y,
      };
    }
  }

  for (let i = 0; i < world.resources.length; i++) {
    const res = world.resources[i];
    if (res.unlockNight > world.night || res.depleted) continue;
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

/** Consumes the interact latch. Claiming is the only irreversible spend in the game. */
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
      world.hint = `${nest.label}: still sealed. It opens on night ${nest.unlockNight} and will cost ${nest.costFood} food, ${nest.costWater} moisture.`;
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

  if (target.kind === 'escape') {
    const home = homeNest(world);
    world.scout.x = home.x + 48;
    world.scout.y = home.y;
    world.scout.vx = 0;
    world.scout.vy = 0;
    world.scout.spotted = 0;
    world.scout.invuln = 1;
    world.events.push({ t: 'scoutRespawn', x: world.scout.x, y: world.scout.y });
    return;
  }

  const nest = world.nests.find((n) => n.id === target.id);
  if (!nest || nest.claimed) return;
  const c = world.colony;
  if (c.food < nest.costFood || c.water < nest.costWater) {
    world.hint = `${nest.label} needs ${nest.costFood} food and ${nest.costWater} moisture.`;
    world.hintKey = `cost:${nest.id}`;
    return;
  }

  c.food -= nest.costFood;
  c.water -= nest.costWater;
  nest.claimed = true;
  nest.age = 0;
  if (nest.upgrade) {
    c.upgrades[nest.upgrade] = true;
    world.events.push({ t: 'upgrade', x: nest.x, y: nest.y, kind: nest.upgrade });
  }
  recomputeLimits(world);
  if (world.stats.firstClaimAt < 0) world.stats.firstClaimAt = world.time;
  world.events.push({ t: 'claim', x: nest.x, y: nest.y, node: nest.id });
  addSuspicion(world, 'expansion', SUSPICION_WEIGHTS.expansion, nest.x, nest.y);

  // A new chamber immediately seeds a couple of bodies so the reward is visible, not just numeric.
  for (let i = 0; i < 2; i++) spawnWorker(world, nest.x, nest.y, true, nest.id);
}

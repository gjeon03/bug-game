import { Rng } from '../core/rng';
import { buildHouse, buildNav } from '../world/house';
import { nearestWalkable } from '../world/nav';
import { mm } from '../world/units';
import { REGION_ORDER, type RegionId } from '../world/types';
import type {
  AlertLevel,
  Cue,
  Foothold,
  RegionState,
  ResourceState,
  RoutineState,
  Run,
  RunEvent,
  Worker,
} from './types';

/**
 * Run construction and the tuning constants the whole simulation reads.
 *
 * Everything here is authored against one target: **a 25–35 minute run** in which the player crosses
 * four chapters. That number is what sets brood rate, resource amounts and gate costs; when one of
 * them changes, the run length is what has to be re-measured, not the feel.
 */

/* ------------------------------------------------------------------ tuning */

export const SIM_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;

/** Scout ground speed, world units per second. 320 u/s ≈ 430 mm/s ≈ 12 body-lengths a second. */
export const SCOUT_SPEED = 320;
export const SCOUT_SPRINT = 545;
/** Sprint drains, walking recovers. A scout that can sprint forever has no positioning problem. */
export const SPRINT_DRAIN = 0.34;
export const SPRINT_RECOVER = 0.19;

export const WORKER_SPEED = 205;
export const WORKER_CAP = 96;

/** How close the scout must be to inspect, claim, or work a gate. */
export const REACH = mm(150);
/** How close the scout must be for a hidden site to reveal itself. */
export const DISCOVER_RADIUS = mm(420);

/**
 * Resource cost and time for one worker to be born.
 *
 * Brood is deliberately FOOD-hungry and only moderately thirsty. At 4.2 moisture per worker the
 * brood specialization — which exists to grow the colony faster — outran its own water supply and
 * killed itself: measured on seed 20260805, capacity 30, 199 deliveries, every region at alert 0,
 * and the run still ended with moisture 0 and population 0. A specialization whose only outcome is
 * starvation is not a choice.
 *
 * Eggs want protein more than water, and making the two costs asymmetric is also what keeps brood
 * distinct from scavenging rather than being the same pressure at a different rate.
 */
export const BROOD_FOOD_PER_WORKER = 6.5;
export const BROOD_MOISTURE_PER_WORKER = 2.4;
export const BROOD_SECONDS = 7.4;

/**
 * What one full worker load is worth when it reaches the nest.
 *
 * A cockroach carries a crumb, and a crumb is a lot of food to a cockroach. Measured: with this at
 * 1.0 a worker produced ~0.04 units/s against ~0.049 upkeep, so every colony starved no matter how
 * well it was played — 122 deliveries in a 45-minute run and a final population of zero.
 */
export const CARGO_VALUE = 3.1;

/**
 * Upkeep per living worker per second. This is why a big colony cannot idle.
 *
 * Held well under the per-worker production rate so growth is possible, but high enough that a
 * colony which stops delivering shrinks within a minute or two.
 */
export const UPKEEP_FOOD = 0.0075;
export const UPKEEP_MOISTURE = 0.0055;

/** Route strength decays this fast when nothing walks it. */
export const ROUTE_DECAY = 0.022;
/** ...and is reinforced this much by each delivery. */
export const ROUTE_REINFORCE = 0.14;

/** Evidence generated per unit of cargo carried, scaled by route exposure and site disturbance. */
export const EVIDENCE_PER_DELIVERY = 0.0085;
/** Evidence bleeds off while a region is quiet — but never below its floor. */
export const EVIDENCE_DECAY = 0.0075;
/**
 * A sighting permanently raises a region's evidence floor.
 *
 * This is the memory that makes the endgame the player's own fault: the household does not forget
 * that it saw something in the bedroom, and the final response is aimed by that history.
 *
 * The cap is the important number, and it sits below the ALERT-1 threshold (0.16).
 *
 * It has been wrong twice, in the same direction both times. At 0.80, five sightings pinned a
 * region at alert 3 forever: 121 workers died and no colony recovered. Lowered to 0.33 — still
 * above the alert-1 threshold — and once the household actually started responding, a run with 65
 * sightings pinned every visited region at "noticing" permanently, costing 246 workers.
 *
 * Permanent memory should mean the household stays *watchful*, not that it stays *at war*. Below
 * 0.16, sightings move a region toward noticing and never past it on their own; every alert level
 * that actually spawns a response requires CURRENT traffic, which the player can choose to stop.
 * That is what makes regional loss recoverable.
 */
export const SIGHTING_FLOOR_GAIN = 0.055;
export const SIGHTING_FLOOR_CAP = 0.13;

export const ALERT_THRESHOLDS: readonly number[] = [0.16, 0.36, 0.6, 0.84];

/** Seconds the scout can stand fully exposed before it counts as a sighting. */
export const SEEN_SECONDS = 2.4;

export const LOG_CAP = 40;

/** Seconds of grace after a sighting before the scout can be seen again. */
export const SEEN_COOLDOWN = 7;

/**
 * Store ceiling.
 *
 * A colony cannot bank an unbounded amount in a crack under a sink. The cap scales with brood
 * capacity, so the answer to "I am at the ceiling" is always a concrete spatial one: take another
 * foothold. Overflow is discarded and reported, which is how the player learns which of the two
 * resources is actually their bottleneck.
 */
export function storeCap(run: Run): number {
  return 70 + run.colony.capacity * 7;
}

/* --------------------------------------------------------------- household */

export interface RoutineSpec {
  readonly id: string;
  readonly region: RegionId;
  /** Seconds between runs, before jitter. */
  readonly period: number;
  readonly jitter: number;
  /** Seconds of warning the player gets. */
  readonly telegraph: number;
  readonly duration: number;
  readonly aftermath: number;
  /** Earliest run time this routine can first fire. Keeps chapter 1 legible. */
  readonly notBefore: number;
  readonly labelKey: string;
}

/**
 * The household's night.
 *
 * These are not threats — they are the rhythm the threats are drawn from. A routine creates both
 * the opportunity (the bin is opened, the glass is refilled, the tap runs) and the danger (the
 * light comes on, someone stands where your route is).
 */
export const ROUTINES: readonly RoutineSpec[] = [
  {
    id: 'kitchen.dishes',
    region: 'kitchen',
    period: 96,
    jitter: 22,
    telegraph: 6,
    duration: 26,
    aftermath: 10,
    notBefore: 52,
    labelKey: 'routine.kitchen.dishes',
  },
  {
    id: 'kitchen.dinner',
    region: 'kitchen',
    period: 148,
    jitter: 30,
    telegraph: 7,
    duration: 30,
    aftermath: 14,
    notBefore: 140,
    labelKey: 'routine.kitchen.dinner',
  },
  {
    id: 'living.tv',
    region: 'living',
    period: 118,
    jitter: 26,
    telegraph: 5,
    duration: 62,
    aftermath: 8,
    notBefore: 30,
    labelKey: 'routine.living.tv',
  },
  {
    id: 'bathroom.use',
    region: 'bathroom',
    period: 104,
    jitter: 34,
    telegraph: 5,
    duration: 22,
    aftermath: 12,
    notBefore: 60,
    labelKey: 'routine.bathroom.use',
  },
  {
    id: 'bedroom.phone',
    region: 'bedroom',
    period: 86,
    jitter: 20,
    telegraph: 4,
    duration: 20,
    aftermath: 6,
    notBefore: 20,
    labelKey: 'routine.bedroom.phone',
  },
  {
    // Referenced by the bathroom's flood zones and its tray/drain refills.
    id: 'bathroom.shower',
    region: 'bathroom',
    period: 168,
    jitter: 40,
    telegraph: 6,
    duration: 40,
    aftermath: 18,
    notBefore: 150,
    labelKey: 'routine.bathroom.shower',
  },
  {
    // The resident settling, turning over, and finally sleeping. Drives the bedroom entirely.
    id: 'bedroom.sleep',
    region: 'bedroom',
    period: 112,
    jitter: 26,
    telegraph: 6,
    duration: 54,
    aftermath: 14,
    notBefore: 40,
    labelKey: 'routine.bedroom.sleep',
  },
  {
    id: 'bedroom.restless',
    region: 'bedroom',
    period: 96,
    jitter: 30,
    telegraph: 5,
    duration: 18,
    aftermath: 10,
    notBefore: 70,
    labelKey: 'routine.bedroom.restless',
  },
  {
    id: 'living.snack',
    region: 'living',
    period: 132,
    jitter: 28,
    telegraph: 6,
    duration: 26,
    aftermath: 12,
    notBefore: 80,
    labelKey: 'routine.living.snack',
  },
  {
    id: 'hallway.door',
    region: 'hallway',
    period: 118,
    jitter: 30,
    telegraph: 4,
    duration: 10,
    aftermath: 6,
    notBefore: 110,
    labelKey: 'routine.hallway.door',
  },
  {
    id: 'hallway.pass',
    region: 'hallway',
    period: 74,
    jitter: 24,
    telegraph: 4.5,
    duration: 12,
    aftermath: 5,
    notBefore: 90,
    labelKey: 'routine.hallway.pass',
  },
];

/* ----------------------------------------------------------------- factory */

function makeWorker(id: number): Worker {
  return {
    id,
    alive: false,
    state: 'idle',
    surface: '',
    x: 0,
    z: 0,
    y: 0,
    prevX: 0,
    prevZ: 0,
    prevY: 0,
    heading: 0,
    speed: 0,
    route: '',
    replanAt: 0,
    leg: 0,
    lane: 0,
    cargo: 0,
    cargoKind: null,
    stuckFor: 0,
    recoverFor: 0,
    climb: null,
    home: '',
    age: 0,
  };
}

/**
 * Build a fresh run.
 *
 * Everything mutable is constructed here and nowhere else, which is what makes restart a matter of
 * dropping the object rather than of remembering to reset forty fields. The five-restart leak gate
 * is a property of this function being total.
 */
export function createRun(seed: number): Run {
  const house = buildHouse();
  const openGates = new Set<string>();
  const nav = buildNav(house, openGates);
  const rng = new Rng(seed);

  const footholds = new Map<string, Foothold>();
  for (const site of house.footholds.values()) {
    footholds.set(site.id, {
      id: site.id,
      claimed: site.initial === true,
      progress: site.initial === true ? 1 : 0,
      brood: site.initial === true ? 2 : 0,
      damage: 0,
      isolatedFor: 0,
    });
  }

  const resources = new Map<string, ResourceState>();
  for (const site of house.resources.values()) {
    resources.set(site.id, {
      id: site.id,
      remaining: site.amount,
      // Everything in the starting region is visible from the first frame; the rest is scouted.
      found: site.hidden !== true && site.region === 'kitchen',
      disturbed: 0,
    });
  }

  const regions = new Map<RegionId, RegionState>();
  for (const id of REGION_ORDER) {
    regions.set(id, {
      id,
      unlocked: id === 'kitchen',
      evidence: 0,
      evidenceFloor: 0,
      alert: 0 as AlertLevel,
      quietFor: 0,
      traffic: 0,
    });
  }

  const routines = new Map<string, RoutineState>();
  for (const spec of ROUTINES) {
    routines.set(spec.id, {
      id: spec.id,
      phase: 'idle',
      // First fire is scheduled from `notBefore`, so chapter 1 is not interrupted before the
      // player has had time to learn what an interruption means.
      timer: spec.notBefore + rng.range(0, spec.jitter),
      runs: 0,
    });
  }

  const home = house.footholds.get('kitchen.undersink');
  if (!home) throw new Error('the run has no starting foothold');
  const start = nearestWalkable(nav, home.surface, home.at.x, home.at.z);
  if (!start) throw new Error('the starting foothold is not standable');

  const surfaceY = house.surfaces.get(home.surface)?.y ?? 0;

  const workers: Worker[] = [];
  for (let i = 0; i < WORKER_CAP; i++) workers.push(makeWorker(i));

  const run: Run = {
    house,
    nav,
    rng,
    seed,
    status: 'playing',
    time: 0,
    chapter: 'kitchen',
    scout: {
      surface: home.surface,
      x: start.point.x,
      z: start.point.z,
      y: surfaceY,
      prevX: start.point.x,
      prevZ: start.point.z,
      prevY: surfaceY,
      heading: Math.PI * 0.25,
      speed: 0,
      state: 'idle',
      climb: null,
      working: null,
      seen: 0,
      seenCooldown: 0,
    },
    colony: {
      food: 8,
      moisture: 6,
      population: 0,
      capacity: 0,
      broodProgress: 0,
      starvedFor: 0,
      adaptations: [],
      adaptationPoints: 0,
    },
    workers,
    routes: [],
    footholds,
    resources,
    regions,
    routines,
    threats: [],
    openGates,
    gateProgress: new Map<string, number>(),
    objective: {
      chapter: 'kitchen',
      titleKey: 'objective.kitchen.title',
      bodyKey: 'objective.kitchen.secure',
      params: {},
      blockerKey: null,
      blockerParams: {},
      at: null,
      progress: 0,
    },
    log: [],
    stats: {
      exterminationSweeps: 0,
      deliveries: 0,
      sightings: 0,
      workersLost: 0,
      routesWashed: 0,
      regionsOpened: 1,
      peakPopulation: 0,
    },
    cues: [],
    nextWorkerId: 0,
    nextThreatId: 0,
    nextRouteId: 0,
    idleFor: 0,
    // The first sweep can never land before the colony has had a chance to establish itself.
    sweepCooldown: 90,
  };

  recomputeCapacity(run);
  // Two workers are already alive in the home nest. The player's first minute is about what to do
  // with labour that exists, not about waiting for labour to appear.
  spawnWorker(run, 'kitchen.undersink');
  spawnWorker(run, 'kitchen.undersink');

  return run;
}

/** Total brood capacity across every claimed, undestroyed foothold. */
export function recomputeCapacity(run: Run): void {
  let capacity = 0;
  for (const [id, state] of run.footholds) {
    if (!state.claimed || state.damage >= 1) continue;
    const site = run.house.footholds.get(id);
    if (site) capacity += site.capacity;
  }
  const broodTier = run.colony.adaptations.filter((a) => a.family === 'brood').length;
  run.colony.capacity = Math.round(capacity * (1 + 0.22 * broodTier));
}

export function spawnWorker(run: Run, footholdId: string): Worker | null {
  if (run.colony.population >= run.colony.capacity) return null;
  const site = run.house.footholds.get(footholdId);
  const state = run.footholds.get(footholdId);
  if (!site || !state?.claimed) return null;

  const worker = run.workers.find((w) => !w.alive);
  if (!worker) return null;

  const spot = nearestWalkable(run.nav, site.surface, site.at.x, site.at.z);
  if (!spot) return null;
  const y = run.house.surfaces.get(site.surface)?.y ?? 0;

  worker.alive = true;
  worker.state = 'idle';
  worker.surface = site.surface;
  worker.x = spot.point.x + run.rng.signed() * mm(30);
  worker.z = spot.point.z + run.rng.signed() * mm(30);
  worker.y = y;
  worker.prevX = worker.x;
  worker.prevZ = worker.z;
  worker.prevY = y;
  worker.heading = run.rng.range(0, Math.PI * 2);
  worker.speed = 0;
  worker.route = '';
  worker.leg = 0;
  worker.lane = run.rng.signed() * mm(26);
  worker.cargo = 0;
  worker.cargoKind = null;
  worker.stuckFor = 0;
  worker.recoverFor = 0;
  worker.climb = null;
  worker.home = footholdId;
  worker.age = 0;

  run.colony.population++;
  if (run.colony.population > run.stats.peakPopulation) {
    run.stats.peakPopulation = run.colony.population;
  }
  state.brood = Math.max(0, state.brood - 1);
  pushCue(run, 'worker.born', worker.x, y, worker.z);
  return worker;
}

export function killWorker(run: Run, worker: Worker): void {
  if (!worker.alive) return;
  worker.alive = false;
  worker.state = 'dead';
  worker.route = '';
  worker.cargo = 0;
  worker.cargoKind = null;
  worker.climb = null;
  run.colony.population = Math.max(0, run.colony.population - 1);
  run.stats.workersLost++;
  pushCue(run, 'worker.died', worker.x, worker.y, worker.z);
}

export function pushCue(
  run: Run,
  kind: string,
  x: number,
  y: number,
  z: number,
  amount?: number,
): void {
  const cue: Cue = amount === undefined ? { kind, x, y, z } : { kind, x, y, z, amount };
  run.cues.push(cue);
}

/**
 * Record something the player should be told about.
 *
 * Stores a catalog key and its params — never a rendered sentence. The UI is the only place that
 * knows what language the player reads.
 */
export function logEvent(
  run: Run,
  key: string,
  severity: RunEvent['severity'] = 'info',
  params: Record<string, string | number> = {},
): void {
  run.log.unshift({ key, params, at: run.time, severity });
  if (run.log.length > LOG_CAP) run.log.length = LOG_CAP;
}

export function regionState(run: Run, id: RegionId): RegionState {
  const state = run.regions.get(id);
  if (!state) throw new Error(`unknown region ${id}`);
  return state;
}

/** Alert level derived from evidence. Kept as a pure function so the HUD can preview it. */
export function alertFor(evidence: number): AlertLevel {
  let level = 0;
  for (const threshold of ALERT_THRESHOLDS) {
    if (evidence >= threshold) level++;
  }
  return level as AlertLevel;
}

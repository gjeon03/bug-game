import { Rng } from '../core/rng.ts';
import { SpatialHash } from '../core/spatial.ts';
import {
  BASE_CAPACITY,
  FOOD_CAP,
  NIGHT_LENGTH,
  SCOUT_STAMINA_MAX,
  RESERVE_MAX,
  START_FOOD,
  START_WATER,
  START_POPULATION,
  WATER_CAP,
  WORKER_CAP,
  WORKER_SPEED_MAX,
  WORKER_SPEED_MIN,
  WORLD_H,
  WORLD_W,
} from './constants.ts';
import { NESTS, RESOURCES } from './kitchen.ts';
import type {
  Colony,
  Corpse,
  GameEvent,
  Hazard,
  InputState,
  Intent,
  LoseCause,
  NestNode,
  NightIndex,
  Patrol,
  ResourceNode,
  Route,
  RunStats,
  RunStatus,
  Spray,
  SuspicionState,
  Worker,
} from './types.ts';

export interface Scout {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  alive: boolean;
  respawnTimer: number;
  invuln: number;
  stamina: number;
  staminaDelay: number;
  sprinting: boolean;
  laying: boolean;
  gait: number;
  exposure: number;
  /** Fills while exposure is above the danger threshold; at 1 the humans notice you. */
  spotted: number;
  trapId: number;
  trapStruggle: number;
  /** Seconds since the last player input, used for onboarding nudges and idle measurement. */
  idleTime: number;
}

export interface OnboardingState {
  step: number;
  stepTime: number;
  seenBefore: boolean;
  /** Set true once the player has demonstrably performed the current step's action. */
  satisfied: boolean;
}

export interface WinCriteria {
  population: boolean;
  food: boolean;
  water: boolean;
  nests: boolean;
  survived: boolean;
}

export interface World {
  readonly seed: number;
  rng: Rng;
  time: number;
  tick: number;

  status: RunStatus;
  night: NightIndex;
  nightTime: number;
  nightLength: number;
  interludeTime: number;
  interludeFrom: NightIndex;
  /** Set during the final scripted extermination response of night 3. */
  finalResponse: boolean;
  finalResponseTime: number;

  scout: Scout;
  workers: Worker[];
  corpses: Corpse[];
  routes: Route[];
  nextRouteId: number;
  activeRouteId: number;
  reserve: number;

  nests: NestNode[];
  resources: ResourceNode[];

  hazards: Hazard[];
  patrols: Patrol[];
  sprays: Spray[];
  footfalls: { x: number; y: number; warn: number; warnTotal: number; done: boolean }[];
  nextId: number;

  colony: Colony;
  suspicion: SuspicionState;

  roomLight: number;
  roomLightTarget: number;

  events: GameEvent[];
  input: InputState;
  intent: Intent;
  stats: RunStats;
  onboarding: OnboardingState;

  objective: string;
  /** World-space target the objective refers to, so the HUD can point at it. */
  guide: { x: number; y: number; label: string } | null;
  /** Set while a reserve is critically low, so the HUD can escalate the matching meter. */
  shortage: 'food' | 'water' | null;
  /** True while the colony has stopped breeding in order to bank reserves for the win condition. */
  banking: boolean;
  /** Current onboarding prompt, empty once the sequence is complete. */
  tutorial: string;
  /** Transient feedback toast (inspect results, refused claims). */
  hint: string;
  hintKey: string;
  hintTime: number;
  /** Human-readable summary of the next escalation, shown in the HUD. */
  nextResponse: string;
  /** Reason the last household reaction card gives. */
  reactionNote: string;

  loseCause: LoseCause | null;
  winCriteria: WinCriteria;

  workerHash: SpatialHash;
  /** Scratch counter used by the traffic suspicion term. */
  exposedWorkers: number;
  /** Length of pheromone trail currently sitting on exposed floor. */
  exposedTrail: number;
  /** Total live pheromone nodes, for telemetry and the renderer's LOD decisions. */
  pheromoneNodeCount: number;
  /** Set by the exposure system when the scout is spotted; consumed by the threat director. */
  pendingStomp: { x: number; y: number } | null;
  /** One-shot escalation request: the tier just crossed, or -1. Consumed by the director. */
  pendingTier: number;
  /** One flag per entry in the director's authored beat table. Sized lazily on first update. */
  beatFired: boolean[];
}

function makeWorker(): Worker {
  return {
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    speed: 130,
    state: 'idle',
    routeId: -1,
    nodeIndex: -1,
    dirSign: 1,
    carrying: null,
    carryAmount: 0,
    timer: 0,
    lostTime: 0,
    panicTime: 0,
    gait: 0,
    variant: 0,
    scale: 1,
    exposure: 0,
    hazardId: -1,
    targetResource: null,
    targetNest: null,
    nymphTime: 0,
  };
}

export function spawnWorker(
  world: World,
  x: number,
  y: number,
  asNymph: boolean,
  nestId: string | null = null,
): Worker | null {
  const pool = world.workers;
  for (let i = 0; i < pool.length; i++) {
    const w = pool[i];
    if (w.alive) continue;
    const r = world.rng;
    w.alive = true;
    w.x = x + r.signed() * 22;
    w.y = y + r.signed() * 22;
    w.vx = 0;
    w.vy = 0;
    w.angle = r.range(0, Math.PI * 2);
    w.speed = r.range(WORKER_SPEED_MIN, WORKER_SPEED_MAX);
    w.state = 'idle';
    w.routeId = -1;
    w.nodeIndex = -1;
    w.dirSign = 1;
    w.carrying = null;
    w.carryAmount = 0;
    w.timer = r.range(0, 0.4);
    w.lostTime = 0;
    w.panicTime = 0;
    w.gait = r.range(0, 6.28);
    w.variant = r.int(0, 3);
    w.scale = r.range(0.9, 1.08);
    w.exposure = 0;
    w.hazardId = -1;
    w.targetResource = null;
    // A roach born in the brood chamber lives in the brood chamber; without this the whole colony
    // walked back to the home crack and left the chamber's own supply lines unstaffed.
    w.targetNest = nestId;
    w.nymphTime = asNymph ? 6 : 0;
    return w;
  }
  return null;
}

export function createWorld(seed: number): World {
  const rng = new Rng(seed);
  const home = NESTS[0];

  const workers: Worker[] = new Array(WORKER_CAP);
  for (let i = 0; i < WORKER_CAP; i++) workers[i] = makeWorker();

  const nests: NestNode[] = NESTS.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    home: n.home,
    claimed: n.home,
    upgrade: n.upgrade,
    unlockNight: n.unlockNight,
    label: n.label,
    costFood: n.costFood,
    costWater: n.costWater,
    integrity: 1,
    growth: 0,
    age: n.home ? 999 : 0,
  }));

  const resources: ResourceNode[] = RESOURCES.map((r) => ({
    id: r.id,
    kind: r.kind,
    x: r.x,
    y: r.y,
    amount: r.amount,
    initial: r.amount,
    unlockNight: r.unlockNight,
    label: r.label,
    depleted: false,
    depletedReported: false,
    busy: 0,
    disturbance: 0,
  }));

  const world: World = {
    seed,
    rng,
    time: 0,
    tick: 0,

    status: 'playing',
    night: 1,
    nightTime: 0,
    nightLength: NIGHT_LENGTH[1],
    interludeTime: 0,
    interludeFrom: 1,
    finalResponse: false,
    finalResponseTime: 0,

    scout: {
      x: home.x + 62,
      y: home.y + 6,
      vx: 0,
      vy: 0,
      angle: 0,
      speed: 0,
      alive: true,
      respawnTimer: 0,
      invuln: 1.2,
      stamina: SCOUT_STAMINA_MAX,
      staminaDelay: 0,
      sprinting: false,
      laying: false,
      gait: 0,
      exposure: 0,
      spotted: 0,
      trapId: -1,
      trapStruggle: 0,
      idleTime: 0,
    },
    workers,
    corpses: [],
    routes: [],
    nextRouteId: 1,
    activeRouteId: -1,
    reserve: RESERVE_MAX,

    nests,
    resources,

    hazards: [],
    patrols: [],
    sprays: [],
    footfalls: [],
    nextId: 1,

    colony: {
      food: START_FOOD,
      water: START_WATER,
      foodCap: FOOD_CAP,
      waterCap: WATER_CAP,
      population: 0,
      capacity: BASE_CAPACITY,
      brood: 0,
      totalFood: 0,
      totalWater: 0,
      hatched: 0,
      lost: 0,
      upgrades: { brood: false, cache: false, escape: false },
      starving: 0,
      thirsting: 0,
      emptyTime: 0,
    },

    suspicion: {
      value: 0,
      peak: 0,
      floor: 0,
      tier: 0,
      causes: {
        seen: 0,
        corpse: 0,
        traffic: 0,
        depleted: 0,
        trap: 0,
        expansion: 0,
        noise: 0,
        droppings: 0,
      },
      accum: {
        seen: 0,
        corpse: 0,
        traffic: 0,
        depleted: 0,
        trap: 0,
        expansion: 0,
        noise: 0,
        droppings: 0,
      },
      lastCause: null,
      lastCauseTime: -99,
      reachedTier: 0,
    },

    roomLight: 0,
    roomLightTarget: 0,

    events: [],
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      lay: false,
      erase: false,
      sprint: false,
      interact: false,
      interactPressed: false,
      erasePressed: false,
    },
    intent: { paused: false, restart: false, skipInterlude: false },

    stats: {
      runSeconds: 0,
      firstMoveAt: -1,
      firstTrailAt: -1,
      firstDeliveryAt: -1,
      firstClaimAt: -1,
      deliveries: 0,
      workersLost: 0,
      scoutDeaths: 0,
      trapsSprung: 0,
      peakPopulation: 0,
      idleSeconds: 0,
      distanceTravelled: 0,
      trailNodesLaid: 0,
    },
    onboarding: { step: 0, stepTime: 0, seenBefore: false, satisfied: false },

    objective: 'Leave the crack and find something to eat.',
    guide: null,
    shortage: null,
    banking: false,
    tutorial: '',
    hint: '',
    hintKey: '',
    hintTime: 0,
    nextResponse: 'Nobody has noticed anything yet.',
    reactionNote: '',

    loseCause: null,
    winCriteria: {
      population: false,
      food: false,
      water: false,
      nests: false,
      survived: false,
    },

    workerHash: new SpatialHash(WORLD_W, WORLD_H, 96),
    exposedWorkers: 0,
    exposedTrail: 0,
    pheromoneNodeCount: 0,
    pendingStomp: null,
    pendingTier: -1,
    beatFired: [],
  };

  for (let i = 0; i < START_POPULATION; i++) spawnWorker(world, home.x, home.y, false);
  world.colony.population = countAlive(world);
  world.stats.peakPopulation = world.colony.population;

  return world;
}

export function countAlive(world: World): number {
  let n = 0;
  for (let i = 0; i < world.workers.length; i++) if (world.workers[i].alive) n++;
  return n;
}

export function findRoute(world: World, id: number): Route | null {
  for (let i = 0; i < world.routes.length; i++)
    if (world.routes[i].id === id) return world.routes[i];
  return null;
}

export function findNest(world: World, id: string | null): NestNode | null {
  if (id === null) return null;
  for (let i = 0; i < world.nests.length; i++) if (world.nests[i].id === id) return world.nests[i];
  return null;
}

export function findResource(world: World, id: string | null): ResourceNode | null {
  if (id === null) return null;
  for (let i = 0; i < world.resources.length; i++) {
    if (world.resources[i].id === id) return world.resources[i];
  }
  return null;
}

export function homeNest(world: World): NestNode {
  return world.nests[0];
}

export type {
  Corpse,
  GameEvent,
  Hazard,
  Patrol,
  Spray,
  RunStats,
  RunStatus,
  Colony,
  SuspicionState,
};

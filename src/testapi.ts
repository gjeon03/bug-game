import type { PerfWindowResult, Telemetry } from './core/telemetry.ts';
import type { World } from './sim/world.ts';

/**
 * The automation seam.
 *
 * Deliberately minimal: a test can choose a seed, read high-level state, drive the *real* input
 * layer and read frame telemetry. There is no way to set colony values, teleport the scout or force
 * an outcome, so an E2E test cannot fake a passing run — it has to play the game.
 */
export type LogicalKey = 'up' | 'down' | 'left' | 'right' | 'lay' | 'erase' | 'sprint' | 'interact';

export interface StateSnapshot {
  ready: boolean;
  time: number;
  tick: number;
  status: string;
  night: number;
  nightTime: number;
  nightLength: number;
  finalResponse: boolean;
  paused: boolean;
  overlay: string;
  scout: {
    x: number;
    y: number;
    alive: boolean;
    stamina: number;
    exposure: number;
    spotted: number;
    trapped: boolean;
    laying: boolean;
  };
  colony: {
    food: number;
    water: number;
    foodCap: number;
    waterCap: number;
    population: number;
    capacity: number;
    brood: number;
    hatched: number;
    lost: number;
    totalFood: number;
    totalWater: number;
    upgrades: Record<string, boolean>;
  };
  suspicion: { value: number; tier: number; peak: number; floor: number; lastCause: string | null };
  routes: {
    id: number;
    nodes: number;
    linked: boolean;
    exposure: number;
    traffic: number;
    resourceId: string | null;
    nestId: string | null;
  }[];
  nests: { id: string; claimed: boolean; upgrade: string | null; integrity: number }[];
  resources: { id: string; kind: string; amount: number; depleted: boolean; unlockNight: number }[];
  counts: {
    workers: number;
    workersOutbound: number;
    workersInbound: number;
    workersCarrying: number;
    workersPanicking: number;
    workersTrapped: number;
    corpses: number;
    hazards: number;
    patrols: number;
    sprays: number;
    footfalls: number;
    pheromoneNodes: number;
  };
  stats: Record<string, number>;
  objective: string;
  shortage: string | null;
  tutorial: string;
  nextResponse: string;
  reserve: number;
  loseCause: string | null;
  winCriteria: Record<string, boolean>;
  reactionNote: string;
}

export interface TestApi {
  ready: boolean;
  version: string;
  newRun(seed?: number): void;
  state(): StateSnapshot;
  telemetry(): {
    fps: number;
    p95: number;
    results: PerfWindowResult[];
    counters: Record<string, number>;
    startup: Record<string, number>;
    audioVoices: number;
    steps: number;
    discardedTime: number;
    overloadFrames: number;
  };
  markPerf(label: string): void;
  endPerf(): PerfWindowResult | null;
  input: {
    press(key: LogicalKey): void;
    release(key: LogicalKey): void;
    releaseAll(): void;
  };
  setPaused(paused: boolean): void;
  errors: string[];
  assetAudit(): Record<string, unknown>;
}

export function snapshot(world: World, paused: boolean, overlay: string): StateSnapshot {
  let outbound = 0;
  let inbound = 0;
  let carrying = 0;
  let panicking = 0;
  let trapped = 0;
  let alive = 0;
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive) continue;
    alive++;
    if (w.state === 'outbound') outbound++;
    else if (w.state === 'inbound') inbound++;
    else if (w.state === 'panic') panicking++;
    else if (w.state === 'trapped') trapped++;
    if (w.carrying) carrying++;
  }

  return {
    ready: true,
    time: world.time,
    tick: world.tick,
    status: world.status,
    night: world.night,
    nightTime: world.nightTime,
    nightLength: world.nightLength,
    finalResponse: world.finalResponse,
    paused,
    overlay,
    scout: {
      x: world.scout.x,
      y: world.scout.y,
      alive: world.scout.alive,
      stamina: world.scout.stamina,
      exposure: world.scout.exposure,
      spotted: world.scout.spotted,
      trapped: world.scout.trapId >= 0,
      laying: world.scout.laying,
    },
    colony: {
      food: world.colony.food,
      water: world.colony.water,
      foodCap: world.colony.foodCap,
      waterCap: world.colony.waterCap,
      population: world.colony.population,
      capacity: world.colony.capacity,
      brood: world.colony.brood,
      hatched: world.colony.hatched,
      lost: world.colony.lost,
      totalFood: world.colony.totalFood,
      totalWater: world.colony.totalWater,
      upgrades: { ...world.colony.upgrades },
    },
    suspicion: {
      value: world.suspicion.value,
      tier: world.suspicion.tier,
      peak: world.suspicion.peak,
      floor: world.suspicion.floor,
      lastCause: world.suspicion.lastCause,
    },
    routes: world.routes.map((r) => ({
      id: r.id,
      nodes: r.nodes.length,
      linked: r.linked,
      exposure: r.exposure,
      traffic: r.traffic,
      resourceId: r.resourceId,
      nestId: r.nestId,
    })),
    nests: world.nests.map((n) => ({
      id: n.id,
      claimed: n.claimed,
      upgrade: n.upgrade,
      integrity: n.integrity,
    })),
    resources: world.resources.map((r) => ({
      id: r.id,
      kind: r.kind,
      amount: r.amount,
      depleted: r.depleted,
      unlockNight: r.unlockNight,
    })),
    counts: {
      workers: alive,
      workersOutbound: outbound,
      workersInbound: inbound,
      workersCarrying: carrying,
      workersPanicking: panicking,
      workersTrapped: trapped,
      corpses: world.corpses.length,
      hazards: world.hazards.length,
      patrols: world.patrols.length,
      sprays: world.sprays.length,
      footfalls: world.footfalls.length,
      pheromoneNodes: world.pheromoneNodeCount,
    },
    stats: { ...world.stats } as unknown as Record<string, number>,
    objective: world.objective,
    shortage: world.shortage,
    tutorial: world.tutorial,
    nextResponse: world.nextResponse,
    reserve: world.reserve,
    loseCause: world.loseCause,
    winCriteria: { ...world.winCriteria } as unknown as Record<string, boolean>,
    reactionNote: world.reactionNote,
  };
}

export function telemetrySnapshot(
  telemetry: Telemetry,
  audioVoices: number,
  steps: number,
  discardedTime: number,
  overloadFrames: number,
): ReturnType<TestApi['telemetry']> {
  return {
    fps: Math.round(telemetry.recentFps() * 10) / 10,
    p95: telemetry.recentP95(),
    results: telemetry.results,
    counters: { ...telemetry.counters },
    startup: { ...telemetry.startup },
    audioVoices,
    steps,
    discardedTime,
    overloadFrames,
  };
}

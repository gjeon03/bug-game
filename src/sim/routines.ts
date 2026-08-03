import { clamp01 } from '../core/math.ts';
import { t } from '../i18n/index.ts';
import { depositHeat } from './heat.ts';
import type { ResourceNode } from './types.ts';
import { zoneAt } from './territory.ts';
import type { World } from './world.ts';

/**
 * Household routines.
 *
 * These are the reason the kitchen feels occupied without animating a person. A routine is a *timed
 * opportunity with a price*: something valuable appears somewhere inconvenient, the room reacts, and
 * the player has to decide whether the haul is worth the evidence it will leave.
 *
 * Three, authored to be combinatorial rather than numerous. Each one has the full chain:
 * anticipation → telegraph → decision window → impact → persistent consequence → recovery.
 */

export type RoutineKind = 'snack' | 'dishes' | 'trash';
export type RoutinePhase = 'incoming' | 'active' | 'aftermath' | 'done';

export interface Routine {
  id: number;
  kind: RoutineKind;
  phase: RoutinePhase;
  /** Seconds left in the current phase. */
  timer: number;
  /** Total length of the current phase, for telegraph animation. */
  phaseLength: number;
  x: number;
  y: number;
  zoneId: string;
  /** Temporary resource this routine put on the floor, if any. */
  resourceId: string | null;
  /** Units the colony took out of this routine, for the payoff readout. */
  harvested: number;
  /** True once the colony has taken anything at all — what "exploited" means. */
  exploited: boolean;
  /** Extra room light this routine is casting, 0..1. */
  light: number;
  /** Radius of the denial area (soap, wiped floor) while active. */
  denyRadius: number;
  /** Seconds into the active phase at which the cleaning pass starts, or 0 once it has. */
  sweepAt: number;
}

export interface RoutineSpec {
  kind: RoutineKind;
  title: string;
  /** The anticipation line, shown while the routine is incoming. */
  warning: string;
  /** What the player should consider doing about it. */
  counterplay: string;
  x: number;
  y: number;
  incoming: number;
  active: number;
  aftermath: number;
  resourceKind: 'food' | 'water';
  amount: number;
  light: number;
  denyRadius: number;
  /** Evidence deposited into the region per second while the colony works it in the open. */
  heatPerSecond: number;
}

/**
 * Authored anchors. Each sits on a real fixture so the event is *somewhere the player can point at*,
 * and each is deliberately on ground with a different risk profile.
 */
export const ROUTINE_SPECS: readonly RoutineSpec[] = [
  {
    kind: 'snack',
    title: t('routine.snack.title'),
    warning: t('routine.snack.warning'),
    counterplay: t('routine.snack.counter'),
    x: 2530,
    y: 1020,
    // The window has to contain the walk.
    //
    // Measured by an independent critic: this anchor is 2 574 units from the home crack — 11.8 s
    // each way at scout speed — against a 34 s window, and laying the trail back is the slower half
    // of the trip. Seven of eight scripted runs died inside operation 2 without ever exploiting a
    // routine, and one attempt spent 35 s of a 34 s window. A timed opportunity the player cannot
    // physically reach is not a decision.
    incoming: 13,
    active: 46,
    aftermath: 12,
    resourceKind: 'food',
    amount: 260,
    light: 0.85,
    denyRadius: 0,
    heatPerSecond: 0.05,
  },
  {
    kind: 'dishes',
    title: t('routine.dishes.title'),
    warning: t('routine.dishes.warning'),
    counterplay: t('routine.dishes.counter'),
    x: 660,
    y: 1520,
    incoming: 11,
    active: 44,
    aftermath: 14,
    resourceKind: 'water',
    amount: 220,
    light: 0.35,
    denyRadius: 260,
    heatPerSecond: 0.03,
  },
  {
    kind: 'trash',
    title: t('routine.trash.title'),
    warning: t('routine.trash.warning'),
    counterplay: t('routine.trash.counter'),
    x: 2980,
    y: 2300,
    incoming: 13,
    active: 44,
    aftermath: 12,
    resourceKind: 'food',
    amount: 320,
    light: 0.5,
    denyRadius: 0,
    heatPerSecond: 0.07,
  },
] as const;

export function specFor(kind: RoutineKind): RoutineSpec {
  return ROUTINE_SPECS.find((s) => s.kind === kind) ?? ROUTINE_SPECS[0];
}

export function startRoutine(world: World, kind: RoutineKind): Routine | null {
  if (world.routines.some((r) => r.phase !== 'done')) return null;
  const spec = specFor(kind);
  const zone = zoneAt(spec.x, spec.y);
  const r: Routine = {
    id: world.nextId++,
    kind,
    phase: 'incoming',
    timer: spec.incoming,
    phaseLength: spec.incoming,
    x: spec.x,
    y: spec.y,
    zoneId: zone?.id ?? 'island',
    resourceId: null,
    harvested: 0,
    exploited: false,
    light: 0,
    denyRadius: 0,
    sweepAt: 0,
  };
  world.routines.push(r);
  world.events.push({ t: 'routineWarn', kind, x: r.x, y: r.y });
  return r;
}

function spawnRoutineResource(world: World, r: Routine): void {
  const spec = specFor(r.kind);
  const amount = spec.amount * world.traits.eventYieldMult;
  const node: ResourceNode = {
    id: `routine:${r.id}`,
    kind: spec.resourceKind,
    x: r.x,
    y: r.y,
    amount,
    initial: amount,
    unlockOp: 1,
    label: spec.title,
    depleted: false,
    depletedReported: false,
    busy: 0,
    disturbance: 0,
  };
  world.resources.push(node);
  r.resourceId = node.id;
}

function removeRoutineResource(world: World, r: Routine): void {
  if (!r.resourceId) return;
  const i = world.resources.findIndex((res) => res.id === r.resourceId);
  if (i >= 0) {
    const node = world.resources[i];
    r.harvested = node.initial - node.amount;
    r.exploited = r.harvested > 0.5;
    world.resources.splice(i, 1);
  }
  // Any worker still targeting it must be released, or it would stand at a source that is gone.
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive) continue;
    if (w.targetResource === r.resourceId) {
      w.targetResource = null;
      if (w.state === 'harvest' || w.state === 'queue') {
        w.state = w.carrying ? 'inbound' : 'idle';
        w.nodeIndex = -1;
      }
    }
  }
  // Delete the trail outright rather than leaving a dead one behind. A dead route still occupied one
  // of the player's few concurrent slots, so a run that opportunistically routed to two or three
  // household events silently evicted its own permanent supply lines and the colony starved with a
  // full map of trails it could not use. Found by playing it.
  for (let i = world.routes.length - 1; i >= 0; i--) {
    if (world.routes[i].resourceId !== r.resourceId) continue;
    const dead = world.routes[i];
    for (let w = 0; w < world.workers.length; w++) {
      const worker = world.workers[w];
      if (worker.alive && worker.routeId === dead.id) {
        worker.routeId = -1;
        worker.nodeIndex = -1;
        if (worker.state === 'outbound') worker.state = worker.carrying ? 'inbound' : 'idle';
      }
    }
    world.routes.splice(i, 1);
    world.hint = t('routine.gone');
    world.hintKey = `routineGone:${r.id}`;
    world.hintTime = 3.5;
  }
  r.resourceId = null;
}

export function updateRoutines(world: World, dt: number): void {
  for (let i = 0; i < world.routines.length; i++) {
    const r = world.routines[i];
    if (r.phase === 'done') continue;
    const spec = specFor(r.kind);
    r.timer -= dt;

    if (r.phase === 'incoming') {
      // Anticipation: the room begins to change before anything is dangerous, so the decision window
      // opens before the impact rather than at it.
      r.light = (1 - clamp01(r.timer / spec.incoming)) * spec.light * 0.4;
      if (r.timer <= 0) {
        r.phase = 'active';
        r.phaseLength = spec.active * world.traits.eventDurationMult;
        r.timer = r.phaseLength;
        r.light = spec.light;
        r.denyRadius = spec.denyRadius;
        r.sweepAt = r.phaseLength * 0.55;
        spawnRoutineResource(world, r);
        world.events.push({ t: 'routineStart', kind: r.kind, x: r.x, y: r.y });
      }
      continue;
    }

    if (r.phase === 'active') {
      // The wipe comes *after* the player has had a chance at the spill, not at the instant it
      // opens. Firing it on arrival sabotaged the only routine that was reachable at all.
      if (r.kind === 'dishes' && r.sweepAt > 0 && r.timer <= r.phaseLength - r.sweepAt) {
        r.sweepAt = 0;
        startSweep(world, r);
      }
      const node = r.resourceId
        ? world.resources.find((res) => res.id === r.resourceId)
        : undefined;
      if (node) {
        const taken = node.initial - node.amount;
        if (taken > 0.5 && !r.exploited) {
          r.exploited = true;
          world.stats.routinesExploited++;
          world.events.push({ t: 'routineTaken', kind: r.kind, x: r.x, y: r.y });
        }
        if (node.busy > 0) {
          // Working a household event in the open is exactly the trade the player agreed to.
          depositHeat(
            world,
            r.x,
            r.y,
            spec.heatPerSecond * node.busy * dt * world.traits.openEventEvidenceMult,
          );
        }
      }
      // The light ramps down over the last three seconds so the closing door is legible.
      r.light = spec.light * clamp01(r.timer / 3);
      if (r.timer <= 0) {
        r.phase = 'aftermath';
        r.phaseLength = spec.aftermath;
        r.timer = spec.aftermath;
        r.denyRadius = 0;
        removeRoutineResource(world, r);
        world.events.push({ t: 'routineEnd', kind: r.kind, x: r.x, y: r.y, took: r.harvested });
      }
      continue;
    }

    // Aftermath: the persistent consequence. The household has been here; the region remembers it,
    // and so does the player's map.
    r.light = 0;
    if (r.timer <= 0) {
      r.phase = 'done';
      if (r.exploited) depositHeat(world, r.x, r.y, 0.14);
    }
  }

  if (world.routines.length > 6) world.routines.splice(0, world.routines.length - 6);
}

/** The routine the player should currently be reacting to, if any. */
export function activeRoutine(world: World): Routine | null {
  for (let i = 0; i < world.routines.length; i++) {
    const r = world.routines[i];
    if (r.phase === 'incoming' || r.phase === 'active') return r;
  }
  return null;
}

export function routinesExploited(world: World): number {
  return world.routines.filter((r) => r.exploited).length;
}

/* ── Cleaning sweep ────────────────────────────────────────────────────────── */

/**
 * A cloth/mop pass that follows the washing-up routine.
 *
 * This is the route-changing threat: it erases pheromone along its path, pushes roaches out of the
 * way rather than killing them outright, and leaves a wiped stripe the colony has to re-cross. It is
 * also spawned directly by the household director at higher alert, aimed at the hottest region.
 */
export interface Sweep {
  id: number;
  path: { x: number; y: number }[];
  seg: number;
  t: number;
  speed: number;
  x: number;
  y: number;
  radius: number;
  /** Seconds of warning left before it starts moving. */
  warn: number;
  warnTotal: number;
  life: number;
}

export const SWEEP_RADIUS = 120;
export const SWEEP_WARN = 2.2;

export function spawnSweep(
  world: World,
  path: { x: number; y: number }[],
  speed = 210,
): Sweep | null {
  if (world.sweeps.length >= 2 || path.length < 2) return null;
  const s: Sweep = {
    id: world.nextId++,
    path,
    seg: 0,
    t: 0,
    speed,
    x: path[0].x,
    y: path[0].y,
    radius: SWEEP_RADIUS,
    warn: SWEEP_WARN,
    warnTotal: SWEEP_WARN,
    life: 0,
  };
  world.sweeps.push(s);
  world.events.push({ t: 'sweepWarn', x: s.x, y: s.y });
  return s;
}

function startSweep(world: World, r: Routine): void {
  // The washing-up wipe runs the length of the sink run, which is where the player's first water
  // line almost always is. Losing it is the lesson that a route is a thing you maintain.
  spawnSweep(world, [
    { x: r.x - 40, y: r.y - 380 },
    { x: r.x - 20, y: r.y + 180 },
    { x: r.x + 220, y: r.y + 420 },
  ]);
}

export function updateSweeps(world: World, dt: number): void {
  for (let i = world.sweeps.length - 1; i >= 0; i--) {
    const s = world.sweeps[i];

    // Telegraph first, always. Nothing in this game may take a roach without warning it.
    if (s.warn > 0) {
      s.warn -= dt;
      if (s.warn <= 0) world.events.push({ t: 'sweepStart', x: s.x, y: s.y });
      continue;
    }

    s.life += dt;
    const a = s.path[s.seg];
    const b = s.path[s.seg + 1];
    if (!b) {
      world.sweeps.splice(i, 1);
      continue;
    }
    const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    s.t += (s.speed * dt) / len;
    while (s.t >= 1) {
      s.t -= 1;
      s.seg++;
      if (s.seg >= s.path.length - 1) {
        world.events.push({ t: 'sweepEnd', x: s.x, y: s.y });
        world.sweeps.splice(i, 1);
        break;
      }
    }
    if (s.seg >= s.path.length - 1) continue;
    const p = s.path[s.seg];
    const q = s.path[s.seg + 1];
    s.x = p.x + (q.x - p.x) * s.t;
    s.y = p.y + (q.y - p.y) * s.t;

    // Scent is wiped away where the cloth passes. This is the sweep's whole point: it does not kill
    // the colony, it deletes the colony's map and makes the player draw a new one.
    let wiped = 0;
    for (let r = 0; r < world.routes.length; r++) {
      const nodes = world.routes[r].nodes;
      for (let n = 0; n < nodes.length; n++) {
        const node = nodes[n];
        const dx = node.x - s.x;
        const dy = node.y - s.y;
        if (dx * dx + dy * dy > s.radius * s.radius) continue;
        node.life -= 190 * dt;
        wiped++;
      }
    }
    if (wiped > 0) world.sweepWiping = 0.4;

    // Roaches are shoved clear rather than killed — a wipe you can survive but not ignore.
    for (let w = 0; w < world.workers.length; w++) {
      const worker = world.workers[w];
      if (!worker.alive || worker.state === 'trapped') continue;
      const dx = worker.x - s.x;
      const dy = worker.y - s.y;
      const d2 = dx * dx + dy * dy;
      const reach = s.radius + 70;
      if (d2 > reach * reach) continue;
      if (worker.state !== 'panic') {
        worker.state = 'panic';
        worker.panicTime = 1.6;
        worker.nodeIndex = -1;
      }
      const d = Math.max(1, Math.sqrt(d2));
      worker.vx += (dx / d) * 240 * dt * 6;
      worker.vy += (dy / d) * 240 * dt * 6;
    }

    const sx = world.scout.x - s.x;
    const sy = world.scout.y - s.y;
    if (sx * sx + sy * sy < s.radius * s.radius) {
      const d = Math.max(1, Math.hypot(sx, sy));
      world.scout.vx += (sx / d) * 900 * dt;
      world.scout.vy += (sy / d) * 900 * dt;
      world.scout.spotted = Math.min(1, world.scout.spotted + 0.25 * dt);
    }
  }
  world.sweepWiping = Math.max(0, world.sweepWiping - dt);
}

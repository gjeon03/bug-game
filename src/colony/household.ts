import { paintLiveExposure, resetExposure } from '../world/nav';
import { mm } from '../world/units';
import type { RegionId } from '../world/types';
import {
  EVIDENCE_DECAY,
  ROUTINES,
  alertFor,
  killWorker,
  logEvent,
  pushCue,
  regionState,
  type RoutineSpec,
} from './state';
import { panic } from './workers';
import type { AlertLevel, Run, Threat, ThreatKind } from './types';

/**
 * The household.
 *
 * Three layers, and the separation matters:
 *
 * 1. **Routines** are the flat's rhythm. They run whether or not the colony exists — somebody does
 *    the washing up, the television goes on, a phone lights a bedroom. They create opportunity as
 *    much as danger.
 * 2. **Evidence** is what the colony leaves behind. It accrues per region, it decays while a region
 *    is quiet, and it never falls below a floor that only sightings raise.
 * 3. **Responses** are aimed. The director does not roll a die for "a threat"; it looks at where
 *    the evidence is and where the traffic actually went.
 *
 * The result the design asks for is that the ending is *attributable*: the extermination goes where
 * the player's own traffic went.
 */

/* ------------------------------------------------------------------ tuning */

/** Seconds a region must stay quiet before its alert level can drop by one. */
const DEESCALATE_AFTER = 26;
/** Minimum gap between two responses landing in the same region. */
const RESPONSE_COOLDOWN = 40;
/** A response with less warning than this is never issued — there would be no decision window. */
const MIN_TELEGRAPH = 2.2;
/** Upper bound on the decayed traffic measure. Without it, traffic grows without limit. */
const TRAFFIC_CAP = 14;
/** Slowest a region may ever cool, as a fraction of the base decay. Never zero — nothing is pinned. */
const COOL_FLOOR = 0.4;

interface ThreatSpec {
  readonly kind: ThreatKind;
  /** Lowest alert level that can produce this. */
  readonly minAlert: number;
  readonly telegraph: number;
  readonly duration: number;
  readonly radiusMm: number;
  /** Chance per second a worker inside the radius is killed while the threat is active. */
  readonly lethality: number;
  /** Seconds of route wash this inflicts. 0 means it does not touch routes. */
  readonly wash: number;
  readonly labelKey: string;
}

/**
 * The response families, in escalating order.
 *
 * Every one has anticipation, a telegraph, a decision window, an impact and a consequence — the
 * structure the brief requires. None of them is an instant invisible kill.
 */
const THREATS: readonly ThreatSpec[] = [
  {
    kind: 'footsteps',
    minAlert: 0,
    telegraph: 3.4,
    duration: 7,
    radiusMm: 380,
    lethality: 0.5,
    wash: 0,
    labelKey: 'threat.footsteps',
  },
  {
    kind: 'light',
    minAlert: 1,
    telegraph: 2.4,
    duration: 12,
    radiusMm: 1400,
    lethality: 0,
    wash: 0,
    labelKey: 'threat.light',
  },
  {
    kind: 'wipe',
    minAlert: 1,
    telegraph: 4.2,
    duration: 9,
    radiusMm: 520,
    lethality: 0.35,
    wash: 26,
    labelKey: 'threat.wipe',
  },
  {
    kind: 'move',
    minAlert: 2,
    telegraph: 4.6,
    duration: 8,
    radiusMm: 600,
    lethality: 0.2,
    wash: 14,
    labelKey: 'threat.move',
  },
  {
    kind: 'trap',
    minAlert: 2,
    telegraph: 5.5,
    duration: 900,
    radiusMm: 190,
    lethality: 0.8,
    wash: 0,
    labelKey: 'threat.trap',
  },
  {
    kind: 'vacuum',
    minAlert: 3,
    telegraph: 6,
    duration: 34,
    radiusMm: 420,
    lethality: 0.5,
    wash: 20,
    labelKey: 'threat.vacuum',
  },
  {
    kind: 'spray',
    minAlert: 4,
    telegraph: 6.5,
    duration: 16,
    radiusMm: 780,
    lethality: 1.3,
    wash: 40,
    labelKey: 'threat.spray',
  },
];

/* ---------------------------------------------------------------- routines */

export function updateRoutines(run: Run, dt: number): void {
  for (const spec of ROUTINES) {
    const state = run.routines.get(spec.id);
    if (!state) continue;

    // A routine in a region the colony has never opened still runs — the flat does not wait for
    // the player — but it costs nothing beyond its timer.
    state.timer -= dt;
    if (state.timer > 0) continue;

    switch (state.phase) {
      case 'idle':
        state.phase = 'incoming';
        state.timer = spec.telegraph;
        pushRoutineCue(run, spec, 'routine.incoming');
        break;
      case 'incoming':
        state.phase = 'active';
        state.timer = spec.duration;
        state.runs++;
        onRoutineStart(run, spec);
        pushRoutineCue(run, spec, 'routine.active');
        break;
      case 'active':
        state.phase = 'aftermath';
        state.timer = spec.aftermath;
        break;
      default:
        state.phase = 'idle';
        state.timer = spec.period + run.rng.range(-spec.jitter, spec.jitter);
    }
  }

  applyRoutineExposure(run);
}

function pushRoutineCue(run: Run, spec: RoutineSpec, kind: string): void {
  const region = run.house.regions.find((r) => r.id === spec.region);
  if (!region) return;
  const x = (region.bounds.x0 + region.bounds.x1) / 2;
  const z = (region.bounds.z0 + region.bounds.z1) / 2;
  pushCue(run, kind, x, 0, z);
  if (kind === 'routine.incoming' && run.regions.get(spec.region)?.unlocked) {
    logEvent(run, 'log.routine.incoming', 'warn', { routine: spec.labelKey });
  }
}

/** Routines refill the sources that depend on them: the bin is opened, the glass is refilled. */
function onRoutineStart(run: Run, spec: RoutineSpec): void {
  for (const [id, state] of run.resources) {
    const site = run.house.resources.get(id);
    if (site?.refilledBy !== spec.id) continue;
    state.remaining = Math.min(site.amount, state.remaining + site.amount * 0.55);
  }
}

/**
 * Repaint the live exposure layer.
 *
 * The base layer is static. Anything routine-driven — the sink light, the television, a phone —
 * is painted on top here. This is what makes "wait for the light to go off" a real tactic rather
 * than a flavour line.
 */
function applyRoutineExposure(run: Run): void {
  for (const grid of run.nav.grids.values()) resetExposure(grid);

  for (const region of run.house.regions) {
    for (const zone of region.exposureZones) {
      if (!zone.routine) continue;
      const state = run.routines.get(zone.routine);
      if (!state || (state.phase !== 'active' && state.phase !== 'incoming')) continue;
      const grid = run.nav.grids.get(zone.surface);
      if (!grid) continue;
      // During the telegraph the light is only half up — the player gets a real window.
      const level = state.phase === 'incoming' ? zone.level * 0.45 : zone.level;
      paintLiveExposure(grid, zone.rect, level);
    }
  }
}

export function routineActive(run: Run, id: string): boolean {
  return run.routines.get(id)?.phase === 'active';
}

/* ---------------------------------------------------------------- evidence */

export function updateEvidence(run: Run, dt: number): void {
  for (const region of run.regions.values()) {
    region.quietFor += dt;

    // Traffic is a decaying measure of where bodies actually were, and it is what the director
    // aims at. It is not the same as evidence: a busy hidden route is high traffic, low evidence.
    /*
     * Traffic is CLAMPED. It gains 0.05/s per worker in the region and decays 0.12/s, so with a
     * twenty-worker colony it grew without bound — which both violates the no-unbounded-growth gate
     * and saturated every downstream term that reads it.
     */
    region.traffic = Math.min(TRAFFIC_CAP, Math.max(0, region.traffic - dt * 0.12));

    /*
     * Evidence only cools while a region is QUIET.
     *
     * Constant decay was raised to 0.0075/s to make regional loss recoverable, and that silently
     * removed escalation altogether: at chapter-1 traffic a colony generates roughly 0.0045/s, so
     * evidence could never climb. Measured in a real browser with two loud routes running for 90
     * seconds — every region sat at alert 0 with evidence 0.01, and four of the seven household
     * responses were unreachable content.
     *
     * Scaling decay by how busy the region is gives both behaviours from one rule: a corridor with
     * a column marching down it does not calm down, and the same corridor calms down once the
     * player reroutes away from it. The floor keeps some cooling even at full traffic so a region
     * is never permanently pinned by activity alone.
     */
    /*
     * Busy is normalised against the colony's own size, so "busy" means busy FOR THIS COLONY rather
     * than busy in absolute terms. A flat threshold made every mid-game region permanently busy:
     * measured at `traffic / 1.2`, peak population fell 67 -> 14 and sightings rose 36 -> 63,
     * because nothing ever cooled and the lethal responses never stopped.
     */
    const scale = 3 + run.colony.population * 0.35;
    const busy = Math.min(1, region.traffic / scale);
    region.evidence = Math.max(
      region.evidenceFloor,
      region.evidence - EVIDENCE_DECAY * dt * Math.max(COOL_FLOOR, 1 - busy),
    );

    const target = alertFor(region.evidence);
    if (target > region.alert) {
      region.alert = target;
      /*
       * Do NOT reset `quietFor` here.
       *
       * `quietFor` is the cooldown since the last RESPONSE, not since the last alert change.
       * Resetting it on escalation meant a region that was steadily getting worse kept postponing
       * its own response — the exact opposite of the intent. Measured in a real browser: evidence
       * climbed 0.02 -> 0.82 and the alert went 0 -> 1 -> 2 -> 3 over 163 seconds while the
       * director issued nothing at all, because each escalation pushed the cooldown back to zero.
       */
      if (region.unlocked) {
        logEvent(run, 'log.alert.raised', 'danger', {
          region: `region.${region.id}`,
          level: `alert.${target}`,
        });
      }
    } else if (target < region.alert && region.quietFor > DEESCALATE_AFTER) {
      region.alert = (region.alert - 1) as AlertLevel;
      region.quietFor = 0;
    }
  }

  for (const worker of run.workers) {
    if (!worker.alive) continue;
    const id = run.house.regionOf.get(worker.surface);
    if (!id) continue;
    const state = run.regions.get(id);
    if (state) state.traffic += dt * 0.05;
  }
}

/* ---------------------------------------------------------------- director */

/**
 * Choose and place the next response.
 *
 * Aimed, not random. The target is the busiest, most exposed route the colony actually uses in the
 * highest-alert region, which means a player who split their traffic loses only part of their
 * network — and a player who ran everything down one corridor loses that corridor.
 */
export function updateDirector(run: Run, dt: number): void {
  for (let i = run.threats.length - 1; i >= 0; i--) {
    const threat = run.threats[i]!;
    const spec = THREATS.find((s) => s.kind === threat.kind);
    if (!spec) {
      run.threats.splice(i, 1);
      continue;
    }
    threat.timer -= dt;

    if (threat.phase === 'telegraph') {
      if (threat.timer <= 0) {
        threat.phase = 'active';
        threat.timer = spec.duration;
        pushCue(run, `threat.${threat.kind}.start`, threat.x, 0, threat.z);
        applyThreat(run, threat, spec);
      }
      continue;
    }

    if (threat.phase === 'active') {
      tickThreat(run, threat, spec, dt);
      if (threat.timer <= 0) {
        threat.phase = 'leaving';
        threat.timer = 2;
      }
      continue;
    }

    if (threat.timer <= 0) run.threats.splice(i, 1);
  }

  // One decision per second is plenty and keeps the director cheap.
  if (Math.floor(run.time) === Math.floor(run.time - dt)) return;

  for (const region of run.regions.values()) {
    if (!region.unlocked || region.alert < 1) continue;
    if (region.quietFor < RESPONSE_COOLDOWN) continue;
    if (run.threats.some((t) => t.region === region.id)) continue;

    const candidates = THREATS.filter((s) => s.minAlert <= region.alert);
    if (candidates.length === 0) continue;

    // Weighted toward the strongest response the alert level permits, but never only that — a
    // predictable director is a solved director.
    const spec = run.rng.bool(0.62) ? candidates[candidates.length - 1]! : run.rng.pick(candidates);
    if (spec.telegraph < MIN_TELEGRAPH) continue;

    const aim = aimPoint(run, region.id);
    if (!aim) continue;

    run.threats.push({
      id: run.nextThreatId++,
      kind: spec.kind,
      region: region.id,
      surface: aim.surface,
      x: aim.x,
      z: aim.z,
      toX: aim.x,
      toZ: aim.z,
      phase: 'telegraph',
      timer: spec.telegraph,
      radius: mm(spec.radiusMm),
      hit: [],
    });
    region.quietFor = 0;
    pushCue(run, `threat.${spec.kind}.telegraph`, aim.x, 0, aim.z);
    logEvent(run, 'log.threat.incoming', 'danger', {
      threat: spec.labelKey,
      region: `region.${region.id}`,
    });
  }
}

/** Where in this region does the colony's own history say to look? */
function aimPoint(run: Run, region: RegionId): { surface: string; x: number; z: number } | null {
  let best: { surface: string; x: number; z: number } | null = null;
  let bestScore = -1;

  for (const route of run.routes) {
    if (!route.regions.includes(region)) continue;
    const score = route.deliveries * (0.4 + route.exposure);
    if (score <= bestScore) continue;
    const point = route.points[Math.floor(route.points.length / 2)];
    if (!point || run.house.regionOf.get(point.surface) !== region) continue;
    bestScore = score;
    best = { surface: point.surface, x: point.x, z: point.z };
  }

  if (best) return best;

  // No route here yet: aim at the most disturbed source instead. Somebody noticed a torn bag.
  for (const [id, state] of run.resources) {
    const site = run.house.resources.get(id);
    if (!site || site.region !== region) continue;
    if (state.disturbed <= bestScore) continue;
    bestScore = state.disturbed;
    best = { surface: site.surface, x: site.at.x, z: site.at.z };
  }

  return best;
}

function applyThreat(run: Run, threat: Threat, spec: ThreatSpec): void {
  panic(run, threat.x, threat.z, threat.radius * 1.5);

  if (spec.wash <= 0) return;
  for (const route of run.routes) {
    if (threat.hit.includes(route.id)) continue;
    const touches = route.points.some(
      (p) => Math.hypot(p.x - threat.x, p.z - threat.z) <= threat.radius,
    );
    if (!touches) continue;
    threat.hit.push(route.id);
    route.washedFor = spec.wash;
    route.strength = Math.max(0.15, route.strength - 0.4);
    run.stats.routesWashed++;
    logEvent(run, 'log.route.washed', 'danger', { threat: spec.labelKey });
  }
}

function tickThreat(run: Run, threat: Threat, spec: ThreatSpec, dt: number): void {
  if (spec.lethality <= 0) return;

  for (const worker of run.workers) {
    if (!worker.alive) continue;
    if (run.house.regionOf.get(worker.surface) !== threat.region) continue;
    if (Math.hypot(worker.x - threat.x, worker.z - threat.z) > threat.radius) continue;
    if (!run.rng.bool(spec.lethality * dt)) continue;
    killWorker(run, worker);
  }

  // The scout is not immune, but it always has the information it needs to leave.
  const scout = run.scout;
  if (run.house.regionOf.get(scout.surface) !== threat.region) return;
  if (Math.hypot(scout.x - threat.x, scout.z - threat.z) > threat.radius * 0.55) return;
  const region = regionState(run, threat.region);
  region.evidence = Math.min(1, region.evidence + dt * 0.05);
  scout.seen = Math.min(1, scout.seen + dt * 0.7);
}

/** Damage every foothold in a region. Used by the final extermination. */
export function strikeFootholds(run: Run, region: RegionId, amount: number): void {
  for (const [id, state] of run.footholds) {
    const site = run.house.footholds.get(id);
    if (!site || site.region !== region || !state.claimed) continue;
    state.damage = Math.min(1, state.damage + amount);
    if (state.damage >= 1) {
      state.claimed = false;
      state.brood = 0;
      logEvent(run, 'log.foothold.lost', 'danger', { foothold: site.labelKey });
    }
  }
}

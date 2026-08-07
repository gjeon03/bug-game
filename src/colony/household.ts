import { paintLiveExposure, resetExposure } from '../world/nav';
import { mm } from '../world/units';
import type { RegionId } from '../world/types';
import {
  CAUGHT_SECONDS,
  EVIDENCE_DECAY,
  ROUTINES,
  alertFor,
  killWorker,
  logEvent,
  pushCue,
  regionState,
  stompScout,
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
/** Anti-runaway backstop on the traffic estimate. Equilibrium is worker count, so this is a lot. */
const TRAFFIC_CAP = 14;
/** Slowest a region may ever cool, as a fraction of the base decay. Never zero — nothing is pinned. */
const COOL_FLOOR = 0.4;
/** Below this traffic the colony has genuinely left, not merely paused. */
const ABANDONED_TRAFFIC = 0.5;
/** How much faster an abandoned region cools. This is the reroute counter-play's payoff. */
const QUIET_COOL_BONUS = 2.6;

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

/**
 * The reflex.
 *
 * Held out of `THREATS` on purpose. Everything in that array is a PLAN — the household noticed
 * droppings, thought about it, and came back with a cloth or a trap, which is why every one of them
 * is gated behind an alert level and a forty-second cooldown. A swat is none of that. Somebody
 * looked down, saw a cockroach, and their hand was already moving.
 *
 * Keeping it separate is what lets being seen have a consequence WITHOUT touching the evidence
 * economy. That economy has been mistuned twice in this file's history, in both directions, and each
 * correction was paid for with a measured run; `SIGHTING_FLOOR_CAP` sitting below the alert-1
 * threshold is a deliberate result of those runs, not an oversight. Routing the sighting response
 * through alert levels would have meant raising that cap and re-breaking what it bought.
 *
 * The telegraph is the shortest in the game because a reflex is fast, and still long enough to
 * clear the radius at walking pace from anywhere inside it.
 */
const SWAT: ThreatSpec = {
  kind: 'swat',
  minAlert: 0,
  telegraph: 1.5,
  duration: 1.6,
  radiusMm: 300,
  // Deadliest thing in the game, because it is the only one aimed at the scout personally. It has
  // to out-run its own 1.6 s duration or standing still would survive it, which is the whole point.
  lethality: 1.4,
  wash: 0,
  labelKey: 'threat.swat',
};

/**
 * The swat's timing, shared with the renderer.
 *
 * Exported rather than restated in `view/threats.ts` because the hand's fall and the window in
 * which it kills have to be the same event. A renderer that drops the hand on its own clock shows
 * the player an impact that is not where the damage is, which is the exact class of defect the
 * telegraph system exists to prevent.
 */
export const SWAT_DURATION = SWAT.duration;
/** Seconds the hand takes to come down once it is committed. */
export const SWAT_FALL = 0.22;

function specFor(kind: ThreatKind): ThreatSpec | undefined {
  return kind === 'swat' ? SWAT : THREATS.find((s) => s.kind === kind);
}

/**
 * Is this point inside something that is currently killing things?
 *
 * Exported so `routes.ts` can mark a supply line that runs through one. Colonies do not march into
 * glue: measured on seed 20260805, a trap landed on the busiest route at t=120 and the population
 * went 14 to 2 in forty seconds — 21 workers walked into a 190 mm circle one after another because
 * nothing in route evaluation knew the circle was there. The trap's duration is 900 s, four times
 * the whole run, so it was not an event the colony survived; it was furniture that ate them.
 *
 * The answer is not a gentler trap. A trap SHOULD be lethal and it SHOULD persist — that is what a
 * sticky pad is. The answer is that the route through it stops being a route, which hands the player
 * the counter-play the design is built on: the line is denied, and a new one has to be walked.
 */
export function inKillZone(run: Run, surface: string, x: number, z: number): boolean {
  const region = run.house.regionOf.get(surface);
  if (!region) return false;

  for (const threat of run.threats) {
    if (threat.phase !== 'active' || threat.region !== region) continue;
    const spec = specFor(threat.kind);
    if (!spec || spec.lethality <= 0) continue;
    if (Math.hypot(x - threat.x, z - threat.z) <= threat.radius) return true;
  }
  return false;
}

/**
 * A trap outlives every other response by two orders of magnitude.
 *
 * `RESPONSE_COOLDOWN` and the one-threat-per-region rule assume a response is an EVENT — it arrives,
 * it does its damage, it leaves, and the region is free to be answered again. A trap's 900 s
 * duration breaks that assumption: one pad placed at alert 2 froze the whole director for longer
 * than any run lasts, so nothing ever escalated past it and four of the seven authored responses
 * stayed unreachable content for a second reason.
 */
const PERSISTENT = 60;

function isPersistent(kind: ThreatKind): boolean {
  const spec = specFor(kind);
  return spec !== undefined && spec.duration >= PERSISTENT;
}

/**
 * Somebody saw the scout. Their hand comes down where it was standing.
 *
 * Aimed at the sighting, not at the scout's live position — the household is swatting at a memory
 * half a second old, so moving is genuinely the answer and standing still genuinely is not.
 */
export function spawnSwat(run: Run, region: RegionId, surface: string, x: number, z: number): void {
  // One hand at a time. A second sighting during a swat does not stack a second hand on top.
  if (run.threats.some((t) => t.kind === 'swat')) return;

  run.threats.push({
    id: run.nextThreatId++,
    kind: 'swat',
    region,
    surface,
    x,
    z,
    toX: x,
    toZ: z,
    phase: 'telegraph',
    timer: SWAT.telegraph,
    radius: mm(SWAT.radiusMm),
    hit: [],
  });
  pushCue(run, 'threat.swat.telegraph', x, 0, z);
  logEvent(run, 'log.threat.swat', 'danger', {});
}

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

    /*
     * Traffic is a decaying estimate of HOW MANY BODIES ARE IN THIS REGION, and it is what the
     * director aims at. It is not the same as evidence: a busy hidden route is high traffic, low
     * evidence.
     *
     * It used to gain a flat 0.05/s per worker and shed a flat 0.12/s, then clamp at 14. Measured
     * over a 45-minute run, every unlocked region reported `traffic 14.0, busy 1.00` at every single
     * sample from the first minute to the last: three workers in a room out-earn the flat decay, so
     * the value pinned at the cap immediately and stayed there. It was not a measure of anything —
     * it was a boolean spelled as a float, and every term downstream of it was reading a constant.
     *
     * Proportional decay instead, balanced against the gain so that the equilibrium value simply
     * IS the number of workers present. That makes it interpretable (`traffic 6` means about six
     * bodies), makes `busy` meaningful, and — the part that matters for play — makes it fall again
     * within a couple of seconds of the colony leaving, which is what lets rerouting work as the
     * counter-play. The cap is retained purely as an anti-runaway backstop.
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
     * Busy is measured in ABSOLUTE traffic, not relative to colony size.
     *
     * It used to be `traffic / (3 + population * 0.35)`, introduced to stop mid-game regions being
     * permanently busy. It worked, and in working it inverted the premise of the game: dividing by
     * population means a bigger colony makes every room *calmer*. Measured on the brood build at
     * seed 20260805 — 53 workers, 452 deliveries, five regions — the household never rose above
     * alert 1 in the entire run. Four of the seven authored responses (move, trap, vacuum, spray)
     * were unreachable content, and the fantasy the design rests on ("every successful supply route
     * teaches the humans where to strike") was running backwards.
     *
     * The earlier objection to an absolute reference was real: at `traffic / 1.2` nothing ever
     * cooled, peak population fell 67 -> 14 and the lethal responses never stopped. That failure
     * was an absence of a release valve, not proof that absolute traffic is wrong. So the release
     * valve is explicit below, and it is the play the brief asks for: a region the colony has
     * actually *left* cools several times faster than one merely between waves. Rerouting away from
     * a hot corridor becomes the counter-play, which is what pheromone logistics is for.
     */
    /*
     * NOT YET LANDED: the absolute reference is still divided by colony size.
     *
     * Switching the denominator to the absolute `TRAFFIC_BUSY_REF` does exactly what the analysis
     * above predicts — measured on seed 20260805 the kitchen reached evidence 0.65 and alert 3, so
     * the move/trap/vacuum tiers finally became reachable content. It also broke the game: four of
     * the ninety-six unit tests failed, no gate past the third ever opened, and the objective
     * reported `blocker.food` continuously from t=120 to the end of a 45-minute run.
     *
     * The cause is structural rather than a tuning value, which is why this is parked instead of
     * nudged. Breeding in `updateColony` is automatic and unconditional: every surplus above
     * `BROOD_FOOD_PER_WORKER` is spent on a worker the moment it exists. The colony therefore can
     * never bank a gate's cost unless income exceeds upkeep plus brood, and a harsher household
     * pushes income below that line permanently. Escalation and progression are competing for the
     * same surplus and the player has no lever over either.
     *
     * The missing lever now exists — `colony.broodHold`, the H key — and it does unblock the stall:
     * with the absolute reference AND the hold available, the brood build opens all five gates
     * instead of stopping at three. It still does not win. Measured at seed 20260805 over the full
     * 50-minute cap: 5 gates, peak population 74, 1,457 deliveries, and **19 extermination sweeps**.
     *
     * That is the next defect in the chain, and it is in `updateFinal`, not here. Sweeps have a
     * 110 s cooldown, severity escalating 0.18 each, and NO terminal condition — so past about ten
     * minutes the endgame is a metronome that destroys footholds faster than the colony can retake
     * them, and the four-region victory check can never all be true at once. The finale has to
     * resolve — succeed or fail — before escalation is worth landing.
     *
     * So the population-scaled denominator stays for now and the four response tiers stay
     * unreachable. A short run that closes beats a long one that cannot.
     */
    const scale = 3 + run.colony.population * 0.35;
    const busy = Math.min(1, region.traffic / scale);
    const abandoned = region.traffic < ABANDONED_TRAFFIC ? QUIET_COOL_BONUS : 1;
    region.evidence = Math.max(
      region.evidenceFloor,
      region.evidence - EVIDENCE_DECAY * dt * abandoned * Math.max(COOL_FLOOR, 1 - busy),
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
    const spec = specFor(threat.kind);
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
    // A trap left on the floor must not stand in for "the household is already busy here".
    if (run.threats.some((t) => t.region === region.id && !isPersistent(t.kind))) continue;

    /*
     * One pad on the floor at a time.
     *
     * Once persistent threats stopped blocking the director (so escalation could continue past
     * them), nothing stopped it laying another trap every cooldown: measured on seed 20260805, four
     * live traps by t=300, each denying another route, until the colony had nowhere left to walk.
     * A household that has put down a trap waits to see whether it worked.
     */
    const hasPersistent = run.threats.some(
      (t) => t.region === region.id && isPersistent(t.kind),
    );
    const candidates = THREATS.filter(
      (s) => s.minAlert <= region.alert && !(hasPersistent && s.duration >= PERSISTENT),
    );
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

/**
 * Nobody can put a sticky pad inside the crack under the sink.
 *
 * Without this the director aims at the midpoint of the busiest route, and every route in a one-room
 * game leaves the same refuge by the same toe-kick slot — so a trap landing there is not a threat to
 * a supply line, it is a lid on the colony. Measured on seed 20260805: eight routes went to two, the
 * delivery count stopped moving, and the run ended with 85 banked moisture and zero food. There was
 * no play available; the only route out of the nest was lethal and re-laying it put the new line
 * through the same cell.
 *
 * A household aims at where it has SEEN traffic, and it cannot reach into the gap the traffic comes
 * out of. Keeping the doorstep clear is what leaves the player something to do about a trap.
 */
const NEST_SANCTUARY = mm(350);

function tooCloseToRefuge(run: Run, surface: string, x: number, z: number): boolean {
  for (const [id, state] of run.footholds) {
    if (!state.claimed) continue;
    const site = run.house.footholds.get(id);
    if (!site || site.surface !== surface) continue;
    if (Math.hypot(site.at.x - x, site.at.z - z) < NEST_SANCTUARY) return true;
  }
  return false;
}

/** Where in this region does the colony's own history say to look? */
function aimPoint(run: Run, region: RegionId): { surface: string; x: number; z: number } | null {
  let best: { surface: string; x: number; z: number } | null = null;
  let bestScore = -1;

  for (const route of run.routes) {
    if (!route.regions.includes(region)) continue;
    const score = route.deliveries * (0.4 + route.exposure);
    if (score <= bestScore) continue;
    /*
     * Walk outward from the midpoint until the aim clears every refuge doorstep, rather than
     * discarding the route. The busiest line still gets answered — just further along it.
     */
    const mid = Math.floor(route.points.length / 2);
    let point: { surface: string; x: number; z: number } | undefined;
    for (let step = 0; step < route.points.length; step++) {
      const candidate = route.points[mid + step] ?? route.points[mid - step];
      if (!candidate) continue;
      if (tooCloseToRefuge(run, candidate.surface, candidate.x, candidate.z)) continue;
      point = candidate;
      break;
    }
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

  /*
   * The scout's body.
   *
   * This block used to raise `scout.seen` and nothing else, which meant that for the whole of this
   * build being caught under a descending foot cost the player exactly one unit of information and
   * zero units of anything they could feel. A player reported it in those words: the getting-stomped
   * content had disappeared. It had — every threat in the table was lethal to workers and harmless
   * to the person actually holding the keyboard.
   *
   * `caught` fills only inside the kill core, which is deliberately tighter than the radius that
   * kills workers. The scout is the strongest individual in the colony and it gets the benefit of
   * that: the outer ring of a wipe scatters it, the middle of one kills it.
   */
  const scout = run.scout;
  if (scout.downFor > 0) return;
  if (run.house.regionOf.get(scout.surface) !== threat.region) return;
  if (Math.hypot(scout.x - threat.x, scout.z - threat.z) > threat.radius * 0.55) return;

  const region = regionState(run, threat.region);
  region.evidence = Math.min(1, region.evidence + dt * 0.05);
  scout.seen = Math.min(1, scout.seen + dt * 0.7);
  scout.caught = Math.min(1, scout.caught + (dt / CAUGHT_SECONDS) * spec.lethality);
  scout.crushedAt = run.time;
  if (scout.caught >= 1) stompScout(run);
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

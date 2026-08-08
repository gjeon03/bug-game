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

    /*
     * A routine in a region the colony has never OPENED still runs — the flat does not wait for the
     * player. A routine in a region that does not EXIST is a different thing, and it was being
     * treated the same.
     *
     * `ROUTINES` still lists seven entries for the living room, bathroom and bedroom. Those regions
     * are sealed out of `REGIONS` entirely, so `run.house.regions` has no entry for them: their
     * exposure zones land nowhere, their resource refills match nothing, and `pushRoutineCue` bails
     * on the missing region. What they do reach is the director's schedule, which it spends on
     * rooms the player cannot walk to. Measured: fifteen routines fire in a four-minute run and
     * nine of them are for rooms that are not in the build.
     *
     * Skipped rather than deleted, because `SEALED_REGIONS` is a reactivation list and these come
     * back with their rooms. The test is whether the room is assembled, not whether it is unlocked.
     *
     * A first attempt at this was reverted on three seeds that showed it "breaking the game"
     * (COMPLETION_RECOVERY.md §28). That was wrong: removing nine RNG consumers reshuffles a seeded
     * deterministic stream, so three seeds cannot separate effect from reseeding. Re-measured over
     * eight seeds x two builds, it is neutral — 15/16 wins against 14/16, median run 11.7 min
     * against 10.2 (§30).
     */
    if (!run.house.regions.some((r) => r.id === spec.region)) continue;

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
        // The household finishing at the sink is information: the light goes off, the route is
        // usable again. `audio.routineEnd` was written for exactly this and had no caller.
        pushRoutineCue(run, spec, 'routine.end');
        state.timer = spec.aftermath;
        break;
      default:
        state.phase = 'idle';
        state.timer = spec.period + run.rng.range(-spec.jitter, spec.jitter);
    }
  }

  applyRoutineExposure(run);
}

/**
 * Where a routine happens.
 *
 * It used to be the centre of the region, which meant every routine cue in the game came from the
 * same point. `audio/bridge.ts` pans a cue against the camera basis specifically so that "most of
 * the danger is off-screen" has a channel — and then the sink being run, the bin lid going up and
 * the fridge opening all arrived from the middle of the kitchen. The one piece of information the
 * warning could carry, it did not carry.
 *
 * Derived rather than authored. Each of the six kitchen routines refills exactly one resource and
 * every resource already has a position, so `refilledBy` states where the household will be
 * standing without a single new coordinate to get wrong — and a routine that later refills two
 * sources averages them instead of needing a third fact maintained by hand.
 */
function routineAt(run: Run, spec: RoutineSpec): { x: number; z: number } | null {
  let x = 0;
  let z = 0;
  let count = 0;
  for (const site of run.house.resources.values()) {
    if (site.refilledBy !== spec.id) continue;
    x += site.at.x;
    z += site.at.z;
    count++;
  }
  if (count > 0) return { x: x / count, z: z / count };

  const region = run.house.regions.find((r) => r.id === spec.region);
  if (!region) return null;
  return {
    x: (region.bounds.x0 + region.bounds.x1) / 2,
    z: (region.bounds.z0 + region.bounds.z1) / 2,
  };
}

function pushRoutineCue(run: Run, spec: RoutineSpec, kind: string): void {
  const at = routineAt(run, spec);
  if (!at) return;
  pushCue(run, kind, at.x, 0, at.z);
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
    /*
     * Holding ground costs something, and until this it did not.
     *
     * The systems critic scored this discipline 44 on one sentence: "claiming is strictly
     * positive". A refuge added capacity, a spawn point and a repair target, and took nothing away,
     * so "is this one worth taking" was never a question. Capacity was made to follow supply
     * (`state.ts recomputeCapacity`), which priced *supplying*. This prices *holding*.
     *
     * A colony spread across eight refuges leaves traces in eight places, so the room forgets more
     * slowly. Every refuge past the ones the majority victory rule actually needs is a standing tax
     * on how fast the household calms down — which turns the eighth refuge from a reward into a
     * decision.
     *
     * The coefficient is measured, and the curve is NOT monotonic, which is why it was swept rather
     * than picked. Three brood seeds, run length median:
     *
     *   off    3/3 won   11.95 min
     *   0.04   5/6 won   **24.87 min**   (17.04 / 27.51 / 24.87)
     *   0.05   5/6 won   ~30 min but the canonical seed drops to 13.41
     *   0.07   1/3 won   14.55 min
     *
     * Past 0.04 the colony collapses early and the run gets SHORTER again, so the optimum is a
     * narrow window and both sides of it are worse. 0.04 is the first setting in the project's
     * history to put the median inside the 25-35 minute design band, from a starting point of
     * 3.1-4.9 minutes, and the canonical seed wins on it.
     *
     * Counted per region so it still says the right thing if a second room is ever unsealed.
     */
    let heldHere = 0;
    for (const [id, st] of run.footholds) {
      if (!st.claimed || st.damage >= 1) continue;
      if (run.house.footholds.get(id)?.region === region.id) heldHere++;
    }
    const spread = 1 / (1 + heldHere * 0.04);

    region.evidence = Math.max(
      region.evidenceFloor,
      region.evidence - EVIDENCE_DECAY * dt * abandoned * Math.max(COOL_FLOOR, 1 - busy) * spread,
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
    const hasPersistent = run.threats.some((t) => t.region === region.id && isPersistent(t.kind));
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

/**
 * How much of a threat's radius actually kills.
 *
 * The rest of it scatters — `panic` is already fired at `radius * 1.5` the moment a threat lands,
 * so every worker nearby is running before the first death roll. That running was decorative:
 * `tickThreat` rolled `lethality * dt` against the FULL radius every tick, so a worker sprinting
 * out of the blast was rolled against on each of the sixty ticks it took to get clear, and fleeing
 * changed nothing about whether it lived.
 *
 * Measured on seed 20260805 with the eight-refuge kitchen: population went 24 to 10 between t=190
 * and t=200 — seventeen workers in ten seconds — because eight refuges spread across five surfaces
 * put far more bodies inside one radius at once than four refuges on the floor ever did. The number
 * that grew was not lethality, it was how many workers a single strike could reach.
 *
 * The scout already had this shape, five lines below: an outer ring that scatters it and a tighter
 * core that kills it. Workers get the same rule and for the same reason — the outer ring of a wipe
 * should be a scare that costs the colony its cargo and its formation, and the middle of one should
 * be lethal. That makes fleeing a mechanic rather than an animation, and it keeps a strike's cost
 * proportional to how badly the player was positioned rather than to how large the colony is.
 */
const KILL_CORE = 0.55;

function tickThreat(run: Run, threat: Threat, spec: ThreatSpec, dt: number): void {
  if (spec.lethality <= 0) return;

  const core = threat.radius * KILL_CORE;
  for (const worker of run.workers) {
    if (!worker.alive) continue;
    if (run.house.regionOf.get(worker.surface) !== threat.region) continue;
    if (Math.hypot(worker.x - threat.x, worker.z - threat.z) > core) continue;
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
   * `caught` fills only inside `KILL_CORE` — the outer ring of a wipe scatters, the middle of one
   * kills. The scout shares that shape with the workers rather than being exempt from it; what it
   * gets instead is a meter it can outrun, where a worker gets a die roll it cannot.
   */
  const scout = run.scout;
  if (scout.downFor > 0) return;
  if (run.house.regionOf.get(scout.surface) !== threat.region) return;
  if (Math.hypot(scout.x - threat.x, scout.z - threat.z) > threat.radius * KILL_CORE) return;

  const region = regionState(run, threat.region);
  region.evidence = Math.min(1, region.evidence + dt * 0.05);
  scout.seen = Math.min(1, scout.seen + dt * 0.7);
  scout.caught = Math.min(1, scout.caught + (dt / CAUGHT_SECONDS) * spec.lethality);
  scout.crushedAt = run.time;
  /*
   * Being hurt was silent. `audio.scoutHurt` existed with zero callers, so the one meter the player
   * cannot afford to miss filled with no sound at all — and §10 asks for audio on core interactions.
   * Pushed every tick inside the kill core; the synthesiser self-throttles.
   */
  pushCue(run, 'scout.hurt', scout.x, scout.y, scout.z);
  if (scout.caught >= 1) stompScout(run);
}

/** Damage every foothold in a region. Used by the final extermination. */
export function strikeFootholds(run: Run, region: RegionId, amount: number): void {
  /*
   * A sweep FINDS one refuge and wrecks it. It does not spread evenly.
   *
   * Evenly-spread damage is why the finale used to resolve inside a single simulation tick. The
   * first sweep's severity is `0.3 + pressure * 0.35`, so at most 0.65 — below the 1.0 that
   * destroys anything. Every refuge survived, `holdsAll` stayed true, and `evaluateRun` ran later
   * in the SAME tick and declared victory. "The colony has to still be standing afterwards" was
   * literally unfalsifiable: measured across twelve bot runs (three builds x four seeds) every one
   * won in 2.51-3.29 minutes, with the finale lasting one tick.
   *
   * So the sweep is aimed. The refuge holding the most brood is the one the household has watched
   * the most traffic go into, and it is destroyed outright; the rest take a glancing share. That
   * makes the ending something the player works back from — rebuild the lost refuge, hold all four
   * again — instead of a die roll that lands on "you win".
   *
   * It is also the attributable version: the refuge you used hardest is the refuge they found.
   */
  const held: { id: string; brood: number }[] = [];
  for (const [id, state] of run.footholds) {
    const site = run.house.footholds.get(id);
    if (!site || site.region !== region || !state.claimed || state.damage >= 1) continue;
    held.push({ id, brood: state.brood });
  }
  held.sort((a, b) => b.brood - a.brood);

  /*
   * How many refuges a sweep levels scales with how hard it was provoked.
   *
   * One, always, made the ending unfalsifiable. Measured across nine bot runs: eight refuges, a
   * victory threshold of six, and exactly one refuge levelled — so held went 8 to 7, stayed above
   * the threshold, and `evaluateRun` declared victory later in the SAME tick as the sweep. Sweep
   * timestamp and win timestamp were identical in all nine. "The colony has to still be standing
   * afterwards" was a sentence about nothing.
   *
   * It is a PROPORTION of what is held, not a count. A count tied to the current eight refuges
   * would have to be retuned the moment the room gains or loses one, and the first version of this
   * was exactly that mistake: `1 + floor(amount * 3)` gives two at the maximum first-sweep severity
   * of 0.65, which against a threshold of `ceil(8 * 0.75) = 6` leaves held at exactly six and the
   * win still lands in the sweep's own tick. Measured: nine of nine runs, unchanged.
   *
   * As a share it says the right thing at any size — the household found the colony, and how much
   * of it they wreck depends on how loudly it announced itself.
   *
   * The coefficient was 0.6 and had to be re-measured once refuge `concealment` started reaching
   * the exposure grid. Cover works, so the scout is seen less (brood/20260805: 8 sightings before,
   * 6 after), so `pressure` is lower, so severity is lower — and at 0.6 the finale stopped biting
   * entirely: nine of nine runs held the line through the sweep. Swept 0.6 / 0.75 / 0.9 across
   * three seeds x three builds: 0/9 dipped, 4/9 dipped, 9/9 dipped, and all twenty-seven runs were
   * still won. 0.9 on evidence.
   *
   * What that buys is the right shape. The extermination is always an ordeal — it is the household
   * acting on everything they have learned, not a routine — and how deep the hole is still depends
   * on play: the loudest run measured drops to four refuges held, the quietest to five.
   */
  const levelled = Math.max(1, Math.min(held.length, Math.round(held.length * amount * 0.9)));

  for (let i = 0; i < held.length; i++) {
    const entry = held[i]!;
    const state = run.footholds.get(entry.id)!;
    const site = run.house.footholds.get(entry.id)!;

    if (i >= levelled) {
      // The glancing share is deliberately small: a sweep that half-wrecks everything leaves the
      // player with eight repairs and no priority, which reads as attrition rather than as an event.
      state.damage = Math.min(0.95, state.damage + amount * 0.35);
      continue;
    }

    /*
     * A levelled refuge stays `claimed`.
     *
     * It used to be cleared, and that quietly made retaking it cost full price — `scout.ts` charges
     * `share = claimed ? damage : 1`. So every increase in how hard the sweep hits was also an
     * increase in what the player pays to recover, which is precisely the "buy length with prices"
     * move the brief rejects and thirteen recorded attempts have already failed at. Keeping the flag
     * makes the retake a repair, and it keeps `isFirstTake` false so the adaptation point cannot be
     * farmed by losing the same refuge twice. `damage = 1` is what stops it counting as held.
     */
    state.damage = 1;
    state.brood = 0;
    logEvent(run, 'log.foothold.lost', 'danger', { foothold: site.labelKey });
    pushCue(run, 'foothold.lost', site.at.x, 0, site.at.z);
  }
}

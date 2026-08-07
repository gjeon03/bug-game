import { buildNav } from '../world/house';
import type { Gate, RegionId } from '../world/types';
import { revalidateRoutes } from './routes';
import {
  BROOD_FOOD_PER_WORKER,
  BROOD_MOISTURE_PER_WORKER,
  BROOD_RESERVE_SECONDS,
  BROOD_SECONDS,
  UPKEEP_FOOD,
  UPKEEP_MOISTURE,
  logEvent,
  pushCue,
  recomputeCapacity,
  regionState,
  spawnWorker,
  storeCap,
} from './state';
import { strikeFootholds } from './household';
import type { AdaptationFamily, ChapterId, Run } from './types';

/**
 * Progression: chapters, gate operations, adaptations, and the endgame.
 *
 * ## Why a blocker is computed, never authored
 *
 * A per-chapter script would say "open the hallway". This says "open the hallway, and the reason
 * you cannot is that you have three workers and it needs four" — because it derives the *binding
 * constraint* from live state. That difference is what makes guidance useful when a player is
 * stuck, which is the only time guidance matters.
 */

/** Chapter each gate belongs to — opening it completes that chapter. */
const GATE_CHAPTER: Readonly<Record<string, ChapterId>> = {
  'gate.kitchen.hallway': 'kitchen',
  'gate.hallway.living': 'hallway',
  'gate.hallway.bathroom': 'hallway',
  'gate.bathroom.kitchen': 'hallway',
  'gate.hallway.bedroom': 'living',
};

const CHAPTER_ORDER: readonly ChapterId[] = ['kitchen', 'hallway', 'living', 'bedroom', 'final'];

/* ------------------------------------------------------------- gate checks */

export interface GateCheck {
  readonly ok: boolean;
  readonly blockerKey: string | null;
  readonly blockerParams: Record<string, string | number>;
}

const PASSES: GateCheck = { ok: true, blockerKey: null, blockerParams: {} };

/**
 * Can this gate be opened right now, and if not, what is the single reason?
 *
 * Order is deliberate: the fundamental problem (no foothold, no specialization) is reported before
 * the incidental one (six more food), because that is the order the player has to solve them in.
 */
export function checkGate(run: Run, gate: Gate): GateCheck {
  const need = gate.requires;

  for (const id of need.footholds ?? []) {
    if (!run.footholds.get(id)?.claimed) {
      const site = run.house.footholds.get(id);
      return {
        ok: false,
        blockerKey: 'blocker.foothold',
        blockerParams: { foothold: site?.labelKey ?? id },
      };
    }
  }

  if (need.adaptation && run.colony.adaptations.length === 0) {
    return { ok: false, blockerKey: 'blocker.adaptation', blockerParams: {} };
  }

  if (need.workers !== undefined && run.colony.population < need.workers) {
    return {
      ok: false,
      blockerKey: 'blocker.workers',
      blockerParams: { have: run.colony.population, need: need.workers },
    };
  }

  const supplied = need.suppliedFoothold;
  if (supplied) {
    const delivering = run.routes.some((r) => r.nest === supplied && r.health === 'ok');
    if (!delivering) {
      const site = run.house.footholds.get(supplied);
      return {
        ok: false,
        blockerKey: 'blocker.supply',
        blockerParams: { foothold: site?.labelKey ?? supplied },
      };
    }
  }

  if (need.maxAlert !== undefined) {
    const region = regionState(run, gate.from);
    if (region.alert > need.maxAlert) {
      return {
        ok: false,
        blockerKey: 'blocker.alert',
        blockerParams: { region: `region.${gate.from}` },
      };
    }
  }

  if (need.food !== undefined && run.colony.food < need.food) {
    return {
      ok: false,
      blockerKey: 'blocker.food',
      blockerParams: { have: Math.floor(run.colony.food), need: need.food },
    };
  }

  if (need.moisture !== undefined && run.colony.moisture < need.moisture) {
    return {
      ok: false,
      blockerKey: 'blocker.moisture',
      blockerParams: { have: Math.floor(run.colony.moisture), need: need.moisture },
    };
  }

  return PASSES;
}

/** Start or resume the held operation on a gate. */
export function beginGateWork(run: Run, gate: Gate): boolean {
  if (run.scout.climb) return false;
  if (!checkGate(run, gate).ok) return false;
  run.scout.working = { gate: gate.id, progress: run.gateProgress.get(gate.id) ?? 0 };
  run.idleFor = 0;
  return true;
}

export function stopGateWork(run: Run): void {
  const working = run.scout.working;
  if (!working) return;
  // Progress is banked, not lost. An operation interrupted by a household routine is a setback,
  // not a punishment for having been unlucky about timing.
  run.gateProgress.set(working.gate, working.progress);
  run.scout.working = null;
  run.scout.state = 'idle';
}

export function updateGateWork(run: Run, dt: number): void {
  const working = run.scout.working;
  if (!working) return;

  const gate = run.house.gates.find((g) => g.id === working.gate);
  if (!gate) {
    run.scout.working = null;
    return;
  }

  // Requirements are re-checked every tick: if a household response pushes the region's alert up
  // mid-operation, the scout stops, and it stops with a reason the HUD can name.
  if (!checkGate(run, gate).ok) {
    stopGateWork(run);
    logEvent(run, 'log.gate.interrupted', 'warn', { gate: gate.labelKey });
    return;
  }

  const shadow = run.colony.adaptations.filter((a) => a.family === 'shadow').length;
  working.progress += dt * (1 + 0.2 * shadow);
  run.gateProgress.set(gate.id, working.progress);

  if (working.progress < gate.workSeconds) return;

  run.scout.working = null;
  openGate(run, gate);
}

/**
 * Open a gate: the moment the world changes shape.
 *
 * Rebuilding the navigation graph here is what makes the change physical. Nothing checks a flag
 * afterwards — the edge simply exists now, and every route, worker and pathfinding query sees it.
 */
export function openGate(run: Run, gate: Gate): void {
  if (run.openGates.has(gate.id)) return;
  run.openGates.add(gate.id);
  run.nav = buildNav(run.house, run.openGates);
  revalidateRoutes(run);

  const region = regionState(run, gate.to);
  if (!region.unlocked) {
    region.unlocked = true;
    run.stats.regionsOpened++;
  }

  // Everything already visible in a newly opened region: the player earned the look at it.
  for (const [id, state] of run.resources) {
    const site = run.house.resources.get(id);
    if (site?.region === gate.to && site.hidden !== true) state.found = true;
  }

  run.colony.adaptationPoints++;
  pushCue(run, 'gate.opened', gate.at.x, 0, gate.at.z);
  logEvent(run, 'log.gate.opened', 'good', { region: `region.${gate.to}` });

  advanceChapter(run, gate);
}

function advanceChapter(run: Run, gate: Gate): void {
  const completed = GATE_CHAPTER[gate.id];
  if (!completed || completed !== run.chapter) return;
  const next = CHAPTER_ORDER[CHAPTER_ORDER.indexOf(run.chapter) + 1];
  if (!next) return;
  run.chapter = next;
  logEvent(run, 'log.chapter', 'good', { chapter: `chapter.${next}` });
}

/* ------------------------------------------------------------- adaptations */

export interface AdaptationOffer {
  readonly family: AdaptationFamily;
  readonly tier: 1 | 2;
  readonly labelKey: string;
  readonly bodyKey: string;
  readonly costKey: string;
  readonly available: boolean;
}

const FAMILIES: readonly AdaptationFamily[] = ['brood', 'scavenging', 'shadow'];

export function adaptationOffers(run: Run): readonly AdaptationOffer[] {
  return FAMILIES.map((family) => {
    const owned = run.colony.adaptations.filter((a) => a.family === family).length;
    const tier: 1 | 2 = owned >= 1 ? 2 : 1;
    return {
      family,
      tier,
      labelKey: `adaptation.${family}.${tier}`,
      bodyKey: `adaptation.${family}.${tier}.desc`,
      costKey: `adaptation.${family}.${tier}.cost`,
      available: owned < 2 && run.colony.adaptationPoints > 0,
    };
  });
}

/**
 * Commit to a specialization.
 *
 * Three families, and a normal run earns three or four points, so the player cannot have
 * everything — and each tier past the first costs a point that could have started a second family.
 * That is the whole opportunity cost, and it is why two runs look different.
 */
export function chooseAdaptation(run: Run, family: AdaptationFamily): boolean {
  if (run.colony.adaptationPoints <= 0) return false;
  const owned = run.colony.adaptations.filter((a) => a.family === family).length;
  if (owned >= 2) return false;

  run.colony.adaptationPoints--;
  const tier: 1 | 2 = owned >= 1 ? 2 : 1;
  run.colony.adaptations.push({ family, tier });
  recomputeCapacity(run);

  pushCue(run, 'adaptation.chosen', run.scout.x, run.scout.y, run.scout.z);
  logEvent(run, 'log.adaptation', 'good', { adaptation: `adaptation.${family}.${tier}` });
  run.idleFor = 0;
  return true;
}

/* ------------------------------------------------------------------ colony */

export function updateColony(run: Run, dt: number): void {
  const colony = run.colony;

  // Upkeep. A colony that stops delivering starves, which is what stops "build once, idle out".
  colony.food -= colony.population * UPKEEP_FOOD * dt;
  colony.moisture -= colony.population * UPKEEP_MOISTURE * dt;

  // Overflow is discarded, and the first time it happens the player is told. A run that banks 800
  // moisture while starving for food has a routing problem, not a resource problem, and the HUD
  // has to be able to say which.
  const cap = storeCap(run);
  if (colony.food > cap) colony.food = cap;
  if (colony.moisture > cap) colony.moisture = cap;

  if (colony.food <= 0 || colony.moisture <= 0) {
    colony.food = Math.max(0, colony.food);
    colony.moisture = Math.max(0, colony.moisture);
    colony.starvedFor += dt;

    /*
     * Running dry stops GROWTH immediately and only kills after sustained deprivation.
     *
     * Killing a worker as soon as a store touched zero produced a death spiral that no play could
     * escape: every death needed a replacement, every replacement cost more of the resource that
     * had just run out. Measured on the brood build — the specialization whose whole purpose is
     * growth — 76 workers lost with ZERO threats and every region at alert 0. Nothing was hunting
     * them; the economy was eating itself.
     *
     * A colony out of water should shrink slowly and recoverably, which is what the brief asks of
     * every setback. The grace period is the difference between "I over-expanded, let me reroute"
     * and "the run is over and I could not see why".
     */
    if (colony.starvedFor > STARVE_GRACE && run.rng.bool(0.12 * dt)) {
      const victim = [...run.workers].reverse().find((w) => w.alive);
      if (victim) {
        victim.alive = false;
        victim.state = 'dead';
        colony.population = Math.max(0, colony.population - 1);
        run.stats.workersLost++;
        logEvent(run, 'log.starved', 'danger', {});
      }
    }
    return;
  }
  colony.starvedFor = 0;

  if (colony.population >= colony.capacity) {
    colony.broodProgress = 0;
    return;
  }

  // Held by the player: bank the surplus instead of spending it on a body. Upkeep is still charged
  // above, so holding is a real cost and not a free pause.
  if (colony.broodHold) {
    colony.broodProgress = 0;
    return;
  }

  /*
   * Affording the egg is not the same as affording the worker.
   *
   * The reserve is what the colony must still be holding once the egg is paid for — enough to keep
   * everyone, including the new body, fed for `BROOD_RESERVE_SECONDS`. Without it the opening state
   * is a trap that springs itself: see the note on the constant.
   */
  const next = colony.population + 1;
  const foodNeeded = BROOD_FOOD_PER_WORKER + next * UPKEEP_FOOD * BROOD_RESERVE_SECONDS;
  const moistureNeeded = BROOD_MOISTURE_PER_WORKER + next * UPKEEP_MOISTURE * BROOD_RESERVE_SECONDS;

  if (colony.food < foodNeeded || colony.moisture < moistureNeeded) {
    colony.broodProgress = Math.max(0, colony.broodProgress - dt * 0.1);
    return;
  }

  const broodTiers = colony.adaptations.filter((a) => a.family === 'brood').length;
  colony.broodProgress += dt * ((1 + 0.3 * broodTiers) / BROOD_SECONDS);
  if (colony.broodProgress < 1) return;

  colony.broodProgress = 0;
  colony.food -= BROOD_FOOD_PER_WORKER;
  colony.moisture -= BROOD_MOISTURE_PER_WORKER;

  // Born at the foothold with the most spare room, which is what makes taking a satellite in a new
  // region immediately change where the colony's labour comes from.
  let bestId = '';
  let bestRoom = -1;
  for (const [id, state] of run.footholds) {
    if (!state.claimed || state.damage >= 1) continue;
    const site = run.house.footholds.get(id);
    if (!site) continue;
    const here = run.workers.filter((w) => w.alive && w.home === id).length;
    const room = site.capacity - here;
    if (room > bestRoom) {
      bestRoom = room;
      bestId = id;
    }
  }
  if (bestId) spawnWorker(run, bestId);
}

/* ------------------------------------------------------ the final response */

/** Regions the extermination will sweep, worst first. Read by the HUD as a warning. */
export function exterminationTargets(run: Run): readonly RegionId[] {
  return [...run.regions.values()]
    .filter((r) => r.unlocked)
    .sort((a, b) => b.evidence + b.evidenceFloor - (a.evidence + a.evidenceFloor))
    .map((r) => r.id);
}

export interface FinalState {
  /** 0..1 toward the extermination arriving. */
  readonly pressure: number;
  readonly struck: boolean;
}

/**
 * Minimum seconds between whole-home sweeps.
 *
 * `updateFinal` used to roll a per-tick probability with no cooldown at all, which at 60 Hz meant a
 * sweep roughly every thirteen seconds. Measured on seed 4242: **125 sweeps in one run**. That is a
 * metronome, not a finale — the household emptied its arsenal continuously and the event the win
 * screen describes had no weight whatsoever.
 *
 * A sweep is the largest thing the household does. It has to be rare enough to be an event and
 * spaced enough for the colony to actually rebuild between them, which is the whole recovery loop.
 */
const SWEEP_COOLDOWN = 110;

/**
 * The household mounts its full response once the colony holds the WHOLE kitchen.
 *
 * It was two refuges of four, and measured on seed 20260805 that fired at 2 minutes against a
 * colony of ten. One sweep took it apart, and the run was over at 2.29 minutes with all four
 * refuges still nominally claimed — the endgame arrived before the midgame had started.
 *
 * Two-of-four was a guess at "enough that the infestation is no longer a rumour". Holding all of it
 * is not a guess: it is the same statement the victory check makes, which gives the run an actual
 * shape — take the room, THEN be come for, then still be standing. It also means a sweep that takes
 * a refuge back genuinely postpones the ending, because retaking it is now on the path to both the
 * finale and the win.
 */
function finaleArmed(run: Run): boolean {
  return heldKitchenRefuges(run) >= refugesToHold(run);
}

/** Kitchen refuges currently claimed and standing. */
function heldKitchenRefuges(run: Run): number {
  let held = 0;
  for (const site of run.house.footholds.values()) {
    if (site.region !== 'kitchen') continue;
    const state = run.footholds.get(site.id);
    if (state?.claimed === true && state.damage < 1) held++;
  }
  return held;
}

/**
 * How many refuges the colony must hold — a majority, not all of them.
 *
 * It was ALL of them, which was a reasonable statement about a room with four. With eight it is a
 * different demand: measured on seed 20260805, the brood build reached 8/8 at t=180 with 23 workers
 * and 58 food, and by t=240 it was at 9 workers and 9 food with twenty-one dead. Holding every
 * refuge means spreading traffic across every one of them, and traffic is exactly what the
 * household's response is aimed by — so "take everything" was a losing instruction that the victory
 * condition itself was issuing.
 *
 * A majority turns that into a choice: which refuges are worth the traffic they generate, and which
 * are better left cold. That is a better statement of "the colony has taken the room" than a
 * checklist, and it is the difference between a list and a decision.
 */
function refugesToHold(run: Run): number {
  let total = 0;
  for (const site of run.house.footholds.values()) {
    if (site.region === 'kitchen') total++;
  }
  if (total === 0) return 0;
  return Math.max(1, Math.ceil(total * 0.75));
}

/** Seconds a colony may sit at zero before it starts losing bodies. */
const STARVE_GRACE = 14;

/** Each sweep after the first hits harder — the household learns. */
const SWEEP_ESCALATION = 0.18;

/**
 * The endgame.
 *
 * Establishing a bedroom foothold starts a whole-home response whose severity is drawn from the
 * player's own history — the order it sweeps regions is the order of the evidence they left.
 * Victory is not a timer expiring: the colony has to still hold a viable network afterwards.
 */
export function updateFinal(run: Run, dt: number): FinalState {
  /*
   * The household's full response starts once the colony has taken real hold of the kitchen.
   *
   * It used to key off a bedroom foothold. With the flat sealed to one room that trigger can never
   * fire, so the finale — and therefore the only thing standing between the player and an automatic
   * win — would simply never have happened. Two claimed refuges is the one-room equivalent: enough
   * that the infestation is no longer a rumour.
   */
  if (!finaleArmed(run)) return { pressure: 0, struck: false };

  let total = 0;
  let unlocked = 0;
  for (const region of run.regions.values()) {
    if (!region.unlocked) continue;
    unlocked++;
    total += region.evidence;
  }
  const pressure = Math.min(1, total / Math.max(1, unlocked) + run.stats.sightings * 0.01);

  run.sweepCooldown -= dt;
  if (run.sweepCooldown > 0) return { pressure, struck: false };

  // Pressure decides HOW SOON within the window, never how often — the cooldown is the floor.
  if (!run.rng.bool(dt * 0.5 * (0.15 + pressure))) return { pressure, struck: false };

  const target = exterminationTargets(run)[0];
  if (!target) return { pressure, struck: false };

  run.sweepCooldown = SWEEP_COOLDOWN;
  const severity = 0.3 + pressure * 0.35 + run.stats.exterminationSweeps * SWEEP_ESCALATION;
  strikeFootholds(run, target, Math.min(0.9, severity));
  recomputeCapacity(run);
  run.stats.exterminationSweeps++;
  logEvent(run, 'log.extermination', 'danger', { region: `region.${target}` });
  return { pressure, struck: true };
}

/* ------------------------------------------------------------ win and loss */

/**
 * How many whole-home extermination sweeps the colony must survive to win.
 *
 * Without this, victory was strictly dominated by the bedroom gate: the gate already demands 14
 * workers, 60 food and 40 moisture, so every other victory condition was satisfied the moment the
 * bedroom foothold was claimed, and the win screen congratulated the player for withstanding a
 * response that had statistically never fired. The finale has to be something the colony endures,
 * not something it walks past.
 */
const SWEEPS_TO_SURVIVE = 1;

/** Seconds a colony may sit at zero workers before the run is called. */
const COLONY_DEAD_GRACE = 25;

export function evaluateRun(run: Run): void {
  if (run.status !== 'playing') return;

  const claimed = [...run.footholds.values()].filter((f) => f.claimed && f.damage < 1);

  // Failure: no refuge left anywhere. Attributable, and it takes a while to get here — a single
  // bad response never ends a run.
  if (claimed.length === 0) {
    run.status = 'lost';
    logEvent(run, 'log.lost', 'danger', {});
    return;
  }

  /*
   * Failure: the colony is gone and cannot come back.
   *
   * Holding a refuge with nobody in it is not a game still in progress. A technical review measured
   * a run sitting at population 0 with `status: 'playing'` for ninety-five seconds and counting, and
   * a bot run held that state for twenty-three minutes — the player is watching an empty room with
   * no way to affect it, and no screen ever tells them it is over.
   *
   * The scout alone cannot rebuild: brood needs stores, and stores need workers to carry them. So a
   * population of zero that stays zero is a loss, given a grace period long enough that a bad sweep
   * which happens to catch everyone at once still leaves room for the last egg to hatch.
   */
  if (run.colony.population === 0) {
    if (run.deadFor > COLONY_DEAD_GRACE) {
      run.status = 'lost';
      logEvent(run, 'log.lost.extinct', 'danger', {});
      return;
    }
  }

  /*
   * Victory is measured inside the kitchen, because the kitchen is the game.
   *
   * This used to demand footholds in kitchen, hallway, living room AND bedroom. With the other four
   * regions sealed there is no navigation edge to any of them, so that condition could never become
   * true — the run would have been unwinnable by construction, which is a worse failure than a short
   * run. Holding every refuge the kitchen offers is the equivalent statement about a one-room game:
   * the colony has taken the whole space it can reach.
   */
  // A majority, not every one — see `refugesToHold`.
  const holdsAll = heldKitchenRefuges(run) >= refugesToHold(run);

  if (!holdsAll) return;
  if (run.colony.adaptations.length === 0) return;
  if (run.colony.population < 12) return;
  if (run.colony.food < 30 || run.colony.moisture < 20) return;
  // The finale: the household has to have actually come for the colony, and the colony has to have
  // still been standing afterwards.
  if (run.stats.exterminationSweeps < SWEEPS_TO_SURVIVE) return;

  run.status = 'won';
  logEvent(run, 'log.won', 'good', {});
}

import { buildNav } from '../world/house';
import type { Gate, RegionId } from '../world/types';
import { revalidateRoutes } from './routes';
import {
  BROOD_FOOD_PER_WORKER,
  BROOD_MOISTURE_PER_WORKER,
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

  if (colony.food < 0 || colony.moisture < 0) {
    colony.food = Math.max(0, colony.food);
    colony.moisture = Math.max(0, colony.moisture);
    // Starvation sheds the newest worker, not a random one — the colony gives back what it just
    // grew, so the loss is legible as "I over-expanded" rather than as bad luck.
    if (run.rng.bool(0.35 * dt)) {
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

  if (colony.population >= colony.capacity) {
    colony.broodProgress = 0;
    return;
  }

  if (colony.food < BROOD_FOOD_PER_WORKER || colony.moisture < BROOD_MOISTURE_PER_WORKER) {
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
 * The endgame.
 *
 * Establishing a bedroom foothold starts a whole-home response whose severity is drawn from the
 * player's own history — the order it sweeps regions is the order of the evidence they left.
 * Victory is not a timer expiring: the colony has to still hold a viable network afterwards.
 */
export function updateFinal(run: Run, dt: number): FinalState {
  const bedroom = run.regions.get('bedroom');
  if (!bedroom?.unlocked) return { pressure: 0, struck: false };

  const holdsBedroom = [...run.footholds.entries()].some(
    ([id, state]) => state.claimed && run.house.footholds.get(id)?.region === 'bedroom',
  );
  if (!holdsBedroom) return { pressure: 0, struck: false };

  let total = 0;
  let unlocked = 0;
  for (const region of run.regions.values()) {
    if (!region.unlocked) continue;
    unlocked++;
    total += region.evidence;
  }
  const pressure = Math.min(1, total / Math.max(1, unlocked) + run.stats.sightings * 0.03);

  if (!run.rng.bool(dt * 0.06 * (0.3 + pressure))) return { pressure, struck: false };

  const target = exterminationTargets(run)[0];
  if (!target) return { pressure, struck: false };

  strikeFootholds(run, target, 0.34 * (0.5 + pressure));
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
const SWEEPS_TO_SURVIVE = 2;

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

  const regionsHeld = new Set<RegionId>();
  for (const [id, state] of run.footholds) {
    if (!state.claimed || state.damage >= 1) continue;
    const site = run.house.footholds.get(id);
    if (site) regionsHeld.add(site.region);
  }

  const holdsMain =
    regionsHeld.has('kitchen') &&
    regionsHeld.has('hallway') &&
    regionsHeld.has('living') &&
    regionsHeld.has('bedroom');

  if (!holdsMain) return;
  if (run.colony.adaptations.length === 0) return;
  if (run.colony.population < 12) return;
  if (run.colony.food < 30 || run.colony.moisture < 20) return;
  // The finale: the household has to have actually come for the colony, and the colony has to have
  // still been standing afterwards.
  if (run.stats.exterminationSweeps < SWEEPS_TO_SURVIVE) return;

  run.status = 'won';
  logEvent(run, 'log.won', 'good', {});
}

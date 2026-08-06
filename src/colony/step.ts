import type { Gate, RegionId } from '../world/types';
import { updateDirector, updateEvidence, updateRoutines } from './household';
import { checkGate, evaluateRun, updateColony, updateFinal, updateGateWork } from './progression';
import { updateRoutes } from './routes';
import { updateScout, type ScoutInput } from './scout';
import { updateWorkers } from './workers';
import type { Run } from './types';

/**
 * One simulation tick.
 *
 * Ordered on purpose. The household decides what it is doing before anybody moves, so a routine
 * that starts this tick lights the floor the scout is about to step onto rather than the floor it
 * has already crossed. Evidence is settled after the bodies have moved, because evidence is a
 * consequence of movement.
 */

const IDLE_HINT_AFTER = 12;

/**
 * Victory is measured in kitchen refuges held, not in rooms opened.
 *
 * The old measure was four regions. With the flat sealed to the kitchen it could never be
 * satisfied, so the objective panel would have reported a blocker the player had no way to clear.
 */
const HOLD_TARGET_REGION: RegionId = 'kitchen';

export interface StepInput extends ScoutInput {
  /** Sprint reserve carried across ticks by the caller, 0..1. */
  readonly stamina: number;
}

export interface StepResult {
  readonly stamina: number;
  /** 0..1 pressure toward the whole-home extermination. */
  readonly finalPressure: number;
}

export function stepRun(run: Run, dt: number, input: StepInput): StepResult {
  if (run.status !== 'playing') return { stamina: input.stamina, finalPressure: 0 };

  run.time += dt;

  // 1 — the household decides. Routines repaint the exposure field the rest of the tick reads.
  updateRoutines(run, dt);
  updateDirector(run, dt);

  // 2 — bodies move.
  const stamina = updateScout(run, dt, input, input.stamina);
  updateGateWork(run, dt);
  updateWorkers(run, dt);

  // 3 — logistics settle.
  updateRoutes(run, dt);
  updateColony(run, dt);

  // 4 — consequences.
  updateEvidence(run, dt);
  const final = updateFinal(run, dt);

  // 5 — read the state back for the player.
  run.idleFor += dt;
  updateObjective(run);
  evaluateRun(run);

  return { stamina, finalPressure: final.pressure };
}

/* --------------------------------------------------------------- objective */

/**
 * What should the player do now, and what is actually stopping them?
 *
 * Derived every tick from live state. The order below is the order a player has to solve things
 * in, which is why it reads as advice rather than as a checklist: you cannot open the hallway
 * before you can feed the workers that would open it.
 */
export function updateObjective(run: Run): void {
  const objective = run.objective;
  objective.chapter = run.chapter;

  const gate = nextGate(run);

  if (!gate) {
    // Everything is open — the run is in its endgame.
    objective.titleKey = 'objective.final.title';
    objective.bodyKey = 'objective.final.body';
    objective.params = {};
    objective.at = null;
    objective.progress = holdProgress(run);
    objective.blockerKey = holdBlocker(run);
    objective.blockerParams = {};
    return;
  }

  objective.titleKey = `chapter.${run.chapter}`;
  objective.bodyKey = gate.descriptionKey;
  objective.params = { gate: gate.labelKey, region: `region.${gate.to}` };
  objective.at = { surface: gate.surface, x: gate.at.x, z: gate.at.z };

  const banked = run.gateProgress.get(gate.id) ?? 0;
  objective.progress = Math.min(1, banked / gate.workSeconds);

  const check = checkGate(run, gate);
  if (!check.ok) {
    objective.blockerKey = check.blockerKey;
    objective.blockerParams = check.blockerParams;
    return;
  }

  // Requirements met. The only thing left is to physically go and do it — unless the player has
  // been standing still long enough to have lost the thread, in which case say where.
  objective.blockerKey = run.idleFor > IDLE_HINT_AFTER ? 'blocker.goThere' : null;
  objective.blockerParams = { gate: gate.labelKey };
}

/**
 * The gate the current chapter is about.
 *
 * The bathroom is deliberately excluded: it is optional, so it must never be the thing the
 * objective points at, or it stops being a choice.
 */
function nextGate(run: Run): Gate | null {
  const order = ['gate.kitchen.hallway', 'gate.hallway.living', 'gate.hallway.bedroom'];
  for (const id of order) {
    if (run.openGates.has(id)) continue;
    return run.house.gates.find((g) => g.id === id) ?? null;
  }
  return null;
}


/** How close the colony is to the victory condition, as a fraction. */
function kitchenHoldFraction(run: Run): number {
  const sites = [...run.house.footholds.values()].filter((f) => f.region === HOLD_TARGET_REGION);
  if (sites.length === 0) return 1;
  const held = sites.filter((site) => {
    const state = run.footholds.get(site.id);
    return state?.claimed === true && state.damage < 1;
  }).length;
  return held / sites.length;
}

function holdProgress(run: Run): number {
  const main = kitchenHoldFraction(run);
  const strength = Math.min(1, run.colony.population / 12);
  const stores = Math.min(1, (run.colony.food / 30 + run.colony.moisture / 20) / 2);
  const specialised = run.colony.adaptations.length > 0 ? 1 : 0;
  return (main + strength + stores + specialised) / 4;
}

/** Which victory condition is currently missing. Only one is reported — the most fundamental. */
function holdBlocker(run: Run): string | null {
  if (kitchenHoldFraction(run) < 1) return 'blocker.holdRegion';
  if (run.colony.adaptations.length === 0) return 'blocker.adaptation';
  if (run.colony.population < 12) return 'blocker.population';
  if (run.colony.food < 30 || run.colony.moisture < 20) return 'blocker.stores';
  return null;
}

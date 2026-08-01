import { clamp01 } from '../core/math.ts';
import {
  TRAFFIC_EVIDENCE_CAP,
  TRAIL_EVIDENCE_CAP,
  SUSPICION_DECAY,
  SUSPICION_MAX,
  SUSPICION_PEAK_FLOOR,
  SUSPICION_WEIGHTS,
  TIER_THRESHOLDS,
} from './constants.ts';
import { depositHeat } from './heat.ts';
import type { SuspicionCause } from './types.ts';

/** How much regional heat one point of evidence deposits. */
const HEAT_PER_EVIDENCE = 0.05;
/** Seconds a tier must hold before the household is allowed to escalate again. */
export const TIER_HOLD = 25;

/** Spreads the traffic term across the places the exposed workers are actually standing. */
function depositWorkerHeat(world: World, total: number): void {
  let exposed = 0;
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (w.alive && w.exposure > 0.24) exposed++;
  }
  if (exposed === 0) return;
  const per = (total * HEAT_PER_EVIDENCE * 5) / exposed;
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (w.alive && w.exposure > 0.24) depositHeat(world, w.x, w.y, per);
  }
}

/** Spreads the trail term across the exposed stretches of the player's own routes. */
function depositTrailHeat(world: World, total: number): void {
  let count = 0;
  for (const r of world.routes) {
    for (let i = 0; i < r.nodes.length; i += 4) if (r.nodes[i].exposure > 0.24) count++;
  }
  if (count === 0) return;
  const per = (total * HEAT_PER_EVIDENCE * 5) / count;
  for (const r of world.routes) {
    for (let i = 0; i < r.nodes.length; i += 4) {
      const n = r.nodes[i];
      if (n.exposure > 0.24) depositHeat(world, n.x, n.y, per);
    }
  }
}
import type { World } from './world.ts';

/**
 * Persistent suspicion — how obvious the infestation has become.
 *
 * Deliberately not a hidden difficulty dial: every contribution is attributed to a named cause, the
 * ledger is shown in the HUD, and the next response tier is named before it arrives. It also cannot
 * be ground back to zero — suspicion decays only to a floor set by its own peak, so the decision is
 * "how much risk do I accept", never "how do I farm the meter down".
 */

export const TIER_NAMES = [
  'Unnoticed',
  "Something's off",
  'Infestation suspected',
  'Calling it in',
  'Extermination',
] as const;

export const TIER_RESPONSE: readonly string[] = [
  'Nobody has noticed anything yet.',
  'Next: someone will come in and turn the light on.',
  'Next: sticky traps go down on your busiest floor routes.',
  'Next: bait and longer patrols across the whole kitchen.',
  'Next: the spray comes out and they go for the nest.',
];

export const CAUSE_LABELS: Record<SuspicionCause, string> = {
  seen: 'A roach was seen in the light',
  corpse: 'Bodies left in the open',
  traffic: 'Heavy traffic across open floor',
  depleted: 'Food visibly disturbed',
  trap: 'A trap caught something',
  expansion: 'New nest openings',
  noise: 'Scuttling heard in the open',
  droppings: 'Trails left on bare tile',
};

export function addSuspicion(
  world: World,
  cause: SuspicionCause,
  amount: number,
  x: number,
  y: number,
): void {
  if (amount <= 0) return;
  const s = world.suspicion;
  s.value = Math.min(SUSPICION_MAX, s.value + amount);
  s.causes[cause] += amount;
  if (s.value > s.peak) s.peak = s.value;

  // Continuous causes contribute far less than 0.05 in a single 1/60 s step, so a per-call
  // threshold made "Heavy traffic across open floor" and "Trails left on bare tile" unreachable
  // strings — exactly the two labels that exist to explain route choice. Accumulate instead, and
  // surface a cause once it has actually added up to something.
  s.accum[cause] += amount;
  if (s.accum[cause] >= 0.9) {
    s.accum[cause] = 0;
    s.lastCause = cause;
    s.lastCauseTime = world.time;
  }
  // Evidence has a place now. The old signature took x,y and dropped them on the floor, which is
  // why the household could never aim anything at what the player actually did.
  if (x > 0 || y > 0) depositHeat(world, x, y, amount * HEAT_PER_EVIDENCE);
  world.events.push({ t: 'suspicion', delta: amount, cause, x, y });
}

export function updateSuspicion(world: World, dt: number): void {
  const s = world.suspicion;

  // ── Continuous evidence.
  // Traffic and trail evidence are deposited per worker and per trail node, at the place they
  // happened, so heavy use of one corridor makes *that corridor* the thing the household acts on.
  if (world.exposedWorkers > 0) {
    const total =
      SUSPICION_WEIGHTS.traffic *
      Math.min(world.exposedWorkers, TRAFFIC_EVIDENCE_CAP) *
      world.traits.trafficEvidenceMult *
      dt;
    addSuspicion(world, 'traffic', total, 0, 0);
    depositWorkerHeat(world, total);
  }
  if (world.exposedTrail > 0) {
    const total =
      SUSPICION_WEIGHTS.droppings * Math.min(world.exposedTrail, TRAIL_EVIDENCE_CAP) * dt;
    addSuspicion(world, 'droppings', total, 0, 0);
    depositTrailHeat(world, total);
  }
  const scout = world.scout;
  if (scout.alive && scout.sprinting && scout.exposure > 0.35) {
    addSuspicion(world, 'noise', SUSPICION_WEIGHTS.noise * dt, scout.x, scout.y);
  }

  let openCorpses = 0;
  for (let i = 0; i < world.corpses.length; i++) {
    if (world.corpses[i].cover < 0.35) openCorpses++;
  }
  if (openCorpses > 0) {
    addSuspicion(world, 'corpse', SUSPICION_WEIGHTS.corpse * Math.min(openCorpses, 5) * dt, 0, 0);
    for (let i = 0; i < world.corpses.length; i++) {
      const c = world.corpses[i];
      if (c.cover < 0.35) depositHeat(world, c.x, c.y, 0.014 * dt);
    }
  }

  // ── Drained food is evidence the humans notice on their own.
  for (let i = 0; i < world.resources.length; i++) {
    const r = world.resources[i];
    if (r.depleted && !r.depletedReported && r.kind === 'food') {
      r.depletedReported = true;
      addSuspicion(world, 'depleted', SUSPICION_WEIGHTS.depleted, r.x, r.y);
    }
  }

  // ── Decay toward a floor that the run's own peak sets. Evidence is never erasable.
  s.floor = s.peak * SUSPICION_PEAK_FLOOR;
  if (s.value > s.floor) {
    s.value = Math.max(s.floor, s.value - SUSPICION_DECAY * dt);
  }

  // ── Tier transitions, rate-limited.
  //
  // Measured on the old build: tiers 2, 3 and 4 could all fire inside 15 seconds, so the player
  // never saw one tier's response before the next arrived and the whole escalation staircase
  // collapsed into a single event. A promotion now has to hold for TIER_HOLD seconds before the
  // next one is allowed, which is what makes escalation legible.
  let tier = 0;
  for (let i = 0; i < TIER_THRESHOLDS.length; i++) {
    if (s.value >= TIER_THRESHOLDS[i]) tier = i + 1;
  }
  if (tier > s.tier) {
    if (world.tierHold >= TIER_HOLD) {
      s.tier += 1;
      world.tierHold = 0;
      world.events.push({ t: 'tier', tier: s.tier });
    }
  } else if (tier < s.tier) {
    s.tier = tier;
  }
  if (s.tier > s.reachedTier) s.reachedTier = s.tier;

  world.nextResponse = TIER_RESPONSE[Math.min(s.tier, TIER_RESPONSE.length - 1)];
}

/** The single largest contributor, used by the failure screen and the interlude cards. */
export function topCause(world: World): { cause: SuspicionCause; amount: number } | null {
  const causes = world.suspicion.causes;
  let bestCause: SuspicionCause | null = null;
  let best = 0;
  (Object.keys(causes) as SuspicionCause[]).forEach((k) => {
    if (causes[k] > best) {
      best = causes[k];
      bestCause = k;
    }
  });
  return bestCause === null ? null : { cause: bestCause, amount: best };
}

export function tierName(tier: number): string {
  return TIER_NAMES[Math.min(tier, TIER_NAMES.length - 1)];
}

export function suspicionFraction(world: World): number {
  return clamp01(world.suspicion.value / SUSPICION_MAX);
}

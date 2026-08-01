import { clamp01 } from '../core/math.ts';
import {
  NIGHT_SUSPICION_FLOOR,
  SUSPICION_DECAY,
  SUSPICION_MAX,
  SUSPICION_PEAK_FLOOR,
  SUSPICION_WEIGHTS,
  TIER_THRESHOLDS,
} from './constants.ts';
import type { SuspicionCause } from './types.ts';
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
  // Only surface a new "last cause" for contributions the player can actually perceive.
  if (amount >= 0.05) {
    s.lastCause = cause;
    s.lastCauseTime = world.time;
  }
  world.events.push({ t: 'suspicion', delta: amount, cause, x, y });
}

export function updateSuspicion(world: World, dt: number): void {
  const s = world.suspicion;

  // ── Continuous evidence.
  if (world.exposedWorkers > 0) {
    addSuspicion(
      world,
      'traffic',
      SUSPICION_WEIGHTS.traffic * Math.min(world.exposedWorkers, 24) * dt,
      0,
      0,
    );
  }
  if (world.exposedTrail > 0) {
    addSuspicion(
      world,
      'droppings',
      SUSPICION_WEIGHTS.droppings * Math.min(world.exposedTrail / 12, 4) * dt,
      0,
      0,
    );
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
    addSuspicion(world, 'corpse', SUSPICION_WEIGHTS.corpse * Math.min(openCorpses, 10) * dt, 0, 0);
  }

  // ── Drained food is evidence the humans notice on their own.
  for (let i = 0; i < world.resources.length; i++) {
    const r = world.resources[i];
    if (r.depleted && !r.depletedReported && r.kind === 'food') {
      r.depletedReported = true;
      addSuspicion(world, 'depleted', SUSPICION_WEIGHTS.depleted, r.x, r.y);
    }
  }

  // ── Decay toward a floor that the run's own peak sets.
  s.floor = Math.max(NIGHT_SUSPICION_FLOOR[world.night], s.peak * SUSPICION_PEAK_FLOOR);
  if (s.value > s.floor) {
    s.value = Math.max(s.floor, s.value - SUSPICION_DECAY * dt);
  }

  // ── Tier transitions, one-shot and ordered.
  let tier = 0;
  for (let i = 0; i < TIER_THRESHOLDS.length; i++) {
    if (s.value >= TIER_THRESHOLDS[i]) tier = i + 1;
  }
  if (tier !== s.tier) {
    if (tier > s.tier) world.events.push({ t: 'tier', tier });
    s.tier = tier;
  }
  if (tier > s.reachedTier) s.reachedTier = tier;

  world.nextResponse = TIER_RESPONSE[Math.min(tier, TIER_RESPONSE.length - 1)];
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

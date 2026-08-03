import { clamp01 } from '../core/math.ts';
import { t } from '../i18n/index.ts';
import {
  TRAFFIC_EVIDENCE_CAP,
  TRAIL_EVIDENCE_CAP,
  SUSPICION_DECAY,
  SUSPICION_MAX,
  SUSPICION_PEAK_FLOOR,
  SUSPICION_WEIGHTS,
  TIER_THRESHOLDS,
} from './constants.ts';
import { EVIDENCE_BASELINE } from './constants.ts';
import { depositHeat } from './heat.ts';
import type { SuspicionCause } from './types.ts';

/** How much regional heat one point of evidence deposits. */
const HEAT_PER_EVIDENCE = 0.05;
/** Per point of `seen` evidence. Two sightings in one place is enough to make it known ground. */
const SIGHTING_HEAT = 0.075;
/** Heat per second per unit of above-baseline exposure, for a trail node and for a worker. */
/*
 * Calibrated, not guessed. A cell decays at HEAT_DECAY = 0.021/s toward its own floor, and the
 * household starts acting on a cell at HEAT_KNOWN = 0.42. A route crossing a cell contributes about
 * three sampled nodes; at 0.3 of above-baseline exposure each, these rates take a hammered open
 * corridor from cold to "known" in roughly a minute and leave a covered one below the threshold
 * indefinitely. The first version was eight times hotter and saturated every cell the colony touched
 * within seconds, so the director never stopped acting.
 */
/** Seconds between regional-heat deposit passes. */
const HEAT_INTERVAL = 0.1;
const TRAIL_HEAT_RATE = 0.016;
const WORKER_HEAT_RATE = 0.02;
/** Seconds a tier must hold before the household is allowed to escalate again. */
export const TIER_HOLD = 25;

/** Deposits traffic evidence under each exposed worker, scaled by how exposed that worker is. */
function depositWorkerHeat(world: World, dt: number): void {
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive || w.exposure <= EVIDENCE_BASELINE) continue;
    depositHeat(world, w.x, w.y, (w.exposure - EVIDENCE_BASELINE) * WORKER_HEAT_RATE * dt);
  }
}

/**
 * Deposits trail evidence at each exposed node, scaled by how exposed *that node* is.
 *
 * The first version divided one per-second budget across however many exposed nodes there were,
 * which inverted the whole point of the grid: a short covered line concentrated its small budget
 * into one cell and lit it up, while a long line dragged through the fridge light spread a larger
 * budget so thinly that no cell ever crossed the "known" threshold. Measured on one seed: covered
 * peak 1.000, through-the-light peak 0.017 — the careful player was the one getting scoured.
 *
 * Per-node and unnormalised is the honest model: every metre of open floor you route across is its
 * own piece of evidence, in its own place.
 */
function depositTrailHeat(world: World, dt: number): void {
  for (const r of world.routes) {
    if (!r.linked) continue;
    for (let i = 0; i < r.nodes.length; i += 4) {
      const n = r.nodes[i];
      if (n.exposure <= EVIDENCE_BASELINE) continue;
      depositHeat(world, n.x, n.y, (n.exposure - EVIDENCE_BASELINE) * TRAIL_HEAT_RATE * dt);
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
  t('alert.tier.0'),
  t('alert.tier.1'),
  t('alert.tier.2'),
  t('alert.tier.3'),
  t('alert.tier.4'),
] as const;

export const TIER_RESPONSE: readonly string[] = [
  t('alert.response.0'),
  t('alert.response.1'),
  t('alert.response.2'),
  t('alert.response.3'),
  t('alert.response.4'),
];

export const CAUSE_LABELS: Record<SuspicionCause, string> = {
  seen: t('alert.cause.seen'),
  corpse: t('alert.cause.corpse'),
  traffic: t('alert.cause.traffic'),
  depleted: t('alert.cause.depleted'),
  trap: t('alert.cause.trap'),
  expansion: t('alert.cause.expansion'),
  noise: t('alert.cause.noise'),
  droppings: t('alert.cause.droppings'),
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
  //
  // A *sighting* is weighted far above the rest, because it is categorically better evidence: they
  // did not infer a roach from crumbs, they watched one cross the floor right there. Without this,
  // a player who only ever exposed themselves — no routes, no workers on open ground — drove
  // suspicion to tier 2 while leaving the household nothing to aim at, and no response ever came.
  if (x > 0 || y > 0) {
    depositHeat(world, x, y, amount * (cause === 'seen' ? SIGHTING_HEAT : HEAT_PER_EVIDENCE));
  }
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
  }
  if (world.exposedTrail > 0) {
    const total =
      SUSPICION_WEIGHTS.droppings * Math.min(world.exposedTrail, TRAIL_EVIDENCE_CAP) * dt;
    addSuspicion(world, 'droppings', total, 0, 0);
  }
  // Regional heat is deposited independently of the global evidence caps, so a colony large enough
  // to saturate the traffic cap still tells the household *where* it is working. Batched to 10 Hz
  // with the accumulated dt — identical integral, a tenth of the per-frame cost, and heat moves far
  // too slowly for the granularity to matter.
  world.heatAcc += dt;
  if (world.heatAcc >= HEAT_INTERVAL) {
    depositWorkerHeat(world, world.heatAcc);
    depositTrailHeat(world, world.heatAcc);
    world.heatAcc = 0;
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

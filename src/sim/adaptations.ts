import { t } from '../i18n/index.ts';
import type { World } from './world.ts';

/**
 * Adaptations.
 *
 * The old game had three upgrades that were mandatory, simultaneously affordable and purely numeric —
 * a chore list, not a decision. These are nine adaptations in three families; a run affords about
 * four, and every one of them carries a downside that changes how the rest of the run must be
 * played.
 *
 * Rules this file exists to enforce:
 *   1. A choice is offered at a milestone and must be *taken* — the player picks one of three.
 *   2. Taking one closes that milestone. You cannot buy the whole tree.
 *   3. Every adaptation changes simulation behaviour, not just a displayed number.
 *   4. Every adaptation has a readable cost that a critic can point at.
 */

export type AdaptFamily = 'brood' | 'forage' | 'shadow';

export interface AdaptationSpec {
  id: string;
  family: AdaptFamily;
  tier: 1 | 2 | 3;
  name: string;
  /** What it does, in the player's language. */
  blurb: string;
  /** What it costs you strategically. Always shown next to the benefit. */
  downside: string;
  costFood: number;
  costWater: number;
}

export const ADAPTATIONS: readonly AdaptationSpec[] = [
  // ── Brood: more bodies, sooner, and back faster after a bad night.
  {
    id: 'brood1',
    family: 'brood',
    tier: 1,
    name: t('adaptation.brood1.name'),
    blurb: t('adaptation.brood1.blurb'),
    downside: t('adaptation.brood1.downside'),
    costFood: 24,
    costWater: 14,
  },
  {
    id: 'brood2',
    family: 'brood',
    tier: 2,
    name: t('adaptation.brood2.name'),
    blurb: t('adaptation.brood2.blurb'),
    downside: t('adaptation.brood2.downside'),
    costFood: 52,
    costWater: 34,
  },
  {
    id: 'brood3',
    family: 'brood',
    tier: 3,
    name: t('adaptation.brood3.name'),
    blurb: t('adaptation.brood3.blurb'),
    downside: t('adaptation.brood3.downside'),
    costFood: 74,
    costWater: 48,
  },

  // ── Forage: throughput, and the ability to strip a routine event before it closes.
  {
    id: 'forage1',
    family: 'forage',
    tier: 1,
    name: t('adaptation.forage1.name'),
    blurb: t('adaptation.forage1.blurb'),
    downside: t('adaptation.forage1.downside'),
    costFood: 22,
    costWater: 12,
  },
  {
    id: 'forage2',
    family: 'forage',
    tier: 2,
    name: t('adaptation.forage2.name'),
    blurb: t('adaptation.forage2.blurb'),
    downside: t('adaptation.forage2.downside'),
    costFood: 46,
    costWater: 26,
  },
  {
    id: 'forage3',
    family: 'forage',
    tier: 3,
    name: t('adaptation.forage3.name'),
    blurb: t('adaptation.forage3.blurb'),
    downside: t('adaptation.forage3.downside'),
    costFood: 66,
    costWater: 40,
  },

  // ── Shadow: survive, persist, and disappear when it matters.
  {
    id: 'shadow1',
    family: 'shadow',
    tier: 1,
    name: t('adaptation.shadow1.name'),
    blurb: t('adaptation.shadow1.blurb'),
    downside: t('adaptation.shadow1.downside'),
    costFood: 22,
    costWater: 16,
  },
  {
    id: 'shadow2',
    family: 'shadow',
    tier: 2,
    name: t('adaptation.shadow2.name'),
    blurb: t('adaptation.shadow2.blurb'),
    downside: t('adaptation.shadow2.downside'),
    costFood: 44,
    costWater: 32,
  },
  {
    id: 'shadow3',
    family: 'shadow',
    tier: 3,
    name: t('adaptation.shadow3.name'),
    blurb: t('adaptation.shadow3.blurb'),
    downside: t('adaptation.shadow3.downside'),
    costFood: 60,
    costWater: 46,
  },
] as const;

/**
 * Milestones. Reaching one opens a choice of the three same-tier adaptations; the choice stays open
 * until the player takes it, so it can never be missed by looking away.
 */
export const MILESTONE_POPULATION: readonly number[] = [11, 17, 24, 30];

export interface AdaptationState {
  /** Chosen ids, in order. */
  taken: string[];
  /** Milestones already consumed. */
  milestonesUsed: number;
  /** Ids currently on offer; empty when no choice is pending. */
  offer: string[];
  /** Emergency evacuation charges granted by `shadow3`. */
  evacuations: number;
  /** Seconds left of the post-casualty replacement surge granted by `brood2`. */
  surgeTime: number;
}

export function createAdaptationState(): AdaptationState {
  return { taken: [], milestonesUsed: 0, offer: [], evacuations: 0, surgeTime: 0 };
}

/**
 * Derived multipliers.
 *
 * Recomputed whenever the set changes rather than every step, and read by colony, workers, pheromone
 * and suspicion. Keeping them in one struct is what stops adaptation effects from becoming scattered
 * `if (upgrades.x)` checks nobody can audit.
 */
export interface Traits {
  capacityBonus: number;
  broodRateMult: number;
  nymphTimeMult: number;
  upkeepMult: number;
  carryMult: number;
  harvestTimeMult: number;
  harvestSlotBonus: number;
  depletionMult: number;
  eventYieldMult: number;
  eventDurationMult: number;
  coveredTrailLifeMult: number;
  coveredEvidenceMult: number;
  trafficEvidenceMult: number;
  openEventEvidenceMult: number;
  panicLead: number;
  panicSpeedMult: number;
  refugeReachMult: number;
  haulSpeedMult: number;
}

export function baseTraits(): Traits {
  return {
    capacityBonus: 0,
    broodRateMult: 1,
    nymphTimeMult: 1,
    upkeepMult: 1,
    carryMult: 1,
    harvestTimeMult: 1,
    harvestSlotBonus: 0,
    depletionMult: 1,
    eventYieldMult: 1,
    eventDurationMult: 1,
    coveredTrailLifeMult: 1,
    coveredEvidenceMult: 1,
    trafficEvidenceMult: 1,
    openEventEvidenceMult: 1,
    panicLead: 0,
    panicSpeedMult: 1,
    refugeReachMult: 1,
    haulSpeedMult: 1,
  };
}

export function recomputeTraits(world: World): void {
  const t = baseTraits();
  for (const id of world.adaptations.taken) {
    switch (id) {
      case 'brood1':
        t.capacityBonus += 10;
        t.broodRateMult *= 1.35;
        t.upkeepMult *= 1.25;
        break;
      case 'brood2':
        t.capacityBonus += 14;
        t.upkeepMult *= 1.25;
        break;
      case 'brood3':
        t.capacityBonus += 18;
        t.nymphTimeMult *= 0.5;
        t.upkeepMult *= 1.3;
        t.trafficEvidenceMult *= 1.2;
        break;
      case 'forage1':
        t.carryMult *= 1.45;
        t.depletionMult *= 1.4;
        break;
      case 'forage2':
        t.harvestTimeMult *= 0.5;
        t.harvestSlotBonus += 2;
        t.depletionMult *= 1.4;
        break;
      case 'forage3':
        t.eventYieldMult *= 2;
        t.eventDurationMult *= 1.5;
        t.openEventEvidenceMult *= 2;
        break;
      case 'shadow1':
        t.coveredTrailLifeMult *= 2;
        t.coveredEvidenceMult *= 0.6;
        t.haulSpeedMult *= 0.88;
        break;
      case 'shadow2':
        t.panicLead += 0.5;
        t.panicSpeedMult *= 1.3;
        t.harvestTimeMult *= 1.15;
        break;
      case 'shadow3':
        t.refugeReachMult *= 2;
        t.haulSpeedMult *= 0.85;
        break;
      default:
        break;
    }
  }
  world.traits = t;
}

export function specById(id: string): AdaptationSpec | undefined {
  return ADAPTATIONS.find((a) => a.id === id);
}

/** Opens the next milestone's choice if the colony has grown into it. */
export function checkMilestone(world: World): void {
  const a = world.adaptations;
  if (a.offer.length > 0) return;
  if (a.milestonesUsed >= MILESTONE_POPULATION.length) return;
  const need = MILESTONE_POPULATION[a.milestonesUsed];
  if (world.colony.population < need) return;

  const tier = Math.min(3, a.milestonesUsed + 1) as 1 | 2 | 3;
  const offer: string[] = [];
  for (const family of ['brood', 'forage', 'shadow'] as const) {
    // Offer the family's lowest untaken tier, capped by the milestone's own tier, so a player who
    // has invested in one family is offered its next step rather than something they already own.
    const owned = a.taken.filter((id) => specById(id)?.family === family).length;
    const wanted = Math.min(3, Math.max(owned + 1, 1));
    const pick =
      ADAPTATIONS.find((s) => s.family === family && s.tier === wanted) ??
      ADAPTATIONS.find((s) => s.family === family && s.tier === tier);
    if (pick && !a.taken.includes(pick.id)) offer.push(pick.id);
  }
  if (offer.length === 0) {
    a.milestonesUsed++;
    return;
  }
  a.offer = offer;
  world.events.push({ t: 'adaptOffer' });
}

export type ChooseResult = 'ok' | 'notOffered' | 'tooPoor';

export function chooseAdaptation(world: World, id: string): ChooseResult {
  const a = world.adaptations;
  if (!a.offer.includes(id)) return 'notOffered';
  const spec = specById(id);
  if (!spec) return 'notOffered';
  const c = world.colony;
  if (c.food < spec.costFood || c.water < spec.costWater) return 'tooPoor';

  c.food -= spec.costFood;
  c.water -= spec.costWater;
  a.taken.push(id);
  a.offer = [];
  a.milestonesUsed++;
  if (id === 'shadow3') a.evacuations += 2;
  recomputeTraits(world);
  world.events.push({ t: 'adapt', id, family: spec.family });
  return 'ok';
}

/** The cheapest adaptation currently on offer, so the HUD can name a concrete spend. */
export function cheapestOffer(world: World): AdaptationSpec | null {
  let best: AdaptationSpec | null = null;
  for (const id of world.adaptations.offer) {
    const s = specById(id);
    if (!s) continue;
    if (!best || s.costFood + s.costWater < best.costFood + best.costWater) best = s;
  }
  return best;
}

/**
 * Reserve the colony keeps back when *deciding* whether to buy.
 *
 * A purchase is legal the moment the larder covers its price, but the guidance must not push the
 * player into spending their last mouthful: measured in a real-browser run, buying the first
 * adaptation the instant it became affordable took food from 35 to 1 and the colony lost four
 * roaches to starvation before the next delivery landed. The choice never expires, so waiting a few
 * seconds costs nothing — and this is what turns a trap into a goal.
 */
export const PURCHASE_BUFFER_FOOD = 14;
export const PURCHASE_BUFFER_WATER = 10;

/** Whether taking this adaptation now would leave the colony able to keep feeding itself. */
export function canAffordSafely(world: World, spec: AdaptationSpec): boolean {
  return (
    world.colony.food >= spec.costFood + PURCHASE_BUFFER_FOOD &&
    world.colony.water >= spec.costWater + PURCHASE_BUFFER_WATER
  );
}

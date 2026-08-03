import {
  canAffordSafely,
  cheapestOffer,
  MILESTONE_POPULATION,
  PURCHASE_BUFFER_FOOD,
  PURCHASE_BUFFER_WATER,
  specById,
} from './adaptations.ts';
import { t } from '../i18n/index.ts';
import { MAX_ROUTES } from './constants.ts';
import { activeRoutine, specFor } from './routines.ts';
import {
  heldZones,
  nextZoneToHold,
  zoneAt,
  ZONES,
  ZONES_TO_WIN,
  zoneName,
  type ZoneState,
} from './territory.ts';
import type { World } from './world.ts';

/**
 * Operations.
 *
 * The three-night clock is gone. A run is four operations, and an operation ends when the player has
 * *done* something, not when a stopwatch says so. Time still applies pressure — every operation has a
 * soft limit, and overrunning it raises the household's baseline alert — but it can no longer be the
 * content.
 *
 * This module also owns the objective hierarchy, because the objective is not decoration: it is the
 * contract that the player always knows the current goal, the real blocker, the next unlock and what
 * the household is about to do. Every string here either names an action or names a reason.
 */

export type OperationIndex = 1 | 2 | 3 | 4;

export interface GateProgress {
  have: number;
  need: number;
}

export interface OperationGate {
  id: string;
  /** Short label for the operation card checklist. */
  label: string;
  progress(world: World): GateProgress;
  /** The sentence that tells the player what to do about this gate right now. */
  action(world: World): string;
  /**
   * The reason the player cannot advance, when there is a specific one. Returning null means "just
   * keep doing the action" — a gate that is progressing normally is not blocked.
   */
  blocker(world: World): string | null;
  /** World point the HUD should point at, if the gate has one. */
  target(world: World): { x: number; y: number; label: string } | null;
  /**
   * True when this gate cannot be advanced *right now* through any player action — for example, the
   * routine gate while the house happens to be quiet.
   *
   * A waiting gate is skipped in favour of the next one the player can actually work on. Without
   * this the objective line parked on "wait for the house to move" for a minute at a time while a
   * claimable crack sat unclaimed, which is exactly the decision-free plateau the redesign exists to
   * remove.
   */
  waiting?(world: World): boolean;
  /**
   * What the player is short of, when the gate is blocked purely by a price.
   *
   * Naming the blocker is not enough on its own: a player standing at a crack they cannot afford
   * needs the objective to send them somewhere useful, not to keep telling them to press E. When
   * this returns a shortfall the hierarchy rewrites the objective into "go and earn it" and points
   * at the nearest source.
   */
  shortfall?(world: World): { kind: 'food' | 'water'; amount: number } | null;
}

export interface OperationSpec {
  index: OperationIndex;
  title: string;
  /** The operation card headline, shown on transition. */
  brief: string;
  /** What finishing this operation opens up. Always shown as "Next". */
  nextUnlock: string;
  /** Seconds after which the household gets impatient. Not a fail timer. */
  softTime: number;
  gates: OperationGate[];
}

const linkedRoutes = (world: World, kind: 'food' | 'water'): number => {
  let n = 0;
  for (const r of world.routes) {
    if (!r.linked || !r.resourceId) continue;
    const res = world.resources.find((x) => x.id === r.resourceId);
    if (res && res.kind === kind) n++;
  }
  return n;
};

const servedByLinkedRoute = (world: World, id: string): boolean =>
  world.routes.some((r) => r.linked && r.resourceId === id);

/**
 * The nearest source of a kind that the colony is **not already drawing from**, falling back to the
 * plain nearest when every one of them is served.
 *
 * The unserved preference is the whole point. The shortage objective says "add a second source" and
 * its blocker says "your line is not keeping up" — and it was pointing at the source the player
 * already had a line on, so following the objective exactly meant standing on a working line while
 * the reserve emptied. Measured on a slow host: 320 s, 62 trail nodes laid in total, moisture at
 * zero, twenty-three roaches starved, alert tier 0 — nothing killed that colony but its own
 * unfollowable advice.
 */
const nearestResource = (world: World, kind: 'food' | 'water') => {
  let best: { x: number; y: number; label: string } | null = null;
  let bestD = Infinity;
  let bestServed: { x: number; y: number; label: string } | null = null;
  let bestServedD = Infinity;
  for (const res of world.resources) {
    if (res.kind !== kind || res.depleted || res.unlockOp > world.operation) continue;
    const d = (res.x - world.scout.x) ** 2 + (res.y - world.scout.y) ** 2;
    const here = { x: res.x, y: res.y, label: res.label };
    if (servedByLinkedRoute(world, res.id)) {
      if (d < bestServedD) {
        bestServedD = d;
        bestServed = here;
      }
    } else if (d < bestD) {
      bestD = d;
      best = here;
    }
  }
  return best ?? bestServed;
};

const nearestUnclaimedNest = (world: World) => {
  let best: { x: number; y: number; label: string } | null = null;
  let bestD = Infinity;
  for (const n of world.nests) {
    if (n.claimed || n.unlockOp > world.operation) continue;
    const d = (n.x - world.scout.x) ** 2 + (n.y - world.scout.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: n.x, y: n.y, label: n.label };
    }
  }
  return best;
};

/** Onboarding step index at which the lay key has been shown. */
const LAY_TAUGHT_STEP = 2;

/** An unclaimed, currently-claimable crack inside this region, if there is one. */
const crackIn = (world: World, zone: { x: number; y: number; w: number; h: number }) =>
  world.nests.find(
    (n) =>
      !n.claimed &&
      n.unlockOp <= world.operation &&
      n.x >= zone.x &&
      n.x <= zone.x + zone.w &&
      n.y >= zone.y &&
      n.y <= zone.y + zone.h,
  ) ?? null;

const claimedSatellites = (world: World): number =>
  world.nests.filter((n) => !n.home && n.claimed).length;

const functioningFootholds = (world: World): number =>
  world.nests.filter((n) => n.claimed && n.fn !== null).length;

const supplyGate = (kind: 'food' | 'water', need: number): OperationGate => ({
  id: `${kind}Line`,
  label:
    kind === 'food'
      ? t('op.gate.foodLine', { count: need })
      : t('op.gate.waterLine', { count: need }),
  progress: (w) => ({ have: linkedRoutes(w, kind), need }),
  action: (w) => {
    const target = nearestResource(w, kind);
    const noun = t(kind === 'food' ? 'unit.foodNoun' : 'unit.waterNoun');
    if (!target) return t('op.action.findSource', { noun });
    // The tutorial names the lay key at ~11 s. Until it has, the objective describes the *action*
    // rather than a key the player has not been shown, so the primary instruction is never
    // unexecutable.
    return w.onboarding.step >= LAY_TAUGHT_STEP
      ? t('op.action.layTrail', { label: target.label })
      : t('op.action.bringScentHome', { label: target.label });
  },
  blocker: (w) => {
    if (w.routes.length >= MAX_ROUTES && linkedRoutes(w, kind) < need) {
      return t('op.blocker.routesFull', { max: MAX_ROUTES });
    }
    const half = w.routes.find((r) => !r.linked && r.nodes.length > 4);
    if (half) return t('op.blocker.trailUnfinished');
    return null;
  },
  target: (w) => nearestResource(w, kind),
});

const populationGate = (need: number): OperationGate => ({
  id: `pop${need}`,
  label: t('op.gate.population', { count: need }),
  progress: (w) => ({ have: w.colony.population, need }),
  action: () => t('op.action.keepBothFlowing'),
  blocker: (w) => {
    const c = w.colony;
    if (c.population >= c.capacity) {
      return t('op.blocker.capacityFull', { capacity: c.capacity });
    }
    if (c.water < 12) return t('op.blocker.waterTooLow');
    if (c.food < 20) return t('op.blocker.foodTooLow');
    return null;
  },
  target: (w) => {
    const c = w.colony;
    if (c.population >= c.capacity) return nearestUnclaimedNest(w);
    return nearestResource(w, c.water < c.food ? 'water' : 'food');
  },
});

export const OPERATIONS: readonly OperationSpec[] = [
  {
    index: 1,
    title: t('op.1.title'),
    brief: t('op.1.brief'),
    nextUnlock: t('op.1.unlock'),
    softTime: 165,
    gates: [supplyGate('food', 1), supplyGate('water', 1), populationGate(12)],
  },
  {
    index: 2,
    title: t('op.2.title'),
    brief: t('op.2.brief'),
    nextUnlock: t('op.2.unlock'),
    softTime: 235,
    gates: [
      {
        id: 'routines',
        label: t('op.gate.routines', { count: 2 }),
        progress: (w) => ({ have: w.stats.routinesExploited, need: 2 }),
        action: (w) => {
          const r = activeRoutine(w);
          if (!r) return t('op.action.waitForRoutine');
          const spec = specFor(r.kind);
          if (r.phase === 'incoming') {
            return t('op.action.routineIncoming', {
              title: spec.title,
              counter: spec.counterplay,
            });
          }
          return t('op.action.routineOpen', {
            title: spec.title,
            seconds: Math.ceil(r.timer),
          });
        },
        blocker: (w) => {
          const r = activeRoutine(w);
          if (r && r.phase === 'active' && !r.exploited && w.routes.length >= MAX_ROUTES) {
            return t('op.blocker.routesFullSpill', { max: MAX_ROUTES });
          }
          return null;
        },
        target: (w) => {
          const r = activeRoutine(w);
          return r ? { x: r.x, y: r.y, label: specFor(r.kind).title } : null;
        },
        waiting: (w) => activeRoutine(w) === null,
      },
      {
        id: 'foothold1',
        label: t('op.gate.foothold', { count: 1 }),
        progress: (w) => ({ have: claimedSatellites(w), need: 1 }),
        action: (w) => {
          const n = nearestUnclaimedNest(w);
          return n ? t('op.action.claimNest', { label: n.label }) : t('op.action.scoutForCrack');
        },
        blocker: (w) => {
          const n = w.nests.find((x) => !x.claimed && !x.home && x.unlockOp <= w.operation);
          if (!n) return null;
          if (w.colony.food < n.costFood) {
            return t('op.blocker.nestCostFood', {
              label: n.label,
              need: n.costFood,
              have: Math.floor(w.colony.food),
            });
          }
          if (w.colony.water < n.costWater) {
            return t('op.blocker.nestCostWater', {
              label: n.label,
              need: n.costWater,
              have: Math.floor(w.colony.water),
            });
          }
          return null;
        },
        target: (w) => nearestUnclaimedNest(w),
        shortfall: (w) => {
          const n = w.nests.find((x) => !x.claimed && !x.home && x.unlockOp <= w.operation);
          if (!n) return null;
          if (w.colony.food < n.costFood)
            return { kind: 'food', amount: n.costFood - w.colony.food };
          if (w.colony.water < n.costWater)
            return { kind: 'water', amount: n.costWater - w.colony.water };
          return null;
        },
      },
    ],
  },
  {
    index: 3,
    title: t('op.3.title'),
    brief: t('op.3.brief'),
    nextUnlock: t('op.3.unlock'),
    softTime: 280,
    gates: [
      {
        id: 'adapt3',
        label: t('op.gate.adaptations', { count: 3 }),
        progress: (w) => ({ have: w.adaptations.taken.length, need: 3 }),
        action: (w) => {
          if (w.adaptations.offer.length > 0) return t('op.action.pickAdaptation');
          const next = MILESTONE_POPULATION[w.adaptations.milestonesUsed];
          return next
            ? t('op.action.growToMilestone', { count: next })
            : t('op.action.keepGrowing');
        },
        blocker: (w) => {
          const offer = cheapestOffer(w);
          if (offer && w.colony.food < offer.costFood) {
            return t('op.blocker.adaptCostFood', {
              need: offer.costFood,
              have: Math.floor(w.colony.food),
            });
          }
          if (offer && w.colony.water < offer.costWater) {
            return t('op.blocker.adaptCostWater', {
              need: offer.costWater,
              have: Math.floor(w.colony.water),
            });
          }
          return null;
        },
        target: () => null,
      },
      {
        id: 'functions2',
        label: t('op.gate.functions', { count: 2 }),
        progress: (w) => ({ have: functioningFootholds(w), need: 2 }),
        action: (w) => {
          const n = w.nests.find((x) => x.claimed && !x.home && x.fn === null);
          if (n) return t('op.action.fitOutHere', { label: n.label });
          const un = nearestUnclaimedNest(w);
          return un
            ? t('op.action.claimThenFit', { label: un.label })
            : t('op.action.claimAnother');
        },
        blocker: (w) => {
          const n = w.nests.find((x) => x.claimed && !x.home && x.fn === null);
          if (!n) return null;
          if (w.colony.food < n.fitFood) {
            return t('op.blocker.fitCostFood', {
              label: n.label,
              need: n.fitFood,
              have: Math.floor(w.colony.food),
            });
          }
          if (w.colony.water < n.fitWater) {
            return t('op.blocker.fitCostWater', {
              label: n.label,
              need: n.fitWater,
              have: Math.floor(w.colony.water),
            });
          }
          return null;
        },
        target: (w) => {
          const n = w.nests.find((x) => x.claimed && !x.home && x.fn === null);
          return n ? { x: n.x, y: n.y, label: n.label } : nearestUnclaimedNest(w);
        },
        shortfall: (w) => {
          const n = w.nests.find((x) => x.claimed && !x.home && x.fn === null);
          if (!n) return null;
          if (w.colony.food < n.fitFood) return { kind: 'food', amount: n.fitFood - w.colony.food };
          if (w.colony.water < n.fitWater)
            return { kind: 'water', amount: n.fitWater - w.colony.water };
          return null;
        },
      },
      populationGate(26),
    ],
  },
  {
    index: 4,
    title: t('op.4.title'),
    brief: t('op.4.brief'),
    nextUnlock: t('op.4.unlock'),
    softTime: 320,
    gates: [
      {
        id: 'zones',
        label: t('op.gate.zones', { count: ZONES_TO_WIN }),
        progress: (w) => ({ have: heldZones(w).length, need: ZONES_TO_WIN }),
        action: (w) => {
          const next = nextZoneToHold(w);
          if (!next) return t('op.action.holdWhatYouHave');
          if (w.finalResponse && heldZones(w).length >= ZONES_TO_WIN) {
            return t('op.action.holdInsurance');
          }
          const pct = Math.round(next.state.hold * 100);
          // The strongest move in the final operation is to own a crack in the region: a claimed
          // crack keeps holding it while the colony is sheltering inside. That is not discoverable
          // from a hold percentage, so the objective says it outright.
          const crack = crackIn(w, next.spec);
          if (crack) {
            return t('op.action.claimCrackInZone', {
              label: crack.label,
              zone: next.spec.name,
            });
          }
          if (!next.state.routed)
            return t('op.action.routeZone', { zone: next.spec.name, percent: pct });
          if (next.state.workers === 0)
            return t('op.action.zoneEmpty', { zone: next.spec.name, percent: pct });
          return t('op.action.zoneStaff', { zone: next.spec.name, percent: pct });
        },
        blocker: (w) => {
          const next = nextZoneToHold(w);
          if (next?.state.contested) {
            return t('op.blocker.zoneContested', { zone: next.spec.name });
          }
          return null;
        },
        shortfall: (w) => {
          const next = nextZoneToHold(w);
          const crack = next ? crackIn(w, next.spec) : null;
          if (!crack) return null;
          if (w.colony.food < crack.costFood) {
            return { kind: 'food' as const, amount: crack.costFood - w.colony.food };
          }
          if (w.colony.water < crack.costWater) {
            return { kind: 'water' as const, amount: crack.costWater - w.colony.water };
          }
          return null;
        },
        target: (w) => {
          const next = nextZoneToHold(w);
          const crack = next ? crackIn(w, next.spec) : null;
          if (crack) return { x: crack.x, y: crack.y, label: crack.label };
          return next
            ? {
                x: next.spec.x + next.spec.w / 2,
                y: next.spec.y + next.spec.h / 2,
                label: next.spec.name,
              }
            : null;
        },
      },
      {
        id: 'survive',
        label: t('op.gate.survive'),
        progress: (w) => ({
          have: w.finalResponse ? Math.min(1, w.finalResponseTime / FINAL_RESPONSE_LENGTH) : 0,
          need: 1,
        }),
        action: (w) =>
          w.finalResponse
            ? t('op.action.shelterNow', {
                seconds: Math.ceil(FINAL_RESPONSE_LENGTH - w.finalResponseTime),
              })
            : t('op.action.triggerFinal'),
        blocker: (w) =>
          w.finalResponse && claimedSatellites(w) === 0 ? t('op.blocker.noShelter') : null,
        target: () => null,
      },
    ],
  },
] as const;

/** How long the final extermination response runs. Surviving it is the win. */
export const FINAL_RESPONSE_LENGTH = 62;

export function operationSpec(index: OperationIndex): OperationSpec {
  return OPERATIONS[index - 1];
}

export function gateSatisfied(world: World, gate: OperationGate): boolean {
  const p = gate.progress(world);
  return p.have >= p.need;
}

/**
 * The gate the player should be working on.
 *
 * Gates are ordered, but an unsatisfied gate that cannot be advanced right now yields to the next
 * one that can. Only when every remaining gate is waiting does the objective say so.
 */
export function currentGate(world: World): OperationGate | null {
  const spec = operationSpec(world.operation);
  let firstUnsatisfied: OperationGate | null = null;
  for (const g of spec.gates) {
    if (gateSatisfied(world, g)) continue;
    if (!firstUnsatisfied) firstUnsatisfied = g;
    if (!g.waiting?.(world)) return g;
  }
  return firstUnsatisfied;
}

export function operationComplete(world: World): boolean {
  return currentGate(world) === null;
}

/* ── Objective hierarchy ───────────────────────────────────────────────────── */

export interface Hud {
  /** "Operation 2 — Infiltrate the routines" */
  operation: string;
  /** The one thing to do right now. Always an action, never a status. */
  objective: string;
  /** The real reason progress is stalled, or null. */
  blocker: string | null;
  /** What completing the current operation opens. */
  nextUnlock: string;
  /** Household alert, why it is there, and what it is likely to do. */
  forecast: string;
  /** Counterplay hint for the current household state, once the player has met it. */
  counterplay: string | null;
  /** Checklist for the operation card and the corner readout. */
  checklist: { label: string; have: number; need: number; done: boolean }[];
  /** World point the objective refers to. */
  target: { x: number; y: number; label: string } | null;
  /**
   * Why the game believes this is the most useful thing to say. Exposed to the test harness so a
   * regression can assert *which* rule produced the objective, not just that a string exists.
   */
  source: string;
}

/**
 * Resolves what to tell the player.
 *
 * Priority order is deliberate: a free decision beats a timed opportunity, a timed opportunity beats
 * a slow-burning shortage, and a shortage beats routine progress. Anything that arrives above the
 * gate objective is by definition a *new* thing to think about, which is what keeps the measured
 * plateau under the 45-second gate.
 */
export function resolveHud(world: World): Hud {
  const spec = operationSpec(world.operation);
  const gate = currentGate(world);
  const checklist = spec.gates.map((g) => {
    const p = g.progress(world);
    return { label: g.label, have: p.have, need: p.need, done: p.have >= p.need };
  });

  const base: Hud = {
    operation: t('op.title', { index: spec.index, title: spec.title }),
    objective: gate ? gate.action(world) : t('op.complete'),
    blocker: gate ? gate.blocker(world) : null,
    nextUnlock: spec.nextUnlock,
    forecast: world.forecast,
    counterplay: world.counterplay,
    checklist,
    target: gate ? gate.target(world) : null,
    source: gate ? `gate:${gate.id}` : 'operation:complete',
  };

  // 0. The extermination outranks everything.
  //
  //    It did not, and the result was the game telling the player to chase crumbs during its own
  //    climax: a routine is incoming-or-active about two thirds of the time, and routines sat above
  //    threat advice in this list. Captured in the shipped evidence — forecast "EXTERMINATION — 1s",
  //    objective "Washing up in 5s".
  //    And it must not be one motionless sentence for the whole 62 seconds either. Measured on the
  //    shadow run: the objective line did not change for **53.6 s**, ending at t = 452.8 — past the
  //    contract's own 45-second decision gate, and at the one moment the player is watching it
  //    hardest. The climax now reads the fight: which cloud is where, which region is slipping,
  //    how much of it is left. Same instruction, live state.
  if (world.finalResponse) {
    const held = heldZones(world);
    const left = Math.max(0, Math.ceil(FINAL_RESPONSE_LENGTH - world.finalResponseTime));
    const cloud = world.sprays.find((s) => !s.done);
    const hitZone = cloud ? zoneAt(cloud.x, cloud.y) : null;
    // A region that counts today but is falling is the one worth a body right now.
    let slipping: ZoneState | null = null;
    for (const z of world.zones) {
      if (!z.held || !z.contested) continue;
      if (!slipping || z.hold < slipping.hold) slipping = z;
    }

    if (hitZone) {
      base.objective = t('objective.final.sprayOnZone', { zone: zoneName(hitZone.id) });
      base.target = { x: cloud!.x, y: cloud!.y, label: zoneName(hitZone.id) };
    } else if (held.length < ZONES_TO_WIN) {
      const next = nextZoneToHold(world);
      base.objective = next
        ? t('objective.final.regain', {
            held: held.length,
            need: ZONES_TO_WIN,
            zone: zoneName(next.state.id),
            seconds: left,
          })
        : t('objective.final.holding', {
            held: held.length,
            need: ZONES_TO_WIN,
            seconds: left,
          });
      base.target = next
        ? { x: next.spec.x, y: next.spec.y, label: zoneName(next.state.id) }
        : null;
    } else if (slipping) {
      const spec = ZONES.find((z) => z.id === slipping.id) ?? null;
      base.objective = t('objective.final.slipping', {
        need: ZONES_TO_WIN,
        zone: zoneName(slipping.id),
        seconds: left,
      });
      base.target = spec ? { x: spec.x, y: spec.y, label: zoneName(spec.id) } : base.target;
    } else {
      base.objective =
        world.threatAdvice ??
        t('objective.final.stayHidden', { seconds: left, need: ZONES_TO_WIN });
    }
    base.source = 'final';
    return base;
  }

  // 1. A pending adaptation the player can actually afford. This is a permanent decision with no
  //    downside to taking it now, so nothing outranks it.
  //
  //    An offer the player *cannot* afford must NOT outrank anything. Found by playing it: an
  //    unaffordable offer pinned the objective to "Choose an adaptation — press 1, 2 or 3" while the
  //    larder emptied, the shortage warning never got a turn, and the colony starved to death being
  //    told to spend food it did not have. An offer never expires, so deferring it costs nothing.
  const offer = cheapestOffer(world);
  const affordable = offer !== null && canAffordSafely(world, offer);
  if (offer && affordable) {
    base.objective = t('objective.adaptation.choose');
    base.source = 'adaptation:offer';
    return base;
  }
  const offerBlocker = offer
    ? t('op.blocker.adaptationSaving', {
        name: offer.name,
        shortfall:
          world.colony.food < offer.costFood + PURCHASE_BUFFER_FOOD
            ? t('op.blocker.shortfallFood', {
                amount: Math.max(
                  1,
                  Math.ceil(offer.costFood + PURCHASE_BUFFER_FOOD - world.colony.food),
                ),
              })
            : t('op.blocker.shortfallWater', {
                amount: Math.max(
                  1,
                  Math.ceil(offer.costWater + PURCHASE_BUFFER_WATER - world.colony.water),
                ),
              }),
      })
    : null;

  if (offerBlocker) base.blocker = base.blocker ?? offerBlocker;

  // 2. A live household routine is a closing window — but never more urgent than having a supply
  //    line at all. A colony with no food line has nothing more important to do than get one, and
  //    chasing a spill instead is how a run starves in the middle of a windfall.
  const routine = activeRoutine(world);
  const needsSupply = gate !== null && gate.id.endsWith('Line');
  // A routine outranks the operation only while it is still an *opportunity*. Once the colony is
  // already taking it, the countdown is a status readout, not a decision — and leaving it at the top
  // of the hierarchy made the objective line a spill timer for 58 % of a measured run.
  const routineWorthChasing =
    routine !== null && (routine.phase === 'incoming' || !routine.exploited);
  if (routine && routineWorthChasing && !needsSupply) {
    const rs = specFor(routine.kind);
    if (routine.phase === 'incoming') {
      base.objective = t('objective.routine.incoming', {
        title: rs.title,
        seconds: Math.ceil(routine.timer),
        counter: rs.counterplay,
      });
      base.source = 'routine:incoming';
    } else if (!routine.exploited) {
      base.objective = t('objective.routine.active', {
        title: rs.title,
        seconds: Math.ceil(routine.timer),
      });
      base.source = 'routine:active';
    } else {
      base.objective = t('objective.routine.harvesting', {
        title: rs.title,
        seconds: Math.ceil(routine.timer),
      });
      base.source = 'routine:harvesting';
    }
    base.target = { x: routine.x, y: routine.y, label: rs.title };
    return base;
  }

  // 3. A shortage the player can still act on — unless a spill of exactly that kind is open right
  //    now, in which case the spill *is* the answer and priority 2 already said so.
  if (world.shortage) {
    const kind = world.shortage;
    base.objective = t(kind === 'food' ? 'objective.shortage.food' : 'objective.shortage.water');
    base.blocker =
      linkedRoutes(world, kind) === 0
        ? t(kind === 'food' ? 'objective.shortage.noFoodLine' : 'objective.shortage.noWaterLine')
        : t(kind === 'food' ? 'objective.shortage.foodBehind' : 'objective.shortage.waterBehind');
    base.target = nearestResource(world, kind);
    base.source = 'shortage';
    return base;
  }

  // 4. A live threat sitting on the colony's own infrastructure.
  if (world.threatAdvice) {
    base.objective = world.threatAdvice;
    base.source = 'threat';
    return base;
  }

  // 4b. A gate blocked purely by a price sends the player to earn the price.
  if (gate?.shortfall) {
    const short = gate.shortfall(world);
    if (short) {
      base.objective = t(
        short.kind === 'food' ? 'objective.saving.food' : 'objective.saving.water',
        { amount: Math.ceil(short.amount) },
      );
      base.target = nearestResource(world, short.kind) ?? base.target;
      base.source = `gate:${gate.id}:saving`;
      return base;
    }
  }

  // 5. A capped resource must always name a spend. This is the rule the old build broke.
  const capped = cappedAdvice(world);
  if (capped && offer && !affordable) {
    // A reserve at its ceiling while an offer is unaffordable means the *other* reserve is the
    // bottleneck; say so rather than telling the player to spend what they have plenty of.
    base.objective = t(
      world.colony.food < offer.costFood
        ? 'objective.saving.forAdaptFood'
        : 'objective.saving.forAdaptWater',
      // `offer` is non-null in this branch, so `offerBlocker` is too; the fallback only satisfies
      // the type system.
      { blocker: offerBlocker ?? '' },
    );
    base.target = nearestResource(world, world.colony.food < offer.costFood ? 'food' : 'water');
    base.source = 'adaptation:saving';
    return base;
  }
  if (capped) {
    base.objective = capped.text;
    base.target = capped.target ?? base.target;
    base.source = capped.source;
    return base;
  }

  return base;
}

/**
 * What to do with a full larder.
 *
 * The measured baseline sat at food cap for 58 % of a run with nothing to spend it on. The rule now
 * is absolute: if a reserve is at or near its ceiling, this function names a concrete spend, the
 * thing that would raise the ceiling, or the real bottleneck. It may never return null while a
 * reserve is capped.
 */
export function cappedAdvice(
  world: World,
): { text: string; source: string; target: { x: number; y: number; label: string } | null } | null {
  const c = world.colony;
  const foodFull = c.food >= c.foodCap - 2;
  const waterFull = c.water >= c.waterCap - 2;
  if (!foodFull && !waterFull) return null;
  const subject = t(
    foodFull && waterFull
      ? 'objective.capped.subjectBoth'
      : foodFull
        ? 'objective.capped.subjectFood'
        : 'objective.capped.subjectWater',
  );

  // Something to buy right now?
  const offer = cheapestOffer(world);
  if (offer && canAffordSafely(world, offer)) {
    return {
      text: t('objective.capped.adaptation', {
        subject,
        name: offer.name,
        cost: offer.costFood,
      }),
      source: 'capped:adaptation',
      target: null,
    };
  }
  const claimable = world.nests.find(
    (n) =>
      !n.claimed && n.unlockOp <= world.operation && c.food >= n.costFood && c.water >= n.costWater,
  );
  if (claimable) {
    return {
      text: t('objective.capped.claim', {
        subject,
        label: claimable.label,
        cost: t('unit.costBothProse', {
          food: claimable.costFood,
          water: claimable.costWater,
        }),
      }),
      source: 'capped:claim',
      target: { x: claimable.x, y: claimable.y, label: claimable.label },
    };
  }
  const fittable = world.nests.find(
    (n) => n.claimed && !n.home && n.fn === null && c.food >= n.fitFood && c.water >= n.fitWater,
  );
  if (fittable) {
    return {
      text: t('objective.capped.fit', {
        subject,
        label: fittable.label,
        cost: t('unit.costBothProse', { food: fittable.fitFood, water: fittable.fitWater }),
      }),
      source: 'capped:fit',
      target: { x: fittable.x, y: fittable.y, label: fittable.label },
    };
  }
  const damaged = world.nests.find((n) => n.claimed && n.integrity < 0.98);
  if (damaged && c.water > 20) {
    return {
      text: t('objective.capped.repair', { subject, label: damaged.label }),
      source: 'capped:repair',
      target: { x: damaged.x, y: damaged.y, label: damaged.label },
    };
  }
  // Nothing affordable is left. From here the answer must be something the player can *do* — this
  // function had two branches that named an action it had already ruled out one line earlier.
  const buildable = world.nests.some(
    (n) => (!n.claimed && n.unlockOp <= world.operation) || (n.claimed && !n.home && n.fn === null),
  );
  if (c.population >= c.capacity && buildable) {
    const n = world.nests.find(
      (x) =>
        (!x.claimed && x.unlockOp <= world.operation) || (x.claimed && !x.home && x.fn === null),
    );
    const need = n
      ? n.claimed
        ? t('unit.costBothProse', { food: n.fitFood, water: n.fitWater })
        : t('unit.costBothProse', { food: n.costFood, water: n.costWater })
      : '';
    return {
      text: t('objective.capped.capacity', {
        subject,
        capacity: c.capacity,
        label: n ? n.label : '',
        cost: need,
      }),
      source: 'capped:capacity',
      target: n ? { x: n.x, y: n.y, label: n.label } : null,
    };
  }
  const next = MILESTONE_POPULATION[world.adaptations.milestonesUsed];
  if (next && c.population < next) {
    return {
      text: t('objective.capped.milestone', { subject, count: next }),
      source: 'capped:milestone',
      target: null,
    };
  }
  const zone = world.operation >= 4 ? nextZoneToHold(world) : null;
  if (zone) {
    return {
      text: t('objective.capped.territory', { subject, zone: zone.spec.name }),
      source: 'capped:territory',
      target: {
        x: zone.spec.x + zone.spec.w / 2,
        y: zone.spec.y + zone.spec.h / 2,
        label: zone.spec.name,
      },
    };
  }
  return {
    text: t('objective.capped.hold', { subject }),
    source: 'capped:hold',
    target: null,
  };
}

export function operationCardLines(world: World): string[] {
  const spec = operationSpec(world.operation);
  return [spec.brief, ...spec.gates.map((g) => g.label)];
}

export function takenAdaptationNames(world: World): string[] {
  return world.adaptations.taken.map((id) => specById(id)?.name ?? id);
}

export function heldZoneNames(world: World): string[] {
  return heldZones(world).map((z) => zoneName(z.id));
}

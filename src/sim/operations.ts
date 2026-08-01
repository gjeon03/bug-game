import {
  canAffordSafely,
  cheapestOffer,
  MILESTONE_POPULATION,
  PURCHASE_BUFFER_FOOD,
  PURCHASE_BUFFER_WATER,
  specById,
} from './adaptations.ts';
import { MAX_ROUTES } from './constants.ts';
import { activeRoutine, specFor } from './routines.ts';
import { heldZones, nextZoneToHold, ZONES_TO_WIN, zoneName } from './territory.ts';
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

const nearestResource = (world: World, kind: 'food' | 'water') => {
  let best: { x: number; y: number; label: string } | null = null;
  let bestD = Infinity;
  for (const res of world.resources) {
    if (res.kind !== kind || res.depleted || res.unlockOp > world.operation) continue;
    const d = (res.x - world.scout.x) ** 2 + (res.y - world.scout.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: res.x, y: res.y, label: res.label };
    }
  }
  return best;
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

/** Region names are authored lower-case ("the sink run"); this starts a sentence with one. */
/** Onboarding step index at which the lay key has been shown. */
const LAY_TAUGHT_STEP = 2;

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

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
  label: kind === 'food' ? `${need} food line${need > 1 ? 's' : ''}` : 'A moisture line',
  progress: (w) => ({ have: linkedRoutes(w, kind), need }),
  action: (w) => {
    const target = nearestResource(w, kind);
    const noun = kind === 'food' ? 'food' : 'moisture';
    if (!target) return `Find a ${noun} source — scout away from the crack.`;
    // The tutorial names the lay key at ~11 s. Until it has, the objective describes the *action*
    // rather than a key the player has not been shown, so the primary instruction is never
    // unexecutable.
    return w.onboarding.step >= LAY_TAUGHT_STEP
      ? `Walk to ${target.label}, then walk home holding the lay key to leave a trail.`
      : `Walk to ${target.label} — then bring the scent home.`;
  },
  blocker: (w) => {
    if (w.routes.length >= MAX_ROUTES && linkedRoutes(w, kind) < need) {
      return `All ${MAX_ROUTES} trails are in use — erase one before laying another.`;
    }
    const half = w.routes.find((r) => !r.linked && r.nodes.length > 4);
    if (half) return 'Your last trail does not reach both a source and a nest — finish the walk.';
    return null;
  },
  target: (w) => nearestResource(w, kind),
});

const populationGate = (need: number): OperationGate => ({
  id: `pop${need}`,
  label: `${need} roaches`,
  progress: (w) => ({ have: w.colony.population, need }),
  action: () => 'Keep both reserves flowing — the colony grows on food and moisture together.',
  blocker: (w) => {
    const c = w.colony;
    if (c.population >= c.capacity) {
      return `Nest capacity is full at ${c.capacity}. Claim a foothold or take a brood adaptation to raise it.`;
    }
    if (c.water < 12) return 'Moisture is too low to raise brood. Get a moisture line running.';
    if (c.food < 20) return 'Food is too low to raise brood. Get a food line running.';
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
    title: 'Establish the nest',
    brief:
      'Get out of the wall. Find something to eat and something to drink, and connect both to home.',
    nextUnlock: 'The household starts its night routines — and those are opportunities.',
    softTime: 165,
    gates: [supplyGate('food', 1), supplyGate('water', 1), populationGate(12)],
  },
  {
    index: 2,
    title: 'Infiltrate the routines',
    brief:
      'The house is awake in bursts. Be standing where the crumbs land, and get out before the light does.',
    nextUnlock: 'Adaptations: the colony starts specialising, and you choose how.',
    softTime: 235,
    gates: [
      {
        id: 'routines',
        label: 'Exploit 2 household routines',
        progress: (w) => ({ have: w.stats.routinesExploited, need: 2 }),
        action: (w) => {
          const r = activeRoutine(w);
          if (!r) return 'Wait for the house to move — then get a trail onto whatever it drops.';
          const spec = specFor(r.kind);
          if (r.phase === 'incoming') return `${spec.title} incoming — ${spec.counterplay}`;
          return `${spec.title} is open for ${Math.ceil(r.timer)}s — run a trail to it now.`;
        },
        blocker: (w) => {
          const r = activeRoutine(w);
          if (r && r.phase === 'active' && !r.exploited && w.routes.length >= MAX_ROUTES) {
            return `All ${MAX_ROUTES} trails are in use — erase one to reach the spill in time.`;
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
        label: 'Claim a satellite foothold',
        progress: (w) => ({ have: claimedSatellites(w), need: 1 }),
        action: (w) => {
          const n = nearestUnclaimedNest(w);
          return n
            ? `Walk to ${n.label} and press E to claim it.`
            : 'Scout the baseboards for a crack.';
        },
        blocker: (w) => {
          const n = w.nests.find((x) => !x.claimed && !x.home && x.unlockOp <= w.operation);
          if (!n) return null;
          if (w.colony.food < n.costFood) {
            return `${n.label} needs ${n.costFood} food — you have ${Math.floor(w.colony.food)}.`;
          }
          if (w.colony.water < n.costWater) {
            return `${n.label} needs ${n.costWater} moisture — you have ${Math.floor(w.colony.water)}.`;
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
    title: 'Specialise the infestation',
    brief:
      'Colonies that survive are colonies that commit. Pick what your roaches become — you cannot have all of it.',
    nextUnlock: 'The kitchen itself: hold three regions and ride out what the household sends.',
    softTime: 280,
    gates: [
      {
        id: 'adapt3',
        label: 'Choose 3 adaptations',
        progress: (w) => ({ have: w.adaptations.taken.length, need: 3 }),
        action: (w) => {
          if (w.adaptations.offer.length > 0) return 'Pick an adaptation — press 1, 2 or 3.';
          const next = MILESTONE_POPULATION[w.adaptations.milestonesUsed];
          return next
            ? `Grow to ${next} roaches to open the next adaptation.`
            : 'Keep the colony growing.';
        },
        blocker: (w) => {
          const offer = cheapestOffer(w);
          if (offer && w.colony.food < offer.costFood) {
            return `The cheapest adaptation costs ${offer.costFood} food — you have ${Math.floor(w.colony.food)}.`;
          }
          if (offer && w.colony.water < offer.costWater) {
            return `The cheapest adaptation costs ${offer.costWater} moisture — you have ${Math.floor(w.colony.water)}.`;
          }
          return null;
        },
        target: () => null,
      },
      {
        id: 'functions2',
        label: 'Install 2 foothold functions',
        progress: (w) => ({ have: functioningFootholds(w), need: 2 }),
        action: (w) => {
          const n = w.nests.find((x) => x.claimed && !x.home && x.fn === null);
          if (n) return `Stand in ${n.label} and press E to fit it out.`;
          const un = nearestUnclaimedNest(w);
          return un ? `Claim ${un.label} first, then fit it out.` : 'Claim another crack.';
        },
        blocker: (w) => {
          const n = w.nests.find((x) => x.claimed && !x.home && x.fn === null);
          if (!n) return null;
          if (w.colony.food < n.fitFood) {
            return `Fitting out ${n.label} needs ${n.fitFood} food — you have ${Math.floor(w.colony.food)}.`;
          }
          if (w.colony.water < n.fitWater) {
            return `Fitting out ${n.label} needs ${n.fitWater} moisture — you have ${Math.floor(w.colony.water)}.`;
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
    title: 'Claim the kitchen',
    brief: 'Three regions, held at once, while they come for you. This is the part they remember.',
    nextUnlock: 'The kitchen is yours.',
    softTime: 320,
    gates: [
      {
        id: 'zones',
        label: `Hold ${ZONES_TO_WIN} regions at once`,
        progress: (w) => ({ have: heldZones(w).length, need: ZONES_TO_WIN }),
        action: (w) => {
          const next = nextZoneToHold(w);
          if (!next) return 'Hold what you have.';
          const pct = Math.round(next.state.hold * 100);
          // The strongest move in the final operation is to own a crack in the region: a claimed
          // crack keeps holding it while the colony is sheltering inside. That is not discoverable
          // from a hold percentage, so the objective says it outright.
          const crack = crackIn(w, next.spec);
          if (crack) {
            return `Claim ${crack.label} — a crack you own holds ${next.spec.name} even while the colony is hiding.`;
          }
          if (!next.state.routed)
            return `Run a trail through ${next.spec.name} — it holds at ${pct}%.`;
          if (next.state.workers === 0)
            return `${sentence(next.spec.name)} has a trail but nobody on it (${pct}%).`;
          return `Keep roaches working ${next.spec.name} — ${pct}% held.`;
        },
        blocker: (w) => {
          const next = nextZoneToHold(w);
          if (next?.state.contested) {
            return `${sentence(next.spec.name)} is being worked by the household — hold is falling while they are there.`;
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
        label: 'Survive the extermination',
        progress: (w) => ({
          have: w.finalResponse ? Math.min(1, w.finalResponseTime / FINAL_RESPONSE_LENGTH) : 0,
          need: 1,
        }),
        action: (w) =>
          w.finalResponse
            ? `Get everyone into claimed cracks — ${Math.ceil(FINAL_RESPONSE_LENGTH - w.finalResponseTime)}s left.`
            : 'Hold three regions to trigger the household’s last answer.',
        blocker: (w) =>
          w.finalResponse && claimedSatellites(w) === 0
            ? 'Only the home crack can shelter anyone — a second claimed crack would split the risk.'
            : null,
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
    operation: `Operation ${spec.index} — ${spec.title}`,
    objective: gate ? gate.action(world) : 'Operation complete.',
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
  if (world.finalResponse) {
    base.objective =
      world.threatAdvice ?? 'Get the colony into claimed cracks and hold the regions you have.';
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
    base.objective = 'Choose an adaptation — press 1, 2 or 3.';
    base.source = 'adaptation:offer';
    return base;
  }
  const offerBlocker = offer
    ? `${offer.name} is waiting on ${
        world.colony.food < offer.costFood + PURCHASE_BUFFER_FOOD
          ? `${Math.max(1, Math.ceil(offer.costFood + PURCHASE_BUFFER_FOOD - world.colony.food))} more food`
          : `${Math.max(1, Math.ceil(offer.costWater + PURCHASE_BUFFER_WATER - world.colony.water))} more moisture`
      }.`
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
      base.objective = `${rs.title} in ${Math.ceil(routine.timer)}s — ${rs.counterplay}`;
      base.source = 'routine:incoming';
    } else if (!routine.exploited) {
      base.objective = `${rs.title}: ${Math.ceil(routine.timer)}s to get a trail onto it.`;
      base.source = 'routine:active';
    } else {
      base.objective = `${rs.title} is paying out — ${Math.ceil(routine.timer)}s left.`;
      base.source = 'routine:harvesting';
    }
    base.target = { x: routine.x, y: routine.y, label: rs.title };
    return base;
  }

  // 3. A shortage the player can still act on — unless a spill of exactly that kind is open right
  //    now, in which case the spill *is* the answer and priority 2 already said so.
  if (world.shortage) {
    const kind = world.shortage;
    const noun = kind === 'food' ? 'Food' : 'Moisture';
    base.objective = `${noun} is running low — get another ${kind === 'food' ? 'food' : 'moisture'} line running.`;
    base.blocker =
      linkedRoutes(world, kind) === 0
        ? `No ${kind === 'food' ? 'food' : 'moisture'} line is connected at all.`
        : `Your ${kind === 'food' ? 'food' : 'moisture'} line is not keeping up — add a second source.`;
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
      const noun = short.kind === 'food' ? 'food' : 'moisture';
      base.objective = `${Math.ceil(short.amount)} more ${noun} needed — get another ${noun} line running.`;
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
    base.objective = `${offerBlocker} Get another ${world.colony.food < offer.costFood ? 'food' : 'moisture'} line running.`;
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
  const noun =
    foodFull && waterFull ? 'Both reserves are' : foodFull ? 'The larder is' : 'Moisture is';

  // Something to buy right now?
  const offer = cheapestOffer(world);
  if (offer && canAffordSafely(world, offer)) {
    return {
      text: `${noun} full — spend it: ${offer.name} costs ${offer.costFood} food.`,
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
      text: `${noun} full — claim ${claimable.label} (${claimable.costFood} food, ${claimable.costWater} moisture). It raises your caps.`,
      source: 'capped:claim',
      target: { x: claimable.x, y: claimable.y, label: claimable.label },
    };
  }
  const fittable = world.nests.find(
    (n) => n.claimed && !n.home && n.fn === null && c.food >= n.fitFood && c.water >= n.fitWater,
  );
  if (fittable) {
    return {
      text: `${noun} full — fit out ${fittable.label} (${fittable.fitFood} food, ${fittable.fitWater} moisture) to raise your ceiling.`,
      source: 'capped:fit',
      target: { x: fittable.x, y: fittable.y, label: fittable.label },
    };
  }
  const damaged = world.nests.find((n) => n.claimed && n.integrity < 0.98);
  if (damaged && c.water > 20) {
    return {
      text: `${noun} full — press E at ${damaged.label} to repair it with moisture.`,
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
        ? `${n.fitFood} food and ${n.fitWater} moisture`
        : `${n.costFood} food and ${n.costWater} moisture`
      : '';
    return {
      text: `${noun} full and the nest is full at ${c.capacity}. Capacity is the bottleneck — ${n?.label} needs ${need}.`,
      source: 'capped:capacity',
      target: n ? { x: n.x, y: n.y, label: n.label } : null,
    };
  }
  const next = MILESTONE_POPULATION[world.adaptations.milestonesUsed];
  if (next && c.population < next) {
    return {
      text: `${noun} full — the reserve is the point: at ${next} roaches you unlock a choice you will need it for.`,
      source: 'capped:milestone',
      target: null,
    };
  }
  const zone = world.operation >= 4 ? nextZoneToHold(world) : null;
  if (zone) {
    return {
      text: `${noun} full. Reserves are no longer the bottleneck — territory is. Push a line into ${zone.spec.name}.`,
      source: 'capped:territory',
      target: {
        x: zone.spec.x + zone.spec.w / 2,
        y: zone.spec.y + zone.spec.h / 2,
        label: zone.spec.name,
      },
    };
  }
  return {
    text: `${noun} full — hold what you have and ride out the response.`,
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

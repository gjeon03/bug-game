import {
  CRITICAL_RESERVE,
  INTERLUDE_LENGTH,
  NIGHT_LENGTH,
  NIGHT_RESOURCE_REGROWTH,
  WIN_FOOD,
  WIN_POPULATION,
  WIN_WATER,
} from './constants.ts';
import { CAUSE_LABELS, tierName, topCause } from './suspicion.ts';
import { requestResponse, spawnPatrol, spawnSpray } from './threats.ts';
import type { NightIndex } from './types.ts';
import { homeNest, type World } from './world.ts';

/**
 * Phase state machine and authored beats.
 *
 * Two clocks drive a run: the night clock (fixed length per night) and the evidence the player has
 * generated. Authored beats guarantee that every player meets each mechanic at least once; the
 * evidence-driven escalation in `threats.ts` is what makes their own choices matter on top of that.
 */

/** How long before the end of night 3 the final household response begins. */
export const FINAL_RESPONSE_LEAD = 76;

interface Beat {
  night: NightIndex;
  at: number;
  run: (world: World) => void;
}

/**
 * Immutable beat table. Per-run fired flags live on the world (`world.beatFired`) so a restart
 * cannot inherit state from the previous run — there is no mutable module-level game state anywhere
 * in `sim/`, which is what makes the restart-equality test meaningful.
 */
export const BEATS: readonly Beat[] = [
  {
    night: 1,
    at: 104,
    run: (w) => {
      // First taught threat: somebody comes in for the fridge. Always happens, so nobody reaches
      // night 2 without having seen a patrol, a footfall and the room light.
      if (w.patrols.length === 0) spawnPatrol(w, 1, 0);
    },
  },
  {
    night: 2,
    at: 42,
    run: (w) => {
      if (w.patrols.length === 0) spawnPatrol(w, 2, 1);
    },
  },
  {
    night: 2,
    at: 168,
    run: (w) => {
      if (w.patrols.length === 0) spawnPatrol(w, 2, 2);
    },
  },
  {
    night: 3,
    at: 34,
    run: (w) => {
      if (w.patrols.length === 0) spawnPatrol(w, 3, 3);
    },
  },
  {
    night: 3,
    at: 132,
    run: (w) => {
      if (w.patrols.length === 0) spawnPatrol(w, 3, 4);
      spawnSpray(w, 1);
    },
  },
];

export function updateDirector(world: World, dt: number): void {
  if (world.beatFired.length !== BEATS.length) {
    world.beatFired = new Array(BEATS.length).fill(false);
  }
  if (world.status === 'won' || world.status === 'lost') return;

  if (world.status === 'interlude') {
    world.interludeTime -= dt;
    if (world.interludeTime <= 0 || world.intent.skipInterlude) {
      world.intent.skipInterlude = false;
      startNight(world, (world.interludeFrom + 1) as NightIndex);
    }
    return;
  }

  world.nightTime += dt;

  for (let i = 0; i < BEATS.length; i++) {
    const b = BEATS[i];
    if (world.beatFired[i] || b.night !== world.night || world.nightTime < b.at) continue;
    world.beatFired[i] = true;
    b.run(world);
  }

  // ── Night 3's final household response.
  if (
    world.night === 3 &&
    !world.finalResponse &&
    world.nightTime >= world.nightLength - FINAL_RESPONSE_LEAD
  ) {
    world.finalResponse = true;
    world.finalResponseTime = 0;
    spawnSpray(world, 2);
    spawnSpray(world, 0);
    spawnPatrol(world, 3, 4);
    world.events.push({ t: 'objective', text: 'FINAL RESPONSE — survive the sweep.' });
  }
  if (world.finalResponse) {
    world.finalResponseTime += dt;
    // A second wave partway through, aimed at the home corner.
    if (world.finalResponseTime > 34 && world.sprays.length < 2) spawnSpray(world, 2);
  }

  // ── Night rollover.
  if (world.nightTime >= world.nightLength) {
    if (world.night === 3) {
      evaluateFinal(world);
      return;
    }
    beginInterlude(world);
  }
}

/** Runs at the end of a step, after every system has had its say. */
export function evaluateRun(world: World): void {
  if (world.status !== 'playing') return;
  checkLossConditions(world);
  updateObjective(world);
}

/** Reacts to the tier rising edges produced by `updateSuspicion`. */
export function handleEscalation(world: World): void {
  for (let i = 0; i < world.events.length; i++) {
    const e = world.events[i];
    if (e.t === 'tier') requestResponse(world, e.tier);
  }
}

function beginInterlude(world: World): void {
  world.interludeFrom = world.night;
  world.status = 'interlude';
  world.interludeTime = INTERLUDE_LENGTH;
  world.reactionNote = buildReaction(world);
  world.events.push({ t: 'interlude', night: world.night });

  // The humans tidy up between nights: bodies in the open are found and removed, but the fact that
  // they were found is already baked into suspicion and cannot be undone.
  world.corpses.length = 0;
  world.patrols.length = 0;
  world.sprays.length = 0;
  world.footfalls.length = 0;
  world.roomLight = 0;
  world.roomLightTarget = 0;
}

function startNight(world: World, night: NightIndex): void {
  world.night = night;
  world.nightTime = 0;
  world.nightLength = NIGHT_LENGTH[night];
  world.status = 'playing';
  world.scout.spotted = 0;

  // The household cooks again: sources you did not strip bare partly recover. Sources you drained
  // completely were noticed and cleaned up, and stay gone — which is the cost of over-harvesting.
  for (let i = 0; i < world.resources.length; i++) {
    const r = world.resources[i];
    if (r.depleted) continue;
    r.amount = Math.min(r.initial, r.amount + r.initial * NIGHT_RESOURCE_REGROWTH);
  }

  world.events.push({ t: 'phase', night });
  updateObjective(world);
}

function buildReaction(world: World): string {
  const top = topCause(world);
  const tier = world.suspicion.tier;
  const cause = top ? CAUSE_LABELS[top.cause].toLowerCase() : 'nothing in particular';
  if (tier <= 0) return `Nothing out of place. They noticed ${cause} but thought little of it.`;
  if (tier === 1) return `They mentioned ${cause}. A light gets left on tonight.`;
  if (tier === 2) return `They are sure now — ${cause}. Sticky traps go down where you walked.`;
  if (tier === 3) return `A call was made. ${CAUSE_LABELS[top!.cause]}. Bait and long patrols.`;
  return `${CAUSE_LABELS[top!.cause]}. They have bought spray.`;
}

function checkLossConditions(world: World): void {
  const home = homeNest(world);
  if (home.integrity <= 0) {
    lose(world, 'nestDestroyed');
    return;
  }
  if (world.colony.population <= 0 && !world.scout.alive) {
    lose(world, 'collapse');
  }
}

function evaluateFinal(world: World): void {
  const c = world.colony;
  let nests = true;
  for (let i = 0; i < world.nests.length; i++) {
    if (!world.nests[i].claimed) nests = false;
  }
  world.winCriteria = {
    population: c.population >= WIN_POPULATION,
    food: c.food >= WIN_FOOD,
    water: c.water >= WIN_WATER,
    nests,
    survived: world.scout.alive || c.population > 0,
  };
  const all =
    world.winCriteria.population &&
    world.winCriteria.food &&
    world.winCriteria.water &&
    world.winCriteria.nests &&
    world.winCriteria.survived;
  if (all) {
    world.status = 'won';
    world.events.push({ t: 'win' });
  } else {
    lose(world, 'exterminated');
  }
}

function lose(world: World, cause: 'collapse' | 'nestDestroyed' | 'exterminated'): void {
  if (world.status === 'lost' || world.status === 'won') return;
  world.status = 'lost';
  world.loseCause = cause;
  world.events.push({ t: 'lose', cause });
}

/**
 * Picks the world-space thing the current objective is talking about, so the HUD can point at it.
 * On a kitchen this large, "go and find it" without a bearing is just wandering.
 */
function updateGuide(world: World): void {
  const c = world.colony;
  const unclaimed = world.nests.filter((n) => !n.claimed && n.unlockNight <= world.night);
  const servedFood = world.routes.some(
    (r) => r.linked && world.resources.find((x) => x.id === r.resourceId)?.kind === 'food',
  );
  const servedWater = world.routes.some(
    (r) => r.linked && world.resources.find((x) => x.id === r.resourceId)?.kind === 'water',
  );

  // Priority: a shortage first, then an unserved resource type, then the next crack.
  let wantKind: 'food' | 'water' | null = null;
  if (c.water <= c.waterCap * CRITICAL_RESERVE) wantKind = 'water';
  else if (c.food <= c.foodCap * CRITICAL_RESERVE) wantKind = 'food';
  else if (!servedFood) wantKind = 'food';
  else if (!servedWater) wantKind = 'water';
  else if (c.food < c.water) wantKind = 'food';
  else if (unclaimed.length === 0) wantKind = 'water';

  if (wantKind !== null) {
    let best: { x: number; y: number; label: string } | null = null;
    let bestD = Infinity;
    for (let i = 0; i < world.resources.length; i++) {
      const r = world.resources[i];
      if (r.depleted || r.unlockNight > world.night || r.kind !== wantKind) continue;
      const d = (r.x - world.scout.x) ** 2 + (r.y - world.scout.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: r.x, y: r.y, label: r.label };
      }
    }
    if (best) {
      world.guide = best;
      return;
    }
  }

  if (unclaimed.length > 0) {
    world.guide = { x: unclaimed[0].x, y: unclaimed[0].y, label: unclaimed[0].label };
    return;
  }
  const home = homeNest(world);
  world.guide = { x: home.x, y: home.y, label: 'Home crack' };
}

/** One short line, always answering "what should I do right now?". */
function updateObjective(world: World): void {
  const c = world.colony;
  const linked = world.routes.some((r) => r.linked);
  updateGuide(world);

  // A shortage outranks every other objective. Losing an entire colony to an empty meter the player
  // was never told about is the least fair failure this game can produce, so it shouts.
  const waterCritical = c.water <= c.waterCap * CRITICAL_RESERVE;
  const foodCritical = c.food <= c.foodCap * CRITICAL_RESERVE;
  if (waterCritical || foodCritical) {
    const which =
      waterCritical && foodCritical ? 'FOOD AND MOISTURE' : waterCritical ? 'MOISTURE' : 'FOOD';
    const target = waterCritical ? 'water' : 'food';
    world.objective =
      c.population > 0
        ? `${which} RUNNING OUT — run a trail to ${target} now or the colony dies.`
        : `${which} RUNNING OUT — rebuild from a ${target} trail.`;
    world.shortage = waterCritical ? 'water' : 'food';
    return;
  }
  world.shortage = null;

  if (!linked) {
    world.objective = 'Link the nest to food or moisture with a pheromone trail.';
  } else if (world.night === 1) {
    world.objective =
      c.population < 10
        ? `Grow the colony — ${c.population}/10 roaches before dawn.`
        : 'Keep both food and moisture flowing.';
  } else if (world.night === 2) {
    const unclaimed = world.nests.filter((n) => !n.claimed && n.unlockNight <= 2);
    world.objective =
      unclaimed.length > 0
        ? `Claim ${unclaimed[0].label} (${unclaimed[0].costFood} food, ${unclaimed[0].costWater} moisture).`
        : `Build reserves — ${Math.floor(c.food)}/${WIN_FOOD} food, ${Math.floor(c.water)}/${WIN_WATER} moisture.`;
  } else {
    const unclaimed = world.nests.filter((n) => !n.claimed);
    if (unclaimed.length > 0) {
      world.objective = `Claim ${unclaimed[0].label} (${unclaimed[0].costFood} food, ${unclaimed[0].costWater} moisture).`;
    } else if (c.population < WIN_POPULATION) {
      world.objective = `Reach ${WIN_POPULATION} roaches — ${c.population} so far.`;
    } else if (c.food < WIN_FOOD || c.water < WIN_WATER) {
      world.objective = `Stockpile ${WIN_FOOD} food and ${WIN_WATER} moisture.`;
    } else {
      world.objective = 'Hold the kitchen. Survive the final response.';
    }
  }

  if (world.finalResponse) world.objective = 'FINAL RESPONSE — keep the colony alive.';
}

/** Progress summary used by the HUD and by the end cards. */
export function winProgress(world: World): {
  population: number;
  food: number;
  water: number;
  nests: number;
  nestTotal: number;
} {
  let claimed = 0;
  for (let i = 0; i < world.nests.length; i++) if (world.nests[i].claimed) claimed++;
  return {
    population: world.colony.population,
    food: world.colony.food,
    water: world.colony.water,
    nests: claimed,
    nestTotal: world.nests.length,
  };
}

export function tierLabel(world: World): string {
  return tierName(world.suspicion.tier);
}

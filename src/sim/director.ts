import { checkMilestone } from './adaptations.ts';
import { CRITICAL_RESERVE } from './constants.ts';
import { HEAT_KNOWN, hottestCell, knownCellCount, updateHeat } from './heat.ts';
import {
  currentGate,
  FINAL_RESPONSE_LENGTH,
  operationComplete,
  operationSpec,
  resolveHud,
  type OperationIndex,
} from './operations.ts';
import {
  ROUTINE_SPECS,
  startRoutine,
  specFor,
  updateRoutines,
  type RoutineKind,
} from './routines.ts';
import { tierName, topCause, CAUSE_LABELS } from './suspicion.ts';
import { deployBait, deployTraps, spawnPatrol, spawnSpray, sweepRegion } from './threats.ts';
import { heldZones, updateTerritory, ZONES_TO_WIN, zoneName } from './territory.ts';
import type { DeathCause, LoseCause } from './types.ts';
import { homeNest, type World } from './world.ts';

/**
 * The run director.
 *
 * Two things live here, and they used to be one thing badly: **operations**, which advance when the
 * player achieves something, and **household pressure**, which advances on its own but aims itself
 * at what the player actually did.
 *
 * The old build ran 13 of 14 threat spawns off a stopwatch and discarded the position of every piece
 * of evidence it collected. Nothing below reads `world.time` to decide *what* happens — only to
 * decide *how impatient* the household is.
 */

/** Shows a counterplay hint for a while, then lets it expire. */
function setCounterplay(world: World, text: string, seconds = 34): void {
  world.counterplay = text;
  world.counterplayTime = seconds;
}

/** Seconds between full territory evaluations. */
const TERRITORY_INTERVAL = 0.1;

/** Household patience. Overrunning an operation's soft time adds pressure, never a game over. */
const IMPATIENCE_RATE = 0.06;
/** Seconds between household routines, before impatience. */
/**
 * Seconds between household routines.
 *
 * Long enough that a routine is an event rather than the weather: at 52 s against windows that had
 * to be lengthened so the far anchors were reachable at all, a routine was incoming-or-active about
 * two thirds of the time and the objective line became a spill countdown.
 */
const ROUTINE_INTERVAL = 74;
const ROUTINE_FIRST = 46;
/** Threat budget refill per second. A busy household still cannot stack everything at once. */
const BUDGET_RATE = 0.055;
const BUDGET_MAX = 3;
/** Minimum seconds between any two director actions, so pressure arrives in readable beats. */
const ACTION_COOLDOWN = 26;

export function updateDirector(world: World, dt: number): void {
  if (world.status === 'won' || world.status === 'lost') return;

  world.operationTime += dt;
  world.tierHold += dt;
  if (world.cardTime > 0) world.cardTime = Math.max(0, world.cardTime - dt);

  updateHeat(world, dt);
  // Territory integrates slowly — hold moves by hundredths of a point per second — so running its
  // full scan (every worker and every sampled trail node against every region) sixty times a second
  // was pure waste. Batching it to 10 Hz with the accumulated dt is arithmetically identical and
  // took the worst frame-callback CPU back under budget: CI measured 14.7 ms against a 8 ms budget
  // before this, with `updateTerritory` and the heat deposits the only per-step additions large
  // enough to explain it.
  world.territoryAcc += dt;
  if (world.territoryAcc >= TERRITORY_INTERVAL) {
    updateTerritory(world, world.territoryAcc);
    world.territoryAcc = 0;
  }
  updateRoutines(world, dt);
  checkMilestone(world);

  scheduleRoutines(world, dt);
  updatePressure(world, dt);

  checkFinalResponse(world);
  advanceOperation(world);
}

/* ── Operations ────────────────────────────────────────────────────────────── */

function advanceOperation(world: World): void {
  if (!operationComplete(world)) return;
  if (world.operation >= 4) {
    // Operation 4's own final gate is "survive", so completing it is the win.
    win(world);
    return;
  }
  const next = (world.operation + 1) as OperationIndex;
  world.operation = next;
  world.operationTime = 0;
  world.cardTime = 6.5;
  world.stats.operationsCompleted = next - 1;
  world.events.push({ t: 'operation', index: next });
}

/**
 * The household commits to extermination when the colony has actually taken the kitchen.
 *
 * Triggering it on *entering* operation 4 was unfair and undramatic in the same breath: the player
 * arrived needing to establish three regions from scratch and was given 62 seconds to do it under
 * spray — a combination with no counterplay, which the contract forbids. Measured: the run reached
 * operation 4 at 386 s and was exterminated at 448 s holding nothing.
 *
 * Triggering it on the third region held makes the ending a consequence of success. You take the
 * kitchen, and *that* is what brings the can out.
 */
function checkFinalResponse(world: World): void {
  if (world.finalResponse || world.operation < 4) return;
  if (heldZones(world).length >= ZONES_TO_WIN) beginFinalResponse(world);
}

/** How far past its soft time the current operation has run, in seconds. */
function overrun(world: World): number {
  return Math.max(0, world.operationTime - operationSpec(world.operation).softTime);
}

/* ── Household routines ────────────────────────────────────────────────────── */

function scheduleRoutines(world: World, dt: number): void {
  world.routineTimer -= dt;
  if (world.routineTimer > 0) return;
  if (world.routines.some((r) => r.phase === 'incoming' || r.phase === 'active')) {
    world.routineTimer = 6;
    return;
  }
  // Operation 1 teaches routing; routines are what operation 2 is *for*. Letting them fire during
  // the opening taught the player to chase spills before they had a permanent supply line, and the
  // temporary route dying took the colony's income with it.
  if (world.operation < 2) {
    world.routineTimer = ROUTINE_FIRST;
    return;
  }

  const kind = pickRoutine(world);
  if (startRoutine(world, kind)) {
    world.lastRoutine = kind;
    world.routineTimer = ROUTINE_INTERVAL * (world.operation >= 3 ? 0.82 : 1);
  } else {
    world.routineTimer = 8;
  }
}

/**
 * Which routine fires next.
 *
 * Never the same one twice in a row, and weighted toward the region the colony has been working —
 * the household goes where its own kitchen is being disturbed, which is also where the player most
 * wants a spill. The opportunity and the risk are deliberately the same choice.
 */
function pickRoutine(world: World): RoutineKind {
  let best: RoutineKind = 'snack';
  let bestScore = -Infinity;
  for (const spec of ROUTINE_SPECS) {
    if (spec.kind === world.lastRoutine) continue;
    const heat = world.heat.value[heatIndexOf(world, spec.x, spec.y)];
    const score = heat * 2 + world.rng.next() * 0.9;
    if (score > bestScore) {
      bestScore = score;
      best = spec.kind;
    }
  }
  return best;
}

function heatIndexOf(world: World, x: number, y: number): number {
  const cols = 12;
  const cw = 3600 / cols;
  const ch = 2600 / 9;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / cw)));
  const cy = Math.min(8, Math.max(0, Math.floor(y / ch)));
  void world;
  return cy * cols + cx;
}

/* ── Household pressure ────────────────────────────────────────────────────── */

/**
 * The hybrid director.
 *
 * Inputs: current operation, evidence tier, regional heat, colony vulnerability, time since the last
 * major threat, how recently each family fired, and whether the player currently has an answer.
 * Output: at most one action per `ACTION_COOLDOWN`, paid for out of a refilling budget.
 */
function updatePressure(world: World, dt: number): void {
  world.threatBudget = Math.min(
    BUDGET_MAX,
    world.threatBudget + BUDGET_RATE * dt * (1 + overrun(world) * IMPATIENCE_RATE * 0.1),
  );
  world.threatCooldown -= dt;

  // Impatience: an operation that overruns its soft time makes the household restless. This is how
  // time still applies pressure without being the content.
  if (overrun(world) > 0) world.suspicion.value += IMPATIENCE_RATE * dt;

  // Counterplay advice is about a live threat. It used to be assigned and never cleared, so the HUD
  // kept advising an answer to something that had left the map minutes earlier.
  world.counterplayTime = Math.max(0, world.counterplayTime - dt);
  if (world.counterplayTime <= 0) world.counterplay = null;

  updateForecast(world);

  if (world.finalResponse) {
    updateFinalResponse(world, dt);
    return;
  }
  if (world.threatCooldown > 0 || world.threatBudget < 1) return;

  const tier = world.suspicion.tier;
  const known = knownCellCount(world);
  // Nothing to act on: the household cannot invent a location it has never seen activity in.
  const hot = hottestCell(world, (i) => world.recentTargets.includes(i));
  // The household acts only on ground it genuinely knows about. Acting at half the threshold meant
  // it started swinging at corridors it had barely noticed, roughly every seventeen seconds.
  if (!hot || hot.heat < HEAT_KNOWN) {
    world.threatCooldown = 6;
    return;
  }

  const action = chooseAction(world, tier, known);
  if (!action) {
    world.threatCooldown = 8;
    return;
  }

  switch (action) {
    case 'patrol':
      spawnPatrol(world, hot.x, hot.y);
      world.threatBudget -= 1;
      setCounterplay(
        world,
        'Stay under cabinetry — a torch beam only finds roaches on open floor.',
      );
      break;
    case 'sweep':
      sweepRegion(world, hot.x, hot.y);
      world.threatBudget -= 1;
      world.counterplay =
        'A wipe erases scent, not roaches. Re-lay the line once the cloth passes.';
      break;
    case 'trap':
      deployTraps(world, tier >= 3 ? 2 : 1, hot.x, hot.y);
      world.threatBudget -= 1;
      world.counterplay =
        'Traps land where your traffic went. Move the line and the trap is wasted.';
      break;
    case 'bait':
      deployBait(world, 1, hot.x, hot.y);
      world.threatBudget -= 1;
      setCounterplay(world, 'Bait is slow. A roach that walks in has time to walk out.');
      break;
    case 'spray':
      spawnSpray(world, hot.x, hot.y, false);
      world.threatBudget -= 2;
      setCounterplay(
        world,
        'Get everyone into a claimed crack. Spray cannot reach inside the walls.',
      );
      break;
  }
  world.recentTargets.push(hot.index);
  if (world.recentTargets.length > 3) world.recentTargets.shift();
  world.threatCooldown = ACTION_COOLDOWN * (tier >= 3 ? 0.72 : 1);
}

type ThreatAction = 'patrol' | 'sweep' | 'trap' | 'bait' | 'spray';

/**
 * Picks the family to use.
 *
 * Two rules keep this fair. A family that fired recently is skipped, so the player never eats the
 * same answer twice in a row; and any family whose counterplay the colony currently cannot perform
 * is skipped, so the director cannot assemble a combination with no way out.
 */
function chooseAction(world: World, tier: number, known: number): ThreatAction | null {
  const options: ThreatAction[] = [];
  if (tier >= 0) options.push('patrol');
  if (tier >= 1 && known >= 1) options.push('sweep');
  if (tier >= 1 && known >= 2) options.push('trap');
  if (tier >= 2) options.push('bait');
  // Spray is severe: it needs real evidence, and it needs the colony to have somewhere to hide, or
  // it is an unavoidable execution rather than a threat.
  const shelters = world.nests.filter((n) => n.claimed).length;
  if (tier >= 3 && shelters >= 1 && world.sprays.length === 0) options.push('spray');

  const fresh = options.filter((o) => world.lastActions.indexOf(o) < 0);
  const pool = fresh.length > 0 ? fresh : options;
  if (pool.length === 0) return null;
  const pick = pool[world.rng.int(0, pool.length - 1)];
  world.lastActions.push(pick);
  if (world.lastActions.length > 2) world.lastActions.shift();
  return pick;
}

function beginFinalResponse(world: World): void {
  world.finalResponse = true;
  world.finalResponseTime = 0;
  world.events.push({ t: 'finalResponse' });
  setCounterplay(world, 'Claimed cracks are shelter. Everything outside one is exposed.', 90);
}

/**
 * The extermination.
 *
 * Aimed at the player's own map: the clouds walk the hottest regions the household knows about, in
 * order. A colony that spread its traffic gets a survivable sweep; a colony that hammered one
 * corridor gets that corridor scoured.
 */
function updateFinalResponse(world: World, dt: number): void {
  world.finalResponseTime += dt;
  const t = world.finalResponseTime;
  const wave = Math.floor(t / 16);
  if (wave > world.finalWave && world.sprays.length < 2) {
    // The first cloud goes for the worst place the household knows about, full stop — the
    // spread-the-pressure exclusion that keeps ordinary responses from stacking is exactly wrong
    // for the finale, and it was sending the opening cloud somewhere the colony had barely been.
    // Later waves do spread, so the whole map is not hammered in one spot.
    const first = world.finalWave < 0;
    world.finalWave = wave;
    const hot = hottestCell(world, (i) => !first && world.recentTargets.includes(i));
    const home = homeNest(world);
    const target = hot ?? { x: home.x, y: home.y, index: -1, heat: 1 };
    spawnSpray(world, target.x, target.y, true);
    if (target.index >= 0) world.recentTargets.push(target.index);
    if (world.recentTargets.length > 3) world.recentTargets.shift();
  }
}

/* ── Forecast ──────────────────────────────────────────────────────────────── */

function updateForecast(world: World): void {
  const tier = world.suspicion.tier;
  const cause = topCause(world);
  const label = cause ? CAUSE_LABELS[cause.cause] : null;
  const known = knownCellCount(world);

  if (world.finalResponse) {
    world.forecast = `EXTERMINATION — ${Math.max(0, Math.ceil(FINAL_RESPONSE_LENGTH - world.finalResponseTime))}s. They are spraying where your traffic was heaviest.`;
    world.threatAdvice = 'Get the colony into claimed cracks and keep them there.';
    return;
  }

  const place = hottestCell(world, () => false);
  const where = place && place.heat >= HEAT_KNOWN ? regionName(place.x, place.y) : null;
  const next = nextResponseText(tier, known);
  world.forecast = label
    ? `${tierName(tier)} — ${label}${where ? `, worst around ${where}` : ''}. ${next}`
    : `${tierName(tier)}. ${next}`;

  // Threat advice is only promoted into the objective when a live threat sits on the colony's own
  // infrastructure — otherwise it is noise competing with the actual goal.
  world.threatAdvice = null;
  for (const h of world.hazards) {
    if (!h.armed) continue;
    for (const r of world.routes) {
      if (!r.linked) continue;
      for (let i = 0; i < r.nodes.length; i += 4) {
        const n = r.nodes[i];
        if ((n.x - h.x) ** 2 + (n.y - h.y) ** 2 < (h.radius * 1.6) ** 2) {
          world.threatAdvice =
            h.kind === 'trap'
              ? 'A sticky trap is sitting on one of your supply lines — erase that stretch and re-route.'
              : 'Bait has been put down on one of your lines — steer the trail around it.';
          return;
        }
      }
    }
  }
  for (const s of world.sweeps) {
    if (s.warn > 0) {
      world.threatAdvice = 'A cleaning pass is starting — the scent it crosses will be gone.';
      return;
    }
  }
}

function nextResponseText(tier: number, known: number): string {
  if (known === 0) return 'They have not worked out where yet.';
  switch (tier) {
    case 0:
      return 'Somebody may come through for a look.';
    case 1:
      return 'Expect a wipe-down where the traffic is.';
    case 2:
      return 'Expect traps on the routes they have noticed.';
    case 3:
      return 'Expect bait, and spray if it gets worse.';
    default:
      return 'They are ready to exterminate.';
  }
}

/** A human-readable place name for a world point, used in the forecast. */
export function regionName(x: number, y: number): string {
  if (x < 900 && y < 1700) return 'the sink';
  if (x < 900 && y < 2100) return 'the dishwasher';
  if (x < 1050) return 'the pantry';
  if (x < 2100 && y < 900) return 'the stove';
  if (x > 2400 && y < 1100) return 'the fridge';
  if (x > 2600 && y > 1900) return 'the bin corner';
  if (y > 2100) return 'the floor by the door';
  return 'the island';
}

/* ── Outcome ───────────────────────────────────────────────────────────────── */

export function evaluateRun(world: World): void {
  if (world.status !== 'playing') return;
  checkLossConditions(world);
  if (world.status !== 'playing') return;
  updateShortage(world);
  world.hud = resolveHud(world);
  world.objective = world.hud.objective;
  world.guide = world.hud.target;
}

/**
 * A shortage is a *situation*, not a number.
 *
 * The old build declared a moisture emergency on the first simulation step of every run, because the
 * starting stock happened to sit below a fixed fraction of the cap — the first thing a new player
 * ever read was a lie. A level test alone is also wrong in the opposite direction: a healthy colony
 * that breeds down to a third of its larder every few seconds is not running out of anything, but a
 * level test flags it permanently, and a warning that is always on is not a warning.
 *
 * So: low **and** nothing coming in. Either there is no supply line for that reserve at all, or the
 * reserve is effectively empty. Both are things the player can act on, which is the whole test.
 */
function updateShortage(world: World): void {
  const c = world.colony;
  const meaningful = world.time > 25 && c.population > 6;
  if (!meaningful) {
    world.shortage = null;
    return;
  }
  let foodLines = 0;
  let waterLines = 0;
  for (const r of world.routes) {
    if (!r.linked || !r.resourceId) continue;
    const res = world.resources.find((x) => x.id === r.resourceId);
    if (!res) continue;
    if (res.kind === 'food') foodLines++;
    else waterLines++;
  }
  const foodBad =
    (c.food < c.foodCap * CRITICAL_RESERVE && foodLines === 0) || c.food <= EMPTY_RESERVE;
  const waterBad =
    (c.water < c.waterCap * CRITICAL_RESERVE && waterLines === 0) || c.water <= EMPTY_RESERVE;
  world.shortage = foodBad && !waterBad ? 'food' : waterBad ? 'water' : null;
}

/** Below this a reserve is empty enough to be an emergency whatever the supply picture says. */
const EMPTY_RESERVE = 5;

function checkLossConditions(world: World): void {
  const c = world.colony;
  if (c.population <= 0) {
    lose(world, 'collapse');
    return;
  }
  const home = homeNest(world);
  if (home.integrity <= 0) {
    lose(world, 'nestDestroyed');
    return;
  }
  if (world.finalResponse && world.finalResponseTime >= FINAL_RESPONSE_LENGTH) {
    // The response has run its course. Either the colony still holds its ground, or it does not.
    if (heldZones(world).length >= ZONES_TO_WIN) win(world);
    else lose(world, 'exterminated');
  }
}

function lose(world: World, cause: LoseCause): void {
  world.status = 'lost';
  world.loseCause = cause;
  tallyRun(world);
  world.events.push({ t: 'lose', cause });
}

function win(world: World): void {
  world.status = 'won';
  tallyRun(world);
  world.events.push({ t: 'win' });
}

function tallyRun(world: World): void {
  const c = world.colony;
  world.finalTally = {
    population: c.population,
    food: Math.floor(c.food),
    water: Math.floor(c.water),
    hatched: c.hatched,
    lost: c.lost,
    deliveries: world.stats.deliveries,
    peakSuspicion: Math.round(world.suspicion.peak),
    topCause: topCause(world)?.cause ?? null,
    topDeath: topDeathCause(world),
    runSeconds: world.time,
    operations: world.operation,
    zones: heldZones(world).map((z) => zoneName(z.id)),
    adaptations: world.adaptations.taken.length,
  };
}

/** What actually killed the most roaches this run, and how many. */
export function topDeathCause(world: World): { cause: DeathCause; count: number } | null {
  let best: { cause: DeathCause; count: number } | null = null;
  for (const key of Object.keys(world.deathCauses) as DeathCause[]) {
    const count = world.deathCauses[key] ?? 0;
    if (count > 0 && (!best || count > best.count)) best = { cause: key, count };
  }
  return best;
}

/** Progress readout for the HUD and end card. */
export function winProgress(world: World): { zones: number; need: number; final: boolean } {
  return {
    zones: heldZones(world).length,
    need: ZONES_TO_WIN,
    final: world.finalResponse,
  };
}

export { tierName };

/** Legacy shim kept for the audio layer, which names its routine cues from the spec table. */
export function routineTitle(kind: RoutineKind): string {
  return specFor(kind).title;
}

/** Whether the current gate is the one the tutorial should be talking about. */
export function currentGateId(world: World): string | null {
  return currentGate(world)?.id ?? null;
}

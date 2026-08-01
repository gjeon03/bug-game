import { SIM_DT } from '../../src/core/clock.ts';
import { chooseAdaptation } from '../../src/sim/adaptations.ts';
import { chooseFunction } from '../../src/sim/colony.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import type { FootholdFunction } from '../../src/sim/types.ts';
import type { World } from '../../src/sim/world.ts';
import { heldZones, nextZoneToHold, ZONES_TO_WIN } from '../../src/sim/territory.ts';
import { detourPath, litDetourPath, path, pt, type PathStyle, type Pt } from '../map.ts';
import { driveTo, idle, stepUntil } from './helpers.ts';

/**
 * A scripted competent player.
 *
 * The old suite scripted its runs as ~120 lines of literal waypoints per strategy, which is why a
 * single map change broke three whole files. This one plays by *intent* — "keep a food line and a
 * moisture line running", "claim what I can afford", "spend a full larder" — and asks
 * {@link path} for the geometry. It is the same player for every seed and every strategy; only the
 * routing style changes.
 */

export interface PlayerOptions {
  /** How the player routes: hugging cabinetry, or straight across the open floor. */
  style: PathStyle;
  /** Whether the player sprints between jobs, which is loud. */
  reckless?: boolean;
  /** Route out through the brightest ground in the kitchen rather than round it. */
  detour?: boolean;
  /** Route through the light, but without adding much distance — for like-for-like comparisons. */
  litDetour?: boolean;
  /**
   * Hold off on taking an offered adaptation. Adaptations complete operation gates, and completing
   * operation 3 is what summons the extermination — so a player who is not ready for it saves the
   * choice rather than spending it.
   */
  holdAdaptations?: boolean;
}

const COVERED: PlayerOptions = { style: 'covered' };

export function walkTo(world: World, to: Pt, opts: { lay?: boolean } & PlayerOptions): boolean {
  const start = { x: world.scout.x, y: world.scout.y };
  const points = opts.detour
    ? detourPath(start, to)
    : opts.litDetour
      ? litDetourPath(start, to)
      : path(start, to, opts.style);
  let ok = true;
  for (const p of points) {
    ok = driveTo(world, p.x, p.y, {
      lay: opts.lay,
      sprint: opts.reckless && !opts.lay,
      timeout: 26,
      arrive: 44,
    });
    if (world.status !== 'playing') break;
  }
  world.input.lay = false;
  world.input.sprint = false;
  return ok;
}

/** Walks quietly to `from`, then walks to `to` secreting pheromone: one supply line. */
export function layLine(world: World, from: Pt, to: Pt, opts: PlayerOptions = COVERED): void {
  walkTo(world, from, opts);
  walkTo(world, to, { ...opts, lay: true });
}

/**
 * Plays on until both reserves reach the requested amounts.
 *
 * Waiting is *play*, not a pause: sources run dry and cleaning passes wipe trails, so a player who
 * stood still while banking for a foothold would watch the colony starve behind them. This keeps the
 * lines alive while it waits, which is what a competent player does with the same seconds.
 */
export function bankUntil(
  world: World,
  food: number,
  water: number,
  patience = 150,
  opts: PlayerOptions = COVERED,
): boolean {
  const until = world.time + patience;
  while (world.time < until && world.status === 'playing') {
    if (world.colony.food >= food && world.colony.water >= water) return true;
    maintainLines(world, opts);
    if (!opts.holdAdaptations) takeAdaptation(world);
    stepUntil(
      world,
      (w) => (w.colony.food >= food && w.colony.water >= water) || w.status !== 'playing',
      10,
    );
  }
  return world.colony.food >= food && world.colony.water >= water;
}

/** Walks to a crack and presses E until it is claimed. Returns whether it landed. */
export function claimNest(world: World, id: string, opts: PlayerOptions = COVERED): boolean {
  const nest = world.nests.find((n) => n.id === id);
  if (!nest || nest.claimed) return !!nest?.claimed;
  walkTo(world, pt(nest), opts);
  for (let i = 0; i < 8 && world.status === 'playing'; i++) {
    world.input.interactPressed = true;
    stepWorld(world, SIM_DT);
    if (nest.claimed) return true;
    idle(world, 8);
    driveTo(world, nest.x, nest.y, { timeout: 12, arrive: 44 });
  }
  return nest.claimed;
}

/** Walks to a claimed crack and fits it out with the requested function. */
export function fitOut(
  world: World,
  id: string,
  fn: FootholdFunction,
  opts: PlayerOptions = COVERED,
): boolean {
  const nest = world.nests.find((n) => n.id === id);
  if (!nest || !nest.claimed || nest.fn !== null) return nest?.fn !== null;
  walkTo(world, pt(nest), opts);
  for (let i = 0; i < 8 && world.status === 'playing'; i++) {
    world.input.interactPressed = true;
    stepWorld(world, SIM_DT);
    if (world.pendingFit === id && chooseFunction(world, fn) === 'ok') return true;
    idle(world, 8);
    driveTo(world, nest.x, nest.y, { timeout: 12, arrive: 44 });
  }
  return nest.fn !== null;
}

/**
 * Takes an offered adaptation.
 *
 * `prefer` names a family in priority order. The default spreads across families rather than stacking
 * one: every brood adaptation raises upkeep by a quarter, so three of them is a colony that outgrows
 * what the kitchen's finite sources can feed — which is the downside working as designed.
 */
export function takeAdaptation(
  world: World,
  prefer: readonly string[] = ['shadow', 'forage', 'brood'],
): string | null {
  const offer = world.adaptations.offer;
  if (offer.length === 0) return null;
  const ordered = [...prefer.flatMap((f) => offer.filter((id) => id.startsWith(f))), ...offer];
  for (const id of ordered) {
    if (chooseAdaptation(world, id) === 'ok') return id;
  }
  return null;
}

/** A source of the requested kind that is reachable now, has stock, and is not already served. */
export function nextSource(world: World, kind: 'food' | 'water'): { x: number; y: number } | null {
  const served = new Set(world.routes.filter((r) => r.linked).map((r) => r.resourceId));
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  const anchors = world.nests.filter((n) => n.claimed);
  for (const res of world.resources) {
    if (res.kind !== kind || res.depleted || res.unlockOp > world.operation) continue;
    if (served.has(res.id)) continue;
    // Prefer a big pile close to somewhere the colony already lives: a supply line the colony cannot
    // staff is not a supply line.
    let near = Infinity;
    for (const n of anchors) near = Math.min(near, Math.hypot(n.x - res.x, n.y - res.y));
    const score = res.amount - near * 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = { x: res.x, y: res.y };
    }
  }
  return best;
}

/** The claimed crack nearest a point — where a new line to it should be anchored. */
export function anchorFor(world: World, target: Pt): Pt {
  let best = world.nests[0];
  let bestD = Infinity;
  for (const n of world.nests) {
    if (!n.claimed) continue;
    const d = Math.hypot(n.x - target.x, n.y - target.y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return pt(best);
}

function linkedTo(world: World, kind: 'food' | 'water'): number {
  let n = 0;
  for (const r of world.routes) {
    if (!r.linked || !r.resourceId) continue;
    const res = world.resources.find((x) => x.id === r.resourceId);
    if (res && res.kind === kind && !res.depleted && res.amount > 25) n++;
  }
  return n;
}

/** How many lines of a kind a colony this size needs. One source cannot feed a full nest. */
function linesWanted(world: World): number {
  return world.colony.population >= 14 ? 2 : 1;
}

/**
 * Runs a trail out to a live household spill.
 *
 * Routine events are the operation-2 gate and the redesign's answer to "the house feels occupied", so
 * a competent player treats them as the highest-value thing on the floor for the seconds they exist.
 */
export function chaseRoutine(world: World, opts: PlayerOptions = COVERED): boolean {
  const routine = world.routines.find((r) => r.phase === 'active' && !r.exploited);
  if (!routine || !routine.resourceId) return false;
  layLine(world, anchorFor(world, routine), { x: routine.x, y: routine.y }, opts);
  return true;
}

/**
 * Pushes a supply line into the region the HUD is asking for.
 *
 * Territory is made of routes: a zone holds only while a linked trail runs through it *and* roaches
 * are working it, so the final operation is played by routing, not by hiding. Returns true when it
 * spent the player's attention on this.
 */
export function holdTerritory(world: World, opts: PlayerOptions = COVERED): boolean {
  if (world.operation < 4 || heldZones(world).length >= ZONES_TO_WIN) return false;
  const next = nextZoneToHold(world);
  if (!next) return false;
  const zone = next.spec;
  // Own the ground first: a claimed crack inside the region is standing presence that survives a
  // panic, which is what the objective line tells the player in this operation.
  const crack = world.nests.find(
    (n) =>
      !n.claimed &&
      n.unlockOp <= world.operation &&
      n.x >= zone.x &&
      n.x <= zone.x + zone.w &&
      n.y >= zone.y &&
      n.y <= zone.y + zone.h,
  );
  if (crack) {
    if (world.colony.food >= crack.costFood && world.colony.water >= crack.costWater) {
      return claimNest(world, crack.id, opts);
    }
    // Cannot pay for it yet — go and earn it rather than milling about in the region.
    return false;
  }
  if (next.state.routed && next.state.workers > 0) return false;
  const inZone = world.resources.filter(
    (r) =>
      !r.depleted &&
      r.unlockOp <= world.operation &&
      r.x >= zone.x &&
      r.x <= zone.x + zone.w &&
      r.y >= zone.y &&
      r.y <= zone.y + zone.h,
  );
  const target =
    inZone.length > 0
      ? { x: inZone[0].x, y: inZone[0].y }
      : { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
  layLine(world, anchorFor(world, target), target, opts);
  return true;
}

/**
 * Keeps one live line to each reserve.
 *
 * Sources are finite in the redesign, so "lay two trails and walk away" is no longer competent play —
 * a supply line is a thing you maintain. This is the smallest behaviour that counts as maintaining
 * one: when a reserve has no live source, go and connect another.
 */
/**
 * Spends a healthy larder on the things that raise its own ceilings.
 *
 * Claiming buys the ground, fitting it out buys the capability, and both are what the objective line
 * tells a player to do when a reserve is full. A player that only hauls is not a competent player.
 */
export function spendSurplus(world: World, opts: PlayerOptions = COVERED): boolean {
  const c = world.colony;
  // Fit out what is already owned before buying more ground.
  const unfitted = world.nests.find((n) => n.claimed && !n.home && n.fn === null);
  if (unfitted && c.food >= unfitted.fitFood + 12 && c.water >= unfitted.fitWater + 8) {
    const nurseries = world.nests.filter((n) => n.fn === 'nursery').length;
    const caches = world.nests.filter((n) => n.fn === 'cache').length;
    const fn: FootholdFunction =
      c.population >= c.capacity - 3 || nurseries === 0
        ? 'nursery'
        : caches === 0
          ? 'cache'
          : 'bolthole';
    return fitOut(world, unfitted.id, fn, opts);
  }
  const claimable = world.nests.find(
    (n) =>
      !n.claimed &&
      n.unlockOp <= world.operation &&
      c.food >= n.costFood + 12 &&
      c.water >= n.costWater + 8,
  );
  if (claimable) return claimNest(world, claimable.id, opts);
  return false;
}

export function maintainLines(world: World, opts: PlayerOptions = COVERED): void {
  if (chaseRoutine(world, opts)) return;
  if (holdTerritory(world, opts)) return;
  if (spendSurplus(world, opts)) return;
  for (const kind of ['water', 'food'] as const) {
    if (world.status !== 'playing') return;
    if (linkedTo(world, kind) >= linesWanted(world)) continue;
    const target = nextSource(world, kind);
    if (!target) continue;
    // No slot management here on purpose: laying past MAX_ROUTES is a legal player action and the
    // game evicts the oldest line itself, with a toast. A test player that reached into the route
    // array would be doing something no player can do.
    layLine(world, anchorFor(world, target), target, opts);
  }
}

/**
 * Plays for `seconds` of simulated time, maintaining supply lines and taking every growth decision
 * as it is offered. Returns early if the run ends.
 */
export function playFor(world: World, seconds: number, opts: PlayerOptions = COVERED): void {
  const until = world.time + seconds;
  while (world.time < until && world.status === 'playing') {
    maintainLines(world, opts);
    if (!opts.holdAdaptations) takeAdaptation(world);
    if (world.time >= until || world.status !== 'playing') break;
    idle(world, Math.min(12, until - world.time));
  }
}

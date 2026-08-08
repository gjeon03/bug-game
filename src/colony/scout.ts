import { exposureAt, isWalkable, nearestWalkable } from '../world/nav';
import { mm } from '../world/units';
import type { Gate, Link } from '../world/types';
import {
  CAUGHT_RECOVER,
  DISCOVER_RADIUS,
  REACH,
  SCOUT_SPEED,
  SCOUT_SPRINT,
  SEEN_COOLDOWN,
  SEEN_SECONDS,
  SIGHTING_FLOOR_CAP,
  SIGHTING_FLOOR_GAIN,
  SPRINT_DRAIN,
  SPRINT_RECOVER,
  logEvent,
  pushCue,
  recomputeCapacity,
  regionState,
} from './state';
import { spawnSwat } from './household';
import type { Run } from './types';

/**
 * The player's body.
 *
 * The scout is not a cursor. It occupies space, it is seen or not seen depending on where it
 * stands, and every action in the game requires it to physically be somewhere — which is what
 * makes scouting *be* routing rather than a separate map-reveal minigame.
 */

export interface ScoutInput {
  /** Camera-relative movement, already rotated into world space by the input layer. */
  readonly moveX: number;
  readonly moveZ: number;
  readonly sprint: boolean;
}

export const CLIMB_REACH = mm(210);

/** Advances the scout and returns the new sprint reserve, 0..1. */
export function updateScout(run: Run, dt: number, input: ScoutInput, stamina: number): number {
  const scout = run.scout;
  scout.prevX = scout.x;
  scout.prevZ = scout.z;
  scout.prevY = scout.y;

  if (scout.downFor > 0) {
    scout.downFor -= dt;
    scout.speed = 0;
    if (scout.downFor <= 0) reviveScout(run);
    return Math.min(1, stamina + dt * SPRINT_RECOVER);
  }

  /*
   * Bleed off the crush meter — but only once the scout is actually clear.
   *
   * `crushedAt` carries that fact from `tickThreat`, which ran earlier in this same tick. Testing
   * it rather than relying on the ordering is not defensive style: the first version drained
   * unconditionally, which subtracted 0.85/s from a 0.93/s fill and left the meter creeping toward
   * a death that would have arrived twelve seconds after the threat had gone. Both halves read as
   * correct in isolation, and it took a printed trace — 0.125 after a swat's entire active window,
   * where 1.0 was expected — to see that they were fighting each other.
   *
   * Draining here rather than inside the threat loop is still right: a threat that expires while
   * the scout is under it must leave a meter that empties, or walking clear of a wipe would leave
   * the scout permanently one bad step from death.
   */
  if (scout.caught > 0 && scout.crushedAt < run.time) {
    scout.caught = Math.max(0, scout.caught - dt * CAUGHT_RECOVER);
  }

  if (scout.climb) {
    advanceClimb(run, dt);
    return Math.min(1, stamina + dt * SPRINT_RECOVER);
  }

  if (scout.working) {
    // Working is stationary and loud. Standing still to chew through a door sweep while somebody
    // is awake is the most dangerous thing the player ever does, and it should feel like it.
    scout.speed = 0;
    scout.state = 'working';
    accrueExposure(run, dt, 1.35);
    return Math.min(1, stamina + dt * SPRINT_RECOVER);
  }

  const magnitude = Math.hypot(input.moveX, input.moveZ);

  if (magnitude < 0.02) {
    scout.speed = 0;
    scout.state = 'idle';
    accrueExposure(run, dt, 0.55);
    return Math.min(1, stamina + dt * SPRINT_RECOVER);
  }

  const sprinting = input.sprint && stamina > 0.04;
  const speed = sprinting ? SCOUT_SPRINT : SCOUT_SPEED;
  const nextStamina = sprinting
    ? Math.max(0, stamina - dt * SPRINT_DRAIN)
    : Math.min(1, stamina + dt * SPRINT_RECOVER);

  const ux = input.moveX / magnitude;
  const uz = input.moveZ / magnitude;
  const step = speed * dt * Math.min(1, magnitude);

  const nextX = scout.x + ux * step;
  const nextZ = scout.z + uz * step;

  if (isWalkable(run.nav, scout.surface, nextX, nextZ)) {
    scout.x = nextX;
    scout.z = nextZ;
  } else if (isWalkable(run.nav, scout.surface, nextX, scout.z)) {
    scout.x = nextX;
  } else if (isWalkable(run.nav, scout.surface, scout.x, nextZ)) {
    scout.z = nextZ;
  }

  scout.heading = Math.atan2(ux, uz);
  scout.speed = speed * Math.min(1, magnitude);
  scout.state = 'moving';

  // Sprinting is loud: it raises how fast the household notices you.
  accrueExposure(run, dt, sprinting ? 1.6 : 1);
  discover(run);

  return nextStamina;
}

/**
 * How close is the household to seeing this?
 *
 * `seen` fills in the light and empties in cover. Reaching 1 is a sighting, which is the one event
 * that permanently raises a region's evidence floor — the household never un-sees a cockroach.
 */
function accrueExposure(run: Run, dt: number, multiplier: number): void {
  const scout = run.scout;
  const exposure = exposureAt(run.nav, scout.surface, scout.x, scout.z);
  const region = run.house.regionOf.get(scout.surface);

  if (scout.seenCooldown > 0) {
    scout.seenCooldown -= dt;
    scout.seen = Math.max(0, scout.seen - dt);
    return;
  }

  const shadow = run.colony.adaptations.filter((a) => a.family === 'shadow').length;
  const concealed = 1 / (1 + 0.35 * shadow);

  if (exposure > 0.5) {
    scout.seen = Math.min(1, scout.seen + (dt / SEEN_SECONDS) * exposure * multiplier * concealed);
  } else {
    scout.seen = Math.max(0, scout.seen - dt * 0.5);
  }

  if (scout.seen < 1 || !region) return;

  scout.seen = 0;
  scout.seenCooldown = SEEN_COOLDOWN;
  const state = regionState(run, region);
  state.evidenceFloor = Math.min(SIGHTING_FLOOR_CAP, state.evidenceFloor + SIGHTING_FLOOR_GAIN);
  state.evidence = Math.max(state.evidence, state.evidenceFloor);
  run.stats.sightings++;
  pushCue(run, 'scout.seen', scout.x, scout.y, scout.z);
  logEvent(run, 'log.sighting', 'danger', { region: `region.${region}` });

  /*
   * And a hand comes down.
   *
   * Aimed at where the sighting happened, captured now, rather than tracked to wherever the scout
   * is when the telegraph expires. That is what makes running the correct answer and standing still
   * the wrong one — the household is swinging at a memory, and the memory does not move.
   */
  spawnSwat(run, region, scout.surface, scout.x, scout.z);
}

/**
 * The colony sends up its next scout.
 *
 * At the home nest, not where the last one died. The player is put back at the bottom of the
 * kitchen and has to make the climb again, which is the part of the loss that is actually felt —
 * the worker is a number, but re-walking the route to the worktop is time.
 */
function reviveScout(run: Run): void {
  const scout = run.scout;
  const home = run.house.footholds.get('kitchen.undersink');
  const spot = home ? nearestWalkable(run.nav, home.surface, home.at.x, home.at.z) : null;

  if (home && spot) {
    scout.surface = home.surface;
    scout.x = spot.point.x;
    scout.z = spot.point.z;
    scout.y = run.house.surfaces.get(home.surface)?.y ?? 0;
    scout.prevX = scout.x;
    scout.prevZ = scout.z;
    scout.prevY = scout.y;
  }

  scout.downFor = 0;
  scout.caught = 0;
  scout.crushedAt = -1;
  scout.seen = 0;
  // The replacement arrives knowing the room is being watched, and gets the same grace a sighting
  // grants — otherwise it can be seen the instant it steps out and the run spirals.
  scout.seenCooldown = SEEN_COOLDOWN;
  scout.state = 'idle';
  scout.climb = null;
  scout.working = null;
  pushCue(run, 'scout.revived', scout.x, scout.y, scout.z);
  logEvent(run, 'log.scout.revived', 'warn', {});
}

/** Reveal hidden sites the scout walks past. Scouting is how the map becomes usable. */
function discover(run: Run): void {
  const scout = run.scout;
  for (const [id, state] of run.resources) {
    if (state.found) continue;
    const site = run.house.resources.get(id);
    if (!site || site.surface !== scout.surface) continue;
    if (Math.hypot(site.at.x - scout.x, site.at.z - scout.z) > DISCOVER_RADIUS) continue;
    state.found = true;
    pushCue(run, 'scout.found', site.at.x, scout.y, site.at.z);
    logEvent(run, 'log.found', 'good', { site: site.labelKey });
  }
}

/* --------------------------------------------------------------- traversal */

/** The climb the scout could take right now, if any. */
export function climbInReach(run: Run): Link | null {
  const scout = run.scout;
  let best: Link | null = null;
  let bestDistance = CLIMB_REACH;
  for (const link of run.nav.links) {
    const forward = link.from === scout.surface;
    if (!forward && link.to !== scout.surface) continue;
    const mouth = forward ? link.at : (link.exitAt ?? link.at);
    const d = Math.hypot(mouth.x - scout.x, mouth.z - scout.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = link;
    }
  }
  return best;
}

export function beginClimb(run: Run, link: Link): boolean {
  const scout = run.scout;
  if (scout.climb || scout.working) return false;
  const forward = link.from === scout.surface;
  const to = forward ? link.to : link.from;
  scout.climb = { link: link.id, progress: 0, from: scout.surface, to };
  scout.state = 'climbing';
  pushCue(run, 'scout.climb', scout.x, scout.y, scout.z);
  return true;
}

function advanceClimb(run: Run, dt: number): void {
  const scout = run.scout;
  const climb = scout.climb;
  if (!climb) return;
  const link = run.nav.links.find((l) => l.id === climb.link);
  if (!link) {
    scout.climb = null;
    scout.state = 'idle';
    return;
  }

  // The scout climbs faster than a worker — it is the strongest individual in the colony, and a
  // player waiting seven seconds on a pipe is a player not playing.
  climb.progress += dt / (link.seconds * 0.55);

  const fromY = run.house.surfaces.get(climb.from)?.y ?? 0;
  const toY = run.house.surfaces.get(climb.to)?.y ?? 0;
  const forward = link.from === climb.from;
  const mouth = forward ? link.at : (link.exitAt ?? link.at);
  const landing = forward ? (link.exitAt ?? link.at) : link.at;
  const t = Math.min(1, climb.progress);

  scout.x = mouth.x + (landing.x - mouth.x) * t;
  scout.z = mouth.z + (landing.z - mouth.z) * t;
  scout.y = fromY + (toY - fromY) * t;
  scout.speed = 0;

  if (climb.progress < 1) return;

  scout.surface = climb.to;
  scout.y = toY;
  const spot = nearestWalkable(run.nav, climb.to, scout.x, scout.z);
  if (spot) {
    scout.x = spot.point.x;
    scout.z = spot.point.z;
  }
  scout.climb = null;
  scout.state = 'idle';
  discover(run);
}

/* ------------------------------------------------------------- interaction */

/**
 * A refuge the scout could take — or rebuild — right now.
 *
 * A held refuge with damage on it is offered too, because rebuilding it is the same action: the
 * colony carries stores to a place and makes it liveable again. Before this, a damaged refuge was
 * invisible to the player entirely — `state?.claimed` skipped it — and since `damage` only ever
 * increases, the first sweep that landed made the run unwinnable and said nothing.
 */
export function footholdInReach(run: Run): string | null {
  const scout = run.scout;
  for (const [id, site] of run.house.footholds) {
    if (site.surface !== scout.surface) continue;
    if (Math.hypot(site.at.x - scout.x, site.at.z - scout.z) > REACH) continue;
    const state = run.footholds.get(id);
    if (state?.claimed && state.damage <= 0) continue;
    return id;
  }
  return null;
}

export function gateInReach(run: Run): Gate | null {
  const scout = run.scout;
  for (const gate of run.house.gates) {
    if (run.openGates.has(gate.id)) continue;
    if (gate.surface !== scout.surface) continue;
    if (Math.hypot(gate.at.x - scout.x, gate.at.z - scout.z) > REACH * 1.6) continue;
    return gate;
  }
  return null;
}

/**
 * Take a refuge, or rebuild a damaged one.
 *
 * ## Damage used to be permanent, and that made every sweep terminal
 *
 * `strikeFootholds` is the only writer of `state.damage` and it only ever adds. `claimFoothold` did
 * not clear it. So a refuge destroyed by an extermination went `claimed = false, damage = 1`, and
 * retaking it produced `claimed = true, damage = 1` — which fails every `damage < 1` test in the
 * game, including both halves of the victory check. Measured on seed 20260805 once traps stopped
 * wiping the colony outright: all four refuges sat at `damage: 1.00` and the run was arithmetically
 * unwinnable while the player was still playing it and still being told to take refuges.
 *
 * Rebuilding is priced by how much is broken, so a glancing hit is cheap to answer and a levelled
 * refuge costs what it originally did. That is the recovery loop the brief asks for — a setback the
 * player can work back from, rather than a scoreboard entry.
 */
export function claimFoothold(run: Run, id: string): boolean {
  const site = run.house.footholds.get(id);
  const state = run.footholds.get(id);
  if (!site || !state) return false;
  if (state.claimed && state.damage <= 0) return false;

  /*
   * A fresh take is the whole price; a repair is the fraction that was broken, capped below it.
   *
   * The cap is what keeps a harder sweep from becoming a costlier one. `strikeFootholds` now levels
   * up to three refuges at high severity and leaves them `claimed` with `damage = 1`, and without
   * the cap that arrives here as `share = 1` — the full price of ground the colony already knows.
   * Recovery would then scale with punishment, which is the "buy length with prices" shape the
   * brief rejects outright. Rebuilding on a floor you have already mapped costs less than taking it
   * cold, and that is also just true.
   */
  const share = state.claimed ? Math.max(0.2, Math.min(0.7, state.damage)) : 1;
  const food = site.cost.food * share;
  const moisture = site.cost.moisture * share;

  if (run.colony.food < food || run.colony.moisture < moisture) return false;
  if (run.colony.population < site.cost.workers) return false;

  /*
   * The specialization is earned by REACHING somewhere new, so only a first, undamaged take pays it.
   * A refuge that was levelled carries `damage = 1` into its retake, which is what distinguishes the
   * two cases without needing another field — and without letting a player farm points by losing
   * the same refuge repeatedly.
   */
  const isFirstTake = !state.claimed && state.damage <= 0;

  run.colony.food -= food;
  run.colony.moisture -= moisture;
  state.claimed = true;
  state.damage = 0;
  state.progress = 1;
  state.brood = 1;
  recomputeCapacity(run);

  /*
   * Taking a refuge is what earns a specialization.
   *
   * `adaptationPoints` used to be written in exactly one place — `openGate` — so sealing the flat to
   * the kitchen made the game unwinnable by construction: `evaluateRun` returns early while
   * `adaptations.length === 0`, no gate can ever open, and therefore no point can ever be earned.
   * Three independent reviewers found this in the source within minutes of the reseal.
   *
   * A foothold is the right new source, and not merely a convenient one. It is the same beat the
   * gate was carrying — the colony physically reaches somewhere new, and the reach is what makes it
   * capable of something new — expressed in the vocabulary of a one-room game.
   *
   * Rebuilding is not reaching. It restores what was there, so it pays nothing.
   */
  if (isFirstTake) run.colony.adaptationPoints++;

  const y = run.house.surfaces.get(site.surface)?.y ?? 0;
  // The log already distinguishes a first take from a rebuild; the ear should get the same
  // distinction rather than hearing the same fanfare for arriving somewhere new and for patching
  // something the household just wrecked.
  pushCue(run, isFirstTake ? 'foothold.claimed' : 'foothold.repaired', site.at.x, y, site.at.z);
  logEvent(run, isFirstTake ? 'log.foothold.claimed' : 'log.foothold.rebuilt', 'good', {
    foothold: site.labelKey,
  });
  run.idleFor = 0;
  return true;
}

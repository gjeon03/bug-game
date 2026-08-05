import { exposureAt, isWalkable, nearestWalkable } from '../world/nav';
import { mm } from '../world/units';
import type { Gate, Link } from '../world/types';
import {
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

export function footholdInReach(run: Run): string | null {
  const scout = run.scout;
  for (const [id, site] of run.house.footholds) {
    if (site.surface !== scout.surface) continue;
    if (Math.hypot(site.at.x - scout.x, site.at.z - scout.z) > REACH) continue;
    const state = run.footholds.get(id);
    if (state?.claimed) continue;
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
 * Take a foothold.
 *
 * Deducted immediately and in full. A foothold you cannot afford is a foothold you have to build
 * toward, which is the entire economy of the first two chapters.
 */
export function claimFoothold(run: Run, id: string): boolean {
  const site = run.house.footholds.get(id);
  const state = run.footholds.get(id);
  if (!site || !state || state.claimed) return false;
  if (run.colony.food < site.cost.food || run.colony.moisture < site.cost.moisture) return false;
  if (run.colony.population < site.cost.workers) return false;

  run.colony.food -= site.cost.food;
  run.colony.moisture -= site.cost.moisture;
  state.claimed = true;
  state.progress = 1;
  state.brood = 1;
  recomputeCapacity(run);

  const y = run.house.surfaces.get(site.surface)?.y ?? 0;
  pushCue(run, 'foothold.claimed', site.at.x, y, site.at.z);
  logEvent(run, 'log.foothold.claimed', 'good', { foothold: site.labelKey });
  run.idleFor = 0;
  return true;
}

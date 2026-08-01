import { clamp01, damp, dist2, rotateToward } from '../core/math.ts';
import {
  SCOUT_ACCEL,
  SCOUT_DAMP,
  SCOUT_INVULN_TIME,
  SCOUT_RADIUS,
  SCOUT_RESPAWN_TIME,
  SCOUT_SPEED,
  SCOUT_SPRINT_DRAIN,
  SCOUT_SPRINT_SPEED,
  SCOUT_STAMINA_MAX,
  SCOUT_STAMINA_REGEN,
  SCOUT_STAMINA_REGEN_DELAY,
  SCOUT_TURN_RATE,
} from './constants.ts';
import { collideCircle } from './field.ts';
import { eraseTrail, layTrail, recallWorkers } from './pheromone.ts';
import type { DeathCause } from './types.ts';
import { countAlive, homeNest, type World } from './world.ts';

/**
 * The lead scout.
 *
 * Movement feel is the first-priority tuning surface: acceleration is high enough that a key press
 * produces motion on the same frame, the body rotates faster than the velocity so turning reads
 * instantly, and collision resolution slides rather than sticking.
 */
export function updateScout(world: World, dt: number): void {
  const s = world.scout;

  if (!s.alive) {
    s.respawnTimer -= dt;
    if (s.respawnTimer <= 0) tryRespawn(world);
    return;
  }

  const input = world.input;
  const anyInput =
    input.up || input.down || input.left || input.right || input.lay || input.sprint || input.erase;
  if (anyInput) {
    s.idleTime = 0;
    if (world.stats.firstMoveAt < 0 && (input.up || input.down || input.left || input.right)) {
      world.stats.firstMoveAt = world.time;
    }
  } else {
    s.idleTime += dt;
    world.stats.idleSeconds += dt;
  }

  if (s.invuln > 0) s.invuln -= dt;

  // ── Sticky trap: the scout is held, not killed. The danger is what arrives while you are stuck.
  if (s.trapId >= 0) {
    s.sprinting = false;
    let effort = 0.42;
    if (input.sprint) effort += 0.75;
    if (input.left || input.right || input.up || input.down) effort += 0.4;
    s.trapStruggle -= effort * dt;
    s.stamina = Math.max(0, s.stamina - (input.sprint ? SCOUT_SPRINT_DRAIN * 0.6 * dt : 0));
    s.gait += dt * 16;
    if (s.trapStruggle <= 0) {
      const hazard = world.hazards.find((h) => h.id === s.trapId);
      if (hazard) hazard.capacity = Math.max(0, hazard.capacity - 1);
      s.trapId = -1;
      s.invuln = SCOUT_INVULN_TIME;
      s.vx = 0;
      s.vy = 0;
    }
    return;
  }

  let dx = 0;
  let dy = 0;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  const mag = Math.hypot(dx, dy);
  if (mag > 0) {
    dx /= mag;
    dy /= mag;
  }

  const wantsSprint = input.sprint && s.stamina > 1 && mag > 0;
  s.sprinting = wantsSprint;
  const maxSpeed = wantsSprint ? SCOUT_SPRINT_SPEED : SCOUT_SPEED;

  if (wantsSprint) {
    s.stamina = Math.max(0, s.stamina - SCOUT_SPRINT_DRAIN * dt);
    s.staminaDelay = SCOUT_STAMINA_REGEN_DELAY;
  } else if (s.staminaDelay > 0) {
    s.staminaDelay -= dt;
  } else {
    s.stamina = Math.min(SCOUT_STAMINA_MAX, s.stamina + SCOUT_STAMINA_REGEN * dt);
  }

  if (mag > 0) {
    s.vx += dx * SCOUT_ACCEL * dt;
    s.vy += dy * SCOUT_ACCEL * dt;
  } else {
    s.vx = damp(s.vx, 0, SCOUT_DAMP, dt);
    s.vy = damp(s.vy, 0, SCOUT_DAMP, dt);
  }

  const sp = Math.hypot(s.vx, s.vy);
  if (sp > maxSpeed) {
    s.vx = (s.vx / sp) * maxSpeed;
    s.vy = (s.vy / sp) * maxSpeed;
  }

  const prevX = s.x;
  const prevY = s.y;
  s.x += s.vx * dt;
  s.y += s.vy * dt;

  const c = collideCircle(s.x, s.y, SCOUT_RADIUS);
  if (c.hit) {
    // Slide: remove only the component of velocity pushing into the surface.
    const into = s.vx * c.nx + s.vy * c.ny;
    if (into < 0) {
      s.vx -= c.nx * into;
      s.vy -= c.ny * into;
    }
  }
  s.x = c.x;
  s.y = c.y;

  s.speed = Math.hypot(s.vx, s.vy);
  world.stats.distanceTravelled += Math.sqrt(dist2(prevX, prevY, s.x, s.y));

  if (s.speed > 6) {
    const heading = Math.atan2(s.vy, s.vx);
    s.angle = rotateToward(s.angle, heading, SCOUT_TURN_RATE * dt);
  }
  s.gait += (s.speed / 34) * dt * (wantsSprint ? 2.1 : 1) + dt * 0.6;

  // ── Pheromone secretion.
  s.laying = false;
  if (input.lay && world.reserve >= 1) {
    s.laying = true;
    layTrail(world, s.x, s.y, s.angle);
  } else {
    world.activeRouteId = -1;
  }

  if (input.erase) {
    eraseTrail(world, s.x, s.y, dt);
  }
  if (input.erasePressed) {
    world.input.erasePressed = false;
    recallWorkers(world);
  }
}

export function killScout(world: World, cause: DeathCause): void {
  const s = world.scout;
  if (!s.alive || s.invuln > 0) return;
  s.alive = false;
  s.respawnTimer = SCOUT_RESPAWN_TIME;
  s.trapId = -1;
  s.laying = false;
  s.sprinting = false;
  world.activeRouteId = -1;
  world.stats.scoutDeaths++;
  world.events.push({ t: 'scoutDied', x: s.x, y: s.y, cause });
}

/**
 * A replacement scout is promoted out of the colony. Losing the scout costs a body — painful, but
 * the colony, not the scout, is the real life bar.
 */
function tryRespawn(world: World): void {
  if (countAlive(world) <= 0) return;
  // Prefer a worker that is idle at home; otherwise take the one nearest the nest.
  const home = homeNest(world);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive || w.state === 'trapped') continue;
    const d = dist2(w.x, w.y, home.x, home.y) + (w.state === 'idle' ? 0 : 400000);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return;
  world.workers[best].alive = false;
  world.colony.population = countAlive(world);

  const s = world.scout;
  s.alive = true;
  s.x = home.x + 54;
  s.y = home.y;
  s.vx = 0;
  s.vy = 0;
  s.angle = 0;
  s.stamina = SCOUT_STAMINA_MAX;
  s.spotted = 0;
  s.invuln = SCOUT_INVULN_TIME;
  s.trapId = -1;
  world.events.push({ t: 'scoutRespawn', x: s.x, y: s.y });
}

/** Fraction of the trap struggle remaining, for the HUD prompt. */
export function scoutStruggleProgress(world: World): number {
  return clamp01(1 - world.scout.trapStruggle);
}

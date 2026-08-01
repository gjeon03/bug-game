import { dist2 } from '../core/math.ts';
import {
  BAIT_DPS,
  BAIT_RADIUS,
  FOOT_KILL_RADIUS,
  FOOT_RADIUS,
  FOOT_WARN_TIME,
  MAX_HAZARDS,
  NEST_INTEGRITY_DRAIN,
  PATROL_STEP_INTERVAL,
  SPRAY_DPS,
  SPRAY_FLUSH_RADIUS,
  SPRAY_RADIUS,
  SUSPICION_WEIGHTS,
  TRAP_ARM_TIME,
  TRAP_CAPACITY,
  TRAP_RADIUS,
  TRAP_STRUGGLE_TIME,
} from './constants.ts';
import { coverAt } from './field.ts';
import { PATROL_PATHS, SPRAY_PATHS, TRAP_SITES } from './kitchen.ts';
import { killScout } from './scout.ts';
import { addSuspicion } from './suspicion.ts';
import type { NightIndex } from './types.ts';
import { killWorker, panicWorkers } from './workers.ts';
import { homeNest, type World } from './world.ts';

/**
 * The three household response families.
 *
 * 1. Patrol — feet, shadow, room light. Learnable authored paths, bounded timing variation.
 * 2. Sticky traps and bait — placed *where the player's own traffic went*, so route choice has a
 *    visible consequence rather than random punishment.
 * 3. Extermination — spray sweeps that deny areas and attack the nest itself.
 *
 * Every lethal event is preceded by a perceivable warning: the foot contracts a decal for
 * {@link FOOT_WARN_TIME} seconds, traps spend {@link TRAP_ARM_TIME} unarmed and visibly settling, and
 * spray clouds ramp their lethality in over the first second.
 */

export function spawnPatrol(world: World, night: NightIndex, index: number): void {
  const candidates = PATROL_PATHS.filter((p) => p.night <= night);
  if (candidates.length === 0) return;
  const spec = candidates[index % candidates.length];
  const p0 = spec.points[0];
  world.patrols.push({
    id: world.nextId++,
    path: spec.points.map((p) => ({ x: p.x, y: p.y })),
    seg: 0,
    t: 0,
    speed: 210 + night * 26,
    x: p0.x,
    y: p0.y,
    angle: 0,
    stepTimer: 0.5,
    lightPower: 0,
    coneRange: 900,
    looking: false,
    life: 0,
    night,
    done: false,
  });
  world.events.push({ t: 'lightOn', x: p0.x, y: p0.y });
}

/** Ranks authored trap sites by how much player traffic actually crossed them. */
export function deployTraps(world: World, count: number, night: NightIndex): void {
  const scored: { x: number; y: number; score: number }[] = [];
  for (let i = 0; i < TRAP_SITES.length; i++) {
    const site = TRAP_SITES[i];
    if (world.hazards.some((h) => dist2(h.x, h.y, site.x, site.y) < 200 * 200)) continue;
    let score = 0;
    for (let r = 0; r < world.routes.length; r++) {
      const route = world.routes[r];
      if (!route.linked) continue;
      for (let n = 0; n < route.nodes.length; n += 2) {
        const node = route.nodes[n];
        if (dist2(node.x, node.y, site.x, site.y) < 190 * 190) score += 1 + node.exposure * 2;
      }
    }
    // A site with no traffic at all is still a candidate, but a distant last resort.
    score += (1 - coverAt(site.x, site.y)) * 0.4;
    scored.push({ x: site.x, y: site.y, score });
  }
  scored.sort((a, b) => b.score - a.score);
  for (let i = 0; i < Math.min(count, scored.length); i++) {
    if (world.hazards.length >= MAX_HAZARDS) break;
    const s = scored[i];
    world.hazards.push({
      id: world.nextId++,
      kind: 'trap',
      x: s.x,
      y: s.y,
      radius: TRAP_RADIUS,
      armTime: TRAP_ARM_TIME,
      armed: false,
      capacity: TRAP_CAPACITY,
      age: 0,
      sprung: 0,
      night,
    });
    world.events.push({ t: 'trapArmed', x: s.x, y: s.y, kind: 'trap' });
  }
}

export function deployBait(world: World, count: number, night: NightIndex): void {
  const scored: { x: number; y: number; score: number }[] = [];
  for (let i = 0; i < TRAP_SITES.length; i++) {
    const site = TRAP_SITES[i];
    if (world.hazards.some((h) => dist2(h.x, h.y, site.x, site.y) < 240 * 240)) continue;
    let score = coverAt(site.x, site.y);
    for (let r = 0; r < world.routes.length; r++) {
      const route = world.routes[r];
      if (!route.linked) continue;
      for (let n = 0; n < route.nodes.length; n += 3) {
        if (dist2(route.nodes[n].x, route.nodes[n].y, site.x, site.y) < 210 * 210) score += 1.5;
      }
    }
    scored.push({ x: site.x, y: site.y, score });
  }
  scored.sort((a, b) => b.score - a.score);
  for (let i = 0; i < Math.min(count, scored.length); i++) {
    if (world.hazards.length >= MAX_HAZARDS) break;
    const s = scored[i];
    world.hazards.push({
      id: world.nextId++,
      kind: 'bait',
      x: s.x,
      y: s.y,
      radius: BAIT_RADIUS,
      armTime: TRAP_ARM_TIME * 1.4,
      armed: false,
      capacity: 999,
      age: 0,
      sprung: 0,
      night,
    });
    world.events.push({ t: 'trapArmed', x: s.x, y: s.y, kind: 'bait' });
  }
}

export function spawnSpray(world: World, index: number, targeted = false): void {
  const spec = SPRAY_PATHS[index % SPRAY_PATHS.length];
  const p0 = spec.points[0];
  world.sprays.push({
    id: world.nextId++,
    targeted,
    path: spec.points.map((p) => ({ x: p.x, y: p.y })),
    seg: 0,
    t: 0,
    speed: 128,
    x: p0.x,
    y: p0.y,
    radius: SPRAY_RADIUS,
    life: 0,
    age: 0,
    done: false,
  });
  world.events.push({ t: 'sprayStart', x: p0.x, y: p0.y });
}

export function stomp(world: World, x: number, y: number): void {
  world.footfalls.push({ x, y, warn: FOOT_WARN_TIME, warnTotal: FOOT_WARN_TIME, done: false });
  world.events.push({ t: 'footWarn', x, y });
  // Scatter on the telegraph, not on the impact. Roaches that only reacted after the foot landed
  // meant a patrol crossing a busy supply line deleted twenty workers in a few seconds, with the
  // warning serving the player and nobody else.
  panicWorkers(world, x, y, FOOT_RADIUS * 1.5);
}

function advanceAlongPath(
  entity: { path: { x: number; y: number }[]; seg: number; t: number; x: number; y: number },
  speed: number,
  dt: number,
): boolean {
  let remaining = speed * dt;
  while (remaining > 0) {
    if (entity.seg >= entity.path.length - 1) return true;
    const a = entity.path[entity.seg];
    const b = entity.path[entity.seg + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 0.001) {
      entity.seg++;
      continue;
    }
    const left = (1 - entity.t) * segLen;
    if (remaining < left) {
      entity.t += remaining / segLen;
      remaining = 0;
    } else {
      remaining -= left;
      entity.seg++;
      entity.t = 0;
    }
  }
  if (entity.seg >= entity.path.length - 1) return true;
  const a = entity.path[entity.seg];
  const b = entity.path[entity.seg + 1];
  entity.x = a.x + (b.x - a.x) * entity.t;
  entity.y = a.y + (b.y - a.y) * entity.t;
  return false;
}

export function updateThreats(world: World, dt: number): void {
  // ── Patrols.
  let lightTarget = 0;
  for (let i = world.patrols.length - 1; i >= 0; i--) {
    const p = world.patrols[i];
    p.life += dt;
    const prevX = p.x;
    const prevY = p.y;
    const finished = advanceAlongPath(p, p.speed, dt);
    const mx = p.x - prevX;
    const my = p.y - prevY;
    if (Math.hypot(mx, my) > 0.5) p.angle = Math.atan2(my, mx);

    // Light ramps in over the first second and out over the last.
    const fadeIn = Math.min(1, p.life / 0.9);
    p.lightPower = fadeIn * (finished ? 0 : 1);
    p.looking = p.lightPower > 0.5;
    lightTarget = Math.max(lightTarget, p.lightPower * (0.42 + 0.08 * p.night));

    p.stepTimer -= dt;
    if (p.stepTimer <= 0 && !finished) {
      p.stepTimer = PATROL_STEP_INTERVAL * world.rng.range(0.85, 1.15);
      // Footfalls land slightly ahead of the walker, which is what makes them dodgeable.
      const lead = 130;
      stomp(world, p.x + Math.cos(p.angle) * lead, p.y + Math.sin(p.angle) * lead);
    }

    if (finished) {
      world.patrols.splice(i, 1);
      world.events.push({ t: 'lightOff' });
    }
  }
  world.roomLightTarget = lightTarget;
  const k = 1 - Math.exp(-3.4 * dt);
  world.roomLight += (world.roomLightTarget - world.roomLight) * k;

  // ── A scout that got spotted brings a foot down where it was standing.
  if (world.pendingStomp) {
    stomp(world, world.pendingStomp.x, world.pendingStomp.y);
    world.pendingStomp = null;
  }

  // ── Footfalls.
  for (let i = world.footfalls.length - 1; i >= 0; i--) {
    const f = world.footfalls[i];
    f.warn -= dt;
    if (f.warn <= 0 && !f.done) {
      f.done = true;
      impact(world, f.x, f.y);
    }
    if (f.warn < -0.75) world.footfalls.splice(i, 1);
  }

  // ── Traps and bait.
  const scout = world.scout;
  for (let i = world.hazards.length - 1; i >= 0; i--) {
    const h = world.hazards[i];
    h.age += dt;
    if (!h.armed) {
      h.armTime -= dt;
      if (h.armTime <= 0) h.armed = true;
      continue;
    }
    if (h.capacity <= 0) {
      // A full trap is inert but stays visible — the player should see why the route reopened.
      continue;
    }

    const r2 = h.radius * h.radius;
    if (h.kind === 'trap') {
      if (
        scout.alive &&
        scout.trapId < 0 &&
        scout.invuln <= 0 &&
        dist2(scout.x, scout.y, h.x, h.y) < r2
      ) {
        scout.trapId = h.id;
        scout.trapStruggle = 1;
        scout.vx = 0;
        scout.vy = 0;
        world.events.push({ t: 'trapSprung', x: h.x, y: h.y });
        world.stats.trapsSprung++;
        addSuspicion(world, 'trap', SUSPICION_WEIGHTS.trap, h.x, h.y);
      }
      for (let j = 0; j < world.workers.length; j++) {
        const w = world.workers[j];
        if (!w.alive || w.state === 'trapped') continue;
        if (dist2(w.x, w.y, h.x, h.y) > r2) continue;
        w.state = 'trapped';
        w.timer = TRAP_STRUGGLE_TIME;
        w.hazardId = h.id;
        w.vx = 0;
        w.vy = 0;
        h.sprung++;
        world.stats.trapsSprung++;
        world.events.push({ t: 'trapSprung', x: w.x, y: w.y });
        addSuspicion(world, 'trap', SUSPICION_WEIGHTS.trap, h.x, h.y);
        break;
      }
    } else {
      // Bait: a slow, permanent denial zone. Standing in it is survivable if you leave.
      for (let j = 0; j < world.workers.length; j++) {
        const w = world.workers[j];
        if (!w.alive || w.state === 'trapped') continue;
        if (dist2(w.x, w.y, h.x, h.y) > r2) continue;
        if (w.state !== 'panic') {
          w.state = 'panic';
          w.panicTime = 1.4;
          w.angle = Math.atan2(w.y - h.y, w.x - h.x);
        }
        if (h.age > 0 && world.rng.next() < dt * BAIT_DPS) killWorker(world, w, 'bait');
      }
      if (scout.alive && dist2(scout.x, scout.y, h.x, h.y) < r2) {
        scout.spotted = Math.min(1, scout.spotted + dt * 0.3);
        if (world.rng.next() < dt * 0.22) killScout(world, 'bait');
      }
    }
  }

  // ── Extermination sprays.
  const home = homeNest(world);
  for (let i = world.sprays.length - 1; i >= 0; i--) {
    const s = world.sprays[i];
    s.age += dt;
    s.life += dt;
    const finished = advanceAlongPath(s, s.speed, dt);
    const lethality = Math.min(1, s.age / 1.1);
    const r2 = s.radius * s.radius;

    if (scout.alive && dist2(scout.x, scout.y, s.x, s.y) < r2) {
      scout.spotted = Math.min(1, scout.spotted + dt * 0.5);
      if (world.rng.next() < dt * 0.85 * lethality) killScout(world, 'spray');
    }
    for (let j = 0; j < world.workers.length; j++) {
      const w = world.workers[j];
      if (!w.alive) continue;
      const d2 = dist2(w.x, w.y, s.x, s.y);
      // Scatter well before the cloud arrives, so the colony has time to reach a crack.
      if (
        d2 < (s.radius + 380) * (s.radius + 380) &&
        w.state !== 'panic' &&
        w.state !== 'trapped'
      ) {
        w.state = 'panic';
        w.panicTime = 2.6;
        w.angle = Math.atan2(w.y - s.y, w.x - s.x);
      }
      if (d2 > r2) continue;
      // A roach sitting in a claimed crack is inside the wall and out of reach of the spray.
      if (sheltered(world, w.x, w.y)) continue;
      if (world.rng.next() < dt * SPRAY_DPS * lethality) killWorker(world, w, 'spray');
    }

    if (dist2(home.x, home.y, s.x, s.y) < (s.radius + 60) * (s.radius + 60)) {
      home.integrity = Math.max(0, home.integrity - NEST_INTEGRITY_DRAIN * dt);
    }

    if (finished || s.life > 30) world.sprays.splice(i, 1);
  }

  // ── Corpses age; the oldest fade out of the evidence pool.
  for (let i = world.corpses.length - 1; i >= 0; i--) {
    const c = world.corpses[i];
    c.age += dt;
    if (c.age > 95) world.corpses.splice(i, 1);
  }
}

/**
 * True when the point is inside a claimed crack and the crack itself is not being sprayed into.
 *
 * Shelter is the colony's answer to a cloud passing overhead. It is deliberately *not* an answer to
 * an exterminator who has walked up to the opening and emptied the can into it — otherwise reaching
 * the extermination tier would carry no risk at all, and the whole evidence economy would be
 * decoration.
 */
function sheltered(world: World, x: number, y: number): boolean {
  for (let i = 0; i < world.nests.length; i++) {
    const n = world.nests[i];
    if (!n.claimed || dist2(x, y, n.x, n.y) >= 95 * 95) continue;
    let flushed = false;
    for (let j = 0; j < world.sprays.length; j++) {
      const s = world.sprays[j];
      if (s.targeted && dist2(s.x, s.y, n.x, n.y) < SPRAY_FLUSH_RADIUS * SPRAY_FLUSH_RADIUS) {
        flushed = true;
        break;
      }
    }
    if (!flushed) return true;
  }
  return false;
}

function impact(world: World, x: number, y: number): void {
  world.events.push({ t: 'footHit', x, y });
  const kill2 = FOOT_KILL_RADIUS * FOOT_KILL_RADIUS;
  let killed = 0;

  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive) continue;
    if (dist2(w.x, w.y, x, y) > kill2) continue;
    if (sheltered(world, w.x, w.y)) continue;
    killWorker(world, w, 'foot');
    killed++;
  }

  const s = world.scout;
  if (s.alive && s.invuln <= 0 && dist2(s.x, s.y, x, y) < kill2) {
    killScout(world, 'foot');
    killed++;
  }

  panicWorkers(world, x, y, FOOT_RADIUS * 2.4);

  // Stepping on something is how a human finds out for certain.
  if (killed > 0) addSuspicion(world, 'seen', 1, x, y);
}

/** Called on a tier rising edge. Each family arrives once per tier, never double-spawned. */
export function requestResponse(world: World, tier: number): void {
  // Belt and braces: even a mis-wired caller cannot stack responses without bound.
  if (world.patrols.length >= 3 || world.sprays.length >= 3) return;
  switch (tier) {
    case 1:
      if (world.patrols.length === 0) spawnPatrol(world, world.night, world.tick % 2);
      break;
    case 2:
      deployTraps(world, 2, world.night);
      if (world.patrols.length === 0) spawnPatrol(world, world.night, 1);
      break;
    case 3:
      deployTraps(world, 2, world.night);
      deployBait(world, 1, world.night);
      spawnPatrol(world, world.night, 2);
      break;
    case 4:
      // Extermination: two clouds, and their paths run over the cracks.
      spawnSpray(world, world.night % SPRAY_PATHS.length, true);
      spawnSpray(world, (world.night + 2) % SPRAY_PATHS.length, true);
      deployTraps(world, 1, world.night);
      break;
    default:
      break;
  }
}

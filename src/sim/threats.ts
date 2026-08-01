import { dist2 } from '../core/math.ts';
import {
  WORLD_H,
  WORLD_W,
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
import { spawnSweep, updateSweeps } from './routines.ts';
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

/**
 * Sends a human toward a place the household is suspicious of.
 *
 * The authored path nearest the target is chosen, so patrol routes stay learnable — a player who
 * memorised where the feet walk keeps that knowledge — while *which* route gets walked is now a
 * consequence of where the colony has been working.
 */
/** Seconds a live hazard stays on the floor before the household tidies it away. */
export const HAZARD_LIFE = 115;
/** A trap that has caught its fill is cleared sooner — it is visibly full. */
export const HAZARD_SPENT_LIFE = 26;

export function spawnPatrol(world: World, tx: number, ty: number): void {
  if (world.patrols.length >= 2) return;
  let spec = PATROL_PATHS[0];
  let bestD = Infinity;
  for (const p of PATROL_PATHS) {
    let near = Infinity;
    for (const pt of p.points) near = Math.min(near, dist2(pt.x, pt.y, tx, ty));
    if (near < bestD) {
      bestD = near;
      spec = p;
    }
  }
  const p0 = spec.points[0];
  world.patrols.push({
    id: world.nextId++,
    path: spec.points.map((p) => ({ x: p.x, y: p.y })),
    seg: 0,
    t: 0,
    speed: 210 + world.suspicion.tier * 22,
    x: p0.x,
    y: p0.y,
    angle: 0,
    stepTimer: 0.5,
    lightPower: 0,
    coneRange: 900,
    looking: false,
    life: 0,
    night: 1,
    done: false,
  });
  world.events.push({ t: 'lightOn', x: p0.x, y: p0.y });
}

/**
 * Scores a candidate site by how much *worker traffic* actually crossed it.
 *
 * The old version summed trail nodes and never read `route.traffic`, so a line six roaches were
 * pounding and a line nobody used scored identically. Traps are supposed to be the household
 * noticing you, which means they have to be aimed at bodies, not at geometry.
 */
function trafficScore(world: World, x: number, y: number, radius: number): number {
  let score = 0;
  for (let r = 0; r < world.routes.length; r++) {
    const route = world.routes[r];
    if (!route.linked) continue;
    const weight = 1 + route.traffic * 0.9;
    for (let n = 0; n < route.nodes.length; n += 2) {
      const node = route.nodes[n];
      if (dist2(node.x, node.y, x, y) < radius * radius) score += weight * (1 + node.exposure * 2);
    }
  }
  for (let w = 0; w < world.workers.length; w++) {
    const worker = world.workers[w];
    if (!worker.alive) continue;
    if (dist2(worker.x, worker.y, x, y) < radius * radius) score += 0.6;
  }
  return score;
}

/** Picks the best authored hazard site inside a region the household has noticed. */
function siteNear(
  world: World,
  tx: number,
  ty: number,
  minSpacing: number,
  prefersCover: boolean,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < TRAP_SITES.length; i++) {
    const site = TRAP_SITES[i];
    if (dist2(site.x, site.y, tx, ty) > 620 * 620) continue;
    if (world.hazards.some((h) => dist2(h.x, h.y, site.x, site.y) < minSpacing * minSpacing)) {
      continue;
    }
    const score =
      trafficScore(world, site.x, site.y, 190) +
      (prefersCover ? coverAt(site.x, site.y) * 1.2 : (1 - coverAt(site.x, site.y)) * 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = { x: site.x, y: site.y };
    }
  }
  return best;
}

export function deployTraps(world: World, count: number, tx: number, ty: number): void {
  for (let i = 0; i < count; i++) {
    if (world.hazards.length >= MAX_HAZARDS) break;
    const s = siteNear(world, tx, ty, 210, false);
    if (!s) break;
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
      night: 1,
    });
    world.events.push({ t: 'trapArmed', x: s.x, y: s.y, kind: 'trap' });
  }
}

export function deployBait(world: World, count: number, tx: number, ty: number): void {
  for (let i = 0; i < count; i++) {
    if (world.hazards.length >= MAX_HAZARDS) break;
    const s = siteNear(world, tx, ty, 250, true);
    if (!s) break;
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
      night: 1,
    });
    world.events.push({ t: 'trapArmed', x: s.x, y: s.y, kind: 'bait' });
  }
}

/** A cleaning pass across a region the household has decided is dirty. */
export function sweepRegion(world: World, tx: number, ty: number): void {
  const dx = tx < 1800 ? 1 : -1;
  spawnSweep(
    world,
    [
      { x: tx - 340 * dx, y: ty - 260 },
      { x: tx, y: ty },
      { x: tx + 360 * dx, y: ty + 240 },
    ],
    198,
  );
}

/**
 * Spray.
 *
 * The path is chosen to pass through the region the household is acting on, so a cloud is always a
 * consequence of somewhere the colony worked. `targeted` clouds go for the cracks themselves and
 * flush roaches out of shelter; untargeted ones can be ridden out inside a claimed crack, which is
 * what makes claiming cracks worth its evidence.
 */
export function spawnSpray(world: World, tx: number, ty: number, targeted = false): void {
  if (world.sprays.length >= 2) return;
  // Pick the authored path whose *shape* best suits the target, then slide the whole path so its
  // closest point sits on the target.
  //
  // Choosing the nearest authored path and walking it unchanged was not good enough: when the
  // player's hottest corridor sat away from every authored line the cloud missed it by up to 1 800
  // units, and "the extermination is aimed at your own map" stopped being true. Translating keeps
  // the motion learnable — the sweeps still move the way they always did — while guaranteeing the
  // can is emptied over the ground the household actually has evidence about.
  let spec = SPRAY_PATHS[0];
  let bestD = Infinity;
  let bestIdx = 0;
  for (const p of SPRAY_PATHS) {
    for (let i = 0; i < p.points.length; i++) {
      const d = dist2(p.points[i].x, p.points[i].y, tx, ty);
      if (d < bestD) {
        bestD = d;
        spec = p;
        bestIdx = i;
      }
    }
  }
  const anchor = spec.points[bestIdx];
  const ox = tx - anchor.x;
  const oy = ty - anchor.y;
  const path = spec.points.map((p) => ({
    x: Math.max(120, Math.min(WORLD_W - 120, p.x + ox)),
    y: Math.max(120, Math.min(WORLD_H - 120, p.y + oy)),
  }));
  const p0 = path[0];
  world.sprays.push({
    id: world.nextId++,
    targeted,
    path,
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
  updateSweeps(world, dt);
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
    // Hazards age out. Nothing used to remove them — ever — so a run reached MAX_HAZARDS against 14
    // authored sites and the household permanently lost its only non-patrol response, which is why
    // the late game went quiet. A spent or elderly hazard is now cleared away like a real one.
    const expired = h.capacity <= 0 ? h.age > HAZARD_SPENT_LIFE : h.age > HAZARD_LIFE;
    if (expired) {
      world.hazards.splice(i, 1);
      continue;
    }
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

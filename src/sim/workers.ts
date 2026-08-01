import { clamp01, dist2 } from '../core/math.ts';
import {
  EXPOSURE_DANGER,
  NODE_LIFE,
  NODE_REINFORCE,
  NYMPH_TIME,
  WORKER_CARRY_FOOD,
  WORKER_CARRY_WATER,
  WORKER_HARVEST_TIME,
  WORKER_LOOKAHEAD,
  WORKER_PANIC_TIME,
  WORKER_RADIUS,
  WORKER_SEPARATION,
} from './constants.ts';
import { exposureAt } from './exposure.ts';
import { collideCircle, coverAt } from './field.ts';
import { getRoute, nearestNodeIndex } from './pheromone.ts';
import type { DeathCause, Worker } from './types.ts';
import { findNest, findResource, homeNest, type World } from './world.ts';

/**
 * Worker behaviour.
 *
 * Workers are never selected or ordered. Every decision they make is a local read of the pheromone
 * field, which is what keeps routing — not micromanagement — the strategic layer. Their visible
 * states are deliberately few and legible: idle, outbound, harvesting, inbound, panic, trapped.
 */

const ARRIVE_NODE = 30;

export function killWorker(world: World, w: Worker, cause: DeathCause): void {
  if (!w.alive) return;
  w.alive = false;
  world.colony.lost++;
  world.stats.workersLost++;
  world.corpses.push({
    x: w.x,
    y: w.y,
    angle: w.angle,
    age: 0,
    cover: coverAt(w.x, w.y),
    cause,
    scale: w.scale,
    reported: false,
  });
  if (world.corpses.length > 40) world.corpses.shift();
  world.events.push({ t: 'workerDied', x: w.x, y: w.y, cause });
}

export function updateWorkers(world: World, dt: number): void {
  const hash = world.workerHash;
  hash.clear();
  const workers = world.workers;
  for (let i = 0; i < workers.length; i++) {
    if (workers[i].alive) hash.insert(i, workers[i].x, workers[i].y);
  }

  const home = homeNest(world);
  let exposed = 0;
  let alive = 0;

  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    if (!w.alive) continue;
    alive++;

    if (w.nymphTime > 0) {
      w.nymphTime -= dt;
      w.scale = 0.55 + 0.45 * (1 - w.nymphTime / NYMPH_TIME);
    }

    // ── Trapped: struggle, then die. This is what makes traps a real route-denial cost.
    if (w.state === 'trapped') {
      w.timer -= dt;
      w.gait += dt * 14;
      w.angle += Math.sin(w.timer * 22 + w.variant) * 3.2 * dt;
      if (w.timer <= 0) {
        const hz = world.hazards.find((h) => h.id === w.hazardId);
        if (hz) hz.capacity = Math.max(0, hz.capacity - 1);
        killWorker(world, w, 'trap');
      }
      continue;
    }

    let dirX = 0;
    let dirY = 0;
    let speedMul = 1;

    switch (w.state) {
      case 'idle': {
        const nest = findNest(world, w.targetNest) ?? home;
        const d2 = dist2(w.x, w.y, nest.x, nest.y);
        if (d2 > 120 * 120) {
          const d = Math.sqrt(d2);
          dirX = (nest.x - w.x) / d;
          dirY = (nest.y - w.y) / d;
          speedMul = 0.85;
        } else {
          w.timer -= dt;
          if (w.timer <= 0) {
            w.timer = world.rng.range(0.5, 1.6);
            const a = world.rng.range(0, Math.PI * 2);
            w.vx = Math.cos(a) * 26;
            w.vy = Math.sin(a) * 26;
          }
          dirX = w.vx * 0.02;
          dirY = w.vy * 0.02;
          speedMul = 0.28;
        }
        if (w.nymphTime <= 0) tryAcquireRoute(world, w);
        break;
      }

      case 'outbound':
      case 'inbound': {
        const route = getRoute(world, w.routeId);
        if (!route || !route.linked) {
          w.routeId = -1;
          w.state = w.carrying ? 'inbound' : 'idle';
          if (!w.carrying) break;
          // Carrying with no route: walk home unaided.
          const nest = findNest(world, w.targetNest) ?? home;
          const d = Math.max(1, Math.hypot(nest.x - w.x, nest.y - w.y));
          dirX = (nest.x - w.x) / d;
          dirY = (nest.y - w.y) / d;
          if (d < 46) deliver(world, w, nest.x, nest.y);
          break;
        }

        const nodes = route.nodes;
        const idx = nearestNodeIndex(route, w.x, w.y, w.nodeIndex);
        if (idx < 0) {
          w.lostTime += dt;
          const anchor =
            w.state === 'outbound'
              ? nodes[route.resEnd === 1 ? nodes.length - 1 : 0]
              : nodes[route.nestEnd === 1 ? nodes.length - 1 : 0];
          const d = Math.max(1, Math.hypot(anchor.x - w.x, anchor.y - w.y));
          dirX = (anchor.x - w.x) / d;
          dirY = (anchor.y - w.y) / d;
          if (w.lostTime > 2.4) {
            w.routeId = -1;
            w.nodeIndex = -1;
            w.lostTime = 0;
            w.state = w.carrying ? 'inbound' : 'idle';
          }
          break;
        }

        w.lostTime = 0;
        w.nodeIndex = idx;
        // Traffic reinforces the trail it walks on, so a working supply line sustains itself.
        const here = nodes[idx];
        if (here.life < NODE_LIFE) here.life = Math.min(NODE_LIFE, here.life + NODE_REINFORCE * dt);
        const sign =
          w.state === 'outbound' ? (route.resEnd === 1 ? 1 : -1) : route.nestEnd === 1 ? 1 : -1;
        w.dirSign = sign;

        let target = idx + sign * WORKER_LOOKAHEAD;
        if (target < 0) target = 0;
        if (target > nodes.length - 1) target = nodes.length - 1;
        const tn = nodes[target];
        const d = Math.max(1, Math.hypot(tn.x - w.x, tn.y - w.y));
        dirX = (tn.x - w.x) / d;
        dirY = (tn.y - w.y) / d;
        // Bias along the trail tangent so the column stays single-file instead of clumping.
        dirX += tn.dx * sign * 0.5;
        dirY += tn.dy * sign * 0.5;

        const endIdx = sign > 0 ? nodes.length - 1 : 0;
        if (
          idx === endIdx &&
          dist2(w.x, w.y, nodes[endIdx].x, nodes[endIdx].y) < ARRIVE_NODE * ARRIVE_NODE
        ) {
          if (w.state === 'outbound') {
            const res = findResource(world, route.resourceId);
            if (res && !res.depleted) {
              w.state = 'harvest';
              w.timer = WORKER_HARVEST_TIME;
              w.targetResource = res.id;
              res.busy++;
            } else {
              w.state = 'inbound';
            }
          } else {
            const nest = findNest(world, route.nestId) ?? home;
            deliver(world, w, nest.x, nest.y);
          }
        }
        speedMul = w.carrying ? 0.78 : 1;
        break;
      }

      case 'harvest': {
        w.timer -= dt;
        speedMul = 0;
        if (w.timer <= 0) {
          const res = findResource(world, w.targetResource);
          if (res) {
            res.busy = Math.max(0, res.busy - 1);
            const want = res.kind === 'food' ? WORKER_CARRY_FOOD : WORKER_CARRY_WATER;
            const bonus = world.colony.upgrades.cache ? 1.25 : 1;
            const take = Math.min(res.amount, want * bonus);
            if (take > 0) {
              res.amount -= take;
              res.disturbance = clamp01(res.disturbance + 0.12);
              w.carrying = res.kind;
              w.carryAmount = take;
              world.events.push({ t: 'pickup', x: w.x, y: w.y, kind: res.kind });
            }
            if (res.amount <= 0.001) res.depleted = true;
          }
          w.state = 'inbound';
          w.nodeIndex = -1;
        }
        break;
      }

      case 'panic': {
        w.panicTime -= dt;
        speedMul = 1.5;
        const esc = world.nests.find((n) => n.claimed && n.upgrade === 'escape');
        if (esc && dist2(w.x, w.y, esc.x, esc.y) < 700 * 700) {
          const d = Math.max(1, Math.hypot(esc.x - w.x, esc.y - w.y));
          dirX = (esc.x - w.x) / d;
          dirY = (esc.y - w.y) / d;
          if (d < 44) {
            // Escape tunnel: panicked workers survive and reappear at home.
            w.x = home.x + world.rng.signed() * 26;
            w.y = home.y + world.rng.signed() * 26;
            w.state = 'idle';
            w.panicTime = 0;
            w.routeId = -1;
            break;
          }
        } else {
          const jitter = Math.sin(world.time * 7 + w.variant * 2.1) * 0.9;
          dirX = Math.cos(w.angle + jitter);
          dirY = Math.sin(w.angle + jitter);
          // Head for cover: sample four directions and take the one with the most cover.
          if ((world.tick + i) % 12 === 0) {
            let bestA = w.angle;
            let bestC = -1;
            for (let k = 0; k < 6; k++) {
              const a = w.angle + (k / 6) * Math.PI * 2;
              const c = coverAt(w.x + Math.cos(a) * 90, w.y + Math.sin(a) * 90);
              if (c > bestC) {
                bestC = c;
                bestA = a;
              }
            }
            w.angle = bestA;
          }
        }
        if (w.panicTime <= 0) {
          w.state = w.carrying ? 'inbound' : 'idle';
          w.nodeIndex = -1;
        }
        break;
      }

      default:
        break;
    }

    // ── Separation keeps the column readable instead of a blob.
    let sx = 0;
    let sy = 0;
    hash.query(w.x, w.y, WORKER_SEPARATION, (id) => {
      if (id === i) return;
      const o = workers[id];
      const dx = w.x - o.x;
      const dy = w.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > WORKER_SEPARATION * WORKER_SEPARATION || d2 <= 0.0001) return;
      const inv = 1 / Math.sqrt(d2);
      sx += dx * inv;
      sy += dy * inv;
    });
    dirX += sx * 0.55;
    dirY += sy * 0.55;

    const dl = Math.hypot(dirX, dirY);
    const target = w.speed * speedMul;
    let tvx = 0;
    let tvy = 0;
    if (dl > 0.001 && target > 0) {
      tvx = (dirX / dl) * target;
      tvy = (dirY / dl) * target;
    }
    const k = 1 - Math.exp(-14 * dt);
    w.vx += (tvx - w.vx) * k;
    w.vy += (tvy - w.vy) * k;

    w.x += w.vx * dt;
    w.y += w.vy * dt;
    const c = collideCircle(w.x, w.y, WORKER_RADIUS);
    if (c.hit) {
      const into = w.vx * c.nx + w.vy * c.ny;
      if (into < 0) {
        w.vx -= c.nx * into;
        w.vy -= c.ny * into;
      }
      w.x = c.x;
      w.y = c.y;
    }

    const sp = Math.hypot(w.vx, w.vy);
    if (sp > 4) w.angle = Math.atan2(w.vy, w.vx);
    w.gait += (sp / 26) * dt + dt * 0.4;

    // ── Exposure sampling is round-robin: one sixth of the colony per step.
    if ((world.tick + i) % 6 === 0) {
      w.exposure = exposureAt(world, w.x, w.y);
    }
    if (w.exposure > EXPOSURE_DANGER) exposed++;
  }

  world.colony.population = alive;
  world.exposedWorkers = exposed;
  if (alive > world.stats.peakPopulation) world.stats.peakPopulation = alive;
}

function deliver(world: World, w: Worker, x: number, y: number): void {
  if (w.carrying) {
    const c = world.colony;
    const amount = w.carryAmount;
    if (w.carrying === 'food') {
      const before = c.food;
      c.food = Math.min(c.foodCap, c.food + amount);
      c.totalFood += c.food - before;
    } else {
      const before = c.water;
      c.water = Math.min(c.waterCap, c.water + amount);
      c.totalWater += c.water - before;
    }
    world.stats.deliveries++;
    if (world.stats.firstDeliveryAt < 0) world.stats.firstDeliveryAt = world.time;
    world.events.push({ t: 'deliver', x, y, kind: w.carrying, amount });
  }
  w.carrying = null;
  w.carryAmount = 0;
  w.state = 'idle';
  w.nodeIndex = -1;
  w.timer = world.rng.range(0.1, 0.5);
}

function tryAcquireRoute(world: World, w: Worker): void {
  w.timer -= 0;
  if (world.routes.length === 0) return;
  // Cheap gate: only look a few times a second, staggered per worker.
  if ((world.tick + w.variant * 7) % 18 !== 0) return;

  let best: number = -1;
  let bestScore = Infinity;
  for (let i = 0; i < world.routes.length; i++) {
    const r = world.routes[i];
    if (!r.linked) continue;
    const res = findResource(world, r.resourceId);
    if (!res || res.depleted) continue;
    const nestIdx = r.nestEnd === 1 ? r.nodes.length - 1 : 0;
    const n = r.nodes[nestIdx];
    const d2 = dist2(w.x, w.y, n.x, n.y);
    if (d2 > 420 * 420) continue;
    // Prefer near, lightly used routes so traffic self-balances across the network.
    const score = d2 + r.traffic * 9000;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) return;

  const route = world.routes[best];
  w.routeId = route.id;
  w.state = 'outbound';
  w.nodeIndex = route.nestEnd === 1 ? route.nodes.length - 1 : 0;
  w.targetNest = route.nestId;
  w.targetResource = route.resourceId;
  w.lostTime = 0;
  route.traffic++;
  world.events.push({ t: 'trailAcquired', x: w.x, y: w.y });
}

/** Scatters nearby workers away from a threat. Used by footfalls, traps and spray. */
export function panicWorkers(world: World, x: number, y: number, radius: number): void {
  const r2 = radius * radius;
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive || w.state === 'trapped') continue;
    const dx = w.x - x;
    const dy = w.y - y;
    if (dx * dx + dy * dy > r2) continue;
    w.state = 'panic';
    w.panicTime = WORKER_PANIC_TIME * world.rng.range(0.75, 1.25);
    w.angle = Math.atan2(dy, dx);
    w.nodeIndex = -1;
  }
}

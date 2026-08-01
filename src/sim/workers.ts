import { clamp, clamp01, dist2 } from '../core/math.ts';
import {
  EXPOSURE_AVERSION,
  HARVEST_RING,
  LABOUR_SHARE_CAP,
  LANE_JITTER,
  LANE_OFFSET,
  EVIDENCE_BASELINE,
  HARVEST_SLOTS,
  QUEUE_RING,
  STUCK_GRACE,
  WORKER_CLEARANCE,
  WORKER_EVIDENCE_CEILING,
  WORKER_RELAX,
  WORKER_TURN_RATE,
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
/** How far from a route's nest end a worker can be and still pick that route up. */
const ACQUIRE_RADIUS = 520;

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
  world.deathCauses[cause] = (world.deathCauses[cause] ?? 0) + 1;
  // `brood2` — Ootheca cluster. Losses are replaced at double rate for a while after a casualty.
  // The surge timer was read by the colony and written by nobody.
  if (world.adaptations.taken.includes('brood2')) world.adaptations.surgeTime = 20;
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

  // Harvest slots are recomputed from the live state every step, so a worker that dies, panics or
  // is trapped mid-harvest cannot leak one.
  for (let i = 0; i < world.resources.length; i++) world.resources[i].busy = 0;
  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    if (!w.alive || w.state !== 'harvest') continue;
    const res = findResource(world, w.targetResource);
    if (res) res.busy++;
  }

  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    if (!w.alive) continue;
    alive++;

    if (w.nymphTime > 0) {
      w.nymphTime -= dt;
      w.scale = 0.55 + 0.45 * (1 - w.nymphTime / (NYMPH_TIME * world.traits.nymphTimeMult));
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
        if (w.nymphTime <= 0) {
          if (tryAcquireRoute(world, w)) {
            w.lostTime = 0;
          } else {
            // Nothing to do from this nest. A colony whose brood all hatch in one chamber would
            // otherwise strand its entire labour force there, unable to reach routes anchored
            // anywhere else — which reads to the player as "thirty roaches and nobody hauling".
            w.lostTime += dt;
            if (w.lostTime > 5) {
              w.lostTime = 0;
              redistribute(world, w);
            }
          }
        }
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
        // Traffic reinforces the stretch of trail it walks on, so a working supply line sustains
        // itself while an abandoned one evaporates.
        for (let k = Math.max(0, idx - 2); k <= Math.min(nodes.length - 1, idx + 2); k++) {
          const node = nodes[k];
          if (node.life < NODE_LIFE) {
            node.life = Math.min(NODE_LIFE, node.life + NODE_REINFORCE * dt);
          }
        }
        const sign =
          w.state === 'outbound' ? (route.resEnd === 1 ? 1 : -1) : route.nestEnd === 1 ? 1 : -1;
        w.dirSign = sign;

        let target = idx + sign * WORKER_LOOKAHEAD;
        if (target < 0) target = 0;
        if (target > nodes.length - 1) target = nodes.length - 1;
        const tn = nodes[target];
        // Two counter-flowing lanes, offset perpendicular to the trail tangent. Outbound roaches
        // ride one side of the scent corridor and returning roaches the other, each with a stable
        // spread inside its own lane. This is the difference between a trail that reads as one long
        // segmented animal and one that reads as traffic.
        const lateral = sign * LANE_OFFSET + w.lane * LANE_JITTER;
        const tx = tn.x - tn.dy * lateral;
        const ty = tn.y + tn.dx * lateral;
        const d = Math.max(1, Math.hypot(tx - w.x, ty - w.y));
        dirX = (tx - w.x) / d;
        dirY = (ty - w.y) / d;
        // Bias along the trail tangent so a worker commits to the corridor instead of cutting
        // across it every time the lateral term flips sign near a bend.
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
              if (res.busy < HARVEST_SLOTS + world.traits.harvestSlotBonus) {
                w.state = 'harvest';
                w.timer = WORKER_HARVEST_TIME * world.traits.harvestTimeMult;
                w.targetResource = res.id;
              } else {
                // The source is full: take a place on the waiting ring instead of pressing into the
                // roaches already feeding. Previously this branch only scaled speed to 12 %, which
                // parked every waiting worker on the same node — the pile players reported.
                w.state = 'queue';
                w.targetResource = res.id;
              }
            } else {
              w.state = 'inbound';
            }
          } else {
            const nest = findNest(world, route.nestId) ?? home;
            deliver(world, w, nest.x, nest.y);
          }
        }
        if (w.state === 'outbound' || w.state === 'inbound')
          speedMul = w.carrying ? 0.78 * world.traits.haulSpeedMult : 1;
        break;
      }

      // ── Waiting for a feeding slot ──────────────────────────────────────────
      // An explicit state, not a speed multiplier. A queue that the simulation knows about can be
      // drawn as a queue, cannot be mistaken for a stuck worker by the watchdog, and dissolves the
      // moment the source frees up or runs dry.
      case 'queue': {
        const res = findResource(world, w.targetResource);
        if (!res || res.depleted) {
          w.state = 'inbound';
          w.nodeIndex = -1;
          break;
        }
        if (res.busy < HARVEST_SLOTS + world.traits.harvestSlotBonus) {
          w.state = 'harvest';
          w.timer = WORKER_HARVEST_TIME * world.traits.harvestTimeMult;
          res.busy++;
          break;
        }
        const a = ringAngle(w, 1);
        const qx = res.x + Math.cos(a) * QUEUE_RING;
        const qy = res.y + Math.sin(a) * QUEUE_RING;
        const qd = Math.hypot(qx - w.x, qy - w.y);
        if (qd > 10) {
          dirX = (qx - w.x) / qd;
          dirY = (qy - w.y) / qd;
          speedMul = 0.55;
        } else {
          // Face the queue's head so a waiting column reads as intent, not as a malfunction.
          w.angle = turnToward(w.angle, Math.atan2(res.y - w.y, res.x - w.x), 6 * dt);
          speedMul = 0;
        }
        break;
      }

      case 'harvest': {
        w.timer -= dt;
        // Feed from a position on a ring around the crumb pile rather than standing inside it. Four
        // harvesters used to hold four identical transforms, which is what made a working resource
        // node look like one malformed roach.
        const hres = findResource(world, w.targetResource);
        if (hres) {
          const a = ringAngle(w, 0);
          const hx = hres.x + Math.cos(a) * HARVEST_RING;
          const hy = hres.y + Math.sin(a) * HARVEST_RING;
          const hd = Math.hypot(hx - w.x, hy - w.y);
          if (hd > 6) {
            dirX = (hx - w.x) / hd;
            dirY = (hy - w.y) / hd;
            speedMul = 0.5;
          } else {
            // Face the food while feeding: a still roach pointing at what it is eating reads as
            // "working", a still roach pointing anywhere else reads as "broken".
            w.angle = Math.atan2(hres.y - w.y, hres.x - w.x);
            speedMul = 0;
          }
        } else {
          speedMul = 0;
        }
        if (w.timer <= 0) {
          const res = findResource(world, w.targetResource);
          if (res) {
            const want = res.kind === 'food' ? WORKER_CARRY_FOOD : WORKER_CARRY_WATER;
            const bonus = world.traits.carryMult;
            const take = Math.min(res.amount, want * bonus);
            if (take > 0) {
              // `forage1`/`forage2` — the stated downside. Bigger mouthfuls strip a source faster
              // than they feed the colony, which is what makes the family a trade rather than a
              // straight upgrade. The multiplier was in the trait struct and read nowhere.
              res.amount -= take * world.traits.depletionMult;
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
        speedMul = 1.5 * world.traits.panicSpeedMult;
        // Bolt for the nearest claimed crack. This is the colony's counterplay to a sweep: the
        // roaches pour into the walls and wait it out, which is both what real ones do and the
        // reason claiming cracks is worth the evidence it costs. The escape tunnel reaches furthest.
        const bolt = world.nests.find((n) => n.claimed && n.fn === 'bolthole');
        let refuge: { x: number; y: number; id: string } | null = null;
        let bestD2 = Infinity;
        for (let k = 0; k < world.nests.length; k++) {
          const n = world.nests[k];
          if (!n.claimed) continue;
          const reach = (n === bolt ? 1100 : 680) * world.traits.refugeReachMult;
          const d2n = dist2(w.x, w.y, n.x, n.y);
          if (d2n < reach * reach && d2n < bestD2) {
            bestD2 = d2n;
            refuge = n;
          }
        }
        if (refuge) {
          const d = Math.max(1, Math.hypot(refuge.x - w.x, refuge.y - w.y));
          dirX = (refuge.x - w.x) / d;
          dirY = (refuge.y - w.y) / d;
          w.panicTime = Math.max(w.panicTime, 0.35);
          if (d < 46) {
            w.x = refuge.x + world.rng.signed() * 26;
            w.y = refuge.y + world.rng.signed() * 26;
            w.state = 'idle';
            w.panicTime = 0;
            w.routeId = -1;
            // Live where you sheltered. Resetting to the home crack sent the whole colony marching
            // back across open floor after every sweep, which is both slow and more evidence.
            w.targetNest = refuge.id;
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

    // ── Hazard avoidance. Workers give armed traps and bait a wide berth, so a hazard on a route
    // costs throughput and the occasional unlucky roach rather than deleting the workforce. The
    // player's counterplay is re-routing; without avoidance there was no time to notice, let alone
    // re-route.
    if (w.state !== 'harvest') {
      for (let h = 0; h < world.hazards.length; h++) {
        const hz = world.hazards[h];
        if (!hz.armed || hz.capacity <= 0) continue;
        const avoid = hz.radius * 1.9;
        const dx = w.x - hz.x;
        const dy = w.y - hz.y;
        const d2h = dx * dx + dy * dy;
        if (d2h > avoid * avoid || d2h < 0.001) continue;
        const dh = Math.sqrt(d2h);
        const push = (1 - dh / avoid) * 2.4;
        dirX += (dx / dh) * push;
        dirY += (dy / dh) * push;
      }
    }

    // ── Steering-level separation: anticipates a neighbour and goes around it. This is the part
    // that makes traffic look intentional. It is *not* what guarantees spacing — see the positional
    // relaxation pass after this loop, which is what actually holds bodies apart.
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
      // Remember what we walked into. Sliding alone cannot escape a concave corner, because the
      // desired direction keeps pointing into it; the recovery ladder needs to know which way the
      // wall runs before it can follow it out.
      w.blockedNx = c.nx;
      w.blockedNy = c.ny;
    }

    const sp = Math.hypot(w.vx, w.vy);
    // Turn toward the heading at a bounded rate instead of snapping to it. Snapping made a worker
    // whose velocity crossed zero — every arrival, every jostle — spin 180 degrees in one frame,
    // which is the "impossible orientation change" that reads as a broken sprite. Harvesters keep
    // the facing they were given so they stay pointed at their food.
    if (sp > 4 && w.state !== 'harvest') {
      w.angle = turnToward(w.angle, Math.atan2(w.vy, w.vx), WORKER_TURN_RATE * dt);
    }
    w.gait += (sp / 26) * dt + dt * 0.4;

    // ── Stuck watchdog. "Useful progress" is defined per state, so a worker legitimately standing
    // still (feeding, waiting its turn, sheltering) is never mistaken for a broken one.
    const progressed = madeProgress(w);
    if (progressed) {
      w.stuckTime = 0;
      w.recoverStage = 0;
      w.markX = w.x;
      w.markY = w.y;
      w.markIndex = w.nodeIndex;
    } else {
      w.stuckTime += dt;
      if (w.stuckTime > STUCK_GRACE) recoverWorker(w, home);
    }

    // ── Exposure sampling is round-robin: one sixth of the colony per step.
    if ((world.tick + i) % 6 === 0) {
      w.exposure = exposureAt(world, w.x, w.y);
    }
    // Graded, not binary: how far above the do-nothing baseline this roach is standing, capped so a
    // passing torch cannot dominate a term that is supposed to describe the player's route choices.
    if (w.exposure > EVIDENCE_BASELINE) {
      exposed += Math.min(w.exposure - EVIDENCE_BASELINE, WORKER_EVIDENCE_CEILING);
    }
  }

  // ── Positional separation relaxation ──────────────────────────────────────
  //
  // Steering cannot guarantee spacing, because a steering force is normalised away by the speed
  // clamp and vanishes entirely at zero speed. This pass works on positions directly, so it holds
  // bodies apart whether they are running, queueing or standing still.
  //
  // Jacobi-style: every pair's correction is accumulated first and applied afterwards, so the
  // result does not depend on iteration order and the simulation stays deterministic.
  const cx = world.workerPushX;
  const cy = world.workerPushY;
  for (let i = 0; i < workers.length; i++) {
    cx[i] = 0;
    cy[i] = 0;
  }
  hash.clear();
  for (let i = 0; i < workers.length; i++) {
    if (workers[i].alive) hash.insert(i, workers[i].x, workers[i].y);
  }
  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    if (!w.alive || w.state === 'trapped') continue;
    hash.query(w.x, w.y, WORKER_CLEARANCE, (id) => {
      // Each unordered pair is handled once, by its lower index.
      if (id <= i) return;
      const o = workers[id];
      if (!o.alive || o.state === 'trapped') return;
      let dx = o.x - w.x;
      let dy = o.y - w.y;
      let d = Math.hypot(dx, dy);
      if (d >= WORKER_CLEARANCE) return;
      if (d < 0.0001) {
        // Exactly coincident: separate along a stable per-pair axis rather than a random one, or
        // the pair would jitter differently on every replay of the same seed.
        const a = ((i * 31 + id * 17) % 360) * DEG;
        dx = Math.cos(a);
        dy = Math.sin(a);
        d = 1;
      }
      const push = ((WORKER_CLEARANCE - d) * WORKER_RELAX) / 2;
      const nx = dx / d;
      const ny = dy / d;
      cx[i] -= nx * push;
      cy[i] -= ny * push;
      cx[id] += nx * push;
      cy[id] += ny * push;
    });
  }
  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    if (!w.alive || (cx[i] === 0 && cy[i] === 0)) continue;
    w.x += cx[i];
    w.y += cy[i];
    // Being pushed apart must never push anyone through cabinetry.
    const c = collideCircle(w.x, w.y, WORKER_RADIUS);
    if (c.hit) {
      w.x = c.x;
      w.y = c.y;
    }
  }

  world.colony.population = alive;
  world.exposedWorkers = exposed;
  if (alive > world.stats.peakPopulation) world.stats.peakPopulation = alive;
}

const DEG = Math.PI / 180;
const GOLDEN = 2.399963229728653;

/**
 * A stable, well-spread angle for this worker on a ring around a point.
 *
 * Derived from the worker's own identity rather than from a shared counter, so two workers never
 * hold the same slot and a worker does not jump slots when a neighbour dies.
 */
function ringAngle(w: Worker, salt: number): number {
  return (w.lane + 1) * GOLDEN * 3 + w.variant * 1.7 + salt * 0.9;
}

function turnToward(from: number, to: number, maxStep: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (delta > maxStep) delta = maxStep;
  else if (delta < -maxStep) delta = -maxStep;
  return from + delta;
}

/**
 * Useful progress, defined per state.
 *
 * A worker that is feeding, waiting on a full source, sheltering in a crack or growing from a nymph
 * is doing its job while standing still; only the states that are *supposed* to be making headway
 * are held to a movement test.
 */
function madeProgress(w: Worker): boolean {
  switch (w.state) {
    case 'outbound':
    case 'inbound':
      // Displacement, not speed. `speed > 20` was in this test and it is exactly the hole a jammed
      // worker falls through: one shoving against a neighbour or a corner has plenty of velocity and
      // goes nowhere, so the watchdog counted it as progressing forever. A real-browser probe that
      // measured actual movement found 61 workers stalled past two seconds in one run, the worst for
      // 35 s, while the watchdog was satisfied throughout.
      return w.nodeIndex !== w.markIndex || dist2(w.x, w.y, w.markX, w.markY) > 36;
    case 'harvest':
    case 'queue':
    case 'trapped':
      return true;
    case 'panic':
      return dist2(w.x, w.y, w.markX, w.markY) > 36;
    default:
      // Idle is only a problem when a worker is idling somewhere it cannot be recruited from.
      return true;
  }
}

/**
 * Escalating recovery for a worker that has stopped making progress.
 *
 * Nothing here teleports a visible roach. Each stage is a thing a real insect does when it is
 * blocked: re-read the scent, step sideways, then give up and walk home.
 */
function recoverWorker(w: Worker, home: { x: number; y: number }): void {
  w.recoverStage++;
  w.stuckTime = 0;
  if (w.recoverStage > 5) w.recoverStage = 4;
  // The first two rungs are not skippable, even when a wall is involved. Jumping a blocked worker
  // straight to wall-following was tried and measured: stalls went from 43 events / 4.7 s worst to
  // 81 events / 28.2 s worst, because a worker that has *also* lost its place on the trail then runs
  // along the wall away from the line it was serving. Re-read the scent first; follow the wall only
  // once that has not helped.
  if (w.recoverStage >= 4) {
    // Wall-following, and it never gives up.
    //
    // The ladder used to stop after "abandon the route and walk home", which is fine on open floor
    // and useless in a concave corner: a worker carrying food toward a nest behind a cabinet pressed
    // into the same wall indefinitely. Measured in a real browser: 106 workers stalled past two
    // seconds in one run, the worst for 89 s, all of them past the end of the ladder.
    //
    // From here the worker runs *along* the surface it hit, alternating direction each attempt, and
    // the stage cycles rather than terminating.
    const nx = w.blockedNx;
    const ny = w.blockedNy;
    const side = w.recoverStage % 2 === 0 ? 1 : -1;
    if (nx !== 0 || ny !== 0) {
      w.vx = -ny * side * w.speed;
      w.vy = nx * side * w.speed;
    } else {
      const a = w.angle + (Math.PI / 2) * side;
      w.vx = Math.cos(a) * w.speed;
      w.vy = Math.sin(a) * w.speed;
    }
    // Re-read the field on the way out, so a worker that escapes rejoins a line rather than wandering.
    w.nodeIndex = -1;
    return;
  }
  if (w.recoverStage === 1) {
    // Re-read the trail from scratch: the usual cause is a node index that no longer matches where
    // the body actually is, after a hazard shove or a route edit.
    w.nodeIndex = -1;
    w.lostTime = 0;
    return;
  }
  if (w.recoverStage === 2) {
    // Step out of the corridor and try again — enough to clear a corner or a jam.
    const a = w.angle + Math.PI / 2 + (w.variant % 2 === 0 ? 0 : Math.PI);
    w.vx = Math.cos(a) * w.speed * 0.9;
    w.vy = Math.sin(a) * w.speed * 0.9;
    w.lane = -w.lane;
    return;
  }
  // Still nothing: abandon the route and walk home. An explicit, understandable failure state.
  w.routeId = -1;
  w.nodeIndex = -1;
  w.recoverStage = 0;
  w.state = w.carrying ? 'inbound' : 'idle';
  if (!w.carrying) {
    w.targetNest = null;
    const d = Math.max(1, Math.hypot(home.x - w.x, home.y - w.y));
    w.vx = ((home.x - w.x) / d) * w.speed * 0.6;
    w.vy = ((home.y - w.y) / d) * w.speed * 0.6;
  }
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

/**
 * Sends an idle worker to whichever claimed nest anchors the least-served live route, so labour
 * follows demand across the colony instead of pooling wherever it happened to hatch.
 */
function redistribute(world: World, w: Worker): void {
  let best: string | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < world.routes.length; i++) {
    const r = world.routes[i];
    if (!r.linked || r.nestId === null) continue;
    const res = findResource(world, r.resourceId);
    if (!res || res.depleted) continue;
    // The worker's *current* nest stays a candidate: a route that briefly went out of range is
    // often still the right answer, and excluding it bounced workers back and forth.
    // `traffic` only counts workers with a route assigned, so everyone in transit reads as zero and
    // a whole stranded group would pick the same target in the same frame. A small per-worker jitter
    // spreads them instead of stampeding.
    const score = r.traffic + world.rng.next() * 1.5;
    if (score < bestScore) {
      bestScore = score;
      best = r.nestId;
    }
  }
  if (best !== null) w.targetNest = best;
}

/** Returns true when the worker took a route. */
function tryAcquireRoute(world: World, w: Worker): boolean {
  if (world.routes.length === 0) return false;
  // Cheap gate: only look a few times a second, staggered per worker.
  if ((world.tick + w.variant * 7) % 18 !== 0) return w.routeId >= 0;

  const c = world.colony;
  const foodFrac = c.foodCap > 0 ? c.food / c.foodCap : 1;
  const waterFrac = c.waterCap > 0 ? c.water / c.waterCap : 1;

  // How the colony's hauling labour is split right now, so a reserve that cannot recover cannot
  // keep conscripting workers forever.
  let foodTraffic = 0;
  let waterTraffic = 0;
  for (let i = 0; i < world.routes.length; i++) {
    const r = world.routes[i];
    if (!r.linked || r.traffic <= 0) continue;
    const res = findResource(world, r.resourceId);
    if (!res) continue;
    if (res.kind === 'food') foodTraffic += r.traffic;
    else waterTraffic += r.traffic;
  }
  const hauling = foodTraffic + waterTraffic;

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
    // A route anchored on the nest this worker lives at is always acceptable, however far the
    // worker has wandered; otherwise a satellite nest's own routes were unusable by its own brood.
    const ownNest = r.nestId !== null && r.nestId === w.targetNest;
    if (!ownNest && d2 > ACQUIRE_RADIUS * ACQUIRE_RADIUS) continue;
    // Prefer near, lightly used routes so traffic self-balances across the network, then bias the
    // whole thing toward whichever reserve is running low. Without this the colony split its labour
    // evenly regardless of need and could starve of one resource while capped on the other — and the
    // shortage warning was information the player had no way to act on. Now the warning arrives with
    // roaches visibly redeploying onto the failing line.
    const kind = res.kind;
    const frac = kind === 'food' ? foodFrac : waterFrac;
    const other = kind === 'food' ? waterFrac : foodFrac;
    let demand = clamp(frac / Math.max(other, 0.02), 0.45, 1.8);
    if (world.shortage === kind) demand *= 0.5;
    // ...but only up to a point. Past the cap the discount is withdrawn, so the other line starts
    // winning workers again and a permanently failing reserve cannot take the whole colony.
    const share = hauling > 0 ? (kind === 'food' ? foodTraffic : waterTraffic) / hauling : 0;
    if (share >= LABOUR_SHARE_CAP) demand = Math.max(demand, 1);
    const score = (d2 + r.traffic * 9000) * demand * (1 + r.exposure * EXPOSURE_AVERSION);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) return false;

  const route = world.routes[best];
  w.routeId = route.id;
  w.state = 'outbound';
  w.nodeIndex = route.nestEnd === 1 ? route.nodes.length - 1 : 0;
  w.targetNest = route.nestId;
  w.targetResource = route.resourceId;
  w.lostTime = 0;
  route.traffic++;
  world.events.push({ t: 'trailAcquired', x: w.x, y: w.y });
  return true;
}

/** Scatters nearby workers away from a threat. Used by footfalls, traps and spray. */
/**
 * Scatters workers near a point.
 *
 * `shadow2` — Alarm pheromone widens the radius that reacts, which is what "react 0.5 s sooner"
 * means for a threat travelling at a few hundred units a second. The trait was previously written
 * and never read, so the adaptation cost 44 food for its downside alone.
 */
export function panicWorkers(world: World, x: number, y: number, radius: number): void {
  const r2 = (radius + world.traits.panicLead * 260) ** 2;
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

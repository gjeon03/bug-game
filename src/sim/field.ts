import { clamp01, pointRectDist2 } from '../core/math.ts';
import { COVER_RADIUS, WALL_THICKNESS, WORLD_H, WORLD_W } from './constants.ts';
import { LIGHTS, SOLIDS } from './kitchen.ts';
import type { Solid } from './types.ts';

/**
 * Static spatial queries over the authored kitchen: collision, cover and light.
 *
 * These are pure functions of position (plus, for light, the dynamic threat state) and they are the
 * same functions the renderer's lighting pass uses, so what the player sees is literally what the
 * exposure system reads.
 */

export interface CollisionResult {
  x: number;
  y: number;
  hit: boolean;
  /** Contact normal, useful for wall-hug feedback. */
  nx: number;
  ny: number;
}

const scratch: CollisionResult = { x: 0, y: 0, hit: false, nx: 0, ny: 0 };

/**
 * Pushes a point out of whichever solid contains it, preferring the shallowest exit that does not
 * land inside another solid. Used as a second pass when the world-bounds clamp lands in furniture.
 */
function escapeSolids(px: number, py: number, r: number): [number, number] {
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    const x0 = s.x;
    const y0 = s.y;
    const x1 = s.x + s.w;
    const y1 = s.y + s.h;
    if (px <= x0 || px >= x1 || py <= y0 || py >= y1) continue;
    const options: [number, number, number][] = [
      [px - x0, x0 - r, py],
      [x1 - px, x1 + r, py],
      [py - y0, px, y0 - r],
      [y1 - py, px, y1 + r],
    ];
    options.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < options.length; k++) {
      if (!isInsideSolid(options[k][1], options[k][2])) return [options[k][1], options[k][2]];
    }
    return [options[0][1], options[0][2]];
  }
  return [px, py];
}

/** Pushes a circle out of every solid it overlaps, and out of the world bounds. Mutates + returns a shared result. */
export function collideCircle(px: number, py: number, r: number): CollisionResult {
  let x = px;
  let y = py;
  let hit = false;
  let nx = 0;
  let ny = 0;

  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    const x0 = s.x;
    const y0 = s.y;
    const x1 = s.x + s.w;
    const y1 = s.y + s.h;
    if (x + r <= x0 || x - r >= x1 || y + r <= y0 || y - r >= y1) continue;

    if (x > x0 && x < x1 && y > y0 && y < y1) {
      // Centre is inside. Escape along the shallowest axis that does not land inside *another*
      // solid — cabinetry is flush against the walls in several places, so the naive shallowest-axis
      // escape can push an entity straight into its neighbour.
      const options: [number, number, number, number, number][] = [
        [x - x0, x0 - r, y, -1, 0],
        [x1 - x, x1 + r, y, 1, 0],
        [y - y0, x, y0 - r, 0, -1],
        [y1 - y, x, y1 + r, 0, 1],
      ];
      options.sort((a, b) => a[0] - b[0]);
      let chosen = options[0];
      for (let k = 0; k < options.length; k++) {
        if (!isInsideSolid(options[k][1], options[k][2])) {
          chosen = options[k];
          break;
        }
      }
      x = chosen[1];
      y = chosen[2];
      nx = chosen[3];
      ny = chosen[4];
      hit = true;
      continue;
    }

    const cx = x < x0 ? x0 : x > x1 ? x1 : x;
    const cy = y < y0 ? y0 : y > y1 ? y1 : y;
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r || d2 === 0) continue;
    const d = Math.sqrt(d2);
    const push = r - d;
    const ux = dx / d;
    const uy = dy / d;
    x += ux * push;
    y += uy * push;
    nx = ux;
    ny = uy;
    hit = true;
  }

  // Final clamp to the playable interior. This runs *after* solid resolution because the room shell
  // is itself made of solids: escaping a wall along its shallow axis can land an entity outside the
  // playfield, and clamping to the raw world rectangle would push it straight back into the wall.
  const lo = WALL_THICKNESS + r;
  let clamped = false;
  if (x < lo) {
    x = lo;
    hit = true;
    clamped = true;
    nx = 1;
  } else if (x > WORLD_W - lo) {
    x = WORLD_W - lo;
    hit = true;
    clamped = true;
    nx = -1;
  }
  if (y < lo) {
    y = lo;
    hit = true;
    clamped = true;
    ny = 1;
  } else if (y > WORLD_H - lo) {
    y = WORLD_H - lo;
    hit = true;
    clamped = true;
    ny = -1;
  }

  // The band just inside the walls is not always free (the stove and the counters stand flush against
  // the top wall), so a clamp can land inside furniture. One more resolution pass settles it.
  if (clamped && isInsideSolid(x, y)) {
    const again = escapeSolids(x, y, r);
    x = again[0];
    y = again[1];
  }

  scratch.x = x;
  scratch.y = y;
  scratch.hit = hit;
  scratch.nx = nx;
  scratch.ny = ny;
  return scratch;
}

/** True when the point is inside any solid. */
export function isInsideSolid(x: number, y: number): boolean {
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true;
  }
  return false;
}

/** Squared distance to the nearest solid edge (0 if inside one). */
export function distToSolid2(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    const d2 = pointRectDist2(x, y, s.x, s.y, s.x + s.w, s.y + s.h);
    if (d2 < best) best = d2;
    if (best === 0) return 0;
  }
  return best;
}

/**
 * Cover in [0,1]. Derived, never authored: hugging cabinetry is mechanically safer, which the player
 * learns from the darkness of the art rather than from a tooltip.
 */
export function coverAt(x: number, y: number): number {
  const d = Math.sqrt(distToSolid2(x, y));
  if (d >= COVER_RADIUS) return 0;
  // Ease-out, not ease-in: a roach one body-length from a cabinet is already mostly hidden, and the
  // protection tapers off toward the edge of the band. A squared falloff made wall-hugging almost
  // worthless, which broke the whole safe-route-versus-short-route decision.
  const t = 1 - d / COVER_RADIUS;
  return t * (2 - t);
}

/** The static, always-on part of the light field. */
export function staticLightAt(x: number, y: number): number {
  let total = 0;
  for (let i = 0; i < LIGHTS.length; i++) {
    const l = LIGHTS[i];
    const dx = x - l.x;
    const dy = y - l.y;
    const d2 = dx * dx + dy * dy;
    const r2 = l.radius * l.radius;
    if (d2 >= r2) continue;
    const t = 1 - Math.sqrt(d2) / l.radius;
    total += l.intensity * t * t;
  }
  return total;
}

export interface DynamicLight {
  x: number;
  y: number;
  angle: number;
  power: number;
  range: number;
  looking: boolean;
}

/** Patrol-projected light: a forward cone plus a soft pool directly underneath. */
export function coneLightAt(x: number, y: number, p: DynamicLight): number {
  const dx = x - p.x;
  const dy = y - p.y;
  const d2 = dx * dx + dy * dy;
  const r2 = p.range * p.range;
  if (d2 >= r2) return 0;
  const d = Math.sqrt(d2);
  const falloff = 1 - d / p.range;
  // Soft pool under the patrol regardless of facing.
  let v = falloff * falloff * 0.35;
  if (d > 1) {
    const ux = dx / d;
    const uy = dy / d;
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);
    const dot = ux * fx + uy * fy;
    if (dot > 0.35) {
      const cone = (dot - 0.35) / 0.65;
      v += falloff * cone * 0.95;
    }
  }
  return v * p.power;
}

export function solidsForRender(): readonly Solid[] {
  return SOLIDS;
}

/**
 * Combined exposure in [0,1].
 *
 * `light` is the full light field including patrol cones and the room light. Cover suppresses most
 * of it, but standing on open floor is never entirely free even in the dark, because a scuttling
 * shape on a bare tile is exactly what a human notices.
 */
export function exposureFrom(light: number, cover: number): number {
  const shielded = light * (1 - 0.78 * cover);
  // Open floor is never free, even unlit: a scuttling shape on bare tile is exactly what a human
  // notices out of the corner of an eye. This term is what makes route geometry — not just
  // brightness — the thing the player is actually choosing between.
  const openFloor = (1 - cover) * 0.3;
  return clamp01(shielded + openFloor);
}

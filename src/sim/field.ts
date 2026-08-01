import { clamp01, pointRectDist2 } from '../core/math.ts';
import { COVER_RADIUS, WORLD_H, WORLD_W } from './constants.ts';
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
      // Centre is inside: escape along the shallowest axis.
      const dl = x - x0;
      const dr = x1 - x;
      const dt = y - y0;
      const db = y1 - y;
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) {
        x = x0 - r;
        nx = -1;
        ny = 0;
      } else if (m === dr) {
        x = x1 + r;
        nx = 1;
        ny = 0;
      } else if (m === dt) {
        y = y0 - r;
        nx = 0;
        ny = -1;
      } else {
        y = y1 + r;
        nx = 0;
        ny = 1;
      }
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

  if (x < r) {
    x = r;
    hit = true;
    nx = 1;
  } else if (x > WORLD_W - r) {
    x = WORLD_W - r;
    hit = true;
    nx = -1;
  }
  if (y < r) {
    y = r;
    hit = true;
    ny = 1;
  } else if (y > WORLD_H - r) {
    y = WORLD_H - r;
    hit = true;
    ny = -1;
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

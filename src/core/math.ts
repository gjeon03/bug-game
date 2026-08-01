export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : clamp01((v - a) / (b - a));
}

export function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = invLerp(edge0, edge1, v);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach. `rate` is the fraction remaining after 1 second. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.pow(rate, dt);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** Shortest signed angular difference from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Rotate `a` toward `b` by at most `maxStep` radians. */
export function rotateToward(a: number, b: number, maxStep: number): number {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export function wrapAngle(a: number): number {
  let v = a % TAU;
  if (v < 0) v += TAU;
  return v;
}

/** Squared distance from a point to an axis-aligned rectangle (0 when inside). */
export function pointRectDist2(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  return dx * dx + dy * dy;
}

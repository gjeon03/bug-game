/**
 * Deterministic pseudo-random source.
 *
 * The whole simulation draws randomness from an instance of this, never from `Math.random`,
 * so a (seed, input) pair always reproduces the same run. Automated playtests rely on it.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    // Avoid the degenerate 0 state.
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** Raw uint32. */
  nextUint(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** [0, 1) */
  next(): number {
    return this.nextUint() / 4294967296;
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** [-1, 1) */
  signed(): number {
    return this.next() * 2 - 1;
  }

  bool(chance: number): boolean {
    return this.next() < chance;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Current internal state — used by determinism tests. */
  snapshot(): number {
    return this.s;
  }

  restore(state: number): void {
    this.s = state >>> 0;
  }
}

/** Cheap deterministic value noise in 2D, used by procedural texture generation. */
export function valueNoise2D(x: number, y: number, seed: number): number {
  let h = Math.imul(Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + seed, 1274126177);
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

/** Smoothed 2D noise in [0,1] with bilinear interpolation of the value lattice. */
export function smoothNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = valueNoise2D(x0, y0, seed);
  const n10 = valueNoise2D(x0 + 1, y0, seed);
  const n01 = valueNoise2D(x0, y0 + 1, seed);
  const n11 = valueNoise2D(x0 + 1, y0 + 1, seed);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}

/** Fractal sum of {@link smoothNoise2D}. */
export function fbm2D(x: number, y: number, seed: number, octaves = 4): number {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += smoothNoise2D(x * freq, y * freq, seed + i * 8191) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / norm;
}

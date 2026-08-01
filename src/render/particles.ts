import { TAU } from '../core/math.ts';
import type { Atlas } from './atlas.ts';

export type ParticleKind = 'glow' | 'dust' | 'spark' | 'ring' | 'chip';

interface Particle {
  active: boolean;
  kind: ParticleKind;
  tint: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  /** Non-zero enables size interpolation from `size` to `size1` over the lifetime. */
  size1: number;
  drag: number;
  alpha: number;
  /** Emission priority: decoration is dropped before signal when the budget is tight. */
  priority: number;
}

export const PARTICLE_BUDGET = 900;

/** Priority bands, so the eviction rule is readable at the call sites. */
export const PRIO = { ambient: 0, decor: 1, feedback: 2, signal: 3, danger: 4 } as const;

/**
 * Fixed-capacity particle pool.
 *
 * The pool never grows, so there is no unbounded allocation during a long run. When it is full a new
 * emission may evict a lower-priority live particle — decoration yields to signal, which is the
 * clutter rule from ART_BIBLE. Every particle draws as one `drawImage` of a pre-tinted sprite.
 */
export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;
  count = 0;

  constructor() {
    for (let i = 0; i < PARTICLE_BUDGET; i++) {
      this.pool.push({
        active: false,
        kind: 'dust',
        tint: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        size1: 0,
        drag: 1.6,
        alpha: 1,
        priority: 0,
      });
    }
  }

  clear(): void {
    for (let i = 0; i < this.pool.length; i++) this.pool[i].active = false;
    this.count = 0;
    this.cursor = 0;
  }

  private acquire(priority: number): Particle | null {
    const n = this.pool.length;
    for (let i = 0; i < n; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % n;
      if (!p.active) return p;
    }
    for (let i = 0; i < n; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % n;
      if (p.priority < priority) return p;
    }
    return null;
  }

  emit(
    kind: ParticleKind,
    tint: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    alpha: number,
    priority: number,
    size1 = 0,
    drag = 1.6,
  ): void {
    const p = this.acquire(priority);
    if (!p) return;
    p.active = true;
    p.kind = kind;
    p.tint = tint;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.size1 = size1;
    p.alpha = alpha;
    p.priority = priority;
    p.drag = drag;
  }

  burst(
    kind: ParticleKind,
    tint: number,
    x: number,
    y: number,
    n: number,
    speed: number,
    life: number,
    size: number,
    alpha: number,
    priority: number,
    rand: () => number,
  ): void {
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU;
      const s = speed * (0.35 + rand() * 0.65);
      this.emit(
        kind,
        tint,
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        life * (0.6 + rand() * 0.7),
        size * (0.7 + rand() * 0.7),
        alpha,
        priority,
      );
    }
  }

  /** An expanding ring — the acquisition/link/impact confirmation shape. */
  ring(
    tint: number,
    x: number,
    y: number,
    from: number,
    to: number,
    life: number,
    alpha: number,
    priority: number,
  ): void {
    this.emit('ring', tint, x, y, 0, 0, life, from, alpha, priority, to, 0);
  }

  update(dt: number): void {
    let live = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.drag > 0) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      live++;
    }
    this.count = live;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    atlas: Atlas,
    bounds: { x0: number; y0: number; x1: number; y1: number },
  ): number {
    let calls = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      if (p.x < bounds.x0 || p.x > bounds.x1 || p.y < bounds.y0 || p.y > bounds.y1) continue;
      const t = p.life / p.maxLife;
      const a = p.alpha * t;
      if (a <= 0.004) continue;

      if (p.kind === 'ring') {
        const r = p.size + (p.size1 - p.size) * (1 - t);
        ctx.strokeStyle = ringColor(p.tint, a);
        ctx.lineWidth = Math.max(0.9, r * 0.075);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.stroke();
        calls++;
        continue;
      }

      const s = p.size1 > 0 ? p.size + (p.size1 - p.size) * (1 - t) : p.size * (0.35 + t * 0.65);
      if (p.kind === 'chip') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = ringColor(p.tint, a);
        ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
        ctx.globalCompositeOperation = 'lighter';
        calls++;
        continue;
      }

      const img =
        p.kind === 'dust' ? atlas.dust : p.kind === 'spark' ? atlas.spark : atlas.glows[p.tint];
      ctx.globalAlpha = a;
      ctx.drawImage(img, p.x - s, p.y - s, s * 2, s * 2);
      calls++;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return calls;
  }
}

const RING_RGB = [
  '232,240,255',
  '127,169,200',
  '255,187,102',
  '255,107,74',
  '185,242,124',
  '192,122,52',
];

function ringColor(tint: number, alpha: number): string {
  return `rgba(${RING_RGB[tint] ?? RING_RGB[0]},${alpha})`;
}

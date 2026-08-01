import { TAU, clamp01, lerp } from '../core/math.ts';
import { valueNoise2D } from '../core/rng.ts';
import { FOOT_KILL_RADIUS, FOOT_RADIUS, NODE_LIFE, WORLD_H, WORLD_W } from '../sim/constants.ts';
import { DECALS, LIGHTS } from '../sim/kitchen.ts';
import type { World } from '../sim/world.ts';
import {
  ATLAS_SCALE,
  CELL,
  DEAD_FRAME,
  GAIT_FRAMES,
  TINT,
  makeCanvas,
  type Atlas,
} from './atlas.ts';
import type { Camera } from './camera.ts';
import { PAL, rgba } from './palette.ts';
import { PRIO, type Particles } from './particles.ts';
import { bakeSolids, type BakedSolid } from './solids.ts';

export interface RenderSettings {
  /** 1 = full shake, 0 = none. */
  shakeScale: number;
  reducedFlash: boolean;
  highContrast: boolean;
}

interface Flash {
  a: number;
  r: number;
  g: number;
  b: number;
  decay: number;
}

const ROACH_ROWS = { scout: 0, worker: 1, nymph: 2 } as const;
/** Antennae are drawn procedurally for at most this many bodies per frame. */
const ANTENNA_BUDGET = 30;

/**
 * The only module that touches the game canvas.
 *
 * Pipeline: floor → debris → solids → pheromone → world objects → bodies → hazards → particles →
 * lighting composite → threat overlays. Lighting is a half-resolution multiply layer built from the
 * *same* light field the exposure system samples, so what the player sees is what the humans see.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private light: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private floorPattern: CanvasPattern | null = null;
  private solids: BakedSolid[];
  private flash: Flash = { a: 0, r: 0, g: 0, b: 0, decay: 6 };
  private moteAcc = 0;
  private moteCursor = 0;
  private lastCamX = 0;
  private lastCamY = 0;
  private lastZoom = 1;
  private lastT = 0;
  private outcome: 'won' | 'lost' | null = null;
  private outcomeTime = 0;

  dpr = 1;
  cssW = 1280;
  cssH = 720;
  drawCalls = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private atlas: Atlas,
    seed: number,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.light = makeCanvas(640, 360);
    const lctx = this.light.getContext('2d', { alpha: false });
    if (!lctx) throw new Error('2D canvas context unavailable');
    this.lightCtx = lctx;
    this.solids = bakeSolids(atlas, seed);

    const pattern = ctx.createPattern(atlas.floor, 'repeat');
    if (pattern) {
      // The tile is authored at 2× so it stays sharp; scale it back into world units.
      pattern.setTransform(new DOMMatrix([1 / ATLAS_SCALE, 0, 0, 1 / ATLAS_SCALE, 0, 0]));
      this.floorPattern = pattern;
    }
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.light.width = Math.max(2, Math.round(cssW / 2));
    this.light.height = Math.max(2, Math.round(cssH / 2));
  }

  /**
   * Drives the world-space win/lose payoff: the kitchen lights come up on a roach domain, or the
   * colour drains out of it. Presentation only — the simulation is already frozen by then.
   */
  setOutcome(status: 'won' | 'lost' | null, seconds: number): void {
    this.outcome = status;
    this.outcomeTime = seconds;
  }

  addFlash(
    r: number,
    g: number,
    b: number,
    a: number,
    decay: number,
    settings: RenderSettings,
  ): void {
    if (settings.reducedFlash) a *= 0.28;
    // One full-screen effect at a time: the newest wins.
    this.flash = { r, g, b, a, decay };
  }

  draw(
    world: World,
    cam: Camera,
    particles: Particles,
    settings: RenderSettings,
    t: number,
    dt: number,
  ): void {
    const ctx = this.ctx;
    this.drawCalls = 0;
    const dpr = this.dpr;
    const z = cam.zoom;
    const ox = this.cssW / 2 - cam.x * z + cam.shakeX;
    const oy = this.cssH / 2 - cam.y * z + cam.shakeY;
    const b = cam.bounds();
    this.lastCamX = cam.x;
    this.lastCamY = cam.y;
    this.lastZoom = z;
    this.lastT = t;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);

    this.drawFloor(b);
    this.drawDebris(b);
    this.drawDecals(b, t);
    this.drawSolids(b);
    this.drawResources(world, t, b);
    this.drawNests(world, t);
    this.drawPheromone(world, particles, b, dt, t);
    this.drawHazards(world, t, b);
    this.drawCorpses(world, b);
    this.drawBodies(world, t, b);
    this.drawSprays(world, t);
    this.drawFootfalls(world, t);
    this.drawCalls += particles.draw(ctx, this.atlas, b);

    this.composeLighting(world, cam, settings, t);
    this.drawOverlays(world, settings, dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Ground ────────────────────────────────────────────────────────────────

  private drawFloor(b: { x0: number; y0: number; x1: number; y1: number }): void {
    const ctx = this.ctx;
    const x0 = Math.max(0, b.x0);
    const y0 = Math.max(0, b.y0);
    const x1 = Math.min(WORLD_W, b.x1);
    const y1 = Math.min(WORLD_H, b.y1);
    if (this.floorPattern) {
      ctx.fillStyle = this.floorPattern;
    } else {
      ctx.fillStyle = '#2a3742';
    }
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    this.drawCalls++;
  }

  private drawDebris(b: { x0: number; y0: number; x1: number; y1: number }): void {
    const img = this.atlas.debris;
    const scale = img.width / WORLD_W;
    const sx = Math.max(0, b.x0) * scale;
    const sy = Math.max(0, b.y0) * scale;
    const sw = Math.min(img.width - sx, (b.x1 - b.x0) * scale);
    const sh = Math.min(img.height - sy, (b.y1 - b.y0) * scale);
    if (sw <= 0 || sh <= 0) return;
    this.ctx.drawImage(
      img,
      sx,
      sy,
      sw,
      sh,
      Math.max(0, b.x0),
      Math.max(0, b.y0),
      sw / scale,
      sh / scale,
    );
    this.drawCalls++;
  }

  /** Floor detail with no gameplay rules: mats, vents, cables, cracks, spills, appliance rings. */
  private drawDecals(b: { x0: number; y0: number; x1: number; y1: number }, t: number): void {
    const ctx = this.ctx;
    for (let i = 0; i < DECALS.length; i++) {
      const d = DECALS[i];
      if (d.x + d.w < b.x0 || d.x > b.x1 || d.y + d.h < b.y0 || d.y > b.y1) continue;
      ctx.save();
      ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
      ctx.rotate(d.rot);
      const hw = d.w / 2;
      const hh = d.h / 2;

      switch (d.kind) {
        case 'mat': {
          // A rubber-backed kitchen mat: raised enough to cast a shadow, ribbed enough to read as
          // fabric at insect scale, and dark enough to stay decoration rather than signal.
          ctx.fillStyle = 'rgba(4,7,11,0.6)';
          ctx.fillRect(-hw + 7, -hh + 9, d.w, d.h);
          ctx.fillStyle = '#232a31';
          ctx.fillRect(-hw, -hh, d.w, d.h);
          ctx.strokeStyle = 'rgba(226,240,255,0.16)';
          ctx.lineWidth = 3;
          const ribs = Math.max(8, Math.round(d.h / 26));
          for (let k = 1; k < ribs; k++) {
            const y = -hh + (d.h / ribs) * k;
            ctx.beginPath();
            ctx.moveTo(-hw + 9, y);
            ctx.lineTo(hw - 9, y);
            ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 3;
          for (let k = 1; k < ribs; k++) {
            const y = -hh + (d.h / ribs) * k + 3;
            ctx.beginPath();
            ctx.moveTo(-hw + 9, y);
            ctx.lineTo(hw - 9, y);
            ctx.stroke();
          }
          // Bound edge: a lighter binding strip all the way round.
          ctx.strokeStyle = 'rgba(150,178,204,0.22)';
          ctx.lineWidth = 7;
          ctx.strokeRect(-hw + 3.5, -hh + 3.5, d.w - 7, d.h - 7);
          ctx.strokeStyle = 'rgba(0,0,0,0.65)';
          ctx.lineWidth = 3;
          ctx.strokeRect(-hw, -hh, d.w, d.h);
          this.drawCalls += 4;
          break;
        }
        case 'vent': {
          ctx.fillStyle = '#141a20';
          ctx.fillRect(-hw, -hh, d.w, d.h);
          ctx.strokeStyle = 'rgba(200,220,245,0.22)';
          ctx.lineWidth = 3;
          ctx.strokeRect(-hw, -hh, d.w, d.h);
          const slats = 7;
          const pitch = (d.h - 16) / slats;
          for (let k = 0; k < slats; k++) {
            const y = -hh + 8 + k * pitch;
            // Void first, then the angled slat face, then its lit leading edge — a flat grey bar
            // repeated seven times reads as a loading placeholder, not as a grille.
            ctx.fillStyle = 'rgba(2,4,7,0.9)';
            ctx.fillRect(-hw + 8, y, d.w - 16, pitch - 2);
            ctx.fillStyle = 'rgba(120,146,170,0.28)';
            ctx.fillRect(-hw + 8, y, d.w - 16, pitch - 5);
            ctx.fillStyle = 'rgba(210,232,255,0.34)';
            ctx.fillRect(-hw + 8, y, d.w - 16, 1.6);
          }
          this.drawCalls += 3;
          break;
        }
        case 'cable': {
          // Contact shadow under the cable, offset down-right like every other solid.
          ctx.strokeStyle = 'rgba(2,4,7,0.55)';
          ctx.lineWidth = 17;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-hw + 4, -hh * 0.3 + 6);
          ctx.bezierCurveTo(-hw * 0.3 + 4, hh + 6, hw * 0.3 + 4, -hh + 6, hw + 4, hh * 0.2 + 6);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(6,9,13,0.85)';
          ctx.lineWidth = 13;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-hw, -hh * 0.3);
          ctx.bezierCurveTo(-hw * 0.3, hh, hw * 0.3, -hh, hw, hh * 0.2);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(140,170,200,0.14)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-hw, -hh * 0.3 - 3);
          ctx.bezierCurveTo(-hw * 0.3, hh - 3, hw * 0.3, -hh - 3, hw, hh * 0.2 - 3);
          ctx.stroke();
          this.drawCalls += 2;
          break;
        }
        case 'crack': {
          ctx.strokeStyle = 'rgba(4,7,11,0.7)';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(-hw, 0);
          ctx.lineTo(-hw * 0.4, -hh * 0.5);
          ctx.lineTo(hw * 0.1, hh * 0.3);
          ctx.lineTo(hw * 0.6, -hh * 0.2);
          ctx.lineTo(hw, hh * 0.6);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(200,220,245,0.10)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          this.drawCalls += 2;
          break;
        }
        case 'spill': {
          const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, hw);
          grad.addColorStop(0, 'rgba(74,52,22,0.42)');
          grad.addColorStop(0.7, 'rgba(58,42,20,0.2)');
          grad.addColorStop(1, 'rgba(50,36,18,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(0, 0, hw, hh, 0, 0, TAU);
          ctx.fill();
          for (let k = 0; k < 14; k++) {
            const a = valueNoise2D(k, i, 3) * TAU;
            const rr = valueNoise2D(k, i + 21, 9) * hw * 0.9;
            ctx.fillStyle = `rgba(196,164,104,${0.1 + valueNoise2D(k, i + 5, 7) * 0.22})`;
            ctx.beginPath();
            ctx.arc(
              Math.cos(a) * rr,
              Math.sin(a) * rr * 0.8,
              1.5 + valueNoise2D(k, i + 9, 11) * 4,
              0,
              TAU,
            );
            ctx.fill();
          }
          this.drawCalls += 2;
          break;
        }
        default: {
          // An appliance ring: a shallow dish left on the floor. It needs a contact shadow or it
          // reads as a bare debug circle floating over the tile.
          const dish = ctx.createRadialGradient(0, 0, hw * 0.2, 0, 0, hw);
          dish.addColorStop(0, 'rgba(10,16,22,0.35)');
          dish.addColorStop(1, 'rgba(10,16,22,0)');
          ctx.fillStyle = dish;
          ctx.beginPath();
          ctx.ellipse(0, 2, hw, hh * 0.86, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(4,7,11,0.7)';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.ellipse(2, 4, hw, hh * 0.86, 0, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(90,112,134,0.5)';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.ellipse(0, 0, hw, hh * 0.86, 0, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = `rgba(196,222,248,${0.16 + Math.sin(t * 0.7 + i) * 0.02})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, -2.5, hw, hh * 0.86, 0, 0, TAU);
          ctx.stroke();
          this.drawCalls += 4;
          break;
        }
      }
      ctx.restore();
    }
  }

  private drawSolids(b: { x0: number; y0: number; x1: number; y1: number }): void {
    const ctx = this.ctx;
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      const w = s.canvas.width;
      const h = s.canvas.height;
      if (s.ox > b.x1 || s.oy > b.y1 || s.ox + w < b.x0 || s.oy + h < b.y0) continue;
      ctx.drawImage(s.canvas, s.ox, s.oy);
      this.drawCalls++;
    }
  }

  // ── World objects ─────────────────────────────────────────────────────────

  private drawResources(
    world: World,
    t: number,
    b: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    const ctx = this.ctx;
    for (let i = 0; i < world.resources.length; i++) {
      const r = world.resources[i];
      if (r.unlockNight > world.night) continue;
      if (r.x < b.x0 || r.x > b.x1 || r.y < b.y0 || r.y > b.y1) continue;
      const frac = clamp01(r.amount / r.initial);
      if (r.depleted && frac <= 0) {
        // A drained node leaves a stain — the evidence the humans notice.
        ctx.fillStyle = 'rgba(20,14,8,0.30)';
        ctx.beginPath();
        ctx.arc(r.x, r.y, 26, 0, TAU);
        ctx.fill();
        this.drawCalls++;
        continue;
      }

      // Remaining-amount gauge. Without it the only way to know a source was running dry was to walk
      // to it and press E, which made depletion the least visible thing in the game.
      const gaugeR = 46 + frac * 12;
      ctx.strokeStyle = 'rgba(6,10,15,0.55)';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, gaugeR, -Math.PI / 2, -Math.PI / 2 + TAU);
      ctx.stroke();
      ctx.strokeStyle =
        frac < 0.2 ? rgba(PAL.danger, 0.8) : rgba(r.kind === 'food' ? PAL.amber : PAL.cold, 0.65);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, gaugeR, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.stroke();
      this.drawCalls += 2;

      if (r.kind === 'food') {
        // A scatter of irregular crumbs: many small, a few large, each with a contact shadow so it
        // sits on the tile instead of floating over it.
        const n = 8 + Math.round(frac * 22);
        const spread = 26 + frac * 46;
        for (let k = 0; k < n; k++) {
          const a = valueNoise2D(k, i, 7) * TAU;
          const rad = Math.sqrt(valueNoise2D(k, i + 40, 13)) * spread;
          const cx = r.x + Math.cos(a) * rad;
          const cy = r.y + Math.sin(a) * rad * 0.82;
          const big = valueNoise2D(k, i + 61, 29);
          const size = 1.6 + big * big * 8 * (0.55 + frac * 0.45);
          const rot = valueNoise2D(k, i + 90, 3) * TAU;

          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.beginPath();
          ctx.ellipse(cx + 1, cy + 1.4, size, size * 0.7, rot, 0, TAU);
          ctx.fill();

          const shade = valueNoise2D(k, i + 17, 5);
          ctx.fillStyle = shade > 0.66 ? '#c2a06a' : shade > 0.33 ? '#9d7a46' : '#78592f';
          ctx.beginPath();
          ctx.ellipse(cx, cy, size, size * 0.72, rot, 0, TAU);
          ctx.fill();
          if (size > 3) {
            ctx.fillStyle = 'rgba(255,232,190,0.32)';
            ctx.beginPath();
            ctx.ellipse(cx - size * 0.22, cy - size * 0.28, size * 0.4, size * 0.26, rot, 0, TAU);
            ctx.fill();
          }
          this.drawCalls += 2;
        }
      } else {
        const wob = Math.sin(t * 1.6 + i) * 0.05 + 1;
        const rx = (18 + frac * 26) * wob;
        const ry = rx * 0.72;
        const grad = ctx.createRadialGradient(r.x - rx * 0.3, r.y - ry * 0.4, 1, r.x, r.y, rx);
        grad.addColorStop(0, 'rgba(190,225,245,0.55)');
        grad.addColorStop(0.45, 'rgba(60,100,130,0.45)');
        grad.addColorStop(1, 'rgba(18,34,48,0.62)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, rx, ry, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,220,245,0.5)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, rx, ry, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(230,245,255,0.75)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, rx * 0.66, Math.PI * 1.05, Math.PI * 1.55);
        ctx.stroke();
        this.drawCalls += 3;
      }
    }
  }

  private drawNests(world: World, t: number): void {
    const ctx = this.ctx;
    for (let i = 0; i < world.nests.length; i++) {
      const n = world.nests[i];
      const sealed = n.unlockNight > world.night && !n.claimed;
      const R = n.home ? 54 : 42;

      if (sealed) {
        // Visible but plainly shut: scouting one out early is worth doing, claiming it is not yet.
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#0a0e14';
        ctx.beginPath();
        ctx.ellipse(n.x, n.y, R * 0.8, R * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(150,178,204,0.35)';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 7]);
        ctx.beginPath();
        ctx.ellipse(n.x, n.y, R * 0.8, R * 0.6, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // A crust of old paint across the opening.
        ctx.strokeStyle = 'rgba(190,205,225,0.22)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(n.x - R * 0.7, n.y - R * 0.2);
        ctx.lineTo(n.x + R * 0.7, n.y + R * 0.18);
        ctx.stroke();
        ctx.globalAlpha = 1;
        this.drawCalls += 3;
        continue;
      }

      // Void: a torn opening rather than a circle.
      ctx.fillStyle = '#05070b';
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * TAU;
        const wob = 0.72 + valueNoise2D(k, i, 31) * 0.5;
        const px = n.x + Math.cos(a) * R * wob;
        const py = n.y + Math.sin(a) * R * wob * 0.74;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      this.drawCalls++;

      // Glistening lip on the upper edge.
      ctx.strokeStyle = 'rgba(180,205,230,0.22)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(n.x, n.y, R * 0.95, R * 0.7, 0, Math.PI * 1.1, Math.PI * 1.95);
      ctx.stroke();
      this.drawCalls++;

      if (!n.claimed) {
        const pulse = 0.4 + Math.sin(t * 2.4) * 0.28;
        ctx.strokeStyle = rgba(PAL.cold, pulse);
        ctx.lineWidth = 2;
        ctx.setLineDash([9, 9]);
        ctx.beginPath();
        ctx.arc(n.x, n.y, R + 20, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        this.drawCalls++;
        continue;
      }

      const reveal = clamp01(n.age / 1.4);
      const glow = this.atlas.glows[n.upgrade === 'escape' ? TINT.cold : TINT.warm];
      const gr = R * (2.1 + Math.sin(t * 1.3 + i) * 0.08) * reveal;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.28 * reveal;
      ctx.drawImage(glow, n.x - gr, n.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this.drawCalls++;

      // Upgrade-specific silhouette inside the void.
      if (n.upgrade === 'brood' || n.home) {
        const eggs = n.home ? 4 + n.growth * 3 : 7;
        for (let k = 0; k < eggs; k++) {
          const a = (k / eggs) * TAU + t * 0.12;
          const rr = R * 0.5;
          const ex = n.x + Math.cos(a) * rr;
          const ey = n.y + Math.sin(a) * rr * 0.7;
          const p = 0.6 + Math.sin(t * 2.2 + k) * 0.4;
          ctx.fillStyle = `rgba(228,196,140,${0.35 + p * 0.3})`;
          ctx.beginPath();
          ctx.ellipse(ex, ey, 5.5, 3.4, a, 0, TAU);
          ctx.fill();
          this.drawCalls++;
        }
      } else if (n.upgrade === 'cache') {
        for (let k = 0; k < 9; k++) {
          const ex = n.x - 22 + (k % 3) * 16;
          const ey = n.y - 8 + Math.floor(k / 3) * 11;
          ctx.fillStyle = 'rgba(200,166,110,0.75)';
          ctx.beginPath();
          ctx.ellipse(ex, ey, 7, 5, 0.3, 0, TAU);
          ctx.fill();
          this.drawCalls++;
        }
      } else if (n.upgrade === 'escape') {
        const tun = ctx.createRadialGradient(n.x, n.y, 2, n.x, n.y, R);
        tun.addColorStop(0, 'rgba(140,190,230,0.45)');
        tun.addColorStop(1, 'rgba(10,20,30,0)');
        ctx.fillStyle = tun;
        ctx.beginPath();
        ctx.arc(n.x, n.y, R, 0, TAU);
        ctx.fill();
        this.drawCalls++;
      }

      if (n.home) {
        // Integrity is only shown when it is actually being lost.
        if (n.integrity < 0.999) {
          ctx.strokeStyle = rgba(PAL.danger, 0.85);
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(n.x, n.y, R + 16, -Math.PI / 2, -Math.PI / 2 + TAU * n.integrity);
          ctx.stroke();
          this.drawCalls++;
        }
        // Traffic sheen at the lip, thicker with population.
        const sheen = clamp01(world.colony.population / 40);
        ctx.strokeStyle = `rgba(210,180,130,${0.08 + sheen * 0.22})`;
        ctx.lineWidth = 3 + sheen * 4;
        ctx.beginPath();
        ctx.ellipse(n.x, n.y, R * 1.05, R * 0.78, 0, 0, TAU);
        ctx.stroke();
        this.drawCalls++;
      }
    }
  }

  // ── Pheromone ─────────────────────────────────────────────────────────────

  private drawPheromone(
    world: World,
    particles: Particles,
    b: { x0: number; y0: number; x1: number; y1: number },
    dt: number,
    t: number,
  ): void {
    const ctx = this.ctx;
    const glowCold = this.atlas.glows[TINT.cold];
    const glowWarm = this.atlas.glows[TINT.warm];
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < world.routes.length; i++) {
      const route = world.routes[i];
      const nodes = route.nodes;
      const linked = route.linked;
      const baseAlpha = linked ? 0.62 : 0.3;

      for (let j = 0; j < nodes.length; j++) {
        const n = nodes[j];
        if (n.x < b.x0 || n.x > b.x1 || n.y < b.y0 || n.y > b.y1) continue;
        const s = clamp01(n.life / NODE_LIFE);
        // Per-node jitter and size variation: scent, not a drawn line.
        const jx = (valueNoise2D(n.i, route.id, 3) - 0.5) * 13;
        const jy = (valueNoise2D(n.i, route.id + 77, 11) - 0.5) * 13;
        const size = (8 + s * 8) * (0.65 + valueNoise2D(n.i, route.id + 5, 19) * 0.75);
        const px = n.x + jx;
        const py = n.y + jy;
        ctx.globalAlpha = baseAlpha * (0.3 + s * 0.7);
        ctx.drawImage(glowCold, px - size, py - size, size * 2, size * 2);
        this.drawCalls++;
        if (linked && j % 3 === 0) {
          const ws = size * 0.5;
          ctx.globalAlpha = 0.4 * s;
          ctx.drawImage(glowWarm, px - ws, py - ws, ws * 2, ws * 2);
          this.drawCalls++;
        }
      }

      // A slow drift of motes so a live trail never looks like a static decal.
      if (linked && nodes.length > 4) {
        this.moteAcc += dt * Math.min(nodes.length * 0.4, 16);
        while (this.moteAcc >= 1) {
          this.moteAcc -= 1;
          this.moteCursor = (this.moteCursor + 7) % nodes.length;
          const n = nodes[this.moteCursor];
          const jitter = (valueNoise2D(this.moteCursor, i, 5) - 0.5) * 12;
          particles.emit(
            'glow',
            TINT.cold,
            n.x,
            n.y,
            -n.dy * 9 + jitter,
            n.dx * 9 + jitter,
            1.6,
            4.5,
            0.42,
            PRIO.decor,
          );
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Link markers at both ends: the single most important readout in the game.
    for (let i = 0; i < world.routes.length; i++) {
      const route = world.routes[i];
      if (route.nodes.length < 2) continue;
      const ends = [route.nodes[0], route.nodes[route.nodes.length - 1]];
      for (let e = 0; e < 2; e++) {
        const n = ends[e];
        if (n.x < b.x0 || n.x > b.x1 || n.y < b.y0 || n.y > b.y1) continue;
        if (route.linked) {
          const pulse = 0.45 + Math.sin(t * 3 + route.id) * 0.2;
          ctx.strokeStyle = rgba(PAL.warm, pulse);
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 24 + Math.sin(t * 3 + route.id) * 2.5, 0, TAU);
          ctx.stroke();
        } else if (route.dry) {
          // Anchored but the source is stripped bare: a broken ring, so "dry" is not mistaken for
          // "unlinked" or for "working".
          ctx.strokeStyle = rgba(PAL.danger, 0.5);
          ctx.lineWidth = 2.4;
          ctx.setLineDash([5, 12]);
          ctx.beginPath();
          ctx.arc(n.x, n.y, 22, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = rgba(PAL.cold, 0.32);
          ctx.lineWidth = 2;
          ctx.setLineDash([7, 9]);
          ctx.beginPath();
          ctx.arc(n.x, n.y, 18, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        this.drawCalls++;
      }
    }
  }

  // ── Hazards ───────────────────────────────────────────────────────────────

  private drawHazards(
    world: World,
    t: number,
    b: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    const ctx = this.ctx;
    for (let i = 0; i < world.hazards.length; i++) {
      const h = world.hazards[i];
      if (h.x < b.x0 - 200 || h.x > b.x1 + 200 || h.y < b.y0 - 200 || h.y > b.y1 + 200) continue;

      if (h.kind === 'trap') {
        const r = h.radius;
        const settle = clamp01(h.age / 0.5);
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.scale(settle, settle);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(-r + 5, -r * 0.78 + 7, r * 2, r * 1.56);
        const grad = ctx.createLinearGradient(-r, -r, r, r);
        grad.addColorStop(0, h.capacity > 0 ? '#d8c48a' : '#6b6250');
        grad.addColorStop(0.5, h.capacity > 0 ? '#b9a066' : '#584f40');
        grad.addColorStop(1, h.capacity > 0 ? '#8d7742' : '#3f382c');
        ctx.fillStyle = grad;
        ctx.fillRect(-r, -r * 0.78, r * 2, r * 1.56);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-r, -r * 0.78, r * 2, r * 1.56);
        // Adhesive sheen.
        ctx.fillStyle = `rgba(255,255,240,${0.1 + Math.sin(t * 2 + i) * 0.03})`;
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, -r * 0.2, r * 0.7, r * 0.34, -0.5, 0, TAU);
        ctx.fill();
        ctx.restore();
        this.drawCalls += 4;

        if (!h.armed) {
          const p = clamp01(1 - h.armTime / 2.2);
          ctx.strokeStyle = rgba(PAL.danger, 0.35 + Math.sin(t * 9) * 0.2);
          ctx.lineWidth = 2;
          ctx.setLineDash([7, 7]);
          ctx.beginPath();
          ctx.arc(h.x, h.y, r + 26 - p * 12, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          this.drawCalls++;
        }
      } else {
        const r = h.radius;
        const grad = ctx.createRadialGradient(h.x, h.y, 1, h.x, h.y, r);
        grad.addColorStop(0, 'rgba(185,242,124,0.75)');
        grad.addColorStop(0.5, 'rgba(120,180,80,0.45)');
        grad.addColorStop(1, 'rgba(60,110,40,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(h.x, h.y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(240,255,220,0.6)';
        ctx.beginPath();
        ctx.ellipse(h.x - r * 0.2, h.y - r * 0.24, r * 0.16, r * 0.1, -0.5, 0, TAU);
        ctx.fill();
        this.drawCalls += 2;
      }
    }

    // Adhesive strands for anything currently stuck.
    ctx.strokeStyle = 'rgba(240,232,190,0.5)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < world.workers.length; i++) {
      const w = world.workers[i];
      if (!w.alive || w.state !== 'trapped') continue;
      const h = world.hazards.find((x) => x.id === w.hazardId);
      if (!h) continue;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + t * 2;
        ctx.beginPath();
        ctx.moveTo(w.x + Math.cos(a) * 5, w.y + Math.sin(a) * 5);
        ctx.lineTo(h.x + Math.cos(a) * h.radius * 0.6, h.y + Math.sin(a) * h.radius * 0.45);
        ctx.stroke();
      }
      this.drawCalls++;
    }
  }

  private drawSprays(world: World, t: number): void {
    const ctx = this.ctx;
    for (let i = 0; i < world.sprays.length; i++) {
      const s = world.sprays[i];
      const puffs = 22;
      ctx.globalCompositeOperation = 'source-over';
      for (let k = 0; k < puffs; k++) {
        const seed = k * 37 + s.id * 91;
        const a = valueNoise2D(seed, 1, 11) * TAU + t * 0.4 * (k % 2 ? 1 : -1);
        const rad = s.radius * (0.25 + valueNoise2D(seed, 2, 17) * 0.7);
        const px = s.x + Math.cos(a) * rad;
        const py = s.y + Math.sin(a) * rad * 0.8;
        const pr = s.radius * (0.25 + valueNoise2D(seed, 3, 23) * 0.3);
        const grad = ctx.createRadialGradient(px, py, 1, px, py, pr);
        grad.addColorStop(0, 'rgba(200,246,150,0.16)');
        grad.addColorStop(1, 'rgba(150,210,110,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, TAU);
        ctx.fill();
        this.drawCalls++;
      }
      // Hard leading edge so the denial zone has a boundary the player can respect.
      ctx.strokeStyle = 'rgba(200,255,150,0.35)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 0.92, 0, TAU);
      ctx.stroke();
      this.drawCalls++;
    }
  }

  private drawFootfalls(world: World, t: number): void {
    const ctx = this.ctx;
    for (let i = 0; i < world.footfalls.length; i++) {
      const f = world.footfalls[i];
      const p = clamp01(f.warn / f.warnTotal);

      if (f.warn > 0) {
        // Pressure shadow grows; the danger ring CONTRACTS toward the impact point.
        const sr = FOOT_RADIUS * (1.1 + p * 1.4);
        const grad = ctx.createRadialGradient(f.x, f.y, sr * 0.1, f.x, f.y, sr);
        grad.addColorStop(0, `rgba(0,0,0,${0.55 * (1 - p) + 0.12})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(f.x, f.y, sr, 0, TAU);
        ctx.fill();
        this.drawCalls++;

        // The telegraph is the shape of the thing that is about to land, at the angle it will land
        // at: a circle around a boot-shaped threat told the player the wrong ground was lethal.
        const ringR = FOOT_KILL_RADIUS + p * FOOT_RADIUS * 2.1;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(0.22);
        ctx.strokeStyle = rgba(PAL.danger, 0.35 + (1 - p) * 0.55);
        ctx.lineWidth = 2 + (1 - p) * 3;
        ctx.setLineDash([13, 10]);
        ctx.lineDashOffset = t * -40;
        ctx.beginPath();
        ctx.ellipse(0, 0, ringR * 0.62, ringR, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        this.drawCalls++;

        // The inner outline is the actual kill footprint, solid so it reads as the hard edge.
        ctx.strokeStyle = rgba(PAL.danger, 0.4);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, FOOT_KILL_RADIUS * 0.62, FOOT_KILL_RADIUS, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
        this.drawCalls++;
      }

      // The sole itself only becomes visible at the last moment.
      const show = f.warn < 0.34;
      if (!show) continue;
      const drop = f.warn > 0 ? clamp01(1 - f.warn / 0.34) : 1;
      const fade = f.warn < 0 ? clamp01(1 + f.warn / 0.75) : 1;
      const img = this.atlas.foot;
      const scale = (FOOT_RADIUS * 2.6) / img.height;
      const s = scale * (1.5 - 0.5 * drop);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(f.x, f.y);
      ctx.rotate(0.22);
      ctx.drawImage(
        img,
        (-img.width * s) / 2,
        (-img.height * s) / 2,
        img.width * s,
        img.height * s,
      );
      ctx.restore();
      ctx.globalAlpha = 1;
      this.drawCalls++;
    }
  }

  // ── Bodies ────────────────────────────────────────────────────────────────

  private drawCorpses(world: World, b: { x0: number; y0: number; x1: number; y1: number }): void {
    const ctx = this.ctx;
    for (let i = 0; i < world.corpses.length; i++) {
      const c = world.corpses[i];
      if (c.x < b.x0 || c.x > b.x1 || c.y < b.y0 || c.y > b.y1) continue;
      ctx.globalAlpha = clamp01((95 - c.age) / 22) * 0.92;
      this.blitRoach(1, DEAD_FRAME, c.x, c.y, c.angle, c.scale);
      ctx.globalAlpha = 1;
    }
  }

  private blitRoach(
    row: number,
    frame: number,
    x: number,
    y: number,
    angle: number,
    scale: number,
  ): void {
    const ctx = this.ctx;
    const s = scale / ATLAS_SCALE;
    const cos = Math.cos(angle) * s;
    const sin = Math.sin(angle) * s;
    ctx.save();
    ctx.transform(cos, sin, -sin, cos, x, y);
    ctx.drawImage(
      this.atlas.roach,
      frame * CELL,
      row * CELL,
      CELL,
      CELL,
      -CELL / 2,
      -CELL / 2,
      CELL,
      CELL,
    );
    ctx.restore();
    this.drawCalls++;
  }

  private drawBodies(
    world: World,
    t: number,
    b: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    const ctx = this.ctx;
    const workers = world.workers;
    let antennaLeft = ANTENNA_BUDGET;

    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      if (!w.alive) continue;
      if (w.x < b.x0 || w.x > b.x1 || w.y < b.y0 || w.y > b.y1) continue;
      const nymph = w.nymphTime > 0;
      const row = nymph ? ROACH_ROWS.nymph : ROACH_ROWS.worker;
      const frame = Math.floor(w.gait) % GAIT_FRAMES;

      // Contact shadow keeps the body attached to the floor.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(w.x + 2, w.y + 3, 11 * w.scale, 6 * w.scale, w.angle, 0, TAU);
      ctx.fill();
      this.drawCalls++;

      this.blitRoach(row, frame, w.x, w.y, w.angle, w.scale);

      if (antennaLeft > 0) {
        antennaLeft--;
        this.drawAntennae(w.x, w.y, w.angle, 20 * w.scale, t + i, w.state === 'panic' ? 2.4 : 1);
      }

      if (w.carrying) {
        // Cargo rides the back, not the head, and is small enough that the roach's own silhouette
        // still reads — a blob as wide as the thorax looked like an ootheca stuck to its face.
        const cx = w.x - Math.cos(w.angle) * 11;
        const cy = w.y - Math.sin(w.angle) * 11;
        const bob = Math.sin(w.gait * 2) * 1.2;
        if (w.carrying === 'food') {
          ctx.fillStyle = '#c9a468';
          ctx.beginPath();
          ctx.ellipse(cx, cy + bob, 5, 4, w.angle, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,228,180,0.5)';
          ctx.beginPath();
          ctx.ellipse(cx - 1.5, cy - 1.5 + bob, 2.6, 2, w.angle, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(150,205,235,0.85)';
          ctx.beginPath();
          ctx.ellipse(cx, cy + bob, 4.4, 4, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(240,252,255,0.8)';
          ctx.beginPath();
          ctx.arc(cx - 1.6, cy - 1.6 + bob, 1.5, 0, TAU);
          ctx.fill();
        }
        this.drawCalls += 2;
      }
    }

    // ── Scout last, and always with its rim-light, so it is never lost in a crowd.
    const s = world.scout;
    if (!s.alive) return;
    // A cold additive halo on a cold floor is invisible — measured ΔE near zero. The scout instead
    // gets a warm ground pool the floor palette does not own, plus a hard traced outline, so "which
    // one am I" is answered before anything else in the frame.
    const glow = this.atlas.glows[TINT.warm];
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3 + Math.sin(t * 2.6) * 0.05;
    ctx.drawImage(glow, s.x - 40, s.y - 40, 80, 80);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.drawCalls++;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(s.x + 2, s.y + 4, 16, 9, s.angle, 0, TAU);
    ctx.fill();
    this.drawCalls++;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.strokeStyle = rgba(PAL.warm, 0.85);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(-1, 0, 16, 8.4, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    this.drawCalls++;

    const frame = Math.floor(s.gait) % GAIT_FRAMES;
    this.blitRoach(ROACH_ROWS.scout, frame, s.x, s.y, s.angle, s.trapId >= 0 ? 1.02 : 1);
    this.drawAntennae(s.x, s.y, s.angle, 30, t, s.spotted > 0.4 ? 2.2 : 1);

    if (s.laying) {
      const gr = 16 + Math.sin(t * 22) * 3;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(
        this.atlas.glows[TINT.cold],
        s.x - Math.cos(s.angle) * 13 - gr,
        s.y - Math.sin(s.angle) * 13 - gr,
        gr * 2,
        gr * 2,
      );
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this.drawCalls++;
    }

    if (s.spotted > 0.25) {
      const r = 30 + s.spotted * 22;
      ctx.strokeStyle = rgba(PAL.danger, 0.25 + s.spotted * 0.55);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * s.spotted);
      ctx.stroke();
      this.drawCalls++;
    }

    if (s.trapId >= 0) {
      ctx.strokeStyle = 'rgba(240,232,190,0.75)';
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + t * 3;
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(a) * 6, s.y + Math.sin(a) * 6);
        ctx.lineTo(s.x + Math.cos(a) * 34, s.y + Math.sin(a) * 26);
        ctx.stroke();
      }
      this.drawCalls++;
    }
  }

  /** Two tapered antennae, swept procedurally. This is the roach identity motion. */
  private drawAntennae(
    x: number,
    y: number,
    angle: number,
    L: number,
    t: number,
    alarm: number,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      const sweep = Math.sin(t * (2.2 + alarm) + s * 1.3) * (0.34 + alarm * 0.14);
      const a1 = s * (0.34 + sweep * 0.6);
      const bx = L * 0.46;
      const by = s * L * 0.08;
      const cx = bx + Math.cos(a1 * 0.45) * L * 0.55;
      const cy = by + Math.sin(a1 * 0.45) * L * 0.55;
      const tx = bx + Math.cos(a1) * L * 1.05;
      const ty = by + Math.sin(a1) * L * 1.05;
      ctx.strokeStyle = 'rgba(30,20,10,0.9)';
      ctx.lineWidth = L * 0.05;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(cx, cy, tx, ty);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(140,110,70,0.55)';
      ctx.lineWidth = L * 0.022;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo((cx + tx) / 2, (cy + ty) / 2, tx, ty);
      ctx.stroke();
    }
    ctx.restore();
    this.drawCalls += 2;
  }

  // ── Lighting ──────────────────────────────────────────────────────────────

  private composeLighting(world: World, cam: Camera, settings: RenderSettings, t: number): void {
    const lc = this.lightCtx;
    const lw = this.light.width;
    const lh = this.light.height;
    const z = cam.zoom / 2;
    const ox = lw / 2 - cam.x * z + cam.shakeX / 2;
    const oy = lh / 2 - cam.y * z + cam.shakeY / 2;

    lc.setTransform(1, 0, 0, 1, 0, 0);
    // Ambient darkness. Low enough for macro-noir, high enough that a hazard on bare tile is
    // legible without the room light — tuned against captures, not guessed.
    // Low enough that additive warm light has somewhere to go. At 172 every light clipped to white
    // and the whole kitchen measured a single blue hue with a 22-point luminance range.
    const base = settings.highContrast ? 194 : 146;
    // Victory turns the kitchen lights on over the colony; defeat drains it toward cold ash.
    const win = this.outcome === 'won' ? clamp01(this.outcomeTime / 2.2) : 0;
    const loss = this.outcome === 'lost' ? clamp01(this.outcomeTime / 1.6) : 0;
    const lift = clamp01(world.roomLight + win * 0.85);
    let r = Math.round(lerp(base * 0.86, 244, lift));
    let g = Math.round(lerp(base * 0.96, 232, lift));
    let bl = Math.round(lerp(base * 1.12, 208, lift));
    if (loss > 0) {
      // Drain toward a flat, cold, colourless room.
      const grey = Math.round(lerp((r + g + bl) / 3, 96, loss));
      r = Math.round(lerp(r, grey, loss));
      g = Math.round(lerp(g, grey, loss));
      bl = Math.round(lerp(bl, grey * 1.06, loss));
    }
    lc.fillStyle = `rgb(${r},${g},${bl})`;
    lc.fillRect(0, 0, lw, lh);

    lc.setTransform(z, 0, 0, z, ox, oy);
    lc.globalCompositeOperation = 'lighter';

    for (let i = 0; i < LIGHTS.length; i++) {
      const l = LIGHTS[i];
      const flick = l.id === 'fridgeSeam' ? 1 + Math.sin(t * 21) * 0.014 : 1;
      const grad = lc.createRadialGradient(l.x, l.y, 1, l.x, l.y, l.radius);
      const warmR = Math.round(lerp(150, 255, l.warmth) * l.intensity * flick);
      const warmG = Math.round(lerp(190, 190, l.warmth) * l.intensity * flick);
      const warmB = Math.round(lerp(255, 110, l.warmth) * l.intensity * flick);
      grad.addColorStop(0, `rgba(${warmR},${warmG},${warmB},1)`);
      grad.addColorStop(0.55, `rgba(${warmR},${warmG},${warmB},0.34)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = grad;
      lc.beginPath();
      lc.arc(l.x, l.y, l.radius, 0, TAU);
      lc.fill();
    }

    // Patrol cones use the same geometry the exposure sampler reads.
    for (let i = 0; i < world.patrols.length; i++) {
      const p = world.patrols[i];
      if (p.lightPower <= 0.01) continue;
      const range = p.coneRange;
      lc.save();
      lc.translate(p.x, p.y);
      lc.rotate(p.angle);
      const cone = lc.createRadialGradient(0, 0, 1, 0, 0, range);
      const a = p.lightPower;
      cone.addColorStop(0, `rgba(255,238,200,${0.55 * a})`);
      cone.addColorStop(0.5, `rgba(255,226,170,${0.24 * a})`);
      cone.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = cone;
      lc.beginPath();
      lc.moveTo(0, 0);
      lc.arc(0, 0, range, -1.21, 1.21);
      lc.closePath();
      lc.fill();
      const pool = lc.createRadialGradient(0, 0, 1, 0, 0, range * 0.42);
      pool.addColorStop(0, `rgba(255,236,196,${0.34 * a})`);
      pool.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = pool;
      lc.beginPath();
      lc.arc(0, 0, range * 0.42, 0, TAU);
      lc.fill();
      lc.restore();
    }

    // Nest and hazard self-illumination, so objects read at night.
    for (let i = 0; i < world.nests.length; i++) {
      const n = world.nests[i];
      if (!n.claimed) continue;
      const rr = n.home ? 250 : 190;
      const grad = lc.createRadialGradient(n.x, n.y, 1, n.x, n.y, rr);
      grad.addColorStop(0, 'rgba(214,150,78,0.5)');
      grad.addColorStop(0.45, 'rgba(178,124,66,0.18)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = grad;
      lc.beginPath();
      lc.arc(n.x, n.y, rr, 0, TAU);
      lc.fill();
    }
    for (let i = 0; i < world.sprays.length; i++) {
      const s = world.sprays[i];
      const grad = lc.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.radius * 1.3);
      grad.addColorStop(0, 'rgba(150,220,110,0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = grad;
      lc.beginPath();
      lc.arc(s.x, s.y, s.radius * 1.3, 0, TAU);
      lc.fill();
    }

    lc.globalCompositeOperation = 'source-over';
    lc.setTransform(1, 0, 0, 1, 0, 0);

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.light, 0, 0, this.cssW, this.cssH);
    ctx.globalCompositeOperation = 'source-over';
    this.drawCalls++;
  }

  /**
   * Objective bearing. When the target is off screen a chevron rides the frame edge with the
   * distance in floor tiles; when it is on screen a soft ring marks it instead. Without this the
   * kitchen is large enough to get genuinely lost in.
   */
  private drawGuide(world: World, w: number, h: number): void {
    const guide = world.guide;
    if (!guide || world.status !== 'playing') return;
    const ctx = this.ctx;
    const z = this.lastZoom;
    const sx = w / 2 + (guide.x - this.lastCamX) * z;
    const sy = h / 2 + (guide.y - this.lastCamY) * z;
    const margin = 74;
    const onScreen = sx > margin && sx < w - margin && sy > margin && sy < h - margin;

    if (onScreen) {
      const pulse = 0.4 + Math.sin(this.lastT * 2.6) * 0.2;
      ctx.strokeStyle = rgba(PAL.warm, pulse * 0.7);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(sx, sy, 46 + Math.sin(this.lastT * 2.6) * 4, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      this.drawCalls++;
      return;
    }

    const cx = w / 2;
    const cy = h / 2;
    let dx = sx - cx;
    let dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const rx = (w / 2 - margin) / Math.max(1e-4, Math.abs(dx));
    const ry = (h / 2 - margin) / Math.max(1e-4, Math.abs(dy));
    const r = Math.min(rx, ry);
    const px = cx + dx * r;
    const py = cy + dy * r;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = rgba(PAL.warm, 0.9);
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-8, 9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, -9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const tiles = Math.round(Math.hypot(guide.x - world.scout.x, guide.y - world.scout.y) / 320);
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(6,10,15,0.8)';
    const label = `${guide.label} · ${tiles} tile${tiles === 1 ? '' : 's'}`;
    const tw = ctx.measureText(label).width + 14;
    const lx = Math.min(w - tw / 2 - 4, Math.max(tw / 2 + 4, px - dx * 26));
    const ly = Math.min(h - 16, Math.max(16, py - dy * 26));
    ctx.beginPath();
    ctx.roundRect(lx - tw / 2, ly - 9, tw, 18, 9);
    ctx.fill();
    ctx.fillStyle = rgba(PAL.warm, 0.95);
    ctx.fillText(label, lx, ly);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    this.drawCalls += 2;
  }

  // ── Screen space ──────────────────────────────────────────────────────────

  private drawOverlays(world: World, settings: RenderSettings, dt: number): void {
    const ctx = this.ctx;
    const w = this.cssW;
    const h = this.cssH;

    // Vignette: always present, deepening with exposure so danger is felt at the frame edge.
    const exposure = world.scout.alive ? world.scout.exposure : 0;
    const vig = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.32,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.72,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(2,4,8,${0.42 + exposure * 0.2})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    this.drawCalls++;

    if (world.scout.spotted > 0.2 && !settings.reducedFlash) {
      const a = (world.scout.spotted - 0.2) * 0.34;
      const grad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.3,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.7,
      );
      grad.addColorStop(0, 'rgba(255,80,50,0)');
      grad.addColorStop(1, `rgba(255,80,50,${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      this.drawCalls++;
    }

    if (world.sprays.length > 0) {
      ctx.fillStyle = `rgba(150,220,110,${Math.min(0.1, world.sprays.length * 0.045)})`;
      ctx.fillRect(0, 0, w, h);
      this.drawCalls++;
    }

    this.drawGuide(world, w, h);

    if (this.flash.a > 0.002) {
      ctx.fillStyle = `rgba(${this.flash.r},${this.flash.g},${this.flash.b},${this.flash.a})`;
      ctx.fillRect(0, 0, w, h);
      this.flash.a -= this.flash.a * this.flash.decay * dt + 0.004;
      this.drawCalls++;
    }
  }
}

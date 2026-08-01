import { Rng, fbm2D } from '../core/rng.ts';
import { TAU } from '../core/math.ts';
import {
  NYMPH_PAL,
  PAL,
  SCOUT_PAL,
  WORKER_PAL,
  WORKER_PAL_DARK,
  WORKER_PAL_PALE,
  rgba,
  type RoachPalette,
} from './palette.ts';

/**
 * Every sprite in the game, generated procedurally at boot.
 *
 * This module *is* the art asset (see DECISIONS.md D5): nothing is fetched, so the payload is zero
 * bytes, the licence is unambiguous, and the sprites resample perfectly at any device pixel ratio.
 * Generation is seeded, so two boots produce identical art.
 */

/** Supersample factor: sprites are authored at 2× world scale and blitted at 0.5. */
export const ATLAS_SCALE = 2;
/** Cell edge in atlas pixels (64 world units). */
export const CELL = 128;
export const GAIT_FRAMES = 8;
/** Column index of the death pose. */
export const DEAD_FRAME = 8;

export type RoachType = 0 | 1 | 2; // scout, worker, nymph

/**
 * Tint slots for additive sprites. Particles reference a slot rather than a colour so drawing is a
 * single `drawImage` with no per-particle composite switching.
 */
export const TINT = {
  bone: 0,
  cold: 1,
  warm: 2,
  danger: 3,
  toxin: 4,
  amber: 5,
} as const;

const TINT_COLORS = ['#e8f0ff', '#7fa9c8', '#ffbb66', '#ff6b4a', '#b9f27c', '#c07a34'];

export interface Atlas {
  roach: HTMLCanvasElement;
  /** Pre-tinted radial glows, indexed by {@link TINT}. */
  glows: HTMLCanvasElement[];
  dust: HTMLCanvasElement;
  spark: HTMLCanvasElement;
  floor: HTMLCanvasElement;
  debris: HTMLCanvasElement;
  materials: Record<string, HTMLCanvasElement>;
  foot: HTMLCanvasElement;
  buildMs: number;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d', { alpha: true });
  if (!g) throw new Error('2D canvas context unavailable');
  return g;
}

function ellipse(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot = 0,
): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
}

/** Traces the tapered wing-case outline. Front is +X; `hw` is the half-width at the shoulders. */
function wingCasePath(g: CanvasRenderingContext2D, L: number, hw: number): void {
  g.beginPath();
  g.moveTo(L * 0.34, -L * 0.05);
  g.bezierCurveTo(L * 0.35, -hw * 0.95, L * 0.1, -hw * 1.06, -L * 0.1, -hw * 0.95);
  g.bezierCurveTo(-L * 0.34, -hw * 0.8, -L * 0.5, -hw * 0.38, -L * 0.55, 0);
  g.bezierCurveTo(-L * 0.5, hw * 0.38, -L * 0.34, hw * 0.8, -L * 0.1, hw * 0.95);
  g.bezierCurveTo(L * 0.1, hw * 1.06, L * 0.35, hw * 0.95, L * 0.34, L * 0.05);
  g.closePath();
}

/**
 * One cockroach, nose pointing +X, centred at (0,0), body length `L`.
 *
 * Anatomy matters here because the silhouette is the entire read at insect scale: a flat tapered
 * wing case, a wide pronotum shield hiding most of the head, and three leg pairs with genuinely
 * different lengths and angles — front pair short and forward, hind pair long and swept back. Legs
 * run a tripod gait driven by `phase`; the body never deforms, so the silhouette is stable.
 */
function drawRoachBody(
  g: CanvasRenderingContext2D,
  L: number,
  phase: number,
  pal: RoachPalette,
  dead: boolean,
): void {
  const hw = L * 0.235;

  // ── Legs, behind the body. Per-pair splay, length and phase.
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const attachX = [0.2, 0.0, -0.2];
  const splay = [-0.62, 0.16, 0.92]; // radians, positive sweeps backward
  const legLen = [0.5, 0.62, 0.9];

  for (let side = 0; side < 2; side++) {
    const s = side === 0 ? -1 : 1;
    for (let i = 0; i < 3; i++) {
      // Tripod gait: front-left, mid-right, hind-left move together.
      const p = phase + ((i + (s > 0 ? 1 : 0)) % 2 === 0 ? 0 : Math.PI);
      const swing = dead ? 0 : Math.sin(p) * 0.34;
      const lift = dead ? 0 : Math.max(0, Math.cos(p));

      const bx = attachX[i] * L;
      const by = s * hw * 0.72;
      const a = s * (Math.PI / 2) + s * (splay[i] + swing);
      const len = L * legLen[i] * (dead ? 0.34 : 1 - lift * 0.12);

      const kx = bx + Math.cos(a) * len * 0.5 + Math.cos(a - s * 0.5) * len * 0.16;
      const ky = by + Math.sin(a) * len * 0.5 + Math.sin(a - s * 0.5) * len * 0.16;
      let fx = bx + Math.cos(a) * len;
      let fy = by + Math.sin(a) * len;
      if (dead) {
        // Curled inward under the body, the way a dead roach actually sits.
        fx = bx + Math.cos(a) * len * 0.35;
        fy = by + Math.sin(a) * len * 0.35;
      }

      g.strokeStyle = pal.leg;
      g.lineWidth = L * 0.048;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(kx, ky);
      g.stroke();
      g.lineWidth = L * 0.032;
      g.beginPath();
      g.moveTo(kx, ky);
      g.lineTo(fx, fy);
      g.stroke();
      // Tarsus: a short kink at the tip, which is what makes a leg read as jointed.
      g.lineWidth = L * 0.02;
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx + Math.cos(a + s * 0.9) * len * 0.16, fy + Math.sin(a + s * 0.9) * len * 0.16);
      g.stroke();
    }
  }

  // ── Cerci: the two rear spurs. Small, but very roach.
  g.strokeStyle = pal.leg;
  g.lineWidth = L * 0.03;
  for (let s = -1; s <= 1; s += 2) {
    g.beginPath();
    g.moveTo(-L * 0.5, s * hw * 0.28);
    g.lineTo(-L * 0.66, s * hw * 0.62);
    g.stroke();
  }

  // ── Wing case.
  const shell = g.createLinearGradient(0, -hw, 0, hw);
  if (dead) {
    // Belly-up: pale segmented underside.
    shell.addColorStop(0, pal.spec);
    shell.addColorStop(0.5, pal.bodyHi);
    shell.addColorStop(1, pal.bodyLo);
  } else {
    shell.addColorStop(0, pal.shellHi);
    shell.addColorStop(0.42, pal.shell);
    shell.addColorStop(1, pal.rim);
  }
  g.fillStyle = shell;
  wingCasePath(g, L, hw);
  g.fill();

  // Central seam where the two wing covers meet.
  g.strokeStyle = rgba(pal.rim, dead ? 0.35 : 0.62);
  g.lineWidth = L * 0.022;
  g.beginPath();
  g.moveTo(L * 0.3, 0);
  g.lineTo(-L * 0.52, 0);
  g.stroke();

  // Abdominal segment ridges, faint, following the taper.
  g.strokeStyle = rgba(pal.rim, dead ? 0.5 : 0.22);
  g.lineWidth = L * 0.016;
  for (let i = 0; i < 5; i++) {
    const x = -L * (0.08 + i * 0.09);
    const t = 1 - (i + 1) / 6.5;
    g.beginPath();
    g.moveTo(x, -hw * 0.92 * t);
    g.quadraticCurveTo(x - L * 0.03, 0, x, hw * 0.92 * t);
    g.stroke();
  }

  if (!dead) {
    // Long specular streak down the wing case — chitin, not plastic.
    g.save();
    wingCasePath(g, L, hw);
    g.clip();
    const spec = g.createLinearGradient(0, -hw, 0, 0);
    spec.addColorStop(0, rgba(pal.spec, 0));
    spec.addColorStop(0.55, rgba(pal.spec, 0.34));
    spec.addColorStop(1, rgba(pal.spec, 0));
    g.fillStyle = spec;
    g.fillRect(-L * 0.6, -hw, L * 1.2, hw);
    g.restore();
  }

  // ── Pronotum: the wide shield over the thorax and most of the head.
  const pro = g.createLinearGradient(0, -hw, 0, hw);
  pro.addColorStop(0, dead ? pal.bodyHi : pal.shellHi);
  pro.addColorStop(0.4, pal.shell);
  pro.addColorStop(1, pal.rim);
  g.fillStyle = pro;
  ellipse(g, L * 0.29, 0, L * 0.18, hw * 1.02);
  g.fill();
  g.strokeStyle = rgba(pal.rim, 0.85);
  g.lineWidth = L * 0.024;
  ellipse(g, L * 0.29, 0, L * 0.18, hw * 1.02);
  g.stroke();

  if (!dead) {
    g.fillStyle = rgba(pal.spec, 0.42);
    ellipse(g, L * 0.3, -hw * 0.4, L * 0.12, hw * 0.22, -0.1);
    g.fill();
  }

  // ── Head, mostly tucked under the shield.
  g.fillStyle = pal.head;
  ellipse(g, L * 0.44, 0, L * 0.085, hw * 0.62);
  g.fill();
  g.fillStyle = rgba(pal.rim, 0.95);
  for (let s = -1; s <= 1; s += 2) {
    ellipse(g, L * 0.47, s * hw * 0.34, L * 0.026, hw * 0.16);
    g.fill();
  }

  // ── Dark rim last, so the silhouette survives on lit tile.
  g.strokeStyle = rgba(pal.rim, 0.92);
  g.lineWidth = L * 0.028;
  wingCasePath(g, L, hw);
  g.stroke();
}

function buildRoachAtlas(): HTMLCanvasElement {
  const cols = GAIT_FRAMES + 1;
  const rows = 5;
  const c = makeCanvas(cols * CELL, rows * CELL);
  const g = ctx2d(c);
  // Rows 1, 3 and 4 are the same worker at three colourings and three body lengths, so a column of
  // roaches is never the same animal repeated.
  const pals = [SCOUT_PAL, WORKER_PAL, NYMPH_PAL, WORKER_PAL_DARK, WORKER_PAL_PALE];
  const lengths = [26, 20, 13, 22, 18].map((v) => v * ATLAS_SCALE);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      g.save();
      g.translate(col * CELL + CELL / 2, row * CELL + CELL / 2);
      drawRoachBody(g, lengths[row], (col / GAIT_FRAMES) * TAU, pals[row], col === DEAD_FRAME);
      g.restore();
    }
  }
  return c;
}

function buildGlow(size: number, hex: string, power = 2.2, core = 1): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    grad.addColorStop(t, rgba(hex, core * Math.pow(1 - t, power)));
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/**
 * Seamless ceramic floor: a 2×2 block of individually mottled 320-unit tiles, generated at 2×.
 *
 * Four distinct tiles in one repeating pattern is what stops a huge floor from showing an obvious
 * grid of identical stamps — the repeat period becomes 640 world units, which is wider than the
 * viewport at play zoom.
 */
function buildFloorTile(seed: number): HTMLCanvasElement {
  const T = 320 * ATLAS_SCALE;
  const S = T * 2;
  const c = makeCanvas(S, S);
  const g = ctx2d(c);

  g.fillStyle = '#39485a';
  g.fillRect(0, 0, S, S);

  // Low-frequency mottling — ceramic is never flat. Each quadrant gets its own noise offset.
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    const qy = y < T ? 0 : 1;
    for (let x = 0; x < S; x++) {
      const qx = x < T ? 0 : 1;
      const qs = seed + (qy * 2 + qx) * 7919;
      const lx = x % T;
      const ly = y % T;
      const n = fbm2D(lx / 52, ly / 52, qs, 4);
      const n2 = fbm2D(lx / 9, ly / 9, qs + 991, 2);
      const grain = fbm2D(x / 1.7, y / 1.7, qs + 313, 1);
      const v = (n - 0.5) * 40 + (n2 - 0.5) * 13 + (grain - 0.5) * 6;
      const i = (y * S + x) * 4;
      d[i] = Math.max(0, Math.min(255, d[i] + v * 0.92));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v * 1.12));
    }
  }
  g.putImageData(img, 0, 0);

  // Per-tile specular sweep: the wide soft glare that makes glazed ceramic read as ceramic.
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      const ox = tx * T;
      const oy = ty * T;
      const flip = (tx + ty) % 2 === 0;
      const sweep = g.createLinearGradient(ox + (flip ? 0 : T), oy, ox + (flip ? T : 0), oy + T);
      sweep.addColorStop(0, 'rgba(226,240,255,0.115)');
      sweep.addColorStop(0.38, 'rgba(226,240,255,0.03)');
      sweep.addColorStop(0.72, 'rgba(0,0,0,0.035)');
      sweep.addColorStop(1, 'rgba(0,0,0,0.085)');
      g.fillStyle = sweep;
      g.fillRect(ox, oy, T, T);
    }
  }

  // Grout: a recessed channel on the leading edges of every tile, so the block stays seamless.
  const gw = 14 * ATLAS_SCALE;
  g.fillStyle = '#1b242c';
  for (let i = 0; i < 2; i++) {
    g.fillRect(0, i * T, S, gw);
    g.fillRect(i * T, 0, gw, S);
  }
  g.fillStyle = 'rgba(226,240,255,0.10)';
  for (let i = 0; i < 2; i++) {
    g.fillRect(0, i * T + gw, S, 2);
    g.fillRect(i * T + gw, 0, 2, S);
  }
  g.fillStyle = 'rgba(0,0,0,0.42)';
  for (let i = 0; i < 2; i++) {
    g.fillRect(0, i * T + gw - 3, S, 3);
    g.fillRect(i * T + gw - 3, 0, 3, S);
  }

  return c;
}

function buildMaterial(kind: string, seed: number): HTMLCanvasElement {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = ctx2d(c);
  const rng = new Rng(seed);

  if (kind === 'steel' || kind === 'metal') {
    g.fillStyle = kind === 'steel' ? '#2c363f' : '#333c44';
    g.fillRect(0, 0, S, S);
    // Horizontal brushed streaks.
    for (let i = 0; i < 520; i++) {
      const y = rng.range(0, S);
      const a = rng.range(0.015, 0.075);
      g.strokeStyle = rng.bool(0.5) ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.3})`;
      g.lineWidth = rng.range(0.5, 2.2);
      g.beginPath();
      g.moveTo(rng.range(-40, S), y);
      g.lineTo(rng.range(0, S + 40), y + rng.range(-0.6, 0.6));
      g.stroke();
    }
  } else if (kind === 'plastic') {
    g.fillStyle = '#2f3a34';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${rng.range(0.01, 0.05)})`;
      g.fillRect(rng.range(0, S), rng.range(0, S), rng.range(1, 3), rng.range(1, 3));
    }
  } else if (kind === 'wall') {
    g.fillStyle = '#1d262e';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 420; i++) {
      g.fillStyle = `rgba(255,255,255,${rng.range(0.006, 0.03)})`;
      g.fillRect(rng.range(0, S), rng.range(0, S), rng.range(1, 4), rng.range(1, 2));
    }
  } else {
    // Painted MDF: faint vertical brush noise.
    g.fillStyle = '#26323c';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 340; i++) {
      const x = rng.range(0, S);
      const a = rng.range(0.008, 0.045);
      g.strokeStyle = rng.bool(0.55) ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      g.lineWidth = rng.range(0.6, 2.6);
      g.beginPath();
      g.moveTo(x, rng.range(-30, S));
      g.lineTo(x + rng.range(-0.8, 0.8), rng.range(0, S + 30));
      g.stroke();
    }
  }
  return c;
}

/**
 * Baked floor debris: crumbs, scratches, water rings and grease. Kept under 6 % contrast so it can
 * never compete with a hazard decal (ART_BIBLE clutter rules).
 */
function buildDebris(worldW: number, worldH: number, seed: number): HTMLCanvasElement {
  const scale = 0.4;
  const c = makeCanvas(worldW * scale, worldH * scale);
  const g = ctx2d(c);
  const rng = new Rng(seed ^ 0x51ed);
  const W = c.width;
  const H = c.height;

  for (let i = 0; i < 1500; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    const r = rng.range(0.4, 2.3);
    g.fillStyle = `rgba(${rng.bool(0.5) ? '255,240,210' : '8,12,16'},${rng.range(0.05, 0.14)})`;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  for (let i = 0; i < 340; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    const len = rng.range(4, 30);
    const a = rng.range(0, TAU);
    g.strokeStyle = `rgba(226,240,255,${rng.range(0.03, 0.08)})`;
    g.lineWidth = rng.range(0.4, 1.1);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    const r = rng.range(8, 38);
    g.strokeStyle = `rgba(150,182,205,${rng.range(0.05, 0.1)})`;
    g.lineWidth = rng.range(0.8, 2);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
    g.fillStyle = `rgba(120,150,170,0.028)`;
    g.fill();
  }
  for (let i = 0; i < 40; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    const r = rng.range(16, 64);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(64,42,16,0.12)');
    grad.addColorStop(1, 'rgba(64,42,16,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  return c;
}

/** The human sole: a hard silhouette with a bright rim. Drawn once, blitted with rotation. */
function buildFoot(): HTMLCanvasElement {
  const W = 340;
  const H = 700;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);

  const path = new Path2D();
  path.moveTo(W * 0.5, H * 0.02);
  path.bezierCurveTo(W * 0.94, H * 0.08, W * 0.98, H * 0.34, W * 0.86, H * 0.46);
  path.bezierCurveTo(W * 0.78, H * 0.56, W * 0.74, H * 0.66, W * 0.8, H * 0.78);
  path.bezierCurveTo(W * 0.88, H * 0.94, W * 0.6, H * 1.0, W * 0.46, H * 0.96);
  path.bezierCurveTo(W * 0.24, H * 0.9, W * 0.2, H * 0.74, W * 0.26, H * 0.6);
  path.bezierCurveTo(W * 0.32, H * 0.46, W * 0.1, H * 0.36, W * 0.12, H * 0.24);
  path.bezierCurveTo(W * 0.16, H * 0.08, W * 0.3, H * 0.0, W * 0.5, H * 0.02);
  path.closePath();

  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0a0d12');
  grad.addColorStop(0.5, '#05070b');
  grad.addColorStop(1, '#020305');
  g.fillStyle = grad;
  g.fill(path);

  g.strokeStyle = 'rgba(200,220,255,0.22)';
  g.lineWidth = 5;
  g.stroke(path);

  // Tread suggestion — enough to read as a shoe, never enough to read as a character.
  g.save();
  g.clip(path);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 7;
  for (let i = 0; i < 9; i++) {
    const y = H * (0.1 + i * 0.09);
    g.beginPath();
    g.moveTo(W * 0.1, y);
    g.lineTo(W * 0.92, y + 12);
    g.stroke();
  }
  g.restore();
  return c;
}

export function buildAtlas(worldW: number, worldH: number, seed: number): Atlas {
  const t0 = performance.now();
  const atlas: Atlas = {
    roach: buildRoachAtlas(),
    glows: TINT_COLORS.map((hex) => buildGlow(64, hex, 2.2, 1)),
    dust: buildGlow(48, '#b8c8d8', 1.5, 0.8),
    spark: buildGlow(32, '#ffe0b0', 3.2, 1),
    floor: buildFloorTile(seed),
    debris: buildDebris(worldW, worldH, seed),
    materials: {
      cabinet: buildMaterial('cabinet', seed + 11),
      steel: buildMaterial('steel', seed + 23),
      wall: buildMaterial('wall', seed + 37),
      plastic: buildMaterial('plastic', seed + 41),
      metal: buildMaterial('metal', seed + 53),
    },
    foot: buildFoot(),
    buildMs: 0,
  };
  atlas.buildMs = Math.round((performance.now() - t0) * 100) / 100;
  return atlas;
}

export const ATLAS_PALETTE = PAL;

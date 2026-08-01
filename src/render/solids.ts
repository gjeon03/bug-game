import { Rng } from '../core/rng.ts';
import { SOLIDS } from '../sim/kitchen.ts';
import type { Solid } from '../sim/types.ts';
import { makeCanvas, type Atlas } from './atlas.ts';

export interface BakedSolid {
  solid: Solid;
  canvas: HTMLCanvasElement;
  /** World-space offset of the baked canvas's top-left, including the shadow margin. */
  ox: number;
  oy: number;
}

/** Shadow bleed around each solid, in world units. */
const MARGIN = 54;

/**
 * Cabinetry and appliances are static, so each one is rendered once into its own canvas — material
 * noise, thickness edges, toe-kick occlusion and contact shadow included — and blitted afterwards.
 * That keeps the per-frame cost at one `drawImage` per visible solid while preserving crisp edges,
 * which matter because the architecture is what sells the insect scale.
 */
export function bakeSolids(atlas: Atlas, seed: number): BakedSolid[] {
  const out: BakedSolid[] = [];
  const rng = new Rng(seed ^ 0x2b17);

  for (const solid of SOLIDS) {
    const w = solid.w + MARGIN * 2;
    const h = solid.h + MARGIN * 2;
    const canvas = makeCanvas(w, h);
    const g = canvas.getContext('2d');
    if (!g) continue;
    const x = MARGIN;
    const y = MARGIN;
    const sw = solid.w;
    const sh = solid.h;

    // ── Contact shadow. Light reads as coming from above-left, so the shadow falls down-right.
    g.save();
    const shadow = g.createLinearGradient(0, y + sh, 0, y + sh + MARGIN);
    shadow.addColorStop(0, 'rgba(0,0,0,0.62)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shadow;
    g.fillRect(x - 12, y + sh, sw + MARGIN, MARGIN);
    const shadowR = g.createLinearGradient(x + sw, 0, x + sw + MARGIN, 0);
    shadowR.addColorStop(0, 'rgba(0,0,0,0.5)');
    shadowR.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shadowR;
    g.fillRect(x + sw, y - 10, MARGIN, sh + MARGIN * 0.6);
    g.restore();

    // ── Body: base value then a tiled material pattern.
    // Cabinetry and appliances sit a clear step BELOW the floor in value: they are vertical faces in
    // a top-lit room, and that separation is what makes the kitchen read as architecture rather than
    // as a flat tile pattern.
    // Material values are spread far wider than they were. The old set spanned 17/255 and was then
    // multiplied by 0.49 in the lighting composite, so five values of grey were all that separated a
    // dishwasher from a pantry — measured, and the reason every fixture read as the same rectangle.
    const base =
      solid.mat === 'steel'
        ? '#39454f'
        : solid.mat === 'wall'
          ? '#141b22'
          : solid.mat === 'plastic'
            ? '#2c3a33'
            : solid.mat === 'metal'
              ? '#4a545c'
              : '#1c252e';
    g.fillStyle = base;
    g.fillRect(x, y, sw, sh);

    const mat = atlas.materials[solid.mat] ?? atlas.materials.cabinet;
    const pattern = g.createPattern(mat, 'repeat');
    if (pattern) {
      g.save();
      g.translate(x, y);
      g.fillStyle = pattern;
      g.globalAlpha = 0.92;
      g.fillRect(0, 0, sw, sh);
      g.restore();
      g.globalAlpha = 1;
    }

    // Broad form shading: brighter at the top-left, sinking toward the bottom-right.
    const form = g.createLinearGradient(x, y, x + sw * 0.4, y + sh);
    form.addColorStop(0, 'rgba(255,255,255,0.07)');
    form.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    form.addColorStop(1, 'rgba(0,0,0,0.30)');
    g.fillStyle = form;
    g.fillRect(x, y, sw, sh);

    if ((solid.mat === 'steel' || solid.mat === 'metal') && Math.min(sw, sh) >= 200) {
      // Anisotropic highlight band — the appliance read.
      const band = g.createLinearGradient(0, y, 0, y + sh);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.26, 'rgba(220,238,255,0.10)');
      band.addColorStop(0.34, 'rgba(220,238,255,0.03)');
      band.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = band;
      g.fillRect(x, y, sw, sh);
    }

    // ── Thickness: a bright top lip and a deep bottom shadow. The lip is the strongest single cue
    // that these are solid volumes standing on the floor.
    // Scale the lip with the object: a 4 px bright edge that reads as "thickness" on a 1200-unit
    // counter run reads as a pane of backlit glass on an 84-unit chair leg.
    const small = Math.min(sw, sh) < 200;
    const lipAlpha = small ? 0.2 : 0.42;
    const crownDepth = small ? Math.min(10, sh * 0.16) : 30;
    g.fillStyle = `rgba(206,228,252,${lipAlpha})`;
    g.fillRect(x, y - (small ? 1 : 2), sw, small ? 2 : 4);
    g.fillStyle = `rgba(206,228,252,${lipAlpha * 0.38})`;
    g.fillRect(x, y, small ? 2 : 3, sh);
    const crown = g.createLinearGradient(0, y, 0, y + crownDepth);
    crown.addColorStop(0, `rgba(190,216,246,${small ? 0.08 : 0.16})`);
    crown.addColorStop(1, 'rgba(190,216,246,0)');
    g.fillStyle = crown;
    g.fillRect(x, y, sw, crownDepth);

    const lip = g.createLinearGradient(0, y + sh - 26, 0, y + sh);
    lip.addColorStop(0, 'rgba(0,0,0,0)');
    lip.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = lip;
    g.fillRect(x, y + sh - 26, sw, 26);

    // ── Toe-kick: the dark recess a roach can actually hide in. Only on floor-standing furniture.
    if (solid.mat !== 'wall' && sh > 200) {
      const kick = g.createLinearGradient(0, y + sh - 34, 0, y + sh);
      kick.addColorStop(0, 'rgba(0,0,0,0.15)');
      kick.addColorStop(0.45, 'rgba(0,0,0,0.85)');
      kick.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = kick;
      g.fillRect(x + 6, y + sh - 34, sw - 12, 34);
    }

    // ── Cabinet door seams: the only detail that gives the run its scale rhythm.
    if (solid.mat === 'cabinet' && sw > 300) {
      const doors = Math.max(2, Math.round(sw / 420));
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 3;
      for (let i = 1; i < doors; i++) {
        const dx = x + (sw / doors) * i;
        g.beginPath();
        g.moveTo(dx, y + 8);
        g.lineTo(dx, y + sh - 12);
        g.stroke();
      }
      g.strokeStyle = 'rgba(200,220,240,0.07)';
      g.lineWidth = 1.5;
      for (let i = 1; i < doors; i++) {
        const dx = x + (sw / doors) * i + 2.5;
        g.beginPath();
        g.moveTo(dx, y + 8);
        g.lineTo(dx, y + sh - 12);
        g.stroke();
      }
    }

    // ── Edge wear: a few bright nicks so the silhouette is not a perfect rectangle.
    g.fillStyle = 'rgba(210,228,248,0.13)';
    for (let i = 0; i < 14; i++) {
      const ex = x + rng.range(0, sw);
      g.fillRect(ex, y - 1, rng.range(3, 14), 2);
    }

    drawFixture(g, solid, x, y, sw, sh, rng);

    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, sw - 2, sh - 2);

    out.push({ solid, canvas, ox: solid.x - MARGIN, oy: solid.y - MARGIN });
  }

  return out;
}

/* ── Fixture detail ─────────────────────────────────────────────────────────
 *
 * This is what turns 26 rectangles into a kitchen. Each role draws the features that identify the
 * object — a basin and a tap, burners and knobs, a fridge seam and a handle — on the side that faces
 * the room. It costs nothing at runtime because every solid is baked once at boot.
 *
 * Nothing here is a floating label. If the player cannot tell what a fixture is by looking at it,
 * this function is where that is fixed.
 */

const STEEL_HI = 'rgba(214,232,250,0.30)';
const STEEL_LO = 'rgba(0,0,0,0.50)';

function rr(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

/** A recessed door panel with a bevel, the basic unit of every cabinet run. */
function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = 'rgba(0,0,0,0.26)';
  rr(g, x, y, w, h, 10);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 3;
  g.stroke();
  g.strokeStyle = 'rgba(196,220,246,0.13)';
  g.lineWidth = 2;
  rr(g, x + 3, y + 3, w - 6, h - 6, 8);
  g.stroke();
}

function handleBar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = 'rgba(0,0,0,0.55)';
  rr(g, x + 2, y + 3, w, h, h / 2);
  g.fill();
  g.fillStyle = 'rgba(222,238,255,0.62)';
  rr(g, x, y, w, h, h / 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  rr(g, x + 2, y + 1, w - 4, Math.max(1, h * 0.3), h * 0.2);
  g.fill();
}

function drawFixture(
  g: CanvasRenderingContext2D,
  solid: Solid,
  x: number,
  y: number,
  sw: number,
  sh: number,
  rng: Rng,
): void {
  const role = solid.role;
  if (!role || role === 'wall') return;
  const face = solid.facing ?? 'down';

  switch (role) {
    case 'sink': {
      // Basin, tap, and the U-bend shadow under it. The basin is inset from the room-facing edge so
      // the counter lip stays readable as a horizontal surface.
      const bx = x + sw * 0.14;
      const by = y + sh * 0.16;
      const bw = sw * 0.66;
      const bh = sh * 0.44;
      g.fillStyle = 'rgba(10,16,22,0.72)';
      rr(g, bx, by, bw, bh, 26);
      g.fill();
      g.strokeStyle = STEEL_HI;
      g.lineWidth = 5;
      rr(g, bx, by, bw, bh, 26);
      g.stroke();
      // Drain.
      g.fillStyle = 'rgba(0,0,0,0.85)';
      g.beginPath();
      g.arc(bx + bw * 0.5, by + bh * 0.62, 22, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(190,214,240,0.4)';
      g.lineWidth = 3;
      g.stroke();
      // Tap: a column and a swan neck reaching over the basin.
      const tx = bx + bw * 0.5;
      const ty = by - 34;
      g.strokeStyle = 'rgba(214,232,250,0.55)';
      g.lineWidth = 13;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + 40, ty + 6, tx + 44, by + 34);
      g.stroke();
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.stroke();
      g.lineCap = 'butt';
      // Cupboard doors below the basin, on the room side.
      panel(g, x + 16, y + sh * 0.66, sw * 0.42, sh * 0.26);
      panel(g, x + 26 + sw * 0.44, y + sh * 0.66, sw * 0.42, sh * 0.26);
      break;
    }

    case 'dishwasher': {
      // Control strip along the top, a full-width handle, and a door with a faint glass reflection.
      g.fillStyle = 'rgba(6,10,14,0.7)';
      g.fillRect(x + 12, y + 14, sw - 24, 40);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i === 1 ? 'rgba(150,220,255,0.75)' : 'rgba(190,210,230,0.30)';
        g.beginPath();
        g.arc(x + 46 + i * 46, y + 34, 7, 0, Math.PI * 2);
        g.fill();
      }
      handleBar(g, x + 14, y + 72, sw - 28, 20);
      g.fillStyle = 'rgba(190,220,250,0.05)';
      g.fillRect(x + 18, y + 108, sw - 36, sh - 150);
      g.strokeStyle = STEEL_LO;
      g.lineWidth = 3;
      g.strokeRect(x + 18, y + 108, sw - 36, sh - 150);
      break;
    }

    case 'stove': {
      // Four burners on the hob, knobs along the room-facing edge, oven door with a glass window.
      const cx = x + sw * 0.5;
      const cy = y + sh * 0.34;
      const rx = sw * 0.24;
      const ry = sh * 0.19;
      for (let i = 0; i < 4; i++) {
        const bxp = cx + (i % 2 === 0 ? -rx : rx);
        const byp = cy + (i < 2 ? -ry : ry);
        const rad = i < 2 ? 62 : 52;
        g.fillStyle = 'rgba(6,9,12,0.9)';
        g.beginPath();
        g.arc(bxp, byp, rad, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(150,168,186,0.55)';
        g.lineWidth = 6;
        g.beginPath();
        g.arc(bxp, byp, rad * 0.74, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(120,138,156,0.4)';
        g.beginPath();
        g.arc(bxp, byp, rad * 0.4, 0, Math.PI * 2);
        g.stroke();
      }
      // Oven door: dark glass with a warm interior line and a rail handle.
      const oy = y + sh - 128;
      g.fillStyle = 'rgba(4,6,9,0.86)';
      rr(g, x + 40, oy, sw - 80, 74, 12);
      g.fill();
      const glow = g.createLinearGradient(0, oy, 0, oy + 74);
      glow.addColorStop(0, 'rgba(255,168,90,0.16)');
      glow.addColorStop(1, 'rgba(255,120,40,0.03)');
      g.fillStyle = glow;
      rr(g, x + 46, oy + 6, sw - 92, 62, 10);
      g.fill();
      handleBar(g, x + 34, oy - 30, sw - 68, 18);
      // Knobs.
      for (let i = 0; i < 4; i++) {
        const kx = x + 90 + i * ((sw - 180) / 3);
        g.fillStyle = 'rgba(210,226,244,0.5)';
        g.beginPath();
        g.arc(kx, y + sh - 24, 17, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(kx, y + sh - 24);
        g.lineTo(kx + 11, y + sh - 32);
        g.stroke();
      }
      break;
    }

    case 'fridge': {
      // A door seam down the whole face, a long vertical handle beside it, the compressor grille at
      // the base, and a couple of magnets. The seam is where the light in this room comes from.
      const seam = x + sw * 0.06;
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(seam, y + 10);
      g.lineTo(seam, y + sh - 10);
      g.stroke();
      g.strokeStyle = 'rgba(255,214,150,0.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(seam + 6, y + 10);
      g.lineTo(seam + 6, y + sh - 10);
      g.stroke();
      handleBar(g, seam + 26, y + sh * 0.24, 20, sh * 0.42);
      // Compressor grille along the bottom.
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x + sw * 0.34, y + sh - 54, sw * 0.52, 40);
      g.strokeStyle = 'rgba(180,200,220,0.22)';
      g.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const gy = y + sh - 50 + i * 5;
        g.beginPath();
        g.moveTo(x + sw * 0.35, gy);
        g.lineTo(x + sw * 0.85, gy);
        g.stroke();
      }
      // Magnets — somebody lives here.
      const mags = [
        ['rgba(232,96,72,0.75)', 0.38, 0.3],
        ['rgba(120,190,240,0.7)', 0.55, 0.22],
        ['rgba(240,208,110,0.7)', 0.47, 0.46],
      ] as const;
      for (const [col, fx, fy] of mags) {
        g.fillStyle = col;
        rr(g, x + sw * fx, y + sh * fy, 34, 24, 5);
        g.fill();
      }
      // A note held under one of them.
      g.fillStyle = 'rgba(236,232,220,0.5)';
      g.fillRect(x + sw * 0.53, y + sh * 0.24 + 2, 70, 92);
      break;
    }

    case 'counter':
    case 'pantry':
    case 'island': {
      // Door panels with a bevel, cup handles, and a plinth line above the toe-kick.
      const vertical = face === 'left' || face === 'right';
      const runLen = vertical ? sh : sw;
      const doors = Math.max(2, Math.round(runLen / 380));
      const inset = 26;
      const depth = (vertical ? sw : sh) - inset * 2 - (role === 'island' ? 60 : 46);
      for (let i = 0; i < doors; i++) {
        const along = inset + (runLen - inset * 2) * (i / doors);
        const len = (runLen - inset * 2) / doors - 14;
        if (vertical) {
          panel(g, x + inset, y + along, depth, len);
          // Cup handle on the room-facing edge.
          handleBar(g, x + inset + depth - 30, y + along + len * 0.42, 22, 12);
        } else {
          panel(g, x + along, y + inset, len, depth);
          handleBar(g, x + along + len * 0.36, y + inset + depth - 26, len * 0.28, 12);
        }
      }
      // Plinth: the horizontal line that tells you the cabinet stands on the floor.
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 4;
      g.beginPath();
      if (face === 'down') {
        g.moveTo(x + 6, y + sh - 40);
        g.lineTo(x + sw - 6, y + sh - 40);
      } else {
        g.moveTo(x + sw - 40, y + 6);
        g.lineTo(x + sw - 40, y + sh - 6);
      }
      g.stroke();
      if (role === 'island') {
        // An island is a worktop with an overhang, not a wall cabinet: a bright counter lip all the
        // way round, a deeper shadow under the overhang, and two stool feet tucked beneath it. Three
        // fixtures shared this draw path and the island came out of it as an anonymous black slab.
        g.fillStyle = 'rgba(214,232,250,0.16)';
        g.fillRect(x - 10, y - 8, sw + 20, 14);
        g.fillStyle = 'rgba(0,0,0,0.42)';
        g.fillRect(x - 10, y + sh - 6, sw + 20, 22);
        g.strokeStyle = 'rgba(214,232,250,0.22)';
        g.lineWidth = 4;
        g.strokeRect(x - 8, y - 6, sw + 16, sh + 14);
        // A chopping board and a bowl left on the top — the island is where things get put down.
        g.fillStyle = 'rgba(150,116,72,0.5)';
        rr(g, x + sw * 0.14, y + sh * 0.3, 210, 140, 12);
        g.fill();
        g.strokeStyle = 'rgba(90,66,36,0.6)';
        g.lineWidth = 4;
        g.stroke();
        g.fillStyle = 'rgba(196,212,228,0.4)';
        g.beginPath();
        g.ellipse(x + sw * 0.62, y + sh * 0.44, 78, 62, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(20,28,36,0.6)';
        g.beginPath();
        g.ellipse(x + sw * 0.62, y + sh * 0.44, 58, 44, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (role === 'counter') {
        // A drawer bank at one end: the horizontal rhythm that separates a counter run from a
        // full-height pantry at a glance.
        const bank = Math.min(sw * 0.34, 340);
        for (let i = 0; i < 3; i++) {
          const dy = y + 30 + i * ((sh - 90) / 3);
          panel(g, x + 20, dy, bank, (sh - 100) / 3 - 8);
          handleBar(g, x + 20 + bank * 0.3, dy + (sh - 100) / 6 - 6, bank * 0.4, 11);
        }
      }
      if (role === 'pantry') {
        // A shelf edge visible through a gapped door — the pantry's tell.
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(x + sw - 54, y + 60, 26, sh - 120);
        g.fillStyle = 'rgba(180,160,120,0.30)';
        for (let i = 0; i < 3; i++) g.fillRect(x + sw - 52, y + 90 + i * ((sh - 160) / 3), 22, 8);
      }
      break;
    }

    case 'bin': {
      // Lid seam, pedal, and moulded ribs. A bin is a plastic box; the ribs are what say so.
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x + 10, y + 46);
      g.lineTo(x + sw - 10, y + 46);
      g.stroke();
      g.strokeStyle = 'rgba(190,214,236,0.16)';
      g.lineWidth = 3;
      for (let i = 1; i < 5; i++) {
        const ry2 = y + 46 + ((sh - 90) / 5) * i;
        g.beginPath();
        g.moveTo(x + 20, ry2);
        g.lineTo(x + sw - 20, ry2);
        g.stroke();
      }
      // Pedal on the room side.
      g.fillStyle = 'rgba(180,200,220,0.4)';
      rr(g, x - 6, y + sh - 52, 42, 18, 6);
      g.fill();
      break;
    }

    case 'radiator': {
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 8;
      const fins = Math.floor(sh / 46);
      for (let i = 0; i < fins; i++) {
        const fy = y + 16 + i * 46;
        g.beginPath();
        g.moveTo(x + 8, fy);
        g.lineTo(x + sw - 8, fy);
        g.stroke();
      }
      g.strokeStyle = 'rgba(214,232,250,0.16)';
      g.lineWidth = 3;
      for (let i = 0; i < fins; i++) {
        const fy = y + 21 + i * 46;
        g.beginPath();
        g.moveTo(x + 8, fy);
        g.lineTo(x + sw - 8, fy);
        g.stroke();
      }
      break;
    }

    case 'pipe': {
      const grad = g.createLinearGradient(x, 0, x + sw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.5)');
      grad.addColorStop(0.34, 'rgba(226,240,255,0.34)');
      grad.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = grad;
      g.fillRect(x, y, sw, sh);
      g.fillStyle = 'rgba(200,220,240,0.22)';
      g.fillRect(x - 6, y + sh * 0.2, sw + 12, 22);
      g.fillRect(x - 6, y + sh * 0.72, sw + 12, 22);
      break;
    }

    case 'tableLeg':
    case 'chairLeg': {
      // Round the silhouette so a leg reads as a turned post, not a cube, and give it a foot.
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.ellipse(x + sw / 2, y + sh * 0.86, sw * 0.52, sh * 0.2, 0, 0, Math.PI * 2);
      g.fill();
      const grad = g.createLinearGradient(x, 0, x + sw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.4)');
      grad.addColorStop(0.35, 'rgba(210,226,246,0.22)');
      grad.addColorStop(1, 'rgba(0,0,0,0.4)');
      g.fillStyle = grad;
      g.fillRect(x, y, sw, sh);
      break;
    }

    case 'box': {
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x + sw * 0.5, y + 6);
      g.lineTo(x + sw * 0.5, y + sh - 6);
      g.stroke();
      g.fillStyle = 'rgba(224,206,164,0.22)';
      g.fillRect(x + sw * 0.2, y + sh * 0.3, sw * 0.26, 16);
      break;
    }

    default:
      break;
  }
  void rng;
}

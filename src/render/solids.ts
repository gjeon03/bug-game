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
    const base =
      solid.mat === 'steel'
        ? '#232c34'
        : solid.mat === 'wall'
          ? '#151c23'
          : solid.mat === 'plastic'
            ? '#212a26'
            : solid.mat === 'metal'
              ? '#262e35'
              : '#1a222a';
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

    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, sw - 2, sh - 2);

    out.push({ solid, canvas, ox: solid.x - MARGIN, oy: solid.y - MARGIN });
  }

  return out;
}

import { PROPS } from '../sim/kitchen.ts';
import type { Prop } from '../sim/types.ts';
import { makeCanvas } from './atlas.ts';

/**
 * Scenery rendering.
 *
 * The measured gap in the old kitchen was the 30–300 world-unit band: everything was either a crumb
 * too small to see or a 700-unit appliance, so nothing in the frame told the player how big a
 * cockroach is. These props fill that band.
 *
 * Every prop is baked once into its own small canvas — including its contact shadow — and blitted.
 * Props with `lift` are drawn *after* the roaches as foreground occluders, so the colony visibly
 * passes underneath them. That is the only real depth cue a top-down game gets for free.
 */

export interface BakedProp {
  prop: Prop;
  canvas: HTMLCanvasElement;
  ox: number;
  oy: number;
  /** True when this prop draws over entities rather than under them. */
  foreground: boolean;
}

const PAD = 30;

export function bakeProps(): BakedProp[] {
  const out: BakedProp[] = [];
  for (const prop of PROPS) {
    const w = Math.ceil(prop.w) + PAD * 2;
    const h = Math.ceil(prop.h) + PAD * 2;
    const canvas = makeCanvas(w, h);
    const g = canvas.getContext('2d');
    if (!g) continue;
    g.translate(w / 2, h / 2);
    g.rotate(prop.rot);
    const lift = prop.lift ?? 0;
    if (lift > 0) {
      // Anything standing off the floor casts a real shadow, offset by its height. This is what
      // makes a slipper read as a slipper rather than as a decal.
      g.save();
      g.filter = 'blur(6px)';
      g.fillStyle = `rgba(0,0,0,${Math.min(0.55, 0.2 + lift * 0.008)})`;
      g.beginPath();
      g.ellipse(lift * 0.28, lift * 0.34, prop.w * 0.5, prop.h * 0.44, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    drawProp(g, prop);
    out.push({
      prop,
      canvas,
      ox: prop.x - w / 2,
      oy: prop.y - h / 2,
      foreground: lift >= 16,
    });
  }
  return out;
}

const TAU = Math.PI * 2;

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

/** Deterministic per-prop jitter: identical kinds must not stamp identically. */
function noise(prop: Prop, i: number): number {
  const n = Math.sin((prop.x + i * 37.1) * 0.0173 + (prop.y + i * 11.7) * 0.0219) * 43758.5453;
  return n - Math.floor(n);
}

function drawProp(g: CanvasRenderingContext2D, p: Prop): void {
  const w = p.w;
  const h = p.h;
  const hw = w / 2;
  const hh = h / 2;

  switch (p.kind) {
    case 'pipeElbow': {
      // The U-bend under the sink. Chrome, with the dark gap behind it a roach can hide in.
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 30;
      g.beginPath();
      g.moveTo(-hw * 0.5, -hh);
      g.lineTo(-hw * 0.5, hh * 0.2);
      g.quadraticCurveTo(-hw * 0.5, hh, hw * 0.2, hh * 0.72);
      g.stroke();
      const grad = g.createLinearGradient(-hw, 0, hw, 0);
      grad.addColorStop(0, 'rgba(120,140,160,0.55)');
      grad.addColorStop(0.4, 'rgba(232,244,255,0.75)');
      grad.addColorStop(1, 'rgba(96,114,132,0.5)');
      g.strokeStyle = grad;
      g.lineWidth = 22;
      g.beginPath();
      g.moveTo(-hw * 0.5, -hh);
      g.lineTo(-hw * 0.5, hh * 0.2);
      g.quadraticCurveTo(-hw * 0.5, hh, hw * 0.2, hh * 0.72);
      g.stroke();
      // Collar rings.
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 26;
      g.beginPath();
      g.moveTo(-hw * 0.5, -hh * 0.5);
      g.lineTo(-hw * 0.5, -hh * 0.36);
      g.stroke();
      g.lineCap = 'butt';
      break;
    }

    case 'drainGrate': {
      g.fillStyle = 'rgba(6,10,14,0.85)';
      g.beginPath();
      g.arc(0, 0, hw, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(190,214,238,0.55)';
      g.lineWidth = 5;
      g.stroke();
      g.strokeStyle = 'rgba(150,176,200,0.5)';
      g.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        g.beginPath();
        g.moveTo(Math.cos(a) * hw * 0.7, Math.sin(a) * hw * 0.7);
        g.lineTo(-Math.cos(a) * hw * 0.7, -Math.sin(a) * hw * 0.7);
        g.stroke();
      }
      break;
    }

    case 'sponge': {
      g.fillStyle = 'rgba(196,208,96,0.75)';
      rr(g, -hw, -hh, w, h, 8);
      g.fill();
      g.fillStyle = 'rgba(120,150,180,0.6)';
      rr(g, -hw, -hh, w, h * 0.4, 8);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.28)';
      for (let i = 0; i < 22; i++) {
        g.beginPath();
        g.arc(-hw + noise(p, i) * w, -hh + noise(p, i + 40) * h, 2.2, 0, TAU);
        g.fill();
      }
      break;
    }

    case 'bottle': {
      g.fillStyle = 'rgba(70,120,160,0.72)';
      rr(g, -hw * 0.7, -hh * 0.5, w * 0.7, h * 0.9, 10);
      g.fill();
      g.fillStyle = 'rgba(180,220,250,0.3)';
      rr(g, -hw * 0.5, -hh * 0.4, w * 0.16, h * 0.7, 5);
      g.fill();
      g.fillStyle = 'rgba(230,236,240,0.8)';
      rr(g, -hw * 0.32, -hh, w * 0.34, h * 0.22, 5);
      g.fill();
      g.fillStyle = 'rgba(240,244,248,0.55)';
      rr(g, -hw * 0.6, -hh * 0.06, w * 0.5, h * 0.3, 3);
      g.fill();
      break;
    }

    case 'dishTowel': {
      // A cloth is a soft silhouette with folds — the only non-rectangular thing on the counter.
      g.fillStyle = 'rgba(150,168,186,0.55)';
      g.beginPath();
      g.moveTo(-hw, -hh * 0.6);
      g.quadraticCurveTo(-hw * 0.3, -hh, hw * 0.2, -hh * 0.5);
      g.quadraticCurveTo(hw, -hh * 0.2, hw * 0.85, hh * 0.5);
      g.quadraticCurveTo(0, hh, -hw * 0.8, hh * 0.6);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.32)';
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-hw * 0.8 + i * hw * 0.5, -hh * 0.4);
        g.quadraticCurveTo(-hw * 0.5 + i * hw * 0.5, 0, -hw * 0.7 + i * hw * 0.5, hh * 0.55);
        g.stroke();
      }
      break;
    }

    case 'plate': {
      g.fillStyle = 'rgba(214,224,232,0.5)';
      g.beginPath();
      g.arc(0, 0, hw, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.42)';
      g.lineWidth = 4;
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, hw * 0.62, 0, TAU);
      g.stroke();
      // Something was on it.
      g.fillStyle = 'rgba(140,104,54,0.4)';
      g.beginPath();
      g.ellipse(hw * 0.2, -hh * 0.14, hw * 0.28, hh * 0.18, 0.5, 0, TAU);
      g.fill();
      break;
    }

    case 'mug': {
      g.fillStyle = 'rgba(198,210,222,0.55)';
      g.beginPath();
      g.arc(0, 0, hw * 0.78, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(198,210,222,0.6)';
      g.lineWidth = 8;
      g.beginPath();
      g.arc(hw * 0.86, 0, hw * 0.3, -1.2, 1.2);
      g.stroke();
      g.fillStyle = 'rgba(40,26,14,0.72)';
      g.beginPath();
      g.arc(0, 0, hw * 0.54, 0, TAU);
      g.fill();
      break;
    }

    case 'burner': {
      g.fillStyle = 'rgba(4,7,10,0.9)';
      g.beginPath();
      g.arc(0, 0, hw, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(160,178,196,0.6)';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(0, 0, hw * 0.72, 0, TAU);
      g.stroke();
      // Grate arms.
      g.strokeStyle = 'rgba(30,36,42,0.95)';
      g.lineWidth = 12;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        g.beginPath();
        g.moveTo(Math.cos(a) * hw * 0.25, Math.sin(a) * hw * 0.25);
        g.lineTo(Math.cos(a) * hw, Math.sin(a) * hw);
        g.stroke();
      }
      break;
    }

    case 'panHandle': {
      g.strokeStyle = 'rgba(22,26,30,0.92)';
      g.lineWidth = 20;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-hw, 0);
      g.lineTo(hw, -hh * 0.3);
      g.stroke();
      g.strokeStyle = 'rgba(190,206,222,0.28)';
      g.lineWidth = 7;
      g.stroke();
      g.lineCap = 'butt';
      break;
    }

    case 'ovenVent': {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      rr(g, -hw, -hh, w, h, 6);
      g.fill();
      g.strokeStyle = 'rgba(180,200,220,0.22)';
      g.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const yy = -hh + 8 + i * ((h - 16) / 4);
        g.beginPath();
        g.moveTo(-hw + 8, yy);
        g.lineTo(hw - 8, yy);
        g.stroke();
      }
      break;
    }

    case 'fridgeGasket': {
      const grad = g.createLinearGradient(-hw, 0, hw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.7)');
      grad.addColorStop(0.5, 'rgba(255,206,140,0.30)');
      grad.addColorStop(1, 'rgba(0,0,0,0.6)');
      g.fillStyle = grad;
      g.fillRect(-hw, -hh, w, h);
      break;
    }

    case 'condenserGrille': {
      g.fillStyle = 'rgba(0,0,0,0.6)';
      rr(g, -hw, -hh, w, h, 5);
      g.fill();
      g.strokeStyle = 'rgba(160,180,200,0.24)';
      g.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const xx = -hw + 10 + i * ((w - 20) / 8);
        g.beginPath();
        g.moveTo(xx, -hh + 6);
        g.lineTo(xx, hh - 6);
        g.stroke();
      }
      // Dust caught in the fins — nobody has pulled the fridge out in years.
      g.fillStyle = 'rgba(150,140,124,0.22)';
      for (let i = 0; i < 16; i++) {
        g.beginPath();
        g.ellipse(-hw + noise(p, i) * w, hh - noise(p, i + 9) * 14, 7, 3, 0, 0, TAU);
        g.fill();
      }
      break;
    }

    case 'packet': {
      g.fillStyle = 'rgba(196,166,110,0.62)';
      g.beginPath();
      g.moveTo(-hw, -hh * 0.6);
      g.lineTo(hw * 0.9, -hh);
      g.lineTo(hw, hh * 0.7);
      g.lineTo(-hw * 0.85, hh);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(226,80,60,0.45)';
      g.fillRect(-hw * 0.7, -hh * 0.2, w * 0.8, h * 0.22);
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = 3;
      g.stroke();
      // A split corner with grain spilling out — this is why the pantry is worth routing to.
      g.fillStyle = 'rgba(222,196,140,0.75)';
      for (let i = 0; i < 12; i++) {
        g.beginPath();
        g.ellipse(
          hw * 0.7 + noise(p, i) * 24,
          hh * 0.5 + noise(p, i + 3) * 20,
          4,
          2.6,
          0.6,
          0,
          TAU,
        );
        g.fill();
      }
      break;
    }

    case 'jar': {
      g.fillStyle = 'rgba(150,180,200,0.4)';
      g.beginPath();
      g.arc(0, 0, hw * 0.86, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(180,150,90,0.6)';
      g.beginPath();
      g.arc(0, 0, hw * 0.66, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(220,232,244,0.5)';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(0, 0, hw * 0.86, 0, TAU);
      g.stroke();
      break;
    }

    case 'binBag': {
      g.fillStyle = 'rgba(24,28,32,0.86)';
      g.beginPath();
      g.moveTo(-hw, hh * 0.6);
      g.quadraticCurveTo(-hw * 0.9, -hh, 0, -hh * 0.8);
      g.quadraticCurveTo(hw, -hh * 0.7, hw * 0.85, hh * 0.5);
      g.quadraticCurveTo(0, hh, -hw, hh * 0.6);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(190,210,230,0.12)';
      g.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(-hw * 0.7 + i * hw * 0.4, -hh * 0.55);
        g.quadraticCurveTo(-hw * 0.5 + i * hw * 0.4, 0, -hw * 0.75 + i * hw * 0.4, hh * 0.55);
        g.stroke();
      }
      break;
    }

    case 'binWheel': {
      g.fillStyle = 'rgba(14,18,22,0.9)';
      g.beginPath();
      g.arc(0, 0, hw, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(160,180,200,0.3)';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(0, 0, hw * 0.42, 0, TAU);
      g.stroke();
      break;
    }

    case 'petBowl': {
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath();
      g.ellipse(3, 5, hw, hh * 0.9, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(70,120,146,0.7)';
      g.beginPath();
      g.ellipse(0, 0, hw, hh * 0.9, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(14,26,34,0.85)';
      g.beginPath();
      g.ellipse(0, 0, hw * 0.72, hh * 0.62, 0, 0, TAU);
      g.fill();
      // Water, catching the hall light.
      g.fillStyle = 'rgba(150,200,230,0.35)';
      g.beginPath();
      g.ellipse(0, hh * 0.08, hw * 0.6, hh * 0.44, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(220,240,255,0.4)';
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(0, 0, hw, hh * 0.9, 0, 0, TAU);
      g.stroke();
      break;
    }

    case 'petMat': {
      g.fillStyle = 'rgba(46,34,28,0.82)';
      rr(g, -hw * 0.8, -hh * 0.8, w * 0.8, h * 0.8, 20);
      g.fill();
      g.strokeStyle = 'rgba(150,124,96,0.5)';
      g.lineWidth = 5;
      rr(g, -hw * 0.8 + 10, -hh * 0.8 + 10, w * 0.8 - 20, h * 0.8 - 20, 14);
      g.stroke();
      // Weave, so the mat reads as fabric and not as a translucent haze over the floor.
      g.strokeStyle = 'rgba(120,98,76,0.28)';
      g.lineWidth = 3;
      for (let i = 1; i < 7; i++) {
        const yy = -hh * 0.8 + (h * 0.8 * i) / 7;
        g.beginPath();
        g.moveTo(-hw * 0.8 + 12, yy);
        g.lineTo(hw * 0.8 - 12, yy);
        g.stroke();
      }
      break;
    }

    case 'kibble': {
      for (let i = 0; i < 14; i++) {
        const a = noise(p, i) * TAU;
        const r = noise(p, i + 20) * hw;
        g.fillStyle = `rgba(${120 + noise(p, i + 5) * 40},${76 + noise(p, i + 6) * 30},40,0.8)`;
        g.beginPath();
        g.ellipse(Math.cos(a) * r, Math.sin(a) * r * 0.7, 7, 5.4, a, 0, TAU);
        g.fill();
      }
      break;
    }

    case 'slipper': {
      g.fillStyle = 'rgba(96,72,64,0.85)';
      g.beginPath();
      g.moveTo(-hw, -hh * 0.3);
      g.quadraticCurveTo(-hw * 0.2, -hh, hw * 0.55, -hh * 0.6);
      g.quadraticCurveTo(hw, -hh * 0.1, hw * 0.8, hh * 0.5);
      g.quadraticCurveTo(0, hh, -hw * 0.9, hh * 0.4);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(150,124,110,0.5)';
      g.beginPath();
      g.ellipse(-hw * 0.2, -hh * 0.1, hw * 0.42, hh * 0.44, 0.1, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.beginPath();
      g.ellipse(-hw * 0.34, 0, hw * 0.3, hh * 0.34, 0.1, 0, TAU);
      g.fill();
      break;
    }

    case 'sock': {
      g.fillStyle = 'rgba(178,186,196,0.6)';
      g.beginPath();
      g.moveTo(-hw, -hh * 0.4);
      g.quadraticCurveTo(hw * 0.3, -hh, hw * 0.9, -hh * 0.1);
      g.quadraticCurveTo(hw * 0.5, hh * 0.9, -hw * 0.4, hh * 0.6);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(90,120,150,0.4)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-hw * 0.8, -hh * 0.2);
      g.lineTo(-hw * 0.5, hh * 0.5);
      g.stroke();
      break;
    }

    case 'broomHead': {
      g.fillStyle = 'rgba(58,44,30,0.85)';
      rr(g, -hw, -hh * 0.5, w, h * 0.5, 6);
      g.fill();
      g.strokeStyle = 'rgba(186,150,88,0.65)';
      g.lineWidth = 4;
      for (let i = 0; i < 16; i++) {
        const xx = -hw + 6 + i * ((w - 12) / 15);
        g.beginPath();
        g.moveTo(xx, 0);
        g.lineTo(xx + noise(p, i) * 8 - 4, hh);
        g.stroke();
      }
      break;
    }

    case 'outlet': {
      g.fillStyle = 'rgba(214,214,206,0.5)';
      rr(g, -hw, -hh, w, h, 6);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = 'rgba(10,12,14,0.9)';
      g.fillRect(-hw * 0.5, -hh * 0.3, 8, 16);
      g.fillRect(hw * 0.2, -hh * 0.3, 8, 16);
      g.fillStyle = 'rgba(120,220,255,0.7)';
      g.beginPath();
      g.arc(0, hh * 0.4, 4, 0, TAU);
      g.fill();
      break;
    }

    case 'vent': {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      rr(g, -hw, -hh, w, h, 8);
      g.fill();
      g.strokeStyle = 'rgba(150,170,190,0.3)';
      g.lineWidth = 5;
      for (let i = 0; i < 6; i++) {
        const yy = -hh + 10 + i * ((h - 20) / 5);
        g.beginPath();
        g.moveTo(-hw + 10, yy);
        g.lineTo(hw - 10, yy);
        g.stroke();
      }
      g.strokeStyle = 'rgba(200,220,240,0.28)';
      g.lineWidth = 4;
      rr(g, -hw, -hh, w, h, 8);
      g.stroke();
      break;
    }

    case 'cableCoil': {
      g.strokeStyle = 'rgba(18,20,26,0.62)';
      g.lineWidth = 11;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-hw, hh * 0.3);
      g.bezierCurveTo(-hw * 0.3, -hh, hw * 0.4, hh, hw, -hh * 0.4);
      g.stroke();
      g.strokeStyle = 'rgba(180,200,220,0.14)';
      g.lineWidth = 4;
      g.stroke();
      g.lineCap = 'butt';
      break;
    }

    case 'crumbCluster': {
      // Actual crumbs at actual crumb scale, so a roach standing beside one is legibly a roach.
      for (let i = 0; i < 26; i++) {
        const a = noise(p, i) * TAU;
        const r = Math.sqrt(noise(p, i + 30)) * hw;
        const s = 3 + noise(p, i + 60) * 6;
        g.fillStyle = `rgba(${186 + noise(p, i) * 40},${150 + noise(p, i + 2) * 40},${96 + noise(p, i + 4) * 40},0.85)`;
        g.beginPath();
        g.ellipse(Math.cos(a) * r, Math.sin(a) * r * 0.72, s, s * 0.72, a, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(255,238,200,0.28)';
        g.beginPath();
        g.ellipse(
          Math.cos(a) * r - s * 0.3,
          Math.sin(a) * r * 0.72 - s * 0.3,
          s * 0.4,
          s * 0.3,
          a,
          0,
          TAU,
        );
        g.fill();
      }
      break;
    }

    case 'greaseSmear': {
      const grad = g.createRadialGradient(0, 0, 2, 0, 0, hw);
      grad.addColorStop(0, 'rgba(96,72,32,0.30)');
      grad.addColorStop(0.6, 'rgba(70,54,26,0.14)');
      grad.addColorStop(1, 'rgba(50,40,20,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(0, 0, hw, hh, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(220,200,150,0.10)';
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.ellipse(
          (noise(p, i) - 0.5) * w * 0.6,
          (noise(p, i + 12) - 0.5) * h * 0.6,
          10 + noise(p, i + 5) * 16,
          6 + noise(p, i + 7) * 10,
          noise(p, i) * TAU,
          0,
          TAU,
        );
        g.fill();
      }
      break;
    }

    case 'waterRing': {
      // A puddle, not a ring.
      //
      // The first version drew concentric strokes, which at the gameplay camera read as exactly the
      // selection-outline vocabulary the redesign exists to remove. Water is a filled shape with an
      // irregular edge, a bright meniscus on the lit side and a few loose droplets — none of which
      // can be mistaken for a marker.
      const pts = 14;
      g.beginPath();
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * TAU;
        const wob = 0.78 + noise(p, i) * 0.34;
        const px = Math.cos(a) * hw * wob;
        const py = Math.sin(a) * hh * wob;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      const body = g.createLinearGradient(-hw, -hh, hw, hh);
      body.addColorStop(0, 'rgba(96,150,186,0.42)');
      body.addColorStop(0.55, 'rgba(58,104,138,0.30)');
      body.addColorStop(1, 'rgba(40,74,102,0.22)');
      g.fillStyle = body;
      g.fill();
      // Meniscus: a bright arc on the upper-left edge only, which is what makes a flat shape read
      // as a liquid with surface tension.
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(206,238,255,0.5)';
      g.lineWidth = 5;
      g.beginPath();
      g.ellipse(0, 0, hw * 0.92, hh * 0.92, 0, Math.PI * 0.85, Math.PI * 1.75);
      g.stroke();
      // A single soft highlight where the room light lands.
      const hi = g.createRadialGradient(-hw * 0.3, -hh * 0.3, 1, -hw * 0.3, -hh * 0.3, hw * 0.6);
      hi.addColorStop(0, 'rgba(226,246,255,0.30)');
      hi.addColorStop(1, 'rgba(226,246,255,0)');
      g.fillStyle = hi;
      g.fillRect(-hw, -hh, w, h);
      g.restore();
      // Detached droplets: the scale cue.
      for (let i = 0; i < 7; i++) {
        const a = noise(p, i + 2) * TAU;
        const r = hw * (0.95 + noise(p, i + 5) * 0.45);
        g.fillStyle = 'rgba(150,200,232,0.5)';
        g.beginPath();
        g.ellipse(Math.cos(a) * r, Math.sin(a) * r * 0.7, 4 + noise(p, i) * 3, 3 + noise(p, i + 1) * 2, a, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(226,246,255,0.55)';
        g.beginPath();
        g.arc(Math.cos(a) * r - 1.4, Math.sin(a) * r * 0.7 - 1.4, 1.4, 0, TAU);
        g.fill();
      }
      break;
    }

    case 'scuffMark': {
      g.strokeStyle = 'rgba(120,132,146,0.16)';
      g.lineWidth = 7;
      g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(-hw + noise(p, i) * 20, -hh * 0.5 + i * (h / 5));
        g.quadraticCurveTo(
          0,
          -hh * 0.5 + i * (h / 5) + (noise(p, i + 4) - 0.5) * 24,
          hw,
          -hh * 0.4 + i * (h / 5),
        );
        g.stroke();
      }
      g.lineCap = 'butt';
      break;
    }

    case 'baseboardGap': {
      // The crack itself, drawn as a wedge of true black with a lit lip — the game is named after it.
      g.fillStyle = 'rgba(0,0,0,0.92)';
      g.beginPath();
      g.moveTo(-hw, hh);
      g.lineTo(-hw * 0.55, -hh);
      g.lineTo(hw * 0.4, -hh * 0.7);
      g.lineTo(hw, hh);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(196,214,236,0.28)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-hw, hh);
      g.lineTo(-hw * 0.55, -hh);
      g.stroke();
      break;
    }

    default:
      break;
  }
}

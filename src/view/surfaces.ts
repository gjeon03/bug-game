import * as THREE from 'three';

/**
 * Surface incident for large flat architecture.
 *
 * ## The measured problem this solves
 *
 * An independent critic measured the proof scene and found **53.9 % of the frame within 6 % of a
 * single colour**, with a 500×260 patch of worktop at a standard deviation of 0.0030 — effectively
 * one flat fill. Their diagnosis was the useful part: *"the absence of incident doesn't read as
 * clean, it reads as untextured. It also destroys scale: with nothing at millimetre resolution to
 * compare against, the roaches float free of size."*
 *
 * At 35 mm creature scale the camera is essentially a macro lens, and a real surface at that
 * magnification is all incident — grain, a dried ring, a scuff, dust in the low spots.
 *
 * ## Why roughness alone was not enough
 *
 * The first attempt supplied only a `roughnessMap`. A second critic proved it never reached the eye:
 * an auto-levelled high-pass of the whole frame was black on every countertop pixel, and
 * like-for-like patches measured 0.0021 after versus 0.0022 before. Under a soft environment map,
 * against a mid roughness base, there is no hard light for roughness variation to break up.
 *
 * Three channels from **one** source canvas fixes it, and the split matters:
 * - **albedo** survives even where no light reaches,
 * - **normal** gives the key light real slope to catch,
 * - **roughness** modulates the specular response on top of both.
 *
 * ## Why nothing tiles
 *
 * `tools/bake/lib/materials.mjs` records a negative result: a tiled canvas texture's own seams line
 * up and produce a visible repeating grid, which is on the banned list. The escape is to not tile —
 * one texture stretched across the whole slab with `repeat` left at 1 has no period for a grid to
 * form on.
 */

export interface WearOptions {
  /** Texture resolution. 1024 across ~920 world units is roughly 1.2 mm per texel. */
  readonly size?: number;
  /** Broad wear patches — where hands, cloths and forearms pass. */
  readonly blotches?: number;
  /** Fine directional grain. Manufactured surfaces are anisotropic; that is most of what says "made". */
  readonly streaks?: number;
  /** Dried water rings. Counter only — nobody stands a glass on a cabinet door. */
  readonly rings?: number;
  /** Grain direction. Worktops are brushed along their length; cabinet doors run with the timber. */
  readonly grain?: 'horizontal' | 'vertical';
  /** Scuffs concentrated toward the bottom edge, as on a kicked cabinet plinth. */
  readonly scuffs?: number;
  /** Deterministic seed — evidence has to be reproducible, so `Math.random` appears nowhere here. */
  readonly seed?: number;
}

/** Build the shared greyscale source for a surface's albedo, normal and roughness channels. */
export function wearCanvas(options: WearOptions = {}): HTMLCanvasElement {
  const size = options.size ?? 1024;
  const blotches = options.blotches ?? 70;
  const streaks = options.streaks ?? 900;
  const rings = options.rings ?? 0;
  const scuffs = options.scuffs ?? 0;
  const vertical = options.grain === 'vertical';

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for surface wear');

  let seed = (options.seed ?? 0x9e3779b9) >>> 0;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  // Bright base: every map here multiplies, so near-white preserves the material's authored value
  // and lets each mark read as a departure from it rather than as a global darkening.
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < blotches; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.09 + rand() * 0.25);
    const lighter = rand() > 0.45;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, lighter ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.26)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < streaks; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = size * (0.06 + rand() * 0.33);
    const wobble = (rand() - 0.5) * 3;
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = rand() < 0.85 ? 1 : 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (vertical) ctx.lineTo(x + wobble, y + len);
    else ctx.lineTo(x + len, y + wobble);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < rings; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.025 + rand() * 0.045);
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth = 2 + rand() * 3;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.9 + rand() * 0.2), rand() * Math.PI, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Scuffs cluster where a foot or a mop actually reaches: the bottom fifth.
  for (let i = 0; i < scuffs; i++) {
    const x = rand() * size;
    const y = size * (0.78 + rand() * 0.22);
    const len = size * (0.02 + rand() * 0.09);
    ctx.strokeStyle = rand() > 0.6 ? 'rgba(255,255,255,0.26)' : 'rgba(0,0,0,0.34)';
    ctx.lineWidth = 1 + rand() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rand() - 0.5) * 4);
    ctx.stroke();
  }

  return canvas;
}

/**
 * Derive a tangent-space normal map from a greyscale source with a Sobel gradient.
 *
 * Encoded the way three.js expects: XY in 0..255 around 128, Z positive. `strength` scales the slope
 * — too high and a flat laminate looks like hammered metal.
 */
export function normalMapFrom(source: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const size = source.width;
  const src = source.getContext('2d');
  if (!src) throw new Error('2D context unavailable for normal map');
  const height = src.getImageData(0, 0, size, size).data;

  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for normal map');
  const image = ctx.createImageData(size, size);

  const at = (x: number, y: number): number => {
    const cx = Math.min(size - 1, Math.max(0, x));
    const cy = Math.min(size - 1, Math.max(0, y));
    return height[(cy * size + cx) * 4] ?? 0;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / 255;
      const dy = (at(x, y + 1) - at(x, y - 1)) / 255;
      const nx = -dx * strength;
      const ny = -dy * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      image.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(out);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export interface AppliedWear {
  readonly albedo: THREE.CanvasTexture;
  readonly normal: THREE.CanvasTexture;
  readonly dispose: () => void;
}

/**
 * Give a standard material all three channels from one source.
 *
 * The base colour is lifted to compensate for the map's average, so the surface keeps the value the
 * art direction chose rather than quietly darkening every time wear is added.
 */
export function applyWear(
  material: THREE.MeshStandardMaterial,
  options: WearOptions & { readonly normalStrength?: number; readonly normalScale?: number } = {},
): AppliedWear {
  const canvas = wearCanvas(options);

  const albedo = new THREE.CanvasTexture(canvas);
  albedo.wrapS = THREE.ClampToEdgeWrapping;
  albedo.wrapT = THREE.ClampToEdgeWrapping;
  albedo.anisotropy = 8;

  const normal = normalMapFrom(canvas, options.normalStrength ?? 2.2);
  const scale = options.normalScale ?? 0.55;

  material.map = albedo;
  material.roughnessMap = albedo;
  material.normalMap = normal;
  material.normalScale = new THREE.Vector2(scale, scale);
  /*
   * The 1.18 lift is gone.
   *
   * It read "`#d8d8d8` averages ~0.85, so the base is lifted by its reciprocal to hold the authored
   * value" — reasonable in isolation, and an uncontrolled 18 % brightening of every material that
   * carries wear, which is most of the large ones. Authored colours stopped meaning what they say,
   * and every later attempt to darken the room was fighting a multiplier nobody was looking at.
   *
   * Removing it is what made the floor reachable: swept with the lift in place, the floor could not
   * be brought below 0.62 by any combination of doorway intensity and exposure without pure black
   * coming back. Without it, an authored albedo change lands where the number says it should.
   *
   * The albedo maps still average ~0.85, so materials read slightly darker than their hex — now
   * compensated where it belongs, in the authored colour, and only where it is wanted.
   */
  material.needsUpdate = true;

  return {
    albedo,
    normal,
    dispose: () => {
      albedo.dispose();
      normal.dispose();
    },
  };
}

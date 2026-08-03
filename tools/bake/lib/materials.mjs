import * as THREE from 'three';

/**
 * The kitchen's material vocabulary.
 *
 * "Material separation" was a named defect: everything in the old build sat in the same narrow
 * value band, so a ceramic plate, a steel sink and a plastic bottle all read as the same grey
 * shape. These presets exist to make that impossible — each one commits to a distinct
 * roughness/metalness pair so the SAME light rig produces visibly different responses.
 *
 * Base colours stay inside the game's cold-night palette; the warmth in the scene comes from the
 * light rig, not from the albedo, which is what keeps 30 props looking like one room.
 */

const std = (params) => new THREE.MeshStandardMaterial(params);

/**
 * Procedural surface detail.
 *
 * Flat albedo was the reason a counter still read as a slab even after it had correct geometry and
 * correct lighting: at insect scale the player's face is 40 mm from the worktop, and at that
 * distance every real surface shows structure — the speckle in composite stone, the drawn lines in
 * brushed steel, the mottle in glazed ceramic. Without it, more polygons just make a smoother
 * rectangle.
 *
 * Generated once per pattern and cached, on a canvas rather than fetched, so the bake stays offline
 * and deterministic. Seeded by hand so a rebuild produces the same surface.
 */
const textureCache = new Map();

function surfaceTexture(kind, repeat = 1) {
  const key = `${kind}:${repeat}`;
  const hit = textureCache.get(key);
  if (hit) return hit;

  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');

  // Deterministic PRNG: a rebuild must produce the identical surface or screenshots stop being
  // comparable evidence.
  let seed = kind.length * 2654435761;
  const rnd = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  };

  // Base is near-white, not mid-grey, because this map is used as ALBEDO as well as roughness.
  // Albedo multiplies the base colour, so a mid-grey map would halve every material's brightness;
  // a near-white base means the pattern *subtracts* detail from the colour instead of dimming it.
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, S, S);

  if (kind === 'stone') {
    // Composite worktop: dense fine aggregate with a few larger flecks.
    for (let i = 0; i < 26000; i += 1) {
      const v = 120 + rnd() * 110;
      ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
      ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    for (let i = 0; i < 900; i += 1) {
      const v = 84 + rnd() * 150;
      ctx.fillStyle = `rgba(${v},${v},${v},0.55)`;
      ctx.beginPath();
      ctx.ellipse(rnd() * S, rnd() * S, 1.5 + rnd() * 4, 1 + rnd() * 3, rnd() * 6.28, 0, 6.28);
      ctx.fill();
    }
  } else if (kind === 'brushed') {
    // Brushed steel: long fine scratches in one direction. Anisotropy is the whole identity of the
    // material, and it is what makes a sink deck read as metal rather than as grey plastic.
    for (let i = 0; i < 5200; i += 1) {
      const v = 150 + rnd() * 96;
      ctx.strokeStyle = `rgba(${v},${v},${v},0.32)`;
      ctx.lineWidth = 0.5 + rnd() * 1.4;
      const y = rnd() * S;
      ctx.beginPath();
      ctx.moveTo(rnd() * S - 120, y);
      ctx.lineTo(rnd() * S + 120, y + (rnd() - 0.5) * 1.5);
      ctx.stroke();
    }
  } else if (kind === 'glaze') {
    // Glazed ceramic tile: broad soft mottling, no hard grain.
    for (let i = 0; i < 420; i += 1) {
      const v = 150 + rnd() * 96;
      const r = 12 + rnd() * 54;
      const g2 = ctx.createRadialGradient(rnd() * S, rnd() * S, 0, rnd() * S, rnd() * S, r);
      g2.addColorStop(0, `rgba(${v},${v},${v},0.30)`);
      g2.addColorStop(1, 'rgba(240,240,240,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, S, S);
    }
  } else if (kind === 'matte') {
    // Painted laminate: very fine tooth, just enough to break a dead-flat panel.
    for (let i = 0; i < 42000; i += 1) {
      const v = 168 + rnd() * 60;
      ctx.fillStyle = `rgba(${v},${v},${v},0.36)`;
      ctx.fillRect(rnd() * S, rnd() * S, 1, 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  textureCache.set(key, tex);
  return tex;
}

/**
 * Attach a detail pattern to a material.
 *
 * The same greyscale map drives roughness and a light bump. Using one map for both is deliberate:
 * on real surfaces the rough patches and the raised patches are the same patches, and splitting
 * them into independent noise is what makes procedural materials look procedural.
 */
/**
 * `repeat` is in TEXTURE TILES PER WORLD UNIT, not per surface.
 *
 * This bit non-obviously: `ExtrudeGeometry` — which every flat surface here is built from — emits
 * UVs in raw world coordinates rather than normalised 0..1. A repeat of 5 on a 240-unit counter
 * therefore tiled the pattern 1200 times and compressed it below one pixel, which is why two
 * rounds of texture work produced no visible change at all. Lathe and sphere geometry DO use 0..1
 * UVs, so lathed props (plates, bottles) need a value roughly two orders of magnitude larger.
 */
function detailed(material, kind, { repeat = 4, bump = 0.45, roughAmount = 0.9 } = {}) {
  const tex = surfaceTexture(kind, repeat);
  // Deliberately NOT applied as albedo.
  //
  // Driving the base colour with this map was tried and rejected on evidence: at the repeat counts
  // needed to be visible, the canvas texture's own tile seams showed through as a regular grid —
  // "repeated procedural noise", which is on the banned list — and it quadrupled the sheet to
  // 1.2 MB. Roughness and bump still carry genuine micro-relief on lathed and curved surfaces,
  // where the varying surface normal actually samples the map. Large flat architecture gets its
  // variation from the runtime's tiling layer instead, which already randomises across a 640-unit
  // period specifically to avoid a visible grid.
  material.roughnessMap = tex;
  material.bumpMap = tex;
  material.bumpScale = bump;
  material.roughness = Math.min(1, material.roughness * roughAmount + 0.12);
  return material;
}

/** Brushed stainless steel: sink bowl, appliance shells. */
export const steelBrushed = () =>
  detailed(std({ color: 0x8d98a4, metalness: 0.92, roughness: 0.34 }), 'brushed', {
    repeat: 0.09,
    bump: 0.12,
  });

/** Polished steel for the drain ring and taps — brighter specular, reads wet. */
export const steelPolished = () => std({ color: 0xa7b3bf, metalness: 0.97, roughness: 0.16 });

/** Glazed white ceramic: plates, bowls, mugs. Non-metal, low roughness, high albedo — the
 *  brightest thing in the kitchen, and what makes the dish zone identifiable at a glance. */
export const ceramicWhite = () =>
  detailed(std({ color: 0xe8ecef, metalness: 0.02, roughness: 0.22 }), 'glaze', {
    repeat: 2,
    bump: 0.12,
  });

/** Unglazed foot ring / underside: same hue family, much rougher, so a stack's edges separate
 *  instead of merging into one white blob. */
export const ceramicFoot = (color = 0xc9ccc8) =>
  detailed(std({ color, metalness: 0.0, roughness: 0.78 }), 'glaze', { repeat: 0.05, bump: 0.9 });

/** Soft matte plastic: containers, appliance bodies, bin lids. */
export const plasticMatte = (color = 0xbfc6cc) => std({ color, metalness: 0.0, roughness: 0.62 });

/** Glossy plastic: detergent bottles, caps. */
export const plasticGloss = (color = 0x3f7fa8) => std({ color, metalness: 0.0, roughness: 0.28 });

/** Translucent plastic for bottles with visible contents. */
export const plasticTranslucent = (color = 0xbfe4f0) =>
  new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.0,
    roughness: 0.2,
    transmission: 0.72,
    thickness: 6,
    ior: 1.46,
    transparent: true,
  });

/** Open-cell sponge foam: very rough, slightly saturated, no specular. */
export const spongeFoam = (color = 0xd8c65a) => std({ color, metalness: 0.0, roughness: 0.95 });

/** Abrasive scour backing — darker, matte, distinct hue from the foam. */
export const spongeScour = (color = 0x2f5d47) => std({ color, metalness: 0.0, roughness: 0.88 });

/** Cotton dish towel / cloth. */
export const cloth = (color = 0x9fb0bd) => std({ color, metalness: 0.0, roughness: 0.97 });

/** Cabinet laminate — toe-kick and door faces. Warm-neutral, separates from cold steel. */
export const laminate = (color = 0x6b6258) =>
  detailed(std({ color, metalness: 0.03, roughness: 0.55 }), 'matte', { repeat: 0.11, bump: 0.4 });

/** Countertop stone/composite. */
export const counterStone = () =>
  detailed(std({ color: 0x4c5560, metalness: 0.04, roughness: 0.42 }), 'stone', {
    repeat: 0.14,
    bump: 0.5,
  });

/** Corrugated cardboard: delivery packaging. */
export const cardboard = (color = 0xa8875e) => std({ color, metalness: 0.0, roughness: 0.9 });

/** Thin crinkled film: delivery bags, wrappers. Slight sheen catches the key light in flecks. */
export const filmPlastic = (color = 0xd6dde2) => std({ color, metalness: 0.0, roughness: 0.35 });

/** Organic food matter — crumbs, grains, scraps. Warm and rough so it never reads as a pebble. */
export const foodCrumb = (color = 0xc09a5e) => std({ color, metalness: 0.0, roughness: 0.86 });

/**
 * Standing water / condensation.
 *
 * Heavy transmission was tried first and produced flat grey discs: a droplet baked in isolation has
 * nothing behind it to refract, so transmission had nothing to do and the sprite collapsed into the
 * exact "circle" defect this pipeline exists to kill. What actually makes water read is specular
 * behaviour — a tight bright highlight, a clearcoat sheen and a darker wet rim — so the material
 * leans on clearcoat and low roughness instead, and keeps only enough transmission to tint.
 */
export const water = () =>
  new THREE.MeshPhysicalMaterial({
    color: 0xbcd9e8,
    metalness: 0.0,
    roughness: 0.03,
    transmission: 0.34,
    thickness: 1.2,
    ior: 1.33,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.86,
  });

/** Cockroach chitin. Warm amber-brown, semi-gloss — the shell highlight is the single most
 *  important cue separating a living roach from a drawn oval. */
export const chitin = (color = 0x8a5524) => std({ color, metalness: 0.12, roughness: 0.38 });

/** Darker chitin for the pronotum shield and head. */
export const chitinDark = (color = 0x4a2b11) => std({ color, metalness: 0.1, roughness: 0.45 });

/** Leg and antenna chitin — thinner, rougher, slightly desaturated. */
export const chitinLimb = (color = 0x6d431c) => std({ color, metalness: 0.05, roughness: 0.6 });

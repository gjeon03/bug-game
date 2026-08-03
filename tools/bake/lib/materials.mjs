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

/** Brushed stainless steel: sink bowl, appliance shells. */
export const steelBrushed = () => std({ color: 0x8d98a4, metalness: 0.92, roughness: 0.34 });

/** Polished steel for the drain ring and taps — brighter specular, reads wet. */
export const steelPolished = () => std({ color: 0xa7b3bf, metalness: 0.97, roughness: 0.16 });

/** Glazed white ceramic: plates, bowls, mugs. Non-metal, low roughness, high albedo — the
 *  brightest thing in the kitchen, and what makes the dish zone identifiable at a glance. */
export const ceramicWhite = () => std({ color: 0xe8ecef, metalness: 0.02, roughness: 0.22 });

/** Unglazed foot ring / underside: same hue family, much rougher, so a stack's edges separate
 *  instead of merging into one white blob. */
export const ceramicFoot = () => std({ color: 0xc9ccc8, metalness: 0.0, roughness: 0.78 });

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
export const laminate = (color = 0x6b6258) => std({ color, metalness: 0.03, roughness: 0.55 });

/** Countertop stone/composite. */
export const counterStone = () => std({ color: 0x4c5560, metalness: 0.04, roughness: 0.42 });

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

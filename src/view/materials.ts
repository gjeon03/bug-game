import * as THREE from 'three';

import { NightStandardMaterial, type RimSettings } from './night';
import { applyWear } from './surfaces';

/**
 * The material library.
 *
 * ## Why a fixed palette rather than per-prop materials
 *
 * At 35 mm creature scale the camera is a macro lens, and the thing that sells "this is a real
 * kitchen" is not colour — it is that a dozen different objects are made of a handful of *actual
 * substances*, each behaving consistently. Laminate is always the same laminate. Steel is always
 * the same steel. A prop that invents its own material reads as a different world.
 *
 * It is also what keeps the draw call count sane: shared materials batch, and the whole apartment
 * runs on roughly forty of them rather than on one per prop.
 *
 * ## Every material here is authored
 *
 * Nothing in this file is `new THREE.MeshStandardMaterial()` with defaults. Each one states a
 * roughness and a metalness that mean something physically, and the large flat ones carry
 * procedural surface incident because a flat fill at macro scale reads as untextured, not clean —
 * a defect an independent critic measured on the previous build at 53.9 % of frame within 6 % of
 * one colour.
 */

export type MaterialId =
  | 'laminate'
  | 'laminateDark'
  | 'worktop'
  | 'cabinetDoor'
  | 'steelBrushed'
  | 'steelPolished'
  | 'chrome'
  | 'porcelain'
  | 'tileWall'
  | 'tileFloor'
  | 'grout'
  | 'plasterWall'
  | 'plasterCut'
  | 'floorWood'
  | 'floorVinyl'
  | 'skirting'
  | 'glass'
  | 'glassFrosted'
  | 'plasticWhite'
  | 'plasticBlack'
  | 'plasticClear'
  | 'plasticRed'
  | 'plasticBlue'
  | 'plasticGreen'
  | 'rubber'
  | 'fabricSofa'
  | 'fabricBed'
  | 'fabricTowel'
  | 'fabricRug'
  | 'fabricClothes'
  | 'paper'
  | 'cardboard'
  | 'foil'
  | 'wood'
  | 'woodDark'
  | 'leather'
  | 'crumb'
  | 'rice'
  | 'water'
  | 'grime'
  | 'screenOff'
  | 'cable'
  | 'brass';

interface Spec {
  readonly colour: number;
  readonly roughness: number;
  readonly metalness: number;
  /** Procedural surface incident, for anything large and flat enough to look bare without it. */
  readonly wear?: {
    readonly size?: number;
    readonly blotches?: number;
    readonly streaks?: number;
    readonly rings?: number;
    readonly scuffs?: number;
    readonly grain?: 'horizontal' | 'vertical';
    readonly seed?: number;
    readonly normalScale?: number;
  };
  readonly emissive?: number;
  readonly emissiveIntensity?: number;
  readonly transparent?: boolean;
  readonly opacity?: number;
  /**
   * Silhouette light, from the night direction.
   *
   * Authored per material rather than globally because a rim is a claim about what the surface is
   * made of: steel catches a hard cool edge, plaster catches almost nothing, wood catches a soft
   * warm one. A single global rim reads as an outline filter, which is the failure mode §7 calls
   * "flat vector icons used as world objects".
   */
  readonly rim?: RimSettings;
}

/* Colours are authored against a night interior: nothing here is at full saturation, because
 * nothing in a dark room is. The separation between materials lives in roughness and normal
 * response far more than in hue. */
const SPECS: Readonly<Record<MaterialId, Spec>> = {
  laminate: {
    colour: 0xb9ac9a,
    roughness: 0.62,
    metalness: 0.02,
    wear: { streaks: 900, grain: 'horizontal', seed: 3, normalScale: 0.5 },
  },
  /*
   * The dark end of the palette is authored as HUE, not as value.
   *
   * `laminateDark` was 0x4a4038 — a warm neutral three shades below `laminate`, which is the same
   * material at a different brightness and reads that way. Measured by tile on the stomp capture,
   * this material and `plasticBlack` were where the remaining pure #000000 lived: albedos that low
   * leave nothing for the tone curve to recover, so they clip to zero and become the "large
   * unbroken blue-black rectangles" §7 bans.
   *
   * Shifting toward plum keeps them reading as dark — they are still the darkest things in the
   * frame — while giving the eye a hue difference to separate them by, and giving ACES something
   * above zero to map. The rim then draws their edges out of the dark without touching their fill.
   */
  laminateDark: {
    colour: 0x453e4c,
    roughness: 0.58,
    metalness: 0.02,
    wear: { streaks: 800, grain: 'vertical', seed: 11, normalScale: 0.45 },
    rim: { colour: 0x8fa7c4, strength: 0.16 },
  },
  worktop: {
    colour: 0x9d968b,
    roughness: 0.36,
    metalness: 0.04,
    wear: { blotches: 80, streaks: 1100, rings: 5, grain: 'horizontal', seed: 5, normalScale: 0.6 },
  },
  cabinetDoor: {
    colour: 0x6d6257,
    roughness: 0.5,
    metalness: 0.03,
    wear: { streaks: 700, scuffs: 90, grain: 'vertical', seed: 17, normalScale: 0.5 },
    // The largest vertical area in the frame. Its rim is what makes each door a separate panel
    // instead of one slab with lines drawn on it.
    rim: { colour: 0xb8c6d6, strength: 0.2 },
  },
  steelBrushed: {
    colour: 0x8f949a,
    roughness: 0.34,
    metalness: 0.92,
    wear: { streaks: 1400, grain: 'horizontal', seed: 23, normalScale: 0.32 },
    // Hard and cool. Metal is the one material where a bright narrow rim is literally what happens.
    rim: { colour: 0xdfe9f4, strength: 0.34 },
  },
  steelPolished: { colour: 0xaab0b6, roughness: 0.16, metalness: 0.96 },
  chrome: { colour: 0xc6ccd2, roughness: 0.08, metalness: 1 },
  porcelain: { colour: 0xe4e6e4, roughness: 0.14, metalness: 0.02 },
  tileWall: {
    colour: 0xd2d6d4,
    roughness: 0.2,
    metalness: 0.02,
    wear: { blotches: 40, streaks: 300, seed: 29, normalScale: 0.35 },
  },
  tileFloor: {
    colour: 0x9aa0a0,
    roughness: 0.44,
    metalness: 0.02,
    wear: { blotches: 60, streaks: 500, scuffs: 60, seed: 31, normalScale: 0.5 },
  },
  grout: { colour: 0x6e7370, roughness: 0.85, metalness: 0 },
  plasterWall: {
    colour: 0xa39a90,
    roughness: 0.88,
    metalness: 0,
    wear: { blotches: 55, streaks: 260, seed: 37, normalScale: 0.35 },
  },
  plasterCut: { colour: 0x6a635c, roughness: 0.9, metalness: 0 },
  floorWood: {
    colour: 0x7a6247,
    roughness: 0.52,
    metalness: 0.02,
    wear: {
      streaks: 1500,
      blotches: 70,
      scuffs: 70,
      grain: 'horizontal',
      seed: 41,
      normalScale: 0.55,
    },
  },
  floorVinyl: {
    colour: 0x8d8578,
    roughness: 0.56,
    metalness: 0.02,
    wear: {
      streaks: 1100,
      blotches: 60,
      scuffs: 90,
      grain: 'horizontal',
      seed: 43,
      normalScale: 0.5,
    },
    // Sixty per cent of every frame. A weak, cool rim picks out the plank seams and the edge where
    // the floor meets the toe-kick, which is the only silhouette the floor has.
    rim: { colour: 0x9fb3c6, strength: 0.12 },
  },
  skirting: {
    colour: 0xcfc7bb,
    roughness: 0.55,
    metalness: 0.02,
    wear: { scuffs: 140, streaks: 300, seed: 47, normalScale: 0.45 },
  },
  glass: { colour: 0xbcd0d8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32 },
  glassFrosted: {
    colour: 0xc9d4d8,
    roughness: 0.62,
    metalness: 0.05,
    transparent: true,
    opacity: 0.55,
  },
  plasticWhite: { colour: 0xd8d6d0, roughness: 0.42, metalness: 0.02 },
  // Deep slate-blue rather than neutral near-black — see the note on `laminateDark`.
  plasticBlack: {
    colour: 0x2b3040,
    roughness: 0.38,
    metalness: 0.04,
    rim: { colour: 0x9ab4d0, strength: 0.2 },
  },
  plasticClear: {
    colour: 0xc4cfd2,
    roughness: 0.12,
    metalness: 0.03,
    transparent: true,
    opacity: 0.42,
  },
  plasticRed: { colour: 0x9c3a34, roughness: 0.4, metalness: 0.02 },
  plasticBlue: { colour: 0x3a5a80, roughness: 0.4, metalness: 0.02 },
  plasticGreen: { colour: 0x4a7250, roughness: 0.4, metalness: 0.02 },
  rubber: { colour: 0x2c2e30, roughness: 0.92, metalness: 0 },
  fabricSofa: {
    colour: 0x6b6257,
    roughness: 0.94,
    metalness: 0,
    wear: { streaks: 1600, blotches: 50, seed: 53, normalScale: 0.7 },
  },
  fabricBed: {
    colour: 0xa9a096,
    roughness: 0.95,
    metalness: 0,
    wear: { streaks: 1400, blotches: 60, seed: 59, normalScale: 0.75 },
  },
  fabricTowel: {
    colour: 0x8f9aa0,
    roughness: 0.97,
    metalness: 0,
    wear: { streaks: 1800, seed: 61, normalScale: 0.85 },
  },
  fabricRug: {
    colour: 0x7d6b58,
    roughness: 0.96,
    metalness: 0,
    wear: { streaks: 2000, blotches: 70, seed: 67, normalScale: 0.8 },
  },
  fabricClothes: {
    colour: 0x5d6470,
    roughness: 0.93,
    metalness: 0,
    wear: { streaks: 1200, seed: 71, normalScale: 0.7 },
  },
  paper: { colour: 0xd6cfc0, roughness: 0.8, metalness: 0 },
  cardboard: { colour: 0xa0866a, roughness: 0.86, metalness: 0 },
  foil: { colour: 0xb8bcc0, roughness: 0.28, metalness: 0.85 },
  wood: {
    colour: 0x8a6f4e,
    roughness: 0.6,
    metalness: 0.02,
    wear: { streaks: 1000, grain: 'horizontal', seed: 73, normalScale: 0.5 },
    // Warm and soft: the table and chair legs are the props a scout is most often silhouetted
    // against, and they must not compete with steel for the eye.
    rim: { colour: 0xc9a884, strength: 0.18 },
  },
  woodDark: {
    colour: 0x4e3d2c,
    roughness: 0.62,
    metalness: 0.02,
    wear: { streaks: 900, grain: 'horizontal', seed: 79, normalScale: 0.5 },
  },
  leather: { colour: 0x4a3a30, roughness: 0.66, metalness: 0.03 },
  crumb: { colour: 0xbfa274, roughness: 0.86, metalness: 0 },
  rice: { colour: 0xe6e2d6, roughness: 0.7, metalness: 0.02 },
  water: { colour: 0x7fa0b0, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.5 },
  grime: { colour: 0x54493d, roughness: 0.94, metalness: 0 },
  screenOff: { colour: 0x14161a, roughness: 0.1, metalness: 0.1 },
  cable: { colour: 0x1f2124, roughness: 0.7, metalness: 0.02 },
  brass: { colour: 0x9c8047, roughness: 0.3, metalness: 0.85 },
};

export interface MaterialLibrary {
  get(id: MaterialId): THREE.MeshStandardMaterial;
  /** A private copy, for a prop that needs to tint or animate without touching the shared one. */
  clone(id: MaterialId, colour?: number): THREE.MeshStandardMaterial;
  stats(): { readonly materials: number; readonly textures: number };
  dispose(): void;
}

export function createMaterials(): MaterialLibrary {
  const cache = new Map<MaterialId, THREE.MeshStandardMaterial>();
  const clones: THREE.Material[] = [];
  const disposers: (() => void)[] = [];
  let textures = 0;

  const build = (id: MaterialId): THREE.MeshStandardMaterial => {
    const spec = SPECS[id];
    /*
     * `NightStandardMaterial`, not `MeshStandardMaterial`.
     *
     * The only line in this file the night direction touches, and deliberately the only one: the
     * forty-two specs below stay exactly as authored while the shading model changes underneath
     * them. The subclass carries the shared `onBeforeCompile` on its prototype, which is what makes
     * the hook survive `occlusion.ts` cloning occluder materials — see `view/night.ts`.
     */
    const material = new NightStandardMaterial({
      color: spec.colour,
      roughness: spec.roughness,
      metalness: spec.metalness,
    });
    /*
     * The rim rides on `userData`, not on a constructor parameter.
     *
     * `onBeforeCompile` runs as a method, so the shared hook in `night.ts` reads it off `this`. That
     * keeps the GLSL byte-identical across all forty-two materials — one `customProgramCacheKey`,
     * one program — while every material still gets its own rim colour and strength as uniforms.
     * `userData` also survives `clone()`, which is what the occlusion system does to occluders.
     */
    if (spec.rim) material.userData.rim = spec.rim;

    if (spec.emissive !== undefined) {
      material.emissive = new THREE.Color(spec.emissive);
      material.emissiveIntensity = spec.emissiveIntensity ?? 1;
    }
    if (spec.transparent) {
      material.transparent = true;
      material.opacity = spec.opacity ?? 1;
    }
    if (spec.wear) {
      // `applyWear` mutates and is not idempotent — it multiplies the base colour each call — so it
      // is applied exactly once, here, at construction.
      const applied = applyWear(material, spec.wear);
      disposers.push(applied.dispose);
      textures += 2;
    }
    return material;
  };

  const library: MaterialLibrary = {
    get(id) {
      const existing = cache.get(id);
      if (existing) return existing;
      const made = build(id);
      cache.set(id, made);
      return made;
    },
    clone(id, colour) {
      const copy = library.get(id).clone();
      if (colour !== undefined) copy.color = new THREE.Color(colour);
      clones.push(copy);
      return copy;
    },
    stats() {
      return { materials: cache.size + clones.length, textures };
    },
    dispose() {
      for (const dispose of disposers) dispose();
      for (const material of cache.values()) material.dispose();
      for (const material of clones) material.dispose();
      cache.clear();
      clones.length = 0;
      disposers.length = 0;
      textures = 0;
    },
  };

  return library;
}

import * as THREE from 'three';

/**
 * 야광 접사 — the night look, phase one: plumbing only.
 *
 * ## What this direction is
 *
 * The kitchen at night is composed as overlapping patches of coloured light on hue-SHIFTED darks.
 * Nothing in the room is allowed to be flat black, and nothing is allowed to be flat white either.
 * It was chosen over four other stylised directions because it is the only one whose darkness is
 * produced by a mechanism rather than painted on: an environment gradient varies the dark by
 * SURFACE NORMAL, so a cabinet face and the floor in front of it separate without either of them
 * being given a texture.
 *
 * Three judges, reviewing three different proposals, independently named the same §7 entry — "large
 * unbroken blue-black rectangles" — as the fatal risk of painting darkness as a colour. This file
 * exists to make that failure mode unreachable rather than to mitigate it afterwards.
 *
 * ## Why a MATERIAL SUBCLASS and not a patched instance
 *
 * `src/view/occlusion.ts` clones the material of every registered occluder, and there are 133
 * `clone` call sites across the prop kit. `THREE.Material.copy()` does not copy `onBeforeCompile` —
 * so a hook installed on instances silently vanishes from exactly the objects the occlusion system
 * touches, and a probe would then measure a painted floor next to unpainted cabinets and report a
 * number that is true of neither.
 *
 * `Material.clone()` is `new this.constructor().copy(this)`. A subclass therefore survives every one
 * of those call sites without any of them being edited. And because three's default
 * `customProgramCacheKey()` returns `onBeforeCompile.toString()`, one shared function on the
 * prototype means one cache key: the program count does not move.
 *
 * ## Phase one does nothing to the pixels on purpose
 *
 * `patch` below is empty. This commit installs the subclass, the gradient environment and the fog
 * rescale, and then MEASURES whether the fragment stage is actually reachable — before forty-two
 * material specs are repainted against it. If the environment does not drive pure black to zero,
 * the plumbing is wrong, and no amount of authoring on top would have revealed that.
 */

/**
 * The shared shader hook, on the prototype so clones keep it.
 *
 * Empty in phase one. When it is filled it must stay a SINGLE function for the whole material
 * library — the moment there are two, `customProgramCacheKey` produces two keys, materials split
 * their programs, and §10's "zero shader-compilation stalls during validated active play" gate
 * starts failing on a frame nobody can predict.
 */
/**
 * Per-material rim settings, read off the material itself.
 *
 * `onBeforeCompile` is invoked as a method, so `this` is the material being compiled. That is what
 * lets ONE shared function serve forty-two differently-tuned materials: the GLSL is identical (so
 * `customProgramCacheKey` yields one key and the program count does not move) and everything that
 * differs is a uniform.
 */
export interface RimSettings {
  /** Rim colour. Warm on wood, cool on steel and plaster — it is a light, not an outline. */
  readonly colour: number;
  /** 0 disables. Above ~0.5 it stops reading as light and starts reading as a sticker. */
  readonly strength: number;
}

const NO_RIM: RimSettings = { colour: 0x000000, strength: 0 };

/**
 * The shared shader hook.
 *
 * A Fresnel rim: surfaces turning away from the viewer pick up a little light along their
 * silhouette. It is the mechanism the night direction rests on, because it separates two objects of
 * similar albedo WITHOUT giving either of them a texture — the thing this build has repeatedly
 * failed to do by other means.
 *
 * It also reaches the specific pixels that stayed pure black through phase one. Those turned out
 * not to be "the room is dark" at all: measured by tile, they clustered on the vertical slot
 * between cabinet doors and the backs of props in the lower left — `laminateDark` and
 * `plasticBlack`, whose albedos are so low that no amount of ambient irradiance survives the tone
 * curve. A rim is additive and independent of albedo, so it lifts exactly those.
 *
 * Must stay a SINGLE function for the whole library. Two functions means two cache keys, every
 * material splits its program, and §10's "zero shader-compilation stalls" gate fails on a frame
 * nobody can predict.
 */
function patch(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms): void {
  const rim = (this.userData.rim as RimSettings | undefined) ?? NO_RIM;
  shader.uniforms.uRimColour = { value: new THREE.Color(rim.colour) };
  shader.uniforms.uRimStrength = { value: rim.strength };

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform vec3 uRimColour;\nuniform float uRimStrength;',
    )
    .replace(
      '#include <opaque_fragment>',
      [
        // `vViewPosition` is the fragment-to-camera vector in view space; `normal` is the shaded
        // normal. Their disagreement is the silhouette.
        'float nightRim = 1.0 - clamp( abs( dot( normalize( vViewPosition ), normal ) ), 0.0, 1.0 );',
        // Cubed so the rim stays a narrow band at the edge rather than a wash across the whole
        // surface, which is how a Fresnel term turns into the "glowing circle" §7 bans.
        'outgoingLight += uRimColour * pow( nightRim, 3.0 ) * uRimStrength;',
        '#include <opaque_fragment>',
      ].join('\n'),
    );
}

export class NightStandardMaterial extends THREE.MeshStandardMaterial {
  constructor(parameters?: THREE.MeshStandardMaterialParameters) {
    super(parameters);
    this.onBeforeCompile = patch;
  }
}

/**
 * The environment gradient that replaces the flat ambient term.
 *
 * A single `AmbientLight` adds the same value to every fragment regardless of which way it faces,
 * which is precisely why the current frames have three large planes sitting within 12° of hue of
 * one another. An environment map is the cheapest thing in three.js that makes the dark side of an
 * object depend on where that object is pointing.
 *
 * Authored as a canvas because the build ships no runtime assets — the same seeded-canvas route
 * `surfaces.ts` already uses for wear. Cool overhead (the window and the borrowed hallway light are
 * both cool), warm-plum underside (bounce off wood floor and cabinet carcass). Neither end is
 * neutral, so no surface can resolve to grey.
 */
const SKY = '#4d6b82';
const HORIZON = '#3a3f4a';
const GROUND = '#3b2a2d';

export function makeGradientEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context for the night gradient');

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, SKY);
  // Not at 0.5: the horizon sits high because the camera looks DOWN at a floor, so most of what any
  // upward-facing surface sees is the lower half of this gradient.
  gradient.addColorStop(0.62, HORIZON);
  gradient.addColorStop(1, GROUND);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const source = new THREE.CanvasTexture(canvas);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(source);
  pmrem.dispose();
  source.dispose();
  return target.texture;
}

/**
 * A 1×1 white texture for spot slots that carry no gobo.
 *
 * `WebGLLights` counts how many spot lights have a `.map` and folds that count into the program
 * cache key. `lighting.ts` re-points its six slots every frame by irradiance, so if only some of
 * them carried a map the count would change mid-play and every shader in the scene would recompile
 * — a stall §10 forbids outright. Assigning a white map to all six pins the count at six.
 */
export function makeWhitePixel(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

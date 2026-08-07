import * as THREE from 'three';
import { MM_PER_UNIT, mm } from '../world/units';
import type { LightSpec, RegionSpec } from '../world/types';

/**
 * Lighting.
 *
 * ## Every light is motivated
 *
 * There is no ambient fill that exists because the scene was too dark. Each authored light
 * corresponds to a visible object: moonlight through the kitchen window, the strip under the wall
 * units, a television, a phone face-down on a duvet. That constraint is what makes the flat read as
 * a place at night rather than as a lit diagram.
 *
 * ## Luminous intensity is a UNIT and must be converted like one
 *
 * three.js point and spot lights are physical: irradiance is `intensity / distance²`, with distance
 * in WORLD UNITS. One world unit here is 1.346 mm, so a ceiling light 1.4 m up is ~1 040 units away
 * and an authored intensity of 1.5 delivers 1.5/1040² ≈ 1.4e-6 — nothing.
 *
 * That is a missing conversion, not a tuning error, and it produced a completely black scene while
 * 2 760 draw calls were being submitted every frame. A control test with a bright clear colour
 * proved the geometry was rendering and received no light. Intensities in `LightSpec` are authored
 * as if the world were metres and scaled here by (units per metre)².
 *
 * ## Why a fixed pool instead of one three.js light per authored light
 *
 * three.js bakes the light count into every material's program, so adding or removing a light
 * mid-play recompiles every shader in the scene — a stall the performance contract forbids. And a
 * forward renderer evaluates EVERY light for EVERY fragment, so having all 26 authored lights live
 * meant paying for the whole apartment's rig in every room. Measured on real Chrome / Apple M1:
 * **GPU p50 70.9 ms** with 26 lights.
 *
 * So the count is constant. `LIGHT_SLOTS` real lights exist for the lifetime of the scene, and each
 * frame they are re-pointed at whichever authored lights actually reach the camera's focus, ranked
 * by irradiance. The shader is compiled once; the room you are in is the room that is lit.
 */

const UNITS_PER_METRE = 1000 / MM_PER_UNIT;
const CANDELA_SCALE = UNITS_PER_METRE * UNITS_PER_METRE;

/** Baseline so a room is never pure black. Deliberately small and cool — this is night. */
const NIGHT_AMBIENT = 0.16;
const NIGHT_AMBIENT_COLOUR = 0x22303f;

const SKY_COLOUR = 0x33465c;
const GROUND_COLOUR = 0x271f18;
const HEMI_INTENSITY = 0.34;

/** Positional lights live in the shader at once. Never changes at runtime. */
const LIGHT_SLOTS = 6;

/**
 * How many of the pooled lights cast shadows.
 *
 * Not all six. A shadow map is the most expensive thing a light can do, and the slots are sorted by
 * irradiance at the focus point, so the first two are the ones actually shaping the frame the player
 * is looking at. The rest fill.
 */
const SHADOW_SLOTS = 2;
const SHADOW_MAP = 1024;

/** A spot's cone. Wide, because these stand in for windows and strips as much as for lamps. */
const CONE_ANGLE = 1.05;
const CONE_PENUMBRA = 0.85;
const CONE_DECAY = 1.25;

/** An authored light: data. Never added to the scene. */
interface Authored {
  readonly spec: LightSpec;
  /** Already scaled into physical units. */
  readonly intensity: number;
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly distance: number;
}

export interface RegionLights {
  readonly group: THREE.Group;
  /** How many lights the apartment authors. The pool is chosen from these. */
  readonly count: number;
  /** Slots actually carrying light last frame — surfaced so a perf capture can record it. */
  readonly liveSlots: number;
  /** Re-point the pool. Called once per frame with the camera's focus. */
  retarget(focus: THREE.Vector3, routineLevel: (routine: string) => number): void;
  /**
   * Hand back the shadow render targets.
   *
   * Needed on restart even though the pool itself survives. A shadow map is a `WebGLRenderTarget`
   * that three.js allocates lazily on first shadow render, and swapping the entire scene graph
   * underneath it leaves the old target counted against `renderer.info.memory.textures` while a
   * fresh one is allocated for the new scene. Measured with the restart gate armed: textures
   * 25 -> 45 across twenty restarts, exactly +1 each, and 21 -> 21 with `SHADOW_SLOTS` set to zero.
   *
   * Separate from `dispose()` because the lights, their targets and their tuning must NOT be torn
   * down here — only the GPU memory that is about to be re-derived.
   */
  releaseShadows(): void;
  /**
   * Force every routine light on, for room portraits.
   *
   * A room at night with its television, lamp and ceiling fitting all off is genuinely dark, and
   * "the household is using this room" is one of the cues a reviewer is meant to identify it from.
   */
  showcase: boolean;
  dispose(): void;
}

export function buildLighting(regions: readonly RegionSpec[]): RegionLights {
  const group = new THREE.Group();
  group.name = 'lighting';

  const ambient = new THREE.AmbientLight(NIGHT_AMBIENT_COLOUR, NIGHT_AMBIENT);
  const hemi = new THREE.HemisphereLight(SKY_COLOUR, GROUND_COLOUR, HEMI_INTENSITY);
  group.add(ambient, hemi);

  const authored: Authored[] = [];
  for (const region of regions) {
    // The region's own centre is what an aperture in its wall illuminates — see `describe`.
    const centre = {
      x: (region.bounds.x0 + region.bounds.x1) / 2,
      z: (region.bounds.z0 + region.bounds.z1) / 2,
    };
    for (const spec of region.lights) authored.push(describe(spec, centre));
  }

  const slots: THREE.SpotLight[] = [];
  for (let i = 0; i < LIGHT_SLOTS; i++) {
    const light = new THREE.SpotLight(0xffffff, 0, mm(4200), CONE_ANGLE, CONE_PENUMBRA, CONE_DECAY);
    /*
     * The first `SHADOW_SLOTS` lights cast. Everything in the prop library already calls `shadows()`
     * to set `castShadow`/`receiveShadow` on its meshes — the intent was authored throughout and
     * then never switched on at the renderer, so nothing in the room was grounded to anything. An
     * art review put it first on its list: "nothing casts a shadow — every object in the game
     * floats", and a player independently described the scout as 떠다닌다.
     *
     * Bias is set in world units, where 1 unit = 1.346 mm. The default 0.0001 is meaningless at this
     * scale; a 35 mm insect needs its contact shadow to touch its feet, so the normal bias is a
     * fraction of a millimetre rather than a fraction of a metre.
     */
    light.castShadow = i < SHADOW_SLOTS;
    if (light.castShadow) {
      light.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = mm(0.6);
      light.shadow.camera.near = mm(30);
      light.shadow.camera.far = mm(3000);
      light.shadow.focus = 1;
    }
    // The target must be in the scene graph or three.js never updates its world matrix and the
    // spot silently aims at the world origin — which is exactly what happened before this line
    // existed: the whole flat was lit by one patch in the kitchen's north-west floor corner.
    group.add(light, light.target);
    slots.push(light);
  }

  const scored: { readonly a: Authored; readonly score: number; readonly level: number }[] = [];
  let live = 0;
  let showcase = false;

  return {
    group,
    count: authored.length,
    get showcase() {
      return showcase;
    },
    set showcase(on: boolean) {
      showcase = on;
    },
    get liveSlots() {
      return live;
    },

    retarget(focus, routineLevel) {
      scored.length = 0;
      for (const a of authored) {
        const level = a.spec.routine ? (showcase ? 1 : routineLevel(a.spec.routine)) : 1;
        if (level <= 0.001) continue;
        // Irradiance at the focus point is the honest measure of "does this light matter here".
        const d2 = Math.max(1, a.position.distanceToSquared(focus));
        scored.push({ a, score: (a.intensity * level) / d2, level });
      }
      scored.sort((x, y) => y.score - x.score);

      live = 0;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]!;
        const pick = scored[i];
        if (!pick) {
          slot.intensity = 0;
          continue;
        }
        slot.color.setHex(pick.a.spec.colour);
        slot.intensity = pick.a.intensity * pick.level;
        slot.position.copy(pick.a.position);
        slot.target.position.copy(pick.a.target);
        slot.distance = pick.a.distance;
        slot.target.updateMatrixWorld();
        live++;
      }
    },

    releaseShadows() {
      for (const slot of slots) {
        if (!slot.castShadow) continue;
        slot.shadow.map?.dispose();
        slot.shadow.map = null;
        slot.shadow.mapPass?.dispose();
        slot.shadow.mapPass = null;
      }
    },

    dispose() {
      for (const slot of slots) {
        slot.target.removeFromParent();
        slot.removeFromParent();
        slot.dispose();
      }
      ambient.removeFromParent();
      hemi.removeFromParent();
      slots.length = 0;
      authored.length = 0;
    },
  };
}

/**
 * Reduce an authored `LightSpec` to position, aim and physical intensity.
 *
 * A window or a strip would ideally be a `RectAreaLight`, but that needs the LTC lookup textures —
 * a runtime asset this build will not ship — and cannot cast shadows. A wide, soft spot aimed inward
 * from the aperture is the closest honest approximation: the falloff across a worktop from a 1.1 m
 * window is what sells it, and a spot reproduces that.
 */
function describe(spec: LightSpec, centre: { x: number; z: number }): Authored {
  const position = new THREE.Vector3(spec.at.x, spec.at.y, spec.at.z);

  if (spec.kind === 'spot' && spec.target) {
    return {
      spec,
      intensity: spec.intensity * CANDELA_SCALE,
      position,
      target: new THREE.Vector3(spec.target.x, spec.target.y, spec.target.z),
      distance: spec.distance ?? mm(2400),
    };
  }

  if (spec.kind === 'point') {
    // A point light has no aim; give it one straight down so the pooled spot approximates it.
    return {
      spec,
      intensity: spec.intensity * CANDELA_SCALE,
      position,
      target: new THREE.Vector3(spec.at.x, spec.at.y - mm(400), spec.at.z),
      distance: spec.distance ?? mm(1400),
    };
  }

  /*
   * A rect aperture — a window, a balcony door, an under-cabinet strip — aims at the CENTRE OF ITS
   * OWN ROOM.
   *
   * It used to aim at a hardcoded `+Z` offset, which is only ever correct for an aperture on a
   * room's low-z wall. The living room's balcony door sits on the SOUTH wall at z = 5460 with the
   * room spanning 1300…5500, so its moonlight — the room's only standing light — was aimed at
   * z = 5960, straight out of the building. The living room rendered essentially black and could
   * not be identified at all. The kitchen window happened to work only because it is on an east
   * wall where both the `-X` and `+Z` nudges point inward.
   *
   * Aiming at the room centre is right for every wall by construction, and the falloff across the
   * floor is what makes a window read as a window.
   */
  const height = spec.height ?? mm(600);
  return {
    spec,
    intensity: spec.intensity * CANDELA_SCALE,
    position,
    target: new THREE.Vector3(centre.x, Math.max(0, spec.at.y - height), centre.z),
    distance: mm(6000),
  };
}

/**
 * Renderer setup.
 *
 * ACES filmic tone mapping, because a night interior with a few bright sources is exactly the case
 * where linear output clips the highlights and crushes everything else into one flat dark mass.
 *
 * Shadow mapping is ON, for the two brightest pooled lights only.
 *
 * It used to be off, with the note "no authored light casts shadows, so enabling it bought a shadow
 * pass that rendered geometry for nothing" — which is circular: the lights did not cast because
 * nobody had turned them on. The visible consequence was that no object in the room was attached to
 * the surface under it. Every prop builder already asks for shadows via `shapes.ts` `shadows()`.
 *
 * PCF soft, because a hard edge at 35 mm scale reads as a decal rather than as contact.
 */
export function configureRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

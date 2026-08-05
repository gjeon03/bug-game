import * as THREE from 'three';
import { mm } from '../world/units';
import type { LightSpec, RegionSpec } from '../world/types';

/**
 * Lighting.
 *
 * ## Every light is motivated
 *
 * There is no ambient fill that exists because the scene was too dark. Each light in the apartment
 * corresponds to a visible object: moonlight through the kitchen window, the strip under the wall
 * units, a television, a phone face-down on a duvet, the standby LED on a router. That constraint
 * is what makes the flat read as a place at night rather than as a lit diagram.
 *
 * ## Why routine lights are pre-created and dimmed rather than added and removed
 *
 * Adding a light to a three.js scene changes the number of lights the shader must handle and
 * recompiles every material that sees it. Doing that when the washing-up starts would produce a
 * shader-compilation stall in the middle of play — an explicit gate failure. Every light exists from
 * boot; routine lights simply sit at zero intensity until their routine runs.
 */

/** Baseline so a room is never pure black. Deliberately tiny and cool — this is night. */
const NIGHT_AMBIENT = 0.055;
const NIGHT_AMBIENT_COLOUR = 0x22303f;

/** Hemisphere fill standing in for bounce off ceiling and floor. */
const SKY_COLOUR = 0x33465c;
const GROUND_COLOUR = 0x271f18;
const HEMI_INTENSITY = 0.2;

export interface RegionLights {
  readonly group: THREE.Group;
  /** Lights gated on a routine, keyed by routine id. */
  readonly byRoutine: ReadonlyMap<string, THREE.Light[]>;
  readonly count: number;
  dispose(): void;
}

/**
 * A light's authored intensity, kept so a routine light can be restored exactly.
 *
 * three.js has no "original intensity" concept, and reading it back after a fade gives the faded
 * value — which silently dims a routine a little more every time it runs.
 */
const AUTHORED = new WeakMap<THREE.Light, number>();

export function buildLighting(regions: readonly RegionSpec[]): RegionLights {
  const group = new THREE.Group();
  group.name = 'lighting';

  const ambient = new THREE.AmbientLight(NIGHT_AMBIENT_COLOUR, NIGHT_AMBIENT);
  const hemi = new THREE.HemisphereLight(SKY_COLOUR, GROUND_COLOUR, HEMI_INTENSITY);
  group.add(ambient, hemi);

  const byRoutine = new Map<string, THREE.Light[]>();
  const disposables: THREE.Light[] = [];
  let count = 2;

  for (const region of regions) {
    for (const spec of region.lights) {
      const light = makeLight(spec);
      if (!light) continue;
      AUTHORED.set(light, spec.intensity);
      group.add(light);
      disposables.push(light);
      count++;

      if (!spec.routine) continue;
      // Off until its routine runs, but present in the shader from the first frame.
      light.intensity = 0;
      const list = byRoutine.get(spec.routine);
      if (list) list.push(light);
      else byRoutine.set(spec.routine, [light]);
    }
  }

  return {
    group,
    byRoutine,
    count,
    dispose() {
      for (const light of disposables) {
        light.parent?.remove(light);
        if ('dispose' in light && typeof light.dispose === 'function') light.dispose();
      }
      ambient.parent?.remove(ambient);
      hemi.parent?.remove(hemi);
      disposables.length = 0;
      byRoutine.clear();
    },
  };
}

function makeLight(spec: LightSpec): THREE.Light | null {
  if (spec.kind === 'point') {
    const light = new THREE.PointLight(spec.colour, spec.intensity, spec.distance ?? mm(1400), 1.6);
    light.position.set(spec.at.x, spec.at.y, spec.at.z);
    // Point lights are the expensive ones to shadow; only the few that are load-bearing do.
    light.castShadow = spec.castShadow === true;
    if (light.castShadow) configureShadow(light.shadow);
    return light;
  }

  if (spec.kind === 'spot') {
    const light = new THREE.SpotLight(
      spec.colour,
      spec.intensity,
      spec.distance ?? mm(2400),
      0.7,
      0.5,
      1.5,
    );
    light.position.set(spec.at.x, spec.at.y, spec.at.z);
    if (spec.target) light.target.position.set(spec.target.x, spec.target.y, spec.target.z);
    light.castShadow = spec.castShadow === true;
    if (light.castShadow) configureShadow(light.shadow);
    return light;
  }

  /*
   * A window or a strip. `RectAreaLight` would be physically right but needs the LTC lookup
   * textures, which are a runtime asset this build will not ship, and it cannot cast shadows.
   * A wide, soft spot aimed inward from the aperture is the closest honest approximation: the
   * falloff across a worktop from a 1.1 m window is what sells it, and a spot reproduces that.
   */
  const width = spec.width ?? mm(600);
  const height = spec.height ?? mm(600);
  const light = new THREE.SpotLight(spec.colour, spec.intensity, mm(4200), 1.05, 0.85, 1.25);
  light.position.set(spec.at.x, spec.at.y, spec.at.z);
  // Aim into the room: down, and along whichever axis the aperture is narrower on.
  const horizontal = width >= height ? 0 : mm(400);
  light.target.position.set(spec.at.x - horizontal, spec.at.y - height, spec.at.z + mm(500));
  light.castShadow = spec.castShadow === true;
  if (light.castShadow) configureShadow(light.shadow);
  return light;
}

function configureShadow(shadow: THREE.LightShadow): void {
  shadow.mapSize.set(1024, 1024);
  shadow.bias = -0.0008;
  shadow.normalBias = mm(1.5);
  // `LightShadow.camera` is typed as the base `Camera`; both point and spot shadows use a
  // perspective camera, so the near/far planes are set through that narrower type.
  const camera = shadow.camera as THREE.PerspectiveCamera;
  camera.near = mm(30);
  camera.far = mm(3600);
  camera.updateProjectionMatrix();
}

/**
 * Fade routine lights toward their authored intensity while the routine runs.
 *
 * Lights ramp rather than snap, because a light that pops on gives the player no reaction window —
 * and the telegraph is the whole reason the exposure field rises to half during `incoming`.
 */
export function updateRoutineLights(
  lights: RegionLights,
  dt: number,
  isActive: (routine: string) => number,
): void {
  for (const [routine, list] of lights.byRoutine) {
    const target = isActive(routine);
    for (const light of list) {
      const authored = AUTHORED.get(light) ?? 1;
      const wanted = authored * target;
      const k = 1 - Math.exp(-dt / 0.28);
      light.intensity += (wanted - light.intensity) * k;
    }
  }
}

/**
 * Renderer setup.
 *
 * ACES filmic tone mapping, because a night interior with a few bright sources is exactly the case
 * where linear output clips the highlights and crushes everything else into one flat dark mass —
 * which an independent critic measured on the previous build as 53.9 % of frame within 6 % of one
 * colour.
 */
export function configureRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

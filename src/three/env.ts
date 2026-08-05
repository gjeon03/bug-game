import * as THREE from 'three';

/**
 * The kitchen's light rig and reflected environment — now a RUNTIME system.
 *
 * In the Canvas2D build this lived in `tools/bake/lib/rig.mjs` and ran once, offline, to flatten
 * props into sprites. The reboot renders the same geometry live, so the rig moves into the runtime
 * and gains something the bake could never have: the lights move, and every object in the room
 * agrees about it.
 *
 * The environment map is not decoration. In physically based shading a metal has no diffuse
 * response — it is lit almost entirely by what it reflects. Rendered with directional lights alone,
 * every `metalness > 0.9` surface in this kitchen (sink deck, drain flange, taps) goes near-black,
 * and the drain reads as a vinyl record. That was a measured defect in the previous build, fixed by
 * exactly this map. Do not remove it to "simplify lighting".
 *
 * Axes: three.js X = game X (world east), Z = game Y (world south), Y = height. The simulation is
 * still authored on the XZ plane; Y is what the reboot adds.
 */

/** Equirect environment resolution. 512x256 is ample — it is only ever seen as a blurred reflection. */
const ENV_W = 512;
const ENV_H = 256;

/**
 * Paint the night kitchen that metal reflects.
 *
 * Authored, not photographic: a dark room, a bright horizontal band where the under-cabinet LED
 * strip lives, a cool wash above for the window, and a warm smear for the refrigerator seam.
 * Because one map feeds every material, all the kitchen's metal agrees about where the room is.
 */
function paintEnvironment(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ENV_W;
  canvas.height = ENV_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for environment paint');

  // Vertical wash: cold night ceiling above, near-black floor below.
  const sky = ctx.createLinearGradient(0, 0, 0, ENV_H);
  sky.addColorStop(0.0, '#243447');
  sky.addColorStop(0.42, '#33485e');
  sky.addColorStop(0.55, '#141c25');
  sky.addColorStop(1.0, '#070b0f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, ENV_W, ENV_H);

  // Under-cabinet LED strip: the bright band a steel surface catches as a hard specular line.
  const led = ctx.createLinearGradient(0, ENV_H * 0.3, 0, ENV_H * 0.46);
  led.addColorStop(0, 'rgba(226,240,255,0)');
  led.addColorStop(0.5, 'rgba(226,240,255,0.95)');
  led.addColorStop(1, 'rgba(226,240,255,0)');
  ctx.fillStyle = led;
  ctx.fillRect(0, ENV_H * 0.3, ENV_W, ENV_H * 0.16);

  // Refrigerator door seam: a narrow warm slit that keeps steel from reading uniformly cold.
  const seam = ctx.createLinearGradient(ENV_W * 0.66, 0, ENV_W * 0.78, 0);
  seam.addColorStop(0, 'rgba(255,186,110,0)');
  seam.addColorStop(0.5, 'rgba(255,186,110,0.7)');
  seam.addColorStop(1, 'rgba(255,186,110,0)');
  ctx.fillStyle = seam;
  ctx.fillRect(ENV_W * 0.66, ENV_H * 0.34, ENV_W * 0.12, ENV_H * 0.3);

  // Window moonlight: a soft cool pool on the opposite side.
  const moon = ctx.createRadialGradient(
    ENV_W * 0.2,
    ENV_H * 0.26,
    0,
    ENV_W * 0.2,
    ENV_H * 0.26,
    ENV_H * 0.34,
  );
  moon.addColorStop(0, 'rgba(190,216,244,0.65)');
  moon.addColorStop(1, 'rgba(190,216,244,0)');
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, ENV_W, ENV_H);

  return canvas;
}

/**
 * Build the PMREM-filtered environment map.
 *
 * Caller owns disposal — the returned texture lives as long as the scene does, and a restart must
 * dispose it or the texture count climbs on every run. That is a tracked restart-leak gate.
 */
export function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const tex = new THREE.CanvasTexture(paintEnvironment());
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

export interface KitchenLights {
  /** Under-cabinet LED strip — the key light, and the only shadow caster. */
  readonly key: THREE.DirectionalLight;
  /** Refrigerator seam bounce — keeps shadowed faces off flat black. */
  readonly warmFill: THREE.DirectionalLight;
  /** Night sky through the window. */
  readonly sky: THREE.HemisphereLight;
  /** Floor bounce into the toe-kick recess. See `buildLights` for why it is not decoration. */
  readonly floorBounce: THREE.DirectionalLight;
}

/**
 * Kitchen night lighting, in the order the environment motivates them.
 *
 * The previous build learned this the hard way: none of its six lights actually reached the
 * worktop, and an unlit object is a silhouette no matter how well it is modelled. Every light here
 * is motivated by a real fixture in the room.
 */
export function buildLights(scene: THREE.Scene, shadowReach: number): KitchenLights {
  // Under-cabinet LED strip: cool white, from above and slightly behind the camera, so it grazes
  // top faces and leaves front faces in readable shadow.
  const key = new THREE.DirectionalLight(0xdce8f5, 2.35);
  key.position.set(-0.35, 1.0, 0.28).normalize().multiplyScalar(600);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.35;
  key.shadow.camera.left = -shadowReach;
  key.shadow.camera.right = shadowReach;
  key.shadow.camera.top = shadowReach;
  key.shadow.camera.bottom = -shadowReach;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 3000;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  scene.add(key.target);

  // Refrigerator seam / standby LEDs: a weak warm bounce from screen-left that keeps shadowed faces
  // off flat black and separates warm plastics from cold steel.
  const warmFill = new THREE.DirectionalLight(0xffcf9a, 0.42);
  warmFill.position.set(0.85, 0.22, -0.4).normalize().multiplyScalar(600);
  scene.add(warmFill);

  // Night sky through the window: hemisphere rather than uniform ambient so undersides stay darker
  // than tops, which is most of what sells elevation.
  const sky = new THREE.HemisphereLight(0x9fc2e8, 0x0a0f16, 0.55);
  scene.add(sky);

  /*
   * Floor bounce into the toe-kick recess.
   *
   * MEASURED CORRECTION (proof-16). Giving the cabinet laminate albedo, normal and roughness maps
   * raised its surface structure 4.8x — but its MEAN LUMINANCE FELL, 0.169 to 0.098. A surface too
   * dark to show the texture it has is flat again by a different route, and "uniform darkness" is on
   * the banned list beside "large unbroken rectangles".
   *
   * The motivated source is real: a pale tiled floor throws the under-cabinet LED spill back up into
   * the recess, which is exactly why a real toe-kick is dim rather than black. Aimed upward and
   * backward, weak, and casting nothing — a bounce that cast shadows would be inventing a light
   * fixture that is not in the room.
   */
  /*
   * MEASURED CORRECTION (proof-17). The first attempt used `multiplyScalar(-600)`, which put the
   * light at (-49, +488, -351) — ABOVE and BEHIND. A directional light there shines downward, so it
   * lit the worktop and left the cabinet front exactly as dark as before: the cabinet patch was
   * identical to seven significant figures while 4.5 % of the frame changed elsewhere.
   *
   * A surface is lit when the vector to the light has a positive dot product with its normal. The
   * cabinet front faces +Z, so the light must sit at positive Z; to arrive from below it must sit at
   * negative Y. Hence a POSITIVE scalar on (0.1, -1, 0.72). Same class of sign error as the legs and
   * the antennae — and found the same way, by evaluating the vector instead of trusting the number.
   */
  const floorBounce = new THREE.DirectionalLight(0xb9c9d6, 1.4);
  floorBounce.position.set(0.1, -1, 0.72).normalize().multiplyScalar(600);
  scene.add(floorBounce);
  scene.add(floorBounce.target);

  return { key, warmFill, sky, floorBounce };
}

/**
 * Apply the renderer's colour and tone-mapping contract.
 *
 * ACES filmic rather than linear: the kitchen's dynamic range runs from a near-black under-cabinet
 * void to a specular hit on polished steel, and linear output clips the latter into a flat white
 * blob. Kept in one function so every entry point (game, proof scene, evidence capture) is
 * guaranteed to agree — a screenshot taken under different tone mapping is not evidence.
 */
export function configureRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

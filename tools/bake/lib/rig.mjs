import * as THREE from 'three';
import { BAKE_PPU, CAMERA_TILT_DEG, SSAA } from './units.mjs';

/**
 * The single camera and light rig every prop is baked through.
 *
 * Style consistency is not a review step, it is an invariant enforced here: because every sprite in
 * the game passes through this one function, no two props can disagree about where the light comes
 * from or how steeply they are viewed. That is the difference between an authored world and a pile
 * of clip art.
 *
 * Axes: three.js X = game X (screen right), three.js Z = game Y (screen down), three.js Y = height.
 */

const TILT = (CAMERA_TILT_DEG * Math.PI) / 180;

const RIGHT = new THREE.Vector3(1, 0, 0);
/** Unit vector from the scene origin toward the camera. */
export const VIEW_DIR = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT)).normalize();
/** Screen-up in world space. */
export const SCREEN_UP = new THREE.Vector3().crossVectors(RIGHT, VIEW_DIR).normalize();

/**
 * Kitchen night lighting, in the order the environment spec motivates them.
 *
 * Only STATIC lights belong in a baked sprite. The moving torch beam is a threat telegraph and is
 * deliberately absent — baking it would nail a moving light to every object in the room.
 */
export function buildLights(scene) {
  // Under-cabinet LED strip: the key light. Cool white, from above and slightly behind the camera,
  // so it grazes top faces and leaves front faces in readable shadow.
  const key = new THREE.DirectionalLight(0xdce8f5, 2.35);
  key.position.set(-0.35, 1.0, 0.28).normalize().multiplyScalar(600);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.35;
  scene.add(key);

  // Refrigerator seam / standby LEDs: a weak warm bounce from screen-left that keeps shadowed
  // faces off flat black and separates warm plastics from cold steel.
  const warmFill = new THREE.DirectionalLight(0xffcf9a, 0.42);
  warmFill.position.set(0.85, 0.22, -0.4).normalize().multiplyScalar(600);
  scene.add(warmFill);

  // Night sky through the window: cold ambient pooling in upward-facing surfaces. Hemisphere
  // rather than uniform ambient so undersides stay darker than tops, which is most of what sells
  // elevation in a near-top-down view.
  scene.add(new THREE.HemisphereLight(0x9fc2e8, 0x0a0f16, 0.55));

  return { key, warmFill };
}

/**
 * The night-kitchen environment that metals actually reflect.
 *
 * This is not decoration — it is the difference between steel and black. In physically based
 * shading a metal has no diffuse response, so it is lit almost entirely by what it reflects. Baked
 * with directional lights alone, every `metalness > 0.9` surface in this kitchen (sink deck, drain
 * flange, strainer basket, taps) rendered near-black, and the drain read as a vinyl record. The
 * environment supplies the reflected world those surfaces need.
 *
 * It is authored, not photographic: a dark room, a bright horizontal band where the under-cabinet
 * LED strip lives, a cool wash above for the window, and a warm smear for the refrigerator seam.
 * Because the same map feeds every prop, all the kitchen's metal agrees about where the room is.
 */
function buildEnvironment(renderer) {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Vertical wash: cold night ceiling above, near-black floor below.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0.0, '#243447');
  sky.addColorStop(0.42, '#33485e');
  sky.addColorStop(0.55, '#141c25');
  sky.addColorStop(1.0, '#070b0f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Under-cabinet LED strip: the bright band a steel surface catches as a hard specular line.
  const led = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.46);
  led.addColorStop(0, 'rgba(226,240,255,0)');
  led.addColorStop(0.5, 'rgba(226,240,255,0.95)');
  led.addColorStop(1, 'rgba(226,240,255,0)');
  ctx.fillStyle = led;
  ctx.fillRect(0, H * 0.3, W, H * 0.16);

  // Refrigerator door seam: a narrow warm slit that keeps steel from reading uniformly cold.
  const seam = ctx.createLinearGradient(W * 0.66, 0, W * 0.78, 0);
  seam.addColorStop(0, 'rgba(255,186,110,0)');
  seam.addColorStop(0.5, 'rgba(255,186,110,0.7)');
  seam.addColorStop(1, 'rgba(255,186,110,0)');
  ctx.fillStyle = seam;
  ctx.fillRect(W * 0.66, H * 0.34, W * 0.12, H * 0.3);

  // Window moonlight: a soft cool pool on the opposite side.
  const moon = ctx.createRadialGradient(W * 0.2, H * 0.26, 0, W * 0.2, H * 0.26, H * 0.34);
  moon.addColorStop(0, 'rgba(190,216,244,0.65)');
  moon.addColorStop(1, 'rgba(190,216,244,0)');
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

let cachedEnv = null;
function environmentFor(renderer) {
  if (!cachedEnv) cachedEnv = buildEnvironment(renderer);
  return cachedEnv;
}

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
// Screen "up" maps to world -Z (further from the viewer) for a top-down game.
camera.up.set(0, 0, -1);

/**
 * Render one prop to a tightly-cropped RGBA sprite.
 *
 * Returns pixel dimensions plus the anchor: where the object's ground origin (0,0,0) sits inside
 * the sprite. The 2D renderer places sprites by that anchor, which is what keeps a 3D-baked object
 * standing in the right place on a 2D floor and sorting correctly against its neighbours.
 */
export function renderProp(renderer, object, opts = {}) {
  const padUnits = opts.pad ?? 3;
  const scene = new THREE.Scene();
  scene.environment = environmentFor(renderer);
  scene.environmentIntensity = opts.envIntensity ?? 1.0;
  buildLights(scene);

  // A ground plane invisible except where the prop's shadow falls. Baking the contact shadow into
  // the sprite is what gives every object weight and stops it floating.
  if (opts.shadow !== false) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.ShadowMaterial({ opacity: opts.shadowOpacity ?? 0.55 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }
  scene.add(object);

  // Screen-space bounds from the projected corners of the world bounding box, so a tall object
  // gets the extra vertical room its tilt-projected height needs.
  const box = new THREE.Box3().setFromObject(object);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const sx of [box.min.x, box.max.x]) {
    for (const sy of [box.min.y, box.max.y]) {
      for (const sz of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(sx, sy, sz);
        const px = p.dot(RIGHT);
        const py = p.dot(SCREEN_UP);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  minX -= padUnits;
  maxX += padUnits;
  minY -= padUnits;
  maxY += padUnits;

  const wUnits = maxX - minX;
  const hUnits = maxY - minY;
  const w = Math.max(2, Math.ceil(wUnits * BAKE_PPU));
  const h = Math.max(2, Math.ceil(hUnits * BAKE_PPU));

  camera.left = minX;
  camera.right = minX + w / BAKE_PPU;
  camera.top = minY + h / BAKE_PPU;
  camera.bottom = minY;
  const focus = new THREE.Vector3(0, 0, 0);
  camera.position.copy(focus).addScaledVector(VIEW_DIR, 1500);
  camera.lookAt(focus);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // The shadow frustum must cover the prop or the contact shadow clips to a hard square.
  const reach = Math.max(wUnits, hUnits) * 1.2 + 40;
  for (const l of scene.children) {
    if (!l.isDirectionalLight || !l.castShadow) continue;
    l.shadow.camera.left = -reach;
    l.shadow.camera.right = reach;
    l.shadow.camera.top = reach;
    l.shadow.camera.bottom = -reach;
    l.shadow.camera.near = 1;
    l.shadow.camera.far = 3000;
    l.shadow.camera.updateProjectionMatrix();
  }

  renderer.setSize(w * SSAA, h * SSAA, false);
  renderer.render(scene, camera);

  return {
    w,
    h,
    // Anchor: where world origin lands inside the sprite, in output pixels from the top-left.
    anchorX: (0 - minX) * BAKE_PPU,
    anchorY: (maxY - 0) * BAKE_PPU,
    ssaa: SSAA,
  };
}

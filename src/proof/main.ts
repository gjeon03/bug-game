import * as THREE from 'three';
import './proof.css';
import { buildEnvironment, buildLights, configureRenderer } from '../three/env';

/*
 * The parametric prop library is plain ESM JavaScript shared with the offline bake tool. It models
 * every object in real millimetres through one scale anchor, which is the single most valuable
 * thing the previous build produced — so the reboot promotes it from "sprite source" to "live scene
 * geometry" rather than re-authoring it. Porting it to TypeScript is production work, not proof
 * work; the `@ts-expect-error` is the honest marker that this is a temporary seam.
 */
// @ts-expect-error — untyped .mjs shared with tools/bake
import { SINK_PROPS } from '../../tools/bake/props/sink.mjs';
// @ts-expect-error — untyped .mjs shared with tools/bake
import { counterStone, laminate, steelBrushed } from '../../tools/bake/lib/materials.mjs';
import { createRoachAssets, type Roach } from '../three/roach';

interface PropSpec {
  build: () => THREE.Object3D;
  shadow?: boolean;
}
type PropRegistry = Record<string, PropSpec>;

const SINK = SINK_PROPS as PropRegistry;

/* ------------------------------------------------------------------ scale */

/**
 * The one scale anchor, mirrored from `tools/bake/lib/units.mjs`.
 *
 * The scout is 26 world units long and a heroic adult German cockroach is 35 mm, so one world unit
 * is ~1.346 mm. Getting this right IS the scale gag: a 200 mm dinner plate becomes 149 units —
 * nearly six scouts across. Authoring "to taste" instead of to millimetres is what collapses a
 * kitchen back into a floor plan.
 */
const MM_PER_UNIT = 35 / 26;
const mm = (millimetres: number): number => millimetres / MM_PER_UNIT;

/* ----------------------------------------------------------------- camera */

/**
 * Camera contract, from CLAUDE.md §3.
 *
 * Low FOV keeps the perspective honest at insect scale — a wide lens on a 35 mm subject produces
 * the fisheye look of a macro photograph taken too close, which reads as a toy. The pitch is deep
 * enough to show the ground plane the game is played on and shallow enough that props keep a front
 * face, which is the whole reason the previous top-down build had no depth.
 */
const CAM_FOV = 34;
const CAM_PITCH_DEG = 46;
const CAM_YAW_DEG = 38;
/**
 * Vertical world span at the focus point; sets camera distance through the FOV.
 *
 * MEASURED CORRECTION (proof-01 -> proof-02): 360 framed a large empty stretch of worktop and
 * pushed the sink and its back wall out of shot, which reproduced the banned "large unbroken
 * blue-black rectangle" defect in three dimensions. Widening brings the backsplash into frame, and
 * a visible back edge is most of what stops a surface reading as an infinite plane.
 */
const CAM_VIEW_UNITS = 300;
/** Seconds for the camera to cover ~63 % of the distance to its target. Damped, never rigid. */
const CAM_LAG = 0.16;

function cameraOffset(): THREE.Vector3 {
  const pitch = THREE.MathUtils.degToRad(CAM_PITCH_DEG);
  const yaw = THREE.MathUtils.degToRad(CAM_YAW_DEG);
  const dist = CAM_VIEW_UNITS / 2 / Math.tan(THREE.MathUtils.degToRad(CAM_FOV) / 2);
  const ground = dist * Math.cos(pitch);
  return new THREE.Vector3(Math.sin(yaw) * ground, dist * Math.sin(pitch), Math.cos(yaw) * ground);
}

/* --------------------------------------------------------------- occlusion */

/**
 * A prop that may be faded when it stands between the camera and the scout.
 *
 * Fading is per logical prop, never per mesh: a cabinet whose door fades while its carcass stays
 * opaque reads as a rendering fault. Materials are cloned on registration so two instances of the
 * same prop fade independently and the shared library material is never mutated.
 */
interface Occluder {
  readonly root: THREE.Object3D;
  readonly materials: THREE.Material[];
  readonly meshes: THREE.Mesh[];
  /** 1 = fully opaque, 0 = fully faded. Eased toward `target` every frame. */
  current: number;
  target: number;
}

/**
 * Reduced opacity, not disappearance — the silhouette has to survive so depth is not destroyed.
 *
 * MEASURED CORRECTION (proof-03): 0.22 was low enough that the mug and the plate stack read as
 * glassware rather than as faded ceramic, and because they went on casting a fully opaque shadow
 * the result looked like a rendering fault instead of an affordance. A faded occluder now stops
 * casting too — you cannot see through an object and still see its solid shadow without the eye
 * calling it a bug.
 */
const FADE_FLOOR = 0.38;
/** Seconds for a full fade in or out. CLAUDE.md §3 mandates 150–300 ms. */
const FADE_SECONDS = 0.22;

function registerOccluder(root: THREE.Object3D): Occluder {
  const materials: THREE.Material[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const cloned = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone();
    mesh.material = cloned;
    for (const m of Array.isArray(cloned) ? cloned : [cloned]) {
      m.transparent = true;
      materials.push(m);
    }
    meshes.push(mesh);
  });
  return { root, materials, meshes, current: 1, target: 1 };
}

/* ------------------------------------------------------------------- scene */

const canvas = document.getElementById('proof') as HTMLCanvasElement;
const objectiveEl = document.getElementById('objective') as HTMLElement;
const readoutEl = document.getElementById('readout') as HTMLElement;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
configureRenderer(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
/**
 * Fog is doing scale work, not weather work. At insect scale a kitchen counter is a landscape, and
 * a little aerial perspective over ~1200 units is what tells the eye that the far end of the
 * worktop is genuinely far away rather than merely smaller.
 */
scene.fog = new THREE.Fog(0x070c12, 700, 2100);

const environment = buildEnvironment(renderer);
scene.environment = environment;
scene.environmentIntensity = 1.0;
const lights = buildLights(scene, 620);

const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 1, 6000);
const CAM_OFFSET = cameraOffset();

/* ------------------------------------------------------- worktop and cabinet */

const COUNTER_HALF_X = mm(620);
/** Shallower than a real 600 mm worktop half-depth so the back wall stays in shot. */
const COUNTER_HALF_Z = mm(330);
const COUNTER_THICK = mm(38);
/** Worktop height above the floor — a real Korean apartment counter, and 24 scouts tall. */
const COUNTER_HEIGHT = mm(880);

/**
 * Low-frequency wear across the worktop.
 *
 * `tools/bake/lib/materials.mjs` records a NEGATIVE RESULT for procedural surface detail: three
 * attempts produced either nothing or a visible repeating grid, because a tiled canvas texture's
 * own seams line up. The escape is to not tile at all — ONE texture stretched across the whole
 * slab, `repeat` left at 1, so there is no period for a grid to form on. It carries no colour, only
 * roughness, so it reads as where the cloth has and has not been rather than as a pattern.
 */
function worktopWear(): THREE.CanvasTexture {
  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for worktop wear');

  ctx.fillStyle = '#6b6b6b';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Deterministic blotches — a bake must be reproducible, so no Math.random.
  let seed = 0x9e3779b9;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < 90; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const r = 40 + rand() * 150;
    const light = rand() > 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, light ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

const worktopMaterial = counterStone() as THREE.MeshStandardMaterial;
worktopMaterial.roughnessMap = worktopWear();

const worktop = new THREE.Mesh(
  new THREE.BoxGeometry(COUNTER_HALF_X * 2, COUNTER_THICK, COUNTER_HALF_Z * 2),
  worktopMaterial,
);
worktop.position.set(0, -COUNTER_THICK / 2, 0);
worktop.receiveShadow = true;
worktop.castShadow = true;
scene.add(worktop);

/**
 * The cabinet carcass under the worktop, with a recessed toe-kick.
 *
 * This is the object the previous build drew as a large blue-black rectangle — the single most
 * reported defect. It is a real box with a real recess here, so the shadow it casts into its own
 * toe-kick is what creates the dark under-cabinet space the colony travels through.
 */
const cabinetFace = new THREE.Mesh(
  new THREE.BoxGeometry(COUNTER_HALF_X * 2, COUNTER_HEIGHT - mm(100), mm(560)),
  laminate(),
);
cabinetFace.position.set(0, -COUNTER_THICK - (COUNTER_HEIGHT - mm(100)) / 2, -mm(60));
cabinetFace.castShadow = true;
cabinetFace.receiveShadow = true;
scene.add(cabinetFace);

const toeKick = new THREE.Mesh(
  new THREE.BoxGeometry(COUNTER_HALF_X * 2, mm(100), mm(400)),
  laminate(0x3b352f),
);
toeKick.position.set(0, -COUNTER_THICK - COUNTER_HEIGHT + mm(50), -mm(140));
toeKick.receiveShadow = true;
scene.add(toeKick);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), laminate(0x474d52));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -COUNTER_THICK - COUNTER_HEIGHT;
floor.receiveShadow = true;
scene.add(floor);

/**
 * The stainless splash-back behind the worktop.
 *
 * Load-bearing for composition, not decoration: it is the vertical the eye needs to stop reading
 * the counter as an endless plane, and being the only large polished-metal surface in shot it is
 * what proves the environment map is doing its job.
 */
const splashback = new THREE.Mesh(
  new THREE.BoxGeometry(COUNTER_HALF_X * 2, mm(210), mm(12)),
  steelBrushed(),
);
splashback.position.set(0, mm(105), -COUNTER_HALF_Z + mm(6));
splashback.castShadow = true;
splashback.receiveShadow = true;
scene.add(splashback);

/* -------------------------------------------------------------------- props */

interface Placement {
  readonly registry: PropRegistry;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  /** Y rotation in degrees. */
  readonly spin?: number;
  /** Register as an occlusion candidate. */
  readonly occludes?: boolean;
}

/*
 * MEASURED CORRECTION (proof-01 -> proof-02).
 *
 * The first layout scattered props across 900 mm of counter, so the framed shot was mostly bare
 * worktop with the drain clipped off the top edge and the jar and detergent bottle entirely out of
 * frame. Authored density is not "more objects" — it is objects arranged so that every part of the
 * frame is doing work. Everything now sits inside the shot, clustered the way a real sink surround
 * accumulates: wet things near the drain, clean things stacked away from it, crumbs where someone
 * actually ate.
 *
 * `steel-panel` is gone. It rendered as a flat dark quad, which is the exact defect this rebuild
 * exists to kill.
 */
const PLACEMENTS: readonly Placement[] = [
  // The sink surround — the hero of this shot.
  { registry: SINK, name: 'sink-drain', x: mm(-150), z: mm(-70) },
  { registry: SINK, name: 'droplet-m', x: mm(-88), z: mm(-6) },
  { registry: SINK, name: 'droplet-s', x: mm(-118), z: mm(34) },
  { registry: SINK, name: 'droplet-s', x: mm(-60), z: mm(62), spin: 60 },
  { registry: SINK, name: 'sponge', x: mm(-58), z: mm(96), spin: 34 },

  // Washed-up crockery, stacked away from the wet zone.
  { registry: SINK, name: 'plate-stack', x: mm(96), z: mm(-176), spin: 12, occludes: true },
  { registry: SINK, name: 'plate-single', x: mm(-16), z: mm(-208), spin: -24 },
  { registry: SINK, name: 'mug', x: mm(196), z: mm(-24), spin: -40, occludes: true },
  { registry: SINK, name: 'jar', x: mm(-268), z: mm(-186), occludes: true },
  { registry: SINK, name: 'detergent-bottle', x: mm(150), z: mm(-186), occludes: true },
  { registry: SINK, name: 'dish-towel', x: mm(-282), z: mm(104), spin: 18 },

  // Crumbs where somebody stood and ate — the colony's reason to cross open ground.
  { registry: SINK, name: 'crumb-a', x: mm(18), z: mm(104) },
  { registry: SINK, name: 'crumb-b', x: mm(56), z: mm(138), spin: 40 },
  { registry: SINK, name: 'crumb-c', x: mm(-8), z: mm(156), spin: -20 },
  { registry: SINK, name: 'crumb-a', x: mm(92), z: mm(80), spin: 110 },
  { registry: SINK, name: 'crumb-b', x: mm(128), z: mm(126), spin: -70 },
];

const occluders: Occluder[] = [];

for (const p of PLACEMENTS) {
  const spec = p.registry[p.name];
  if (!spec) {
    throw new Error(`proof scene references a prop that does not exist: ${p.name}`);
  }
  const object = spec.build();
  object.position.set(p.x, 0, p.z);
  if (p.spin) object.rotation.y = THREE.MathUtils.degToRad(p.spin);
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = spec.shadow !== false;
    mesh.receiveShadow = true;
  });
  scene.add(object);
  if (p.occludes) occluders.push(registerOccluder(object));
}

/* ------------------------------------------------------------------ roaches */

/*
 * MEASURED CORRECTION (proof-02 -> proof-03).
 *
 * The first two proofs built ten discrete gait poses per roach and toggled visibility. On an Apple
 * M1 at 1920x1080 that produced **2,743 geometries and 965 draw calls** for twenty props and five
 * roaches — it held 60 fps only because the scene was tiny, and the brief requires dozens of
 * workers. Pose swapping also steps the legs in ten visible jumps.
 *
 * `src/three/roach.ts` replaces it with one shared-geometry rigid hierarchy per species, animated
 * by analytic two-bone IK on an alternating tripod. Geometry count is now constant in colony size.
 */
const roachAssets = createRoachAssets();

const scout = roachAssets.build({ bodyMm: 35, palette: 'scout', isScout: true });
// Starts on open ground between the crumbs and the drain, so the opening shot frames the sink.
scout.root.position.set(mm(30), 0, mm(60));
scene.add(scout.root);

/* ------------------------------------------------------------ pheromone route */

/**
 * The route the workers actually walk, and the ribbon the player sees.
 *
 * Drawn as a surface-conforming ribbon rather than a glowing line: CLAUDE.md bans neon overlays
 * that dominate the environment, and a scent trace should look like something left behind on the
 * counter, not like a UI element floating above it.
 */
const ROUTE_POINTS = [
  new THREE.Vector3(mm(-150), 0, mm(-70)),
  new THREE.Vector3(mm(-120), 0, mm(20)),
  new THREE.Vector3(mm(-52), 0, mm(96)),
  new THREE.Vector3(mm(30), 0, mm(138)),
  new THREE.Vector3(mm(112), 0, mm(122)),
  new THREE.Vector3(mm(176), 0, mm(58)),
];
const routeCurve = new THREE.CatmullRomCurve3(ROUTE_POINTS);
/** Arc length in world units, so a worker's `t` rate can be converted into real travel speed. */
const routeLength = routeCurve.getLength();

function buildRouteRibbon(curve: THREE.CatmullRomCurve3): THREE.Mesh {
  const SEGMENTS = 140;
  /** A scout is 12 mm across; a worked trail is roughly one body wide, not four. */
  const HALF_WIDTH = mm(4.5);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const side = new THREE.Vector3()
      .crossVectors(tangent, up)
      .normalize()
      .multiplyScalar(HALF_WIDTH);
    // Lifted a hair off the worktop so it never z-fights with the surface it is painted on.
    const y = mm(0.4);
    positions.push(point.x - side.x, y, point.z - side.z);
    positions.push(point.x + side.x, y, point.z + side.z);
    uvs.push(t, 0, t, 1);
    if (i < SEGMENTS) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  /*
   * MEASURED CORRECTION (proof-01 -> proof-02).
   *
   * The first attempt used `AdditiveBlending` at 0.42 over a dark worktop and rendered as a
   * near-WHITE strip that read as paper tape laid on the counter — it dominated the frame and
   * destroyed the "left behind, not drawn on top" quality a scent trace needs. Additive blending
   * cannot preserve a hue against a dark background: it only ever adds toward white.
   *
   * Normal blending at low opacity keeps the amber, and a soft edge falloff through the V
   * coordinate stops the ribbon from having the hard parallel sides of a printed line.
   */
  const material = new THREE.MeshBasicMaterial({
    color: 0xa87a3e,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}

scene.add(buildRouteRibbon(routeCurve));

interface Worker {
  readonly roach: Roach;
  /** Position along the pheromone route, 0..1, wrapping. */
  t: number;
  readonly speed: number;
  phase: number;
}

const workers: Worker[] = [];
for (let i = 0; i < 4; i++) {
  // Half the line is inbound with cargo — a delivery visibly in progress, which the proof scene is
  // required to show. The cargo is held at the mandibles by the model itself; a detached floating
  // dot is on the banned list because that is exactly what the previous build shipped.
  const carrying = i % 2 === 0;
  const roach = roachAssets.build({
    bodyMm: 27,
    palette: carrying ? 'workerPale' : 'workerDark',
  });
  roach.setCargo(carrying);
  scene.add(roach.root);
  workers.push({ roach, t: i / 4, speed: 0.055 + i * 0.006, phase: i * 0.37 });
}

/* --------------------------------------------------- moving household shadow */

/**
 * A person crossing the kitchen, seen only as the shadow they throw.
 *
 * The threat vocabulary of this game is "something enormous moved nearby", and at insect scale you
 * would never see the person — you would see the light change. Implemented as a real caster in the
 * key light's path, so every object in the room re-shadows together and nothing has to be told
 * about it. A painted dark quad would have been cheaper and would have looked exactly like a
 * painted dark quad.
 */
const shadowCaster = new THREE.Mesh(
  new THREE.BoxGeometry(mm(420), mm(30), mm(190)),
  new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 1 }),
);
shadowCaster.castShadow = true;
shadowCaster.position.y = mm(360);
scene.add(shadowCaster);

/* ------------------------------------------------------------------- input */

const held = new Set<string>();
addEventListener('keydown', (e) => {
  held.add(e.code);
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

/* -------------------------------------------------------------------- loop */

const SCOUT_SPEED = mm(150);
const SCOUT_SPRINT = 2.1;

const raycaster = new THREE.Raycaster();
const camTarget = new THREE.Vector3().copy(scout.root.position);
let scoutHeading = 0;
let scoutPhase = 0;
let scoutEffort = 0;
/**
 * World distance covered per complete gait cycle.
 *
 * Driving the phase from distance rather than from elapsed time is what ties the legs to the
 * ground: at half speed the cycle takes twice as long, so the stance foot stays planted instead of
 * sliding. The value is the hind pair's stride, which is the pair that actually propels the animal.
 */
const STRIDE_DISTANCE = mm(17);
let elapsed = 0;
let last = performance.now();
let frames = 0;
let fpsAccum = 0;

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = Math.min(devicePixelRatio, 2);
  if (canvas.width === Math.round(w * dpr) && canvas.height === Math.round(h * dpr)) return;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/**
 * Move the scout on the worktop plane, in camera-relative axes.
 *
 * Camera-relative rather than world-relative because the camera is yawed: with world axes, pressing
 * "up" on a 38°-yawed view sends the scout diagonally, which is the single most common way a
 * diagonal-camera game feels broken.
 */
function moveScout(dt: number): void {
  const yaw = THREE.MathUtils.degToRad(CAM_YAW_DEG);
  let ix = 0;
  let iz = 0;
  if (held.has('KeyW')) iz -= 1;
  if (held.has('KeyS')) iz += 1;
  if (held.has('KeyA')) ix -= 1;
  if (held.has('KeyD')) ix += 1;

  if (ix === 0 && iz === 0) {
    // At rest the legs hold station but the antennae keep searching — `pose` drives them off the
    // same phase, so a slow idle advance is what stops the roach reading as a model of an insect.
    scoutPhase += dt * 0.35;
    scoutEffort += (0 - scoutEffort) * Math.min(1, dt * 6);
    return;
  }

  const len = Math.hypot(ix, iz);
  const nx = ix / len;
  const nz = iz / len;
  const wx = nx * Math.cos(yaw) - nz * Math.sin(yaw);
  const wz = nx * Math.sin(yaw) + nz * Math.cos(yaw);

  const speed = SCOUT_SPEED * (held.has('ShiftLeft') ? SCOUT_SPRINT : 1);
  scout.root.position.x = THREE.MathUtils.clamp(
    scout.root.position.x + wx * speed * dt,
    -COUNTER_HALF_X + mm(20),
    COUNTER_HALF_X - mm(20),
  );
  scout.root.position.z = THREE.MathUtils.clamp(
    scout.root.position.z + wz * speed * dt,
    -COUNTER_HALF_Z + mm(20),
    COUNTER_HALF_Z - mm(20),
  );

  // The roach models face +Z; rotate toward travel and never snap.
  const want = Math.atan2(wx, wz);
  let delta = want - scoutHeading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  scoutHeading += delta * Math.min(1, dt * 12);
  scout.root.rotation.y = scoutHeading;
  // Gait phase is integrated from actual travel, not from wall time, so the legs cannot skate.
  scoutPhase += (dt * speed) / STRIDE_DISTANCE;
  scoutEffort = held.has('ShiftLeft') ? 1.8 : 1;
}

function updateWorkers(dt: number): void {
  for (const w of workers) {
    w.t = (w.t + w.speed * dt) % 1;
    const point = routeCurve.getPointAt(w.t);
    const tangent = routeCurve.getTangentAt(w.t);
    w.roach.root.position.set(point.x, 0, point.z);
    w.roach.root.rotation.y = Math.atan2(tangent.x, tangent.z);
    // Same distance-driven rule as the scout: the curve's arc length per second sets the cadence.
    w.phase += (w.speed * routeLength * dt) / STRIDE_DISTANCE;
    w.roach.pose(w.phase, 1);
  }
}

/**
 * Fade whatever stands between the camera and the scout.
 *
 * Three rays rather than one: a single centre ray pops on and off as a thin object's silhouette
 * crosses the scout's centre, and popping is explicitly disallowed. Sampling a small volume around
 * the body makes the transition follow the actual overlap.
 */
function updateOcclusion(dt: number): void {
  for (const o of occluders) o.target = 1;

  const probes = [
    new THREE.Vector3(0, mm(4), 0),
    new THREE.Vector3(mm(12), mm(4), 0),
    new THREE.Vector3(-mm(12), mm(4), 0),
  ];
  for (const probe of probes) {
    const point = scout.root.position.clone().add(probe);
    const dir = point.clone().sub(camera.position);
    const distance = dir.length();
    raycaster.set(camera.position, dir.normalize());
    raycaster.far = distance;
    for (const o of occluders) {
      if (o.target < 1) continue;
      if (raycaster.intersectObject(o.root, true).length > 0) o.target = FADE_FLOOR;
    }
  }

  const step = dt / FADE_SECONDS;
  for (const o of occluders) {
    if (o.current < o.target) o.current = Math.min(o.target, o.current + step);
    else if (o.current > o.target) o.current = Math.max(o.target, o.current - step);
    const opaque = o.current >= 0.999;
    for (const m of o.materials) {
      m.opacity = o.current;
      // Only pay the transparency sorting cost while actually faded.
      m.depthWrite = opaque;
    }
    for (const mesh of o.meshes) mesh.castShadow = opaque;
  }
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;

  resize();
  moveScout(dt);
  scout.pose(scoutPhase, scoutEffort);
  updateWorkers(dt);

  // Household shadow sweeps across on a slow cycle, then leaves.
  const sweep = (elapsed % 14) / 14;
  shadowCaster.position.x = THREE.MathUtils.lerp(-mm(1400), mm(1400), sweep);
  shadowCaster.position.z = mm(-40) + Math.sin(sweep * Math.PI) * mm(120);
  lights.key.target.position.set(scout.root.position.x, 0, scout.root.position.z);
  lights.key.target.updateMatrixWorld();
  lights.key.position.set(scout.root.position.x - 260, 620, scout.root.position.z + 190);

  camTarget.lerp(scout.root.position, Math.min(1, dt / CAM_LAG));
  camera.position.copy(camTarget).add(CAM_OFFSET);
  camera.lookAt(camTarget);

  updateOcclusion(dt);
  renderer.render(scene, camera);

  frames++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    const fps = frames / fpsAccum;
    frames = 0;
    fpsAccum = 0;
    const info = renderer.info;
    const roachStats = roachAssets.stats();
    readoutEl.textContent = [
      `${fps.toFixed(0)} fps`,
      `draw ${info.render.calls}  tri ${info.render.triangles.toLocaleString()}`,
      `geom ${info.memory.geometries}  tex ${info.memory.textures}`,
      `roach geo ${roachStats.geometries}  mat ${roachStats.materials}`,
    ].join('\n');
  }

  requestAnimationFrame(frame);
}

/**
 * Korean copy is hardcoded HERE and nowhere else, deliberately.
 *
 * This page is a rendering proof, not the game, and wiring the full i18n catalog into it would
 * imply the proof is production. When the proof passes and this becomes the game, every string
 * moves to `src/i18n/`. The source-literal scan the test audit recommends must exempt this file by
 * path, not by pretending the strings are not here.
 */
objectiveEl.textContent = '싱크대 배수구까지 길을 내라. 접시 더미 뒤로 돌면 눈에 덜 띈다.';

// Font readiness gates the first frame: measuring or laying out Korean text before the webfont
// resolves is exactly the layout jump the font gate forbids.
void document.fonts.ready.then(() => {
  requestAnimationFrame(frame);
});

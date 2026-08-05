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
/*
 * The `@ts-expect-error` has to sit immediately above the module specifier, so this import stays on
 * one line even though it is long — a multi-line form puts the specifier on a different line and
 * the directive stops suppressing anything.
 */
// prettier-ignore
// @ts-expect-error — untyped .mjs shared with tools/bake
import { counterStone, laminate, steelBrushed, steelPolished } from '../../tools/bake/lib/materials.mjs';
import { createRoachAssets, type Roach } from '../three/roach';
import { buildCounter } from '../three/counter';
import { OcclusionSystem } from '../three/occlusion';
import { applyWear } from '../three/surfaces';
import { Profiler, judge, type ProfileResult, type VerdictLine } from '../three/profiler';

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

/*
 * Occlusion fading is now a production system in `src/three/occlusion.ts`, not scene scaffolding.
 *
 * It moved out of this file when it grew the behaviours the contract actually requires: alpha
 * hashing instead of transparency (so blockers cannot mis-sort against each other), per-group
 * fading, shadow suppression while faded, honest restoration, and a reset for restart and camera
 * teleport.
 */

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

/**
 * Frame profiling that cannot pass by staying quiet.
 *
 * Under WebGL a CPU-callback budget goes green while the game gets slower, because `gl.draw*`
 * returns before the GPU does the work. See `src/three/profiler.ts`.
 */
const profiler = new Profiler(renderer);

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

/*
 * Worktop and cabinet materials.
 *
 * Both get all three channels from one untiled source — see `src/three/surfaces.ts` for why
 * roughness alone measurably failed to reach the eye.
 */
const worktopMaterial = counterStone() as THREE.MeshStandardMaterial;
applyWear(worktopMaterial, { grain: 'horizontal', rings: 5, seed: 0x9e3779b9 });

/*
 * MEASURED CORRECTION (proof-15, independent verification). The cabinet face was the SECOND flat
 * surface: a 1060x749 px region, 14.7 % of the frame, with an internal standard deviation of
 * 1.15 levels out of 255. The verifier's summary was that splitting one flat surface into two flat
 * surfaces is not texture — together they were 70.2 % of the frame in two solid fills.
 *
 * Laminate runs with the timber, so the grain is vertical, and it collects scuffs near the floor
 * where feet and mops reach rather than water rings.
 */
const cabinetMaterial = laminate() as THREE.MeshStandardMaterial;
applyWear(cabinetMaterial, {
  grain: 'vertical',
  streaks: 1100,
  scuffs: 90,
  seed: 0x51ed270b,
  normalStrength: 1.6,
  normalScale: 0.4,
});

const toeKickMaterial = laminate(0x3b352f) as THREE.MeshStandardMaterial;
applyWear(toeKickMaterial, {
  grain: 'vertical',
  streaks: 700,
  scuffs: 160,
  seed: 0x2f6b1c4d,
  normalStrength: 1.6,
  normalScale: 0.45,
});

const floorMaterial = laminate(0x474d52) as THREE.MeshStandardMaterial;
applyWear(floorMaterial, { grain: 'horizontal', streaks: 500, seed: 0x7d2b8811, normalScale: 0.3 });

/*
 * MEASURED CORRECTION (proof-08 -> proof-09).
 *
 * The worktop, cabinet, toe-kick, splashback and floor were five inline boxes here, and the sink
 * was the sprite-era `sink-drain` prop dropped on top of the slab. That prop carries its own steel
 * deck because a baked sprite has to be a self-contained island, and in 3D that deck rendered as a
 * flat dark rectangle with hard straight edges lying on the counter — the single most reported
 * defect of the previous build, reproduced exactly.
 *
 * `src/three/counter.ts` replaces all of it with one run that has a real aperture: four worktop
 * slabs around a hole, a basin hanging below, and the drain at the bottom of the recess. A drain is
 * recognizable because the surface falls away into it, which a decal can never do.
 */
const counter = buildCounter({
  stone: worktopMaterial,
  steel: steelBrushed(),
  steelBowl: new THREE.MeshStandardMaterial({ color: 0x9aa5b0, metalness: 0.5, roughness: 0.44 }),
  steelPolished: steelPolished(),
  laminate: cabinetMaterial,
  laminateDark: toeKickMaterial,
  floor: floorMaterial,
});
scene.add(counter.group);

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
/*
 * MEASURED CORRECTION (proof-10, independent critique). Two faults, both from placing props while
 * the sink was still solid counter:
 *
 * 1. The detergent bottle's centre sat 55 mm from the plate stack's — well inside a 220 mm plate —
 *    so the bottle's label band and the plate rim passed straight through each other. The critic
 *    ranked it "the single most unshipped thing in the frame after the debug HUD", and it is:
 *    interpenetration is the classic tell that nothing was hand-placed.
 * 2. The sponge, jar, towel and every droplet stood inside the bowl footprint, which is now a
 *    105 mm-deep recess rather than solid worktop.
 *
 * The bowl occupies x ∈ [-380, 0] mm, z ∈ [-225, 105] mm. Nothing may stand there.
 */
const PLACEMENTS: readonly Placement[] = [
  // Drying crockery, right of the bowl.
  { registry: SINK, name: 'plate-stack', x: mm(230), z: mm(-150), spin: 12, occludes: true },
  { registry: SINK, name: 'plate-single', x: mm(448), z: mm(-244), spin: -24 },
  { registry: SINK, name: 'mug', x: mm(330), z: mm(58), spin: -40, occludes: true },
  { registry: SINK, name: 'detergent-bottle', x: mm(74), z: mm(-272), occludes: true },

  // Cleaning kit, left of the bowl.
  { registry: SINK, name: 'jar', x: mm(-486), z: mm(-182), occludes: true },
  { registry: SINK, name: 'dish-towel', x: mm(-500), z: mm(158), spin: 18 },

  // The wet zone on the front lip of the bowl, where water actually gets flicked.
  { registry: SINK, name: 'sponge', x: mm(-96), z: mm(196), spin: 34 },
  { registry: SINK, name: 'droplet-m', x: mm(18), z: mm(158) },
  { registry: SINK, name: 'droplet-s', x: mm(64), z: mm(202) },
  { registry: SINK, name: 'droplet-s', x: mm(-24), z: mm(244), spin: 60 },

  // Crumbs on the open counter — the colony's reason to cross exposed ground.
  { registry: SINK, name: 'crumb-a', x: mm(216), z: mm(208) },
  { registry: SINK, name: 'crumb-b', x: mm(286), z: mm(252), spin: 40 },
  { registry: SINK, name: 'crumb-c', x: mm(174), z: mm(268), spin: -20 },
  { registry: SINK, name: 'crumb-a', x: mm(338), z: mm(184), spin: 110 },
  { registry: SINK, name: 'crumb-b', x: mm(396), z: mm(246), spin: -70 },
];

const occlusion = new OcclusionSystem();

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
  if (p.occludes) occlusion.register(object);
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
// On the open counter between the crumbs and the bowl, so the opening shot frames the sink.
scout.root.position.set(mm(150), 0, mm(210));
scene.add(scout.root);

/* ------------------------------------------------------------ pheromone route */

/**
 * The route the workers actually walk, and the ribbon the player sees.
 *
 * Drawn as a surface-conforming ribbon rather than a glowing line: CLAUDE.md bans neon overlays
 * that dominate the environment, and a scent trace should look like something left behind on the
 * counter, not like a UI element floating above it.
 */
// From the wet lip of the bowl out to the crumbs — the two things worth walking between.
const ROUTE_POINTS = [
  new THREE.Vector3(mm(-70), 0, mm(150)),
  new THREE.Vector3(mm(10), 0, mm(196)),
  new THREE.Vector3(mm(96), 0, mm(232)),
  new THREE.Vector3(mm(188), 0, mm(238)),
  new THREE.Vector3(mm(272), 0, mm(224)),
  new THREE.Vector3(mm(348), 0, mm(198)),
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
    /*
     * Taper the width to almost nothing at both ends.
     *
     * MEASURED CORRECTION (proof-10, independent critique): the ribbon "terminates in a blunt
     * straight cut… at 100% opacity, mid-counter, attached to nothing — it reads as a clipped UV
     * quad or a strip of masking tape, not a scent." A trace that stops dead has an author; a trace
     * that thins out was left behind.
     */
    const taper = Math.min(1, Math.sin(Math.PI * t) * 2.6);
    const side = new THREE.Vector3()
      .crossVectors(tangent, up)
      .normalize()
      .multiplyScalar(HALF_WIDTH * taper);
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

/*
 * The technical readout is a DEVELOPER overlay and defaults to hidden.
 *
 * MEASURED CORRECTION (proof-10, independent critique): the first thing the critic said about the
 * frame was "a debug overlay is burned into the frame… nothing else in the image needs to be read
 * to classify this as a prototype." CLAUDE.md §7 already forbade it; I had shipped it into every
 * evidence capture anyway. F3 toggles it for development; evidence frames are captured without it.
 */
let readoutVisible = false;
readoutEl.style.display = 'none';

const held = new Set<string>();
addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    readoutVisible = !readoutVisible;
    readoutEl.style.display = readoutVisible ? '' : 'none';
    e.preventDefault();
    return;
  }
  held.add(e.code);
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

/* -------------------------------------------------------------------- loop */

const SCOUT_SPEED = mm(150);
const SCOUT_SPRINT = 2.1;

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
let lastFps = 0;

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
  const margin = mm(20);
  const nextX = THREE.MathUtils.clamp(
    scout.root.position.x + wx * speed * dt,
    -counter.halfWidth + margin,
    counter.halfWidth - margin,
  );
  const nextZ = THREE.MathUtils.clamp(
    scout.root.position.z + wz * speed * dt,
    -counter.halfDepth + margin,
    counter.halfDepth - margin,
  );

  /*
   * The sink is a hole, so it has to be a hole for the player too.
   *
   * Resolved per axis rather than by rejecting the whole move: rejecting both axes together makes
   * the scout stick to the rim instead of sliding along it, which is the "invisible collision"
   * failure the worker reliability targets call out by name.
   */
  const inBowl = (x: number, z: number): boolean =>
    x > counter.bowl.minX - margin &&
    x < counter.bowl.maxX + margin &&
    z > counter.bowl.minZ - margin &&
    z < counter.bowl.maxZ + margin;

  if (!inBowl(nextX, scout.root.position.z)) scout.root.position.x = nextX;
  if (!inBowl(scout.root.position.x, nextZ)) scout.root.position.z = nextZ;

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

function frame(now: number): void {
  const frameStart = performance.now();
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

  occlusion.update(dt, camera, [scout.root.position]);

  profiler.beginRender();
  renderer.render(scene, camera);
  profiler.endRender();
  profiler.frame(now, performance.now() - frameStart);

  frames++;
  fpsAccum += dt;
  // The window closes on schedule whether or not anyone is looking, so toggling the overlay on
  // shows the last half second rather than an average since page load.
  if (fpsAccum >= 0.5) {
    const fps = frames / fpsAccum;
    lastFps = fps;
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

/**
 * Evidence seam.
 *
 * The technical numbers have to be readable by a capture script WITHOUT painting a debug overlay
 * into the frame being captured. Exposing them as data rather than as pixels is the only way to
 * have both an honest screenshot and a recorded measurement.
 */
/**
 * Frame budget, from the game contract. Unchanged from the Canvas2D era on purpose — the brief
 * requires measured justification for any revision, and none has been earned yet.
 */
const FRAME_BUDGET = { p50: 16.7, p95: 20, p99: 33, over50Pct: 1 } as const;

/**
 * Scene ceilings for the proof scene.
 *
 * These are not aspirations, they are alarms. The previous build's real failure mode was counts
 * growing without anyone noticing — 2,743 geometries for twenty props. A ceiling on a count keeps
 * meaning something when the hardware changes, which a millisecond budget does not.
 */
const SCENE_CEILINGS = {
  drawCalls: 900,
  triangles: 400_000,
  geometries: 140,
  textures: 24,
  programs: 24,
} as const;

interface ProofApi {
  ready: boolean;
  /** Reported rather than assumed: an unavailable GPU timer is an UNMEASURED result, not a pass. */
  gpuTimingAvailable: () => boolean;
  beginProfile: (label: string) => void;
  endProfile: () => ProfileResult | null;
  judgeProfile: (result: ProfileResult) => VerdictLine[];
  /**
   * Put the scout somewhere, in millimetres on the worktop plane.
   *
   * Evidence-only, and deliberately narrow: it moves the body and nothing else. Occlusion has to be
   * verifiable from a KNOWN geometric relationship — "walk right for 1.5 s and hope a mug ends up in
   * the way" is not a test, it is a coincidence. The old build's `TestApi` carries the same seam
   * under the same restriction.
   */
  placeScout: (xMm: number, zMm: number) => void;
  stats: () => {
    fps: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
    occludersFading: number;
  };
}

const proofApi: ProofApi = {
  ready: false,
  placeScout: (xMm, zMm) => {
    scout.root.position.set(mm(xMm), 0, mm(zMm));
    camTarget.copy(scout.root.position);
  },
  gpuTimingAvailable: () => profiler.gpuAvailable,
  beginProfile: (label: string) => profiler.begin(label),
  endProfile: () => profiler.end(),
  judgeProfile: (result: ProfileResult) => judge(result, FRAME_BUDGET, SCENE_CEILINGS),
  stats: () => ({
    fps: lastFps,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
    occludersFading: occlusion.stats().fading,
  }),
};
(window as unknown as { __proof: ProofApi }).__proof = proofApi;

// Font readiness gates the first frame: measuring or laying out Korean text before the webfont
// resolves is exactly the layout jump the font gate forbids.
void document.fonts.ready.then(() => {
  proofApi.ready = true;
  requestAnimationFrame(frame);
});

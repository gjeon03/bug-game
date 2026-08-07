import * as THREE from 'three';
import { mm } from '../world/units';
import type { RegionId } from '../world/types';
import type { Run } from '../colony/types';
import { WORKER_CAP } from '../colony/state';
import { GameCamera } from './camera';
import { buildLighting, configureRenderer, type RegionLights } from './lighting';
import { makeGradientEnv } from './night';
import { buildScene, openGateVisual, updateGateVisuals, type BuiltScene } from './scene';
import { createNestView, type NestView } from './nests';
import { createRoachView, type RoachView } from './roaches';
import { createRouteView, type RouteView } from './routes';
import { createThreatView, type ThreatView } from './threats';
import { Profiler } from './profiler';

/**
 * The renderer.
 *
 * One object that owns every GPU resource in the game and can hand all of them back. That totality
 * is the point: the five-restart leak gate is a property of `dispose()` being complete, not of
 * anyone remembering to clean up a particular system.
 *
 * The renderer **reads** simulation state and never writes it. If a value needs to persist between
 * frames it lives here, not in `Run`.
 */

/** How many route points may be fed to the occlusion system per frame. */
const ROUTE_FOCUS_LIMIT = 6;

export interface RenderStats {
  readonly props: number;
  readonly meshes: number;
  readonly merged: number;
  readonly geometries: number;
  readonly materials: number;
  readonly textures: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly lights: number;
  readonly occluders: number;
  readonly occluderTests: number;
  readonly occluderCandidates: number;
  readonly fading: number;
  readonly visibleRoaches: number;
  /** How far camera collision had to pull the view in, world units. */
  readonly cameraPulledIn: number;
  readonly missingProps: readonly string[];
}

export interface GameRenderer {
  readonly camera: GameCamera;
  readonly domElement: HTMLCanvasElement;
  readonly profiler: Profiler;
  resize(width: number, height: number, dpr: number): void;
  /** Called once per displayed frame. `alpha` interpolates between simulation ticks. */
  render(run: Run, dt: number, alpha: number): void;
  /** Snap the camera and clear per-run visual state. Called on boot and on restart. */
  reset(run: Run): void;
  /**
   * Rebuild the world for a new run, reusing the WebGL context.
   *
   * Restart must NOT construct a second `WebGLRenderer` on the same canvas. `dispose()` calls
   * `forceContextLoss()`, after which `canvas.getContext('webgl2')` returns null and the new
   * renderer throws `Cannot read properties of null (reading 'precision')` — which is exactly what
   * a real-browser restart capture caught. The GL context is created once and lives as long as the
   * page; only scene contents are rebuilt.
   */
  rebuild(run: Run): void;
  stats(): RenderStats;
  /** Names and distances of everything between the camera and its focus. Diagnostics only. */
  probeView(): readonly { name: string; distance: number }[];
  /** Park the camera over a region until released. Evidence capture only. */
  viewRegion(id: RegionId, distance: number, run: Run): void;
  /** Release a capture lock. */
  releaseView(): void;
  /** Per-occluder broadphase diagnostics. Debug only. */
  occluderDebug(): unknown;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, initial: Run): GameRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  configureRenderer(renderer);

  const scene = new THREE.Scene();
  /*
   * Aerial perspective at insect scale.
   *
   * It was `Fog(0x070a10, mm(1800), mm(9000))` — sized for a whole flat, on a room 3800 x 3000 mm.
   * The near plane sat beyond the far wall, so the one depth cue that costs zero milliseconds was
   * switched off by its own numbers, and its near-black colour meant that wherever it DID apply it
   * was adding to the pure-black problem rather than to depth.
   *
   * ## The range is measured from the CAMERA, not from the scout
   *
   * The first correction here was `mm(320)` to `mm(2600)`, taken from an art proposal that quoted
   * subject-relative distances. The camera sits `CAM_DEFAULT_MM` = 1900 mm BEHIND the scout, so
   * that range put the player's own body at 69 % fog and rendered the entire room as milk. Every
   * pixel in the frame is between 1900 mm and roughly 5700 mm from the lens; the useful range is
   * the part of that span the room actually occupies.
   *
   * Near at the framing distance leaves the scout and its immediate surroundings clear. Far at the
   * camera distance plus the room diagonal means the opposite corner is fully hazed and nothing
   * beyond it exists to be flattened.
   */
  scene.fog = new THREE.Fog(0x8fa0ab, mm(1950), mm(5400));
  // The background has to agree with the fog, or the room ends against a wall of a different colour
  // than the air in front of it.
  scene.background = new THREE.Color(0x8fa0ab);
  scene.environment = makeGradientEnv(renderer);

  // Built once per page load and never replaced — see the note in `rebuild`.
  const built: BuiltScene = buildScene(initial.house);
  scene.add(built.root);

  // Built once per page load and never replaced — see the note in `rebuild`.
  const lights: RegionLights = buildLighting(initial.house.regions);
  scene.add(lights.group);

  /*
   * Built from the HOUSE, not from the run — refuge sites are authored world data and never change
   * between runs. Only which of the three states is showing depends on `run.footholds`, so restart
   * re-shows rather than rebuilds, the same as the scene and the lighting.
   */
  const nests: NestView = createNestView(initial.house);
  scene.add(nests.group);

  const roaches: RoachView = createRoachView(WORKER_CAP);
  scene.add(roaches.group);

  const routes: RouteView = createRouteView();
  scene.add(routes.group);

  const threats: ThreatView = createThreatView();
  scene.add(threats.group);

  const camera = new GameCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
  const profiler = new Profiler(renderer);

  const openedSeen = new Set<string>();
  const activeRegions = new Set<string>();
  const focusPoints: THREE.Vector3[] = [];

  return {
    camera,
    profiler,
    domElement: renderer.domElement,

    resize(width, height, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.resize(width, height);
    },

    render(run, dt, alpha) {
      // Any gate that opened since the last frame gets its seal knocked loose. This is the only
      // place the world's shape visibly changes, and it is driven by simulation state rather than
      // by an event the renderer could miss.
      for (const id of run.openGates) {
        if (openedSeen.has(id)) continue;
        openedSeen.add(id);
        const seal = built.gateProps.get(id);
        if (seal) openGateVisual(seal);
      }
      updateGateVisuals(built.gateProps, dt);

      // Refuge state is a visibility toggle over pre-built geometry, so this is a handful of boolean
      // writes per frame rather than anything worth event-driving.
      nests.update(run);
      roaches.update(run, { alpha }, dt);
      routes.update(run, dt);
      threats.update(run, dt);

      camera.update(dt, {
        x: roaches.scoutPosition.x,
        y: roaches.scoutPosition.y,
        z: roaches.scoutPosition.z,
        speed: run.scout.speed,
        heading: run.scout.heading,
      });

      // The camera's ideal position is often inside furniture at this scale; pull it clear before
      // anything else reads its transform.
      camera.resolveCollision(built.root);

      // Occlusion focus: the scout first, then nearby route segments the player may be reading.
      focusPoints.length = 0;
      focusPoints.push(roaches.scoutPosition);
      for (const point of routes.focusPoints(run, ROUTE_FOCUS_LIMIT)) focusPoints.push(point);

      // Broadphase: the room the scout is in, plus any room it is currently climbing into.
      activeRegions.clear();
      const here = run.house.regionOf.get(run.scout.surface);
      if (here) activeRegions.add(here);
      const climbingTo = run.scout.climb?.to;
      if (climbingTo) {
        const there = run.house.regionOf.get(climbingTo);
        if (there) activeRegions.add(there);
      }
      built.occlusion.update(dt, camera.camera, focusPoints, activeRegions);

      // Re-point the fixed light pool at whatever actually reaches the player from here.
      lights.retarget(camera.focusPoint, (routine) => {
        const state = run.routines.get(routine);
        if (!state) return 0;
        if (state.phase === 'active') return 1;
        // Half up during the telegraph — the same ramp the exposure field uses, so what the player
        // sees and what the simulation charges them are the same thing.
        if (state.phase === 'incoming') return 0.45;
        if (state.phase === 'aftermath') return 0.25;
        return 0;
      });

      profiler.beginRender();
      renderer.render(scene, camera.camera);
      profiler.endRender();
    },

    rebuild(run) {
      /*
       * Scene contents only. The renderer, its context, the camera, the profiler AND THE LIGHTING
       * survive.
       *
       * The lighting used to be torn down and rebuilt here, and it leaked one GPU texture on every
       * restart — measured 25 -> 30 over five restarts in the capture harness, and 25 -> 39 over
       * fourteen in a dedicated probe, monotonic with no plateau. Setting `SHADOW_SLOTS` to zero
       * made it flat, which pins it to the shadow maps: those are render targets three.js allocates
       * lazily on first use, and a pool discarded before it is next rendered does not reliably give
       * them back.
       *
       * Disposing harder would have been the obvious answer and it is the wrong one. The authored
       * lights come from `run.house.regions`, and every run is the same house — so the pool being
       * rebuilt was identical to the one being thrown away. Not rebuilding it removes the leak by
       * construction instead of by remembering, which is the same reason `WebGLRenderer` itself is
       * not reconstructed here.
       *
       * `retarget()` re-points every slot from the camera focus each frame, so the surviving pool
       * needs no reset of its own.
       */
      /*
       * Nothing is rebuilt. The house is the same house.
       *
       * `buildScene(run.house)` is a pure function of the authored world, and the authored world is
       * a module constant — every run of this game is the same kitchen. So tearing the scene down
       * and building an identical one was work whose only observable effect was the leak: measured
       * with the restart gate armed, textures 25 -> 45 and geometries 97 -> 100 over twenty
       * restarts. Both counters are flat with `SHADOW_SLOTS` at zero, so the texture half is the
       * shadow render targets three.js allocates lazily and does not reliably reclaim when the whole
       * scene graph is swapped underneath them.
       *
       * Two fixes were tried first and both failed to move the number: keeping the light pool alive
       * across restarts, and then disposing `shadow.map`/`shadow.mapPass` explicitly. That is the
       * signal to stop chasing the deallocation and remove the reallocation instead — the same
       * reasoning that already applies to `WebGLRenderer` and its GL context two functions up.
       *
       * What actually differs between runs is RUN STATE, and `reset` is the function that owns it.
       */
      this.reset(run);
    },

    reset(run) {
      openedSeen.clear();
      for (const id of run.openGates) openedSeen.add(id);
      built.occlusion.reset();
      nests.reset(run);
      roaches.reset();
      routes.reset();
      threats.reset();
      camera.reset({
        x: run.scout.x,
        y: run.scout.y,
        z: run.scout.z,
        speed: 0,
        heading: run.scout.heading,
      });
    },

    viewRegion(id, distance, run) {
      const region = run.house.regions.find((r) => r.id === id);
      if (!region) return;
      const cx = (region.bounds.x0 + region.bounds.x1) / 2;
      const cz = (region.bounds.z0 + region.bounds.z1) / 2;
      camera.override(cx, 0, cz, distance);
      // Everything opaque and the household's lights on: a faded prop is not the prop, and a dark
      // room is not the room.
      built.occlusion.reset();
      lights.showcase = true;
    },

    releaseView() {
      camera.unlock();
      lights.showcase = false;
    },

    probeView() {
      const caster = new THREE.Raycaster();
      const focus = camera.focusPoint;
      const dir = camera.camera.position.clone().sub(focus);
      const far = dir.length();
      caster.set(focus, dir.normalize());
      caster.far = far;
      return caster
        .intersectObject(built.root, true)
        .slice(0, 8)
        .map((h) => ({
          name: h.object.name || h.object.parent?.name || '?',
          distance: Math.round(h.distance),
        }));
    },

    occluderDebug() {
      return built.occlusion.debug(camera.camera, camera.focusPoint, activeRegions);
    },

    stats() {
      const info = renderer.info;
      const occ = built.occlusion.stats();
      const roachStats = roaches.stats();
      return {
        scoutHidden: built.occlusion.scoutHidden,
        props: built.stats.props,
        meshes: built.stats.meshes,
        merged: built.stats.merged,
        geometries: info.memory.geometries,
        materials: built.stats.materials + roachStats.materials,
        textures: info.memory.textures,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        lights: lights.liveSlots,
        occluders: occ.registered,
        occluderTests: occ.tests,
        occluderCandidates: occ.candidates,
        fading: occ.fading,
        visibleRoaches: roachStats.visible,
        cameraPulledIn: camera.pulledIn,
        missingProps: built.stats.missingProps,
      };
    },

    dispose() {
      profiler.dispose();
      threats.dispose();
      routes.dispose();
      nests.dispose();
      roaches.dispose();
      lights.dispose();
      built.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/** Regions the renderer considers "entered" — used by tests and the debug overlay. */
export function activeRegionOf(run: Run): RegionId | undefined {
  return run.house.regionOf.get(run.scout.surface);
}

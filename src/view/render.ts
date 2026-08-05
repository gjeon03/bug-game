import * as THREE from 'three';
import { mm } from '../world/units';
import type { RegionId } from '../world/types';
import type { Run } from '../colony/types';
import { WORKER_CAP } from '../colony/state';
import { GameCamera } from './camera';
import { buildLighting, configureRenderer, updateRoutineLights, type RegionLights } from './lighting';
import { buildScene, openGateVisual, updateGateVisuals, type BuiltScene } from './scene';
import { createRoachView, type RoachView } from './roaches';
import { createRouteView, type RouteView } from './routes';
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
  readonly geometries: number;
  readonly materials: number;
  readonly textures: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly lights: number;
  readonly occluders: number;
  readonly occluderTests: number;
  readonly fading: number;
  readonly visibleRoaches: number;
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
  stats(): RenderStats;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, run: Run): GameRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  configureRenderer(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  /*
   * Fog far plane.
   *
   * The previous build set this to 2100 units = 2827 mm, which is shorter than the diagonal of a
   * single room — every long sightline rendered as flat fog colour. The apartment is roughly
   * 9800 x 9000 mm, so the far plane has to clear ~13 300 mm of diagonal. Set well beyond it: fog
   * here is for atmospheric depth on the far side of a room, not for hiding the world.
   */
  scene.fog = new THREE.Fog(0x070a10, mm(1800), mm(9000));

  const built: BuiltScene = buildScene(run.house);
  scene.add(built.root);

  const lights: RegionLights = buildLighting(run.house.regions);
  scene.add(lights.group);

  const roaches: RoachView = createRoachView(WORKER_CAP);
  scene.add(roaches.group);

  const routes: RouteView = createRouteView();
  scene.add(routes.group);

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

      updateRoutineLights(lights, dt, (routine) => {
        const state = run.routines.get(routine);
        if (!state) return 0;
        if (state.phase === 'active') return 1;
        // Half up during the telegraph — the same ramp the exposure field uses, so what the player
        // sees and what the simulation charges them are the same thing.
        if (state.phase === 'incoming') return 0.45;
        if (state.phase === 'aftermath') return 0.25;
        return 0;
      });

      roaches.update(run, { alpha }, dt);
      routes.update(run, dt);

      camera.update(dt, {
        x: roaches.scoutPosition.x,
        y: roaches.scoutPosition.y,
        z: roaches.scoutPosition.z,
        speed: run.scout.speed,
        heading: run.scout.heading,
      });

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

      profiler.beginRender();
      renderer.render(scene, camera.camera);
      profiler.endRender();
    },

    reset(run) {
      openedSeen.clear();
      for (const id of run.openGates) openedSeen.add(id);
      built.occlusion.reset();
      roaches.reset();
      routes.reset();
      camera.reset({
        x: run.scout.x,
        y: run.scout.y,
        z: run.scout.z,
        speed: 0,
        heading: run.scout.heading,
      });
    },

    stats() {
      const info = renderer.info;
      const occ = built.occlusion.stats();
      const roachStats = roaches.stats();
      return {
        props: built.stats.props,
        meshes: built.stats.meshes,
        geometries: info.memory.geometries,
        materials: built.stats.materials + roachStats.materials,
        textures: info.memory.textures,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        lights: lights.count,
        occluders: occ.registered,
        occluderTests: occ.tests,
        fading: occ.fading,
        visibleRoaches: roachStats.visible,
        missingProps: built.stats.missingProps,
      };
    },

    dispose() {
      profiler.dispose();
      routes.dispose();
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

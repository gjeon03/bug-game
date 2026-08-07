import * as THREE from 'three';
import { mm } from '../world/units';
import type { NavPoint, RouteHealth, Run } from '../colony/types';

/** Slot marker for the line being walked. Not a route id — no Route exists until it is sealed. */
const LIVE_TRAIL_ID = '__trail';

/**
 * Drawing pheromone routes.
 *
 * ## Why a tapered ribbon and not a line
 *
 * `THREE.Line` is one pixel wide at any distance, which at this camera reads as a UI overlay drawn
 * on top of the world rather than as a chemical trail lying on a floor. A ribbon lies in the world,
 * takes the light, and can be *wider where it is busier* — so a route's importance is legible
 * without a number.
 *
 * The ends taper to zero width. A blunt cut across the end of a trail was a confirmed defect on the
 * previous build: it read as a rendering error rather than as a trail fading out.
 *
 * ## Why health is colour AND motion
 *
 * Colour alone fails for a colour-blind player and fails again in a dark scene. A healthy route
 * pulses gently along its length in the direction of travel; a broken one does not move at all.
 * That is a second, redundant channel for the same information.
 */

const HEALTH_COLOUR: Readonly<Record<RouteHealth, number>> = {
  ok: 0x7fd4a8,
  incomplete: 0xd9c37a,
  disconnected: 0xc46a5a,
  blocked: 0x8c8c94,
  congested: 0xe0a45c,
  compromised: 0xd2585a,
  washed: 0x5a7fa8,
};

/** Half-width of a route at zero traffic and at full traffic. */
const WIDTH_MIN_MM = 5;
const WIDTH_MAX_MM = 17;
/**
 * Narrowest a ribbon end may get, as a fraction of its half-width.
 *
 * Without a floor the end-cap taper multiplies the width by exactly zero at both ends, which for a
 * two-point route is every vertex it has. See the note at the taper itself.
 */
const TAPER_FLOOR = 0.42;
/** Lifted off the floor so it never z-fights, but low enough to read as lying on it. */
const LIFT_MM = 1.1;

/** Points a single ribbon can hold before its buffers are reallocated. */
const RIBBON_CAPACITY = 256;

interface Ribbon {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshBasicMaterial;
  /*
   * Persistent attributes, written in place.
   *
   * These used to be constructed fresh every frame — `setAttribute` with a brand-new
   * `BufferAttribute` — which orphans the old GL buffer each time. An independent technical critic
   * instrumented `createBuffer`/`deleteBuffer` and measured **1 386 creates and 0 deletes over 462
   * frames with a single four-point route**. Allocating once and setting `needsUpdate` reuses the
   * same buffer for the life of the ribbon.
   */
  readonly position: THREE.BufferAttribute;
  readonly colour: THREE.BufferAttribute;
  readonly indexAttr: THREE.BufferAttribute;
  routeId: string;
}

export interface RouteView {
  readonly group: THREE.Group;
  update(run: Run, dt: number): void;
  /** Points near the scout that must not be occluded — passed to the occlusion system. */
  focusPoints(run: Run, limit: number): readonly THREE.Vector3[];
  reset(): void;
  dispose(): void;
}

export function createRouteView(maxRoutes = 24): RouteView {
  const group = new THREE.Group();
  group.name = 'routes';
  const pool: Ribbon[] = [];
  let time = 0;

  const acquire = (index: number): Ribbon => {
    const existing = pool[index];
    if (existing) return existing;
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(RIBBON_CAPACITY * 2 * 3), 3);
    const colour = new THREE.BufferAttribute(new Float32Array(RIBBON_CAPACITY * 2 * 3), 3);
    const indexAttr = new THREE.BufferAttribute(new Uint16Array((RIBBON_CAPACITY - 1) * 6), 1);
    position.setUsage(THREE.DynamicDrawUsage);
    colour.setUsage(THREE.DynamicDrawUsage);
    indexAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('color', colour);
    geometry.setIndex(indexAttr);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.visible = false;
    group.add(mesh);
    const ribbon: Ribbon = { mesh, geometry, material, position, colour, indexAttr, routeId: '' };
    pool[index] = ribbon;
    return ribbon;
  };

  return {
    group,

    update(run, dt) {
      time += dt;
      const count = Math.min(run.routes.length, maxRoutes);

      for (let i = 0; i < count; i++) {
        const route = run.routes[i]!;
        const ribbon = acquire(i);
        ribbon.routeId = route.id;
        buildRibbon(ribbon, route, run, time);
        ribbon.mesh.visible = true;
      }
      /*
       * The line being walked RIGHT NOW.
       *
       * `run.trail` had no reader in the renderer at all — `createRoute()` is called only inside
       * `sealTrail`, so no `Route` object exists until the walk finishes, and this loop iterates
       * `run.routes`. The player therefore held F, walked the length of the kitchen laying the
       * mechanic the whole design rests on, and saw nothing on the floor until the moment they
       * sealed it. Cancelling discarded a line that had never been drawn.
       *
       * Rendered in the `incomplete` colour and pulsed, so it reads as "in progress" rather than as
       * a finished route that has gone wrong — those two states share a ribbon and must not share a
       * look.
       */
      let used = count;
      const trail = run.trail;
      if (trail && trail.points.length >= 2 && used < maxRoutes) {
        const ribbon = acquire(used);
        ribbon.routeId = LIVE_TRAIL_ID;
        buildRibbon(
          ribbon,
          {
            points: trail.points,
            health: 'incomplete',
            // Full width: this is the line the player is actively making, not a faded memory.
            strength: 1,
            assigned: 0,
          },
          run,
          time,
        );
        ribbon.material.opacity = 0.5 + 0.35 * Math.sin(time * 6);
        ribbon.mesh.visible = true;
        used++;
      }

      for (let i = used; i < pool.length; i++) {
        const ribbon = pool[i];
        if (ribbon) ribbon.mesh.visible = false;
      }
    },

    focusPoints(run, limit) {
      // Only route segments near the scout matter for occlusion; the whole network would be both
      // expensive and wrong (fading a sofa because a route passes behind it in another room).
      const points: THREE.Vector3[] = [];
      const s = run.scout;

      // The trail being walked comes first: it is the thing the player is looking at, so it is the
      // thing that must not be hidden behind a cabinet door.
      if (run.trail) {
        for (const point of run.trail.points) {
          if (points.length >= limit) return points;
          if (Math.hypot(point.x - s.x, point.z - s.z) > mm(600)) continue;
          const y = run.house.surfaces.get(point.surface)?.y ?? 0;
          points.push(new THREE.Vector3(point.x, y + mm(6), point.z));
        }
      }

      for (const route of run.routes) {
        for (const point of route.points) {
          if (points.length >= limit) return points;
          if (Math.hypot(point.x - s.x, point.z - s.z) > mm(600)) continue;
          const y = run.house.surfaces.get(point.surface)?.y ?? 0;
          points.push(new THREE.Vector3(point.x, y + mm(6), point.z));
        }
      }
      return points;
    },

    reset() {
      time = 0;
      for (const ribbon of pool) {
        ribbon.mesh.visible = false;
        ribbon.routeId = '';
      }
    },

    dispose() {
      for (const ribbon of pool) {
        ribbon.geometry.dispose();
        ribbon.material.dispose();
      }
      pool.length = 0;
      group.clear();
    },
  };
}

/**
 * What a ribbon actually needs to be drawn.
 *
 * Narrower than `Route` on purpose: the trail being walked is not a Route and never will be — it
 * has no id, no target and no delivery history until it is sealed — so asking for the whole
 * interface would have forced a fake Route into existence just to draw a line.
 */
interface RibbonSource {
  readonly points: readonly NavPoint[];
  readonly health: RouteHealth;
  readonly strength: number;
  readonly assigned: number;
}

function buildRibbon(ribbon: Ribbon, route: RibbonSource, run: Run, time: number): void {
  const points = route.points;
  const n = Math.min(points.length, RIBBON_CAPACITY);
  if (n < 2) {
    ribbon.mesh.visible = false;
    return;
  }

  const positions = ribbon.position.array as Float32Array;
  const colours = ribbon.colour.array as Float32Array;
  const indices = ribbon.indexAttr.array as Uint16Array;
  let indexCount = 0;

  const base = new THREE.Color(HEALTH_COLOUR[route.health]);
  const traffic = Math.min(1, route.assigned / 4);
  const halfWidth = mm(WIDTH_MIN_MM + (WIDTH_MAX_MM - WIDTH_MIN_MM) * traffic) * route.strength;

  // A healthy route pulses toward its destination. A dead one is still — motion is the second,
  // redundant channel that survives both colour blindness and a dark room.
  const alive = route.health === 'ok' || route.health === 'congested';

  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(n - 1, i + 1)]!;
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Perpendicular in XZ.
    const px = -dz;
    const pz = dx;

    const t = i / (n - 1);
    /*
     * Taper toward the ends, but never to zero.
     *
     * This was `sin(pi*t) ** 0.45` with no floor, and `t = i/(n-1)`. For a two-point route that
     * makes `t ∈ {0, 1}`, both vertices get `sin = 0`, and EVERY triangle in the ribbon has zero
     * area. `trail.ts` accepts a two-point trail, so the first route a player ever lays rendered
     * exactly nothing — the route panel said `배수 트랩 물기 · 2 · 정상` while the floor was empty,
     * and an art review reported the game's differentiating mechanic as "literally nothing at all".
     *
     * The floor also fixes the general case: with 30 points the second vertex sat at 10 % width, so
     * the head and tail of every ribbon were a hairline the eye reads as a break rather than a fade.
     */
    const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.45;
    const w = halfWidth * Math.max(TAPER_FLOOR, taper);

    const y = (run.house.surfaces.get(p.surface)?.y ?? 0) + mm(LIFT_MM);

    positions[i * 6] = p.x + px * w;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = p.z + pz * w;
    positions[i * 6 + 3] = p.x - px * w;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = p.z - pz * w;

    const pulse = alive ? 0.72 + 0.28 * Math.sin(t * 26 - time * 5.2) : 0.55;
    const r = base.r * pulse;
    const g = base.g * pulse;
    const b = base.b * pulse;
    colours[i * 6] = r;
    colours[i * 6 + 1] = g;
    colours[i * 6 + 2] = b;
    colours[i * 6 + 3] = r;
    colours[i * 6 + 4] = g;
    colours[i * 6 + 5] = b;

    if (i < n - 1) {
      const a = i * 2;
      indices[indexCount++] = a;
      indices[indexCount++] = a + 1;
      indices[indexCount++] = a + 2;
      indices[indexCount++] = a + 1;
      indices[indexCount++] = a + 3;
      indices[indexCount++] = a + 2;
    }
  }

  ribbon.position.needsUpdate = true;
  ribbon.colour.needsUpdate = true;
  ribbon.indexAttr.needsUpdate = true;
  // Draw only the part of the fixed-size buffer this route actually fills.
  ribbon.geometry.setDrawRange(0, indexCount);
  ribbon.geometry.computeBoundingSphere();
  ribbon.material.vertexColors = true;
  ribbon.material.opacity = 0.35 + 0.5 * route.strength;
}

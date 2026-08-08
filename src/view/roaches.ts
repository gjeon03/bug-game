import * as THREE from 'three';
import { mm } from '../world/units';
import { createRoachAssets, type Roach, type RoachAssets, type RoachPalette } from './roach';
import type { Run, Worker } from '../colony/types';

/**
 * Drawing the colony.
 *
 * ## Why a pool and not a spawn/despawn
 *
 * Workers die and are born constantly. Building and disposing a rig each time would churn geometry
 * and, worse, would make the restart-leak gate a matter of remembering to clean up. The pool is
 * allocated once at the worker cap and rigs are hidden rather than destroyed, so the geometry count
 * is constant for the whole run and `dispose()` is total.
 *
 * ## Why cargo is attached and not floated
 *
 * "Detached floating dots as cargo" is on the banned list, because it was a confirmed defect in the
 * previous build. A carried crumb is parented to the worker's head, sits between its mandibles, and
 * turns with it. If the sim says a worker carries something, something is physically held.
 */

/** Interpolation between simulation ticks. The sim runs at 60 Hz; the display may not. */
export interface Interp {
  /** 0..1 through the current tick. */
  readonly alpha: number;
}

interface Body {
  readonly roach: Roach;
  readonly cargo: THREE.Mesh;
  visible: boolean;
}

export interface RoachView {
  readonly group: THREE.Group;
  update(run: Run, interp: Interp, dt: number): void;
  /** Where the scout currently is in world space — the occlusion system's primary focus. */
  readonly scoutPosition: THREE.Vector3;
  stats(): { readonly geometries: number; readonly materials: number; readonly visible: number };
  reset(): void;
  dispose(): void;
}

const CARGO_GEOMETRY_MM = 4.2;

export function createRoachView(workerCap: number): RoachView {
  const assets: RoachAssets = createRoachAssets();
  const group = new THREE.Group();
  group.name = 'colony';

  const cargoGeometry = new THREE.IcosahedronGeometry(mm(CARGO_GEOMETRY_MM), 0);
  const cargoFood = new THREE.MeshStandardMaterial({
    color: 0xbfa274,
    roughness: 0.86,
    metalness: 0,
  });
  const cargoWater = new THREE.MeshStandardMaterial({
    color: 0x8fb3c4,
    roughness: 0.15,
    metalness: 0.1,
  });

  const scout = assets.build({ isScout: true, palette: 'scout' });
  scout.root.castShadow = true;
  group.add(scout.root);

  const bodies: Body[] = [];
  // Restrained variation: three palettes, so a crowd reads as individuals without becoming a
  // fruit bowl. Deterministic by index so a screenshot reproduces.
  const palettes: readonly RoachPalette[] = ['workerDark', 'workerPale', 'nymph'];
  for (let i = 0; i < workerCap; i++) {
    const roach = assets.build({ palette: palettes[i % palettes.length]!, bodyMm: 26 + (i % 5) });
    roach.root.visible = false;
    const cargo = new THREE.Mesh(cargoGeometry, cargoFood);
    cargo.visible = false;
    // Held at the mouth, slightly forward and below the head.
    cargo.position.set(0, mm(1.5), mm(15));
    roach.root.add(cargo);
    group.add(roach.root);
    bodies.push({ roach, cargo, visible: false });
  }

  const scoutPosition = new THREE.Vector3();
  let phase = 0;
  /** Damped body pitch, radians. Nose-up while ascending a link. */
  let scoutPitch = 0;

  return {
    group,
    scoutPosition,


    update(run, interp, dt) {
      phase += dt;
      const a = interp.alpha;

      const s = run.scout;
      const sx = s.prevX + (s.x - s.prevX) * a;
      const sy = s.prevY + (s.y - s.prevY) * a;
      const sz = s.prevZ + (s.z - s.prevZ) * a;
      scout.root.position.set(sx, sy, sz);
      scout.root.rotation.y = s.heading;
      scoutPosition.set(sx, sy + mm(4), sz);

      /*
       * Climbing has to LOOK like climbing.
       *
       * The simulation moves a climbing scout by interpolating straight from the mouth of a link to
       * its landing and sets `speed = 0` for the duration. The view had no case for it at all, so a
       * scout going up a cable kept the flat pose it walks the floor with, and — because the gait is
       * driven by speed — froze its legs completely while sliding upward in a straight line. It read
       * as a model being translated, not an animal gripping something.
       *
       * Two things fix it, and neither needs the link: pitch the body along whatever slope the
       * frame actually travelled, and drive the gait from that travel rather than from `speed`.
       * Deriving both from the interpolated motion means a vertical cable, a shallow ramp and a
       * lip pull-over all pose correctly without authoring anything per link.
       */
      const dy = s.y - s.prevY;
      const horizontal = Math.hypot(s.x - s.prevX, s.z - s.prevZ);
      const climbing = s.climb !== null;
      const targetPitch = climbing ? Math.atan2(dy, Math.max(1e-5, horizontal)) : 0;
      // Damped so the pull-over at the top eases instead of snapping flat in one frame.
      scoutPitch += (targetPitch - scoutPitch) * Math.min(1, dt * 9);
      scout.root.rotation.x = -scoutPitch;

      /*
       * Gait. On the ground it follows real ground speed, so a stationary scout stops moving its
       * legs instead of jogging on the spot. On a climb `speed` is zero by construction, so it
       * follows the distance actually covered — a climbing insect works hard and moves slowly, and
       * the cadence should say so.
       */
      const climbEffort = Math.min(1, (Math.abs(dy) + horizontal) / (dt * 260 + 1e-5));
      const scoutEffort = climbing ? Math.max(0.55, climbEffort) : Math.min(1, s.speed / 320);
      const cadence = climbing ? 2 + scoutEffort * 5 : 2 + scoutEffort * 9;
      scout.pose(phase * cadence, scoutEffort);
      scout.root.visible = s.state !== 'dead';

      let visible = 0;
      for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i]!;
        const worker = run.workers[i];
        if (!worker || !worker.alive) {
          if (body.visible) {
            body.roach.root.visible = false;
            body.cargo.visible = false;
            body.visible = false;
          }
          continue;
        }
        drawWorker(body, worker, a, phase);
        visible++;
      }
      lastVisible = visible;
    },

    stats() {
      const s = assets.stats();
      return { geometries: s.geometries + 1, materials: s.materials + 2, visible: lastVisible };
    },

    reset() {
      phase = 0;
      for (const body of bodies) {
        body.roach.root.visible = false;
        body.cargo.visible = false;
        body.visible = false;
      }
    },

    dispose() {
      assets.dispose();
      cargoGeometry.dispose();
      cargoFood.dispose();
      cargoWater.dispose();
      group.clear();
      bodies.length = 0;
    },
  };

  function drawWorker(body: Body, worker: Worker, a: number, now: number): void {
    const x = worker.prevX + (worker.x - worker.prevX) * a;
    const y = worker.prevY + (worker.y - worker.prevY) * a;
    const z = worker.prevZ + (worker.z - worker.prevZ) * a;
    body.roach.root.position.set(x, y, z);

    // Turn toward heading rather than snapping, or a lane change reads as a teleport.
    const current = body.roach.root.rotation.y;
    let delta = worker.heading - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    body.roach.root.rotation.y = current + delta * 0.28;

    const effort = Math.min(1, worker.speed / 205);
    // A worker in visible recovery stops and casts about — that is the animation the reliability
    // ladder promises the player, and it is what distinguishes "confused" from "glitched".
    const recovering = worker.recoverFor > 0;
    if (recovering) {
      body.roach.pose(now * 1.6, 0.08);
      body.roach.root.rotation.y += Math.sin(now * 6 + worker.id) * 0.22;
    } else {
      body.roach.pose(now * (2 + effort * 9) + worker.id, effort);
    }

    if (!body.visible) {
      body.roach.root.visible = true;
      body.visible = true;
    }

    /*
     * Every worker was the same size, and the baseline audit calls that CRITICAL for a reason:
     * `audits/04-workers.md` W3 — "there is essentially no per-worker visual variation, which is
     * what turns overlap into one animal". A column of identical bodies at 35 mm scale reads as a
     * single crawling mass rather than as individuals, and CLAUDE.md §10 asks for workers that are
     * "individually legible".
     *
     * Derived from the id rather than stored, so it is stable for a worker's whole life, identical
     * across restarts on the same seed, and costs nothing to keep in sync. The spread is +/-12 %,
     * which at this scale separates neighbours without any of them reading as a different species.
     */
    const wobble = Math.sin(worker.id * 12.9898) * 43758.5453;
    body.roach.root.scale.setScalar(0.88 + (wobble - Math.floor(wobble)) * 0.24);

    const carrying = worker.cargo > 0.02 && worker.cargoKind !== null;
    body.roach.setCargo(carrying);
    body.cargo.visible = carrying;
    if (carrying) {
      body.cargo.material = worker.cargoKind === 'food' ? cargoFood : cargoWater;
      // Scale with how full the load is, so "nearly done collecting" is readable at a glance.
      body.cargo.scale.setScalar(0.55 + worker.cargo * 0.65);
    }
  }
}

let lastVisible = 0;

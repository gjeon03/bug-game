import * as THREE from 'three';
import { mm } from '../world/units';

/**
 * The diagonal strategy-action camera.
 *
 * ## Why these numbers
 *
 * **FOV 32°.** At 35 mm creature scale a wide lens produces the barrel distortion of a macro photo
 * taken too close, which reads as a toy. A long lens keeps the perspective honest and keeps parallel
 * cabinet edges parallel, which is most of what makes the room read as architecture.
 *
 * **Pitch 50°.** Deep enough to show the ground plane the game is actually played on, shallow enough
 * that every prop keeps a front face. The previous build's top-down camera had no front faces and
 * therefore no depth — the single most-reported defect against it.
 *
 * **Yaw 45°, fixed.** The orientation never changes during play. That is what lets `scene.ts` decide
 * at load time which walls stand between the viewer and each room and build those as stubs, instead
 * of fading walls every frame and inheriting a whole class of transparency artefacts.
 *
 * ## Why the follow is damped and led
 *
 * A camera locked to the scout makes the world slide underneath a stationary bug, which is both
 * nauseating and useless for reading a route. A damped follow with a small velocity lead puts the
 * scout slightly behind centre when it moves, so the space it is moving *into* is the space on
 * screen — which is the whole requirement that approaching danger stays visible.
 */

export const CAM_FOV = 32;
export const CAM_PITCH = (50 * Math.PI) / 180;
/**
 * Yaw, fixed for the whole game.
 *
 * 225°, not 45°. The apartment is authored with its fitted furniture against the low-X / low-Z
 * walls — the kitchen run, the bed head, the sofa back — so the camera has to sit on the HIGH side
 * and look back along -X-Z for those to back their rooms rather than stand in front of them.
 *
 * Measured with the camera at 45°: the kitchen's base run, worktop and splashback were permanently
 * between the viewer and the scout. Registering them as occluders made the entire frame a
 * stochastic alpha-hash dither — correct behaviour from the fade system, applied to something that
 * should never have been fading in the first place. The fix is where the camera stands, not how
 * hard things fade.
 */
export const CAM_YAW = (5 * Math.PI) / 4;

/** Zoom range, in millimetres from the scout. Deliberately narrow — this is not an editor camera. */
export const CAM_NEAR_MM = 780;
export const CAM_FAR_MM = 2150;
export const CAM_DEFAULT_MM = 1320;

/** Seconds for the follow to cover ~63 % of the remaining distance. */
const FOLLOW_TAU = 0.16;
/** How far ahead of the scout the camera leans, per unit of speed. */
const LEAD_SECONDS = 0.34;
/** Vertical transitions are eased harder than horizontal ones — a climb should not whip the view. */
const HEIGHT_TAU = 0.3;

export interface CameraBasis {
  /** World XZ direction the player means by "forward". */
  readonly forwardX: number;
  readonly forwardZ: number;
  readonly rightX: number;
  readonly rightZ: number;
}

/**
 * The basis WASD is interpreted in.
 *
 * Constant, because the yaw is constant. Exported as data so the input layer never has to reach
 * into the camera object, and so a test can assert that "W" moves the scout away from the viewer.
 */
export const BASIS: CameraBasis = {
  forwardX: Math.cos(CAM_YAW),
  forwardZ: Math.sin(CAM_YAW),
  rightX: Math.sin(CAM_YAW),
  rightZ: -Math.cos(CAM_YAW),
};

/** Unit vector the camera looks along, in XZ. Used to decide which walls are cut away. */
export const VIEW_DIR_X = Math.cos(CAM_YAW);
export const VIEW_DIR_Z = Math.sin(CAM_YAW);

export interface FollowTarget {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** World units per second — drives the lead. */
  readonly speed: number;
  /** Radians. */
  readonly heading: number;
}

/** Keep the near plane this far outside whatever the camera backed into. */
const COLLISION_MARGIN = mm(90);
/** Never pull closer than this, or the scout fills the frame. */
const COLLISION_MIN_MM = 520;

export class GameCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly focus = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly back = new THREE.Vector3();
  private readonly caster = new THREE.Raycaster();
  private collisionDistance = 0;
  private distance = mm(CAM_DEFAULT_MM);
  private targetDistance = mm(CAM_DEFAULT_MM);
  private smoothedY = 0;
  private started = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAM_FOV, aspect, mm(20), mm(16_000));
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Player zoom, clamped. Positive `delta` pulls back. */
  zoom(delta: number): void {
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + delta,
      mm(CAM_NEAR_MM),
      mm(CAM_FAR_MM),
    );
  }

  get zoomFraction(): number {
    return (this.distance - mm(CAM_NEAR_MM)) / (mm(CAM_FAR_MM) - mm(CAM_NEAR_MM));
  }

  /**
   * Snap to the target without easing.
   *
   * Used on boot and on restart. Easing in from wherever the previous run left the camera is a
   * visible seam and, on restart, is state leakage — a tracked completion gate.
   */
  reset(target: FollowTarget): void {
    this.started = false;
    this.distance = mm(CAM_DEFAULT_MM);
    this.targetDistance = mm(CAM_DEFAULT_MM);
    this.update(0, target);
  }

  update(dt: number, target: FollowTarget): void {
    // Lead the scout by where it is going, capped so a sprint does not throw the focus off-screen.
    const lead = Math.min(target.speed * LEAD_SECONDS, mm(240));
    const leadX = Math.sin(target.heading) * lead;
    const leadZ = Math.cos(target.heading) * lead;

    this.desired.set(target.x + leadX, target.y, target.z + leadZ);

    if (!this.started || dt <= 0) {
      this.focus.copy(this.desired);
      this.smoothedY = target.y;
      this.distance = this.targetDistance;
      this.started = true;
    } else {
      // Exponential smoothing, framerate independent. A per-frame lerp constant would make the
      // camera behave differently at 60 Hz and 144 Hz, which is exactly the kind of thing that
      // makes "camera lag hid the threat" un-reproducible.
      const k = 1 - Math.exp(-dt / FOLLOW_TAU);
      this.focus.x += (this.desired.x - this.focus.x) * k;
      this.focus.z += (this.desired.z - this.focus.z) * k;
      const ky = 1 - Math.exp(-dt / HEIGHT_TAU);
      this.smoothedY += (target.y - this.smoothedY) * ky;
      this.focus.y = this.smoothedY;
      this.distance += (this.targetDistance - this.distance) * k;
    }

    const horizontal = this.distance * Math.cos(CAM_PITCH);
    this.camera.position.set(
      this.focus.x - horizontal * Math.cos(CAM_YAW),
      this.focus.y + this.distance * Math.sin(CAM_PITCH),
      this.focus.z - horizontal * Math.sin(CAM_YAW),
    );
    this.camera.lookAt(this.focus);
  }

  /** Where the camera is currently looking. The occlusion system's primary focus point. */
  get focusPoint(): THREE.Vector3 {
    return this.focus;
  }

  /** How far the collision solver had to pull the camera in, in world units. 0 when clear. */
  get pulledIn(): number {
    return this.collisionDistance;
  }

  /**
   * Pull the camera in front of anything it has backed into.
   *
   * A fixed diagonal camera at insect scale spends much of its time with its ideal position inside
   * furniture. Measured: with the scout in the kitchen toe-kick at z = -1817, the camera solved to
   * z = -3045 mm and the base-cabinet carcass occupies -3300…-2740 mm — the camera was inside the
   * cupboard, and the frame was two enormous unlit planes.
   *
   * Fading the blocker cannot fix this, because the problem is not that something is in the way; it
   * is that the viewpoint is inside solid geometry and the near plane is clipping through it. The
   * camera has to move. Occlusion fading still handles the ordinary case of a prop standing between
   * a legitimately-placed camera and the scout.
   */
  resolveCollision(obstacles: THREE.Object3D): void {
    this.back.copy(this.camera.position).sub(this.focus);
    const distance = this.back.length();
    if (distance < 1e-4) return;
    this.back.normalize();

    this.caster.set(this.focus, this.back);
    this.caster.far = distance;
    const hits = this.caster.intersectObject(obstacles, true);

    let nearest = distance;
    for (const hit of hits) {
      if (hit.distance < mm(40)) continue;
      // Only walls. Props are handled by fading, which does not move the viewpoint.
      if (hit.object.userData.cameraCollide !== true) continue;
      nearest = hit.distance;
      break;
    }

    const clamped = Math.max(mm(COLLISION_MIN_MM), nearest - COLLISION_MARGIN);
    this.collisionDistance = distance - clamped;
    if (this.collisionDistance <= 0) {
      this.collisionDistance = 0;
      return;
    }
    this.camera.position.copy(this.focus).addScaledVector(this.back, clamped);
    this.camera.lookAt(this.focus);
  }
}

/**
 * Turn raw key state into a world-space movement vector.
 *
 * Kept here rather than in the input layer because "camera-relative" is a fact about the camera,
 * and because a test can then assert the mapping without constructing a renderer.
 */
export function cameraRelative(
  forward: number,
  strafe: number,
): { readonly x: number; readonly z: number } {
  const x = BASIS.forwardX * forward + BASIS.rightX * strafe;
  const z = BASIS.forwardZ * forward + BASIS.rightZ * strafe;
  const length = Math.hypot(x, z);
  if (length < 1e-5) return { x: 0, z: 0 };
  // Normalised so diagonal movement is not faster than cardinal movement.
  return { x: x / length, z: z / length };
}

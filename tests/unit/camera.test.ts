import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BASIS, CAM_PITCH, CAM_YAW, cameraRelative } from '../../src/view/camera';

/**
 * Does a key move the scout the way the player expects to SEE it move?
 *
 * `src/view/camera.ts` claimed for a long time that "a test can then assert that W moves the scout
 * away from the viewer". No such test existed — `cameraRelative` and `BASIS` had zero references
 * anywhere under `tests/`. In that gap the strafe axis shipped negated, so D walked the scout left,
 * and the only thing that caught it was a person playing the game and saying so.
 *
 * ## Why this builds a real camera instead of checking the basis vectors
 *
 * Asserting `BASIS.rightX === -Math.sin(yaw)` would just restate the implementation in the test —
 * if the convention in the source is wrong, the same wrong convention written twice agrees with
 * itself. The player's actual claim is about the SCREEN: "I press D and the bug goes left." So the
 * test places a three.js camera exactly where `CameraRig.update` places it, projects the scout
 * before and after a step, and asserts the direction it travelled in normalised device coordinates.
 *
 * NDC x is +1 at the right edge of the screen. NDC y is +1 at the TOP (this is not screen pixels,
 * where y grows downward).
 */

const DISTANCE = 3;

/** A camera positioned by the same formula as `CameraRig.update`, looking at `focus`. */
function cameraLookingAt(focus: THREE.Vector3): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.01, 100);
  const horizontal = DISTANCE * Math.cos(CAM_PITCH);
  camera.position.set(
    focus.x - horizontal * Math.cos(CAM_YAW),
    focus.y + DISTANCE * Math.sin(CAM_PITCH),
    focus.z - horizontal * Math.sin(CAM_YAW),
  );
  camera.lookAt(focus);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/** Where a key press sends the scout on screen: +x right, +y up. */
function screenDelta(forward: number, strafe: number): { x: number; y: number } {
  const origin = new THREE.Vector3(0, 0, 0);
  const camera = cameraLookingAt(origin);

  const move = cameraRelative(forward, strafe);
  // A step small enough to stay well inside the frame, large enough to dwarf float error.
  const after = new THREE.Vector3(move.x, 0, move.z).multiplyScalar(0.25);

  const a = origin.clone().project(camera);
  const b = after.clone().project(camera);
  return { x: b.x - a.x, y: b.y - a.y };
}

describe('WASD moves the scout the way the player sees it', () => {
  it('D moves the scout to the RIGHT of the screen', () => {
    const d = screenDelta(0, 1);
    expect(
      d.x,
      `D produced screen dx=${d.x.toFixed(3)}, expected positive (rightward)`,
    ).toBeGreaterThan(0.02);
  });

  it('A moves the scout to the LEFT of the screen', () => {
    const d = screenDelta(0, -1);
    expect(d.x, `A produced screen dx=${d.x.toFixed(3)}, expected negative (leftward)`).toBeLessThan(
      -0.02,
    );
  });

  it('W moves the scout AWAY from the viewer, up the screen', () => {
    const d = screenDelta(1, 0);
    expect(
      d.y,
      `W produced screen dy=${d.y.toFixed(3)}, expected positive (up-screen)`,
    ).toBeGreaterThan(0.02);
  });

  it('S moves the scout TOWARD the viewer, down the screen', () => {
    const d = screenDelta(-1, 0);
    expect(d.y, `S produced screen dy=${d.y.toFixed(3)}, expected negative (down-screen)`).toBeLessThan(
      -0.02,
    );
  });

  /*
   * A and D must be opposites, and so must W and S. This is what fails loudly if someone "fixes"
   * an inversion by negating one branch of the key read instead of the basis vector.
   */
  it('opposite keys produce opposite motion', () => {
    const right = cameraRelative(0, 1);
    const left = cameraRelative(0, -1);
    expect(right.x).toBeCloseTo(-left.x, 10);
    expect(right.z).toBeCloseTo(-left.z, 10);

    const forward = cameraRelative(1, 0);
    const back = cameraRelative(-1, 0);
    expect(forward.x).toBeCloseTo(-back.x, 10);
    expect(forward.z).toBeCloseTo(-back.z, 10);
  });

  it('diagonals are not faster than cardinals', () => {
    const diagonal = cameraRelative(1, 1);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1, 6);
  });

  /**
   * The basis is orthonormal and right-handed.
   *
   * `right` must equal `cross(forward, up)` for a Y-up right-handed scene. Stated as a cross
   * product rather than as `(-sin, cos)` so the assertion carries the reason, not just the value.
   */
  it('the camera basis is right-handed', () => {
    const forward = new THREE.Vector3(BASIS.forwardX, 0, BASIS.forwardZ);
    const up = new THREE.Vector3(0, 1, 0);
    const expectedRight = new THREE.Vector3().crossVectors(forward, up).normalize();

    expect(BASIS.rightX).toBeCloseTo(expectedRight.x, 10);
    expect(BASIS.rightZ).toBeCloseTo(expectedRight.z, 10);
  });
});

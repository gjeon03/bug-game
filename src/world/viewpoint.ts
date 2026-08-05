/**
 * The fixed viewing axis the apartment is authored against.
 *
 * This lives in the WORLD layer, not the view layer, because it is a fact about how the flat is
 * built: which walls are a room's backing and which are cut away, and therefore which side the
 * fitted furniture goes on. The renderer reads it to place the camera; the world reads it to decide
 * wall heights. Both must agree, always.
 *
 * It was previously a constant inside `view/camera.ts`, and when the yaw was flipped 45° -> 225°
 * nothing propagated the change into the region files: nine `solid: true` flags silently became
 * flags on camera-NEAR walls and four of five rooms rendered as a plasterboard slab. Putting the
 * axis here — where both layers can see it, with no import from world to view — is what makes that
 * class of desync impossible rather than merely fixed.
 */

/** Camera yaw about Y. 225°: the camera sits at HIGH x / HIGH z and looks back along -X-Z. */
export const VIEW_YAW = (5 * Math.PI) / 4;

/** Unit vector the camera looks along, in XZ. */
export const VIEW_DIR_X = Math.cos(VIEW_YAW);
export const VIEW_DIR_Z = Math.sin(VIEW_YAW);

/**
 * Does a wall with this outward normal stand between the viewer and the room it encloses?
 *
 * A wall faces the viewer when its outward normal points back along the view direction.
 */
export function facesViewer(outwardX: number, outwardZ: number): boolean {
  return outwardX * VIEW_DIR_X + outwardZ * VIEW_DIR_Z < -0.15;
}

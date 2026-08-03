/**
 * Scale anchor for the whole art pipeline.
 *
 * The simulation's scout is 26 world units long. A German cockroach (Blattella germanica) — the
 * species that actually lives in Korean apartment kitchens — is ~13-16 mm body length, and this
 * game's scout is a heroic adult, so we anchor on 35 mm. Everything else in the kitchen is then
 * modelled at its true real-world size and converted through this one constant.
 *
 * Getting this right IS the scale gag: a 200 mm dinner plate becomes 148 world units, which is
 * nearly six scouts across. If props are authored "to taste" instead of to millimetres, the world
 * silently collapses back into a floor plan.
 */
export const MM_PER_UNIT = 35 / 26;

/** Millimetres -> world units. */
export function mm(millimetres) {
  return millimetres / MM_PER_UNIT;
}

/** Centimetres -> world units. */
export function cm(centimetres) {
  return mm(centimetres * 10);
}

/**
 * Pixels baked per world unit.
 *
 * The gameplay camera shows ~1200 world units across a 1920 px viewport (1.6 px/unit). Baking at
 * 2.0 gives headroom for HiDPI and for the camera's zoom-in without resampling artefacts, and it
 * matches the existing runtime ATLAS_SCALE so baked and procedural art share one scale.
 */
export const BAKE_PPU = 2.0;

/**
 * Supersampling factor for the offline render.
 *
 * This is the whole reason to bake offline: 4x4 = 16 samples per output pixel costs nothing at
 * build time and is unaffordable per frame. It is what makes a baked plate rim read as ceramic
 * instead of as a jagged circle.
 */
export const SSAA = 4;

/**
 * Camera tilt away from straight-down, in degrees.
 *
 * Pure top-down cannot show elevation, which is why the current build has no readable depth. A
 * small tilt reveals the front face of every object while keeping the ground plane close enough to
 * top-down that the existing 2D navigation and collision stay valid without modification. The
 * simulation remains 2D; only the presentation gains a third dimension.
 */
export const CAMERA_TILT_DEG = 26;

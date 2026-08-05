/**
 * The one scale anchor for the whole apartment.
 *
 * A heroic adult German cockroach is 35 mm long and the rig in `view/roach.ts` is 26 world units
 * long, so one world unit is 35/26 ≈ 1.346 mm. Every dimension in this game is authored in real
 * millimetres and converted here exactly once.
 *
 * This is not pedantry. It is the scale gag: a 200 mm dinner plate is 149 units — nearly six scouts
 * across — and a 2400 mm ceiling is 1783 units, sixty-eight scouts up. Authoring "to taste" is what
 * collapsed the previous build into a floor plan.
 */
export const MM_PER_UNIT = 35 / 26;

/** Millimetres to world units. */
export const mm = (millimetres: number): number => millimetres / MM_PER_UNIT;

/** World units back to millimetres — for diagnostics and evidence, never for gameplay maths. */
export const toMm = (units: number): number => units * MM_PER_UNIT;

/** Reference body length of the scout, in millimetres. */
export const SCOUT_BODY_MM = 35;

/** Standing height of an interior wall in a Korean apartment. */
export const WALL_HEIGHT_MM = 2400;

/**
 * How tall a wall stays when it is cut away.
 *
 * The camera has a fixed orientation, so the walls between it and the interior are known at build
 * time. They are not faded per frame — they are simply built short. A stub keeps the room reading
 * as an enclosed volume (you still see the plane meet the floor, and the baseboard the colony lives
 * behind) while never hiding anything. 320 mm is a little above the tallest baseboard and well
 * below the shortest prop the player needs to see over.
 */
export const WALL_STUB_MM = 320;

/** Standard Korean apartment baseboard (걸레받이): the colony's motorway. */
export const BASEBOARD_HEIGHT_MM = 90;
export const BASEBOARD_DEPTH_MM = 14;

/** Navigation grid resolution. 60 mm is a little under two scout body-lengths. */
export const GRID_CELL_MM = 60;

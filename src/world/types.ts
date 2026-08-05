/**
 * The authored-world vocabulary.
 *
 * Everything here is *data about the apartment*: where its floors are, what stands on them, which
 * gaps a cockroach can squeeze through, and which of those gaps are currently sealed. It knows
 * nothing about colony state, workers, or the household — those live in `src/colony/` and read this
 * as a read-only map.
 *
 * All coordinates are WORLD UNITS (see `units.ts`), authored in millimetres and converted once at
 * the point of authorship. X runs east, Z runs south, Y is up. The camera looks toward +X and +Z,
 * so lower X/Z is nearer the viewer.
 */

/** The five authored regions. Order here is the order they normally open. */
export type RegionId = 'kitchen' | 'hallway' | 'living' | 'bathroom' | 'bedroom';

export const REGION_ORDER: readonly RegionId[] = [
  'kitchen',
  'hallway',
  'living',
  'bathroom',
  'bedroom',
];

/**
 * A walkable plane.
 *
 * The apartment is not one continuous navmesh; it is a small stack of horizontal planes joined by
 * authored climbs. A cockroach on the worktop and a cockroach on the floor 880 mm below are on
 * different surfaces and cannot reach each other except at a cable, a splashback seam, or a fallen
 * chopstick. Modelling that explicitly is what makes vertical routes a *decision* rather than a
 * pathfinding accident.
 */
export interface Surface {
  readonly id: string;
  readonly region: RegionId;
  /** Height of the walkable plane, world units. */
  readonly y: number;
  /** Extent in XZ, world units. */
  readonly bounds: Rect;
  /**
   * How readable this surface is to the household. Multiplies the exposure of every cell on it.
   * A worktop is lit and scanned constantly; the void under the sink never is.
   */
  readonly exposure: number;
  /** Human-facing label key in the localization catalog, e.g. `surface.kitchen.counter`. */
  readonly labelKey: string;
}

export interface Rect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * A vertical transition between two surfaces.
 *
 * Traversed by the scout with the contextual key and by workers automatically once a route uses it.
 * `capacity` is how many bodies can be on it at once — a phone cable takes one at a time, a
 * cabinet seam takes four abreast — and is what turns a popular climb into a congestion problem.
 */
export interface Link {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly at: Vec2;
  /**
   * Where the link lands on `to`, when that is not the same XZ as `at`.
   *
   * A cable climb comes out directly above where it started, so it needs nothing here. A pipe run
   * that leaves the bathroom behind the basin and emerges under the kitchen sink four metres away
   * does — and that asymmetry is the whole value of the bathroom shortcut.
   */
  readonly exitAt?: Vec2;
  /** Seconds for one body to traverse. Climbing is slow; that is the cost of height. */
  readonly seconds: number;
  readonly capacity: number;
  readonly kind: LinkKind;
  readonly labelKey: string;
  /** When set, the link does not exist until this gate is open. */
  readonly gate?: string;
}

export type LinkKind = 'cable' | 'pipe' | 'seam' | 'fabric' | 'leg' | 'gap' | 'drop';

/**
 * A sealed physical passage between two regions.
 *
 * This is the whole-home progression made physical. A gate is never an invisible wall or a "level
 * locked" toast — it is a specific object in the world (a screwed-down toe-kick, a caulked
 * baseboard joint, a door closed onto its sweep) that the player can see, inspect, and be told
 * exactly what it would take to get through.
 *
 * `requires` is evaluated against colony state. Opening one plays an authored world change:
 * geometry actually moves.
 */
export interface Gate {
  readonly id: string;
  readonly from: RegionId;
  readonly to: RegionId;
  /** Where the scout must stand to run the operation. */
  readonly at: Vec2;
  readonly surface: string;
  readonly kind: GateKind;
  readonly labelKey: string;
  /** Catalog key explaining, in Korean, what this gate physically is. */
  readonly descriptionKey: string;
  readonly requires: GateRequirement;
  /** Seconds of held work by the scout, once the requirements are met. */
  readonly workSeconds: number;
  /**
   * The passages this gate creates when it opens.
   *
   * Normally one. The links are absent from the navigation graph entirely until the operation
   * completes, so an unopened region is not merely "blocked" — it is genuinely unreachable, and no
   * pathfinding query can leak a worker into it.
   */
  readonly opens: readonly Link[];
}

export type GateKind = 'toekick' | 'baseboard' | 'pipe' | 'doorsweep' | 'cableport';

/**
 * What the colony must be able to do before a gate can be opened.
 *
 * Every field is optional so a gate states only what it actually needs; the UI reads the unmet
 * fields back to the player as the *blocker*, which is the difference between "locked" and "you
 * need two more workers and a relay in the hallway".
 */
export interface GateRequirement {
  readonly workers?: number;
  readonly food?: number;
  readonly moisture?: number;
  /** Footholds that must exist and be connected, by site id. */
  readonly footholds?: readonly string[];
  /** A route must be delivering into this foothold when the operation starts. */
  readonly suppliedFoothold?: string;
  /** Region alert must be at or below this level — you cannot open a wall while they are looking. */
  readonly maxAlert?: number;
  /** An adaptation family that must have been committed to. */
  readonly adaptation?: string;
}

/** A place the colony can take food or water from. */
export interface ResourceSite {
  readonly id: string;
  readonly region: RegionId;
  readonly surface: string;
  readonly at: Vec2;
  readonly kind: ResourceKind;
  /** Total units available. Depletes; some kinds replenish on a household routine. */
  readonly amount: number;
  /** Units per second one worker extracts. */
  readonly rate: number;
  /** Extra evidence generated per unit taken — a torn snack bag is louder than a crumb. */
  readonly disturbance: number;
  readonly labelKey: string;
  /** Replenished by this routine id, if any. */
  readonly refilledBy?: string;
  /** Hidden until the scout inspects within `DISCOVER_RADIUS`. */
  readonly hidden?: boolean;
}

export type ResourceKind = 'food' | 'moisture';

/**
 * A crack, void or cavity the colony can occupy.
 *
 * Footholds are the spatial spine of progression: every one is a real dark place in a real object,
 * and taking one is what makes the next room reachable. `role` decides what it does once claimed.
 */
export interface FootholdSite {
  readonly id: string;
  readonly region: RegionId;
  readonly surface: string;
  readonly at: Vec2;
  readonly role: FootholdRole;
  readonly labelKey: string;
  readonly descriptionKey: string;
  /** Brood capacity this site adds when claimed. */
  readonly capacity: number;
  /** How well it hides traffic passing through it, 0..1. Subtracted from local exposure. */
  readonly concealment: number;
  readonly cost: FootholdCost;
  /** Claimed from the start — the kitchen home nest. */
  readonly initial?: boolean;
}

export type FootholdRole = 'home' | 'relay' | 'satellite';

export interface FootholdCost {
  readonly food: number;
  readonly moisture: number;
  readonly workers: number;
}

/** An axis-aligned obstruction on a surface. Blocks movement; does not block sight. */
export interface Blocker {
  readonly rect: Rect;
  readonly surface: string;
}

/**
 * One authored region: its floors, its furniture, its opportunities and its dangers.
 *
 * A region is self-contained data. `house.ts` assembles the five into a single navigable world and
 * is the only place that knows about their relative placement.
 */
export interface RegionSpec {
  readonly id: RegionId;
  readonly labelKey: string;
  /** Outer extent, used for the floor slab, walls and camera bounds. */
  readonly bounds: Rect;
  readonly surfaces: readonly Surface[];
  readonly links: readonly Link[];
  readonly blockers: readonly Blocker[];
  readonly resources: readonly ResourceSite[];
  readonly footholds: readonly FootholdSite[];
  /** Wall segments. Cut-away state is computed from the camera at build time. */
  readonly walls: readonly WallSpec[];
  /** Everything the player sees. Ordered only for authoring readability. */
  readonly props: readonly PropPlacement[];
  /** Lights motivated by objects in this region. */
  readonly lights: readonly LightSpec[];
  /** Bright regions of the floor plane, used to seed the exposure field. */
  readonly exposureZones: readonly ExposureZone[];
}

/**
 * A wall segment.
 *
 * `outward` is the direction the wall's visible face points — away from the room it encloses. The
 * renderer compares it with the fixed camera forward vector to decide whether this wall stands
 * between the player and the room, and builds it as a stub if so.
 */
export interface WallSpec {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly outward: Vec2;
  readonly thicknessMm?: number;
  /** A doorway or opening punched through this wall, as distance-along-wall ranges. */
  readonly openings?: readonly WallOpening[];
  /** Never cut this wall away, whatever the camera says — used for the far envelope. */
  readonly solid?: boolean;
}

export interface WallOpening {
  /** Distance along the wall from `from`, world units. */
  readonly start: number;
  readonly width: number;
  /** Height of the opening. A door is full height; a serving hatch is not. */
  readonly height: number;
  readonly sill?: number;
}

/** A prop instance: which builder makes it, and where it stands. */
export interface PropPlacement {
  readonly kind: string;
  readonly at: Vec3;
  /** Y rotation in radians. */
  readonly rotY?: number;
  readonly scale?: number;
  /** Fade this prop when it stands between the camera and the scout. */
  readonly occluder?: boolean;
  /** Lowest coverage the fade may reach. Large architecture can go further than a small prop. */
  readonly fadeFloor?: number;
  /** Builder-specific options, validated by the builder. */
  readonly options?: Readonly<Record<string, number | string | boolean>>;
}

export interface LightSpec {
  readonly kind: 'point' | 'rect' | 'spot';
  readonly at: Vec3;
  readonly colour: number;
  readonly intensity: number;
  readonly distance?: number;
  /** Aim point for a spot. */
  readonly target?: Vec3;
  readonly width?: number;
  readonly height?: number;
  /** This light only burns while the named routine is active. */
  readonly routine?: string;
  readonly castShadow?: boolean;
}

/**
 * A patch of floor the household can see clearly.
 *
 * Exposure is the currency the hallway and bedroom are built from: it is what makes a shorter route
 * more dangerous than a longer one, and it is generated by lights, open floor and sightlines rather
 * than by a designer-placed danger number.
 */
export interface ExposureZone {
  readonly rect: Rect;
  readonly surface: string;
  /** 0 = invisible, 1 = fully lit open floor. */
  readonly level: number;
  /** Only counts while this routine is running (a lamp that is off is not exposure). */
  readonly routine?: string;
}

import type { NightIndex } from './types.ts';

/* ── World ─────────────────────────────────────────────────────────────────── */

export const WORLD_W = 3600;
export const WORLD_H = 2600;
/** Thickness of the room shell. The playable interior is inset by this on every side. */
export const WALL_THICKNESS = 56;
/**
 * Anything within this distance of a solid edge counts as cover — roughly the depth of a toe-kick,
 * about four body lengths. Cabinetry is safety, and that is taught by the darkness, not by a tooltip.
 */
export const COVER_RADIUS = 120;

/* ── Scout ─────────────────────────────────────────────────────────────────── */

export const SCOUT_RADIUS = 11;
export const SCOUT_LENGTH = 26;
export const SCOUT_SPEED = 218;
export const SCOUT_SPRINT_SPEED = 402;
export const SCOUT_ACCEL = 2600;
/** Fraction of velocity remaining after one second with no input. */
export const SCOUT_DAMP = 0.000004;
export const SCOUT_TURN_RATE = 16;
export const SCOUT_STAMINA_MAX = 100;
export const SCOUT_SPRINT_DRAIN = 36;
export const SCOUT_STAMINA_REGEN = 19;
export const SCOUT_STAMINA_REGEN_DELAY = 0.7;
export const SCOUT_RESPAWN_TIME = 2.6;
export const SCOUT_INVULN_TIME = 1.6;

/* ── Pheromone ─────────────────────────────────────────────────────────────── */

export const NODE_SPACING = 26;
export const NODE_LIFE = 130;
/**
 * Worker traffic refreshes the nodes it walks over. A route in use sustains itself; a route nobody
 * uses evaporates. That is how real trail pheromone behaves, and it removes the busywork of
 * re-walking a working supply line every minute.
 */
export const NODE_REINFORCE = 7.5;
export const RESERVE_MAX = 100;
export const RESERVE_REGEN = 5.2;
export const RESERVE_COST = 1;
/**
 * Concurrent routes. Five is enough for three food lines and two water lines, which is what a
 * surviving colony actually needs — four made the oldest route silently evict itself and could
 * delete the colony's only water supply without the player noticing.
 */
export const MAX_ROUTES = 5;
/** How close a route end must be to a nest/resource to count as linked. */
export const LINK_RADIUS = 92;
/** How far a worker can be from a trail node and still read it. */
export const FOLLOW_RADIUS = 150;
export const ERASE_RADIUS = 90;
/** Life removed per second while erasing — a fresh node is gone in well under a second. */
export const ERASE_RATE = 140;
export const MAX_NODES_PER_ROUTE = 190;

/* ── Workers ───────────────────────────────────────────────────────────────── */

export const WORKER_CAP = 90;
export const WORKER_RADIUS = 8;
export const WORKER_SPEED_MIN = 118;
export const WORKER_SPEED_MAX = 148;
export const WORKER_CARRY_FOOD = 6;
export const WORKER_CARRY_WATER = 5;
export const WORKER_HARVEST_TIME = 0.85;
/**
 * Concurrent harvesters per resource node. This is what turns "more workers" into "I need more
 * routes" instead of "I strip every crumb pile in forty seconds".
 */
export const HARVEST_SLOTS = 4;
export const WORKER_SEPARATION = 17;
export const WORKER_LOOKAHEAD = 4;
export const WORKER_PANIC_TIME = 1.8;
export const NYMPH_TIME = 6;

/* ── Colony ────────────────────────────────────────────────────────────────── */

export const START_POPULATION = 6;
export const BASE_CAPACITY = 14;
export const CAPACITY_PER_NEST = 8;
export const BROOD_CHAMBER_CAPACITY = 14;
export const FOOD_CAP = 200;
export const WATER_CAP = 160;
export const CACHE_FOOD_BONUS = 120;
export const CACHE_WATER_BONUS = 60;
export const BROOD_RATE = 0.09;
export const BROOD_CHAMBER_MULT = 1.75;
export const BROOD_FOOD_COST = 8;
export const BROOD_WATER_COST = 4;
/**
 * Brood only draws from reserves above this margin. Without it the colony eats its own starting
 * stock down to zero before the player's first delivery lands, and starves for reasons the player
 * had no way to see coming.
 */
export const BROOD_RESERVE_MARGIN_FOOD = 14;
export const BROOD_RESERVE_MARGIN_WATER = 8;
export const START_FOOD = 46;
export const START_WATER = 34;
export const UPKEEP_FOOD = 0.016;
export const UPKEEP_WATER = 0.009;
export const STARVE_DEATH_INTERVAL = 5.5;
/** No colony member starves during the opening minute; the tutorial has to be survivable. */
export const STARVE_GRACE = 55;
export const NEST_INTEGRITY_DRAIN = 0.032;
/** The colony patches the crack back up once the spray moves off it. */
export const NEST_REPAIR_RATE = 0.03;

/* ── Suspicion ─────────────────────────────────────────────────────────────── */

export const SUSPICION_MAX = 100;
export const SUSPICION_DECAY = 0.1;
/** Suspicion can never fall below this fraction of its own peak — evidence is not erasable. */
export const SUSPICION_PEAK_FLOOR = 0.55;
export const TIER_THRESHOLDS = [25, 50, 70, 90] as const;

export const SUSPICION_WEIGHTS = {
  /** Per sighting of a roach in bright light while a patrol is looking. */
  seen: 3.5,
  /** Per second, per corpse lying in the open. */
  corpse: 0.02,
  /** Per second, scaled by the number of workers on exposed floor. */
  traffic: 0.035,
  /** One-shot when a food node is fully drained. */
  depleted: 3,
  /**
   * One-shot when a trap catches something. Deliberately small: the household already knows by the
   * time traps are down, and a large value made traps self-amplifying — catches pushed suspicion up,
   * which deployed more traps, which caught more. A feedback loop the player cannot break is not a
   * difficulty curve.
   */
  trap: 1.5,
  /** One-shot per crack claimed — a bigger nest is a more obvious nest. */
  expansion: 7,
  /** Per second of sprinting on exposed floor. */
  noise: 0.6,
  /** Per second, scaled by pheromone trail length on exposed floor. */
  droppings: 0.11,
} as const;

/* ── Nights ────────────────────────────────────────────────────────────────── */

export const NIGHT_LENGTH: Record<NightIndex, number> = { 1: 178, 2: 266, 3: 322 };
export const INTERLUDE_LENGTH = 11;
/** Fraction of its original size an un-drained resource recovers between nights (they cook again). */
export const NIGHT_RESOURCE_REGROWTH = 0.3;
/** Suspicion never drops below this once the night has started. */
export const NIGHT_SUSPICION_FLOOR: Record<NightIndex, number> = { 1: 0, 2: 10, 3: 22 };

/* ── Win / lose ────────────────────────────────────────────────────────────── */

/** Reserve fraction below which the HUD and the objective start shouting about a shortage. */
export const CRITICAL_RESERVE = 0.12;

export const WIN_POPULATION = 36;
export const WIN_FOOD = 120;
export const WIN_WATER = 90;

/* ── Threats ───────────────────────────────────────────────────────────────── */

export const FOOT_WARN_TIME = 1.15;
export const FOOT_RADIUS = 150;
export const FOOT_KILL_RADIUS = 122;
export const PATROL_STEP_INTERVAL = 1.45;
export const TRAP_RADIUS = 62;
export const TRAP_ARM_TIME = 2.2;
export const TRAP_CAPACITY = 3;
export const TRAP_STRUGGLE_TIME = 4.4;
export const BAIT_RADIUS = 74;
/** Probability per second that a roach standing in bait dies. Low enough to leave time to flee. */
export const BAIT_DPS = 0.12;
export const SPRAY_RADIUS = 210;
/** Probability per second that a roach inside a fully ramped spray cloud dies. */
export const SPRAY_DPS = 0.8;
export const MAX_HAZARDS = 12;

/* ── Exposure ──────────────────────────────────────────────────────────────── */

/** Exposure above this starts filling the "spotted" meter. */
export const EXPOSURE_DANGER = 0.55;
/**
 * Baseline exposure that generates no evidence at all. Evidence is graded by how far *above* this a
 * worker or a trail node sits, rather than by a binary threshold: a binary test either ignored
 * everything (at 0.55, nothing on unlit floor ever counted) or counted everything (at 0.26, unlit
 * open tile reads 0.30, so every roach outside a toe-kick maxed the meter). Grading makes the
 * difference between "across the dark middle" and "through the fridge light" a real gradient.
 */
export const EVIDENCE_BASELINE = 0.24;
/** Caps on the graded sums, so a huge colony cannot run the meter away on its own. */
export const TRAFFIC_EVIDENCE_CAP = 5;
export const TRAIL_EVIDENCE_CAP = 6;
/**
 * Ceiling on any single roach's contribution to the traffic term. Without it, a patrol sweeping its
 * torch across the colony multiplied every worker's contribution five-fold and a single patrol pass
 * added ~80 suspicion — the household reacting to its own torch rather than to the player's routes.
 * Being caught in a beam is meant to fire the one-shot `seen` cause, not to inflate traffic.
 */
export const WORKER_EVIDENCE_CEILING = 0.3;
export const SPOT_FILL_RATE = 0.62;
export const SPOT_DECAY_RATE = 0.5;

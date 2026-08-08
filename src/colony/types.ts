import type { Rng } from '../core/rng';
import type { House } from '../world/house';
import type { Nav, NavPoint } from '../world/nav';
import type { RegionId } from '../world/types';

/**
 * Colony simulation state.
 *
 * ## The one rule that shapes every type here
 *
 * **No player-facing string ever enters this file.** State carries catalog *keys* and *params*;
 * `t()` is called only in `src/ui/` and `src/view/`. The previous build stored rendered Korean in
 * `world.objective`, `world.hud`, `world.hint` and so on, which is how English reached production
 * past twenty-nine passing localization tests — the tests checked the catalog, and the catalog was
 * fine. Here a sim-side string cannot exist to go untranslated.
 *
 * ## Mutability
 *
 * State is mutated in place, deliberately, against the repository's general immutability rule. A
 * 60 Hz simulation with a fixed worker pool that allocated a new object graph every tick would
 * spend its frame budget in the garbage collector. The compensating discipline is that mutation is
 * confined to `src/colony/`, the view layer only ever reads, and every field's owner is named.
 */

export type RunStatus = 'playing' | 'won' | 'lost';

/** The four chapters plus the finale. Chapter identity drives pacing, not just labelling. */
/**
 * `hold` is the kitchen's second act, and it is the only one of these the shipped build reaches.
 *
 * The other three name rooms that are sealed out of `REGIONS`, so `advanceChapter` — which keys on
 * gates — was unreachable code and every run was labelled 「1장」 from start to finish. Acts now hang
 * on colony milestones instead of doors: `kitchen` -> `hold` when the room is first held, `hold` ->
 * `final` when the household commits to exterminating.
 */
export type ChapterId = 'kitchen' | 'hold' | 'hallway' | 'living' | 'bedroom' | 'final';

/* ------------------------------------------------------------------- scout */

export type ScoutState = 'idle' | 'moving' | 'climbing' | 'working' | 'hiding' | 'dead';

export interface Scout {
  /** Current walkable plane. */
  surface: string;
  x: number;
  z: number;
  y: number;
  /** Facing, radians, world space. */
  heading: number;
  /** Units per second, for gait and camera lead. */
  speed: number;
  state: ScoutState;
  /** Set while traversing a climb. */
  climb: { link: string; progress: number; from: string; to: string } | null;
  /** Seconds of held work accumulated on the current gate operation. */
  working: { gate: string; progress: number } | null;
  /** Rises while the scout stands in exposure, falls in cover. Reaching 1 is a sighting. */
  seen: number;
  /**
   * Seconds of grace after a sighting.
   *
   * Without this, `seen` resets to 0 and immediately begins refilling, so a scout standing in a lit
   * hallway generates a fresh sighting every 2.4 s indefinitely. Measured on seed 20260805: 377
   * sightings in one run, which pinned every region's evidence floor at its cap and turned the
   * household response into a permanent extermination. A real household that glimpses something
   * looks harder for a moment and then goes back to what it was doing.
   */
  seenCooldown: number;
  /**
   * How close the scout is to being crushed, 0..1. Reaching 1 kills it.
   *
   * Separate from `seen` because they are different failures. `seen` is about information — the
   * household learns a roach exists here. `caught` is about a body being in the wrong place while
   * something heavy is already coming down, and it only ever fills inside the kill core of an
   * ACTIVE threat. Being noticed is survivable; standing under the foot is not.
   *
   * A meter rather than a per-second roll, because the brief requires failure to be attributable. A
   * 0.5/s kill chance produces a death the player cannot narrate; a meter that visibly fills over
   * roughly a second and a half produces "I stayed too long", which is a lesson.
   */
  caught: number;
  /**
   * Simulation time of the last tick the scout was inside a kill core.
   *
   * The drain needs to know "am I still under it", and the answer cannot come from tick ordering.
   * The first version drained unconditionally in `updateScout`, one tick's worth every tick, while
   * `tickThreat` filled one tick's worth every tick — 0.93/s in against 0.85/s out. The meter
   * reached 0.125 over a swat's entire active window instead of 1.0, so nothing could ever be
   * crushed and the mechanic was as absent as the one it replaced. It took a printed trace to see
   * it; the code read as correct.
   */
  crushedAt: number;
  /**
   * Seconds left of the blackout after a stomp, before the colony's next scout takes over.
   *
   * Non-zero means the player has no body: input is ignored and the camera holds on the spot where
   * the last one died. The pause is the point — it is the only moment in the run where the player
   * is made to watch instead of act.
   */
  downFor: number;
  /** Interpolation source for the renderer — previous tick's transform. */
  prevX: number;
  prevZ: number;
  prevY: number;
}

/* ----------------------------------------------------------------- workers */

export type WorkerState =
  'idle' | 'outbound' | 'collecting' | 'inbound' | 'delivering' | 'climbing' | 'fleeing' | 'dead';

export interface Worker {
  readonly id: number;
  alive: boolean;
  state: WorkerState;
  surface: string;
  x: number;
  z: number;
  y: number;
  prevX: number;
  prevZ: number;
  prevY: number;
  heading: number;
  speed: number;
  /** Which route this worker serves. Empty string when idle. */
  route: string;
  /**
   * Simulation time before which this worker will not attempt route assignment again.
   *
   * Assignment ends in an A* reachability check, and a worker whose only appealing route is
   * unreachable used to have its assignment withdrawn and land back in `idle` — which meant it ran
   * the same failing search again on the very next frame, forever. Measured after workers began
   * being released on every delivery: roughly forty idle bodies each burning one full path search
   * per frame, about 2,400 searches a second, and 600 simulated seconds cost 285 s of CPU against
   * 13 s for the same span beforehand. Backing a failed search off is what keeps per-frame work
   * bounded, which the performance gates require outright.
   */
  replanAt: number;
  /** Index into the route's point list. */
  leg: number;
  /** Lateral offset from the route centreline, so a busy route reads as a column not a queue. */
  lane: number;
  /** 0..1 of one cargo unit. */
  cargo: number;
  cargoKind: 'food' | 'moisture' | null;
  /** Seconds since this worker last made useful progress. Drives the recovery ladder. */
  stuckFor: number;
  /** Seconds remaining in the current recovery behaviour. */
  recoverFor: number;
  climb: { link: string; progress: number; from: string; to: string } | null;
  /** Which foothold this worker was hatched at — it returns cargo here, not to the home nest. */
  home: string;
  age: number;
}

/* ------------------------------------------------------------------ routes */

export type RouteHealth =
  'ok' | 'incomplete' | 'disconnected' | 'blocked' | 'congested' | 'compromised' | 'washed';

/**
 * A pheromone route: a supply line the player draws between a foothold and a source.
 *
 * The polyline is the *player's* geometry, repaired to walkable space rather than replaced by it.
 * That distinction is the mechanic: a route that hugs the baseboard and one that cuts across lit
 * floor are both valid, both walkable, and produce measurably different amounts of evidence.
 */
export interface Route {
  readonly id: string;
  /** Foothold id this route delivers into. */
  nest: string;
  /** Resource site id this route collects from. */
  target: string;
  points: NavPoint[];
  /** Links the route traverses, in order. */
  links: string[];
  /** 0..1. Decays with time, is reinforced by traffic. At 0 the route is forgotten. */
  strength: number;
  /** Mean exposure of the drawn path — the route's inherent risk. */
  exposure: number;
  length: number;
  health: RouteHealth;
  /** Deliveries completed on this route. Drives evidence and the "well-trodden" visual. */
  deliveries: number;
  /** Workers currently assigned. */
  assigned: number;
  /** Set when a cleaning event wipes it; counts down, and the route is unusable until it clears. */
  washedFor: number;
  regions: RegionId[];
}

/* -------------------------------------------------------------- footholds */

export interface Foothold {
  readonly id: string;
  claimed: boolean;
  /** 0..1 while being established. */
  progress: number;
  /** Brood currently held here. */
  brood: number;
  /** Damage taken from household responses. At 1 the foothold is destroyed. */
  damage: number;
  /** Seconds this foothold has been cut off from the home nest. */
  isolatedFor: number;
}

export interface ResourceState {
  readonly id: string;
  remaining: number;
  /** Discovered by the scout. Undiscovered sites are not drawable as route targets. */
  found: boolean;
  /** Accumulated disturbance visible to the household — a torn bag stays torn. */
  disturbed: number;
}

/* -------------------------------------------------------------- household */

/** 0 calm · 1 noticing · 2 suspicious · 3 alarmed · 4 extermination. */
export type AlertLevel = 0 | 1 | 2 | 3 | 4;

export interface RegionState {
  readonly id: RegionId;
  unlocked: boolean;
  /** Evidence the household can see here. Never fully clears — see `evidenceFloor`. */
  evidence: number;
  /** The lowest `evidence` can ever fall to. Rises with every sighting. */
  evidenceFloor: number;
  alert: AlertLevel;
  /** Seconds since the last household response landed here. */
  quietFor: number;
  /** Cumulative worker-seconds of traffic, decayed. Drives where responses aim. */
  traffic: number;
}

export type RoutinePhase = 'idle' | 'incoming' | 'active' | 'aftermath';

export interface RoutineState {
  readonly id: string;
  phase: RoutinePhase;
  /** Seconds remaining in the current phase. */
  timer: number;
  /** Times this routine has run. Some escalate. */
  runs: number;
}

export type ThreatKind =
  'footsteps' | 'wipe' | 'trap' | 'vacuum' | 'spray' | 'move' | 'light' | 'sleeper' | 'swat';

export interface Threat {
  readonly id: number;
  kind: ThreatKind;
  region: RegionId;
  surface: string;
  x: number;
  z: number;
  /** Where it is heading. */
  toX: number;
  toZ: number;
  /** 'telegraph' shows the cue and cannot hurt; 'active' can. */
  phase: 'telegraph' | 'active' | 'leaving';
  timer: number;
  radius: number;
  /** Route ids this threat has already damaged, so one pass does not wipe a route six times. */
  hit: string[];
}

/* ------------------------------------------------------------ progression */

export type AdaptationFamily = 'brood' | 'scavenging' | 'shadow';

export interface Adaptation {
  readonly family: AdaptationFamily;
  readonly tier: 1 | 2;
}

/**
 * What the player should do now, and what is actually stopping them.
 *
 * `blockerKey` is the single highest-value string in the game and it is computed from real state,
 * never authored per chapter: it names the *binding constraint*, so "you need two more workers" and
 * "the corridor is lit right now" are different messages produced by the same code path.
 */
export interface Objective {
  chapter: ChapterId;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string | number>;
  blockerKey: string | null;
  blockerParams: Record<string, string | number>;
  /** Where the objective is, so the HUD can point at it. */
  at: { surface: string; x: number; z: number } | null;
  /** 0..1 when the objective has measurable progress. */
  progress: number;
}

/* ---------------------------------------------------------------- the run */

export interface Colony {
  food: number;
  moisture: number;
  /** Living workers. */
  population: number;
  /** Sum of claimed foothold capacities. */
  capacity: number;
  /** 0..1 accumulating toward the next worker. */
  broodProgress: number;
  /** Seconds the colony has been continuously out of food or water. Drives starvation losses. */
  starvedFor: number;
  adaptations: Adaptation[];
  /** Adaptation points earned by chapter completion, spent on a family. */
  adaptationPoints: number;
  /**
   * Player-held pause on breeding. While true, surplus banks instead of becoming workers.
   *
   * Breeding used to be automatic and unconditional, which meant growth and expansion competed for
   * one surplus with no lever over either: every unit of food above `BROOD_FOOD_PER_WORKER` became
   * a worker the instant it existed, so a colony could not save for a gate unless income exceeded
   * upkeep plus brood. Measured consequence — with a household aggressive enough to reach alert 3,
   * the objective reported `blocker.food` continuously from t=120 to the end of a 45-minute run and
   * no gate past the third ever opened. The colony was not poor; it was spending faster than it
   * could decide not to.
   *
   * This is the decision that makes "prepare an expansion" a real act rather than a wait. Holding
   * costs growth and, because the colony stays small, it also leaves less evidence — which is the
   * cautious build the acceptance list asks to be distinguishable from the aggressive one.
   */
  broodHold: boolean;

  /**
   * Simulation time before which an emergency recall cannot be ordered again.
   *
   * A recall with no cooldown is not a decision — it is a button you hold down whenever anything
   * moves, and the threat system stops mattering. The wait is what makes spending it a commitment:
   * call it early on a false alarm and the next real spray lands on a colony that cannot run.
   */
  recallReadyAt: number;
}

/** The pheromone line the scout is currently walking, or `null`. See `colony/trail.ts`. */
export interface TrailState {
  readonly nest: string;
  readonly points: { surface: string; x: number; z: number }[];
}

export interface RunEvent {
  readonly key: string;
  readonly params: Record<string, string | number>;
  /** Seconds of run time when it happened. */
  readonly at: number;
  readonly severity: 'info' | 'warn' | 'danger' | 'good';
}

/** A one-frame signal for audio and VFX. The sim never reads these back. */
export interface Cue {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly amount?: number;
}

export interface RunStats {
  /** Whole-home extermination sweeps the colony has lived through. Victory requires surviving some. */
  exterminationSweeps: number;
  deliveries: number;
  sightings: number;
  workersLost: number;
  /** Scouts crushed. The player's own deaths, counted separately from the colony's losses. */
  scoutsLost: number;
  routesWashed: number;
  regionsOpened: number;
  peakPopulation: number;
}

export interface Run {
  readonly house: House;
  nav: Nav;
  readonly rng: Rng;
  readonly seed: number;

  status: RunStatus;
  /** Seconds of simulated time. */
  time: number;
  chapter: ChapterId;

  scout: Scout;
  colony: Colony;

  workers: Worker[];
  routes: Route[];
  /** The line being walked right now, or `null`. Owned by `colony/trail.ts`. */
  trail: TrailState | null;
  footholds: Map<string, Foothold>;
  resources: Map<string, ResourceState>;
  regions: Map<RegionId, RegionState>;
  routines: Map<string, RoutineState>;
  threats: Threat[];
  openGates: Set<string>;
  /** Seconds of work already banked into each gate, so an interrupted operation is not lost. */
  gateProgress: Map<string, number>;

  objective: Objective;
  /** Newest first, capped. The HUD reads this; nothing in the sim reads it back. */
  log: RunEvent[];

  stats: RunStats;

  /** Set by systems, consumed and cleared by the view each frame — never read by the sim. */
  cues: Cue[];

  /** Monotonic id sources for pooled objects. */
  nextWorkerId: number;
  nextThreatId: number;
  nextRouteId: number;

  /** Seconds since the player last did anything that changed state. Drives context guidance. */
  idleFor: number;
  /** Seconds the colony has had no living workers. Drives the extinction loss. */
  deadFor: number;

  /** Seconds until the household may mount another whole-home sweep. */
  sweepCooldown: number;
}

export type { NavPoint };

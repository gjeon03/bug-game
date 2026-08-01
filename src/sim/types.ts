export type ResourceKind = 'food' | 'water';
export type UpgradeKind = 'brood' | 'cache' | 'escape';
export type RunStatus = 'playing' | 'interlude' | 'won' | 'lost';
export type NightIndex = 1 | 2 | 3;

export type DeathCause = 'foot' | 'trap' | 'spray' | 'starve' | 'thirst' | 'bait';
export type LoseCause = 'collapse' | 'nestDestroyed' | 'exterminated' | 'notEstablished';

export type SuspicionCause =
  'seen' | 'corpse' | 'traffic' | 'depleted' | 'trap' | 'expansion' | 'noise' | 'droppings';

export type WorkerState =
  | 'idle'
  | 'outbound'
  /** Arrived at a source that is already being worked by its full complement: waiting on the ring. */
  | 'queue'
  | 'harvest'
  | 'inbound'
  | 'panic'
  | 'trapped'
  | 'dying';

export interface Solid {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Material family drives how the renderer draws it. */
  mat: 'cabinet' | 'steel' | 'wall' | 'plastic' | 'metal';
  /**
   * What this thing *is*. The renderer draws a fixture from its role — cabinet doors and a toe-kick,
   * a fridge with a door seam and a handle, a stove with burners — instead of drawing every solid as
   * the same tinted rectangle. The old build authored a `label` here and never rendered it, which is
   * why a dishwasher and a pantry were separated by five values of grey.
   */
  role?: FixtureRole;
  /** Which side of the solid faces the room, for door faces and toe-kicks. */
  facing?: 'up' | 'down' | 'left' | 'right';
  label?: string;
}

export type FixtureRole =
  | 'counter'
  | 'sink'
  | 'dishwasher'
  | 'stove'
  | 'fridge'
  | 'pantry'
  | 'island'
  | 'bin'
  | 'tableLeg'
  | 'chairLeg'
  | 'radiator'
  | 'pipe'
  | 'box'
  | 'wall';

/**
 * Scenery.
 *
 * Non-colliding domestic objects in the 30–300 unit band — the band the measured audit found
 * completely empty, which is why nothing in the room communicated insect scale. Every prop earns its
 * place by doing at least one job: giving the eye a landmark, telling the player how big they are,
 * marking a resource, motivating a light, or showing that somebody lives here.
 */
export type PropKind =
  | 'pipeElbow'
  | 'drainGrate'
  | 'sponge'
  | 'bottle'
  | 'dishTowel'
  | 'plate'
  | 'mug'
  | 'burner'
  | 'panHandle'
  | 'ovenVent'
  | 'fridgeGasket'
  | 'condenserGrille'
  | 'packet'
  | 'jar'
  | 'binBag'
  | 'binWheel'
  | 'petBowl'
  | 'petMat'
  | 'kibble'
  | 'slipper'
  | 'sock'
  | 'broomHead'
  | 'outlet'
  | 'vent'
  | 'cableCoil'
  | 'crumbCluster'
  | 'greaseSmear'
  | 'waterRing'
  | 'scuffMark'
  | 'baseboardGap';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** Long axis in world units. */
  w: number;
  h: number;
  rot: number;
  /**
   * Height above the floor, in world units. Drives the contact shadow and whether the prop is drawn
   * as a foreground occluder that roaches pass *under*.
   */
  lift?: number;
  /** Per-instance variation seed so identical kinds do not stamp identically. */
  v?: number;
}

export interface LightSource {
  id: string;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  /** 0 = cold, 1 = warm — drives both the render tint and nothing else. */
  warmth: number;
}

export interface ResourceNode {
  id: string;
  kind: ResourceKind;
  x: number;
  y: number;
  /** Remaining units. */
  amount: number;
  initial: number;
  /** Operation from which the node is reachable/known. */
  unlockOp: 1 | 2 | 3 | 4;
  label: string;
  /** True once fully drained — drained nodes are visible evidence for the humans. */
  depleted: boolean;
  depletedReported: boolean;
  /** Number of workers currently harvesting, for the renderer and for spacing. */
  busy: number;
  /** Visual: how disturbed the node looks, 0..1. */
  disturbance: number;
}

export interface NestNode {
  id: string;
  x: number;
  y: number;
  /** Home nest is the colony hub and the thing that must not be destroyed. */
  home: boolean;
  claimed: boolean;
  /**
   * The function fitted into this crack, chosen by the player *after* claiming it. Claiming buys the
   * ground; fitting it out buys the capability. Two spends per foothold is most of what turned a
   * capped larder back into a decision.
   */
  fn: FootholdFunction | null;
  /** Operation from which the crack can be claimed. */
  unlockOp: 1 | 2 | 3 | 4;
  label: string;
  costFood: number;
  costWater: number;
  /** Cost of fitting a function once claimed. */
  fitFood: number;
  fitWater: number;
  /** 0..1 integrity. Spray damages it, moisture repairs it, and at 0 the home nest is lost. */
  integrity: number;
  /** Cosmetic growth level 0..3, driven by colony size. */
  growth: number;
  /** Seconds since claimed, for the reveal animation. */
  age: number;
}

export interface TrailNode {
  x: number;
  y: number;
  /** Unit tangent along the direction the scout was walking. */
  dx: number;
  dy: number;
  /** Remaining life in seconds. */
  life: number;
  /** Index along the route, ascending in lay order. */
  i: number;
  /** Cached exposure at this point, sampled once at lay time. */
  exposure: number;
}

export interface Route {
  id: number;
  nodes: TrailNode[];
  /** Which end sits on a nest: -1 none, 0 first node, 1 last node. */
  nestEnd: -1 | 0 | 1;
  /** Which end sits on a resource. */
  resEnd: -1 | 0 | 1;
  /** Id of the resource node this route serves, when linked. */
  resourceId: string | null;
  /** Id of the nest node this route serves, when linked. */
  nestId: string | null;
  linked: boolean;
  /** True when both ends are anchored but the resource end has been drained dry. */
  dry: boolean;
  /** Rising edge tracker so the link chime fires once. */
  wasLinked: boolean;
  wasDry: boolean;
  /** Mean exposure of the route's nodes — this is what makes an open-floor route expensive. */
  exposure: number;
  /** Workers currently assigned. */
  traffic: number;
  age: number;
}

export interface Worker {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  state: WorkerState;
  routeId: number;
  /** Current index along the assigned route. */
  nodeIndex: number;
  /** +1 to walk toward the resource end, -1 toward the nest end. */
  dirSign: 1 | -1;
  carrying: ResourceKind | null;
  carryAmount: number;
  timer: number;
  /** Seconds without finding a trail node, used to give up gracefully. */
  lostTime: number;
  panicTime: number;
  gait: number;
  /** Per-instance visual variation, stable for the worker's life. */
  variant: number;
  scale: number;
  exposure: number;
  hazardId: number;
  targetResource: string | null;
  targetNest: string | null;
  nymphTime: number;
  /**
   * Stable lateral position within the trail corridor, in [-1, 1]. Combined with `dirSign` this is
   * what turns a single-file column — the "centipede" — into two counter-flowing lanes of
   * individually spaced roaches.
   */
  lane: number;
  /** Seconds since this worker last made progress that is useful *for its current state*. */
  stuckTime: number;
  /** How many recovery steps the watchdog has already applied. Reset on real progress. */
  recoverStage: number;
  /** Position the watchdog last saw, so "useful progress" is measured, not assumed. */
  markX: number;
  markY: number;
  markIndex: number;
}

export interface Corpse {
  x: number;
  y: number;
  angle: number;
  age: number;
  /** Cover at the corpse position, sampled once — corpses in the open are the real evidence. */
  cover: number;
  cause: DeathCause;
  scale: number;
  reported: boolean;
}

export type HazardKind = 'trap' | 'bait';

export interface Hazard {
  id: number;
  kind: HazardKind;
  x: number;
  y: number;
  radius: number;
  /** Seconds until it becomes lethal — the telegraph window. */
  armTime: number;
  armed: boolean;
  /** Remaining uses before a trap is "full" and stops catching. */
  capacity: number;
  age: number;
  sprung: number;
  night: NightIndex;
}

export interface Footfall {
  x: number;
  y: number;
  /** Counts down; impact happens at 0. */
  warn: number;
  warnTotal: number;
  radius: number;
  done: boolean;
  /** Post-impact linger, for the sole resting on the floor. */
  linger: number;
}

export interface Patrol {
  id: number;
  path: { x: number; y: number }[];
  /** Index of the segment currently being walked. */
  seg: number;
  t: number;
  speed: number;
  x: number;
  y: number;
  /** Facing, used by the light cone. */
  angle: number;
  /** Seconds until the next footfall is scheduled. */
  stepTimer: number;
  /** How strongly this patrol lights the room, 0..1. */
  lightPower: number;
  coneRange: number;
  /** True while the patrol is actively looking (raises exposure hard). */
  looking: boolean;
  life: number;
  night: NightIndex;
  /** Set once the patrol has finished its path and should be culled. */
  done: boolean;
}

export interface Spray {
  id: number;
  /**
   * True for a cloud sent by the extermination tier, which is aimed at the cracks and flushes
   * roaches out of them. The scripted end-of-night sweep is not targeted: a colony that kept its
   * evidence down can ride that one out inside the walls, which is the point of claiming cracks.
   */
  targeted: boolean;
  path: { x: number; y: number }[];
  seg: number;
  t: number;
  speed: number;
  x: number;
  y: number;
  radius: number;
  life: number;
  /** Ramp-in so the cloud does not appear instantly lethal. */
  age: number;
  done: boolean;
}

export interface Colony {
  food: number;
  water: number;
  foodCap: number;
  waterCap: number;
  population: number;
  capacity: number;
  brood: number;
  /** Cumulative totals for the run summary. */
  totalFood: number;
  totalWater: number;
  hatched: number;
  lost: number;
  /** Foothold functions currently installed, derived once per step in `recomputeLimits`. */
  nurseries: number;
  caches: number;
  boltholes: number;
  /** Seconds spent with an empty larder — used for the loss explanation. */
  starving: number;
  thirsting: number;
  /** Seconds the colony has had zero living workers. */
  emptyTime: number;
}

export interface SuspicionState {
  value: number;
  peak: number;
  floor: number;
  tier: number;
  /** Total contribution per cause, for the "what raised suspicion" ledger. */
  causes: Record<SuspicionCause, number>;
  /** Per-cause accumulator, so a slow continuous cause can eventually surface in the HUD. */
  accum: Record<SuspicionCause, number>;
  /** Most recent cause, for the HUD ticker. */
  lastCause: SuspicionCause | null;
  lastCauseTime: number;
  /** Rising-edge guard so a tier only escalates once. */
  reachedTier: number;
}

export interface RunStats {
  runSeconds: number;
  firstMoveAt: number;
  firstTrailAt: number;
  firstDeliveryAt: number;
  firstClaimAt: number;
  deliveries: number;
  workersLost: number;
  scoutDeaths: number;
  trapsSprung: number;
  peakPopulation: number;
  idleSeconds: number;
  distanceTravelled: number;
  trailNodesLaid: number;
  /** Household routines the colony actually took something out of. */
  routinesExploited: number;
  /** Operations finished. The run's real progress readout. */
  operationsCompleted: number;
  /** Foothold functions installed. */
  functionsBuilt: number;
}

/** What a claimed crack can be fitted out as. One per foothold, chosen by the player. */
export type FootholdFunction = 'nursery' | 'cache' | 'bolthole';

export type RoutineEventKind = 'snack' | 'dishes' | 'trash';

export type GameEvent =
  | { t: 'pickup'; x: number; y: number; kind: ResourceKind }
  | { t: 'deliver'; x: number; y: number; kind: ResourceKind; amount: number }
  | { t: 'trailLaid'; x: number; y: number }
  | { t: 'trailAcquired'; x: number; y: number }
  | { t: 'routeLinked'; x: number; y: number }
  | { t: 'routeLost'; x: number; y: number }
  | { t: 'routeDry'; x: number; y: number; resource: string }
  | { t: 'claim'; x: number; y: number; node: string }
  | { t: 'upgrade'; x: number; y: number; kind: UpgradeKind }
  | { t: 'hatch'; x: number; y: number }
  | { t: 'suspicion'; delta: number; cause: SuspicionCause; x: number; y: number }
  | { t: 'tier'; tier: number }
  | { t: 'footWarn'; x: number; y: number }
  | { t: 'footHit'; x: number; y: number }
  | { t: 'lightOn'; x: number; y: number }
  | { t: 'lightOff' }
  | { t: 'trapArmed'; x: number; y: number; kind: HazardKind }
  | { t: 'trapSprung'; x: number; y: number }
  | { t: 'sprayStart'; x: number; y: number }
  | { t: 'scoutHurt'; x: number; y: number }
  | { t: 'scoutDied'; x: number; y: number; cause: DeathCause }
  | { t: 'scoutRespawn'; x: number; y: number }
  | { t: 'workerDied'; x: number; y: number; cause: DeathCause }
  | { t: 'sprint'; x: number; y: number }
  | { t: 'operation'; index: 1 | 2 | 3 | 4 }
  | { t: 'adaptOffer' }
  | { t: 'adapt'; id: string; family: 'brood' | 'forage' | 'shadow' }
  | { t: 'fitOut'; x: number; y: number; fn: FootholdFunction }
  | { t: 'repair'; x: number; y: number }
  | { t: 'routineWarn'; kind: RoutineEventKind; x: number; y: number }
  | { t: 'routineStart'; kind: RoutineEventKind; x: number; y: number }
  | { t: 'routineTaken'; kind: RoutineEventKind; x: number; y: number }
  | { t: 'routineEnd'; kind: RoutineEventKind; x: number; y: number; took: number }
  | { t: 'sweepWarn'; x: number; y: number }
  | { t: 'sweepStart'; x: number; y: number }
  | { t: 'sweepEnd'; x: number; y: number }
  | { t: 'zoneHeld'; zone: string }
  | { t: 'zoneLost'; zone: string }
  | { t: 'finalResponse' }
  | { t: 'win' }
  | { t: 'lose'; cause: LoseCause }
  | { t: 'objective'; text: string };

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  lay: boolean;
  erase: boolean;
  sprint: boolean;
  interact: boolean;
  /** Rising-edge latch consumed by the sim, set by the input layer. */
  interactPressed: boolean;
  erasePressed: boolean;
}

export interface Intent {
  paused: boolean;
  restart: boolean;
  skipInterlude: boolean;
}

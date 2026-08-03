import { t } from '../i18n/index.ts';
import type { LightSource, NightIndex, Prop, Solid } from './types.ts';
import { WORLD_H, WORLD_W } from './constants.ts';

/**
 * The one authored kitchen.
 *
 * Everything here is data, not behaviour, so the map can be reasoned about (and unit-tested) without
 * running the game. Coordinates are world units; the scout is 26 units long, a floor tile is 320.
 */

export const SOLIDS: readonly Solid[] = [
  // Room shell. The bottom wall is broken by a real doorway — the hallway light in this kitchen used
  // to be motivated by an opening that did not exist.
  { id: 'wallTop', x: 0, y: 0, w: WORLD_W, h: 56, mat: 'wall', role: 'wall' },
  { id: 'wallLeft', x: 0, y: 0, w: 56, h: WORLD_H, mat: 'wall', role: 'wall' },
  { id: 'wallRight', x: WORLD_W - 56, y: 0, w: 56, h: WORLD_H, mat: 'wall', role: 'wall' },
  { id: 'wallBottomL', x: 0, y: WORLD_H - 56, w: 2880, h: 56, mat: 'wall', role: 'wall' },
  {
    id: 'wallBottomR',
    x: 3320,
    y: WORLD_H - 56,
    w: WORLD_W - 3320,
    h: 56,
    mat: 'wall',
    role: 'wall',
  },
  // Door jambs either side of the opening, so the gap reads as a doorway rather than a hole.
  { id: 'jambL', x: 2836, y: WORLD_H - 96, w: 44, h: 96, mat: 'wall', role: 'wall' },
  { id: 'jambR', x: 3320, y: WORLD_H - 96, w: 44, h: 96, mat: 'wall', role: 'wall' },

  // Top run: counter — stove — counter — fridge, with a dark 64-unit gap before the fridge.
  {
    id: 'counterLeft',
    tone: 1.0,
    x: 56,
    y: 56,
    w: 1080,
    h: 470,
    mat: 'cabinet',
    role: 'counter',
    facing: 'down',
    label: 'counter',
  },
  {
    id: 'stove',
    tone: 1.16,
    x: 1136,
    y: 56,
    w: 700,
    h: 500,
    mat: 'steel',
    role: 'stove',
    facing: 'down',
    label: 'stove',
  },
  {
    id: 'counterRight',
    tone: 1.0,
    x: 1836,
    y: 56,
    w: 700,
    h: 470,
    mat: 'cabinet',
    role: 'counter',
    facing: 'down',
    label: 'counter',
  },
  {
    id: 'fridge',
    tone: 1.0,
    x: 2600,
    y: 56,
    w: 944,
    h: 700,
    mat: 'steel',
    role: 'fridge',
    facing: 'down',
    label: 'fridge',
  },

  // Left run: sink — dishwasher — (corridor) — pantry.
  {
    id: 'sinkCabinet',
    tone: 0.82,
    x: 56,
    y: 900,
    w: 500,
    h: 640,
    mat: 'cabinet',
    role: 'sink',
    facing: 'right',
    label: 'sink',
  },
  {
    id: 'dishwasher',
    tone: 0.84,
    x: 56,
    y: 1540,
    w: 500,
    h: 420,
    mat: 'steel',
    role: 'dishwasher',
    facing: 'right',
    label: 'dishwasher',
  },
  {
    id: 'pantry',
    tone: 1.26,
    x: 56,
    y: 2120,
    w: 700,
    h: 424,
    mat: 'cabinet',
    role: 'pantry',
    facing: 'right',
    label: 'pantry',
  },

  // Centre island — the map's main obstacle and its most exposed perimeter.
  {
    id: 'island',
    tone: 1.5,
    x: 1240,
    y: 1180,
    w: 1240,
    h: 560,
    mat: 'cabinet',
    role: 'island',
    facing: 'down',
    label: 'island',
  },

  // Right side: radiator, bin, table legs.
  {
    id: 'radiator',
    x: 3400,
    y: 940,
    w: 144,
    h: 560,
    mat: 'metal',
    role: 'radiator',
    label: 'radiator',
  },
  {
    id: 'trashBin',
    tone: 1.2,
    x: 2980,
    y: 2020,
    w: 400,
    h: 400,
    mat: 'plastic',
    role: 'bin',
    facing: 'left',
    label: 'bin',
  },
  { id: 'tableLegA', x: 2700, y: 1300, w: 96, h: 96, mat: 'cabinet', role: 'tableLeg' },
  { id: 'tableLegB', x: 3160, y: 1300, w: 96, h: 96, mat: 'cabinet', role: 'tableLeg' },
  { id: 'tableLegC', x: 2700, y: 1760, w: 96, h: 96, mat: 'cabinet', role: 'tableLeg' },
  { id: 'tableLegD', x: 3160, y: 1760, w: 96, h: 96, mat: 'cabinet', role: 'tableLeg' },

  // Floor clutter: cover and landmarks in the exposed middle of the room, which is otherwise a
  // featureless plain at insect scale.
  { id: 'chairLegA', x: 1520, y: 2136, w: 84, h: 84, mat: 'cabinet', role: 'chairLeg' },
  { id: 'chairLegB', x: 1808, y: 2136, w: 84, h: 84, mat: 'cabinet', role: 'chairLeg' },
  { id: 'chairLegC', x: 1520, y: 2404, w: 84, h: 84, mat: 'cabinet', role: 'chairLeg' },
  { id: 'chairLegD', x: 1808, y: 2404, w: 84, h: 84, mat: 'cabinet', role: 'chairLeg' },
  { id: 'boxPantry', x: 880, y: 1948, w: 268, h: 132, mat: 'plastic', role: 'box', label: 'box' },
  { id: 'binLiner', x: 2760, y: 2320, w: 150, h: 108, mat: 'plastic', role: 'box' },
  { id: 'pipeRun', x: 3400, y: 300, w: 144, h: 430, mat: 'metal', role: 'pipe', label: 'pipe' },
  { id: 'stoolLeg', x: 2560, y: 620, w: 74, h: 74, mat: 'metal', role: 'chairLeg' },
];

/**
 * Scenery.
 *
 * Placed by hand against the fixtures above so every object sits where a real one would: the U-bend
 * under the sink, the burners on the stove, the gasket down the fridge seam, the kibble beside the
 * bowl. Nothing here collides — this layer exists to make the room legible and to give an insect
 * something to be small next to.
 */
export const PROPS: readonly Prop[] = [
  // ── Sink run ──────────────────────────────────────────────────────────────
  { kind: 'pipeElbow', x: 600, y: 1150, w: 132, h: 210, rot: 0, lift: 34 },
  { kind: 'drainGrate', x: 664, y: 1312, w: 96, h: 96, rot: 0 },
  { kind: 'waterRing', x: 690, y: 1392, w: 118, h: 82, rot: 0.2 },
  { kind: 'waterRing', x: 604, y: 1246, w: 84, h: 62, rot: -0.4 },
  { kind: 'sponge', x: 736, y: 1188, w: 84, h: 58, rot: 0.28 },
  { kind: 'bottle', x: 596, y: 1010, w: 60, h: 132, rot: 0, lift: 22 },
  { kind: 'dishTowel', x: 690, y: 940, w: 176, h: 108, rot: -0.12 },
  { kind: 'outlet', x: 250, y: 862, w: 88, h: 52, rot: 0 },

  // ── Dishwasher ────────────────────────────────────────────────────────────
  { kind: 'plate', x: 690, y: 1662, w: 128, h: 128, rot: 0 },
  { kind: 'plate', x: 764, y: 1730, w: 112, h: 112, rot: 0.5 },
  { kind: 'mug', x: 620, y: 1760, w: 74, h: 74, rot: 0.7 },
  { kind: 'crumbCluster', x: 712, y: 1704, w: 150, h: 118, rot: 0 },
  { kind: 'scuffMark', x: 640, y: 1878, w: 230, h: 96, rot: 0.06 },
  { kind: 'baseboardGap', x: 604, y: 1568, w: 92, h: 46, rot: 0 },

  // ── Pantry ────────────────────────────────────────────────────────────────
  { kind: 'packet', x: 872, y: 2258, w: 152, h: 106, rot: -0.2 },
  { kind: 'packet', x: 968, y: 2370, w: 128, h: 92, rot: 0.42 },
  { kind: 'jar', x: 800, y: 2338, w: 84, h: 84, rot: 0 },
  { kind: 'crumbCluster', x: 912, y: 2312, w: 168, h: 128, rot: 0.3 },
  { kind: 'baseboardGap', x: 836, y: 2494, w: 92, h: 46, rot: 0 },
  { kind: 'vent', x: 300, y: 2330, w: 200, h: 108, rot: 1.57 },

  // ── Stove ─────────────────────────────────────────────────────────────────
  { kind: 'burner', x: 1300, y: 620, w: 168, h: 168, rot: 0 },
  { kind: 'burner', x: 1560, y: 620, w: 168, h: 168, rot: 0 },
  { kind: 'burner', x: 1700, y: 618, w: 132, h: 132, rot: 0 },
  { kind: 'ovenVent', x: 1486, y: 700, w: 300, h: 62, rot: 0 },
  { kind: 'panHandle', x: 1620, y: 560, w: 210, h: 44, rot: -0.25, lift: 30 },
  { kind: 'greaseSmear', x: 1608, y: 716, w: 260, h: 200, rot: 0 },
  { kind: 'crumbCluster', x: 1470, y: 760, w: 130, h: 100, rot: 0.9 },
  { kind: 'baseboardGap', x: 1980, y: 640, w: 92, h: 46, rot: 0 },

  // ── Fridge ────────────────────────────────────────────────────────────────
  { kind: 'fridgeGasket', x: 2604, y: 400, w: 40, h: 660, rot: 0 },
  { kind: 'condenserGrille', x: 3100, y: 790, w: 340, h: 96, rot: 0 },
  { kind: 'waterRing', x: 2556, y: 872, w: 132, h: 96, rot: 0 },
  { kind: 'cableCoil', x: 2960, y: 830, w: 240, h: 110, rot: 0.1 },
  { kind: 'outlet', x: 2860, y: 806, w: 88, h: 52, rot: 0 },
  { kind: 'scuffMark', x: 2700, y: 900, w: 280, h: 120, rot: -0.1 },

  // ── Island ────────────────────────────────────────────────────────────────
  { kind: 'crumbCluster', x: 1872, y: 1948, w: 180, h: 130, rot: 0.15 },
  { kind: 'greaseSmear', x: 1720, y: 1880, w: 210, h: 150, rot: 0.6 },
  { kind: 'baseboardGap', x: 1362, y: 1796, w: 92, h: 46, rot: 0 },
  { kind: 'scuffMark', x: 2100, y: 1830, w: 300, h: 110, rot: 0.03 },

  // ── Bin corner and the doorway ────────────────────────────────────────────
  { kind: 'binBag', x: 2900, y: 2400, w: 260, h: 190, rot: 0.1 },
  { kind: 'binWheel', x: 3010, y: 2432, w: 76, h: 76, rot: 0 },
  { kind: 'binWheel', x: 3350, y: 2432, w: 76, h: 76, rot: 0 },
  { kind: 'crumbCluster', x: 2884, y: 2472, w: 200, h: 150, rot: 0.44 },
  { kind: 'petBowl', x: 2700, y: 2216, w: 190, h: 190, rot: 0 },
  { kind: 'petMat', x: 2700, y: 2216, w: 420, h: 300, rot: 0.05 },
  { kind: 'kibble', x: 2820, y: 2280, w: 150, h: 110, rot: 0 },
  { kind: 'kibble', x: 2610, y: 2140, w: 120, h: 90, rot: 0.8 },
  { kind: 'slipper', x: 3160, y: 2540, w: 190, h: 92, rot: -0.35, lift: 16 },
  { kind: 'sock', x: 3260, y: 2470, w: 140, h: 80, rot: 0.6 },
  { kind: 'broomHead', x: 3430, y: 2260, w: 180, h: 120, rot: 0.15, lift: 20 },
  { kind: 'baseboardGap', x: 3428, y: 2088, w: 92, h: 46, rot: 0 },

  // ── The open middle: landmarks so the plain is navigable ──────────────────
  { kind: 'scuffMark', x: 1500, y: 1980, w: 340, h: 130, rot: 0.02 },
  { kind: 'cableCoil', x: 760, y: 760, w: 280, h: 140, rot: 0.4 },
  { kind: 'vent', x: 2180, y: 640, w: 240, h: 126, rot: 0 },
  { kind: 'crumbCluster', x: 2300, y: 1050, w: 120, h: 90, rot: 1.2 },
  { kind: 'waterRing', x: 1200, y: 1500, w: 104, h: 78, rot: 0 },
  { kind: 'scuffMark', x: 2400, y: 1600, w: 260, h: 100, rot: -0.2 },
];

export type DecalKind = 'mat' | 'vent' | 'cable' | 'crack' | 'spill' | 'ring';

export interface Decal {
  kind: DecalKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

/**
 * Non-colliding floor detail. These carry no gameplay rules — they exist so the kitchen reads as a
 * used room and so the eye has landmarks to navigate by between the big solids.
 */
export const DECALS: readonly Decal[] = [
  { kind: 'mat', x: 620, y: 1000, w: 430, h: 560, rot: 0 },
  { kind: 'mat', x: 2660, y: 1880, w: 520, h: 300, rot: 0.06 },
  { kind: 'vent', x: 2180, y: 640, w: 250, h: 130, rot: 0 },
  { kind: 'vent', x: 300, y: 2320, w: 210, h: 110, rot: 1.57 },
  { kind: 'cable', x: 2600, y: 800, w: 900, h: 220, rot: 0 },
  { kind: 'cable', x: 700, y: 700, w: 640, h: 180, rot: 0.4 },
  { kind: 'crack', x: 1500, y: 1900, w: 420, h: 190, rot: 0.3 },
  { kind: 'crack', x: 900, y: 1250, w: 300, h: 140, rot: -0.8 },
  { kind: 'crack', x: 2900, y: 1300, w: 360, h: 160, rot: 1.1 },
  { kind: 'spill', x: 1560, y: 820, w: 300, h: 230, rot: 0 },
  { kind: 'spill', x: 2900, y: 2350, w: 340, h: 260, rot: 0 },
  { kind: 'spill', x: 1000, y: 2280, w: 260, h: 200, rot: 0 },
  { kind: 'ring', x: 2700, y: 2216, w: 250, h: 250, rot: 0 },
  { kind: 'ring', x: 1200, y: 1500, w: 170, h: 170, rot: 0 },
  { kind: 'ring', x: 2300, y: 900, w: 200, h: 200, rot: 0 },
];

/** Static light sources. The room light added by patrols is dynamic and lives in the sim. */
export const LIGHTS: readonly LightSource[] = [
  // Every source now sits on the object that emits it. The old set had the under-sink glow 84 units
  // outside the sink cabinet, the oven clock below the stove and the hallway light inside a solid
  // wall — light with no visible cause reads as a rendering artefact, not as a room.
  { id: 'ovenClock', x: 1486, y: 560, radius: 430, intensity: 0.5, warmth: 0.9 },
  { id: 'fridgeSeam', x: 2624, y: 700, radius: 700, intensity: 0.82, warmth: 0.95 },
  { id: 'dishwasherLamp', x: 560, y: 1750, radius: 300, intensity: 0.3, warmth: 0.2 },
  // Through the doorway gap in the bottom wall, which now exists.
  { id: 'hallway', x: 3100, y: 2588, radius: 920, intensity: 0.5, warmth: 0.78 },
  { id: 'outletLed', x: 2860, y: 806, radius: 190, intensity: 0.22, warmth: 0.3 },
  { id: 'binGlow', x: 3180, y: 2440, radius: 300, intensity: 0.18, warmth: 0.6 },

  // ── Under-cabinet LED strip ────────────────────────────────────────────────
  //
  // The kitchen's KEY light, and it was missing entirely. Measured cause of "the kitchen is not
  // recognizable": the six sources above leave the counter run and the whole room centre unlit, so
  // no amount of prop detail could read — an unlit object is a silhouette regardless of how well it
  // is modelled. A strip under the wall cabinets is the most common light left on overnight in a
  // Korean apartment kitchen, so it is motivated as well as necessary.
  //
  // Modelled as four overlapping emitters along the run rather than one huge radius, because a
  // single circle reads as a lamp; a strip has to be long and shallow. Cold (warmth 0.12) so it
  // separates from the warm fridge seam and hallway spill.
  //
  // Exposure samples this same field, so these are gameplay values, not decoration — and the first
  // attempt proved how sharp that coupling is. At radius 430 / intensity 0.38 the spill reached the
  // stove and sink food sources, and a reckless run went from viable to collapsing in operation 1
  // with ZERO deliveries. Real under-cabinet light lands on the worktop, not across the floor, so
  // the radius is now 260 (≈350 mm of throw) and the intensity halved. Measured against the
  // strategy suite rather than judged by eye.
  { id: 'underCabA', x: 300, y: 500, radius: 260, intensity: 0.2, warmth: 0.12 },
  { id: 'underCabB', x: 820, y: 500, radius: 260, intensity: 0.2, warmth: 0.12 },
  { id: 'underCabC', x: 1980, y: 500, radius: 260, intensity: 0.18, warmth: 0.12 },
  { id: 'underCabD', x: 2400, y: 500, radius: 260, intensity: 0.18, warmth: 0.12 },

  // Pendant over the island — the second thing left on in a lived-in kitchen, and the reason the
  // island reads as a place people stand rather than as a slab in the dark.
  { id: 'islandPendant', x: 1860, y: 1440, radius: 400, intensity: 0.26, warmth: 0.72 },
];

export interface ResourceSpec {
  id: string;
  kind: 'food' | 'water';
  x: number;
  y: number;
  amount: number;
  unlockOp: 1 | 2 | 3 | 4;
  label: string;
}

export const RESOURCES: readonly ResourceSpec[] = [
  // Operation 1 — both within a short scout of the home crack, so the first delivery lands fast.
  // Amounts are deliberately finite. The old nodes held 3 600 units against a whole-night draw of
  // ~474 and regrew 30 % between nights, which made scarcity arithmetically impossible and meant a
  // player never had to move a supply line once it worked.
  {
    id: 'dishCrumbs',
    kind: 'food',
    x: 712,
    y: 1704,
    amount: 680,
    unlockOp: 1,
    label: t('place.resource.dishCrumbs'),
  },
  {
    id: 'sinkDrip',
    kind: 'water',
    x: 664,
    y: 1312,
    amount: 640,
    unlockOp: 1,
    label: t('place.resource.sinkDrip'),
  },
  {
    id: 'stoveGrease',
    kind: 'food',
    x: 1608,
    y: 716,
    amount: 820,
    unlockOp: 1,
    label: t('place.resource.stoveGrease'),
  },

  // Operation 2 — richer, and out where the household can see you working.
  {
    id: 'islandDrop',
    kind: 'food',
    x: 1872,
    y: 1948,
    amount: 1150,
    unlockOp: 2,
    label: t('place.resource.islandDrop'),
  },
  {
    id: 'fridgeCondensation',
    kind: 'water',
    x: 2556,
    y: 872,
    amount: 1250,
    unlockOp: 2,
    label: t('place.resource.fridgeCondensation'),
  },
  {
    id: 'pantryGrain',
    kind: 'food',
    x: 912,
    y: 2312,
    amount: 1200,
    unlockOp: 2,
    label: t('place.resource.pantryGrain'),
  },

  // Operation 3 — the biggest hauls, in the worst places.
  {
    id: 'trashSpill',
    kind: 'food',
    x: 2884,
    y: 2472,
    amount: 1900,
    unlockOp: 3,
    label: t('place.resource.trashSpill'),
  },
  {
    id: 'petBowl',
    kind: 'water',
    x: 2700,
    y: 2216,
    amount: 1700,
    unlockOp: 3,
    label: t('place.resource.petBowl'),
  },
];

export interface NestSpec {
  id: string;
  x: number;
  y: number;
  home: boolean;
  unlockOp: 1 | 2 | 3 | 4;
  label: string;
  costFood: number;
  costWater: number;
  fitFood: number;
  fitWater: number;
}

/**
 * Footholds.
 *
 * Six cracks spread so that no three of them sit in the same region — holding three regions of the
 * kitchen means actually crossing the kitchen. Each is bought twice: claiming it takes the ground,
 * fitting it out chooses what it does. That second spend is most of the reason a full larder is a
 * decision again rather than a dead end.
 */
export const NESTS: readonly NestSpec[] = [
  {
    id: 'home',
    x: 168,
    y: 2042,
    home: true,
    unlockOp: 1,
    label: t('place.nest.home'),
    costFood: 0,
    costWater: 0,
    fitFood: 0,
    fitWater: 0,
  },
  {
    id: 'crackSink',
    x: 604,
    y: 1568,
    home: false,
    unlockOp: 2,
    label: t('place.nest.crackSink'),
    costFood: 30,
    costWater: 20,
    fitFood: 34,
    fitWater: 22,
  },
  {
    id: 'crackIsland',
    x: 1362,
    y: 1796,
    home: false,
    unlockOp: 2,
    label: t('place.nest.crackIsland'),
    costFood: 34,
    costWater: 22,
    fitFood: 38,
    fitWater: 24,
  },
  {
    id: 'crackPantry',
    x: 836,
    y: 2494,
    home: false,
    unlockOp: 2,
    label: t('place.nest.crackPantry'),
    costFood: 32,
    costWater: 20,
    fitFood: 36,
    fitWater: 22,
  },
  {
    id: 'crackStove',
    x: 1980,
    y: 640,
    home: false,
    unlockOp: 3,
    label: t('place.nest.crackStove'),
    costFood: 42,
    costWater: 28,
    fitFood: 44,
    fitWater: 28,
  },
  {
    id: 'crackBin',
    x: 3428,
    y: 2088,
    home: false,
    unlockOp: 3,
    label: t('place.nest.crackBin'),
    costFood: 46,
    costWater: 30,
    fitFood: 46,
    fitWater: 30,
  },
];

/**
 * Authored patrol routes. Each is a floor path the human walks; the sim drops footfalls along it and
 * projects a light cone forward. Bounded variation comes from timing and from which route is picked,
 * never from randomised geometry, so a route the player learned stays learnable.
 */
export const PATROL_PATHS: { id: string; night: NightIndex; points: { x: number; y: number }[] }[] =
  [
    {
      id: 'fridgeRaid',
      night: 1,
      points: [
        { x: 3400, y: 2520 },
        { x: 3000, y: 1900 },
        { x: 2900, y: 1000 },
        { x: 2740, y: 830 },
        { x: 2900, y: 1000 },
        { x: 3200, y: 2200 },
        { x: 3460, y: 2560 },
      ],
    },
    {
      id: 'sinkRinse',
      night: 2,
      points: [
        { x: 3400, y: 2520 },
        { x: 2400, y: 2100 },
        { x: 1400, y: 1950 },
        { x: 820, y: 1500 },
        { x: 700, y: 1180 },
        { x: 900, y: 900 },
        { x: 1700, y: 900 },
        { x: 2600, y: 1500 },
        { x: 3300, y: 2400 },
      ],
    },
    {
      id: 'stoveCheck',
      night: 2,
      points: [
        { x: 3400, y: 2520 },
        { x: 2600, y: 1600 },
        { x: 1900, y: 900 },
        { x: 1500, y: 760 },
        { x: 1100, y: 820 },
        { x: 1500, y: 1400 },
        { x: 2400, y: 2000 },
        { x: 3380, y: 2500 },
      ],
    },
    {
      id: 'binSweep',
      night: 3,
      points: [
        { x: 3400, y: 2520 },
        { x: 2900, y: 2200 },
        { x: 2200, y: 2300 },
        { x: 1400, y: 2200 },
        { x: 900, y: 2000 },
        { x: 700, y: 1600 },
        { x: 1200, y: 1000 },
        { x: 2200, y: 800 },
        { x: 3100, y: 1600 },
        { x: 3420, y: 2520 },
      ],
    },
    {
      id: 'fullSweep',
      night: 3,
      points: [
        { x: 3400, y: 2520 },
        { x: 2000, y: 2350 },
        { x: 900, y: 2050 },
        { x: 640, y: 1300 },
        { x: 1000, y: 780 },
        { x: 2000, y: 700 },
        { x: 2700, y: 900 },
        { x: 2900, y: 1700 },
        { x: 2000, y: 2000 },
        { x: 3400, y: 2500 },
      ],
    },
  ];

/** Extermination sweep paths — deliberately aimed at the colony's home corner. */
export const SPRAY_PATHS: { id: string; points: { x: number; y: number }[] }[] = [
  {
    id: 'baseboardSweep',
    points: [
      { x: 1400, y: 2340 },
      { x: 900, y: 2200 },
      { x: 420, y: 2060 },
      { x: 260, y: 2040 },
      { x: 620, y: 1700 },
      { x: 660, y: 1300 },
    ],
  },
  {
    id: 'islandSweep',
    points: [
      { x: 2600, y: 1900 },
      { x: 1900, y: 1950 },
      { x: 1350, y: 1830 },
      { x: 1250, y: 1500 },
      { x: 1500, y: 1100 },
    ],
  },
  {
    id: 'homeSweep',
    points: [
      { x: 1100, y: 2480 },
      { x: 700, y: 2380 },
      { x: 300, y: 2200 },
      { x: 190, y: 2050 },
      { x: 240, y: 1900 },
      { x: 700, y: 1900 },
    ],
  },
];

/** Candidate trap sites: authored floor positions the humans consider, ranked by player traffic. */
export const TRAP_SITES: { x: number; y: number }[] = [
  { x: 900, y: 1900 },
  { x: 700, y: 1500 },
  { x: 1050, y: 1150 },
  { x: 1500, y: 950 },
  { x: 1300, y: 1900 },
  { x: 1900, y: 1900 },
  { x: 2560, y: 1500 },
  { x: 2560, y: 1050 },
  { x: 2200, y: 2300 },
  { x: 2800, y: 2300 },
  { x: 3300, y: 1750 },
  { x: 1000, y: 2300 },
  { x: 1800, y: 1150 },
  { x: 640, y: 2000 },
];

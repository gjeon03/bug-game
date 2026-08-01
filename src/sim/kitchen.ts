import type { LightSource, NightIndex, Solid } from './types.ts';
import { WORLD_H, WORLD_W } from './constants.ts';

/**
 * The one authored kitchen.
 *
 * Everything here is data, not behaviour, so the map can be reasoned about (and unit-tested) without
 * running the game. Coordinates are world units; the scout is 26 units long, a floor tile is 320.
 */

export const SOLIDS: readonly Solid[] = [
  // Room shell.
  { id: 'wallTop', x: 0, y: 0, w: WORLD_W, h: 56, mat: 'wall' },
  { id: 'wallLeft', x: 0, y: 0, w: 56, h: WORLD_H, mat: 'wall' },
  { id: 'wallRight', x: WORLD_W - 56, y: 0, w: 56, h: WORLD_H, mat: 'wall' },
  { id: 'wallBottom', x: 0, y: WORLD_H - 56, w: WORLD_W, h: 56, mat: 'wall' },

  // Top run: counter — stove — counter — fridge, with a dark 64-unit gap before the fridge.
  { id: 'counterLeft', x: 56, y: 56, w: 1080, h: 470, mat: 'cabinet', label: 'counter' },
  { id: 'stove', x: 1136, y: 56, w: 700, h: 500, mat: 'steel', label: 'stove' },
  { id: 'counterRight', x: 1836, y: 56, w: 700, h: 470, mat: 'cabinet', label: 'counter' },
  { id: 'fridge', x: 2600, y: 56, w: 944, h: 700, mat: 'steel', label: 'fridge' },

  // Left run: sink — dishwasher — (corridor) — pantry.
  { id: 'sinkCabinet', x: 56, y: 900, w: 500, h: 640, mat: 'cabinet', label: 'sink' },
  { id: 'dishwasher', x: 56, y: 1540, w: 500, h: 420, mat: 'steel', label: 'dishwasher' },
  { id: 'pantry', x: 56, y: 2120, w: 700, h: 424, mat: 'cabinet', label: 'pantry' },

  // Centre island — the map's main obstacle and its most exposed perimeter.
  { id: 'island', x: 1240, y: 1180, w: 1240, h: 560, mat: 'cabinet', label: 'island' },

  // Right side: radiator, bin, table legs.
  { id: 'radiator', x: 3400, y: 940, w: 144, h: 560, mat: 'metal', label: 'radiator' },
  { id: 'trashBin', x: 2980, y: 2020, w: 400, h: 400, mat: 'plastic', label: 'bin' },
  { id: 'tableLegA', x: 2700, y: 1300, w: 96, h: 96, mat: 'cabinet' },
  { id: 'tableLegB', x: 3160, y: 1300, w: 96, h: 96, mat: 'cabinet' },
  { id: 'tableLegC', x: 2700, y: 1760, w: 96, h: 96, mat: 'cabinet' },
  { id: 'tableLegD', x: 3160, y: 1760, w: 96, h: 96, mat: 'cabinet' },

  // Floor clutter: cover and landmarks in the exposed middle of the room, which is otherwise a
  // featureless plain at insect scale.
  { id: 'chairLegA', x: 1520, y: 2136, w: 84, h: 84, mat: 'cabinet' },
  { id: 'chairLegB', x: 1808, y: 2136, w: 84, h: 84, mat: 'cabinet' },
  { id: 'chairLegC', x: 1520, y: 2404, w: 84, h: 84, mat: 'cabinet' },
  { id: 'chairLegD', x: 1808, y: 2404, w: 84, h: 84, mat: 'cabinet' },
  { id: 'boxPantry', x: 880, y: 1948, w: 268, h: 132, mat: 'plastic', label: 'box' },
  { id: 'binLiner', x: 2760, y: 2320, w: 150, h: 108, mat: 'plastic' },
  { id: 'pipeRun', x: 3400, y: 300, w: 144, h: 430, mat: 'metal', label: 'pipe' },
  { id: 'stoolLeg', x: 2560, y: 620, w: 74, h: 74, mat: 'metal' },
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
  { id: 'underSink', x: 640, y: 1210, radius: 540, intensity: 0.5, warmth: 0.35 },
  { id: 'ovenClock', x: 1486, y: 640, radius: 430, intensity: 0.48, warmth: 0.85 },
  { id: 'fridgeSeam', x: 2570, y: 720, radius: 720, intensity: 0.86, warmth: 0.95 },
  { id: 'hallway', x: 3340, y: 2560, radius: 940, intensity: 0.52, warmth: 0.8 },
  { id: 'binGlow', x: 3180, y: 2440, radius: 330, intensity: 0.22, warmth: 0.6 },
];

export interface ResourceSpec {
  id: string;
  kind: 'food' | 'water';
  x: number;
  y: number;
  amount: number;
  unlockNight: NightIndex;
  label: string;
}

export const RESOURCES: readonly ResourceSpec[] = [
  // Night 1 — both within a short scout of the home crack, so the first delivery lands fast.
  {
    id: 'dishCrumbs',
    kind: 'food',
    x: 712,
    y: 1704,
    amount: 240,
    unlockNight: 1,
    label: 'Dishwasher crumbs',
  },
  {
    id: 'sinkDrip',
    kind: 'water',
    x: 664,
    y: 1312,
    amount: 260,
    unlockNight: 1,
    label: 'Sink drip',
  },
  {
    id: 'stoveGrease',
    kind: 'food',
    x: 1608,
    y: 716,
    amount: 300,
    unlockNight: 1,
    label: 'Stove grease',
  },

  // Night 2 — the real decisions: value sits on exposed floor and inside the fridge light.
  {
    id: 'islandDrop',
    kind: 'food',
    x: 1872,
    y: 1948,
    amount: 380,
    unlockNight: 2,
    label: 'Island spill',
  },
  {
    id: 'fridgeCondensation',
    kind: 'water',
    x: 2556,
    y: 872,
    amount: 420,
    unlockNight: 2,
    label: 'Fridge condensation',
  },
  {
    id: 'pantryGrain',
    kind: 'food',
    x: 912,
    y: 2312,
    amount: 400,
    unlockNight: 2,
    label: 'Pantry grain',
  },

  // Night 3 — the biggest hauls, in the worst places.
  {
    id: 'trashSpill',
    kind: 'food',
    x: 2884,
    y: 2472,
    amount: 560,
    unlockNight: 3,
    label: 'Bin spill',
  },
  {
    id: 'petBowl',
    kind: 'water',
    x: 2700,
    y: 2216,
    amount: 400,
    unlockNight: 3,
    label: 'Pet bowl',
  },
];

export interface NestSpec {
  id: string;
  x: number;
  y: number;
  home: boolean;
  upgrade: 'brood' | 'cache' | 'escape' | null;
  unlockNight: NightIndex;
  label: string;
  costFood: number;
  costWater: number;
}

export const NESTS: readonly NestSpec[] = [
  {
    id: 'home',
    x: 168,
    y: 2042,
    home: true,
    upgrade: null,
    unlockNight: 1,
    label: 'Home crack',
    costFood: 0,
    costWater: 0,
  },
  {
    id: 'crackIsland',
    x: 1362,
    y: 1796,
    home: false,
    upgrade: 'brood',
    unlockNight: 2,
    label: 'Brood chamber',
    costFood: 40,
    costWater: 26,
  },
  {
    id: 'crackPantry',
    x: 836,
    y: 2494,
    home: false,
    upgrade: 'cache',
    unlockNight: 2,
    label: 'Food cache',
    costFood: 46,
    costWater: 22,
  },
  {
    id: 'crackWall',
    x: 3488,
    y: 1632,
    home: false,
    upgrade: 'escape',
    unlockNight: 3,
    label: 'Escape tunnel',
    costFood: 54,
    costWater: 34,
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

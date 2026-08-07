import { GRID_CELL_MM, mm } from '../units';
import type { RegionSpec } from '../types';

/**
 * Chapter 1 — the kitchen.
 *
 * Authored in real millimetres against a Korean apartment kitchen: an L of 660 mm base units with an
 * 880 mm worktop, a 100 mm toe-kick recess at the floor, a fridge in the west corner and the food
 * waste bin by the door. The colony starts in the void under the sink and can initially reach only
 * the toe-kick strip and the floor in front of it.
 *
 * The toe-kick is the point of the whole layout. It is a 100 mm deep, 150 mm high slot that runs the
 * entire length of the units, it is the darkest continuous space in the room, and it is where a real
 * infestation actually lives. Everything the player does in chapter 1 is an argument about whether
 * to leave it.
 */

/* Room envelope, mm. The camera looks toward +X and +Z, so the north (-Z) and west (-X) walls are
 * the ones between the viewer and the room; `house.ts` cuts them to stubs. */
const X0 = 0;
const X1 = 3800;
const Z0 = -3300;
const Z1 = -300;

/** Base units: 660 mm deep carcass, 880 mm worktop, 100 mm toe-kick recess at 150 mm high. */
const COUNTER_DEPTH = 660;
const COUNTER_H = 880;
const TOEKICK_DEPTH = 100;

/** North run: full width against the far wall. Its face is at z = Z0 + COUNTER_DEPTH. */
const NORTH_FACE = Z0 + COUNTER_DEPTH; // -2640
const NORTH_CARCASS = NORTH_FACE - TOEKICK_DEPTH; // -2740

/** East run: turns the corner and runs south along the full-height east wall. */
const EAST_FACE = X1 - COUNTER_DEPTH; // 3140
const EAST_CARCASS = EAST_FACE + TOEKICK_DEPTH; // 3240
const EAST_RUN_Z1 = -1400;

/**
 * The dining half of the room.
 *
 * The kitchen had exactly two walkable planes — floor and worktop — and a player was meant to spend
 * a whole run on them. Everything below adds the second half of a real kitchen: the table people
 * actually eat at, the chair that reaches it, and the bin by the door. Three new planes, six new
 * climbs, and the by-products of the room being used.
 */
const TABLE_X0 = 880;
const TABLE_X1 = 2280;
const TABLE_Z0 = -1780;
const TABLE_Z1 = -980;
const TABLE_H = 730;

const CHAIR_X = 2560;
const CHAIR_Z = -1380;
const CHAIR_HALF = 210;
const CHAIR_H = 440;

const BIN_X = 3400;
const BIN_Z = -860;
const BIN_HALF = 160;
/**
 * How far the bin's FLOOR BLOCKER extends beyond its shell.
 *
 * The moulding flares at the base and the lid overhangs, so blocking only the nominal footprint let
 * bodies stand visibly inside the plastic. Named rather than folded into the blocker rectangle
 * because the bin lid climb has to start OUTSIDE it, and the two numbers drifting apart is exactly
 * how that climb became unenterable.
 */
const BIN_CLEAR = 60;
const BIN_INSIDE_H = 300;

const FRIDGE_W = 700;
const FRIDGE_D = 680;
const FRIDGE_Z0 = -2200;

export const KITCHEN: RegionSpec = {
  id: 'kitchen',
  labelKey: 'region.kitchen',
  bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },

  surfaces: [
    {
      id: 'kitchen.floor',
      region: 'kitchen',
      y: 0,
      bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },
      exposure: 1,
      labelKey: 'surface.kitchen.floor',
    },
    {
      // The worktop. Lit, wiped, and the first place anyone looks — the most exposed plane in
      // chapter 1, and also where the richest food is.
      id: 'kitchen.counter',
      region: 'kitchen',
      y: mm(COUNTER_H),
      bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(EAST_RUN_Z1) },
      /*
       * The worktop is an L, not the rectangle its bounds describe: a north run across the full
       * width, and an east run turning the corner. Declaring both means the grid blocks the inside
       * of the corner by construction, instead of leaving 3.1 m by 1.2 m of walkable mid-air 880 mm
       * above the floor — which is what shipped, and what a player found by climbing up and walking
       * inward.
       */
      support: [
        { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(NORTH_FACE) },
        { x0: mm(EAST_FACE), z0: mm(NORTH_FACE), x1: mm(X1), z1: mm(EAST_RUN_Z1) },
      ],
      exposure: 1.5,
      labelKey: 'surface.kitchen.counter',
    },
    {
      /*
       * The table top. The most exposed plane in the room after the worktop, and the only one that
       * is exposed because of PEOPLE rather than because of a lamp — someone is sitting here.
       */
      id: 'kitchen.table.top',
      region: 'kitchen',
      y: mm(TABLE_H),
      bounds: { x0: mm(TABLE_X0), z0: mm(TABLE_Z0), x1: mm(TABLE_X1), z1: mm(TABLE_Z1) },
      // A solid slab: the footprint IS the bounds. Stated rather than implied, because the guard in
      // house.test.ts refuses to let a raised surface stay silent about what holds it up.
      support: [{ x0: mm(TABLE_X0), z0: mm(TABLE_Z0), x1: mm(TABLE_X1), z1: mm(TABLE_Z1) }],
      exposure: 1.6,
      labelKey: 'surface.kitchen.table',
    },
    {
      /** The chair seat: the only halfway step between the floor and the table. */
      id: 'kitchen.chair.seat',
      region: 'kitchen',
      y: mm(CHAIR_H),
      bounds: {
        x0: mm(CHAIR_X - CHAIR_HALF),
        z0: mm(CHAIR_Z - CHAIR_HALF),
        x1: mm(CHAIR_X + CHAIR_HALF),
        z1: mm(CHAIR_Z + CHAIR_HALF),
      },
      support: [
        {
          x0: mm(CHAIR_X - CHAIR_HALF),
          z0: mm(CHAIR_Z - CHAIR_HALF),
          x1: mm(CHAIR_X + CHAIR_HALF),
          z1: mm(CHAIR_Z + CHAIR_HALF),
        },
      ],
      exposure: 0.9,
      labelKey: 'surface.kitchen.chair',
    },
    {
      /** Inside the food-waste bin. The richest food in the room, and the worst place to be. */
      id: 'kitchen.bin.inside',
      region: 'kitchen',
      y: mm(BIN_INSIDE_H),
      bounds: {
        x0: mm(BIN_X - BIN_HALF),
        z0: mm(BIN_Z - BIN_HALF),
        x1: mm(BIN_X + BIN_HALF),
        z1: mm(BIN_Z + BIN_HALF),
      },
      support: [
        {
          x0: mm(BIN_X - BIN_HALF),
          z0: mm(BIN_Z - BIN_HALF),
          x1: mm(BIN_X + BIN_HALF),
          z1: mm(BIN_Z + BIN_HALF),
        },
      ],
      exposure: 0.5,
      labelKey: 'surface.kitchen.bin',
    },
  ],

  /* The carcasses. The toe-kick strip in front of each is deliberately NOT blocked: it is the
   * 100 mm slot the colony lives in. */
  blockers: [
    {
      surface: 'kitchen.floor',
      rect: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(NORTH_CARCASS) },
    },
    {
      surface: 'kitchen.floor',
      rect: { x0: mm(EAST_CARCASS), z0: mm(NORTH_CARCASS), x1: mm(X1), z1: mm(EAST_RUN_Z1) },
    },
    {
      surface: 'kitchen.floor',
      rect: { x0: mm(X0), z0: mm(FRIDGE_Z0), x1: mm(X0 + FRIDGE_W), z1: mm(FRIDGE_Z0 + FRIDGE_D) },
    },
    // Food waste bin and recycling stack by the doorway.
    {
      surface: 'kitchen.floor',
      rect: {
        x0: mm(BIN_X - BIN_HALF - BIN_CLEAR),
        z0: mm(BIN_Z - BIN_HALF - BIN_CLEAR),
        x1: mm(BIN_X + BIN_HALF + BIN_CLEAR),
        z1: mm(BIN_Z + BIN_HALF + BIN_CLEAR),
      },
    },
    { surface: 'kitchen.floor', rect: { x0: mm(2560), z0: mm(-900), x1: mm(3060), z1: mm(-520) } },
    // On the worktop: the rice cooker body is solid to a cockroach.
    {
      surface: 'kitchen.counter',
      rect: { x0: mm(2660), z0: mm(-3160), x1: mm(3160), z1: mm(-2760) },
    },
    {
      /*
       * The sink aperture.
       *
       * `props/kitchen.ts` cuts this hole out of the worktop geometry, and nothing ever told the
       * navigation grid — so the scout walked straight across the opening, over a 700 mm drop into
       * the basin. Geometry and navigation have to be told the same thing twice; this is the second
       * telling.
       */
      surface: 'kitchen.counter',
      rect: { x0: mm(1546), z0: mm(-3154), x1: mm(1954), z1: mm(-2786) },
    },
  ],

  links: [
    {
      // The rice cooker's power lead runs down the face of the units. One body at a time.
      id: 'kitchen.cable.ricecooker',
      from: 'kitchen.floor',
      to: 'kitchen.counter',
      at: { x: mm(2960), z: mm(NORTH_FACE - 30) },
      seconds: 2.4,
      capacity: 1,
      kind: 'cable',
      labelKey: 'link.kitchen.cable',
    },
    {
      /*
       * Where the two runs meet, the carcasses do not quite close. Wider, slower, hidden.
       *
       * The mouth sits in the EAST toe-kick slot, `EAST_FACE`…`EAST_CARCASS`, which is the only
       * standable ground at this corner — the carcass itself is blocked from `EAST_CARCASS` out.
       * It was authored at `EAST_FACE + 190` = 3330 mm, which is 90 mm INSIDE that carcass, so the
       * climb could never be entered by anything. `nav.ts` offers a link only from the exact cell
       * its mouth occupies and A* never expands a blocked cell, so this was not a near miss; it was
       * a link that did not exist, and it took floor-to-worktop down to a single capacity-1 cable.
       *
       * That authoring error was itself a fix: the mouth used to be at `EAST_FACE - 40` and sat
       * 143 mm from the rice cooker cable, inside `CLIMB_REACH`, so `climbInReach` could never
       * return it. Both constraints now have guards in `tests/unit/house.test.ts`, because fixing
       * one by hand is exactly how the other was broken.
       */
      id: 'kitchen.seam.corner',
      from: 'kitchen.floor',
      to: 'kitchen.counter',
      at: { x: mm(EAST_CARCASS - 30), z: mm(NORTH_FACE - 60) },
      exitAt: { x: mm(EAST_CARCASS + 20), z: mm(NORTH_FACE - 120) },
      seconds: 3.4,
      capacity: 2,
      kind: 'seam',
      labelKey: 'link.kitchen.seam',
    },
    {
      /*
       * Up a chair leg. The stretcher between the front legs is the hold that makes it climbable,
       * and it is authored in the prop for exactly that reason.
       */
      id: 'kitchen.leg.chair',
      from: 'kitchen.floor',
      to: 'kitchen.chair.seat',
      at: { x: mm(CHAIR_X - CHAIR_HALF + 40), z: mm(CHAIR_Z + CHAIR_HALF - 40) },
      exitAt: { x: mm(CHAIR_X - CHAIR_HALF + 90), z: mm(CHAIR_Z + CHAIR_HALF - 90) },
      seconds: 1.6,
      capacity: 1,
      kind: 'seam',
      labelKey: 'link.kitchen.chairleg',
    },
    {
      /*
       * The gap from the pulled-out chair to the table edge. The reason the chair is pulled out.
       *
       * Crossed at the SOUTH end of the seat's west edge, not the middle. In the middle it sat
       * 134 mm from where the leg climb lands, and `climbInReach` returns only the nearest mouth
       * within 210 mm — so a scout arriving up the leg could never select the crossing, and the
       * chair was a dead end that looked like a route.
       */
      id: 'kitchen.gap.chairedge',
      from: 'kitchen.chair.seat',
      to: 'kitchen.table.top',
      at: { x: mm(CHAIR_X - CHAIR_HALF + 30), z: mm(CHAIR_Z - CHAIR_HALF + 70) },
      exitAt: { x: mm(TABLE_X1 - 60), z: mm(CHAIR_Z - CHAIR_HALF + 70) },
      seconds: 1.3,
      capacity: 2,
      kind: 'gap',
      labelKey: 'link.kitchen.chairedge',
    },
    {
      /** A phone charger cable left hanging off the table. The direct route, and a slow one. */
      id: 'kitchen.cable.charger',
      from: 'kitchen.floor',
      to: 'kitchen.table.top',
      at: { x: mm(TABLE_X0 + 180), z: mm(TABLE_Z1 - 40) },
      exitAt: { x: mm(TABLE_X0 + 180), z: mm(TABLE_Z1 - 120) },
      seconds: 2.6,
      capacity: 1,
      kind: 'cable',
      labelKey: 'link.kitchen.charger',
    },
    {
      /*
       * Over the tipped bin lid. Short, rich, and standing in the doorway's light.
       *
       * The mouth has to clear the bin's FLOOR BLOCKER, which is deliberately wider than the bin
       * shell by `BIN_CLEAR` so a body never ends up inside the moulding. Authored at
       * `BIN_X - BIN_HALF - 30` it was 30 mm clear of the shell and 30 mm INSIDE the blocker, which
       * made `kitchen.bin.inside` — a whole walkable surface — and the largest food source in the
       * game permanently unreachable.
       *
       * The half-cell is what makes it safe rather than lucky: blockers rasterise by cell CENTRE, so
       * a mouth exactly on the blocker edge still lands in the first blocked cell.
       */
      id: 'kitchen.gap.binlid',
      from: 'kitchen.floor',
      to: 'kitchen.bin.inside',
      at: { x: mm(BIN_X - BIN_HALF - BIN_CLEAR - GRID_CELL_MM / 2), z: mm(BIN_Z) },
      exitAt: { x: mm(BIN_X - 40), z: mm(BIN_Z) },
      seconds: 3.0,
      capacity: 1,
      kind: 'gap',
      labelKey: 'link.kitchen.binlid',
    },
  ],

  resources: [
    {
      id: 'kitchen.crumbs.toekick',
      region: 'kitchen',
      surface: 'kitchen.floor',
      at: { x: mm(1500), z: mm(NORTH_FACE - 50) },
      kind: 'food',
      /*
       * The opening food source, and it has to sustain the opening.
       *
       * With the exposure field working, every route to distant food is long, so a colony that
       * exhausts what is under the sink starves next to a full trap: measured across four runs,
       * final food 0 with final moisture 176-467. The toe-kick is where crumbs actually collect
       * under a sink, and it is swept back under by the same washing-up that refills the trap.
       */
      amount: 96,
      rate: 1.5,
      disturbance: 0.02,
      labelKey: 'resource.kitchen.crumbs',
      refilledBy: 'kitchen.dishes',
    },
    {
      id: 'kitchen.drip.trap',
      region: 'kitchen',
      surface: 'kitchen.floor',
      at: { x: mm(1980), z: mm(NORTH_FACE - 55) },
      kind: 'moisture',
      amount: 60,
      rate: 1.4,
      disturbance: 0.01,
      labelKey: 'resource.kitchen.trap',
      refilledBy: 'kitchen.water',
    },
    {
      id: 'kitchen.fridge.seal',
      region: 'kitchen',
      surface: 'kitchen.floor',
      at: { x: mm(760), z: mm(-1900) },
      kind: 'food',
      amount: 74,
      rate: 1.2,
      disturbance: 0.05,
      labelKey: 'resource.kitchen.fridgeseal',
      // The door seal is only worth stripping while the door has been opened — which is the whole
      // point of the fridge routine: a short, frequent, well-lit window.
      refilledBy: 'kitchen.fridge',
    },
    {
      id: 'kitchen.rice',
      region: 'kitchen',
      surface: 'kitchen.counter',
      at: { x: mm(2500), z: mm(-2950) },
      kind: 'food',
      amount: 70,
      rate: 2.0,
      disturbance: 0.16,
      labelKey: 'resource.kitchen.rice',
      // Rice gets spilled when somebody serves a meal, not when they open the fridge.
      refilledBy: 'kitchen.dinner',
    },
    {
      id: 'kitchen.sponge',
      region: 'kitchen',
      surface: 'kitchen.counter',
      at: { x: mm(2120), z: mm(-2960) },
      kind: 'moisture',
      amount: 52,
      rate: 1.8,
      disturbance: 0.09,
      labelKey: 'resource.kitchen.sponge',
      refilledBy: 'kitchen.kettle',
    },
    {
      // The richest source in chapter 1 and the loudest. Taking it teaches the evidence system.
      id: 'kitchen.bin',
      region: 'kitchen',
      surface: 'kitchen.floor',
      at: { x: mm(3400), z: mm(-1180) },
      kind: 'food',
      amount: 120,
      rate: 2.4,
      disturbance: 0.42,
      labelKey: 'resource.kitchen.bin',
      refilledBy: 'kitchen.bin',
    },
    {
      /** Crumbs on the table. Plentiful, easy — and you are standing where people look. */
      id: 'kitchen.table.crumbs',
      region: 'kitchen',
      surface: 'kitchen.table.top',
      at: { x: mm(TABLE_X0 + 520), z: mm(TABLE_Z0 + 360) },
      kind: 'food',
      amount: 120,
      rate: 1.7,
      disturbance: 0.16,
      labelKey: 'resource.kitchen.tablecrumbs',
      refilledBy: 'kitchen.dinner',
    },
    {
      /** The ring a cold glass left. Small, but it is water you do not have to cross the room for. */
      id: 'kitchen.table.ring',
      region: 'kitchen',
      surface: 'kitchen.table.top',
      at: { x: mm(TABLE_X0 + 1180), z: mm(TABLE_Z0 + 240) },
      kind: 'moisture',
      amount: 58,
      rate: 1.1,
      disturbance: 0.14,
      labelKey: 'resource.kitchen.tablering',
      refilledBy: 'kitchen.kettle',
    },
    {
      /** Inside the bin. The richest food in the kitchen and the most disturbed place in it. */
      id: 'kitchen.bin.inside.food',
      region: 'kitchen',
      surface: 'kitchen.bin.inside',
      at: { x: mm(BIN_X), z: mm(BIN_Z) },
      kind: 'food',
      amount: 210,
      rate: 2.2,
      disturbance: 0.42,
      labelKey: 'resource.kitchen.binfood',
      refilledBy: 'kitchen.bin',
    },
  ],

  footholds: [
    {
      id: 'kitchen.undersink',
      region: 'kitchen',
      surface: 'kitchen.floor',
      at: { x: mm(1760), z: mm(NORTH_FACE - 52) },
      role: 'home',
      labelKey: 'foothold.kitchen.undersink',
      descriptionKey: 'foothold.kitchen.undersink.desc',
      capacity: 9,
      concealment: 0.92,
      cost: { food: 0, moisture: 0, workers: 0 },
      initial: true,
    },
    {
      id: 'kitchen.fridgeback',
      region: 'kitchen',
      surface: 'kitchen.floor',
      at: { x: mm(360), z: mm(FRIDGE_Z0 + FRIDGE_D + 90) },
      role: 'satellite',
      labelKey: 'foothold.kitchen.fridgeback',
      descriptionKey: 'foothold.kitchen.fridgeback.desc',
      capacity: 6,
      concealment: 0.74,
      cost: { food: 22, moisture: 14, workers: 2 },
    },
    {
      id: 'kitchen.cornerseam',
      region: 'kitchen',
      surface: 'kitchen.floor',
      at: { x: mm(EAST_FACE - 55), z: mm(-1620) },
      role: 'relay',
      labelKey: 'foothold.kitchen.cornerseam',
      descriptionKey: 'foothold.kitchen.cornerseam.desc',
      capacity: 3,
      concealment: 0.6,
      cost: { food: 16, moisture: 10, workers: 1 },
    },
    {
      /*
       * The void inside the table's leg bracket.
       *
       * The dining half of the room needed a home of its own. Without one, every table route runs
       * all the way back to the sink and the colony can never actually hold this end of the kitchen
       * — which is what the victory condition asks of it.
       */
      id: 'kitchen.tableleg',
      region: 'kitchen',
      surface: 'kitchen.floor',
      at: { x: mm(TABLE_X1 - 80), z: mm(TABLE_Z0 + 80) },
      role: 'satellite',
      labelKey: 'foothold.kitchen.tableleg',
      descriptionKey: 'foothold.kitchen.tableleg.desc',
      capacity: 7,
      concealment: 0.74,
      cost: { food: 14, moisture: 10, workers: 3 },
    },
  ],

  walls: [
    // North (-Z, nearest the camera) — cut to a stub by house.ts.
    { from: { x: mm(X0), z: mm(Z0) }, to: { x: mm(X1), z: mm(Z0) }, outward: { x: 0, z: -1 } },
    // West — also near the camera.
    { from: { x: mm(X0), z: mm(Z0) }, to: { x: mm(X0), z: mm(Z1) }, outward: { x: -1, z: 0 } },
    // East — full height, with the window over the counter. This is the room's visual backing.
    {
      from: { x: mm(X1), z: mm(Z0) },
      to: { x: mm(X1), z: mm(Z1) },
      outward: { x: 1, z: 0 },
      openings: [{ start: mm(300), width: mm(1100), height: mm(1150), sill: mm(1050) }],
    },
    // South — the partition onto the hallway, with the kitchen doorway at its east end.
    {
      from: { x: mm(X0), z: mm(Z1) },
      to: { x: mm(X1), z: mm(Z1) },
      outward: { x: 0, z: 1 },
      openings: [{ start: mm(2900), width: mm(800), height: mm(2050) }],
    },
  ],

  props: [
    {
      kind: 'kitchen.baseRun',
      at: { x: mm(X0), y: 0, z: mm(Z0) },
      options: { lengthMm: X1 - X0, depthMm: COUNTER_DEPTH, axis: 'x' },
      /*
       * Under the 225-degree yaw this run normally BACKS the room rather than fronting it, so it
       * fades rarely — but the scout spends most of chapter 1 in the toe-kick recess directly in
       * front of it, and from there it does block. Deregistering it after the yaw flip left the
       * scout 88 % swallowed by an unfaded slab in four of eight evidence frames.
       *
       * The floor is HIGH on purpose. Alpha hashing drops pixels stochastically, so coverage is
       * literally the fraction kept, and a large object at 0.4 reads as television static across a
       * third of the frame at 1280x720. A cabinet run only has to become see-through enough to
       * find a 35 mm insect behind it; 0.68 does that while staying legible as a solid object.
       */
      occluder: true,
      fadeFloor: 0.44,
    },
    {
      kind: 'kitchen.baseRun',
      at: { x: mm(EAST_FACE), y: 0, z: mm(NORTH_FACE) },
      options: { lengthMm: EAST_RUN_Z1 - NORTH_FACE, depthMm: COUNTER_DEPTH, axis: 'z' },
      occluder: true,
      fadeFloor: 0.44,
    },
    {
      kind: 'kitchen.worktop',
      at: { x: mm(X0), y: mm(COUNTER_H), z: mm(Z0) },
      options: { lengthMm: X1 - X0, depthMm: COUNTER_DEPTH, axis: 'x' },
      occluder: true,
      fadeFloor: 0.44,
    },
    {
      kind: 'kitchen.worktop',
      at: { x: mm(EAST_FACE), y: mm(COUNTER_H), z: mm(NORTH_FACE) },
      options: { lengthMm: EAST_RUN_Z1 - NORTH_FACE, depthMm: COUNTER_DEPTH, axis: 'z' },
      occluder: true,
      fadeFloor: 0.44,
    },
    {
      kind: 'kitchen.splashback',
      at: { x: mm(X0), y: mm(COUNTER_H), z: mm(Z0) },
      options: { lengthMm: X1 - X0, axis: 'x' },
    },
    {
      kind: 'kitchen.wallUnits',
      at: { x: mm(X0), y: mm(1480), z: mm(Z0) },
      options: { lengthMm: 2400 },
      occluder: true,
      fadeFloor: 0.3,
    },
    { kind: 'kitchen.sink', at: { x: mm(1750), y: mm(COUNTER_H), z: mm(Z0 + 330) } },
    { kind: 'kitchen.tap', at: { x: mm(1750), y: mm(COUNTER_H), z: mm(Z0 + 120) } },
    {
      kind: 'kitchen.dishRack',
      at: { x: mm(900), y: mm(COUNTER_H), z: mm(Z0 + 300) },
      occluder: true,
    },
    { kind: 'kitchen.sponge', at: { x: mm(1620), y: mm(COUNTER_H), z: mm(-2960) } },
    {
      kind: 'kitchen.detergent',
      at: { x: mm(2160), y: mm(COUNTER_H), z: mm(-3060) },
      occluder: true,
    },
    {
      kind: 'kitchen.riceCooker',
      at: { x: mm(2910), y: mm(COUNTER_H), z: mm(-2960) },
      occluder: true,
    },
    {
      kind: 'kitchen.kettle',
      at: { x: mm(3460), y: mm(COUNTER_H), z: mm(-2200) },
      rotY: 0.4,
      occluder: true,
    },
    {
      kind: 'kitchen.cuttingBoard',
      at: { x: mm(3440), y: mm(COUNTER_H), z: mm(-2760) },
      rotY: -0.2,
    },
    {
      kind: 'kitchen.bowlStack',
      at: { x: mm(560), y: mm(COUNTER_H), z: mm(-3020) },
      occluder: true,
    },
    {
      kind: 'kitchen.fridge',
      at: { x: mm(X0 + FRIDGE_W / 2), y: 0, z: mm(FRIDGE_Z0 + FRIDGE_D / 2) },
      occluder: true,
      fadeFloor: 0.26,
    },
    { kind: 'kitchen.wasteBin', at: { x: mm(3400), y: 0, z: mm(-860) }, occluder: true },
    {
      kind: 'kitchen.recycling',
      at: { x: mm(2810), y: 0, z: mm(-710) },
      rotY: 0.3,
      occluder: true,
    },
    {
      kind: 'kitchen.cableDrop',
      at: { x: mm(2960), y: 0, z: mm(NORTH_FACE - 18) },
      options: { topMm: COUNTER_H },
    },
    {
      kind: 'kitchen.crumbField',
      at: { x: mm(1500), y: 0, z: mm(NORTH_FACE - 50) },
      options: { seed: 11, radiusMm: 180 },
    },
    {
      kind: 'kitchen.crumbField',
      at: { x: mm(760), y: 0, z: mm(-1900) },
      options: { seed: 27, radiusMm: 150 },
    },
    {
      kind: 'kitchen.riceSpill',
      at: { x: mm(2500), y: mm(COUNTER_H), z: mm(-2950) },
      options: { seed: 5 },
    },
    {
      kind: 'kitchen.puddle',
      at: { x: mm(1980), y: 0, z: mm(NORTH_FACE - 55) },
      options: { radiusMm: 110 },
    },
    {
      kind: 'kitchen.diningTable',
      at: { x: mm((TABLE_X0 + TABLE_X1) / 2), y: 0, z: mm((TABLE_Z0 + TABLE_Z1) / 2) },
      options: { widthMm: TABLE_X1 - TABLE_X0, depthMm: TABLE_Z1 - TABLE_Z0, heightMm: TABLE_H },
      occluder: true,
      fadeFloor: 0.4,
    },
    {
      kind: 'kitchen.chair',
      at: { x: mm(CHAIR_X), y: 0, z: mm(CHAIR_Z) },
      options: { seatMm: CHAIR_H },
      occluder: true,
      fadeFloor: 0.36,
    },
    {
      // A second chair, pushed in on the far side. It is scenery: no surface, no climb.
      kind: 'kitchen.chair',
      at: { x: mm(TABLE_X0 + 340), y: 0, z: mm(TABLE_Z0 - 190) },
      options: { seatMm: CHAIR_H },
      occluder: true,
      fadeFloor: 0.36,
    },
  ],

  lights: [
    {
      // Night moonlight through the window over the counter: the room's only standing light.
      kind: 'rect',
      at: { x: mm(X1 - 40), y: mm(1620), z: mm(Z0 + 850) },
      colour: 0x9fb4d8,
      intensity: 1.5,
      width: mm(1100),
      height: mm(1150),
    },
    {
      // Under-cabinet strip. Only on while somebody is at the sink.
      kind: 'rect',
      at: { x: mm(1900), y: mm(1440), z: mm(Z0 + 300) },
      colour: 0xffd7a0,
      intensity: 4.2,
      width: mm(2400),
      height: mm(90),
      routine: 'kitchen.dishes',
    },
    {
      kind: 'point',
      at: { x: mm(360), y: mm(320), z: mm(-1500) },
      colour: 0x6a89b8,
      intensity: 0.7,
      distance: mm(900),
    },
    {
      /*
       * Light borrowed from the hallway, through the kitchen doorway.
       *
       * The room had three authored lights: a window on the east wall, an under-cabinet strip gated
       * behind the dishes routine, and a 0.7-intensity glow at the fridge. So with no routine
       * running, everything from about x = 700 to x = 3000 across the middle of the floor had NO
       * authored light reaching it — which is exactly where the dining table now stands, and why
       * captured frames of that half of the room measured 79 % black. §7 bans uniform darkness by
       * name.
       *
       * The evidence that this is a missing light rather than a dark room by design is in this
       * file: `exposureZones` puts the open middle floor at 0.72 with the comment "the doorway light
       * lands here". The simulation has been charging the player for standing in a light the
       * renderer never drew. That is the worst kind of unfairness — being seen in what looks like
       * cover — and it was authored as a contradiction rather than introduced as a bug.
       *
       * Modest, because it is spill and not a fitting. A `rect` aims at the room centre by
       * construction, so the falloff runs the length of the floor the way light through a doorway
       * actually does.
       */
      kind: 'rect',
      at: { x: mm(3050), y: mm(1500), z: mm(Z1 - 30) },
      colour: 0xe8d9bc,
      /*
       * Swept, not chosen. Frame mean luminance and near-black fraction of the same seed and camera:
       *
       *   none   mean 41.6 %   near-black 3.56 %   <- the shipped state, §7's banned darkness
       *   1.35   mean 74.7 %   near-black 0 %      <- flat warm beige, reads as daylight
       *   0.33   mean 57.0 %   near-black 0 %
       *   0.20   mean 52.2 %   near-black 0 %      <- adopted
       *
       * Spill through a doorway is a fraction of the window it competes with (1.5), not a match for
       * it. The first attempt at 1.35 stopped the cabinets being dark objects at all, which trades
       * one §7 violation for another.
       */
      intensity: 0.2,
      width: mm(820),
      height: mm(1900),
    },
  ],

  exposureZones: [
    // Open floor in the middle of the room: nothing to hide under, and the doorway light lands here.
    {
      surface: 'kitchen.floor',
      rect: { x0: mm(700), z0: mm(-2400), x1: mm(3100), z1: mm(-400) },
      level: 0.72,
    },
    // Directly under the window.
    {
      surface: 'kitchen.counter',
      rect: { x0: mm(2900), z0: mm(Z0), x1: mm(X1), z1: mm(-1900) },
      level: 0.9,
    },
    {
      surface: 'kitchen.counter',
      rect: { x0: mm(X0), z0: mm(Z0), x1: mm(2900), z1: mm(-2640) },
      level: 0.55,
    },
    // The sink is floodlit whenever the dishes are being done.
    {
      surface: 'kitchen.counter',
      rect: { x0: mm(700), z0: mm(Z0), x1: mm(2700), z1: mm(-2640) },
      level: 1,
      routine: 'kitchen.dishes',
    },
  ],
};

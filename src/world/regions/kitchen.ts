import { mm } from '../units';
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
      exposure: 1.5,
      labelKey: 'surface.kitchen.counter',
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
    { surface: 'kitchen.floor', rect: { x0: mm(3180), z0: mm(-1080), x1: mm(3620), z1: mm(-640) } },
    { surface: 'kitchen.floor', rect: { x0: mm(2560), z0: mm(-900), x1: mm(3060), z1: mm(-520) } },
    // On the worktop: the rice cooker body is solid to a cockroach.
    {
      surface: 'kitchen.counter',
      rect: { x0: mm(2660), z0: mm(-3160), x1: mm(3160), z1: mm(-2760) },
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
      // Where the two runs meet, the carcasses do not quite close. Wider, slower, hidden.
      id: 'kitchen.seam.corner',
      from: 'kitchen.floor',
      to: 'kitchen.counter',
      at: { x: mm(EAST_FACE - 40), z: mm(NORTH_FACE - 40) },
      seconds: 3.4,
      capacity: 2,
      kind: 'seam',
      labelKey: 'link.kitchen.seam',
    },
  ],

  resources: [
    {
      id: 'kitchen.crumbs.toekick',
      region: 'kitchen',
      surface: 'kitchen.floor',
      at: { x: mm(1500), z: mm(NORTH_FACE - 50) },
      kind: 'food',
      amount: 46,
      rate: 1.5,
      disturbance: 0.02,
      labelKey: 'resource.kitchen.crumbs',
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
      refilledBy: 'kitchen.dishes',
    },
    {
      id: 'kitchen.fridge.seal',
      region: 'kitchen',
      surface: 'kitchen.floor',
      at: { x: mm(760), z: mm(-1900) },
      kind: 'food',
      amount: 38,
      rate: 1.2,
      disturbance: 0.05,
      labelKey: 'resource.kitchen.fridgeseal',
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
      refilledBy: 'kitchen.dinner',
    },
    {
      id: 'kitchen.sponge',
      region: 'kitchen',
      surface: 'kitchen.counter',
      at: { x: mm(1620), z: mm(-2960) },
      kind: 'moisture',
      amount: 52,
      rate: 1.8,
      disturbance: 0.09,
      labelKey: 'resource.kitchen.sponge',
      refilledBy: 'kitchen.dishes',
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
      refilledBy: 'kitchen.dinner',
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
      // Under the 225-degree yaw this run normally BACKS the room rather than fronting it, so it
      // fades rarely — but the scout spends most of chapter 1 in the toe-kick recess directly in
      // front of it, and from there it does block. Deregistering it after the yaw flip left the
      // scout 88 % swallowed by an unfaded slab in four of eight evidence frames.
      occluder: true,
      fadeFloor: 0.4,
    },
    {
      kind: 'kitchen.baseRun',
      at: { x: mm(EAST_FACE), y: 0, z: mm(NORTH_FACE) },
      options: { lengthMm: EAST_RUN_Z1 - NORTH_FACE, depthMm: COUNTER_DEPTH, axis: 'z' },
      occluder: true,
      fadeFloor: 0.4,
    },
    {
      kind: 'kitchen.worktop',
      at: { x: mm(X0), y: mm(COUNTER_H), z: mm(Z0) },
      options: { lengthMm: X1 - X0, depthMm: COUNTER_DEPTH, axis: 'x' },
      occluder: true,
      fadeFloor: 0.4,
    },
    {
      kind: 'kitchen.worktop',
      at: { x: mm(EAST_FACE), y: mm(COUNTER_H), z: mm(NORTH_FACE) },
      options: { lengthMm: EAST_RUN_Z1 - NORTH_FACE, depthMm: COUNTER_DEPTH, axis: 'z' },
      occluder: true,
      fadeFloor: 0.4,
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

import { mm } from '../units';
import type { RegionSpec } from '../types';

/**
 * Chapter 4 — the bedroom.
 *
 * The one region with a human in it for the whole chapter. Everything here is authored against that
 * single fact: there are exactly two food sources and two moisture sources, all four are within
 * reach of a sleeping arm, and every one of them costs real evidence to touch. The colony cannot
 * live off this room. It comes here to take the bed-head void, and it survives on the pheromone
 * network built in the kitchen, hallway and living room.
 *
 * The layout is a real Korean bedroom read at 35 mm: a low double bed with its head against the
 * far wall, a wardrobe with a 60 mm skirt gap, clothes on the floor, and a doorway that leaks
 * hallway light across the only direct route.
 *
 * The gameplay is in the gaps, not the furniture:
 *   - 90 mm behind the headboard  -> the chapter objective foothold
 *   - 60 mm under the wardrobe    -> the only genuinely safe place in the room
 *   - 100 mm between the bedside table and the bed rail -> the reliable way onto the mattress
 *   - the open foot end of the bed frame -> the only way into the dark under-bed run
 */

/* Room envelope, mm. The camera looks toward +X and +Z: the north (-Z) and west (-X) walls stand
 * between the viewer and the room and are cut to stubs, so the bed, the window and the wardrobe
 * doors are placed to read against the east (+X) and south (+Z) backing walls. */
const X0 = 5200;
const X1 = 9600;
const Z0 = -3500;
const Z1 = -300;

/** Low Korean double frame: 1400 x 2000, mattress top at 520, 80 mm rails, 80 mm headboard. */
const BED_LENGTH = 2000;
const BED_WIDTH = 1400;
const MATTRESS_H = 520;
const RAIL = 80;
const HEADBOARD_T = 80;

/** The gap nobody ever vacuums. This strip is the chapter objective. */
const BED_HEAD_GAP = 90;
const BED_X1 = X1 - BED_HEAD_GAP; // 9510
const BED_X0 = BED_X1 - BED_LENGTH; // 7510
const BED_Z0 = -2200;
const BED_Z1 = BED_Z0 + BED_WIDTH; // -800

/** Wardrobe: 2200 wide, 600 deep, against the near wall. Its face is at z = WARDROBE_FACE. */
const WARDROBE_X0 = 5300;
const WARDROBE_X1 = 7500;
const WARDROBE_FACE = -2900;
const WARDROBE_SKIRT = 60;
const WARDROBE_CARCASS = WARDROBE_FACE - WARDROBE_SKIRT; // -2960

/** Bedside table, 550 x 500 x 560, tucked into the corner under the window. */
const BEDSIDE_X0 = 8950;
const BEDSIDE_X1 = 9500;
const BEDSIDE_Z0 = -2800;
const BEDSIDE_Z1 = -2300;
const BEDSIDE_H = 560;

/** Window in the east (backing) wall, with a 150 mm sill the curtain hem reaches. */
const WINDOW_Z0 = -3400;
const WINDOW_W = 1000;
const SILL_H = 800;
const WINDOW_H = 1300;
const SILL_DEPTH = 150;
const SILL_X0 = X1 - SILL_DEPTH; // 9450

/** Doorway onto the hallway, in the south (backing) wall. */
const DOOR_X0 = 5400;
const DOOR_W = 800;

export const BEDROOM: RegionSpec = {
  id: 'bedroom',
  labelKey: 'region.bedroom',
  bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },

  surfaces: [
    {
      id: 'bedroom.floor',
      region: 'bedroom',
      y: 0,
      bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },
      // Slightly under 1: the room is dark and the door is nearly shut. The danger here is not
      // being seen from across the room, it is being felt by the person you are standing on.
      exposure: 0.95,
      labelKey: 'surface.bedroom.floor',
    },
    {
      // The highest-risk walkable plane in the game. Two metres of it, and a body on it.
      id: 'bedroom.bed',
      region: 'bedroom',
      y: mm(MATTRESS_H),
      bounds: { x0: mm(BED_X0), z0: mm(BED_Z0), x1: mm(BED_X1), z1: mm(BED_Z1) },
      exposure: 2.2,
      labelKey: 'surface.bedroom.bed',
    },
    {
      // Everything worth taking in this region is on this 550 x 500 rectangle, 40 mm below the
      // mattress and directly under the lamp.
      id: 'bedroom.bedside',
      region: 'bedroom',
      y: mm(BEDSIDE_H),
      bounds: { x0: mm(BEDSIDE_X0), z0: mm(BEDSIDE_Z0), x1: mm(BEDSIDE_X1), z1: mm(BEDSIDE_Z1) },
      exposure: 1.7,
      labelKey: 'surface.bedroom.bedside',
    },
    {
      // A 150 mm ledge. Nothing hides on it, but it is the far end of the room from the pillow.
      id: 'bedroom.sill',
      region: 'bedroom',
      y: mm(SILL_H),
      bounds: { x0: mm(SILL_X0), z0: mm(WINDOW_Z0), x1: mm(X1), z1: mm(WINDOW_Z0 + WINDOW_W) },
      exposure: 1.4,
      labelKey: 'surface.bedroom.sill',
    },
  ],

  blockers: [
    // Wardrobe carcass. The 60 mm strip in front of it (WARDROBE_CARCASS .. WARDROBE_FACE) is
    // deliberately left open: that slot is the region's safest foothold.
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(WARDROBE_X0), z0: mm(Z0), x1: mm(WARDROBE_X1), z1: mm(WARDROBE_CARCASS) },
    },
    // Bed frame: north rail, south rail, headboard. The FOOT end is left unblocked on purpose —
    // it is the single entrance to the under-bed run, and it is 2000 mm from the pillow.
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(BED_X0), z0: mm(BED_Z0), x1: mm(BED_X1), z1: mm(BED_Z0 + RAIL) },
    },
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(BED_X0), z0: mm(BED_Z1 - RAIL), x1: mm(BED_X1), z1: mm(BED_Z1) },
    },
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(BED_X1 - HEADBOARD_T), z0: mm(BED_Z0), x1: mm(BED_X1), z1: mm(BED_Z1) },
    },
    // Bedside table. Stops 100 mm short of the east wall, so the perimeter walk survives.
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(BEDSIDE_X0), z0: mm(BEDSIDE_Z0), x1: mm(BEDSIDE_X1), z1: mm(BEDSIDE_Z1) },
    },
    // Laundry basket by the door, pulled 60 mm off the wall the way real ones always are.
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(6720), z0: mm(-740), x1: mm(7180), z1: mm(-360) },
    },
    { surface: 'bedroom.floor', rect: { x0: mm(5900), z0: mm(-1000), x1: mm(6180), z1: mm(-720) } },
    { surface: 'bedroom.floor', rect: { x0: mm(8700), z0: mm(-700), x1: mm(8960), z1: mm(-440) } },
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(7620), z0: mm(-2480), x1: mm(7920), z1: mm(-2260) },
    },
    // Full-length mirror leaning on the near wall — thin, so no gap behind it is authored.
    { surface: 'bedroom.floor', rect: { x0: mm(X0), z0: mm(-1800), x1: mm(5290), z1: mm(-1150) } },

    // On the mattress: the sleeper under the duvet, and the pillows. The walkable remainder is a
    // 250-390 mm perimeter strip. Crossing the bed means edging around a breathing obstacle.
    { surface: 'bedroom.bed', rect: { x0: mm(7900), z0: mm(-1900), x1: mm(9150), z1: mm(-1050) } },
    { surface: 'bedroom.bed', rect: { x0: mm(9150), z0: mm(-2080), x1: mm(9420), z1: mm(-920) } },

    // On the bedside table: lamp base and tissue box. The water glass is NOT blocked — a cockroach
    // can climb it, which is exactly how a cockroach ends up in a glass of water.
    {
      surface: 'bedroom.bedside',
      rect: { x0: mm(9300), z0: mm(-2760), x1: mm(9480), z1: mm(-2580) },
    },
    {
      surface: 'bedroom.bedside',
      rect: { x0: mm(8970), z0: mm(-2770), x1: mm(9200), z1: mm(-2620) },
    },
  ],

  links: [
    {
      // The phone charging cable, hanging off the front corner of the table to the power strip.
      // One body at a time, and it lands under the lamp. Reliable, narrow, and lit.
      id: 'bedroom.cable.phone',
      from: 'bedroom.floor',
      to: 'bedroom.bedside',
      at: { x: mm(9430), z: mm(-2280) },
      exitAt: { x: mm(9430), z: mm(-2340) },
      seconds: 2.8,
      capacity: 1,
      kind: 'cable',
      labelKey: 'link.bedroom.cable',
    },
    {
      // The duvet edge hanging off the south rail to the floor. Wide and fast for two bodies.
      //
      // UNRELIABLE BY DESIGN: the sleeper moves. This is a piece of bedding, not a fixture — it
      // gets dragged up, kicked off, and rolled onto during the night, so a route that depends on
      // it will stall mid-chapter with workers stranded on the mattress. The cable/table pair is
      // the boring alternative that always works and always costs exposure.
      id: 'bedroom.fabric.duvet',
      from: 'bedroom.floor',
      to: 'bedroom.bed',
      at: { x: mm(8500), z: mm(-760) },
      exitAt: { x: mm(8500), z: mm(-860) },
      seconds: 3.6,
      capacity: 2,
      kind: 'fabric',
      labelKey: 'link.bedroom.duvet',
    },
    {
      // The 100 mm slot between the table edge and the bed rail, with a 40 mm step up. Short, but
      // it is the most-watched square in the region.
      id: 'bedroom.gap.bedsidestep',
      from: 'bedroom.bedside',
      to: 'bedroom.bed',
      at: { x: mm(9200), z: mm(-2320) },
      exitAt: { x: mm(9200), z: mm(-2160) },
      seconds: 1.6,
      capacity: 2,
      kind: 'gap',
      labelKey: 'link.bedroom.bedsidestep',
    },
    {
      // Curtain hem to the sill. Slow, single file, and it ends in the one patch of moonlight —
      // but it is the only route in the room that never passes within reach of the bed.
      id: 'bedroom.fabric.curtain',
      from: 'bedroom.floor',
      to: 'bedroom.sill',
      at: { x: mm(9540), z: mm(-3100) },
      seconds: 4.2,
      capacity: 1,
      kind: 'fabric',
      labelKey: 'link.bedroom.curtain',
    },
  ],

  /* Four sources, total. Every one of them is loud, because being noticed in an occupied room is
   * not an alert step — it is the end of the run. The bedroom is not a place to earn resources; it
   * is a place to spend the ones the first three regions already produced. */
  resources: [
    {
      // Crumbs from eating in bed, worked into the floor under it. Must be scouted for: the only
      // way to see it is to go under the bed.
      id: 'bedroom.crumbs.underbed',
      region: 'bedroom',
      surface: 'bedroom.floor',
      at: { x: mm(7660), z: mm(-1500) },
      kind: 'food',
      amount: 34,
      rate: 1.1,
      disturbance: 0.27,
      labelKey: 'resource.bedroom.crumbs',
      hidden: true,
    },
    {
      // Snack residue on the bedside table. The richest food here and still smaller than a kitchen
      // crumb field, and it is 300 mm from a face.
      id: 'bedroom.snack.bedside',
      region: 'bedroom',
      surface: 'bedroom.bedside',
      at: { x: mm(9010), z: mm(-2390) },
      kind: 'food',
      amount: 41,
      rate: 1.3,
      disturbance: 0.34,
      labelKey: 'resource.bedroom.snack',
      refilledBy: 'bedroom.bedtime',
    },
    {
      // The water glass. The single best moisture source in the region, refilled every night, and
      // the one object the sleeper reaches for in the dark without looking.
      id: 'bedroom.glass.water',
      region: 'bedroom',
      surface: 'bedroom.bedside',
      at: { x: mm(9130), z: mm(-2450) },
      kind: 'moisture',
      amount: 52,
      rate: 1.6,
      disturbance: 0.31,
      labelKey: 'resource.bedroom.glass',
      refilledBy: 'bedroom.bedtime',
    },
    {
      // Condensation on the cold sill. Thin, slow, and only reachable up the curtain — but it is
      // the one source that does not require standing beside the bed.
      id: 'bedroom.condensation.sill',
      region: 'bedroom',
      surface: 'bedroom.sill',
      at: { x: mm(9530), z: mm(-2950) },
      kind: 'moisture',
      amount: 33,
      rate: 1.0,
      disturbance: 0.25,
      labelKey: 'resource.bedroom.condensation',
    },
  ],

  footholds: [
    {
      // 60 mm of unswept dark under a two-metre wardrobe, on the far side of the room from the
      // pillow. The safest square in the region and the obvious first claim.
      id: 'bedroom.wardrobe.skirt',
      region: 'bedroom',
      surface: 'bedroom.floor',
      at: { x: mm(6400), z: mm(WARDROBE_FACE - WARDROBE_SKIRT / 2) },
      role: 'satellite',
      labelKey: 'foothold.bedroom.wardrobeskirt',
      descriptionKey: 'foothold.bedroom.wardrobeskirt.desc',
      capacity: 7,
      concealment: 0.9,
      cost: { food: 30, moisture: 20, workers: 3 },
    },
    {
      // The chapter objective: the 90 mm slot between the headboard and the wall, directly behind
      // a sleeping head. Smaller and worse-hidden than the wardrobe, and the whole point of the
      // room — a colony that holds this holds the last unoccupied volume in the apartment.
      id: 'bedroom.bedhead.void',
      region: 'bedroom',
      surface: 'bedroom.floor',
      at: { x: mm(X1 - BED_HEAD_GAP / 2), z: mm(-1500) },
      role: 'satellite',
      labelKey: 'foothold.bedroom.bedhead',
      descriptionKey: 'foothold.bedroom.bedhead.desc',
      capacity: 5,
      concealment: 0.82,
      cost: { food: 44, moisture: 28, workers: 4 },
    },
    {
      // Behind the door architrave. Poor cover, tiny capacity, and it is the only thing joining
      // this region to the hallway network — without it nothing else here can be supplied.
      id: 'bedroom.architrave.relay',
      region: 'bedroom',
      surface: 'bedroom.floor',
      at: { x: mm(DOOR_X0 + 30), z: mm(-370) },
      role: 'relay',
      labelKey: 'foothold.bedroom.architrave',
      descriptionKey: 'foothold.bedroom.architrave.desc',
      capacity: 3,
      concealment: 0.52,
      cost: { food: 18, moisture: 12, workers: 2 },
    },
  ],

  walls: [
    // North (-Z, nearest the camera) — cut to a stub.
    { from: { x: mm(X0), z: mm(Z0) }, to: { x: mm(X1), z: mm(Z0) }, outward: { x: 0, z: -1 } },
    // West — also near the camera.
    { from: { x: mm(X0), z: mm(Z0) }, to: { x: mm(X0), z: mm(Z1) }, outward: { x: -1, z: 0 } },
    // East — full height, exterior, and the room's visual backing: bed head, window, sill.
    {
      from: { x: mm(X1), z: mm(Z0) },
      to: { x: mm(X1), z: mm(Z1) },
      outward: { x: 1, z: 0 },
      openings: [
        {
          start: mm(WINDOW_Z0 - Z0),
          width: mm(WINDOW_W),
          height: mm(WINDOW_H),
          sill: mm(SILL_H),
        },
      ],
    },
    // South — the partition onto the hallway, doorway at its west end.
    {
      from: { x: mm(X0), z: mm(Z1) },
      to: { x: mm(X1), z: mm(Z1) },
      outward: { x: 0, z: 1 },
      openings: [{ start: mm(DOOR_X0 - X0), width: mm(DOOR_W), height: mm(2050) }],
    },
  ],

  props: [
    {
      // Nearest large mass in the room, so it is the hardest-working occluder here.
      kind: 'bedroom.wardrobe',
      at: { x: mm((WARDROBE_X0 + WARDROBE_X1) / 2), y: 0, z: mm((Z0 + WARDROBE_FACE) / 2) },
      options: { widthMm: WARDROBE_X1 - WARDROBE_X0, depthMm: 600, heightMm: 2200, skirtMm: 60 },
      occluder: true,
      fadeFloor: 0.2,
    },
    {
      kind: 'bedroom.bedFrame',
      at: { x: mm((BED_X0 + BED_X1) / 2), y: 0, z: mm((BED_Z0 + BED_Z1) / 2) },
      options: { lengthMm: BED_LENGTH, widthMm: BED_WIDTH, topMm: MATTRESS_H, railMm: RAIL },
      occluder: true,
      fadeFloor: 0.26,
    },
    {
      kind: 'bedroom.mattress',
      at: { x: mm((BED_X0 + BED_X1) / 2), y: mm(MATTRESS_H), z: mm((BED_Z0 + BED_Z1) / 2) },
      options: { lengthMm: BED_LENGTH - 2 * RAIL, widthMm: BED_WIDTH - 2 * RAIL },
    },
    {
      // Fades the bed-head void, which is the foothold the player is trying to reach.
      kind: 'bedroom.headboard',
      at: { x: mm(BED_X1 - HEADBOARD_T / 2), y: 0, z: mm((BED_Z0 + BED_Z1) / 2) },
      options: { widthMm: BED_WIDTH, heightMm: 620 },
      occluder: true,
      fadeFloor: 0.24,
    },
    {
      kind: 'bedroom.duvet',
      at: { x: mm(8500), y: mm(MATTRESS_H), z: mm(-1480) },
      options: { seed: 4, hemMm: MATTRESS_H },
      occluder: true,
      fadeFloor: 0.32,
    },
    {
      // The reason the chapter is hard. Present, breathing, and 40 body-lengths long.
      kind: 'bedroom.sleeperForm',
      at: { x: mm(8560), y: mm(MATTRESS_H), z: mm(-1480) },
      occluder: true,
      fadeFloor: 0.3,
    },
    { kind: 'bedroom.pillow', at: { x: mm(9285), y: mm(MATTRESS_H), z: mm(-1800) }, rotY: 0.05 },
    { kind: 'bedroom.pillow', at: { x: mm(9285), y: mm(MATTRESS_H), z: mm(-1180) }, rotY: -0.08 },
    {
      kind: 'bedroom.bedsideTable',
      at: { x: mm((BEDSIDE_X0 + BEDSIDE_X1) / 2), y: 0, z: mm((BEDSIDE_Z0 + BEDSIDE_Z1) / 2) },
      options: { widthMm: 550, depthMm: 500, heightMm: BEDSIDE_H },
      occluder: true,
      fadeFloor: 0.28,
    },
    {
      kind: 'bedroom.bedsideLamp',
      at: { x: mm(9390), y: mm(BEDSIDE_H), z: mm(-2670) },
      occluder: true,
      fadeFloor: 0.34,
    },
    {
      // Glass, so it fades to a rim rather than vanishing; a worker inside it must stay visible.
      kind: 'bedroom.waterGlass',
      at: { x: mm(9130), y: mm(BEDSIDE_H), z: mm(-2450) },
      occluder: true,
      fadeFloor: 0.45,
    },
    {
      kind: 'bedroom.tissueBox',
      at: { x: mm(9085), y: mm(BEDSIDE_H), z: mm(-2695) },
      rotY: -0.12,
      occluder: true,
      fadeFloor: 0.3,
    },
    { kind: 'bedroom.phone', at: { x: mm(9365), y: mm(BEDSIDE_H), z: mm(-2440) }, rotY: 0.25 },
    {
      // The visible object the cable link is made of. Runs table edge to the power strip.
      kind: 'bedroom.chargerCable',
      at: { x: mm(9430), y: 0, z: mm(-2288) },
      options: { topMm: BEDSIDE_H, slackMm: 140 },
    },
    { kind: 'bedroom.powerStrip', at: { x: mm(9480), y: 0, z: mm(-2180) }, rotY: -0.08 },
    {
      kind: 'bedroom.snackWrapper',
      at: { x: mm(9010), y: mm(BEDSIDE_H), z: mm(-2390) },
      options: { seed: 7 },
    },
    {
      kind: 'bedroom.readingGlasses',
      at: { x: mm(8995), y: mm(BEDSIDE_H), z: mm(-2545) },
      rotY: 0.6,
    },
    {
      kind: 'bedroom.window',
      at: { x: mm(X1), y: mm(SILL_H), z: mm(WINDOW_Z0) },
      options: { widthMm: WINDOW_W, heightMm: WINDOW_H, axis: 'z' },
    },
    {
      kind: 'bedroom.windowSill',
      at: { x: mm(SILL_X0), y: mm(SILL_H), z: mm(WINDOW_Z0) },
      options: { lengthMm: WINDOW_W, depthMm: SILL_DEPTH, axis: 'z' },
    },
    // Curtain and rail sit at the far edge of the room, so they never occlude the scout.
    {
      kind: 'bedroom.curtain',
      at: { x: mm(9560), y: mm(2180), z: mm(WINDOW_Z0 + WINDOW_W / 2) },
      options: { widthMm: 1300, dropMm: 2180, seed: 9 },
    },
    {
      kind: 'bedroom.curtainRail',
      at: { x: mm(9560), y: mm(2200), z: mm(WINDOW_Z0 + WINDOW_W / 2) },
      options: { lengthMm: 1400, axis: 'z' },
    },
    {
      kind: 'bedroom.condensation',
      at: { x: mm(9530), y: mm(SILL_H), z: mm(-2950) },
      options: { radiusMm: 90, seed: 23 },
    },
    {
      // Left ajar: it is what lets the hallway light in, and what the player hears close.
      kind: 'bedroom.doorLeaf',
      at: { x: mm(DOOR_X0 + 40), y: 0, z: mm(Z1) },
      rotY: -1.05,
      options: { widthMm: DOOR_W, heightMm: 2050 },
      occluder: true,
      fadeFloor: 0.34,
    },
    {
      kind: 'bedroom.architrave',
      at: { x: mm(DOOR_X0 + DOOR_W / 2), y: 0, z: mm(Z1) },
      options: { widthMm: DOOR_W, heightMm: 2050 },
    },
    // Floor textiles. These are cover, not decoration — see exposureZones.
    { kind: 'bedroom.slippers', at: { x: mm(6080), y: 0, z: mm(-810) }, rotY: 0.35 },
    {
      kind: 'bedroom.shirtOnFloor',
      at: { x: mm(6700), y: 0, z: mm(-1390) },
      rotY: -0.5,
      options: { seed: 3, spreadMm: 560 },
    },
    {
      kind: 'bedroom.trousersOnFloor',
      at: { x: mm(5980), y: 0, z: mm(-2100) },
      rotY: 0.9,
      options: { seed: 12, spreadMm: 520 },
    },
    { kind: 'bedroom.sockPair', at: { x: mm(7280), y: 0, z: mm(-2680) }, rotY: 0.2 },
    {
      kind: 'bedroom.laundryBasket',
      at: { x: mm(6950), y: 0, z: mm(-550) },
      rotY: 0.1,
      occluder: true,
      fadeFloor: 0.3,
    },
    {
      kind: 'bedroom.laundryPile',
      at: { x: mm(6560), y: 0, z: mm(-800) },
      options: { seed: 19, spreadMm: 320 },
      occluder: true,
      fadeFloor: 0.35,
    },
    {
      // Motivates the standby glow, and is the only thing in the room a cockroach actually likes.
      kind: 'bedroom.humidifier',
      at: { x: mm(6040), y: 0, z: mm(-860) },
      occluder: true,
      fadeFloor: 0.3,
    },
    {
      kind: 'bedroom.wasteBasket',
      at: { x: mm(8830), y: 0, z: mm(-570) },
      rotY: -0.2,
      occluder: true,
      fadeFloor: 0.32,
    },
    {
      kind: 'bedroom.bookStack',
      at: { x: mm(7770), y: 0, z: mm(-2370) },
      rotY: -0.15,
      occluder: true,
      fadeFloor: 0.36,
    },
    {
      kind: 'bedroom.mirrorLean',
      at: { x: mm(5245), y: 0, z: mm(-1475) },
      rotY: 0.06,
      options: { heightMm: 1500 },
      occluder: true,
      fadeFloor: 0.25,
    },
    {
      kind: 'bedroom.rug',
      at: { x: mm(7900), y: 0, z: mm(-600) },
      rotY: 0.04,
      options: { widthMm: 900, depthMm: 600 },
    },
    // Scale gag: at 35 mm a hair tie is a hoop you can walk through.
    { kind: 'bedroom.hairTie', at: { x: mm(7420), y: 0, z: mm(-1950) }, rotY: 0.7 },
    {
      kind: 'bedroom.dustLine',
      at: { x: mm(8500), y: 0, z: mm(-1500) },
      options: { seed: 31, lengthMm: 1700, axis: 'x' },
    },
    {
      kind: 'bedroom.crumbTrace',
      at: { x: mm(7660), y: 0, z: mm(-1500) },
      options: { seed: 44, radiusMm: 140 },
    },
    { kind: 'bedroom.wallClock', at: { x: mm(7900), y: mm(1950), z: mm(Z1) } },
    {
      kind: 'bedroom.acUnit',
      at: { x: mm(8600), y: mm(2050), z: mm(Z1) },
      options: { widthMm: 820, heightMm: 290 },
    },
  ],

  lights: [
    {
      // Moonlight through the bedroom window. The room's only standing light, and the reason the
      // sill and the head of the bed are readable at all.
      kind: 'rect',
      at: { x: mm(X1 - 40), y: mm(SILL_H + WINDOW_H / 2), z: mm(WINDOW_Z0 + WINDOW_W / 2) },
      colour: 0x8fa8d0,
      intensity: 1.3,
      width: mm(WINDOW_W),
      height: mm(WINDOW_H),
    },
    {
      // The bedside lamp. Only burns while the resident is still awake — and while it burns, the
      // one reliable climb in the region is the brightest square in the region.
      kind: 'point',
      at: { x: mm(9390), y: mm(880), z: mm(-2670) },
      colour: 0xffc07a,
      intensity: 3.2,
      distance: mm(1600),
      routine: 'bedroom.bedtime',
      castShadow: true,
    },
    {
      // Charging LED on the phone. Two hundred and forty millimetres of reach: at scout scale it
      // is a streetlamp over the top of the cable climb.
      kind: 'point',
      at: { x: mm(9365), y: mm(BEDSIDE_H + 14), z: mm(-2440) },
      colour: 0xff7a4a,
      intensity: 0.22,
      distance: mm(240),
    },
    {
      // Humidifier standby glow, at floor level, motivated by the humidifier prop.
      kind: 'point',
      at: { x: mm(6040), y: mm(210), z: mm(-860) },
      colour: 0x4f86d6,
      intensity: 0.4,
      distance: mm(560),
    },
    {
      // Hallway light through the door left ajar. Gated on the hallway routine, because a corridor
      // light that is off is not a hazard.
      kind: 'rect',
      at: { x: mm(DOOR_X0 + DOOR_W / 2), y: mm(1020), z: mm(Z1 - 30) },
      colour: 0xd9c39a,
      intensity: 1.0,
      width: mm(DOOR_W),
      height: mm(2050),
      routine: 'hallway.nightlight',
    },
  ],

  /* Exposure is the whole economy of this region. The bright zones come first; the cover zones are
   * authored after them, and their level is far below ambient — a shirt dropped on the floor is a
   * hole in the light, and routing through it instead of around it is the chapter's core skill. */
  exposureZones: [
    // Moonlight falling off the sill onto the corner floor.
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(8300), z0: mm(Z0 + 100), x1: mm(X1), z1: mm(-2200) },
      level: 0.46,
    },
    // Open floor between the wardrobe and the bed: no cover for 2200 mm.
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(6100), z0: mm(-2700), x1: mm(8300), z1: mm(-1000) },
      level: 0.3,
    },
    // The sill itself sits in the window. Nothing on it is hidden.
    {
      surface: 'bedroom.sill',
      rect: { x0: mm(SILL_X0), z0: mm(WINDOW_Z0), x1: mm(X1), z1: mm(WINDOW_Z0 + WINDOW_W) },
      level: 0.92,
    },
    // The mattress: pale bedding, moonlight, and a person on it.
    {
      surface: 'bedroom.bed',
      rect: { x0: mm(BED_X0), z0: mm(BED_Z0), x1: mm(BED_X1), z1: mm(BED_Z1) },
      level: 0.62,
    },
    {
      surface: 'bedroom.bed',
      rect: { x0: mm(BED_X0), z0: mm(BED_Z0), x1: mm(BED_X1), z1: mm(BED_Z1) },
      level: 1,
      routine: 'bedroom.bedtime',
    },
    {
      surface: 'bedroom.bedside',
      rect: { x0: mm(BEDSIDE_X0), z0: mm(BEDSIDE_Z0), x1: mm(BEDSIDE_X1), z1: mm(BEDSIDE_Z1) },
      level: 0.55,
    },
    {
      surface: 'bedroom.bedside',
      rect: { x0: mm(BEDSIDE_X0), z0: mm(BEDSIDE_Z0), x1: mm(BEDSIDE_X1), z1: mm(BEDSIDE_Z1) },
      level: 1,
      routine: 'bedroom.bedtime',
    },
    // Doorway spill: it lands squarely across the shortest line from the architrave relay to the
    // rest of the room, which is what makes the long way round worth paying for.
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(5300), z0: mm(-1350), x1: mm(6900), z1: mm(Z1) },
      level: 0.8,
      routine: 'hallway.nightlight',
    },
    // Cover. A dropped shirt is a tunnel; the pile by the basket is the best cover on the floor.
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(6400), z0: mm(-1620), x1: mm(7000), z1: mm(-1150) },
      level: 0.06,
    },
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(5700), z0: mm(-2300), x1: mm(6260), z1: mm(-1900) },
      level: 0.07,
    },
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(5900), z0: mm(-1000), x1: mm(6270), z1: mm(-620) },
      level: 0.08,
    },
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(6420), z0: mm(-960), x1: mm(6720), z1: mm(-640) },
      level: 0.05,
    },
    // The under-bed run: the darkest floor in the region, and the reason the foot end is open.
    {
      surface: 'bedroom.floor',
      rect: { x0: mm(BED_X0), z0: mm(BED_Z0), x1: mm(BED_X1), z1: mm(BED_Z1) },
      level: 0.04,
    },
  ],
};

import { mm } from '../units';
import type { RegionSpec } from '../types';

/**
 * Chapter 2 — the hallway (복도).
 *
 * A 1600 mm wide, 9800 mm long double-loaded corridor with a door on almost every metre of it. It
 * is deliberately the poorest room in the apartment: two weak resources, both at the bottom of the
 * allowed range, and nothing worth a satellite. Its value is entirely REACH — it is the only thing
 * that connects the kitchen to the other three rooms, so every route the colony ever runs crosses
 * it, and every route the colony ever loses is lost here.
 *
 * The design is one sentence: an open floor 1600 mm wide is 46 scout body-lengths of nothing to
 * hide behind. Exposure is authored as five bands across the width — a 120 mm baseboard strip
 * against each wall at 0.20/0.24, and a centre third at 0.90 — so the player is permanently choosing
 * between the fast line down the middle and the slow crawl along the skirting. That choice is the
 * chapter.
 *
 * The doors are what make it a *timing* problem rather than a geometry problem. Four doorways spill
 * light into the corridor on household routines, and each spill is authored to land on the route the
 * player would otherwise treat as safe: `bathroom.use` floods the south baseboard, `bedroom.phone`
 * kills the north baseboard exactly where the charger cable and the parcel detour are, `living.tv`
 * washes the whole width in flicker. There is no route that is safe at all times.
 */

/* Envelope, mm. The camera looks toward +X and +Z, so the north (z = -300) and west (x = -200)
 * walls stand between the viewer and the corridor and are cut to 320 mm stubs. Only the SOUTH wall
 * and the EAST dead-end wall survive full height, so every object that has to read as architecture
 * — the shoe cabinet, the mirror, the door frames, the breaker panel — is authored against those. */
const X0 = -200;
const X1 = 9600;
const Z0 = -300;
const Z1 = 1300;

/** 120 mm is a little over the baseboard depth plus a body width: the "safe" lane, both sides. */
const BASE_STRIP = 120;

/** The 현관 tile is sunk 120 mm below the corridor and is scenic only — blocked, never walkable. */
const ENTRY_X1 = 520;

/** 신발장: 800 × 350 × 900 against the full-height south wall, with the kitchen's proven 100 mm
 * recess at its foot. The recess is the whole reason this cabinet exists. */
const SHOE_X0 = 540;
const SHOE_X1 = 1340;
const SHOE_D = 350;
const SHOE_H = 900;
const SHOE_RECESS = 100;
const SHOE_FACE = Z1 - SHOE_D; // 950 — front face of the carcass
const SHOE_CARCASS_Z0 = SHOE_FACE + SHOE_RECESS; // 1050 — solid from here back to the wall

/* Doorway spans in absolute X. `start` on a WallSpec is measured from the wall's `from`, i.e.
 * x - X0 for the two long walls. */
const BATH_DOOR_X0 = 1500;
const BATH_DOOR_W = 700;
const KITCHEN_DOOR_X0 = 2900; // must match kitchen.ts's south opening exactly
const KITCHEN_DOOR_W = 800;
const LIVING_DOOR_X0 = 4200;
const LIVING_DOOR_W = 1200;
const BEDROOM_DOOR_X0 = 6600;
const BEDROOM_DOOR_W = 800;

export const HALLWAY: RegionSpec = {
  id: 'hallway',
  labelKey: 'region.hallway',
  bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },

  surfaces: [
    {
      // Vinyl 장판, swept nightly, lit from four doorways. The most scanned floor in the apartment.
      id: 'hallway.floor',
      region: 'hallway',
      y: 0,
      bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },
      exposure: 1.25,
      labelKey: 'surface.hallway.floor',
    },
    {
      // Top of the shoe cabinet: the overwatch perch. 900 mm up, above every sightline a standing
      // human uses down the corridor, screened by the key tray and the mask box, and backed by the
      // one wall that is never cut away. Reaching it is a real strategic option — from here a scout
      // sees both doorway spills at the west end before they reach the floor.
      id: 'hallway.shoetop',
      region: 'hallway',
      y: mm(SHOE_H),
      bounds: { x0: mm(SHOE_X0), z0: mm(SHOE_FACE), x1: mm(SHOE_X1), z1: mm(Z1) },
      exposure: 0.5,
      labelKey: 'surface.hallway.shoetop',
    },
  ],

  /* Every blocker here is authored around the gap it leaves, not the mass it adds.
   * The corridor has exactly ONE forced exposure — the parcel stack — and everything else keeps a
   * believable crawl-space open. */
  blockers: [
    // 현관. Sunken tile, doormat, the door swing arc. Scenic, and the colony treats it as a wall:
    // it is the one patch of floor a returning human always looks at.
    { surface: 'hallway.floor', rect: { x0: mm(X0), z0: mm(Z0), x1: mm(ENTRY_X1), z1: mm(Z1) } },
    // 신발장 carcass. Solid from 1050 back to the wall; the 950–1050 slot at its foot stays open and
    // is the west end's only continuous south-side route.
    {
      surface: 'hallway.floor',
      rect: { x0: mm(SHOE_X0), z0: mm(SHOE_CARCASS_Z0), x1: mm(SHOE_X1), z1: mm(Z1) },
    },
    // Umbrella stand against the north wall. Blocks that baseboard strip for 160 mm — the first
    // time the player is pushed off the skirting, thirty seconds into the chapter.
    { surface: 'hallway.floor', rect: { x0: mm(560), z0: mm(Z0), x1: mm(720), z1: mm(-60) } },
    // Kicked-off shoes, left out in the middle of the floor where shoes actually get left.
    { surface: 'hallway.floor', rect: { x0: mm(600), z0: mm(760), x1: mm(840), z1: mm(880) } },
    { surface: 'hallway.floor', rect: { x0: mm(860), z0: mm(800), x1: mm(1160), z1: mm(940) } },
    // Bathroom slippers, set out a hand's width from the wall as they always are — so the south
    // baseboard runs behind them and the pair is cover, not an obstacle.
    { surface: 'hallway.floor', rect: { x0: mm(1720), z0: mm(1080), x1: mm(1860), z1: mm(1200) } },
    { surface: 'hallway.floor', rect: { x0: mm(1880), z0: mm(1080), x1: mm(2020), z1: mm(1200) } },
    // 전신거울 leaning back against the south wall. Its foot stands 80 mm proud of the baseboard,
    // and the dark wedge between the glass and the wall is the safest 550 mm in the corridor.
    { surface: 'hallway.floor', rect: { x0: mm(2450), z0: mm(1140), x1: mm(3000), z1: mm(1220) } },
    // Hall bench side panels. Real furniture cannot sit flush to a 걸레받이, so both panels stop
    // 130 mm short of the wall — the north baseboard runs uninterrupted behind them and the 680 mm
    // beneath the seat is the darkest floor on this side.
    { surface: 'hallway.floor', rect: { x0: mm(4700), z0: mm(-170), x1: mm(4760), z1: mm(-10) } },
    { surface: 'hallway.floor', rect: { x0: mm(5440), z0: mm(-170), x1: mm(5500), z1: mm(-10) } },
    // 택배 상자. Dropped flat against the wall on top of the charger cable, sealing the north
    // baseboard completely. This is the corridor's one mandatory crossing into the lit centre and
    // it sits directly under the bedroom doorway's light throw. It is meant to hurt.
    { surface: 'hallway.floor', rect: { x0: mm(5900), z0: mm(Z0), x1: mm(6420), z1: mm(200) } },
    // Dead end past the bedroom door: laundry basket, vacuum dock, 밀대. Blocking here costs the
    // player nothing, which is exactly why the household's junk is allowed to accumulate here.
    { surface: 'hallway.floor', rect: { x0: mm(9100), z0: mm(Z0), x1: mm(9560), z1: mm(140) } },
    { surface: 'hallway.floor', rect: { x0: mm(9200), z0: mm(1000), x1: mm(9500), z1: mm(Z1) } },
    { surface: 'hallway.floor', rect: { x0: mm(9420), z0: mm(820), x1: mm(9560), z1: mm(960) } },
  ],

  links: [
    {
      // The 인터폰 cable drops behind the cabinet's east end and is pinned to the wall by a clip
      // every 300 mm — the clips are the rungs. Single file, and slow: three seconds on an open
      // vertical surface with the front door behind you.
      id: 'hallway.cable.interphone',
      from: 'hallway.floor',
      to: 'hallway.shoetop',
      at: { x: mm(1290), z: mm(1000) },
      seconds: 3.2,
      capacity: 1,
      kind: 'cable',
      labelKey: 'link.hallway.interphoneCable',
    },
    {
      // One-way bail-out off the perch. Fast, three abreast, and it lands on open floor in front of
      // the cabinet — which is the trade: you escape the shelf instantly, into the lit lane.
      id: 'hallway.drop.shoecabinet',
      from: 'hallway.shoetop',
      to: 'hallway.floor',
      at: { x: mm(620), z: mm(930) },
      seconds: 0.9,
      capacity: 3,
      kind: 'drop',
      labelKey: 'link.hallway.shoeDrop',
    },
  ],

  /* Two sources, both deliberately feeble. A player who tries to *live* off the hallway starves;
   * the hallway is a road. */
  resources: [
    {
      // Umbrella drip tray. Standing rainwater, replenished only when somebody comes home wet.
      id: 'hallway.driptray',
      region: 'hallway',
      surface: 'hallway.floor',
      at: { x: mm(640), z: mm(-30) },
      kind: 'moisture',
      amount: 32,
      rate: 1.1,
      disturbance: 0.02,
      labelKey: 'resource.hallway.driptray',
      refilledBy: 'hallway.return',
    },
    {
      // Crumbs walked out of the kitchen on a slipper sole. Hidden until inspected, because that is
      // how the player learns the corridor rewards scouting rather than harvesting.
      id: 'hallway.crumbtrail',
      region: 'hallway',
      surface: 'hallway.floor',
      at: { x: mm(3300), z: mm(-160) },
      kind: 'food',
      amount: 30,
      rate: 1.0,
      disturbance: 0.01,
      labelKey: 'resource.hallway.crumbtrail',
      hidden: true,
      refilledBy: 'kitchen.dinner',
    },
  ],

  /* Both cheap relays. The hallway must never be worth nesting in — it should be worth *crossing*,
   * and a relay is what makes a crossing survivable. */
  footholds: [
    {
      id: 'hallway.shoeskirt',
      region: 'hallway',
      surface: 'hallway.floor',
      at: { x: mm(940), z: mm(990) },
      role: 'relay',
      labelKey: 'foothold.hallway.shoeskirt',
      descriptionKey: 'foothold.hallway.shoeskirt.desc',
      capacity: 4,
      concealment: 0.72,
      cost: { food: 14, moisture: 8, workers: 1 },
    },
    {
      // Behind the living-room architrave, where the trim was scribed to an out-of-true wall and
      // never caulked. Right at the mouth of the brightest doorway in the apartment: this relay is
      // the reason a route can survive `living.tv` at all.
      id: 'hallway.architrave',
      region: 'hallway',
      surface: 'hallway.floor',
      at: { x: mm(4130), z: mm(1250) },
      role: 'relay',
      labelKey: 'foothold.hallway.architrave',
      descriptionKey: 'foothold.hallway.architrave.desc',
      capacity: 3,
      concealment: 0.58,
      cost: { food: 12, moisture: 8, workers: 1 },
    },
  ],

  walls: [
    // North (-Z, nearest the camera) — cut to a stub. Carries the kitchen and bedroom doorways; the
    // kitchen opening must line up with kitchen.ts's south opening at x 2900..3700.
    {
      from: { x: mm(X0), z: mm(Z0) },
      to: { x: mm(X1), z: mm(Z0) },
      outward: { x: 0, z: -1 },
      openings: [
        { start: mm(KITCHEN_DOOR_X0 - X0), width: mm(KITCHEN_DOOR_W), height: mm(2050) },
        { start: mm(BEDROOM_DOOR_X0 - X0), width: mm(BEDROOM_DOOR_W), height: mm(2050) },
      ],
    },
    // West — the front door wall. Also near the camera, so it is stubbed and the door leaf prop is
    // built to the same 320 mm cut; the 현관 reads from its floor, mat, cabinet and interphone
    // instead of from a full-height slab standing in front of the corridor.
    {
      from: { x: mm(X0), z: mm(Z0) },
      to: { x: mm(X0), z: mm(Z1) },
      outward: { x: -1, z: 0 },
      openings: [{ start: mm(400), width: mm(900), height: mm(2100) }],
    },
    // South — full height, never cut. This is the corridor's entire visual backing: shoe cabinet,
    // mirror, bathroom door, living-room door. Everything the player is meant to read is on it.
    {
      from: { x: mm(X0), z: mm(Z1) },
      to: { x: mm(X1), z: mm(Z1) },
      outward: { x: 0, z: 1 },
      openings: [
        { start: mm(BATH_DOOR_X0 - X0), width: mm(BATH_DOOR_W), height: mm(2050) },
        { start: mm(LIVING_DOOR_X0 - X0), width: mm(LIVING_DOOR_W), height: mm(2100) },
      ],
    },
    // East — the dead end. Full height, no openings: the corridor terminates in a wall, and the
    // 9.8 m run toward it is the shot that sells the length of the apartment.
    {
      from: { x: mm(X1), z: mm(Z0) },
      to: { x: mm(X1), z: mm(Z1) },
      outward: { x: 1, z: 0 },
    },
  ],

  props: [
    /* --- Shell. Nothing here occludes: floors and walls never fade. --- */
    {
      kind: 'hallway.floorRun',
      at: { x: mm(X0), y: 0, z: mm(Z0) },
      options: { lengthMm: X1 - X0, widthMm: Z1 - Z0, axis: 'x', seed: 41 },
    },
    {
      kind: 'hallway.baseboard',
      at: { x: mm(X0), y: 0, z: mm(Z0) },
      options: { lengthMm: X1 - X0, axis: 'x', facing: 1 },
    },
    {
      kind: 'hallway.baseboard',
      at: { x: mm(X0), y: 0, z: mm(Z1) },
      options: { lengthMm: X1 - X0, axis: 'x', facing: -1 },
    },
    {
      // The corridor light, OFF. It exists so the player can see what is about to happen to them:
      // a fixture directly over the centre lane, with a switch beside every door.
      kind: 'hallway.ceilingLightOff',
      at: { x: mm(4800), y: mm(2340), z: mm(500) },
    },

    /* --- 현관. Scenic and inaccessible, but it has to look like the way in. --- */
    {
      kind: 'hallway.entryTile',
      at: { x: mm(X0), y: 0, z: mm(Z0) },
      options: { lengthMm: ENTRY_X1 - X0, widthMm: Z1 - Z0, dropMm: 120 },
    },
    {
      // The raised threshold. 120 mm of vertical is nothing to a cockroach and everything to the
      // household's mental model of "inside" — it is why this line is swept every single day.
      kind: 'hallway.entryStep',
      at: { x: mm(ENTRY_X1), y: 0, z: mm(Z0) },
      options: { widthMm: Z1 - Z0, riseMm: 120, axis: 'z' },
    },
    {
      // Built to the same 320 mm cut as its wall, so the front door never stands between the camera
      // and 9.8 m of corridor.
      kind: 'hallway.frontDoor',
      at: { x: mm(X0), y: 0, z: mm(550) },
      options: { widthMm: 900, heightMm: 2100, stubMm: 320 },
    },
    { kind: 'hallway.doorLock', at: { x: mm(-120), y: mm(1040), z: mm(180) } },
    {
      kind: 'hallway.doorMat',
      at: { x: mm(120), y: 0, z: mm(500) },
      options: { widthMm: 640, depthMm: 420, seed: 3 },
    },
    { kind: 'hallway.umbrellaStand', at: { x: mm(640), y: 0, z: mm(-180) }, occluder: true },
    {
      kind: 'hallway.umbrella',
      at: { x: mm(640), y: 0, z: mm(-180) },
      rotY: 0.18,
      occluder: true,
      fadeFloor: 0.34,
    },
    {
      kind: 'hallway.dripTray',
      at: { x: mm(640), y: 0, z: mm(-30) },
      options: { radiusMm: 120, fillMm: 6 },
    },

    /* --- 신발장 cluster: the west end's whole reason to exist. --- */
    {
      kind: 'hallway.shoeCabinet',
      at: { x: mm(940), y: 0, z: mm(Z1 - SHOE_D / 2) },
      options: {
        widthMm: SHOE_X1 - SHOE_X0,
        depthMm: SHOE_D,
        heightMm: SHOE_H,
        recessMm: SHOE_RECESS,
      },
      occluder: true,
      fadeFloor: 0.3,
    },
    { kind: 'hallway.interphone', at: { x: mm(760), y: mm(1450), z: mm(1290) }, occluder: true },
    {
      // The climbable object. If this prop is not visible, the link is a cheat.
      kind: 'hallway.interphoneCable',
      at: { x: mm(1290), y: 0, z: mm(1288) },
      options: { topMm: 1450, clipEveryMm: 300 },
    },
    { kind: 'hallway.keyTray', at: { x: mm(680), y: mm(SHOE_H), z: mm(1120) }, rotY: -0.12 },
    {
      // Clutter on the perch is not dressing — it is the 0.5 exposure multiplier, made visible.
      kind: 'hallway.maskBox',
      at: { x: mm(1180), y: mm(SHOE_H), z: mm(1150) },
      rotY: 0.08,
      occluder: true,
    },
    { kind: 'hallway.dressShoes', at: { x: mm(720), y: 0, z: mm(820) }, rotY: 0.22 },
    {
      kind: 'hallway.runningShoes',
      at: { x: mm(1010), y: 0, z: mm(870) },
      rotY: -0.3,
      occluder: true,
      fadeFloor: 0.36,
    },

    /* --- Doorways. Four frames, two leaves left ajar; the ajar ones are the light sources. --- */
    {
      kind: 'hallway.doorFrame',
      at: { x: mm(BATH_DOOR_X0 + BATH_DOOR_W / 2), y: 0, z: mm(Z1) },
      options: { widthMm: BATH_DOOR_W, heightMm: 2050, architraveMm: 60 },
      occluder: true,
      fadeFloor: 0.38,
    },
    {
      kind: 'hallway.doorLeaf',
      at: { x: mm(BATH_DOOR_X0), y: 0, z: mm(Z1) },
      rotY: -0.55,
      options: { widthMm: BATH_DOOR_W, heightMm: 2050 },
      occluder: true,
      fadeFloor: 0.3,
    },
    { kind: 'hallway.slipper', at: { x: mm(1790), y: 0, z: mm(1140) }, rotY: 0.1 },
    { kind: 'hallway.slipper', at: { x: mm(1950), y: 0, z: mm(1140) }, rotY: -0.06 },
    {
      kind: 'hallway.doorFrame',
      at: { x: mm(KITCHEN_DOOR_X0 + KITCHEN_DOOR_W / 2), y: 0, z: mm(Z0) },
      options: { widthMm: KITCHEN_DOOR_W, heightMm: 2050, architraveMm: 60 },
      occluder: true,
      fadeFloor: 0.34,
    },
    {
      kind: 'hallway.doorFrame',
      at: { x: mm(LIVING_DOOR_X0 + LIVING_DOOR_W / 2), y: 0, z: mm(Z1) },
      options: { widthMm: LIVING_DOOR_W, heightMm: 2100, architraveMm: 70, sliding: true },
      occluder: true,
      fadeFloor: 0.38,
    },
    {
      kind: 'hallway.doorFrame',
      at: { x: mm(BEDROOM_DOOR_X0 + BEDROOM_DOOR_W / 2), y: 0, z: mm(Z0) },
      options: { widthMm: BEDROOM_DOOR_W, heightMm: 2050, architraveMm: 60 },
      occluder: true,
      fadeFloor: 0.34,
    },
    {
      kind: 'hallway.doorLeaf',
      at: { x: mm(BEDROOM_DOOR_X0 + BEDROOM_DOOR_W), y: 0, z: mm(Z0) },
      rotY: 0.42,
      options: { widthMm: BEDROOM_DOOR_W, heightMm: 2050 },
      occluder: true,
      fadeFloor: 0.3,
    },

    /* --- Mid corridor. --- */
    {
      kind: 'hallway.mirror',
      at: { x: mm(2725), y: 0, z: mm(1230) },
      options: { widthMm: 550, heightMm: 1500, leanRad: 0.07 },
      occluder: true,
      fadeFloor: 0.32,
    },
    {
      kind: 'hallway.hallBench',
      at: { x: mm(5100), y: 0, z: mm(-160) },
      options: { widthMm: 800, depthMm: 320, heightMm: 420, wallGapMm: 130 },
      occluder: true,
      fadeFloor: 0.35,
    },
    {
      kind: 'hallway.foldedLaundry',
      at: { x: mm(5180), y: mm(420), z: mm(-150) },
      rotY: -0.1,
      occluder: true,
      fadeFloor: 0.38,
    },
    {
      kind: 'hallway.parcelStack',
      at: { x: mm(6160), y: 0, z: mm(-50) },
      rotY: 0.06,
      options: { count: 3, seed: 13 },
      occluder: true,
      fadeFloor: 0.3,
    },
    {
      kind: 'hallway.crumbTrail',
      at: { x: mm(3300), y: 0, z: mm(-160) },
      options: { seed: 19, radiusMm: 220 },
    },
    { kind: 'hallway.dustBall', at: { x: mm(4380), y: 0, z: mm(-262) }, options: { seed: 7 } },

    /* --- Power. The charger cable is a route landmark before it is set dressing: it runs the
     * north baseboard from the outlet to the bench, and the parcels were dropped on top of it. --- */
    { kind: 'hallway.outlet', at: { x: mm(6520), y: mm(300), z: mm(Z0) } },
    { kind: 'hallway.powerStrip', at: { x: mm(6500), y: 0, z: mm(-250) }, rotY: 0.08 },
    {
      kind: 'hallway.cableRun',
      at: { x: mm(4900), y: 0, z: mm(-272) },
      options: { lengthMm: 1600, axis: 'x', sagMm: 8 },
    },

    /* --- East dead end. Household junk accumulates where nobody walks. --- */
    {
      kind: 'hallway.laundryBasket',
      at: { x: mm(9330), y: 0, z: mm(-80) },
      rotY: -0.14,
      occluder: true,
      fadeFloor: 0.34,
    },
    {
      kind: 'hallway.stickVacuum',
      at: { x: mm(9350), y: 0, z: mm(1150) },
      occluder: true,
      fadeFloor: 0.3,
    },
    {
      kind: 'hallway.mop',
      at: { x: mm(9490), y: 0, z: mm(890) },
      rotY: -0.35,
      occluder: true,
      fadeFloor: 0.28,
    },
    {
      kind: 'hallway.breakerPanel',
      at: { x: mm(X1), y: mm(1750), z: mm(300) },
      occluder: true,
      fadeFloor: 0.45,
    },
  ],

  /* It is night and the corridor light is off. Total standing intensity is 1.07 across three
   * standby LEDs — the hallway is genuinely dark, and everything bright is a doorway on a routine.
   * That is what makes a spill an *event* rather than lighting. Every entry names a prop above. */
  lights: [
    {
      // 도어록 keypad, breathing green. Motivated by `hallway.doorLock`.
      kind: 'point',
      at: { x: mm(-120), y: mm(1040), z: mm(180) },
      colour: 0x86e0b4,
      intensity: 0.5,
      distance: mm(760),
    },
    {
      // 인터폰 standby. Motivated by `hallway.interphone`. It is the only thing lighting the perch,
      // from above and behind — which is why the shelf reads as safe.
      kind: 'point',
      at: { x: mm(760), y: mm(1430), z: mm(1250) },
      colour: 0x8fb8ff,
      intensity: 0.35,
      distance: mm(620),
    },
    {
      // 멀티탭 standby, red, 80 mm off the floor. Motivated by `hallway.powerStrip`. At scout eye
      // level this is a landmark visible the whole length of the corridor.
      kind: 'point',
      at: { x: mm(6500), y: mm(80), z: mm(-250) },
      colour: 0xff5f4a,
      intensity: 0.22,
      distance: mm(340),
    },
    {
      // Bathroom door left ajar. The harshest light in the apartment, and it lands square on the
      // south baseboard — the lane the player has just learned to trust.
      kind: 'rect',
      at: { x: mm(BATH_DOOR_X0 + BATH_DOOR_W / 2), y: mm(1020), z: mm(1288) },
      colour: 0xf4f7ff,
      intensity: 3.4,
      width: mm(BATH_DOOR_W),
      height: mm(2050),
      routine: 'bathroom.use',
      castShadow: true,
    },
    {
      // 1200 mm of open sliding door with a television behind it. Cold, flickering, and wide enough
      // to reach both walls.
      kind: 'rect',
      at: { x: mm(LIVING_DOOR_X0 + LIVING_DOOR_W / 2), y: mm(900), z: mm(1288) },
      colour: 0x93a9ff,
      intensity: 2.4,
      width: mm(LIVING_DOOR_W),
      height: mm(2100),
      routine: 'living.tv',
      castShadow: true,
    },
    {
      // A phone screen in a dark bedroom. Dim, low, and aimed straight down the north baseboard.
      kind: 'rect',
      at: { x: mm(BEDROOM_DOOR_X0 + BEDROOM_DOOR_W / 2), y: mm(620), z: mm(-288) },
      colour: 0xd2dbff,
      intensity: 1.3,
      width: mm(BEDROOM_DOOR_W),
      height: mm(2050),
      routine: 'bedroom.phone',
    },
    {
      // Warm spill from the kitchen while the dishes are done — the same routine the player already
      // learned to read in chapter 1, now cutting their supply line.
      kind: 'rect',
      at: { x: mm(KITCHEN_DOOR_X0 + KITCHEN_DOOR_W / 2), y: mm(1000), z: mm(-288) },
      colour: 0xffd7a0,
      intensity: 2.1,
      width: mm(KITCHEN_DOOR_W),
      height: mm(2050),
      routine: 'kitchen.dishes',
    },
  ],

  /* The corridor authored as five bands across its 1600 mm width, plus the doorway events.
   *
   * Baseboard 0.20 / 0.24 → shoulder 0.52 / 0.55 → centre third 0.90. A route down the middle is
   * roughly four times as readable as a route on the skirting and about a third of the length in
   * time; that ratio IS chapter 2's decision, and it is the only thing in this file that must not
   * be tuned casually. */
  exposureZones: [
    {
      // North skirting: 120 mm of shadow the full length of the corridor.
      surface: 'hallway.floor',
      rect: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z0 + BASE_STRIP) },
      level: 0.24,
    },
    {
      surface: 'hallway.floor',
      rect: { x0: mm(X0), z0: mm(Z0 + BASE_STRIP), x1: mm(X1), z1: mm(220) },
      level: 0.55,
    },
    {
      // The centre third. Nothing overhead, nothing to either side, and every doorway sees it.
      surface: 'hallway.floor',
      rect: { x0: mm(X0), z0: mm(220), x1: mm(X1), z1: mm(780) },
      level: 0.9,
    },
    {
      surface: 'hallway.floor',
      rect: { x0: mm(X0), z0: mm(780), x1: mm(X1), z1: mm(Z1 - BASE_STRIP) },
      level: 0.52,
    },
    {
      // South skirting: the better of the two lanes, because the full-height wall shades it.
      surface: 'hallway.floor',
      rect: { x0: mm(X0), z0: mm(Z1 - BASE_STRIP), x1: mm(X1), z1: mm(Z1) },
      level: 0.2,
    },
    {
      // The wedge behind the leaning mirror, and the floor under the hall bench. Two authored
      // rest stops — without them the 9.8 m crossing has no punctuation.
      surface: 'hallway.floor',
      rect: { x0: mm(2450), z0: mm(1220), x1: mm(3000), z1: mm(Z1) },
      level: 0.14,
    },
    {
      surface: 'hallway.floor',
      rect: { x0: mm(4760), z0: mm(Z0), x1: mm(5440), z1: mm(-10) },
      level: 0.15,
    },
    {
      // The perch. Its back half sits in the interphone's shadow behind the key tray and mask box;
      // the front lip is over the corridor and is not safe at all.
      surface: 'hallway.shoetop',
      rect: { x0: mm(SHOE_X0), z0: mm(1120), x1: mm(SHOE_X1), z1: mm(Z1) },
      level: 0.28,
    },
    {
      surface: 'hallway.shoetop',
      rect: { x0: mm(SHOE_X0), z0: mm(SHOE_FACE), x1: mm(SHOE_X1), z1: mm(1120) },
      level: 0.62,
    },

    /* Doorway events. Each one is aimed at the lane the player would otherwise call safe. */
    {
      // Bathroom: full-width blast, south skirting included. Nothing survives this by hiding.
      surface: 'hallway.floor',
      rect: { x0: mm(1380), z0: mm(380), x1: mm(2320), z1: mm(Z1) },
      level: 0.95,
      routine: 'bathroom.use',
    },
    {
      surface: 'hallway.floor',
      rect: { x0: mm(900), z0: mm(700), x1: mm(3200), z1: mm(Z1) },
      level: 0.6,
      routine: 'bathroom.use',
    },
    {
      surface: 'hallway.floor',
      rect: { x0: mm(4060), z0: mm(480), x1: mm(5560), z1: mm(Z1) },
      level: 0.88,
      routine: 'living.tv',
    },
    {
      // The television reaches the far wall. A 2500 mm stretch of the north skirting is lit by a
      // door on the other side of the corridor — the architrave relay is the answer to this.
      surface: 'hallway.floor',
      rect: { x0: mm(3600), z0: mm(Z0), x1: mm(6100), z1: mm(480) },
      level: 0.5,
      routine: 'living.tv',
    },
    {
      // Phone glow across the north skirting, covering the charger cable and the parcel detour at
      // once: the one forced crossing and the one route landmark, lit together.
      surface: 'hallway.floor',
      rect: { x0: mm(6480), z0: mm(Z0), x1: mm(7560), z1: mm(320) },
      level: 0.72,
      routine: 'bedroom.phone',
    },
    {
      surface: 'hallway.floor',
      rect: { x0: mm(2820), z0: mm(Z0), x1: mm(3800), z1: mm(340) },
      level: 0.8,
      routine: 'kitchen.dishes',
    },
  ],
};

import { mm } from '../units';
import type { RegionSpec } from '../types';

/**
 * The bathroom — optional, wet, and the one place the colony can be washed out of.
 *
 * Every other region trades food against exposure. This one trades *water* against exposure, and it
 * deliberately refuses to feed anybody: one thin food source (hair and soap scum in the floor trap)
 * against four fat moisture sources. A colony that camps here starves. A colony that never comes
 * here has to buy all its moisture from the kitchen sink, which is the most watched plane in the
 * game. That is the whole argument of the room.
 *
 * The second argument is the pipe. The basin's waste drops into a service chase shared with the
 * kitchen stack, and `bathroom.pipe.riser` is the near end of it. A route through the chase skips
 * the hallway entirely — the hallway being long, open, and lit. It costs a relay foothold in a room
 * that periodically floods, which is exactly the sort of bet this region should be offering.
 *
 * Korean wet-room rules that drive the layout: the whole floor is tiled and falls to a central
 * drain, there is a raised threshold at the door, and nothing is ever dry except the cistern lid.
 */

/* Room envelope, mm. 2400 x 2400. The camera looks toward +X and +Z, so the north (-Z, the door
 * wall) and west (-X) walls are cut to stubs by house.ts. The east and south walls stay full height
 * and carry everything worth looking at: basin, mirror, shower, toilet. */
const X0 = 200;
const X1 = 2600;
const Z0 = 1300;
const Z1 = 3700;

/** Central floor drain (배수구). Korean wet rooms fall to the middle, not to a wall. */
const DRAIN_X = 1400;
const DRAIN_Z = 2500;

/** Basin unit against the south wall: 650 wide bowl at 800 mm, boxed pedestal beneath it. */
const BASIN_X = 825;
const BASIN_TOP = 800;
const PEDESTAL_X0 = 700;
const PEDESTAL_X1 = 950;
const PEDESTAL_Z0 = 3520;

/** Shelf over the basin. Bleach and spray cleaner live here — the chemical-resistance argument. */
const SHELF_Y = 1420;

/**
 * Shower tray in the far corner: a 150 mm lip (턱) instead of a bath, as in a modern 25평 flat.
 * The lip overhangs its screed bed by ~40 mm and that void is the satellite foothold.
 */
const TRAY_X0 = 1400;
const TRAY_Z0 = 2800;
const TRAY_LIP = 150;

/** Toilet against the east wall. The cistern stands 90 mm proud of the tiles — that gap is a road. */
const TOILET_X0 = 1960;
const TOILET_X1 = 2510;
const TOILET_Z0 = 1900;
const TOILET_Z1 = 2420;
const CISTERN_TOP = 760;

export const BATHROOM: RegionSpec = {
  id: 'bathroom',
  labelKey: 'region.bathroom',
  bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },

  surfaces: [
    {
      // Glazed tile with a puddle on it reflects the ceiling fixture straight back up. There is no
      // furniture to hide under anywhere in this room, so the floor reads hotter than the kitchen's.
      id: 'bathroom.floor',
      region: 'bathroom',
      y: 0,
      bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },
      exposure: 1.15,
      labelKey: 'surface.bathroom.floor',
    },
    {
      // The service chase behind the basin pedestal. house.ts joins this void onward to the kitchen
      // stack — it is the far end of the shortcut, and the reason this region is worth taking.
      // The void reaches 60 mm past the pedestal's west cheek, through the unsealed inspection
      // hatch. That overhang is deliberate: the riser's foot has to stand on *unblocked* floor and
      // inside the void at the same time, or the climb has nowhere to start.
      id: 'bathroom.pipevoid',
      region: 'bathroom',
      y: mm(240),
      bounds: { x0: mm(640), z0: mm(PEDESTAL_Z0), x1: mm(1000), z1: mm(Z1) },
      exposure: 0.08,
      labelKey: 'surface.bathroom.pipevoid',
    },
    {
      id: 'bathroom.basin',
      region: 'bathroom',
      y: mm(BASIN_TOP),
      bounds: { x0: mm(500), z0: mm(3330), x1: mm(1150), z1: mm(Z1) },
      exposure: 1.3,
      labelKey: 'surface.bathroom.basin',
    },
    {
      // Where the cleaning chemicals sit. High, narrow, and directly under the light fixture.
      id: 'bathroom.shelf',
      region: 'bathroom',
      y: mm(SHELF_Y),
      bounds: { x0: mm(560), z0: mm(3600), x1: mm(1160), z1: mm(Z1) },
      exposure: 1.4,
      labelKey: 'surface.bathroom.shelf',
    },
    {
      // The dry high perch in a wet room. Nothing washes it, condensation feeds it, and it is in
      // plain sight — the local decision this region exists to pose.
      id: 'bathroom.cistern',
      region: 'bathroom',
      y: mm(CISTERN_TOP),
      bounds: { x0: mm(2360), z0: mm(TOILET_Z0), x1: mm(X1), z1: mm(2400) },
      exposure: 0.85,
      labelKey: 'surface.bathroom.cistern',
    },
    {
      id: 'bathroom.tray',
      region: 'bathroom',
      y: mm(TRAY_LIP),
      // Bounds start 60 mm north of the tray body, on the lip itself — the ledge a scout stands on
      // after clearing `bathroom.gap.traylip`. Same convention as the kitchen worktop overhang.
      bounds: { x0: mm(TRAY_X0), z0: mm(TRAY_Z0 - 60), x1: mm(X1), z1: mm(Z1) },
      exposure: 1,
      labelKey: 'surface.bathroom.tray',
    },
  ],

  /* Solid footprints. The room is mostly open tile on purpose: a wet room has no toe-kick, no
   * skirting void and no furniture legs, so the only cover in here is the four objects below and
   * the two authored voids. Everything keeps a walkable ring. */
  blockers: [
    // Basin pedestal. Boxed to the floor, but the inspection hatch on its west cheek never got
    // sealed — that is where the riser link stands, at x 660.
    {
      surface: 'bathroom.floor',
      rect: { x0: mm(PEDESTAL_X0), z0: mm(PEDESTAL_Z0), x1: mm(PEDESTAL_X1), z1: mm(Z1) },
    },
    // Toilet. Stops 90 mm short of the tiles so the supply line can be reached — that slot behind
    // the cistern is the only way up to the lid.
    {
      surface: 'bathroom.floor',
      rect: { x0: mm(TOILET_X0), z0: mm(TOILET_Z0), x1: mm(TOILET_X1), z1: mm(TOILET_Z1) },
    },
    // Shower tray. 380 mm of walkable tile between it and the toilet, 450 mm between it and the
    // pedestal: a scout can circle the whole room without ever crossing the drain.
    {
      surface: 'bathroom.floor',
      rect: { x0: mm(TRAY_X0), z0: mm(TRAY_Z0), x1: mm(X1), z1: mm(Z1) },
    },
    { surface: 'bathroom.floor', rect: { x0: mm(260), z0: mm(2780), x1: mm(660), z1: mm(3180) } },
    { surface: 'bathroom.floor', rect: { x0: mm(1010), z0: mm(2500), x1: mm(1290), z1: mm(2780) } },
    { surface: 'bathroom.floor', rect: { x0: mm(640), z0: mm(2260), x1: mm(900), z1: mm(2520) } },
    { surface: 'bathroom.floor', rect: { x0: mm(1830), z0: mm(2500), x1: mm(1990), z1: mm(2660) } },
    // Inside the tray: the shampoo shelf corner is solid, so the pool is approached from the west.
    { surface: 'bathroom.tray', rect: { x0: mm(2280), z0: mm(3500), x1: mm(X1), z1: mm(Z1) } },
    // On the basin: the bowl itself. Workers work the overflow slot from the rim, not the porcelain.
    // Stops 120 mm short of the wall so the strip behind the bowl, where the trap arm comes up,
    // stays walkable — that strip is the top of the shortcut.
    { surface: 'bathroom.basin', rect: { x0: mm(660), z0: mm(3400), x1: mm(1000), z1: mm(3580) } },
  ],

  links: [
    {
      // THE SHORTCUT. Up the basin waste into the shared chase. Two abreast, slow, and slick —
      // house.ts continues `bathroom.pipevoid` to the kitchen stack, bypassing the hallway.
      id: 'bathroom.pipe.riser',
      from: 'bathroom.floor',
      to: 'bathroom.pipevoid',
      at: { x: mm(670), z: mm(3600) },
      seconds: 3.6,
      capacity: 2,
      kind: 'pipe',
      labelKey: 'link.bathroom.riser',
    },
    {
      // From inside the chase, the trap arm surfaces in the bowl. Single file: it is a 32 mm pipe.
      id: 'bathroom.pipe.trap',
      from: 'bathroom.pipevoid',
      to: 'bathroom.basin',
      at: { x: mm(830), z: mm(3625) },
      seconds: 2.8,
      capacity: 1,
      kind: 'pipe',
      labelKey: 'link.bathroom.trap',
    },
    {
      // Grout seam up the tiled wall to the chemical shelf. Dry, gritty, easy — and fully lit.
      id: 'bathroom.seam.grout',
      from: 'bathroom.basin',
      to: 'bathroom.shelf',
      at: { x: mm(1090), z: mm(3665) },
      seconds: 3.2,
      capacity: 2,
      kind: 'seam',
      labelKey: 'link.bathroom.grout',
    },
    {
      // The angle valve and its braided hose, in the 90 mm slot behind the cistern. Chrome, so it is
      // slow and takes one body — the dry perch is deliberately expensive to supply.
      id: 'bathroom.pipe.cistern',
      from: 'bathroom.floor',
      to: 'bathroom.cistern',
      at: { x: mm(2555), z: mm(2380) },
      seconds: 3,
      capacity: 1,
      kind: 'pipe',
      labelKey: 'link.bathroom.cistern',
    },
    {
      // Over the 150 mm tray lip. Cheap and wide, which is why the tray pool is the first thing a
      // route in this room ever takes.
      id: 'bathroom.gap.traylip',
      from: 'bathroom.floor',
      to: 'bathroom.tray',
      at: { x: mm(1780), z: mm(2770) },
      seconds: 1.2,
      capacity: 3,
      kind: 'gap',
      labelKey: 'link.bathroom.traylip',
    },
  ],

  resources: [
    {
      // The central drain never dries. Biggest single moisture source in the apartment and the
      // quietest — nobody notices water being taken from water.
      id: 'bathroom.drain.floor',
      region: 'bathroom',
      surface: 'bathroom.floor',
      at: { x: mm(DRAIN_X), z: mm(DRAIN_Z) },
      kind: 'moisture',
      amount: 130,
      rate: 2.2,
      disturbance: 0.02,
      labelKey: 'resource.bathroom.drain',
      refilledBy: 'bathroom.shower',
    },
    {
      id: 'bathroom.pool.tray',
      region: 'bathroom',
      surface: 'bathroom.tray',
      at: { x: mm(1980), z: mm(3260) },
      kind: 'moisture',
      amount: 124,
      rate: 2.4,
      disturbance: 0.01,
      labelKey: 'resource.bathroom.traypool',
      refilledBy: 'bathroom.shower',
    },
    {
      id: 'bathroom.trap.basin',
      region: 'bathroom',
      surface: 'bathroom.basin',
      at: { x: mm(1060), z: mm(3480) },
      kind: 'moisture',
      amount: 112,
      rate: 1.9,
      disturbance: 0.03,
      labelKey: 'resource.bathroom.basintrap',
      refilledBy: 'bathroom.use',
    },
    {
      // Condensation running down the cistern. The dry perch pays its own way, if you can climb it.
      id: 'bathroom.sweat.cistern',
      region: 'bathroom',
      surface: 'bathroom.cistern',
      at: { x: mm(2470), z: mm(2150) },
      kind: 'moisture',
      amount: 104,
      rate: 1.6,
      disturbance: 0.01,
      labelKey: 'resource.bathroom.cisternsweat',
      refilledBy: 'bathroom.use',
    },
    {
      // The ONLY food in the room, and it is hair and soap scum in the trap basket. 32 units against
      // 470 units of water is the sentence "this room is a well, not a pantry", written in numbers.
      // Hidden: you have to lift the grate to know it is there.
      id: 'bathroom.scum.drain',
      region: 'bathroom',
      surface: 'bathroom.floor',
      at: { x: mm(DRAIN_X + 70), z: mm(DRAIN_Z + 80) },
      kind: 'food',
      amount: 32,
      rate: 1,
      disturbance: 0.05,
      labelKey: 'resource.bathroom.drainscum',
      hidden: true,
    },
  ],

  footholds: [
    {
      // The shortcut anchor. Deep inside the pedestal, effectively invisible, and the only foothold
      // in the game that water cannot reach — the chase is above the screed.
      id: 'bathroom.pedestalvoid',
      region: 'bathroom',
      surface: 'bathroom.pipevoid',
      at: { x: mm(860), z: mm(3610) },
      role: 'relay',
      labelKey: 'foothold.bathroom.pedestalvoid',
      descriptionKey: 'foothold.bathroom.pedestalvoid.desc',
      capacity: 4,
      concealment: 0.93,
      cost: { food: 26, moisture: 18, workers: 2 },
    },
    {
      // Under the tray lip: warm, dark, 40 mm deep, right next to the biggest puddle in the flat.
      // It is also directly downhill of the shower. Every `bathroom.shower` routine floods it, so
      // brood parked here is a recurring loss — a satellite you keep re-taking, on purpose.
      id: 'bathroom.traylip',
      region: 'bathroom',
      surface: 'bathroom.floor',
      at: { x: mm(1660), z: mm(2762) },
      role: 'satellite',
      labelKey: 'foothold.bathroom.traylip',
      descriptionKey: 'foothold.bathroom.traylip.desc',
      capacity: 5,
      concealment: 0.62,
      cost: { food: 20, moisture: 24, workers: 2 },
    },
  ],

  walls: [
    // North (-Z) — the door wall onto the hallway. Nearest the camera, cut to a stub.
    {
      from: { x: mm(X0), z: mm(Z0) },
      to: { x: mm(X1), z: mm(Z0) },
      outward: { x: 0, z: -1 },
      openings: [{ start: mm(200), width: mm(800), height: mm(1950), sill: mm(30) }],
    },
    // West — also near the camera. Nothing is mounted on it, because a stub wall cannot hold a
    // towel rail 1200 mm up without leaving it floating in air.
    { from: { x: mm(X0), z: mm(Z0) }, to: { x: mm(X0), z: mm(Z1) }, outward: { x: -1, z: 0 } },
    // East — full height, fully tiled. Carries the toilet and the shower riser.
    {
      from: { x: mm(X1), z: mm(Z0) },
      to: { x: mm(X1), z: mm(Z1) },
      outward: { x: 1, z: 0 },
    },
    // South — full height, fully tiled. Carries the basin, the mirror cabinet and the shelf. This is
    // the wall the player actually reads the room from.
    {
      from: { x: mm(X0), z: mm(Z1) },
      to: { x: mm(X1), z: mm(Z1) },
      outward: { x: 0, z: 1 },
    },
  ],

  props: [
    // --- shell -------------------------------------------------------------------------------
    {
      kind: 'bathroom.floorTile',
      at: { x: mm(X0), y: 0, z: mm(Z0) },
      options: {
        widthMm: X1 - X0,
        depthMm: Z1 - Z0,
        tileMm: 300,
        fallToX: DRAIN_X,
        fallToZ: DRAIN_Z,
      },
    },
    {
      kind: 'bathroom.wallTile',
      at: { x: mm(X1), y: 0, z: mm(Z0) },
      options: { lengthMm: Z1 - Z0, axis: 'z', tileMm: 300 },
    },
    {
      kind: 'bathroom.wallTile',
      at: { x: mm(X0), y: 0, z: mm(Z1) },
      options: { lengthMm: X1 - X0, axis: 'x', tileMm: 300 },
    },
    // The raised threshold that keeps the wet room wet. Low enough never to occlude, and it is the
    // visible reason the hallway does not flood.
    { kind: 'bathroom.doorSill', at: { x: mm(600), y: 0, z: mm(Z0) }, options: { widthMm: 800 } },
    { kind: 'bathroom.floorDrain', at: { x: mm(DRAIN_X), y: 0, z: mm(DRAIN_Z) } },
    {
      kind: 'bathroom.wetSheen',
      at: { x: mm(DRAIN_X), y: 0, z: mm(DRAIN_Z) },
      options: { radiusMm: 820, seed: 41 },
    },
    // The hair caught under the grate — the entire food economy of this room, made visible.
    {
      kind: 'bathroom.hairTangle',
      at: { x: mm(DRAIN_X + 70), y: 0, z: mm(DRAIN_Z + 80) },
      options: { seed: 7 },
    },

    // --- basin group, against the full-height south wall -------------------------------------
    { kind: 'bathroom.basinPedestal', at: { x: mm(BASIN_X), y: 0, z: mm(3610) }, occluder: true },
    {
      kind: 'bathroom.basinBowl',
      at: { x: mm(BASIN_X), y: mm(BASIN_TOP), z: mm(3520) },
      occluder: true,
      fadeFloor: 0.3,
    },
    {
      kind: 'bathroom.basinTap',
      at: { x: mm(BASIN_X), y: mm(BASIN_TOP), z: mm(3660) },
      occluder: true,
    },
    // The trap arm and the unsealed inspection hatch: the shortcut has to be legible before it is
    // useful, so both ends of the riser are physically drawn.
    {
      kind: 'bathroom.basinTrap',
      at: { x: mm(BASIN_X), y: 0, z: mm(3600) },
      options: { topMm: BASIN_TOP },
    },
    { kind: 'bathroom.chaseHatch', at: { x: mm(670), y: mm(240), z: mm(3620) }, rotY: -1.5708 },
    {
      kind: 'bathroom.mirrorCabinet',
      at: { x: mm(BASIN_X), y: mm(1180), z: mm(3680) },
      occluder: true,
      fadeFloor: 0.24,
    },
    { kind: 'bathroom.wallShelf', at: { x: mm(860), y: mm(SHELF_Y), z: mm(3660) }, occluder: true },
    // Bleach and spray cleaner. These two objects are the only justification the chemical-resistance
    // adaptation ever gets, so they sit under the light where they cannot be missed.
    {
      kind: 'bathroom.bleachBottle',
      at: { x: mm(690), y: mm(SHELF_Y), z: mm(3645) },
      occluder: true,
    },
    {
      kind: 'bathroom.sprayCleaner',
      at: { x: mm(1010), y: mm(SHELF_Y), z: mm(3650) },
      rotY: 0.42,
      occluder: true,
    },
    { kind: 'bathroom.soapDish', at: { x: mm(560), y: mm(BASIN_TOP), z: mm(3600) } },
    {
      kind: 'bathroom.toothbrushCup',
      at: { x: mm(1090), y: mm(BASIN_TOP), z: mm(3620) },
      occluder: true,
    },
    {
      kind: 'bathroom.groutSeam',
      at: { x: mm(1120), y: mm(BASIN_TOP), z: mm(3690) },
      options: { topMm: SHELF_Y },
    },

    // --- toilet group, against the full-height east wall -------------------------------------
    {
      kind: 'bathroom.toilet',
      at: { x: mm(2230), y: 0, z: mm(2160) },
      rotY: -1.5708,
      occluder: true,
      fadeFloor: 0.28,
    },
    {
      kind: 'bathroom.cistern',
      at: { x: mm(2480), y: 0, z: mm(2150) },
      occluder: true,
      fadeFloor: 0.28,
    },
    // The angle valve and braided hose that make the lid climbable.
    {
      kind: 'bathroom.cisternSupply',
      at: { x: mm(2555), y: 0, z: mm(2380) },
      options: { topMm: CISTERN_TOP },
    },
    { kind: 'bathroom.toiletBrush', at: { x: mm(1900), y: 0, z: mm(2580) }, occluder: true },
    { kind: 'bathroom.rubberGloves', at: { x: mm(1930), y: 0, z: mm(2530) }, rotY: 0.8 },
    {
      kind: 'bathroom.paperHolder',
      at: { x: mm(X1 - 30), y: mm(700), z: mm(1860) },
      occluder: true,
    },

    // --- shower corner -----------------------------------------------------------------------
    {
      kind: 'bathroom.showerTray',
      at: { x: mm(TRAY_X0), y: 0, z: mm(TRAY_Z0) },
      options: { widthMm: X1 - TRAY_X0, depthMm: Z1 - TRAY_Z0, lipMm: TRAY_LIP },
    },
    // Glass screen on the tray's open edge. The single largest occluder in the room and the reason
    // occlusion fading has to work here: the scout crosses behind it on every water run.
    {
      kind: 'bathroom.showerScreen',
      at: { x: mm(TRAY_X0), y: mm(TRAY_LIP), z: mm(3240) },
      occluder: true,
      fadeFloor: 0.16,
    },
    {
      kind: 'bathroom.showerRail',
      at: { x: mm(X1 - 60), y: mm(1500), z: mm(3200) },
      occluder: true,
    },
    {
      kind: 'bathroom.showerHead',
      at: { x: mm(X1 - 110), y: mm(1780), z: mm(3200) },
      occluder: true,
    },
    { kind: 'bathroom.showerHose', at: { x: mm(X1 - 80), y: mm(900), z: mm(3260) } },
    {
      kind: 'bathroom.shampooBottle',
      at: { x: mm(2400), y: mm(TRAY_LIP), z: mm(3600) },
      occluder: true,
    },
    {
      kind: 'bathroom.conditionerBottle',
      at: { x: mm(2520), y: mm(TRAY_LIP), z: mm(3620) },
      rotY: 0.5,
      occluder: true,
    },
    {
      kind: 'bathroom.bodyWash',
      at: { x: mm(2330), y: mm(TRAY_LIP), z: mm(3540) },
      occluder: true,
    },
    { kind: 'bathroom.soapBar', at: { x: mm(2180), y: mm(TRAY_LIP), z: mm(3630) } },
    {
      kind: 'bathroom.trayPuddle',
      at: { x: mm(1980), y: mm(TRAY_LIP), z: mm(3260) },
      options: { radiusMm: 430, seed: 19 },
    },

    // --- loose objects: this is what makes it a used bathroom rather than a sanitary diagram ----
    {
      kind: 'bathroom.plasticStool',
      at: { x: mm(1150), y: 0, z: mm(2640) },
      rotY: 0.35,
      occluder: true,
    },
    {
      kind: 'bathroom.washBowl',
      at: { x: mm(770), y: 0, z: mm(2390) },
      rotY: -0.22,
      occluder: true,
    },
    // The squeegee lives leaning in the slot between the pedestal and the tray, which is exactly
    // where a real one ends up.
    {
      kind: 'bathroom.squeegee',
      at: { x: mm(1270), y: 0, z: mm(3080) },
      rotY: 0.16,
      occluder: true,
    },
    {
      kind: 'bathroom.laundryHamper',
      at: { x: mm(460), y: 0, z: mm(2980) },
      occluder: true,
      fadeFloor: 0.3,
    },
    { kind: 'bathroom.slippers', at: { x: mm(640), y: 0, z: mm(1640) }, rotY: 0.55 },
    { kind: 'bathroom.towelRail', at: { x: mm(430), y: mm(1250), z: mm(3670) }, occluder: true },
    { kind: 'bathroom.hangingTowel', at: { x: mm(430), y: mm(1010), z: mm(3640) }, occluder: true },

    // --- ceiling: overhead, so never an occluder ---------------------------------------------
    { kind: 'bathroom.ceilingLight', at: { x: mm(1300), y: mm(2330), z: mm(2060) } },
    { kind: 'bathroom.ceilingVent', at: { x: mm(1900), y: mm(2350), z: mm(2900) } },
  ],

  lights: [
    {
      // The ceiling fixture. Off all night; when somebody comes in it is the harshest light in the
      // apartment and there is nothing on this floor to stand behind.
      kind: 'point',
      at: { x: mm(1300), y: mm(2280), z: mm(2060) },
      colour: 0xf2f6ff,
      intensity: 5.4,
      distance: mm(3800),
      routine: 'bathroom.use',
      castShadow: true,
    },
    {
      // Same fixture during a shower, dimmed and scattered by steam. Still enough to see a scout on
      // open tile — the shower's real threat is the water, not the light.
      kind: 'point',
      at: { x: mm(1300), y: mm(2280), z: mm(2060) },
      colour: 0xe6eef8,
      intensity: 3.6,
      distance: mm(3400),
      routine: 'bathroom.shower',
    },
    {
      // Standing all night: hallway spill through the 30 mm gap over the door sill. Weak, warm, and
      // it only reaches the first half-metre of tile — which makes the doorway the safest approach.
      kind: 'point',
      at: { x: mm(600), y: mm(240), z: mm(Z0 + 60) },
      colour: 0x8fa6c4,
      intensity: 0.5,
      distance: mm(1100),
    },
  ],

  exposureZones: [
    // Standing exposure: a wet room is a lit box with a reflective floor. Even at night the middle
    // of this room is more readable than the middle of the kitchen.
    {
      surface: 'bathroom.floor',
      rect: { x0: mm(700), z0: mm(1800), x1: mm(2100), z1: mm(3200) },
      level: 0.58,
    },
    // The doorway strip, lit by hallway spill.
    {
      surface: 'bathroom.floor',
      rect: { x0: mm(400), z0: mm(Z0), x1: mm(1200), z1: mm(1900) },
      level: 0.4,
    },
    // `bathroom.use`: light on, door shut, somebody standing in the middle of the only floor there
    // is. Near-total exposure — this is the region's danger, and it is exposure, not damage.
    {
      surface: 'bathroom.floor',
      rect: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },
      level: 1,
      routine: 'bathroom.use',
    },
    {
      surface: 'bathroom.basin',
      rect: { x0: mm(500), z0: mm(3330), x1: mm(1150), z1: mm(Z1) },
      level: 1,
      routine: 'bathroom.use',
    },
    {
      surface: 'bathroom.shelf',
      rect: { x0: mm(560), z0: mm(3600), x1: mm(1160), z1: mm(Z1) },
      level: 0.95,
      routine: 'bathroom.use',
    },
    // The lid is dry, high and beside somebody's shoulder. Not hidden — just not underfoot.
    {
      surface: 'bathroom.cistern',
      rect: { x0: mm(2360), z0: mm(TOILET_Z0), x1: mm(X1), z1: mm(2400) },
      level: 0.7,
      routine: 'bathroom.use',
    },
    // `bathroom.shower`: the tray and the whole fall line to the drain are being washed. Any route
    // laid across this band is scrubbed off the tiles, and the tray-lip satellite goes under.
    {
      surface: 'bathroom.tray',
      rect: { x0: mm(TRAY_X0), z0: mm(TRAY_Z0), x1: mm(X1), z1: mm(Z1) },
      level: 1,
      routine: 'bathroom.shower',
    },
    {
      surface: 'bathroom.floor',
      rect: { x0: mm(900), z0: mm(2100), x1: mm(X1), z1: mm(Z1) },
      level: 0.92,
      routine: 'bathroom.shower',
    },
  ],
};

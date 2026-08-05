import { mm } from '../units';
import type { RegionSpec } from '../types';

/**
 * Chapter 3 — the living room.
 *
 * This is the operational-complexity peak. The kitchen taught one route out of one nest; here the
 * food is deliberately scattered across four separate places at three different heights, and no
 * single route reaches more than two of them. The player has to split traffic, and splitting traffic
 * is what makes congestion, exposure and worker count start to matter at the same time.
 *
 * Three things carry the layout:
 *
 *  1. **The east-wall lane.** The TV stand and the sideboard both stand 110 mm off the wall, so a
 *     single unbroken 110 mm slot runs the entire 4200 mm of the east wall, joins the 90 mm gap
 *     behind the sofa back, and continues along the south wall behind the bookshelf. It is the only
 *     concealed way to cross the room, it is slow, and it is where the cable nest, the router and
 *     the power strip all live. Finding it is the room's "oh" moment.
 *  2. **The rug.** A real 2500 x 1510 mm rug thrown across the open floor, authored as a 0.25
 *     exposure patch. It is a second, much shorter covered corridor — but its east half is inside
 *     the television's glow, so while the TV is on the safe half of the rug is the west half only.
 *     That is the room's core routing decision, and it is made of furniture, not of numbers.
 *  3. **The robot vacuum dock.** The dock is authored here as a landmark; the machine itself is a
 *     director-spawned threat. Its patrol lane (z 1400..3020, east of the dock) is kept completely
 *     free of blockers so the threat has somewhere to run and the player can learn to read it.
 */

/* Room envelope, mm. The camera looks toward +X and +Z, so the north (-Z) and west (-X) walls stand
 * between the viewer and the room and are cut to stubs. The east and south walls are the backing:
 * the television goes on one, the sofa on the other. */
const X0 = 3400;
const X1 = 8000;
const Z0 = 1300;
const Z1 = 5500;

/** The east-wall service lane. Everything on the east wall is held this far off it. */
const EAST_LANE = 110;
const EAST_FACE = X1 - EAST_LANE; // 7890 — the back face of the TV stand and the sideboard.

/** The south-wall lane behind the sofa back and the bookshelf. */
const SOUTH_LANE = 90;
const SOUTH_FACE = Z1 - SOUTH_LANE; // 5410

/** Sofa: 2100 mm three-seater, 880 mm deep, seat cushions at 440 mm, on 110 mm legs. */
const SOFA_X0 = 4900;
const SOFA_X1 = 7000;
const SOFA_Z0 = SOUTH_FACE - 880; // 4530
const SOFA_SEAT_H = 440;

/** Coffee table: 1200 x 600, top at 420 mm, centred on the sofa with 330 mm of legroom. */
const TABLE_X0 = 5400;
const TABLE_X1 = 6600;
const TABLE_Z0 = 3600;
const TABLE_Z1 = 4200;
const TABLE_H = 420;

/** TV stand: 1600 long, 270 deep carcass, top board at 480 mm overhanging 100 mm at each end.
 * The overhang is the same idiom as the kitchen toe-kick — it is what lets a climb land on the top
 * at an XZ that is still walkable floor below. */
const TV_Z0 = 2700;
const TV_Z1 = 4300;
const TV_CARCASS_X0 = 7620;
const TV_TOP_H = 480;

export const LIVING: RegionSpec = {
  id: 'living',
  labelKey: 'region.living',
  bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },

  surfaces: [
    {
      id: 'living.floor',
      region: 'living',
      y: 0,
      bounds: { x0: mm(X0), z0: mm(Z0), x1: mm(X1), z1: mm(Z1) },
      exposure: 1,
      labelKey: 'surface.living.floor',
    },
    {
      // The sofa seat. Nobody wipes a sofa, so it is far less scanned than a worktop — but it is
      // also where a human body lands without warning, which the threat director uses.
      id: 'living.sofa.seat',
      region: 'living',
      y: mm(SOFA_SEAT_H),
      bounds: { x0: mm(SOFA_X0), z0: mm(SOFA_Z0), x1: mm(SOFA_X1), z1: mm(SOUTH_FACE) },
      exposure: 0.8,
      labelKey: 'surface.living.sofaseat',
    },
    {
      // The coffee table: the richest food in the room and the most watched plane in it. Everything
      // on it is directly under the household's eyeline while they sit.
      id: 'living.table.top',
      region: 'living',
      y: mm(TABLE_H),
      bounds: { x0: mm(TABLE_X0), z0: mm(TABLE_Z0), x1: mm(TABLE_X1), z1: mm(TABLE_Z1) },
      exposure: 1.3,
      labelKey: 'surface.living.tabletop',
    },
    {
      // The TV stand top board. Overhangs the carcass by 100 mm at the front and 50 mm at the back,
      // so both the front recess and the rear lane can reach it.
      id: 'living.tvstand.top',
      region: 'living',
      y: mm(TV_TOP_H),
      bounds: { x0: mm(7520), z0: mm(TV_Z0), x1: mm(7940), z1: mm(TV_Z1) },
      exposure: 1.15,
      labelKey: 'surface.living.tvstand',
    },
  ],

  /* Nothing under the sofa or the coffee table is blocked — the voids are the point. Only the legs
   * are solid, and every wall-standing carcass is held off its wall so the perimeter lane never
   * breaks. Check this list against the walls before adding anything: a single flush cabinet would
   * cut the east lane and delete the room's best route. */
  blockers: [
    // Sofa legs. 100 mm squares at the four corners; everything between them is the prime void.
    { surface: 'living.floor', rect: { x0: mm(4940), z0: mm(4570), x1: mm(5040), z1: mm(4670) } },
    { surface: 'living.floor', rect: { x0: mm(6860), z0: mm(4570), x1: mm(6960), z1: mm(4670) } },
    { surface: 'living.floor', rect: { x0: mm(4940), z0: mm(5270), x1: mm(5040), z1: mm(5370) } },
    { surface: 'living.floor', rect: { x0: mm(6860), z0: mm(5270), x1: mm(6960), z1: mm(5370) } },
    // Coffee table legs. 80 mm, inset, so the underside stays a usable relay.
    { surface: 'living.floor', rect: { x0: mm(5440), z0: mm(3640), x1: mm(5520), z1: mm(3720) } },
    { surface: 'living.floor', rect: { x0: mm(6480), z0: mm(3640), x1: mm(6560), z1: mm(3720) } },
    { surface: 'living.floor', rect: { x0: mm(5440), z0: mm(4080), x1: mm(5520), z1: mm(4160) } },
    { surface: 'living.floor', rect: { x0: mm(6480), z0: mm(4080), x1: mm(6560), z1: mm(4160) } },
    // TV stand carcass — back face at 7890, leaving the 110 mm cable lane against the wall.
    {
      surface: 'living.floor',
      rect: { x0: mm(TV_CARCASS_X0), z0: mm(TV_Z0), x1: mm(EAST_FACE), z1: mm(TV_Z1) },
    },
    // Low sideboard unit, same 110 mm standoff so the lane runs straight past it.
    {
      surface: 'living.floor',
      rect: { x0: mm(7700), z0: mm(1520), x1: mm(EAST_FACE), z1: mm(2480) },
    },
    // Bookshelf on the south wall — stops 90 mm short of the wall and 110 mm short of the corner.
    {
      surface: 'living.floor',
      rect: { x0: mm(7150), z0: mm(5240), x1: mm(7880), z1: mm(SOUTH_FACE) },
    },
    { surface: 'living.floor', rect: { x0: mm(7150), z0: mm(4620), x1: mm(7420), z1: mm(4890) } },
    { surface: 'living.floor', rect: { x0: mm(4200), z0: mm(4900), x1: mm(4500), z1: mm(5200) } },
    // Drying rack: two foot rails only. A cockroach walks straight under it; the household cannot.
    { surface: 'living.floor', rect: { x0: mm(3500), z0: mm(3200), x1: mm(4200), z1: mm(3270) } },
    { surface: 'living.floor', rect: { x0: mm(3500), z0: mm(3830), x1: mm(4200), z1: mm(3900) } },
    { surface: 'living.floor', rect: { x0: mm(3490), z0: mm(4300), x1: mm(3920), z1: mm(4730) } },
    // Robot dock: 80 mm off the west wall for its cable, so the west lane survives, and its east
    // face stops at 3720 so the patrol lane in front of it starts genuinely clear.
    { surface: 'living.floor', rect: { x0: mm(3480), z0: mm(1700), x1: mm(3720), z1: mm(2050) } },
    { surface: 'living.floor', rect: { x0: mm(3480), z0: mm(2940), x1: mm(3660), z1: mm(3120) } },
    { surface: 'living.floor', rect: { x0: mm(7560), z0: mm(4820), x1: mm(7860), z1: mm(5120) } },
    { surface: 'living.floor', rect: { x0: mm(4560), z0: mm(4820), x1: mm(4720), z1: mm(4980) } },
    // On the sofa: both armrests and the back cushions. The 70 mm strip between the seat cushions
    // and the back cushions stays walkable — that seam is where everything that gets dropped ends up.
    {
      surface: 'living.sofa.seat',
      rect: { x0: mm(SOFA_X0), z0: mm(SOFA_Z0), x1: mm(5090), z1: mm(SOUTH_FACE) },
    },
    {
      surface: 'living.sofa.seat',
      rect: { x0: mm(6810), z0: mm(SOFA_Z0), x1: mm(SOFA_X1), z1: mm(SOUTH_FACE) },
    },
    {
      surface: 'living.sofa.seat',
      rect: { x0: mm(5090), z0: mm(5200), x1: mm(6810), z1: mm(SOUTH_FACE) },
    },
    // On the coffee table: the tissue box and the base of the glass.
    {
      surface: 'living.table.top',
      rect: { x0: mm(6300), z0: mm(3630), x1: mm(6520), z1: mm(3800) },
    },
    {
      surface: 'living.table.top',
      rect: { x0: mm(5640), z0: mm(3980), x1: mm(5750), z1: mm(4090) },
    },
    // On the TV stand: the television's foot.
    {
      surface: 'living.tvstand.top',
      rect: { x0: mm(7660), z0: mm(3120), x1: mm(7830), z1: mm(3900) },
    },
  ],

  links: [
    {
      // The television's power lead, dropping off the back board into the cable nest. Single file,
      // and it is the only way onto the stand that does not cross the lit floor in front of the TV.
      id: 'living.cable.tvpower',
      from: 'living.floor',
      to: 'living.tvstand.top',
      at: { x: mm(7915), z: mm(3450) },
      seconds: 2.8,
      capacity: 1,
      kind: 'cable',
      labelKey: 'link.living.tvcable',
    },
    {
      // Sofa foreleg. Slow, one at a time, and completely in the open at the front of the sofa.
      id: 'living.leg.sofa',
      from: 'living.floor',
      to: 'living.sofa.seat',
      at: { x: mm(6720), z: mm(4570) },
      seconds: 2.2,
      capacity: 1,
      kind: 'leg',
      labelKey: 'link.living.sofaleg',
    },
    {
      // A blanket left over the left armrest. Twice the capacity of the leg and faster — but it is
      // the first thing folded away, so a route built on it is a route built on a household habit.
      id: 'living.fabric.throw',
      from: 'living.floor',
      to: 'living.sofa.seat',
      at: { x: mm(5150), z: mm(4790) },
      seconds: 1.7,
      capacity: 2,
      kind: 'fabric',
      labelKey: 'link.living.throw',
    },
    {
      // Coffee table leg. Short climb, but it lands on the most exposed plane in the room.
      id: 'living.leg.table',
      from: 'living.floor',
      to: 'living.table.top',
      at: { x: mm(6580), z: mm(3690) },
      seconds: 1.9,
      capacity: 1,
      kind: 'leg',
      labelKey: 'link.living.tableleg',
    },
  ],

  /* Four separate clusters at three heights: the table (rich, loud, high), the sofa (steady, hidden),
   * the west wall by the dog bowl (the only real water), and the cable nest (small, secret). One
   * route cannot serve them. */
  resources: [
    {
      // Half-open snack bag, folded over rather than clipped. The best food in the apartment so far
      // and the loudest thing the colony can touch — a torn bag is evidence the household finds.
      id: 'living.snackbag',
      region: 'living',
      surface: 'living.table.top',
      at: { x: mm(6040), z: mm(3900) },
      kind: 'food',
      amount: 201,
      rate: 2.4,
      disturbance: 0.5,
      labelKey: 'resource.living.snackbag',
      refilledBy: 'living.tv',
    },
    {
      // The ring of condensation the glass left. Small, silent, and the only water on this side of
      // the room — the reason a table route exists at all once the bag is gone.
      id: 'living.glassring',
      region: 'living',
      surface: 'living.table.top',
      at: { x: mm(5610), z: mm(4120) },
      kind: 'moisture',
      amount: 58,
      rate: 1.2,
      disturbance: 0.03,
      labelKey: 'resource.living.glassring',
      refilledBy: 'living.tv',
    },
    {
      // Crumbs driven into the seam between seat and back cushions. Medium yield, nearly silent,
      // and it sits directly on top of the sofa void — the cheapest sustainable route in the room.
      id: 'living.seamcrumbs',
      region: 'living',
      surface: 'living.sofa.seat',
      at: { x: mm(5900), z: mm(5165) },
      kind: 'food',
      amount: 109,
      rate: 1.6,
      disturbance: 0.14,
      labelKey: 'resource.living.seamcrumbs',
      refilledBy: 'living.tv',
    },
    {
      // A single grain of rice that rolled under the sofa weeks ago. Trivial, but it is inside the
      // void, so it teaches that scouting a dark place pays before the player trusts dark places.
      id: 'living.ricegrain',
      region: 'living',
      surface: 'living.floor',
      at: { x: mm(5640), z: mm(4900) },
      kind: 'food',
      amount: 51,
      rate: 1.0,
      disturbance: 0.01,
      labelKey: 'resource.living.ricegrain',
      hidden: true,
    },
    {
      // The wet rim and spill around the dog's bowl. Refilled every morning, which makes the west
      // wall worth holding long-term even though it is the furthest point from the sofa.
      id: 'living.dogbowl',
      region: 'living',
      surface: 'living.floor',
      at: { x: mm(3570), z: mm(3190) },
      kind: 'moisture',
      amount: 163,
      rate: 2.2,
      disturbance: 0.06,
      labelKey: 'resource.living.dogbowl',
      refilledBy: 'living.petcare',
    },
    {
      // Kibble the dog knocked out of the bowl. Steady food, but it is on open floor in the robot's
      // patrol lane, so it is only cheap while the machine is docked.
      id: 'living.kibble',
      region: 'living',
      surface: 'living.floor',
      at: { x: mm(3800), z: mm(3080) },
      kind: 'food',
      amount: 88,
      rate: 1.4,
      disturbance: 0.08,
      labelKey: 'resource.living.kibble',
      refilledBy: 'living.petcare',
    },
    {
      // A sticky patch behind the TV stand that nobody has ever been able to reach to clean. Hidden,
      // small, and entirely inside the east lane — the reward for finding the lane.
      id: 'living.sodaspill',
      region: 'living',
      surface: 'living.floor',
      at: { x: mm(7945), z: mm(3760) },
      kind: 'moisture',
      amount: 75,
      rate: 1.3,
      disturbance: 0.05,
      labelKey: 'resource.living.sodaspill',
      hidden: true,
    },
  ],

  footholds: [
    {
      // The sofa void: 2100 x 880 of unlit, undisturbed, fabric-roofed floor with a 90 mm entrance
      // behind the back. The best satellite in the apartment and the anchor of the whole chapter.
      id: 'living.sofavoid',
      region: 'living',
      surface: 'living.floor',
      at: { x: mm(5950), z: mm(4970) },
      role: 'satellite',
      labelKey: 'foothold.living.sofavoid',
      descriptionKey: 'foothold.living.sofavoid.desc',
      capacity: 8,
      concealment: 0.9,
      cost: { food: 34, moisture: 20, workers: 3 },
    },
    {
      // The cable nest behind the TV stand. Warm, dark, permanently occupied by dust and wiring —
      // and it is the north anchor of the east lane, which is what makes the lane a route.
      id: 'living.tvback',
      region: 'living',
      surface: 'living.floor',
      at: { x: mm(7945), z: mm(2880) },
      role: 'relay',
      labelKey: 'foothold.living.tvback',
      descriptionKey: 'foothold.living.tvback.desc',
      capacity: 4,
      concealment: 0.66,
      cost: { food: 20, moisture: 12, workers: 2 },
    },
    {
      // The split skirting board beside the balcony door threshold. Damp from condensation, out of
      // the robot's reach, and the far end of the south-wall lane.
      id: 'living.balconygap',
      region: 'living',
      surface: 'living.floor',
      at: { x: mm(3600), z: mm(5450) },
      role: 'satellite',
      labelKey: 'foothold.living.balconygap',
      descriptionKey: 'foothold.living.balconygap.desc',
      capacity: 6,
      concealment: 0.78,
      cost: { food: 26, moisture: 16, workers: 2 },
    },
    {
      // The underside of the coffee table: a relay in the middle of open floor. Barely conceals
      // anything, but it halves the trip to the snack bag. That trade is the chapter's argument.
      id: 'living.tableunder',
      region: 'living',
      surface: 'living.floor',
      at: { x: mm(6000), z: mm(3900) },
      role: 'relay',
      labelKey: 'foothold.living.tableunder',
      descriptionKey: 'foothold.living.tableunder.desc',
      capacity: 3,
      concealment: 0.44,
      cost: { food: 14, moisture: 9, workers: 1 },
    },
  ],

  walls: [
    // North (-Z, nearest the camera) — cut to a stub. The wide opening onto the hallway.
    {
      from: { x: mm(X0), z: mm(Z0) },
      to: { x: mm(X1), z: mm(Z0) },
      outward: { x: 0, z: -1 },
      openings: [{ start: mm(800), width: mm(1600), height: mm(2050) }],
    },
    // West — also near the camera. Solid: the robot dock and the drying rack stand against it.
    { from: { x: mm(X0), z: mm(Z0) }, to: { x: mm(X0), z: mm(Z1) }, outward: { x: -1, z: 0 } },
    // East — full height, blank, and the whole reason the television reads as the room's focus.
    {
      from: { x: mm(X1), z: mm(Z0) },
      to: { x: mm(X1), z: mm(Z1) },
      outward: { x: 1, z: 0 },
    },
    // South — the balcony wall. Full height, with the sliding door at its west end; the sofa backs
    // onto the rest of it.
    {
      from: { x: mm(X0), z: mm(Z1) },
      to: { x: mm(X1), z: mm(Z1) },
      outward: { x: 0, z: 1 },
      openings: [{ start: mm(100), width: mm(1300), height: mm(2150) }],
    },
  ],

  props: [
    {
      kind: 'living.rug',
      at: { x: mm(6050), y: 0, z: mm(3805) },
      options: { widthMm: 2500, depthMm: 1510, seed: 19 },
    },
    {
      kind: 'living.sofa',
      at: { x: mm(5950), y: 0, z: mm(4970) },
      options: { lengthMm: 2100, depthMm: 880, seatMm: SOFA_SEAT_H, legMm: 110 },
      occluder: true,
      fadeFloor: 0.28,
    },
    {
      kind: 'living.sofaCushion',
      at: { x: mm(5400), y: mm(SOFA_SEAT_H), z: mm(4830) },
      rotY: 0.06,
      occluder: true,
    },
    {
      kind: 'living.sofaCushion',
      at: { x: mm(6500), y: mm(SOFA_SEAT_H), z: mm(4830) },
      rotY: -0.09,
      occluder: true,
    },
    // The blanket that motivates the fabric climb. If it is not visible, the link is a lie.
    {
      kind: 'living.sofaThrow',
      at: { x: mm(5150), y: mm(SOFA_SEAT_H), z: mm(4800) },
      rotY: 0.12,
      occluder: true,
    },
    {
      kind: 'living.crumbSeam',
      at: { x: mm(5900), y: mm(SOFA_SEAT_H), z: mm(5165) },
      options: { seed: 23 },
    },
    {
      kind: 'living.coffeeTable',
      at: { x: mm(6000), y: 0, z: mm(3900) },
      options: { lengthMm: 1200, depthMm: 600, topMm: TABLE_H },
      occluder: true,
      fadeFloor: 0.34,
    },
    {
      kind: 'living.tissueBox',
      at: { x: mm(6410), y: mm(TABLE_H), z: mm(3715) },
      rotY: -0.15,
      occluder: true,
    },
    { kind: 'living.drinkGlass', at: { x: mm(5695), y: mm(TABLE_H), z: mm(4035) }, occluder: true },
    {
      kind: 'living.glassRing',
      at: { x: mm(5610), y: mm(TABLE_H), z: mm(4120) },
      options: { radiusMm: 52 },
    },
    {
      kind: 'living.snackBag',
      at: { x: mm(6040), y: mm(TABLE_H), z: mm(3900) },
      rotY: 0.5,
      occluder: true,
    },
    { kind: 'living.remote', at: { x: mm(5900), y: mm(TABLE_H), z: mm(3680) }, rotY: 0.9 },
    { kind: 'living.magazineStack', at: { x: mm(5540), y: mm(TABLE_H), z: mm(4050) }, rotY: -0.25 },
    {
      kind: 'living.tvStand',
      at: { x: mm(7755), y: 0, z: mm(3500) },
      options: { lengthMm: 1600, depthMm: 270, topMm: TV_TOP_H, overhangMm: 100 },
      occluder: true,
      fadeFloor: 0.3,
    },
    {
      kind: 'living.television',
      at: { x: mm(7745), y: mm(TV_TOP_H), z: mm(3510) },
      rotY: -1.57,
      options: { diagonalMm: 1400 },
      occluder: true,
      fadeFloor: 0.24,
    },
    {
      kind: 'living.cableNest',
      at: { x: mm(7945), y: 0, z: mm(3300) },
      options: { seed: 7, lengthMm: 900 },
    },
    { kind: 'living.powerStrip', at: { x: mm(7945), y: 0, z: mm(4050) }, rotY: 1.57 },
    { kind: 'living.sodaStain', at: { x: mm(7945), y: 0, z: mm(3760) }, options: { radiusMm: 90 } },
    {
      kind: 'living.sideboard',
      at: { x: mm(7795), y: 0, z: mm(2000) },
      options: { lengthMm: 960, depthMm: 190, topMm: 560 },
      occluder: true,
      fadeFloor: 0.3,
    },
    {
      kind: 'living.router',
      at: { x: mm(7790), y: mm(560), z: mm(1900) },
      rotY: -1.57,
      occluder: true,
    },
    {
      kind: 'living.pictureFrame',
      at: { x: mm(7960), y: mm(1250), z: mm(2000) },
      rotY: -1.57,
      occluder: true,
    },
    {
      kind: 'living.bookshelf',
      at: { x: mm(7515), y: 0, z: mm(5325) },
      options: { lengthMm: 730, depthMm: 170, heightMm: 1100 },
      occluder: true,
      fadeFloor: 0.3,
    },
    {
      kind: 'living.bookRow',
      at: { x: mm(7515), y: mm(760), z: mm(5325) },
      options: { seed: 3 },
      occluder: true,
    },
    { kind: 'living.pottedPlant', at: { x: mm(7710), y: 0, z: mm(4970) }, occluder: true },
    {
      kind: 'living.airPurifier',
      at: { x: mm(7285), y: 0, z: mm(4755) },
      rotY: -1.2,
      occluder: true,
    },
    {
      kind: 'living.standingFan',
      at: { x: mm(4350), y: 0, z: mm(5050) },
      rotY: 0.3,
      occluder: true,
    },
    {
      kind: 'living.floorLamp',
      at: { x: mm(4640), y: 0, z: mm(4900) },
      occluder: true,
      fadeFloor: 0.35,
    },
    {
      kind: 'living.dryingRack',
      at: { x: mm(3850), y: 0, z: mm(3550) },
      options: { widthMm: 700, depthMm: 700, heightMm: 1000 },
      occluder: true,
      fadeFloor: 0.4,
    },
    {
      kind: 'living.laundryBasket',
      at: { x: mm(3705), y: 0, z: mm(4515) },
      rotY: -0.2,
      occluder: true,
    },
    // The landmark. The machine that lives in it is spawned by the director, not authored here.
    {
      kind: 'living.robotDock',
      at: { x: mm(3600), y: 0, z: mm(1875) },
      rotY: 1.57,
      occluder: true,
    },
    { kind: 'living.dogBowl', at: { x: mm(3570), y: 0, z: mm(3030) } },
    {
      kind: 'living.kibbleScatter',
      at: { x: mm(3800), y: 0, z: mm(3080) },
      options: { seed: 31, radiusMm: 220 },
    },
    { kind: 'living.dogToyBall', at: { x: mm(4560), y: 0, z: mm(2450) } },
    { kind: 'living.slipperPair', at: { x: mm(4600), y: 0, z: mm(1520) }, rotY: 0.25 },
    { kind: 'living.riceGrain', at: { x: mm(5640), y: 0, z: mm(4900) } },
    { kind: 'living.dustBunny', at: { x: mm(6300), y: 0, z: mm(5060) }, options: { seed: 13 } },
    {
      kind: 'living.balconyDoor',
      at: { x: mm(4150), y: 0, z: mm(5490) },
      options: { widthMm: 1300, heightMm: 2150 },
    },
    {
      kind: 'living.curtain',
      at: { x: mm(4150), y: mm(2150), z: mm(5430) },
      occluder: true,
      fadeFloor: 0.35,
    },
    {
      kind: 'living.airconWall',
      at: { x: mm(7940), y: mm(1950), z: mm(2100) },
      rotY: -1.57,
      occluder: true,
      fadeFloor: 0.4,
    },
    // Off all night. Authored anyway, because a ceiling with nothing on it reads as a diagram.
    {
      kind: 'living.ceilingPendant',
      at: { x: mm(5900), y: mm(2280), z: mm(3400) },
      occluder: true,
      fadeFloor: 0.5,
    },
  ],

  /* Night. The only standing light is what comes through the balcony glass plus three standby LEDs;
   * everything brighter is a routine. Total standing intensity is 2.17. */
  lights: [
    {
      // Street light and moon through the balcony sliding door — the room's one standing light, and
      // the reason the west end of the floor is never truly safe.
      kind: 'rect',
      at: { x: mm(4150), y: mm(1080), z: mm(Z1 - 40) },
      colour: 0x8ea6cc,
      intensity: 1.4,
      width: mm(1300),
      height: mm(2150),
    },
    {
      // The television. Its glow is the room's dominant light whenever it is on, and it is also the
      // exposure zone that cuts the rug corridor in half.
      kind: 'rect',
      at: { x: mm(7700), y: mm(950), z: mm(3510) },
      colour: 0xbcd4ff,
      intensity: 3.4,
      width: mm(1150),
      height: mm(650),
      routine: 'living.tv',
    },
    {
      // Floor lamp beside the sofa. On only while somebody is reading there.
      kind: 'point',
      at: { x: mm(4640), y: mm(1420), z: mm(4900) },
      colour: 0xffcf9a,
      intensity: 3.0,
      distance: mm(2200),
      routine: 'living.reading',
    },
    {
      kind: 'point',
      at: { x: mm(7945), y: mm(70), z: mm(4050) },
      colour: 0xff4d3a,
      intensity: 0.3,
      distance: mm(420),
    },
    {
      kind: 'point',
      at: { x: mm(7790), y: mm(600), z: mm(1900) },
      colour: 0x66ff9c,
      intensity: 0.22,
      distance: mm(360),
    },
    {
      kind: 'point',
      at: { x: mm(3640), y: mm(80), z: mm(1875) },
      colour: 0x7fd0ff,
      intensity: 0.25,
      distance: mm(400),
    },
  ],

  /* Standing zones are authored DISJOINT: if the seeder takes the highest active zone, a bright
   * rectangle overlapping the rug would silently delete the corridor. Routine zones may overlap —
   * that is exactly how the television takes the east half of the rug away. */
  exposureZones: [
    // The entry and the robot's patrol lane: wide open floor, hallway light spilling in, nothing to
    // hide under. Kept free of blockers so the vacuum has room to run.
    {
      surface: 'living.floor',
      rect: { x0: mm(3720), z0: mm(1400), x1: mm(7500), z1: mm(3020) },
      level: 0.68,
    },
    // The rug. The discovery: a covered corridor across the middle of the room.
    {
      surface: 'living.floor',
      rect: { x0: mm(4800), z0: mm(3050), x1: mm(7300), z1: mm(4560) },
      level: 0.25,
    },
    // Bare floor between the rug edge and the TV stand recess.
    {
      surface: 'living.floor',
      rect: { x0: mm(7300), z0: mm(3020), x1: mm(TV_CARCASS_X0), z1: mm(4900) },
      level: 0.5,
    },
    // The balcony spill, west of the sofa.
    {
      surface: 'living.floor',
      rect: { x0: mm(3450), z0: mm(3900), x1: mm(4800), z1: mm(5450) },
      level: 0.6,
    },
    // TV on: the glow reaches across the east half of the rug. The safe corridor shrinks to the
    // west half, and a route that ignored this is suddenly running through light.
    {
      surface: 'living.floor',
      rect: { x0: mm(6600), z0: mm(2900), x1: mm(TV_CARCASS_X0), z1: mm(4700) },
      level: 0.85,
      routine: 'living.tv',
    },
    {
      surface: 'living.table.top',
      rect: { x0: mm(TABLE_X0), z0: mm(TABLE_Z0), x1: mm(TABLE_X1), z1: mm(TABLE_Z1) },
      level: 0.55,
    },
    {
      surface: 'living.table.top',
      rect: { x0: mm(TABLE_X0), z0: mm(TABLE_Z0), x1: mm(TABLE_X1), z1: mm(TABLE_Z1) },
      level: 1,
      routine: 'living.tv',
    },
    {
      surface: 'living.sofa.seat',
      rect: { x0: mm(SOFA_X0), z0: mm(SOFA_Z0), x1: mm(SOFA_X1), z1: mm(SOUTH_FACE) },
      level: 0.9,
      routine: 'living.tv',
    },
    {
      surface: 'living.tvstand.top',
      rect: { x0: mm(7520), z0: mm(TV_Z0), x1: mm(7940), z1: mm(TV_Z1) },
      level: 0.45,
    },
    {
      surface: 'living.tvstand.top',
      rect: { x0: mm(7520), z0: mm(TV_Z0), x1: mm(7940), z1: mm(TV_Z1) },
      level: 1,
      routine: 'living.tv',
    },
  ],
};

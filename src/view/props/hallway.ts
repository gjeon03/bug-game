import * as THREE from 'three';
import { mm } from '../../world/units';
import {
  at,
  blob,
  box,
  cylinder,
  drape,
  group,
  patch,
  ring,
  rot,
  roundedBox,
  scatter,
  shadows,
  sphere,
  tube,
  type Kit,
} from '../shapes';
import { bool, num, str, type PropRegistry } from './registry';

/**
 * Chapter 2 props — the hallway (복도).
 *
 * The corridor has to be named from its objects alone, so the silhouette budget is spent on the
 * four things that only ever appear in a Korean entrance hall: the sunken 현관 tile with its
 * threshold, the 신발장 with shoes kicked off in front of it, the leaning 전신거울, and the
 * 도어록 keypad on a steel front door. Everything else is a route landmark first and dressing
 * second — the charger cable, the parcel stack and the baseboard gap are read at scout eye level,
 * 3 mm off the floor, which is why their bottom 20 mm carries more detail than their tops.
 */

/** 걸레받이 dimensions, and the floor gap under it that the colony actually travels in. */
const BASEBOARD_H = 90;
const BASEBOARD_D = 14;
const BASEBOARD_GAP = 4;

/** Door frames are one carcass reused four times; the wall is 120 mm through. */
const FRAME_D = 120;
const JAMB_W = 40;

/** Long runs are placed at a corner and extend along `axis`; everything else is base-centred. */
function alongAxis(axis: string, along: number, across: number): readonly [number, number] {
  return axis === 'z' ? [across, along] : [along, across];
}

/**
 * A shoe: sole, upper, and a dark opening.
 *
 * The opening is the whole reason a shoe reads as a shoe from above rather than as a lozenge, and
 * from a 45° camera it is most of what the player sees, so it is authored as real recessed geometry
 * rather than a dark face.
 */
function shoe(
  kit: Kit,
  lengthMm: number,
  widthMm: number,
  upper: THREE.Material,
  sole: THREE.Material,
  collar: THREE.Material,
): THREE.Group {
  const toe = at(blob(kit, widthMm * 0.54, 0.66, upper), lengthMm * 0.32, 22, 0);
  toe.scale.x = 1.6;
  return group(
    at(roundedBox(kit, lengthMm, 13, widthMm * 0.94, sole, 2.5), 0, 6.5, 0),
    at(roundedBox(kit, lengthMm * 0.5, 36, widthMm * 0.9, upper, 6), lengthMm * 0.14, 30, 0),
    toe,
    at(blob(kit, widthMm * 0.52, 0.94, upper), -lengthMm * 0.28, 26, 0),
    at(rot(ring(kit, widthMm * 0.34, 4.5, collar), -Math.PI / 2, 0, 0), -lengthMm * 0.2, 52, 0),
    at(blob(kit, widthMm * 0.3, 0.2, kit.materials.get('grime')), -lengthMm * 0.2, 46, 0),
  );
}

/** A shipping carton. Tape and label are what stop three stacked boxes reading as three blocks. */
function carton(kit: Kit, wMm: number, hMm: number, dMm: number): THREE.Group {
  const tape = kit.materials.clone('cardboard', 0x8d7a5e);
  return group(
    at(roundedBox(kit, wMm, hMm, dMm, 'cardboard', 2.5), 0, hMm / 2, 0),
    at(box(kit, 52, 1.5, dMm + 3, tape), 0, hMm + 0.5, 0),
    at(box(kit, 52, hMm * 0.5, 1.5, tape), 0, hMm * 0.75, -dMm / 2 - 0.6),
    at(rot(box(kit, 104, 1.2, 74, 'paper'), 0, 0.06, 0), wMm * 0.18, hMm + 1.4, dMm * 0.16),
  );
}

/** The three-piece casing round a doorway. Built per face — the corridor side is not known here. */
function casing(kit: Kit, wMm: number, hMm: number, bandMm: number, zMm: number): THREE.Group {
  const legX = wMm / 2 + JAMB_W + bandMm / 2 - 6;
  return group(
    at(roundedBox(kit, bandMm, hMm + JAMB_W, 16, 'skirting', 2), -legX, (hMm + JAMB_W) / 2, zMm),
    at(roundedBox(kit, bandMm, hMm + JAMB_W, 16, 'skirting', 2), legX, (hMm + JAMB_W) / 2, zMm),
    at(
      roundedBox(kit, wMm + (JAMB_W + bandMm) * 2 - 12, bandMm, 16, 'skirting', 2),
      0,
      hMm + JAMB_W + bandMm / 2 - 6,
      zMm,
    ),
  );
}

export const HALLWAY_PROPS: PropRegistry = {
  /* --- Shell --- */

  'hallway.floorRun': (kit, options) => {
    const length = num(options, 'lengthMm', 9800);
    const width = num(options, 'widthMm', 1600);
    const axis = str(options, 'axis', 'x');
    const [sx, sz] = alongAxis(axis, length, width);
    const g = group(at(patch(kit, sx, sz, 'floorVinyl'), sx / 2, 0.4, sz / 2));
    // 장판 comes off an 1800 mm roll. The welded seams are the only continuous lines on 9.8 m of
    // otherwise featureless floor, so a scout can tell how far down the corridor it has got.
    for (let s = 1800; s < length; s += 1800) {
      const [dx, dz] = alongAxis(axis, s, width / 2);
      const [w, d] = alongAxis(axis, 3, width);
      g.add(at(box(kit, w, 0.8, d, 'grout'), dx, 0.7, dz));
    }
    for (let i = 0; i < 6; i++) {
      const [dx, dz] = alongAxis(axis, kit.rand() * length, width * (0.25 + kit.rand() * 0.5));
      const s = 90 + kit.rand() * 220;
      g.add(at(patch(kit, s, s * 0.6, 'grime'), dx, 0.9, dz));
    }
    return shadows(g, false, true);
  },

  'hallway.baseboard': (kit, options) => {
    const length = num(options, 'lengthMm', 9800);
    const axis = str(options, 'axis', 'x');
    const facing = num(options, 'facing', 1);
    const off = (facing * BASEBOARD_D) / 2;
    const [bx, bz] = alongAxis(axis, length, BASEBOARD_D);
    const [ox, oz] = alongAxis(axis, length / 2, off);
    const g = group(
      at(roundedBox(kit, bx, BASEBOARD_H, bz, 'skirting', 1.5), ox, BASEBOARD_GAP + 45, oz),
    );
    // The gap between board and 장판 is the colony's motorway. It is authored as a real slot, not a
    // dark stripe, because the player has to be able to see a worker disappear into it.
    const [gx, gz] = alongAxis(axis, length, BASEBOARD_D - 3);
    const [gox, goz] = alongAxis(axis, length / 2, (facing * (BASEBOARD_D - 3)) / 2);
    g.add(at(box(kit, gx, BASEBOARD_GAP, gz, 'grime'), gox, BASEBOARD_GAP / 2, goz));
    const [cx, cz] = alongAxis(axis, length, 5);
    const [cox, coz] = alongAxis(axis, length / 2, facing * (BASEBOARD_D - 1));
    g.add(at(roundedBox(kit, cx, 7, cz, 'skirting', 1), cox, BASEBOARD_GAP + 88, coz));
    // Scuff marks where a vacuum or a shoe has hit the same board for years.
    for (let i = 0; i < 7; i++) {
      const [sx, sz] = alongAxis(axis, kit.rand() * length, facing * (BASEBOARD_D + 0.6));
      const [mx, mz] = alongAxis(axis, 60 + kit.rand() * 90, 1);
      g.add(at(box(kit, mx, 16 + kit.rand() * 20, mz, 'grime'), sx, 22, sz));
    }
    return shadows(g, true, true);
  },

  'hallway.ceilingLightOff': (kit) => {
    // Origin is the ceiling plane, so the canopy is built upward into the slab and the diffuser
    // hangs below it: the fixture reads as fitted rather than floating under the ceiling.
    const g = group(
      at(cylinder(kit, 150, 156, 60, 'plasticWhite', 20), 0, 30, 0),
      at(rot(ring(kit, 186, 7, 'plasticWhite'), -Math.PI / 2, 0, 0), 0, -4, 0),
      at(cylinder(kit, 190, 186, 46, 'glassFrosted', 24), 0, -25, 0),
      at(cylinder(kit, 168, 168, 4, 'plasticWhite', 20), 0, -8, 0),
      at(box(kit, 240, 3, 16, 'screenOff'), 0, -12, -40),
      at(box(kit, 240, 3, 16, 'screenOff'), 0, -12, 40),
      at(cylinder(kit, 6, 6, 8, 'steelBrushed', 8), 90, -3, 0),
    );
    return shadows(g, true, false);
  },

  /* --- 현관 --- */

  'hallway.entryTile': (kit, options) => {
    const length = num(options, 'lengthMm', 720);
    const width = num(options, 'widthMm', 1600);
    const drop = num(options, 'dropMm', 120);
    const g = group(at(box(kit, length, 20, width, 'grout'), length / 2, -drop - 18, width / 2));
    // Porcelain 현관 tile, laid by hand and never perfectly flush — the 0.4 mm step between tiles
    // is what catches the doorlock LED and stops this reading as a painted rectangle.
    const cols = 2;
    const rows = 4;
    const gap = 6;
    const tw = (length - gap * (cols + 1)) / cols;
    const td = (width - gap * (rows + 1)) / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const t = box(kit, tw, 12, td, 'tileFloor');
        const lift = kit.rand() * 0.8;
        g.add(
          at(t, gap + tw / 2 + c * (tw + gap), -drop - 6 + lift, gap + td / 2 + r * (td + gap)),
        );
      }
    }
    g.add(at(patch(kit, 160, 220, 'grime'), length * 0.35, -drop + 0.6, width * 0.62));
    return shadows(g, false, true);
  },

  'hallway.entryStep': (kit, options) => {
    const span = num(options, 'widthMm', 1600);
    const rise = num(options, 'riseMm', 120);
    const axis = str(options, 'axis', 'z');
    // Authored running along +z from the corner, then turned if the region asks for the other axis.
    const step = group(
      at(roundedBox(kit, 110, 20, span, 'porcelain', 2), -25, -10, span / 2),
      at(box(kit, 24, rise - 20, span, 'laminateDark'), -80, -(rise + 20) / 2, span / 2),
      // A lit metal nosing 1600 mm long is the only edge that tells the player the 현관 is a drop
      // and not a change of floor colour.
      at(roundedBox(kit, 14, 7, span, 'steelBrushed', 1), -74, -3.5, span / 2),
      at(box(kit, 7, 7, span, 'grime'), -84, -23, span / 2),
    );
    return shadows(group(axis === 'x' ? rot(step, 0, Math.PI / 2, 0) : step), true, true);
  },

  'hallway.frontDoor': (kit, options) => {
    const width = num(options, 'widthMm', 900);
    const stub = num(options, 'stubMm', 320);
    const g = group(
      at(roundedBox(kit, 44, stub, width - 20, 'steelBrushed', 2), 30, stub / 2, 0),
      at(roundedBox(kit, 8, stub - 40, width - 90, 'laminateDark', 2), 55, stub / 2 - 20, 0),
      // The cut face is plaster-coloured for the same reason the walls are: a stub that reads as a
      // section reads as a deliberate camera decision, not as a broken door.
      at(box(kit, 44, 2, width - 20, 'plasterCut'), 30, stub, 0),
      at(roundedBox(kit, 7, 170, width - 60, 'steelPolished', 1.5), 62, 105, 0),
      at(roundedBox(kit, 74, 16, width + 44, 'steelBrushed', 2), 8, 8, 0),
      at(box(kit, 12, 9, width - 20, 'rubber'), 12, 20, 0),
      at(roundedBox(kit, 112, stub, 46, 'laminate', 2), 0, stub / 2, width / 2 + 23),
      at(roundedBox(kit, 112, stub, 46, 'laminate', 2), 0, stub / 2, -width / 2 - 23),
      at(cylinder(kit, 14, 14, 90, 'steelBrushed', 10), 22, 250, -width / 2 + 10),
    );
    return shadows(g, true, true);
  },

  'hallway.doorLock': (kit) => {
    // 도어록. Its keypad LED is the corridor's only permanent light at the west end, so the body is
    // built proud of the door face — a flush plate would give the light nothing to rake across.
    const key = kit.materials.clone('plasticBlack', 0x3a3f45);
    const g = group(
      at(roundedBox(kit, 9, 300, 78, 'plasticBlack', 2), 4.5, 0, 0),
      at(roundedBox(kit, 26, 268, 68, 'plasticWhite', 3), 22, 0, 0),
      at(box(kit, 2, 148, 54, 'screenOff'), 36, 42, 0),
      at(box(kit, 2.5, 22, 46, key), 37, 84, 0),
      at(box(kit, 2.5, 22, 46, key), 37, 42, 0),
      at(box(kit, 2.5, 22, 46, key), 37, 0, 0),
      at(sphere(kit, 3.2, kit.materials.clone('plasticGreen', 0x86e0b4), 8), 37, -104, 26),
      at(rot(cylinder(kit, 22, 22, 8, 'steelBrushed', 12), 0, 0, Math.PI / 2), 39, -72, -24),
      at(rot(cylinder(kit, 11, 12, 96, 'steelBrushed', 10), 0, 0, Math.PI / 2), 91, -72, -24),
      at(sphere(kit, 11, kit.materials.get('steelPolished'), 8), 137, -72, -24),
    );
    return shadows(g, true, true);
  },

  'hallway.doorMat': (kit, options) => {
    const width = num(options, 'widthMm', 640);
    const depth = num(options, 'depthMm', 420);
    const border = kit.materials.get('rubber');
    const g = group(at(drape(kit, width - 40, depth - 40, 4, 'fabricRug', 12), 0, 12, 0));
    g.add(at(roundedBox(kit, width, 16, 22, border, 3), 0, 8, -depth / 2 + 11));
    g.add(at(roundedBox(kit, width, 16, 22, border, 3), 0, 8, depth / 2 - 11));
    g.add(at(roundedBox(kit, 22, 16, depth - 44, border, 3), -width / 2 + 11, 8, 0));
    g.add(at(roundedBox(kit, 22, 16, depth - 44, border, 3), width / 2 - 11, 8, 0));
    // Coir ribs. Flat fabric at 3 mm eye height is indistinguishable from a painted rectangle.
    for (let i = -1; i <= 1; i++) {
      g.add(at(box(kit, width - 60, 3, 26, 'grime'), 0, 15, i * 92));
    }
    g.add(
      at(
        scatter(kit, 8, 200, () => blob(kit, 1.6 + kit.rand() * 2, 0.5, 'crumb', 6)),
        0,
        15,
        0,
      ),
    );
    return shadows(g, true, true);
  },

  'hallway.umbrellaStand': (kit) => {
    const g = group(
      at(cylinder(kit, 78, 70, 460, 'steelBrushed', 18), 0, 230, 0),
      at(cylinder(kit, 72, 72, 70, 'plasticBlack', 18), 0, 425, 0),
      at(rot(ring(kit, 76, 5, 'steelPolished'), -Math.PI / 2, 0, 0), 0, 460, 0),
      at(cylinder(kit, 70, 70, 4, 'plasticBlack', 18), 0, 396, 0),
      at(cylinder(kit, 98, 102, 26, 'plasticBlack', 20), 0, 13, 0),
      at(box(kit, 40, 4, 8, 'grime'), 0, 6, 96),
      at(patch(kit, 90, 40, 'grime'), 20, 27, 0),
    );
    return shadows(g, true, true);
  },

  'hallway.umbrella': (kit) => {
    const canopy = kit.materials.clone('fabricClothes', 0x2c3a48);
    const crook: [number, number, number][] = [[0, 880, 0], [0, 930, 0], [-26, 952, 0], [-52, 930, 0]]; // prettier-ignore
    const inner = group(
      at(cylinder(kit, 6, 6, 880, 'steelBrushed', 8), 0, 440, 0),
      at(cylinder(kit, 34, 17, 420, canopy, 10), 0, 560, 0),
      at(cylinder(kit, 5, 8, 44, 'brass', 8), 0, 902, 0),
      at(sphere(kit, 7, kit.materials.get('plasticBlack'), 8), 0, 4, 0),
      at(rot(ring(kit, 33, 4, 'plasticBlack'), -Math.PI / 2, 0, 0), 0, 640, 0),
      tube(kit, crook, 8, 'woodDark'),
      at(sphere(kit, 4, canopy, 6), 12, 352, 8),
      at(sphere(kit, 4, canopy, 6), -10, 356, -9),
    );
    // Leaning against the rim of the stand — an umbrella standing perfectly upright reads as a post.
    return shadows(group(rot(inner, 0.05, 0, -0.13)), true, true);
  },

  'hallway.dripTray': (kit, options) => {
    const radius = num(options, 'radiusMm', 120);
    const fill = num(options, 'fillMm', 6);
    const g = group(
      at(cylinder(kit, radius - 2, radius, 5, 'plasticBlack', 22), 0, 2.5, 0),
      at(cylinder(kit, radius, radius - 4, 24, 'plasticBlack', 22, true), 0, 12, 0),
      at(rot(ring(kit, radius, 3, 'plasticBlack'), -Math.PI / 2, 0, 0), 0, 24, 0),
      // Standing rainwater is the resource. It is a filled disc with a visible meniscus ring so the
      // player reads "moisture" at a glance rather than "a dark circle".
      at(cylinder(kit, radius - 6, radius - 8, fill, 'water', 22), 0, 5 + fill / 2, 0),
      at(rot(ring(kit, radius - 7, 1.6, 'water'), -Math.PI / 2, 0, 0), 0, 5 + fill, 0),
      at(rot(ring(kit, radius * 0.5, 1.2, 'water'), -Math.PI / 2, 0, 0), 14, 5 + fill, -8),
      at(blob(kit, 3.5, 0.4, 'grime', 6), -36, 5 + fill, 22),
    );
    return shadows(g, true, true);
  },

  /* --- 신발장 cluster --- */

  'hallway.shoeCabinet': (kit, options) => {
    const width = num(options, 'widthMm', 800);
    const depth = num(options, 'depthMm', 350);
    const height = num(options, 'heightMm', 900);
    const recess = num(options, 'recessMm', 100);
    const kick = 96;
    const front = -depth / 2;
    const carcassZ = front + recess;
    const carcassD = depth - recess;
    const doorH = height - kick - 22;
    const midY = kick + doorH / 2;
    const grip = kit.materials.get('steelBrushed');
    const g = group(
      // The recessed toe kick is the point of this whole object: it leaves a 100 mm deep slot at
      // floor level that is the west end's only continuous route along the south wall.
      at(roundedBox(kit, width - 10, kick, 10, 'laminateDark', 1.5), 0, kick / 2, carcassZ + 5),
      at(roundedBox(kit, width, doorH, carcassD, 'laminate', 2), 0, midY, carcassZ + carcassD / 2),
      at(box(kit, 6, doorH - 8, 6, 'grime'), 0, midY, carcassZ - 3),
      // Perch. The top overhangs the doors, so from below the shelf reads as a lid with a shadow
      // under its lip rather than as the top of a block.
      at(roundedBox(kit, width + 16, 22, depth - 34, 'laminate', 2), 0, height - 11, front + 34),
    );
    for (const side of [-1, 1]) {
      const door = roundedBox(kit, width / 2 - 6, doorH - 8, 19, 'cabinetDoor', 2);
      g.add(at(door, (side * width) / 4, midY, carcassZ - 9));
      g.add(
        at(roundedBox(kit, 14, 130, 22, grip, 2), side * 16, kick + doorH * 0.62, carcassZ - 28),
      );
      g.add(at(box(kit, 150, 4, 3, 'grime'), (side * width) / 4, kick + 40, carcassZ - 19));
    }
    return shadows(g, true, true);
  },

  'hallway.interphone': (kit) => {
    // Wall-mounted, so the origin is the wall and the body is built out into the corridor. Its
    // standby LED is the only thing lighting the perch, which is why the case stands 30 mm proud.
    const g = group(
      at(roundedBox(kit, 172, 212, 10, 'plasticWhite', 2), 0, 0, -5),
      at(roundedBox(kit, 158, 198, 28, 'plasticWhite', 3), 0, 0, -22),
      at(roundedBox(kit, 122, 92, 5, 'plasticBlack', 1.5), 0, 30, -37),
      at(box(kit, 108, 78, 1.5, 'screenOff'), 0, 30, -40),
      at(rot(cylinder(kit, 11, 11, 6, 'plasticWhite', 12), Math.PI / 2, 0, 0), 50, -74, -38),
      at(sphere(kit, 2.8, kit.materials.clone('plasticBlue', 0x8fb8ff), 8), -52, -74, -37),
      at(sphere(kit, 6, kit.materials.get('screenOff'), 8), 0, 86, -37),
    );
    for (let i = 0; i < 3; i++) g.add(at(box(kit, 84, 3, 2, 'plasticBlack'), 0, -44 - i * 8, -37));
    return shadows(g, true, true);
  },

  'hallway.interphoneCable': (kit, options) => {
    const top = num(options, 'topMm', 1450);
    const every = num(options, 'clipEveryMm', 300);
    const path: [number, number, number][] = [[0, 6, -6]];
    for (let y = every / 2; y < top; y += every / 2) {
      path.push([(kit.rand() - 0.5) * 16, y, -6]);
    }
    path.push([0, top, -6]);
    // The climb is a real object or the link is a cheat: the clips are the rungs, and they are
    // spaced exactly at the interval the link's traversal time was authored against.
    const g = group(
      tube(kit, path, 3.5, 'cable', 40),
      at(rot(ring(kit, 26, 3.5, 'cable'), -Math.PI / 2, 0, 0), 22, 4, -14),
    );
    for (let y = every; y <= top; y += every) {
      g.add(at(roundedBox(kit, 17, 11, 13, 'plasticWhite', 1), 0, y, -6));
      g.add(at(sphere(kit, 2, kit.materials.get('steelBrushed'), 6), 0, y, -13));
    }
    return shadows(g, true, true);
  },

  'hallway.keyTray': (kit) => {
    const g = group(
      at(cylinder(kit, 58, 50, 5, 'woodDark', 18), 0, 2.5, 0),
      at(cylinder(kit, 61, 57, 18, 'woodDark', 18, true), 0, 11, 0),
      at(rot(ring(kit, 60, 2, 'woodDark'), -Math.PI / 2, 0, 0), 0, 20, 0),
      at(rot(box(kit, 9, 2, 38, 'brass'), 0, 0.4, 0), -8, 7, 6),
      at(rot(cylinder(kit, 8, 8, 2, 'brass', 10), 0, 0.4, 0), 4, 7, -12),
      at(rot(ring(kit, 11, 1.4, 'steelPolished'), -Math.PI / 2, 0, 0), 18, 7, -20),
      at(
        rot(box(kit, 86, 1.2, 54, kit.materials.clone('plasticBlue', 0x2f6f8f)), 0, -0.3, 0),
        14,
        8,
        14,
      ),
      at(cylinder(kit, 12, 12, 1.8, 'brass', 12), -22, 7, -18),
    );
    return shadows(g, true, true);
  },

  'hallway.maskBox': (kit) => {
    const mask = kit.materials.clone('plasticWhite', 0xe8e9e6);
    const g = group(
      at(roundedBox(kit, 200, 92, 106, 'cardboard', 2), 0, 46, 0),
      at(rot(roundedBox(kit, 198, 4, 100, 'cardboard', 1), -1.15, 0, 0), 0, 122, 66),
      at(box(kit, 176, 28, 1.5, kit.materials.clone('plasticBlue', 0x35618a)), 0, 60, -53.5),
      at(box(kit, 150, 3, 60, 'plasticBlack'), 0, 91, 0),
      at(rot(drape(kit, 148, 66, 3, mask, 6), 0, 0.06, 0), -4, 96, -6),
      at(rot(drape(kit, 146, 62, 3, mask, 6), 0, -0.09, 0), 6, 102, 4),
      at(rot(ring(kit, 17, 1.3, mask), 0.5, 0.3, 0), 74, 104, -10),
    );
    return shadows(g, true, true);
  },

  'hallway.dressShoes': (kit) => {
    const upper = kit.materials.get('leather');
    const sole = kit.materials.get('plasticBlack');
    const g = group(
      at(rot(shoe(kit, 250, 92, upper, sole, upper), 0, 0.07, 0), 0, 0, -54),
      at(rot(shoe(kit, 250, 92, upper, sole, upper), 0, -0.05, 0), -8, 0, 52),
    );
    return shadows(g, true, true);
  },

  'hallway.runningShoes': (kit) => {
    const upper = kit.materials.clone('fabricClothes', 0xdcdcd6);
    const sole = kit.materials.get('rubber');
    const collar = kit.materials.get('fabricTowel');
    const one = (): THREE.Group => {
      const s = shoe(kit, 268, 100, upper, sole, collar);
      // Laces are the fastest read there is: nothing else in an apartment is a pale zigzag.
      s.add(
        at(
          tube(
            kit,
            [
              [10, 44, -22],
              [34, 50, 14],
              [58, 48, -18],
              [82, 44, 12],
            ],
            2.4,
            collar,
          ),
          0,
          0,
          0,
        ),
      );
      s.add(at(roundedBox(kit, 92, 14, 6, upper, 1.5), 26, 30, 44));
      return s;
    };
    const g = group(at(rot(one(), 0, 0.1, 0), 6, 0, -56), at(rot(one(), 0, -0.14, 0), -10, 0, 54));
    return shadows(g, true, true);
  },

  /* --- Doorways --- */

  'hallway.doorFrame': (kit, options) => {
    const width = num(options, 'widthMm', 800);
    const height = num(options, 'heightMm', 2050);
    const band = num(options, 'architraveMm', 60);
    const sliding = bool(options, 'sliding', false);
    const jambX = width / 2 + JAMB_W / 2;
    const g = group(
      at(roundedBox(kit, JAMB_W, height, FRAME_D, 'laminate', 2), -jambX, height / 2, 0),
      at(roundedBox(kit, JAMB_W, height, FRAME_D, 'laminate', 2), jambX, height / 2, 0),
      at(
        roundedBox(kit, width + JAMB_W * 2, JAMB_W, FRAME_D, 'laminate', 2),
        0,
        height + JAMB_W / 2,
        0,
      ),
      casing(kit, width, height, band, FRAME_D / 2 + 8),
      casing(kit, width, height, band, -FRAME_D / 2 - 8),
    );
    if (sliding) {
      // A 미닫이 runs on a header track with a single floor guide. Getting this wrong is the
      // difference between "living room" and "another door".
      g.add(
        at(roundedBox(kit, width + JAMB_W * 2, 26, 46, 'steelBrushed', 1.5), 0, height - 13, 0),
      );
      g.add(at(box(kit, width + JAMB_W * 2, 6, 10, 'grime'), 0, height - 30, -12));
      g.add(at(roundedBox(kit, 40, 10, 26, 'steelBrushed', 1.5), 0, 5, 0));
    } else {
      g.add(at(roundedBox(kit, width, 7, FRAME_D, 'steelBrushed', 1.5), 0, 3.5, 0));
      g.add(
        at(roundedBox(kit, 14, height - 10, 16, 'laminate', 1.5), -width / 2 + 7, height / 2, 22),
      );
      g.add(
        at(roundedBox(kit, 14, height - 10, 16, 'laminate', 1.5), width / 2 - 7, height / 2, 22),
      );
    }
    return shadows(g, true, true);
  },

  'hallway.doorLeaf': (kit, options) => {
    const width = num(options, 'widthMm', 800);
    const height = num(options, 'heightMm', 2050);
    const panelW = width - 130;
    const panelH = (height - 300) / 2;
    // Hinged at the origin and standing ajar into its own room, so an open door never crosses the
    // corridor the camera is looking down.
    const g = group(
      at(roundedBox(kit, width, height, 38, 'laminate', 2), width / 2, height / 2, 0),
      at(box(kit, panelW, panelH, 4, 'laminateDark'), width / 2, height * 0.32, 20),
      at(box(kit, panelW, panelH, 4, 'laminateDark'), width / 2, height * 0.72, 20),
      at(box(kit, panelW, panelH, 4, 'laminateDark'), width / 2, height * 0.32, -20),
      at(box(kit, panelW, panelH, 4, 'laminateDark'), width / 2, height * 0.72, -20),
      at(
        rot(cylinder(kit, 30, 30, 9, 'steelBrushed', 14), Math.PI / 2, 0, 0),
        width - 68,
        1010,
        22,
      ),
      at(
        rot(cylinder(kit, 11, 12, 108, 'steelBrushed', 10), Math.PI / 2, 0, 0),
        width - 68,
        1010,
        0,
      ),
      at(cylinder(kit, 13, 13, 78, 'steelBrushed', 10), 0, 300, 0),
      at(cylinder(kit, 13, 13, 78, 'steelBrushed', 10), 0, height - 300, 0),
    );
    return shadows(g, true, true);
  },

  'hallway.slipper': (kit) => {
    // 욕실 슬리퍼 point out of the bathroom, so the length runs across the corridor and the pair
    // reads as cover to crawl behind rather than as an obstacle.
    const body = kit.materials.clone('plasticBlue', 0x4d6f8c);
    const g = group(
      at(roundedBox(kit, 98, 13, 244, 'rubber', 3), 0, 6.5, 0),
      at(roundedBox(kit, 88, 8, 232, body, 2), 0, 15, 0),
      at(roundedBox(kit, 88, 20, 12, 'rubber', 2), 0, 20, 114),
      at(ring(kit, 44, 14, body, Math.PI), 0, 10, -62),
      at(roundedBox(kit, 72, 11, 44, 'rubber', 2), 0, 13, -112),
    );
    return shadows(g, true, true);
  },

  /* --- Mid corridor --- */

  'hallway.mirror': (kit, options) => {
    const width = num(options, 'widthMm', 550);
    const height = num(options, 'heightMm', 1500);
    const lean = num(options, 'leanRad', 0.07);
    // The glass is backed by a polished plate rather than being a dark pane: a 550 × 1500 black
    // rectangle was a reported defect on the previous build, and a mirror at night is not black.
    const inner = group(
      at(roundedBox(kit, 30, height, 28, 'woodDark', 2), -width / 2 + 15, height / 2, 0),
      at(roundedBox(kit, 30, height, 28, 'woodDark', 2), width / 2 - 15, height / 2, 0),
      at(roundedBox(kit, width - 60, 32, 28, 'woodDark', 2), 0, 16, 0),
      at(roundedBox(kit, width - 60, 32, 28, 'woodDark', 2), 0, height - 16, 0),
      at(box(kit, width - 64, height - 68, 4, 'glass'), 0, height / 2, -9),
      at(box(kit, width - 58, height - 62, 6, 'steelPolished'), 0, height / 2, -3),
      at(box(kit, width - 44, height - 48, 6, 'cardboard'), 0, height / 2, 8),
      // A dust smear across the glass. Without it the panel is the flattest surface in the room.
      at(rot(box(kit, 120, 780, 1, 'grime'), 0, 0, 0.42), -40, height * 0.44, -12),
      at(cylinder(kit, 11, 13, 5, 'rubber', 10), -width / 2 + 40, 2.5, -6),
      at(cylinder(kit, 11, 13, 5, 'rubber', 10), width / 2 - 40, 2.5, -6),
    );
    return shadows(group(rot(inner, lean, 0, 0)), true, true);
  },

  'hallway.hallBench': (kit, options) => {
    const width = num(options, 'widthMm', 800);
    const depth = num(options, 'depthMm', 320);
    const height = num(options, 'heightMm', 420);
    const gap = num(options, 'wallGapMm', 130);
    // The side panels are pulled forward off the wall, which is why the north 걸레받이 runs
    // uninterrupted behind the bench and the floor under the seat is the darkest on this side.
    const panelZ = depth / 2 - (gap - 60) / 2;
    const legX = width / 2 - 30;
    const g = group(
      at(roundedBox(kit, width, 26, depth, 'wood', 2), 0, height - 13, 0),
      at(drape(kit, width - 40, depth - 50, 6, 'leather', 8), 0, height + 6, 0),
      at(roundedBox(kit, width - 130, 30, 24, 'wood', 2), 0, 120, panelZ),
      at(roundedBox(kit, width - 140, 16, depth - 110, 'wood', 2), 0, 155, panelZ - 20),
    );
    for (const side of [-1, 1]) {
      g.add(at(roundedBox(kit, 60, height - 26, 160, 'wood', 2), side * legX, (height - 26) / 2, panelZ)); // prettier-ignore
      g.add(at(cylinder(kit, 22, 24, 5, 'rubber', 10), side * legX, 2.5, panelZ));
    }
    return shadows(g, true, true);
  },

  'hallway.foldedLaundry': (kit) => {
    const g = group(
      at(rot(roundedBox(kit, 290, 46, 206, 'fabricBed', 8), 0, 0.03, 0), 0, 23, 0),
      at(rot(roundedBox(kit, 276, 42, 198, 'fabricClothes', 8), 0, -0.05, 0), 6, 67, -4),
      at(rot(roundedBox(kit, 282, 40, 190, 'fabricTowel', 8), 0, 0.07, 0), -5, 108, 5),
      at(rot(drape(kit, 268, 184, 7, 'fabricTowel', 8), 0, -0.02, 0), 0, 132, 0),
      at(blob(kit, 42, 0.62, 'fabricClothes', 8), 108, 152, -30),
    );
    return shadows(g, true, true);
  },

  'hallway.parcelStack': (kit, options) => {
    const count = Math.max(1, Math.round(num(options, 'count', 3)));
    const sizes: readonly (readonly [number, number, number])[] = [
      [430, 265, 345],
      [345, 205, 285],
      [255, 165, 225],
    ];
    const g = new THREE.Group();
    let y = 0;
    for (let i = 0; i < count; i++) {
      const [w, h, d] = sizes[Math.min(i, sizes.length - 1)];
      const c = rot(carton(kit, w, h, d), 0, (kit.rand() - 0.5) * 0.28, 0);
      g.add(at(c, (kit.rand() - 0.5) * 34, y, (kit.rand() - 0.5) * 30));
      y += h;
    }
    // The invoice sleeve is the tell that these arrived today and will be gone tomorrow — the one
    // blocker in the corridor the player is not supposed to plan around permanently.
    g.add(at(rot(box(kit, 132, 1.4, 96, 'paper'), 0, 0.3, 0.04), 60, y + 2, 40));
    return shadows(g, true, true);
  },

  'hallway.crumbTrail': (kit, options) => {
    const radius = num(options, 'radiusMm', 220);
    // Walked out of the kitchen on a slipper sole, so the print comes first and the crumbs sit
    // inside it: the player is meant to read the direction of travel, not just find food.
    const g = group(
      at(rot(patch(kit, radius * 1.5, radius * 0.9, 'grime'), 0, 0.24, 0), 0, 0.5, 0),
    );
    g.add(
      scatter(kit, 14, radius, () => {
        const c = blob(kit, 1.4 + kit.rand() * 3.4, 0.55 + kit.rand() * 0.4, 'crumb', 6);
        c.position.y = mm(0.8 + kit.rand() * 1.4);
        return c;
      }),
    );
    g.add(at(box(kit, 9, 2.4, 5, 'crumb'), radius * 0.5, 1.4, -radius * 0.3));
    return shadows(g, false, true);
  },

  'hallway.dustBall': (kit) => {
    const fluff = kit.materials.clone('grime', 0x6d6459);
    const g = group(
      at(blob(kit, 17, 0.68, fluff, 10), 0, 11, 0),
      at(blob(kit, 11, 0.55, fluff, 8), 14, 7, 9),
      at(blob(kit, 9, 0.5, fluff, 8), -12, 6, -8),
    );
    // Hair is what makes a dust ball a dust ball rather than a pebble.
    for (let i = 0; i < 4; i++) {
      const a = kit.rand() * Math.PI * 2;
      const r = 24 + kit.rand() * 16;
      const hair: [number, number, number][] = [
        [0, 10, 0],
        [Math.cos(a) * r * 0.5, 16 + kit.rand() * 8, Math.sin(a) * r * 0.5],
        [Math.cos(a) * r, 4, Math.sin(a) * r],
      ];
      g.add(tube(kit, hair, 0.7, fluff, 10));
    }
    return shadows(g, true, true);
  },

  /* --- Power --- */

  'hallway.outlet': (kit) => {
    const well = kit.materials.clone('plasticWhite', 0xbcb9b2);
    const g = group(
      at(roundedBox(kit, 142, 90, 7, 'plasticWhite', 2), 0, 0, 3.5),
      at(roundedBox(kit, 128, 78, 11, 'plasticWhite', 2), 0, 0, 12),
      at(rot(cylinder(kit, 4, 4, 3, 'steelBrushed', 8), Math.PI / 2, 0, 0), 0, 33, 15),
    );
    // Two sunken 220 V wells with their pin holes: from a scout's height on the skirting this is a
    // face, and it is the landmark that says the charger cable starts here.
    for (const side of [-1, 1]) {
      g.add(at(rot(cylinder(kit, 27, 27, 5, well, 16), Math.PI / 2, 0, 0), side * 31, 0, 17));
      for (const pin of [-10, 10]) {
        const hole = rot(cylinder(kit, 3.4, 3.4, 6, 'plasticBlack', 8), Math.PI / 2, 0, 0);
        g.add(at(hole, side * 31 + pin, 0, 18));
      }
    }
    return shadows(g, true, true);
  },

  'hallway.powerStrip': (kit) => {
    const rocker = kit.materials.clone('plasticRed', 0xb04b3e);
    const well = kit.materials.clone('plasticWhite', 0xbcb9b2);
    const g = group(at(roundedBox(kit, 252, 48, 64, 'plasticWhite', 3), 0, 24, 0));
    for (let i = 0; i < 4; i++) {
      const x = -93 + i * 62;
      g.add(at(cylinder(kit, 21, 21, 5, well, 16), x, 46, 6));
      g.add(at(roundedBox(kit, 17, 5, 11, rocker, 1), x, 48, -24));
    }
    // The red standby LED sits 80 mm off the floor, which at scout eye level makes it a beacon
    // visible the whole length of the corridor. It is a navigation landmark before it is a light.
    g.add(at(sphere(kit, 2.6, kit.materials.clone('plasticRed', 0xff5f4a), 8), -112, 30, -32));
    const tail: [number, number, number][] = [[126, 26, 0], [166, 62, -14], [154, 186, -42], [22, 292, -46]]; // prettier-ignore
    g.add(tube(kit, tail, 4.2, 'cable', 20));
    return shadows(g, true, true);
  },

  'hallway.cableRun': (kit, options) => {
    const length = num(options, 'lengthMm', 1600);
    const axis = str(options, 'axis', 'x');
    const sag = num(options, 'sagMm', 8);
    const strand = (radius: number, drift: number, mat: THREE.Material): THREE.Mesh => {
      const points: [number, number, number][] = [];
      for (let i = 0; i <= 6; i++) {
        const t = (i / 6) * length;
        const off = Math.sin(i * 1.1 + drift) * sag + (kit.rand() - 0.5) * sag;
        const [px, pz] = alongAxis(axis, t, off);
        points.push([px, radius, pz]);
      }
      return tube(kit, points, radius, mat, 40);
    };
    // The charger cable is read before it is understood: it is the only long unbroken line on the
    // north skirting, and the parcels were dropped on top of it.
    const [lx, lz] = alongAxis(axis, length * 0.55, 26);
    const [tx, tz] = alongAxis(axis, length * 0.28, 0);
    const g = group(
      strand(4.4, 0, kit.materials.get('cable')),
      strand(2.8, 2.2, kit.materials.clone('cable', 0xcfcdc6)),
      at(rot(ring(kit, 46, 4.2, 'cable'), -Math.PI / 2, 0, 0), lx, 4.4, lz),
      at(rot(ring(kit, 11, 2.2, 'plasticWhite'), 0, axis === 'z' ? 0 : Math.PI / 2, 0), tx, 5, tz),
    );
    return shadows(g, true, true);
  },

  /* --- East dead end --- */

  'hallway.laundryBasket': (kit) => {
    const weave = kit.materials.clone('plasticWhite', 0xc7c1b2);
    const g = group(
      at(cylinder(kit, 216, 178, 520, weave, 22), 0, 260, 0),
      at(cylinder(kit, 202, 202, 8, 'grime', 22), 0, 508, 0),
      at(rot(ring(kit, 214, 10, weave), -Math.PI / 2, 0, 0), 0, 520, 0),
      at(rot(ring(kit, 206, 6, weave), -Math.PI / 2, 0, 0), 0, 356, 0),
      at(rot(ring(kit, 196, 6, weave), -Math.PI / 2, 0, 0), 0, 188, 0),
      at(box(kit, 96, 30, 12, 'grime'), 0, 436, -196),
      at(box(kit, 96, 30, 12, 'grime'), 0, 436, 196),
      at(drape(kit, 350, 350, 30, 'fabricClothes', 10), 0, 528, 0),
      at(
        tube(
          kit,
          [
            [120, 540, 60],
            [220, 500, 90],
            [244, 400, 60],
          ],
          16,
          'fabricTowel',
          16,
        ),
        0,
        0,
        0,
      ),
    );
    return shadows(g, true, true);
  },

  'hallway.stickVacuum': (kit) => {
    const shell = kit.materials.clone('plasticWhite', 0xd2d5d8);
    // Docked and leaning back into the corner. Upright it reads as a pole; the lean is what makes
    // the silhouette say "appliance parked here" from the far end of the corridor.
    const stack = group(
      at(cylinder(kit, 19, 19, 660, 'steelBrushed', 12), 0, 390, 0),
      at(roundedBox(kit, 124, 156, 134, shell, 4), 0, 800, 10),
      at(cylinder(kit, 58, 52, 156, 'plasticClear', 16), 0, 802, -78),
      at(cylinder(kit, 26, 20, 128, 'plasticBlack', 12), 0, 802, -78),
      at(rot(roundedBox(kit, 48, 170, 56, 'plasticBlack', 4), 0.32, 0, 0), 0, 946, 78),
      at(roundedBox(kit, 26, 46, 20, 'plasticBlack', 2), 0, 880, 44),
      at(sphere(kit, 2.6, kit.materials.clone('plasticGreen', 0x86e0b4), 8), 0, 880, -60),
    );
    const g = group(
      at(roundedBox(kit, 246, 62, 192, 'plasticBlack', 4), 0, 31, 0),
      at(box(kit, 212, 8, 32, 'grime'), 0, 5, -72),
      at(rot(cylinder(kit, 19, 19, 62, 'plasticBlack', 10), 0, 0, Math.PI / 2), 0, 64, 6),
      at(rot(stack, 0.08, 0, 0), 0, 60, 0),
    );
    return shadows(g, true, true);
  },

  'hallway.mop': (kit) => {
    const grip = kit.materials.clone('plasticBlue', 0x36597e);
    const stick = group(
      at(cylinder(kit, 11, 13, 1180, 'steelBrushed', 10), 0, 590, 0),
      at(cylinder(kit, 15, 15, 150, grip, 12), 0, 1150, 0),
      at(rot(ring(kit, 9, 2.4, grip), 0, Math.PI / 2, 0), 0, 1236, 0),
      at(sphere(kit, 16, kit.materials.get('plasticBlack'), 10), 0, 30, 0),
    );
    const g = group(
      at(roundedBox(kit, 124, 24, 330, 'plasticBlack', 3), 0, 12, 0),
      at(drape(kit, 132, 336, 6, 'fabricTowel', 8), 0, 26, 0),
      rot(stick, 0, 0, -0.09),
    );
    return shadows(g, true, true);
  },

  'hallway.breakerPanel': (kit) => {
    const toggle = kit.materials.clone('plasticRed', 0xb8483c);
    const g = group(
      at(roundedBox(kit, 16, 310, 390, 'plasticWhite', 2), -8, 0, 0),
      at(roundedBox(kit, 34, 262, 342, 'plasticBlack', 2), -26, 0, 0),
      at(roundedBox(kit, 22, 30, 310, 'steelBrushed', 1.5), -30, -104, 0),
    );
    // 분전반 with the cover swung open: four breakers is what a Korean apartment has, and the row
    // of toggles is the only thing that distinguishes this from a wall-mounted box of anything.
    for (let i = 0; i < 4; i++) {
      const z = -120 + i * 80;
      g.add(at(roundedBox(kit, 26, 88, 44, 'plasticWhite', 1.5), -34, 30, z));
      g.add(at(roundedBox(kit, 10, 30, 22, toggle, 1), -50, 44, z));
    }
    const door = group(
      at(roundedBox(kit, 14, 306, 380, 'plasticWhite', 2), -7, 0, -190),
      at(box(kit, 1.6, 74, 140, 'paper'), -15, 40, -190),
    );
    g.add(at(rot(door, 0, -0.62, 0), -14, 0, 195));
    return shadows(g, true, true);
  },
};

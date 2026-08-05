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
import { num, str, type PropRegistry } from './registry';

/**
 * The bathroom prop library.
 *
 * ## What this room has to do in one silhouette
 *
 * The player never gets a label. From a low diagonal camera the room has to be named from four
 * landmark shapes alone: a toilet with a tank behind it, a basin on a pedestal, a glass screen over
 * a lipped tray with a head on a riser, and a tiled floor falling to a centre drain. Everything else
 * here exists to make those four read as *used* rather than as sanitary-ware renders — so the
 * bottles are half-empty, the towel is crooked, and the squeegee is leaning where a real one ends up.
 *
 * ## Why so much of it is porcelain and chrome
 *
 * At macro scale the substance separation is doing the work colour cannot: porcelain is the only
 * near-white matte-specular in the palette, chrome is the only mirror, and tile carries grout lines
 * that give the eye a scale ruler in a room with no furniture legs. A bathroom built from tinted
 * plastic reads as a locker room.
 */

/** Grout line depth. Deep enough to catch the ceiling fixture, shallow enough not to shadow-acne. */
const GROUT_MM = 2.4;

/** Wall tile skin thickness. The tiles stand proud of the plaster, as real ones do. */
const TILE_THICK_MM = 9;

/**
 * A tiled panel of `tileMm` squares with recessed grout, built in the XZ plane facing +Y.
 *
 * Grout is real geometry rather than a texture because at 35 mm the seam is 2 mm wide — a scout is
 * fifteen seams long — and a painted-on line at that scale reads instantly as a decal. It is also
 * the surface the `bathroom.seam.grout` link claims to climb, so it has to physically exist.
 */
function tileGrid(
  kit: Kit,
  widthMm: number,
  depthMm: number,
  tileMm: number,
  face: 'tileFloor' | 'tileWall',
): THREE.Group {
  const g = new THREE.Group();
  const bed = box(kit, widthMm, GROUT_MM * 2, depthMm, 'grout');
  at(bed, widthMm / 2, -GROUT_MM, depthMm / 2);
  g.add(bed);

  const cols = Math.max(1, Math.round(widthMm / tileMm));
  const rows = Math.max(1, Math.round(depthMm / tileMm));
  const cw = widthMm / cols;
  const cd = depthMm / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const tile = roundedBox(kit, cw - GROUT_MM, GROUT_MM * 2, cd - GROUT_MM, face, 0.8);
      at(tile, (i + 0.5) * cw, 0, (j + 0.5) * cd);
      g.add(tile);
    }
  }
  return g;
}

/**
 * A toiletries bottle: body, shoulder taper, neck, cap.
 *
 * Requirement 6 in physical form — a shampoo bottle drawn as one cylinder is the exact placeholder
 * this project treats as a completion blocker. The shoulder is what makes it read as a container
 * rather than a post, and the cap colour is what tells three near-identical bottles apart.
 */
function bottle(
  kit: Kit,
  heightMm: number,
  radiusMm: number,
  body: THREE.Material,
  cap: THREE.Material,
): THREE.Group {
  const bodyH = heightMm * 0.62;
  const shoulderH = heightMm * 0.2;
  const neckH = heightMm * 0.08;
  const capH = heightMm - bodyH - shoulderH - neckH;
  const neckR = radiusMm * 0.36;

  const barrel = cylinder(kit, radiusMm, radiusMm * 0.94, bodyH, body, 14);
  at(barrel, 0, bodyH / 2, 0);
  const shoulder = cylinder(kit, neckR * 1.15, radiusMm, shoulderH, body, 14);
  at(shoulder, 0, bodyH + shoulderH / 2, 0);
  const neck = cylinder(kit, neckR, neckR * 1.1, neckH, body, 10);
  at(neck, 0, bodyH + shoulderH + neckH / 2, 0);
  const lid = cylinder(kit, neckR * 1.25, neckR * 1.3, capH, cap, 12);
  at(lid, 0, heightMm - capH / 2, 0);

  // The label band. Half of what makes a bottle look bought rather than modelled.
  const label = cylinder(kit, radiusMm * 1.02, radiusMm * 1.02, bodyH * 0.44, cap, 14, true);
  at(label, 0, bodyH * 0.46, 0);

  return group(barrel, shoulder, neck, lid, label);
}

/** A pipe run through millimetre waypoints. Every chrome run in here is one of these. */
function pipeRun(
  kit: Kit,
  points: readonly (readonly [number, number, number])[],
  radiusMm: number,
  material: Parameters<typeof tube>[3],
): THREE.Mesh {
  return tube(kit, points, radiusMm, material, 20);
}

/** A compression collar / escutcheon — the flange every pipe wears where it enters a wall. */
function collar(kit: Kit, radiusMm: number, heightMm: number): THREE.Mesh {
  return cylinder(kit, radiusMm, radiusMm * 1.12, heightMm, 'chrome', 12);
}

export const BATHROOM_PROPS: PropRegistry = {
  /* ------------------------------------------------------------------ shell */

  /**
   * The tiled floor, falling to the centre drain.
   *
   * Placed at the room's -X/-Z corner, so it is built outward from its origin rather than centred.
   * The fall is applied by dropping each tile toward the drain: a 300 mm tile in a Korean wet room
   * drops about 6 mm across the room, which is invisible as a slope but very visible as a puddle
   * boundary — and the puddle is where the moisture economy lives.
   */
  'bathroom.floorTile': (kit, options) => {
    const widthMm = num(options, 'widthMm', 2400);
    const depthMm = num(options, 'depthMm', 2400);
    const tileMm = num(options, 'tileMm', 300);
    const fallX = num(options, 'fallToX', widthMm / 2);
    const fallZ = num(options, 'fallToZ', depthMm / 2);

    const g = tileGrid(kit, widthMm, depthMm, tileMm, 'tileFloor');
    const fallRadius = Math.hypot(widthMm, depthMm) / 2;
    for (const child of g.children) {
      if (child === g.children[0]) continue;
      const dx = child.position.x - mm(fallX);
      const dz = child.position.z - mm(fallZ);
      const t = Math.min(1, Math.hypot(dx, dz) / mm(fallRadius));
      child.position.y += mm(9) * t;
    }
    return shadows(g, false, true);
  },

  /**
   * Full-height wall tiling. `axis` says which way the wall runs; the skin is laid on the interior
   * face, which is -X for the east wall and -Z for the south wall.
   */
  'bathroom.wallTile': (kit, options) => {
    const lengthMm = num(options, 'lengthMm', 2400);
    const tileMm = num(options, 'tileMm', 300);
    const axis = str(options, 'axis', 'z');
    const heightMm = 2400;

    const panel = tileGrid(kit, lengthMm, heightMm, tileMm, 'tileWall');
    // Built flat then stood up: the grid helper works in XZ, and a wall is that grid rotated.
    const g = new THREE.Group();
    if (axis === 'z') {
      rot(panel, Math.PI / 2, -Math.PI / 2, 0);
      at(panel, -TILE_THICK_MM, 0, 0);
    } else {
      rot(panel, Math.PI / 2, 0, 0);
      at(panel, 0, 0, -TILE_THICK_MM);
    }
    g.add(panel);
    return shadows(g, false, true);
  },

  /**
   * The raised threshold (턱) at the door. Kept at 40 mm — tall enough to be the visible reason the
   * hallway stays dry, short enough that it never occludes anything from a low camera.
   */
  'bathroom.doorSill': (kit, options) => {
    const widthMm = num(options, 'widthMm', 800);
    const body = roundedBox(kit, widthMm, 40, 90, 'tileFloor', 3);
    at(body, 0, 20, 0);
    // The silicone bead along the wet side. A sill without one looks like a step, not a dam.
    const bead = roundedBox(kit, widthMm, 6, 8, 'rubber', 2.4);
    at(bead, 0, 41, 44);
    const capNorth = roundedBox(kit, widthMm, 8, 12, 'tileWall', 2);
    at(capNorth, 0, 42, -40);
    return shadows(group(body, bead, capNorth), true, true);
  },

  /**
   * The centre floor drain (배수구) with a lift-off grate.
   *
   * The grate slots are the reason `bathroom.scum.drain` is a hidden resource: the food is visibly
   * *under* something, so discovering it feels like lifting a lid rather than reading a tooltip.
   */
  'bathroom.floorDrain': (kit) => {
    const bowl = cylinder(kit, 76, 66, 26, 'plasticWhite', 16);
    at(bowl, 0, -12, 0);
    const throat = cylinder(kit, 52, 52, 40, 'plasticBlack', 14);
    at(throat, 0, -28, 0);
    const rim = ring(kit, 78, 5, 'steelBrushed');
    rot(rim, -Math.PI / 2, 0, 0);
    at(rim, 0, 2, 0);
    const grate = cylinder(kit, 74, 74, 5, 'steelBrushed', 18);
    at(grate, 0, 3, 0);

    const g = group(bowl, throat, rim, grate);
    // Six radial slots. Cut as raised bars over a dark throat rather than boolean holes — cheaper,
    // and at this scale the shadow between bars reads identically.
    for (let i = 0; i < 6; i++) {
      const slot = box(kit, 116, 7, 11, 'plasticBlack');
      rot(slot, 0, (i * Math.PI) / 6, 0);
      at(slot, 0, 5.6, 0);
      g.add(slot);
    }
    const scum = ring(kit, 80, 3.5, 'grime');
    rot(scum, -Math.PI / 2, 0, 0);
    at(scum, 0, 1.2, 0);
    g.add(scum);
    return shadows(g, true, true);
  },

  /** The permanent wet film around the drain. Never casts — it is a film, not an object. */
  'bathroom.wetSheen': (kit, options) => {
    const radiusMm = num(options, 'radiusMm', 800);
    const g = new THREE.Group();
    const film = patch(kit, radiusMm * 2, radiusMm * 1.7, 'water');
    g.add(film);
    // Broken outer lobes, so the puddle edge is not a circle. A circle was a reported defect.
    for (let i = 0; i < 5; i++) {
      const lobe = blob(kit, radiusMm * (0.3 + kit.rand() * 0.22), 0.02, 'water', 10);
      const a = kit.rand() * Math.PI * 2;
      const r = radiusMm * (0.55 + kit.rand() * 0.4);
      at(lobe, Math.cos(a) * r, 1.1, Math.sin(a) * r);
      g.add(lobe);
    }
    const scale = ring(kit, radiusMm * 0.62, 4, 'grime');
    rot(scale, -Math.PI / 2, 0, 0);
    at(scale, 0, 0.8, 0);
    g.add(scale);
    return shadows(g, false, true);
  },

  /** Hair and soap scum caught at the grate — the room's entire food economy, made physical. */
  'bathroom.hairTangle': (kit) => {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = kit.rand() * Math.PI * 2;
      const r = 14 + kit.rand() * 26;
      g.add(
        pipeRun(
          kit,
          [
            [Math.cos(a) * r, 1.5, Math.sin(a) * r],
            [Math.cos(a + 1.2) * r * 0.4, 4 + kit.rand() * 3, Math.sin(a + 1.2) * r * 0.4],
            [Math.cos(a + 2.6) * r * 0.9, 1.5, Math.sin(a + 2.6) * r * 0.9],
          ],
          0.9,
          kit.materials.clone('plasticBlack', 0x1a1614),
        ),
      );
    }
    const clot = blob(kit, 15, 0.42, 'grime', 8);
    at(clot, 0, 3, 0);
    g.add(clot);
    return shadows(g, false, true);
  },

  /* ------------------------------------------------------------------ basin */

  /**
   * The boxed pedestal under the basin. Its west cheek is the one carrying the unsealed inspection
   * hatch, so the box is built with a visible panel joint on that side rather than as a solid slab —
   * the shortcut has to be legible as a seam before the hatch prop explains it.
   */
  'bathroom.basinPedestal': (kit) => {
    const carcass = roundedBox(kit, 250, 780, 180, 'plasticWhite', 3);
    at(carcass, 0, 390, 0);
    const plinth = roundedBox(kit, 258, 24, 188, 'tileWall', 2);
    at(plinth, 0, 12, 0);
    // Panel joint down the west cheek: the hatch line.
    const jointA = box(kit, 4, 700, 6, 'plasterCut');
    at(jointA, -126, 400, -66);
    const jointB = box(kit, 4, 700, 6, 'plasterCut');
    at(jointB, -126, 400, 66);
    const jointTop = box(kit, 4, 6, 138, 'plasterCut');
    at(jointTop, -126, 748, 0);
    const scuff = patch(kit, 260, 190, 'grime');
    at(scuff, 0, 26, 0);
    return shadows(group(carcass, plinth, jointA, jointB, jointTop, scuff), true, true);
  },

  /**
   * The basin bowl. Origin sits on the basin's working plane, so the rim is just above it and the
   * body hangs below into the pedestal.
   *
   * The overflow slot is modelled because workers are specified to work it from the rim — a resource
   * whose access point does not exist in the geometry is the sort of thing a critic finds first.
   */
  'bathroom.basinBowl': (kit) => {
    const deck = roundedBox(kit, 650, 46, 480, 'porcelain', 6);
    at(deck, 0, -14, 0);
    const rim = ring(kit, 190, 17, 'porcelain');
    rot(rim, -Math.PI / 2, 0, 0);
    at(rim, 0, 6, 20);
    const basinWall = cylinder(kit, 186, 96, 140, 'porcelain', 20, true);
    at(basinWall, 0, -62, 20);
    const sump = cylinder(kit, 96, 74, 44, 'porcelain', 16);
    at(sump, 0, -152, 20);
    const wasteRing = ring(kit, 20, 4, 'chrome');
    rot(wasteRing, -Math.PI / 2, 0, 0);
    at(wasteRing, 0, -132, 20);
    // Overflow slot on the front face of the bowl — the access point the trap resource is worked from.
    const overflow = roundedBox(kit, 46, 12, 10, 'plasticBlack', 2);
    at(overflow, 0, -34, -152);
    const overflowLip = roundedBox(kit, 58, 6, 8, 'porcelain', 2);
    at(overflowLip, 0, -25, -154);
    const film = patch(kit, 260, 200, 'water');
    at(film, 0, -148, 20);
    const lime = ring(kit, 150, 5, 'grime');
    rot(lime, -Math.PI / 2, 0, 0);
    at(lime, 0, -104, 20);
    return shadows(
      group(deck, rim, basinWall, sump, wasteRing, overflow, overflowLip, film, lime),
      true,
      true,
    );
  },

  /** Mixer tap: base, column, curved spout, two levers. Chrome is the room's only true mirror. */
  'bathroom.basinTap': (kit) => {
    const base = cylinder(kit, 32, 38, 16, 'chrome', 14);
    at(base, 0, 8, 0);
    const column = cylinder(kit, 22, 26, 118, 'chrome', 14);
    at(column, 0, 74, 0);
    const spout = pipeRun(
      kit,
      [
        [0, 128, 0],
        [0, 172, -22],
        [0, 168, -78],
        [0, 140, -112],
      ],
      13,
      'chrome',
    );
    const nozzle = cylinder(kit, 12, 15, 14, 'steelBrushed', 12);
    at(nozzle, 0, 133, -112);
    const lever = roundedBox(kit, 96, 16, 20, 'chrome', 5);
    at(lever, 0, 140, 14);
    const pivot = sphere(kit, 15, 'chrome', 10);
    at(pivot, 0, 138, 0);
    // A bead of water still hanging off the nozzle: the tap is the basin trap's refill, so it should
    // look like it was used minutes ago.
    const drip = blob(kit, 7, 1.4, 'water', 8);
    at(drip, 0, 122, -112);
    return shadows(group(base, column, spout, nozzle, lever, pivot, drip), true, true);
  },

  /**
   * The bottle trap and its waste arm — the bottom half of the shortcut. The arm deliberately runs
   * west into the chase rather than straight back, because that is the run the riser link climbs.
   */
  'bathroom.basinTrap': (kit, options) => {
    const topMm = num(options, 'topMm', 800);
    const tail = pipeRun(
      kit,
      [
        [0, topMm - 40, 20],
        [0, topMm - 190, 20],
      ],
      17,
      'chrome',
    );
    const trapBody = cylinder(kit, 40, 40, 96, 'chrome', 14);
    at(trapBody, 0, topMm - 250, 20);
    const trapCap = cylinder(kit, 34, 40, 20, 'chrome', 14);
    at(trapCap, 0, topMm - 306, 20);
    const arm = pipeRun(
      kit,
      [
        [0, topMm - 232, 20],
        [-70, topMm - 244, 10],
        [-150, topMm - 262, -4],
      ],
      17,
      'chrome',
    );
    const nut = cylinder(kit, 22, 22, 18, 'chrome', 10);
    at(nut, 0, topMm - 52, 20);
    const wallFlange = collar(kit, 30, 10);
    rot(wallFlange, 0, 0, Math.PI / 2);
    at(wallFlange, -150, topMm - 262, -4);
    // Stop-valve on the supply riser beside it. Two pipes reads as plumbing; one reads as a stick.
    const supply = pipeRun(
      kit,
      [
        [64, topMm - 30, 34],
        [64, topMm - 300, 34],
        [64, topMm - 470, 34],
      ],
      9,
      'chrome',
    );
    const valve = roundedBox(kit, 34, 40, 34, 'chrome', 4);
    at(valve, 64, topMm - 380, 34);
    const dampness = patch(kit, 190, 150, 'grime');
    at(dampness, -40, 2, 10);
    return shadows(
      group(tail, trapBody, trapCap, arm, nut, wallFlange, supply, valve, dampness),
      true,
      true,
    );
  },

  /**
   * The inspection hatch that never got sealed. Origin is where it meets the pedestal cheek; the
   * panel is hinged open a few degrees so the void behind it is visibly enterable.
   */
  'bathroom.chaseHatch': (kit) => {
    const frame = roundedBox(kit, 210, 190, 10, 'plasticWhite', 2);
    at(frame, 0, 0, 5);
    const mouth = box(kit, 176, 156, 6, 'plasticBlack');
    at(mouth, 0, 0, 4);
    const panel = roundedBox(kit, 172, 152, 8, 'plasticWhite', 2);
    rot(panel, 0, 0.34, 0);
    at(panel, 74, -4, 34);
    const screw = cylinder(kit, 6, 6, 4, 'steelBrushed', 8);
    rot(screw, Math.PI / 2, 0, 0);
    at(screw, -88, 78, 10);
    const sealant = roundedBox(kit, 200, 8, 8, 'rubber', 2.4);
    at(sealant, 0, -92, 8);
    return shadows(group(frame, mouth, panel, screw, sealant), true, true);
  },

  /**
   * Mirror cabinet over the basin. Wall-mounted: origin is on the wall face, body built toward -Z.
   *
   * The mirror is `screenOff` rather than a real reflection — a planar reflector here would double
   * the room's draw cost for a surface the camera almost never sees square on.
   */
  'bathroom.mirrorCabinet': (kit) => {
    const carcass = roundedBox(kit, 660, 640, 140, 'plasticWhite', 3);
    at(carcass, 0, 0, -70);
    const glassL = box(kit, 316, 600, 8, 'screenOff');
    at(glassL, -166, 0, -144);
    const glassR = box(kit, 316, 600, 8, 'screenOff');
    at(glassR, 166, 0, -144);
    const frameL = roundedBox(kit, 328, 612, 12, 'plasticWhite', 2);
    at(frameL, -166, 0, -138);
    const frameR = roundedBox(kit, 328, 612, 12, 'plasticWhite', 2);
    at(frameR, 166, 0, -138);
    const seam = box(kit, 8, 612, 14, 'plasticBlack');
    at(seam, 0, 0, -142);
    const underLip = roundedBox(kit, 660, 22, 150, 'plasticWhite', 3);
    at(underLip, 0, -330, -75);
    // Splash spots on the lower glass. A spotless mirror in this room is the tell that it is a render.
    const spots = scatter(kit, 9, 130, () => {
      const spot = blob(kit, 3 + kit.rand() * 4, 0.3, 'water', 6);
      at(spot, 0, -190, -149);
      return spot;
    });
    return shadows(
      group(carcass, glassL, glassR, frameL, frameR, seam, underLip, spots),
      true,
      true,
    );
  },

  /** The chemical shelf. Origin is the shelf's working plane at the wall; slab hangs just below it. */
  'bathroom.wallShelf': (kit) => {
    const slab = roundedBox(kit, 620, 20, 150, 'glassFrosted', 2);
    at(slab, 0, -10, -75);
    const rail = pipeRun(
      kit,
      [
        [-300, -22, -146],
        [300, -22, -146],
      ],
      5,
      'chrome',
    );
    const bracketL = roundedBox(kit, 14, 46, 130, 'chrome', 2);
    at(bracketL, -276, -40, -68);
    const bracketR = roundedBox(kit, 14, 46, 130, 'chrome', 2);
    at(bracketR, 276, -40, -68);
    const plateL = roundedBox(kit, 30, 60, 8, 'chrome', 2);
    at(plateL, -276, -30, -6);
    const plateR = roundedBox(kit, 30, 60, 8, 'chrome', 2);
    at(plateR, 276, -30, -6);
    return shadows(group(slab, rail, bracketL, bracketR, plateL, plateR), true, true);
  },

  /**
   * Bleach (락스). Squat, opaque, handle-moulded — the silhouette of a household chemical rather
   * than of a drink, because this object is the only argument the chemical-resistance adaptation
   * ever gets and it has to be identifiable at a glance.
   */
  'bathroom.bleachBottle': (kit) => {
    const body = kit.materials.clone('plasticWhite', 0xc8cfd4);
    const cap = kit.materials.clone('plasticBlue', 0x2f5f9a);
    const g = bottle(kit, 250, 52, body, cap);
    // The moulded side handle. Without it a bleach bottle is just a big bottle.
    const handle = ring(kit, 26, 9, body, Math.PI * 1.15);
    rot(handle, 0, Math.PI / 2, -0.4);
    at(handle, -52, 118, 0);
    g.add(handle);
    const warning = roundedBox(kit, 54, 40, 2, cap, 1);
    at(warning, 0, 96, 53);
    g.add(warning);
    return shadows(g, true, true);
  },

  /** Spray cleaner: bottle plus a trigger head, which is what tells it apart from the bleach. */
  'bathroom.sprayCleaner': (kit) => {
    const body = kit.materials.clone('plasticClear', 0xa9c3b4);
    const trim = kit.materials.clone('plasticGreen', 0x3f6b4c);
    const barrel = roundedBox(kit, 88, 150, 66, body, 8);
    at(barrel, 0, 75, 0);
    const shoulder = cylinder(kit, 26, 42, 34, body, 12);
    at(shoulder, 0, 165, 0);
    const collarRing = cylinder(kit, 26, 28, 16, trim, 12);
    at(collarRing, 0, 190, 0);
    const head = roundedBox(kit, 40, 44, 74, trim, 5);
    at(head, 0, 218, -14);
    const nozzle = cylinder(kit, 8, 11, 22, trim, 10);
    rot(nozzle, Math.PI / 2, 0, 0);
    at(nozzle, 0, 226, -56);
    const triggerArm = roundedBox(kit, 16, 44, 18, trim, 4);
    rot(triggerArm, 0.5, 0, 0);
    at(triggerArm, 0, 194, -34);
    // The dip tube, visible through translucent plastic — a clear bottle with nothing inside it
    // reads as an empty shell.
    const dipTube = cylinder(kit, 4, 4, 148, 'plasticWhite', 8);
    at(dipTube, 0, 76, 6);
    const fluid = roundedBox(kit, 78, 92, 56, trim, 6);
    at(fluid, 0, 50, 0);
    const label = roundedBox(kit, 80, 62, 2, 'paper', 1);
    at(label, 0, 78, 34);
    return shadows(
      group(barrel, shoulder, collarRing, head, nozzle, triggerArm, dipTube, fluid, label),
      true,
      true,
    );
  },

  /** Soap dish with a bar going soft in standing water — the wet room's signature small detail. */
  'bathroom.soapDish': (kit) => {
    const tray = roundedBox(kit, 130, 22, 96, 'plasticWhite', 4);
    at(tray, 0, 11, 0);
    const wall = cylinder(kit, 62, 58, 24, 'plasticWhite', 16, true);
    at(wall, 0, 26, 0);
    const puddle = patch(kit, 104, 74, 'water');
    at(puddle, 0, 20, 0);
    const bar = blob(kit, 40, 0.34, 'plasticWhite', 10);
    rot(bar, 0, 0.4, 0);
    at(bar, 4, 28, -2);
    bar.scale.x = 0.72;
    const slime = blob(kit, 30, 0.12, 'grime', 8);
    at(slime, 4, 22, -2);
    return shadows(group(tray, wall, puddle, bar, slime), true, true);
  },

  /** Toothbrush cup. Two brushes at different angles — a matched pair looks staged. */
  'bathroom.toothbrushCup': (kit) => {
    const cup = cylinder(kit, 42, 36, 108, 'plasticWhite', 14);
    at(cup, 0, 54, 0);
    const mouth = cylinder(kit, 42, 40, 22, 'plasticWhite', 14, true);
    at(mouth, 0, 97, 0);
    const scale = ring(kit, 34, 3, 'grime');
    rot(scale, -Math.PI / 2, 0, 0);
    at(scale, 0, 14, 0);
    const g = group(cup, mouth, scale);
    const handles: readonly [number, number, number][] = [
      [-14, 0.16, 0x3f6b4c],
      [16, -0.2, 0x9c3a34],
    ];
    for (const [x, tilt, colour] of handles) {
      const handleMat = kit.materials.clone('plasticWhite', colour);
      const handle = roundedBox(kit, 12, 190, 9, handleMat, 3);
      rot(handle, tilt, 0, tilt * 1.4);
      at(handle, x, 150, x * 0.4);
      const head = roundedBox(kit, 16, 30, 11, handleMat, 3);
      at(head, x + tilt * 34, 246, x * 0.5);
      const bristles = box(kit, 14, 12, 9, 'plasticWhite');
      at(bristles, x + tilt * 36, 262, x * 0.5);
      g.add(handle, head, bristles);
    }
    return shadows(g, true, true);
  },

  /**
   * The grout seam the shelf route climbs. It is a physical channel between two tile columns, not a
   * marker: a link the player is told to climb must be visible as a climbable thing.
   */
  'bathroom.groutSeam': (kit, options) => {
    const topMm = num(options, 'topMm', 1420);
    const heightMm = Math.max(60, topMm - 800);
    const channel = box(kit, 16, heightMm, 6, 'grout');
    at(channel, 0, heightMm / 2, -3);
    const lipL = roundedBox(kit, 5, heightMm, 12, 'tileWall', 1.5);
    at(lipL, -10, heightMm / 2, -7);
    const lipR = roundedBox(kit, 5, heightMm, 12, 'tileWall', 1.5);
    at(lipR, 10, heightMm / 2, -7);
    // Mildew in the seam: the reason a scout can grip it, and the reason a human will bleach it.
    const g = group(channel, lipL, lipR);
    for (let i = 0; i < 6; i++) {
      const spot = blob(kit, 4 + kit.rand() * 4, 0.4, 'grime', 6);
      at(spot, (kit.rand() - 0.5) * 10, kit.rand() * heightMm, -2);
      g.add(spot);
    }
    return shadows(g, false, true);
  },

  /* ----------------------------------------------------------------- toilet */

  /**
   * The pan. Placed rotated so local +Z is the front of the bowl, facing out into the room.
   *
   * This is the single most important silhouette in the region: a waisted pedestal under an oval
   * rim with a lid hinged at the back is legible as a toilet from any angle, and nothing else in a
   * Korean apartment has that profile. It gets the most meshes of anything here for that reason.
   */
  'bathroom.toilet': (kit) => {
    const foot = roundedBox(kit, 260, 26, 300, 'porcelain', 6);
    at(foot, 0, 13, -40);
    // Waisted pedestal — the pinch at mid-height is the whole read.
    const pedestalLower = cylinder(kit, 118, 150, 210, 'porcelain', 16);
    at(pedestalLower, 0, 130, -40);
    const pedestalUpper = cylinder(kit, 178, 118, 150, 'porcelain', 16);
    at(pedestalUpper, 0, 310, -40);
    const bowl = roundedBox(kit, 360, 130, 480, 'porcelain', 40);
    at(bowl, 0, 380, 20);
    const bowlNose = cylinder(kit, 170, 140, 130, 'porcelain', 18);
    at(bowlNose, 0, 380, 160);
    const rimWall = cylinder(kit, 178, 168, 60, 'porcelain', 20, true);
    at(rimWall, 0, 420, 40);
    const water = patch(kit, 250, 300, 'water');
    at(water, 0, 372, 40);
    const stain = ring(kit, 128, 6, 'grime');
    rot(stain, -Math.PI / 2, 0, 0);
    at(stain, 0, 376, 40);

    const seat = roundedBox(kit, 372, 22, 480, 'plasticWhite', 10);
    at(seat, 0, 456, 30);
    const seatHole = cylinder(kit, 132, 132, 30, 'plasticBlack', 18, true);
    at(seatHole, 0, 456, 46);
    // Lid tipped back against the cistern. A closed lid hides the pan and kills the silhouette.
    const lid = roundedBox(kit, 380, 20, 470, 'plasticWhite', 10);
    rot(lid, -1.28, 0, 0);
    at(lid, 0, 660, -200);
    const hingeL = cylinder(kit, 16, 16, 34, 'chrome', 10);
    rot(hingeL, 0, 0, Math.PI / 2);
    at(hingeL, -104, 462, -206);
    const hingeR = cylinder(kit, 16, 16, 34, 'chrome', 10);
    rot(hingeR, 0, 0, Math.PI / 2);
    at(hingeR, 104, 462, -206);
    const wetRing = patch(kit, 340, 360, 'grime');
    at(wetRing, 0, 2, -20);

    return shadows(
      group(
        foot,
        pedestalLower,
        pedestalUpper,
        bowl,
        bowlNose,
        rimWall,
        water,
        stain,
        seat,
        seatHole,
        lid,
        hingeL,
        hingeR,
        wetRing,
      ),
      true,
      true,
    );
  },

  /**
   * The cistern. Its body is pushed 60 mm west of its placement origin so the back face lands 90 mm
   * short of the tiles — that slot is `bathroom.pipe.cistern`, the only route up to the dry perch,
   * and if the tank were flush against the wall the climb would have nowhere to happen.
   */
  'bathroom.cistern': (kit) => {
    const tank = roundedBox(kit, 180, 560, 440, 'porcelain', 8);
    at(tank, -60, 300, 0);
    const skirt = roundedBox(kit, 190, 40, 452, 'porcelain', 6);
    at(skirt, -60, 20, 0);
    const lid = roundedBox(kit, 200, 34, 462, 'porcelain', 8);
    at(lid, -60, 597, 0);
    const lidLip = roundedBox(kit, 172, 12, 430, 'porcelain', 4);
    at(lidLip, -60, 576, 0);
    const button = cylinder(kit, 42, 46, 16, 'chrome', 16);
    at(button, -60, 620, -120);
    const buttonSplit = box(kit, 6, 18, 84, 'plasticWhite');
    at(buttonSplit, -60, 622, -120);
    const inletNut = cylinder(kit, 20, 24, 26, 'chrome', 12);
    at(inletNut, -20, 26, 150);
    // Condensation running down the cold face — this is `bathroom.sweat.cistern` made visible.
    const g = group(tank, skirt, lid, lidLip, button, buttonSplit, inletNut);
    for (let i = 0; i < 7; i++) {
      const bead = blob(kit, 4 + kit.rand() * 5, 1.6, 'water', 6);
      at(bead, -151, 90 + kit.rand() * 440, (kit.rand() - 0.5) * 400);
      g.add(bead);
    }
    return shadows(g, true, true);
  },

  /** Angle valve and braided hose in the slot behind the cistern — the climb, drawn. */
  'bathroom.cisternSupply': (kit, options) => {
    const topMm = num(options, 'topMm', 760);
    const stub = pipeRun(
      kit,
      [
        [0, 220, 0],
        [-30, 220, 0],
      ],
      11,
      'chrome',
    );
    const wallPlate = collar(kit, 26, 8);
    rot(wallPlate, 0, 0, Math.PI / 2);
    at(wallPlate, 22, 220, 0);
    const valveBody = roundedBox(kit, 40, 52, 40, 'chrome', 5);
    at(valveBody, -34, 236, 0);
    const handle = cylinder(kit, 26, 22, 12, 'plasticBlue', 12);
    at(handle, -34, 274, 0);
    // Braided hose, slack and looping — a taut straight line here would read as a strut.
    const hose = pipeRun(
      kit,
      [
        [-34, 258, 0],
        [-40, 340, -46],
        [-26, 460, -120],
        [-44, topMm - 120, -190],
        [-44, topMm - 34, -230],
      ],
      13,
      'steelBrushed',
    );
    const hoseNutLow = cylinder(kit, 17, 17, 26, 'chrome', 10);
    at(hoseNutLow, -34, 276, -4);
    const hoseNutHigh = cylinder(kit, 17, 17, 26, 'chrome', 10);
    at(hoseNutHigh, -44, topMm - 20, -230);
    return shadows(
      group(stub, wallPlate, valveBody, handle, hose, hoseNutLow, hoseNutHigh),
      true,
      true,
    );
  },

  /** Toilet brush in its holder. Small, but it is a word: nothing else in a home looks like this. */
  'bathroom.toiletBrush': (kit) => {
    const holder = cylinder(kit, 62, 72, 190, 'plasticWhite', 14);
    at(holder, 0, 95, 0);
    const holderMouth = cylinder(kit, 62, 58, 26, 'plasticWhite', 14, true);
    at(holderMouth, 0, 178, 0);
    const dirtyWater = patch(kit, 90, 90, 'grime');
    at(dirtyWater, 0, 40, 0);
    const shaft = cylinder(kit, 8, 9, 300, 'plasticWhite', 10);
    rot(shaft, 0.09, 0, 0.06);
    at(shaft, -8, 330, 12);
    const grip = cylinder(kit, 13, 11, 70, 'plasticBlue', 10);
    at(grip, -14, 460, 20);
    const head = sphere(kit, 34, 'plasticWhite', 10);
    head.scale.set(1, 0.72, 1);
    at(head, 0, 176, 0);
    const bristles = cylinder(kit, 40, 26, 40, 'plasticBlue', 12);
    at(bristles, 0, 172, 0);
    return shadows(group(holder, holderMouth, dirtyWater, shaft, grip, head, bristles), true, true);
  },

  /** A pair of dropped cleaning gloves — collapsed, not laid out flat, because nobody folds these. */
  'bathroom.rubberGloves': (kit) => {
    const rubberPink = kit.materials.clone('plasticRed', 0xb0625e);
    const g = new THREE.Group();
    for (const [x, z, spin] of [
      [0, 0, 0],
      [46, 34, 1.1],
    ] as const) {
      const cuff = cylinder(kit, 46, 40, 30, rubberPink, 12);
      at(cuff, x, 15, z);
      const palm = blob(kit, 44, 0.42, rubberPink, 10);
      rot(palm, 0, spin, 0);
      at(palm, x + 24, 14, z + 60);
      const fingers = roundedBox(kit, 62, 20, 70, rubberPink, 9);
      rot(fingers, 0, spin + 0.2, 0.1);
      at(fingers, x + 40, 12, z + 118);
      const thumb = roundedBox(kit, 20, 18, 40, rubberPink, 8);
      rot(thumb, 0, spin - 0.7, 0);
      at(thumb, x - 6, 11, z + 74);
      g.add(cuff, palm, fingers, thumb);
    }
    return shadows(g, true, true);
  },

  /** Wall paper holder. Origin on the east wall face, so everything is built toward -X. */
  'bathroom.paperHolder': (kit) => {
    const plate = roundedBox(kit, 12, 110, 90, 'chrome', 3);
    at(plate, -6, 0, 0);
    const armUpper = roundedBox(kit, 130, 16, 16, 'chrome', 4);
    at(armUpper, -70, 40, 0);
    const armLower = roundedBox(kit, 130, 14, 14, 'chrome', 4);
    at(armLower, -70, -34, 0);
    const spindle = cylinder(kit, 13, 13, 118, 'plasticWhite', 10);
    rot(spindle, 0, 0, Math.PI / 2);
    at(spindle, -118, 40, 0);
    const roll = cylinder(kit, 58, 58, 108, 'paper', 18);
    rot(roll, 0, 0, Math.PI / 2);
    at(roll, -118, 40, 0);
    const core = cylinder(kit, 22, 22, 112, 'cardboard', 12);
    rot(core, 0, 0, Math.PI / 2);
    at(core, -118, 40, 0);
    // The loose tail hanging off the roll. It is the difference between a roll and a cylinder.
    const tail = drape(kit, 106, 150, 6, 'paper', 6);
    rot(tail, 1.5, 0, 0);
    at(tail, -118, -30, -56);
    const shield = roundedBox(kit, 150, 12, 120, 'chrome', 4);
    at(shield, -84, 104, 0);
    return shadows(group(plate, armUpper, armLower, spindle, roll, core, tail, shield), true, true);
  },

  /* ----------------------------------------------------------------- shower */

  /**
   * The shower tray. Corner-anchored like the floor, built outward in +X/+Z.
   *
   * The 150 mm lip overhangs its screed bed by 40 mm and that void is `bathroom.traylip`, a named
   * foothold — so the overhang is real geometry with a real shadow gap under it, not a chamfer.
   */
  'bathroom.showerTray': (kit, options) => {
    const widthMm = num(options, 'widthMm', 1200);
    const depthMm = num(options, 'depthMm', 900);
    const lipMm = num(options, 'lipMm', 150);

    const bed = roundedBox(kit, widthMm - 80, lipMm - 30, depthMm - 80, 'grout', 4);
    at(bed, widthMm / 2, (lipMm - 30) / 2, depthMm / 2 + 20);
    const pan = roundedBox(kit, widthMm, 34, depthMm, 'porcelain', 8);
    at(pan, widthMm / 2, lipMm - 17, depthMm / 2);
    // The lip proper — its outer faces stand proud of the bed, leaving the 40 mm void beneath.
    const lipWest = roundedBox(kit, 40, lipMm, depthMm, 'porcelain', 5);
    at(lipWest, 20, lipMm / 2, depthMm / 2);
    const lipNorth = roundedBox(kit, widthMm, lipMm, 40, 'porcelain', 5);
    at(lipNorth, widthMm / 2, lipMm / 2, 20);
    const kerbTop = roundedBox(kit, widthMm, 16, 46, 'porcelain', 6);
    at(kerbTop, widthMm / 2, lipMm + 6, 18);
    const kerbTopW = roundedBox(kit, 46, 16, depthMm, 'porcelain', 6);
    at(kerbTopW, 18, lipMm + 6, depthMm / 2);
    const seal = roundedBox(kit, widthMm, 10, 10, 'rubber', 3);
    at(seal, widthMm / 2, lipMm + 12, 44);
    const wasteRing = ring(kit, 46, 6, 'steelBrushed');
    rot(wasteRing, -Math.PI / 2, 0, 0);
    at(wasteRing, widthMm * 0.48, lipMm + 2, depthMm * 0.5);
    const wasteGrate = cylinder(kit, 42, 42, 6, 'steelBrushed', 14);
    at(wasteGrate, widthMm * 0.48, lipMm + 1, depthMm * 0.5);

    return shadows(
      group(bed, pan, lipWest, lipNorth, kerbTop, kerbTopW, seal, wasteRing, wasteGrate),
      true,
      true,
    );
  },

  /**
   * The glass screen. The largest occluder in the room, standing on the tray lip and running along
   * local Z. It is a half-screen with an open end, so the scout has a way onto the tray that is not
   * only the lip climb — a fully enclosed cubicle would make this corner unreadable and unenterable.
   */
  'bathroom.showerScreen': (kit) => {
    const pane = box(kit, 12, 1380, 860, 'glassFrosted');
    at(pane, 0, 690, 0);
    const frameBottom = roundedBox(kit, 28, 34, 880, 'steelBrushed', 4);
    at(frameBottom, 0, 17, 0);
    const frameTop = roundedBox(kit, 24, 26, 880, 'steelBrushed', 4);
    at(frameTop, 0, 1382, 0);
    const postWall = roundedBox(kit, 30, 1400, 34, 'steelBrushed', 5);
    at(postWall, 0, 700, 428);
    const postFree = roundedBox(kit, 34, 1400, 40, 'steelBrushed', 6);
    at(postFree, 0, 700, -428);
    const brace = pipeRun(
      kit,
      [
        [0, 1300, -420],
        [140, 1360, -420],
      ],
      8,
      'chrome',
    );
    const handle = roundedBox(kit, 44, 22, 150, 'chrome', 7);
    at(handle, -26, 980, -360);
    // Dried spatter on the wet face. Clean glass at macro scale reads as no glass at all.
    const g = group(pane, frameBottom, frameTop, postWall, postFree, brace, handle);
    for (let i = 0; i < 14; i++) {
      const spot = blob(kit, 3 + kit.rand() * 6, 0.22, 'water', 6);
      at(spot, 7, 90 + kit.rand() * 900, (kit.rand() - 0.5) * 800);
      rot(spot, Math.PI / 2, 0, Math.PI / 2);
      g.add(spot);
    }
    const scumLine = roundedBox(kit, 14, 26, 860, 'grime', 3);
    at(scumLine, 0, 40, 0);
    g.add(scumLine);
    return shadows(g, true, true);
  },

  /** The riser rail. Origin is its wall mounting point; the rail runs vertically through it. */
  'bathroom.showerRail': (kit) => {
    const rail = cylinder(kit, 13, 13, 900, 'chrome', 12);
    at(rail, -46, 40, 0);
    const bracketUpper = roundedBox(kit, 50, 22, 22, 'chrome', 4);
    at(bracketUpper, -24, 420, 0);
    const bracketLower = roundedBox(kit, 50, 22, 22, 'chrome', 4);
    at(bracketLower, -24, -370, 0);
    const plateUpper = roundedBox(kit, 10, 62, 62, 'chrome', 4);
    at(plateUpper, -5, 420, 0);
    const plateLower = roundedBox(kit, 10, 62, 62, 'chrome', 4);
    at(plateLower, -5, -370, 0);
    // The sliding cradle. A rail with nothing on it looks like a grab bar.
    const cradleClamp = cylinder(kit, 22, 22, 54, 'plasticWhite', 12);
    at(cradleClamp, -46, 200, 0);
    const cradleArm = roundedBox(kit, 60, 20, 24, 'plasticWhite', 5);
    rot(cradleArm, 0, 0, 0.35);
    at(cradleArm, -78, 214, 0);
    return shadows(
      group(rail, bracketUpper, bracketLower, plateUpper, plateLower, cradleClamp, cradleArm),
      true,
      true,
    );
  },

  /** The head itself: handle, collar, and a perforated face plate angled down into the tray. */
  'bathroom.showerHead': (kit) => {
    const g = new THREE.Group();
    rot(g, 0, 0, -0.5);
    const handle = cylinder(kit, 15, 18, 190, 'chrome', 12);
    at(handle, -40, -70, 0);
    const swivel = sphere(kit, 20, 'chrome', 10);
    at(swivel, -40, 26, 0);
    const neck = cylinder(kit, 20, 26, 46, 'chrome', 12);
    at(neck, -40, 52, 0);
    const bell = cylinder(kit, 58, 30, 56, 'chrome', 16);
    at(bell, -40, 100, 0);
    const face = cylinder(kit, 60, 58, 12, 'plasticWhite', 18);
    at(face, -40, 130, 0);
    const rimBand = ring(kit, 58, 6, 'chrome');
    rot(rimBand, -Math.PI / 2, 0, 0);
    at(rimBand, -40, 128, 0);
    g.add(handle, swivel, neck, bell, face, rimBand);
    // Limescale on the jets. This head is the reason the room floods; it should look worked.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const jet = cylinder(kit, 3.5, 3.5, 5, 'grime', 6);
      at(jet, -40 + Math.cos(a) * 38, 136, Math.sin(a) * 38);
      g.add(jet);
    }
    const drop = blob(kit, 6, 1.5, 'water', 6);
    at(drop, -40, 128, 0);
    g.add(drop);
    return shadows(g, true, true);
  },

  /** The hose, hanging in a loop off the rail. Coiled sheath, not a smooth tube. */
  'bathroom.showerHose': (kit) => {
    const path: readonly (readonly [number, number, number])[] = [
      [0, 780, -40],
      [-90, 560, -30],
      [-130, 300, 10],
      [-70, 90, 60],
      [40, 30, 90],
      [110, 90, 40],
    ];
    const core = pipeRun(kit, path, 12, 'steelBrushed');
    const g = group(core);
    // Coil ribs, sampled along the same path. The rib is the whole reason it reads as a shower hose.
    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      const seg = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
      const local = t * (path.length - 1) - seg;
      const a = path[seg];
      const b = path[seg + 1];
      const rib = ring(kit, 13, 3.2, 'steelBrushed');
      rot(rib, kit.rand() * 0.4 - 0.2, 0, Math.PI / 2 + (kit.rand() - 0.5) * 0.5);
      at(
        rib,
        a[0] + (b[0] - a[0]) * local,
        a[1] + (b[1] - a[1]) * local,
        a[2] + (b[2] - a[2]) * local,
      );
      g.add(rib);
    }
    const nutTop = cylinder(kit, 17, 17, 30, 'chrome', 10);
    at(nutTop, 0, 790, -40);
    const nutEnd = cylinder(kit, 17, 17, 30, 'chrome', 10);
    rot(nutEnd, 0, 0, Math.PI / 2);
    at(nutEnd, 118, 92, 38);
    g.add(nutTop, nutEnd);
    return shadows(g, true, true);
  },

  /** Shampoo. Tallest of the three tray bottles, so the trio reads as a group not a row of posts. */
  'bathroom.shampooBottle': (kit) => {
    const body = kit.materials.clone('plasticWhite', 0x9fb6c6);
    const cap = kit.materials.clone('plasticBlue', 0x2b4f78);
    const g = bottle(kit, 232, 44, body, cap);
    // Pump top: the flip cap is what distinguishes it from the conditioner beside it.
    const pumpStem = cylinder(kit, 7, 7, 46, 'plasticWhite', 8);
    at(pumpStem, 0, 250, 0);
    const pumpHead = roundedBox(kit, 20, 18, 46, cap, 5);
    at(pumpHead, 0, 278, -12);
    const spout = cylinder(kit, 5, 6, 14, cap, 8);
    rot(spout, Math.PI / 2, 0, 0);
    at(spout, 0, 274, -34);
    g.add(pumpStem, pumpHead, spout);
    return shadows(g, true, true);
  },

  /** Conditioner: shorter, fatter, different cap colour. Same family, clearly not the same bottle. */
  'bathroom.conditionerBottle': (kit) => {
    const body = kit.materials.clone('plasticWhite', 0xc8b8bd);
    const cap = kit.materials.clone('plasticRed', 0x8e4550);
    const g = bottle(kit, 176, 52, body, cap);
    const flipTab = roundedBox(kit, 34, 10, 26, cap, 3);
    at(flipTab, 0, 172, -18);
    g.add(flipTab);
    // Standing in its own ring of scum, because a bottle in a shower never gets moved.
    const scumRing = ring(kit, 54, 3, 'grime');
    rot(scumRing, -Math.PI / 2, 0, 0);
    at(scumRing, 0, 1.5, 0);
    g.add(scumRing);
    return shadows(g, true, true);
  },

  /** Body wash, tipped upside-down on its cap — the way the last third of a bottle gets used. */
  'bathroom.bodyWash': (kit) => {
    const body = kit.materials.clone('plasticClear', 0xb8ae9a);
    const cap = kit.materials.clone('plasticWhite', 0xe6e2da);
    const g = bottle(kit, 190, 46, body, cap);
    rot(g, Math.PI, 0, 0.06);
    at(g, 0, 190, 0);
    const wrapper = new THREE.Group();
    wrapper.add(g);
    const slick = patch(kit, 130, 110, 'grime');
    wrapper.add(slick);
    return shadows(wrapper, true, true);
  },

  /** A worn soap bar with a crack across it. Detritus scale — small, but not a sphere. */
  'bathroom.soapBar': (kit) => {
    const bar = roundedBox(kit, 88, 26, 58, 'plasticWhite', 11);
    rot(bar, 0.05, 0.3, 0.03);
    at(bar, 0, 13, 0);
    const worn = blob(kit, 30, 0.24, 'plasticWhite', 10);
    at(worn, 6, 24, -4);
    const crack = box(kit, 62, 4, 3, 'grime');
    rot(crack, 0, 0.3, 0);
    at(crack, 0, 25, 4);
    const slime = patch(kit, 104, 74, 'grime');
    return shadows(group(bar, worn, crack, slime), true, true);
  },

  /** The standing tray pool. A film, so it never casts — the tray under it does that. */
  'bathroom.trayPuddle': (kit, options) => {
    const radiusMm = num(options, 'radiusMm', 420);
    const g = new THREE.Group();
    const pool = patch(kit, radiusMm * 1.9, radiusMm * 1.5, 'water');
    g.add(pool);
    for (let i = 0; i < 4; i++) {
      const lobe = blob(kit, radiusMm * (0.34 + kit.rand() * 0.2), 0.02, 'water', 10);
      const a = kit.rand() * Math.PI * 2;
      at(lobe, Math.cos(a) * radiusMm * 0.7, 1.2, Math.sin(a) * radiusMm * 0.5);
      g.add(lobe);
    }
    // Beads outside the pool proper, so the wet area has a soft edge rather than a cut one.
    const beads = scatter(kit, 16, radiusMm * 1.15, () => {
      const bead = blob(kit, 4 + kit.rand() * 7, 0.5, 'water', 6);
      at(bead, 0, 2, 0);
      return bead;
    });
    g.add(beads);
    const suds = blob(kit, radiusMm * 0.22, 0.16, 'plasticWhite', 8);
    at(suds, radiusMm * 0.5, 3, -radiusMm * 0.3);
    g.add(suds);
    return shadows(g, false, true);
  },

  /* ------------------------------------------------- loose, lived-in objects */

  /**
   * The low plastic stool every Korean bathroom has. At 200 mm it is one of the only things in this
   * room a scout can get *under*, which is why it earns floor space in a deliberately coverless room.
   */
  'bathroom.plasticStool': (kit) => {
    const shell = kit.materials.clone('plasticWhite', 0xbfc6c2);
    const seat = roundedBox(kit, 280, 26, 240, shell, 14);
    at(seat, 0, 188, 0);
    const dish = roundedBox(kit, 220, 14, 180, shell, 10);
    at(dish, 0, 178, 0);
    const g = group(seat, dish);
    // Splayed legs: vertical legs would make it read as a box, and the splay is what lets the
    // silhouette show daylight under the seat from a low camera.
    const legs: readonly (readonly [number, number])[] = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    for (const [sx, sz] of legs) {
      const leg = roundedBox(kit, 34, 190, 34, shell, 6);
      rot(leg, sz * -0.09, 0, sx * 0.09);
      at(leg, sx * 112, 95, sz * 92);
      const foot = cylinder(kit, 22, 24, 12, 'rubber', 10);
      at(foot, sx * 120, 6, sz * 100);
      g.add(leg, foot);
    }
    const rail = roundedBox(kit, 250, 16, 16, shell, 5);
    at(rail, 0, 70, -96);
    g.add(rail);
    return shadows(g, true, true);
  },

  /** The 대야 — a wide plastic wash bowl, left face-up with a finger of water still in it. */
  'bathroom.washBowl': (kit) => {
    const shell = kit.materials.clone('plasticGreen', 0x527a6a);
    const wall = cylinder(kit, 210, 156, 150, shell, 20, true);
    at(wall, 0, 75, 0);
    const base = cylinder(kit, 156, 148, 16, shell, 18);
    at(base, 0, 8, 0);
    const rim = ring(kit, 210, 9, shell);
    rot(rim, -Math.PI / 2, 0, 0);
    at(rim, 0, 150, 0);
    const footRing = ring(kit, 140, 8, shell);
    rot(footRing, -Math.PI / 2, 0, 0);
    at(footRing, 0, 4, 0);
    const water = patch(kit, 300, 300, 'water');
    at(water, 0, 20, 0);
    const lugA = roundedBox(kit, 40, 22, 16, shell, 5);
    at(lugA, -212, 138, 0);
    const lugB = roundedBox(kit, 40, 22, 16, shell, 5);
    at(lugB, 212, 138, 0);
    const scale = ring(kit, 120, 4, 'grime');
    rot(scale, -Math.PI / 2, 0, 0);
    at(scale, 0, 22, 0);
    return shadows(group(wall, base, rim, footRing, water, lugA, lugB, scale), true, true);
  },

  /** The floor squeegee, leaning in the slot between pedestal and tray where a real one ends up. */
  'bathroom.squeegee': (kit) => {
    const g = new THREE.Group();
    rot(g, -0.22, 0, 0.14);
    const pole = cylinder(kit, 11, 13, 1050, 'steelBrushed', 12);
    at(pole, 0, 540, 0);
    const grip = cylinder(kit, 15, 14, 130, 'plasticBlue', 12);
    at(grip, 0, 1020, 0);
    const hangHole = ring(kit, 11, 4, 'plasticBlue');
    at(hangHole, 0, 1092, 0);
    const yoke = roundedBox(kit, 24, 70, 24, 'plasticBlue', 5);
    at(yoke, 0, 46, 0);
    const head = roundedBox(kit, 280, 34, 40, 'plasticBlue', 8);
    at(head, 0, 24, 0);
    const blade = roundedBox(kit, 290, 30, 8, 'rubber', 3);
    at(blade, 0, 6, -14);
    const wetEdge = patch(kit, 300, 60, 'water');
    at(wetEdge, 0, 0, -16);
    g.add(pole, grip, hangHole, yoke, head, blade, wetEdge);
    return shadows(g, true, true);
  },

  /** Laundry hamper — a woven-look basket with a lid half off and clothes showing over the rim. */
  'bathroom.laundryHamper': (kit) => {
    const weave = kit.materials.clone('plasticWhite', 0xb0a894);
    const body = cylinder(kit, 232, 196, 560, weave, 18, true);
    at(body, 0, 280, 0);
    const base = cylinder(kit, 196, 190, 18, weave, 16);
    at(base, 0, 9, 0);
    const g = group(body, base);
    // Horizontal weave bands. A smooth drum reads as a bin; the banding reads as a basket.
    for (let i = 0; i < 6; i++) {
      const y = 50 + i * 92;
      const r = 198 + (y / 560) * 36;
      const band = ring(kit, r, 9, weave);
      rot(band, -Math.PI / 2, 0, 0);
      at(band, 0, y, 0);
      g.add(band);
    }
    const rim = ring(kit, 234, 13, weave);
    rot(rim, -Math.PI / 2, 0, 0);
    at(rim, 0, 558, 0);
    const lid = cylinder(kit, 240, 244, 26, weave, 18);
    rot(lid, 0.34, 0, 0.1);
    at(lid, 90, 596, -40);
    const lidKnob = sphere(kit, 26, weave, 10);
    at(lidKnob, 96, 624, -46);
    // Laundry bulging over the rim: the object is only doing its job if it is visibly full.
    const wash = drape(kit, 340, 300, 34, 'fabricClothes', 8);
    at(wash, -30, 540, 20);
    const sleeve = roundedBox(kit, 70, 46, 210, 'fabricTowel', 18);
    rot(sleeve, 0.3, 0.6, 0.2);
    at(sleeve, -180, 500, 90);
    g.add(rim, lid, lidKnob, wash, sleeve);
    return shadows(g, true, true);
  },

  /**
   * Bathroom slippers, one of them kicked half over. Sole, upper, and an open heel — the pair is a
   * strong Korean-apartment signal and reads even at thirty pixels.
   */
  'bathroom.slippers': (kit) => {
    const shell = kit.materials.clone('plasticBlue', 0x3d6280);
    const g = new THREE.Group();
    const layout: readonly (readonly [number, number, number, number])[] = [
      [-80, 0, 0.12, 0],
      [80, 40, -0.28, 0.7],
    ];
    for (const [x, z, spin, roll] of layout) {
      const slipper = new THREE.Group();
      const sole = roundedBox(kit, 105, 22, 255, shell, 10);
      at(sole, 0, 11, 0);
      const tread = roundedBox(kit, 96, 10, 240, 'rubber', 6);
      at(tread, 0, 3, 0);
      // The upper is a partial arch, not a closed dome: the open heel is the whole silhouette.
      const upper = ring(kit, 52, 17, shell, Math.PI);
      rot(upper, 0, Math.PI / 2, 0);
      at(upper, 0, 20, -62);
      const toeCap = roundedBox(kit, 98, 54, 74, shell, 20);
      at(toeCap, 0, 38, -84);
      const footbed = roundedBox(kit, 86, 8, 225, 'rubber', 6);
      at(footbed, 0, 23, 6);
      const heelStain = patch(kit, 70, 90, 'grime');
      at(heelStain, 0, 24, 82);
      slipper.add(sole, tread, upper, toeCap, footbed, heelStain);
      rot(slipper, 0, spin, roll);
      at(slipper, x, roll > 0.3 ? 40 : 0, z);
      g.add(slipper);
    }
    return shadows(g, true, true);
  },

  /** Towel rail on the south wall. Origin on the wall face; everything is built toward -Z. */
  'bathroom.towelRail': (kit) => {
    const plateL = roundedBox(kit, 54, 54, 10, 'chrome', 4);
    at(plateL, -230, 0, -5);
    const plateR = roundedBox(kit, 54, 54, 10, 'chrome', 4);
    at(plateR, 230, 0, -5);
    const armL = roundedBox(kit, 18, 18, 86, 'chrome', 4);
    at(armL, -230, 0, -50);
    const armR = roundedBox(kit, 18, 18, 86, 'chrome', 4);
    at(armR, 230, 0, -50);
    const bar = cylinder(kit, 12, 12, 480, 'chrome', 12);
    rot(bar, 0, 0, Math.PI / 2);
    at(bar, 0, 0, -88);
    return shadows(group(plateL, plateR, armL, armR, bar), true, true);
  },

  /**
   * The towel hanging off that rail, folded over and crooked.
   *
   * Origin is where the fold sits against the rail. Fabric is the only soft thing in a room made of
   * porcelain, tile and chrome, so it is doing a disproportionate amount of the "somebody lives
   * here" work and gets a real drape rather than a slab.
   */
  'bathroom.hangingTowel': (kit) => {
    const g = new THREE.Group();
    rot(g, 0, 0.07, 0);
    const fold = cylinder(kit, 26, 26, 400, 'fabricTowel', 10);
    rot(fold, 0, 0, Math.PI / 2);
    at(fold, 0, 244, -84);
    // Two hanging faces of different length — a symmetric towel looks ironed onto the rail.
    const front = drape(kit, 400, 470, 16, 'fabricTowel', 8);
    rot(front, Math.PI / 2 - 0.05, 0, 0.03);
    at(front, 0, 10, -108);
    const back = drape(kit, 380, 400, 14, 'fabricTowel', 8);
    rot(back, Math.PI / 2 + 0.04, 0, -0.02);
    at(back, -6, 46, -58);
    const hemFront = roundedBox(kit, 396, 16, 22, 'fabricTowel', 6);
    rot(hemFront, 0, 0, 0.03);
    at(hemFront, 0, -222, -110);
    const hemBack = roundedBox(kit, 376, 14, 20, 'fabricTowel', 6);
    at(hemBack, -6, -156, -56);
    const damp = roundedBox(kit, 300, 190, 26, 'grime', 10);
    at(damp, 10, -120, -116);
    g.add(fold, front, back, hemFront, hemBack, damp);
    return shadows(g, true, true);
  },

  /* ---------------------------------------------------------------- ceiling */

  /**
   * The ceiling fixture. Origin at the ceiling, hanging down — it is never an occluder because it
   * is above everything, so it is built without any fade concession.
   */
  'bathroom.ceilingLight': (kit) => {
    const backplate = roundedBox(kit, 300, 24, 300, 'plasticWhite', 6);
    at(backplate, 0, -12, 0);
    const housing = cylinder(kit, 130, 148, 60, 'plasticWhite', 20);
    at(housing, 0, -50, 0);
    const diffuser = cylinder(kit, 152, 130, 76, 'glassFrosted', 20);
    at(diffuser, 0, -108, 0);
    const cap = cylinder(kit, 118, 140, 22, 'glassFrosted', 20);
    at(cap, 0, -152, 0);
    const trim = ring(kit, 150, 8, 'steelBrushed');
    rot(trim, -Math.PI / 2, 0, 0);
    at(trim, 0, -70, 0);
    // Dead insects in the diffuser. The room's own joke, and it costs three meshes.
    const g = group(backplate, housing, diffuser, cap, trim);
    for (let i = 0; i < 3; i++) {
      const husk = blob(kit, 7 + kit.rand() * 4, 0.42, 'grime', 6);
      const a = kit.rand() * Math.PI * 2;
      at(husk, Math.cos(a) * 60, -146, Math.sin(a) * 60);
      g.add(husk);
    }
    return shadows(g, false, false);
  },

  /** Extractor vent. Louvres and a visible fan behind them, so it reads as an opening not a plate. */
  'bathroom.ceilingVent': (kit) => {
    const frame = roundedBox(kit, 300, 26, 300, 'plasticWhite', 5);
    at(frame, 0, -13, 0);
    const throat = box(kit, 236, 60, 236, 'plasticBlack');
    at(throat, 0, 18, 0);
    const hub = cylinder(kit, 34, 34, 24, 'plasticBlack', 12);
    at(hub, 0, -4, 0);
    const g = group(frame, throat, hub);
    // Fan blades, visible through the louvres.
    for (let i = 0; i < 5; i++) {
      const blade = roundedBox(kit, 96, 6, 28, 'plasticWhite', 2);
      rot(blade, 0.4, (i / 5) * Math.PI * 2, 0);
      at(blade, 0, -4, 0);
      g.add(blade);
    }
    for (let i = 0; i < 7; i++) {
      const louvre = roundedBox(kit, 240, 8, 22, 'plasticWhite', 2);
      rot(louvre, 0.55, 0, 0);
      at(louvre, 0, -30, -96 + i * 32);
      g.add(louvre);
    }
    // Dust felted onto the intake edge — the one thing that dates a vent as installed years ago.
    const dust = roundedBox(kit, 244, 6, 200, 'grime', 3);
    at(dust, 0, -40, 0);
    g.add(dust);
    return shadows(g, false, false);
  },
};

import * as THREE from 'three';
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
import { num, type PropRegistry } from './registry';

/**
 * Living-room props.
 *
 * The room has to be nameable from its objects alone — no label, no minimap. Four silhouettes do
 * that work from a low diagonal camera: the sofa mass, the coffee table's open void, the television
 * on its stand, and the drying rack's A-frame. Everything else exists to make those four read as
 * *lived in* rather than as furniture icons, and to physically justify a route the player is
 * expected to find (the throw blanket for the fabric climb, the TV power lead for the cable climb,
 * the cable nest for the east lane).
 */

const BOOK_COLOURS = [0x6c3a33, 0x2f4a55, 0x7a6a3f, 0x3d4a35, 0x5a4560, 0x8a7a5e] as const;

function pick<T>(kit: Kit, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(kit.rand() * list.length))];
}

/** Signed jitter in millimetres, from the seeded source. */
function jitter(kit: Kit, amountMm: number): number {
  return (kit.rand() - 0.5) * 2 * amountMm;
}

/** A cylinder spanning two millimetre points. Legs that splay, cords, rack struts, fan spokes. */
function strut(
  kit: Kit,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  radiusMm: number,
  material: Parameters<typeof cylinder>[4],
  segments = 8,
): THREE.Mesh {
  const delta = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const lengthMm = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const mesh = cylinder(kit, radiusMm, radiusMm, lengthMm, material, segments);
  at(mesh, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}

/** Four corner legs. Every carcass in the room stands on some version of this. */
function cornerLegs(
  kit: Kit,
  spanXMm: number,
  spanZMm: number,
  heightMm: number,
  sizeMm: number,
  material: Parameters<typeof roundedBox>[4],
): THREE.Group {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = roundedBox(kit, sizeMm, heightMm, sizeMm, material, 1.5);
      g.add(at(leg, (sx * spanXMm) / 2, heightMm / 2, (sz * spanZMm) / 2));
    }
  }
  return g;
}

/**
 * A filled cushion. The piped seam is not decoration — at 35 mm scale the seam is the only thing
 * that separates "upholstery" from "grey box", and the sofa is the room's primary silhouette.
 */
function cushionBlock(
  kit: Kit,
  widthMm: number,
  heightMm: number,
  depthMm: number,
  material: Parameters<typeof roundedBox>[4],
  seam: THREE.Material,
): THREE.Group {
  const body = roundedBox(
    kit,
    widthMm,
    heightMm,
    depthMm,
    material,
    Math.min(widthMm, depthMm) * 0.13,
  );
  const piping = roundedBox(
    kit,
    widthMm * 1.02,
    heightMm * 0.2,
    depthMm * 1.02,
    seam,
    heightMm * 0.09,
  );
  return group(body, at(piping, 0, 0, 0));
}

/** A sheet of cloth hanging from the origin: a drape tipped into the vertical plane. */
function hangingCloth(
  kit: Kit,
  widthMm: number,
  dropMm: number,
  sagMm: number,
  material: Parameters<typeof drape>[4],
  divisions = 10,
): THREE.Mesh {
  const panel = drape(kit, widthMm, dropMm, sagMm, material, divisions);
  rot(panel, Math.PI / 2, 0, 0);
  return at(panel, 0, -dropMm / 2, 0);
}

/** A book standing on its tail, with the block of pages proud of the covers. */
function standingBook(kit: Kit, thickMm: number, heightMm: number, depthMm: number): THREE.Group {
  const cover = kit.materials.clone('cardboard', pick(kit, BOOK_COLOURS));
  const spine = roundedBox(kit, thickMm, heightMm, depthMm, cover, thickMm * 0.22);
  const pages = roundedBox(kit, thickMm * 0.72, heightMm * 0.94, depthMm * 0.97, 'paper', 0.8);
  return group(spine, at(pages, 0, 0, depthMm * 0.03));
}

export const LIVING_PROPS: PropRegistry = {
  /**
   * The rug is a gameplay object first: a 0.25-exposure corridor across open floor. It has to read
   * as a distinct woven plane from above, so it gets a bound border in a second tone and a lifted
   * corner — a perfectly flat rectangle would read as a floor decal, which is exactly the "flat
   * diagram" defect this build exists to remove.
   */
  'living.rug': (kit, options) => {
    const widthMm = num(options, 'widthMm', 2500);
    const depthMm = num(options, 'depthMm', 1510);
    const border = 90;
    const borderMat = kit.materials.clone('fabricRug', 0x5c4c3d);

    const backing = box(kit, widthMm, 9, depthMm, kit.materials.clone('fabricRug', 0x4a3f34));
    const field = drape(kit, widthMm - border * 2, depthMm - border * 2, 4, 'fabricRug', 14);
    const g = group(at(backing, 0, 4.5, 0), at(field, 0, 11, 0));

    for (const sz of [-1, 1]) {
      const band = roundedBox(kit, widthMm, 13, border, borderMat, 2.5);
      g.add(at(band, 0, 8, (sz * (depthMm - border)) / 2));
    }
    for (const sx of [-1, 1]) {
      const band = roundedBox(kit, border, 13, depthMm - border * 2, borderMat, 2.5);
      g.add(at(band, (sx * (widthMm - border)) / 2, 8, 0));
    }

    // One corner never lies flat. It is the cheapest possible proof the rug is cloth, not paint.
    const curl = drape(kit, 320, 300, 26, 'fabricRug', 6);
    rot(curl, 0, 0.2, -0.22);
    g.add(at(curl, -widthMm / 2 + 180, 26, -depthMm / 2 + 170));

    const worn = patch(kit, 620, 400, kit.materials.clone('fabricRug', 0x6d5c4a));
    g.add(at(worn, widthMm * 0.18, 13, 0));

    return shadows(g, true, true);
  },

  /**
   * The sofa. Its whole reason for existing at this scale is the void underneath — 110 mm of legroom
   * over 2100 x 880 of unlit floor — so the legs are slender, the frame rail is high, and nothing
   * skirts down to hide the gap. Three separate seat squabs give the seam the crumbs live in.
   */
  'living.sofa': (kit, options) => {
    const lengthMm = num(options, 'lengthMm', 2100);
    const depthMm = num(options, 'depthMm', 880);
    const seatMm = num(options, 'seatMm', 440);
    const legMm = num(options, 'legMm', 110);
    const seam = kit.materials.clone('fabricSofa', 0x554d44);

    const railTop = legMm + 80;
    const squabH = seatMm - railTop;
    const armW = 190;
    const backD = 210;
    const g = new THREE.Group();

    g.add(cornerLegs(kit, lengthMm - 180, depthMm - 180, legMm, 100, 'woodDark'));
    const rail = roundedBox(kit, lengthMm - 80, 80, depthMm - 100, 'woodDark', 4);
    g.add(at(rail, 0, legMm + 40, 0));

    // Three squabs, 8 mm apart. The seam between them is where the household loses food.
    const squabW = (lengthMm - armW * 2 - 16) / 3;
    for (let i = -1; i <= 1; i++) {
      const squab = cushionBlock(kit, squabW, squabH, depthMm - backD - 60, 'fabricSofa', seam);
      g.add(at(squab, i * (squabW + 8), railTop + squabH / 2, -backD / 2 - 6));
    }

    const backPanel = roundedBox(kit, lengthMm, 520, backD, 'fabricSofa', 22);
    g.add(at(backPanel, 0, 300 + 260, depthMm / 2 - backD / 2));
    for (const sx of [-1, 1]) {
      const backCushion = cushionBlock(kit, lengthMm / 2 - 130, 340, 170, 'fabricSofa', seam);
      rot(backCushion, -0.12, 0, 0);
      g.add(at(backCushion, (sx * lengthMm) / 4, 640, depthMm / 2 - 150));
    }

    for (const sx of [-1, 1]) {
      const arm = roundedBox(kit, armW, 510, depthMm - 20, 'fabricSofa', 34);
      g.add(at(arm, (sx * (lengthMm - armW)) / 2, legMm + 255, 0));
      const armSeam = roundedBox(kit, armW * 1.03, 30, depthMm - 20, seam, 12);
      g.add(at(armSeam, (sx * (lengthMm - armW)) / 2, legMm + 495, 0));
    }

    return shadows(g, true, true);
  },

  /** A loose throw cushion shoved forward on the seat. Low enough to walk over, tall enough to hide behind. */
  'living.sofaCushion': (kit) => {
    const seam = kit.materials.clone('fabricClothes', 0x4a505c);
    const body = cushionBlock(kit, 400, 130, 380, 'fabricClothes', seam);
    rot(body, 0.14, 0, jitter(kit, 0.12));
    const g = group(at(body, 0, 72, 0));
    // Corner tufts: a cushion that is not pinched at the corners reads as a brick.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(at(blob(kit, 26, 0.5, seam, 6), sx * 188, 76, sz * 178));
      }
    }
    return shadows(g, true, true);
  },

  /**
   * The blanket over the armrest. The `living.fabric.throw` link claims a climb here, so the cloth
   * must physically reach the floor — an invisible route is a lie the player catches immediately.
   */
  'living.sofaThrow': (kit, options) => {
    const dropMm = num(options, 'dropMm', 440);
    const cloth = kit.materials.clone('fabricClothes', 0x7a6a74);
    const g = new THREE.Group();

    const spread = drape(kit, 540, 620, 34, cloth, 12);
    g.add(at(spread, 0, 22, 0));

    const bunch = drape(kit, 360, 300, 52, cloth, 8);
    rot(bunch, 0, 0.4, 0);
    g.add(at(bunch, -90, 62, 120));

    // The tail: over the front edge and down to the floor. This is the climbable face.
    const tail = hangingCloth(kit, 380, dropMm + 60, 40, cloth, 10);
    rot(tail, Math.PI / 2, 0.1, 0);
    g.add(at(tail, -40, 10, -300));

    const roll = cylinder(kit, 44, 40, 360, cloth, 10);
    rot(roll, 0, 0, Math.PI / 2);
    g.add(at(roll, -40, 34, -292));

    const pool = drape(kit, 420, 280, 22, cloth, 8);
    g.add(at(pool, -40, -dropMm + 12, -400));

    return shadows(g, true, true);
  },

  /** Crumbs driven into the seat seam. Flat detritus: it receives light, it does not cast a map sample. */
  'living.crumbSeam': (kit) => {
    const shadowLine = patch(kit, 240, 46, 'grime');
    const crumbs = scatter(kit, 11, 90, () => {
      const c = blob(kit, 1.4 + kit.rand() * 1.6, 0.62, 'crumb', 6);
      return at(c, 0, 2 + kit.rand() * 2, 0);
    });
    const flake = at(blob(kit, 3.2, 0.34, kit.materials.clone('crumb', 0xd8c49a), 6), 34, 2.4, -8);
    return shadows(group(at(shadowLine, 0, 1, 0), crumbs, flake), false, true);
  },

  /**
   * Coffee table. The lower shelf and the deliberately thin apron keep the underside open, because
   * `living.tableunder` is a relay the player is meant to spot from across the room.
   */
  'living.coffeeTable': (kit, options) => {
    const lengthMm = num(options, 'lengthMm', 1200);
    const depthMm = num(options, 'depthMm', 600);
    const topMm = num(options, 'topMm', 420);
    const legInsetX = 80;
    const legInsetZ = 60;

    const top = roundedBox(kit, lengthMm, 32, depthMm, 'woodDark', 3);
    const lip = roundedBox(kit, lengthMm - 24, 12, depthMm - 24, 'wood', 2);
    const g = group(at(top, 0, topMm - 16, 0), at(lip, 0, topMm - 36, 0));

    for (const sz of [-1, 1]) {
      const apron = roundedBox(kit, lengthMm - 220, 44, 24, 'woodDark', 2);
      g.add(at(apron, 0, topMm - 58, (sz * (depthMm - 90)) / 2));
    }

    const shelf = roundedBox(kit, lengthMm - 240, 20, depthMm - 180, 'wood', 2);
    g.add(at(shelf, 0, 150, 0));

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = cylinder(kit, 32, 24, topMm - 42, 'wood', 10);
        g.add(
          at(
            leg,
            (sx * (lengthMm - legInsetX * 2 - 80)) / 2,
            (topMm - 42) / 2,
            (sz * (depthMm - legInsetZ * 2 - 40)) / 2,
          ),
        );
      }
    }

    return shadows(g, true, true);
  },

  /** Tissue box with one sheet still standing out of the oval — the household left in a hurry. */
  'living.tissueBox': (kit) => {
    const carton = kit.materials.clone('cardboard', 0xb8bcc4);
    const body = roundedBox(kit, 215, 100, 155, carton, 5);
    const band = roundedBox(kit, 218, 34, 158, kit.materials.clone('cardboard', 0x5f7f92), 4);
    const g = group(at(body, 0, 50, 0), at(band, 0, 34, 0));

    const slot = box(kit, 130, 6, 52, 'plasticWhite');
    g.add(at(slot, 0, 99, 0));
    const mouth = box(kit, 108, 4, 34, 'grime');
    g.add(at(mouth, 0, 101, 0));

    const sheet = hangingCloth(kit, 92, 120, 16, 'paper', 6);
    rot(sheet, Math.PI / 2 + 0.9, 0.3, 0);
    g.add(at(sheet, 6, 148, 4));

    return shadows(g, true, true);
  },

  /** Tumbler, half full. It is the reason a condensation ring exists 90 mm away on the same board. */
  'living.drinkGlass': (kit) => {
    const body = cylinder(kit, 52, 42, 118, 'glass', 16);
    const base = cylinder(kit, 44, 44, 14, 'glass', 16);
    const rim = ring(kit, 50, 3, 'glass');
    rot(rim, Math.PI / 2, 0, 0);
    const drink = cylinder(kit, 47, 41, 56, 'water', 16);
    const g = group(at(base, 0, 7, 0), at(body, 0, 59, 0), at(rim, 0, 117, 0), at(drink, 0, 44, 0));
    // Condensation beads on the outside: three is enough to say "cold" at macro range.
    for (let i = 0; i < 3; i++) {
      const angle = kit.rand() * Math.PI * 2;
      const y = 40 + kit.rand() * 55;
      const bead = blob(kit, 2.6 + kit.rand() * 1.4, 0.7, 'water', 6);
      g.add(at(bead, Math.cos(angle) * 47, y, Math.sin(angle) * 47));
    }
    return shadows(g, true, true);
  },

  /** The wet ring the glass left. A moisture resource: it must look like liquid, not like a decal. */
  'living.glassRing': (kit, options) => {
    const radiusMm = num(options, 'radiusMm', 52);
    const band = ring(kit, radiusMm, 3.2, 'water');
    rot(band, Math.PI / 2, 0, 0);
    const film = patch(kit, radiusMm * 1.9, radiusMm * 1.9, kit.materials.clone('water', 0x6e8fa0));
    const smear = patch(kit, radiusMm * 1.1, radiusMm * 0.6, 'water');
    return shadows(
      group(
        at(film, 0, 0.5, 0),
        at(band, 0, 1.6, 0),
        at(smear, radiusMm * 0.9, 1.1, radiusMm * 0.5),
      ),
      false,
      true,
    );
  },

  /**
   * The snack bag. Best food in the chapter, and it has to look *open* — the folded-over top and
   * the dark mouth are what tell the player this is a source and not scenery.
   */
  'living.snackBag': (kit) => {
    const print = kit.materials.clone('plasticRed', 0xa8443a);
    const body = roundedBox(kit, 180, 150, 118, 'foil', 26);
    rot(body, -0.16, 0, 0.05);
    const gusset = roundedBox(kit, 172, 44, 132, 'foil', 18);
    const g = group(at(gusset, 0, 22, 0), at(body, 0, 102, 8));

    const panel = roundedBox(kit, 118, 92, 8, print, 3);
    rot(panel, -0.16, 0, 0.05);
    g.add(at(panel, 0, 106, -54));

    const flap = roundedBox(kit, 168, 12, 88, 'foil', 4);
    rot(flap, 0.55, 0.06, 0);
    g.add(at(flap, 0, 176, 34));

    const mouth = box(kit, 146, 8, 62, 'grime');
    rot(mouth, -0.16, 0, 0);
    g.add(at(mouth, 0, 172, 2));

    // Two crisps that fell out. The evidence trail the household eventually reads.
    for (let i = 0; i < 2; i++) {
      const crisp = blob(kit, 13 + kit.rand() * 5, 0.28, 'crumb', 6);
      rot(crisp, jitter(kit, 0.5), kit.rand() * Math.PI, jitter(kit, 0.4));
      g.add(at(crisp, jitter(kit, 120), 5, -80 - kit.rand() * 60));
    }

    return shadows(g, true, true);
  },

  /** TV remote. Small, but it is the only object that explains why the television turns itself on. */
  'living.remote': (kit) => {
    const body = roundedBox(kit, 46, 20, 188, 'plasticBlack', 6);
    const pad = roundedBox(kit, 36, 5, 150, 'rubber', 2);
    const g = group(at(body, 0, 10, 0), at(pad, 0, 20, -4));

    const power = cylinder(kit, 5, 5, 4, 'plasticRed', 8);
    g.add(at(power, 0, 22, 76));

    const dpad = ring(kit, 9, 2.6, 'steelBrushed');
    rot(dpad, Math.PI / 2, 0, 0);
    g.add(at(dpad, 0, 22, 18));
    g.add(at(sphere(kit, 4.4, 'plasticWhite', 8), 0, 22, 18));

    for (let i = 0; i < 3; i++) {
      const key = roundedBox(kit, 26, 3, 9, kit.materials.clone('rubber', 0x3c3f44), 1);
      g.add(at(key, 0, 22, -30 - i * 20));
    }

    const battery = roundedBox(kit, 34, 3, 60, kit.materials.clone('plasticBlack', 0x1a1c20), 1);
    g.add(at(battery, 0, 1, -50));

    return shadows(g, true, true);
  },

  /** A leaning stack of magazines. Fanned, because a squared-off stack reads as a solid block. */
  'living.magazineStack': (kit) => {
    const g = new THREE.Group();
    const covers = [0x8a5a4a, 0x4a6a7a, 0xb0a48c, 0x6a5a7a] as const;
    let y = 0;
    for (let i = 0; i < 4; i++) {
      const thick = 5 + kit.rand() * 3;
      const paper = box(kit, 206, thick, 282, 'paper');
      rot(paper, 0, jitter(kit, 0.22), 0);
      g.add(at(paper, jitter(kit, 14), y + thick / 2, jitter(kit, 12)));
      y += thick;
    }
    const cover = box(
      kit,
      208,
      2.5,
      284,
      kit.materials.clone('paper', covers[Math.floor(kit.rand() * 4) % 4]),
    );
    rot(cover, 0, jitter(kit, 0.2), 0);
    g.add(at(cover, jitter(kit, 10), y + 1.5, jitter(kit, 10)));

    // The top magazine's cover has lifted at one corner — the stack has been read, not styled.
    const curl = drape(kit, 90, 120, 12, 'paper', 5);
    rot(curl, 0, 0.3, -0.35);
    g.add(at(curl, 70, y + 12, -100));

    return shadows(g, true, true);
  },

  /**
   * TV stand. Length runs along Z against the east wall; the top board overhangs the carcass at the
   * front so a climb that arrives on top lands over walkable floor, the same idiom as the kitchen
   * toe-kick. The back overhang is half the front, which is what keeps the 110 mm cable lane open.
   */
  'living.tvStand': (kit, options) => {
    const lengthMm = num(options, 'lengthMm', 1600);
    const depthMm = num(options, 'depthMm', 270);
    const topMm = num(options, 'topMm', 480);
    const overhangMm = num(options, 'overhangMm', 100);
    const backOverhang = overhangMm / 2;
    const topWidth = depthMm + overhangMm + backOverhang;
    const topOffsetX = (backOverhang - overhangMm) / 2;
    const frontX = -depthMm / 2;

    const board = roundedBox(kit, topWidth, 30, lengthMm, 'woodDark', 3);
    const carcass = roundedBox(kit, depthMm, topMm - 95, lengthMm - 40, 'laminateDark', 4);
    const plinth = roundedBox(kit, depthMm - 30, 45, lengthMm - 100, 'laminateDark', 3);
    const g = group(
      at(board, topOffsetX, topMm - 15, 0),
      at(carcass, 0, 45 + (topMm - 95) / 2, 0),
      at(plinth, 0, 22, 0),
    );

    for (const sz of [-1, 1]) {
      const front = roundedBox(kit, 16, 190, lengthMm / 2 - 90, 'cabinetDoor', 3);
      g.add(at(front, frontX - 8, topMm - 150, (sz * lengthMm) / 4));
      const handle = roundedBox(kit, 12, 14, 260, 'steelBrushed', 3);
      g.add(at(handle, frontX - 20, topMm - 150, (sz * lengthMm) / 4));
    }

    const cavity = box(kit, 8, 150, lengthMm - 120, 'grime');
    g.add(at(cavity, frontX + 2, 150, 0));

    // Set-top box on the open shelf, with the standby LED that motivates the room's dim glow.
    const stb = roundedBox(kit, depthMm - 70, 52, 300, 'plasticBlack', 4);
    g.add(at(stb, 10, 176, -300));
    g.add(
      at(box(kit, 4, 6, 14, kit.materials.clone('plasticRed', 0xff5a44)), frontX + 30, 176, -300),
    );

    return shadows(g, true, true);
  },

  /**
   * The television, screen facing local +Z. Its power lead is authored as real geometry dropping off
   * the back board to the floor, because `living.cable.tvpower` sells a climb there — a link with no
   * visible cable is the kind of thing a player calls out in the first thirty seconds.
   */
  'living.television': (kit, options) => {
    const diagonalMm = num(options, 'diagonalMm', 1400);
    const panelW = diagonalMm * 0.871;
    const panelH = diagonalMm * 0.49;
    const footY = 26;
    const panelBottom = footY + 114;
    const panelY = panelBottom + panelH / 2;

    const foot = roundedBox(kit, panelW * 0.64, footY, 170, 'steelBrushed', 3);
    const neck = roundedBox(kit, 180, 120, 92, 'plasticBlack', 8);
    const shell = roundedBox(kit, panelW, panelH, 40, 'plasticBlack', 5);
    const bezel = roundedBox(kit, panelW + 8, panelH + 8, 10, 'plasticBlack', 2);
    const screen = box(kit, panelW - 26, panelH - 26, 4, 'screenOff');
    const g = group(
      at(foot, 0, footY / 2, 0),
      at(neck, 0, footY + 60, -6),
      at(shell, 0, panelY, -10),
      at(bezel, 0, panelY, 14),
      at(screen, 0, panelY, 18),
    );

    // The electronics bulge and the port bay: the back is the side the player actually climbs past.
    const housing = roundedBox(
      kit,
      panelW * 0.42,
      panelH * 0.46,
      26,
      kit.materials.clone('plasticBlack', 0x1b1d21),
      4,
    );
    g.add(at(housing, 0, panelY - 40, -34));
    g.add(at(roundedBox(kit, 92, 14, 6, 'steelPolished', 1), 0, panelBottom + 16, 20));
    g.add(
      at(
        blob(kit, 5, 0.7, kit.materials.clone('plasticRed', 0xff6a4a), 6),
        panelW * 0.36,
        panelBottom + 12,
        20,
      ),
    );

    const lead = tube(
      kit,
      [
        [-60, panelY - 60, -40],
        [-60, panelBottom - 60, -120],
        [-60, -160, -168],
        [-60, -420, -172],
        [-60, -474, -150],
      ],
      6,
      'cable',
      20,
    );
    g.add(lead);

    return shadows(g, true, true);
  },

  /**
   * The cable nest behind the stand. This is a foothold the player has to *find*, so it is built to
   * be legible the moment the camera sees into the lane: crossing leads, a coiled surplus, a plug
   * brick, and the dust that only ever accumulates where nobody can reach.
   */
  'living.cableNest': (kit, options) => {
    const lengthMm = num(options, 'lengthMm', 900);
    const half = lengthMm / 2;
    const g = new THREE.Group();

    g.add(
      tube(
        kit,
        [
          [-30, 8, -half],
          [12, 15, -half * 0.55],
          [-22, 10, -half * 0.1],
          [26, 17, half * 0.4],
          [-12, 9, half],
        ],
        6,
        'cable',
        24,
      ),
    );
    g.add(
      tube(
        kit,
        [
          [24, 7, -half],
          [-18, 13, -half * 0.4],
          [20, 9, half * 0.15],
          [-24, 14, half * 0.6],
          [8, 8, half],
        ],
        5,
        'plasticWhite',
        24,
      ),
    );

    const coil = ring(kit, 42, 5.5, 'cable');
    rot(coil, Math.PI / 2, 0, 0.16);
    g.add(at(coil, 6, 9, half * 0.25));
    const coil2 = ring(kit, 34, 5, 'cable');
    rot(coil2, Math.PI / 2, 0, -0.1);
    g.add(at(coil2, -4, 18, half * 0.28));

    const brick = roundedBox(kit, 46, 28, 78, 'plasticWhite', 4);
    rot(brick, 0, 0.12, 0);
    g.add(at(brick, 2, 14, -half * 0.66));

    for (let i = 0; i < 3; i++) {
      const fluff = blob(kit, 16 + kit.rand() * 10, 0.34, 'grime', 6);
      g.add(at(fluff, jitter(kit, 34), 5, jitter(kit, half * 0.8)));
    }

    return shadows(g, true, true);
  },

  /** Multi-tap power strip. Its switch LED is the red standby light authored at this exact spot. */
  'living.powerStrip': (kit) => {
    const body = roundedBox(kit, 300, 32, 62, 'plasticWhite', 5);
    const g = group(at(body, 0, 16, 0));
    for (let i = -1; i <= 1; i++) {
      const socket = box(kit, 54, 4, 52, kit.materials.clone('plasticWhite', 0xb4b1a9));
      g.add(at(socket, i * 74, 32, 0));
      g.add(at(box(kit, 6, 6, 26, 'plasticBlack'), i * 74, 30, 0));
    }
    const rocker = roundedBox(kit, 26, 10, 18, 'plasticRed', 2);
    g.add(at(rocker, 128, 34, 0));
    g.add(at(blob(kit, 4, 0.6, kit.materials.clone('plasticRed', 0xff5a44), 6), 128, 38, 0));
    g.add(
      tube(
        kit,
        [
          [-150, 14, 0],
          [-230, 10, 26],
          [-330, 8, -14],
        ],
        5,
        'cable',
        14,
      ),
    );
    return shadows(g, true, true);
  },

  /** The unreachable sticky patch. Elongated along the lane, because the lane is only 110 mm wide. */
  'living.sodaStain': (kit, options) => {
    const radiusMm = num(options, 'radiusMm', 90);
    const widthMm = Math.min(radiusMm * 1.15, 104);
    const main = patch(kit, widthMm, radiusMm * 2.1, 'grime');
    const gloss = patch(kit, widthMm * 0.6, radiusMm * 1.2, 'water');
    const g = group(at(main, 0, 0.5, 0), at(gloss, jitter(kit, 12), 1.1, jitter(kit, 20)));
    for (let i = 0; i < 2; i++) {
      const fleck = patch(kit, 16 + kit.rand() * 14, 20 + kit.rand() * 18, 'grime');
      g.add(at(fleck, jitter(kit, 40), 0.8, jitter(kit, radiusMm * 1.4)));
    }
    return shadows(g, false, true);
  },

  /** Low sideboard, length along Z, standing on legs so the east lane runs unbroken beneath it. */
  'living.sideboard': (kit, options) => {
    const lengthMm = num(options, 'lengthMm', 960);
    const depthMm = num(options, 'depthMm', 190);
    const topMm = num(options, 'topMm', 560);
    const legH = 70;
    const carcassH = topMm - legH - 26;

    const board = roundedBox(kit, depthMm + 24, 26, lengthMm + 30, 'wood', 3);
    const carcass = roundedBox(kit, depthMm, carcassH, lengthMm, 'laminate', 4);
    const g = group(at(board, -8, topMm - 13, 0), at(carcass, 0, legH + carcassH / 2, 0));

    for (const sz of [-1, 1]) {
      const door = roundedBox(kit, 14, carcassH - 60, lengthMm / 2 - 50, 'cabinetDoor', 3);
      g.add(at(door, -depthMm / 2 - 7, legH + carcassH / 2, (sz * lengthMm) / 4));
      g.add(
        at(
          sphere(kit, 11, 'brass', 8),
          -depthMm / 2 - 18,
          legH + carcassH / 2,
          (sz * lengthMm) / 4 + 90,
        ),
      );
    }

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = cylinder(kit, 9, 12, legH, 'steelBrushed', 8);
        g.add(at(leg, (sx * (depthMm - 60)) / 2, legH / 2, (sz * (lengthMm - 100)) / 2));
      }
    }

    return shadows(g, true, true);
  },

  /** Router. Antennae read at silhouette range; the green standby LED is the light authored here. */
  'living.router': (kit) => {
    const body = roundedBox(kit, 220, 36, 148, 'plasticWhite', 7);
    const vent = box(kit, 178, 3, 106, kit.materials.clone('plasticBlack', 0x2c2f34));
    const g = group(at(body, 0, 18, 0), at(vent, 0, 36, 0));
    for (const sx of [-1, 1]) {
      const antenna = strut(kit, [sx * 96, 34, -58], [sx * 132, 176, -96], 4.5, 'plasticBlack');
      g.add(antenna);
      g.add(at(sphere(kit, 6, 'plasticBlack', 6), sx * 96, 34, -58));
    }
    const led = box(kit, 46, 4, 5, kit.materials.clone('plasticGreen', 0x66ff9c));
    g.add(at(led, 0, 22, 74));
    g.add(
      tube(
        kit,
        [
          [70, 16, -70],
          [110, 10, -140],
          [128, -80, -200],
        ],
        4,
        'cable',
        14,
      ),
    );
    return shadows(g, true, true);
  },

  /** Wall-hung picture. Mounted on the blank east wall, so it is what tells you the wall is a wall. */
  'living.pictureFrame': (kit) => {
    const w = 420;
    const h = 560;
    const railW = 34;
    const backer = roundedBox(kit, w, h, 8, 'cardboard', 1.5);
    const print = box(
      kit,
      w - railW * 2 - 60,
      h - railW * 2 - 60,
      1.5,
      kit.materials.clone('paper', 0x8d8f84),
    );
    const mat = box(kit, w - railW * 2, h - railW * 2, 3, 'paper');
    const glazing = box(kit, w - railW * 1.4, h - railW * 1.4, 2, 'glass');
    const g = group(
      at(backer, 0, 0, 5),
      at(mat, 0, 0, 12),
      at(print, 0, 0, 14),
      at(glazing, 0, 0, 22),
    );

    for (const sy of [-1, 1]) {
      const rail = roundedBox(kit, w, railW, 30, 'woodDark', 2.5);
      g.add(at(rail, 0, (sy * (h - railW)) / 2, 16));
    }
    for (const sx of [-1, 1]) {
      const rail = roundedBox(kit, railW, h - railW * 2, 30, 'woodDark', 2.5);
      g.add(at(rail, (sx * (w - railW)) / 2, 0, 16));
    }

    return shadows(g, true, true);
  },

  /** Bookshelf on the south wall. Open-backed shelves; the book row prop lands on the 760 mm shelf. */
  'living.bookshelf': (kit, options) => {
    const lengthMm = num(options, 'lengthMm', 730);
    const depthMm = num(options, 'depthMm', 170);
    const heightMm = num(options, 'heightMm', 1100);
    const sideT = 18;

    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const side = roundedBox(kit, sideT, heightMm, depthMm, 'laminate', 2);
      g.add(at(side, (sx * (lengthMm - sideT)) / 2, heightMm / 2, 0));
    }
    g.add(at(roundedBox(kit, lengthMm, 20, depthMm, 'laminate', 2), 0, heightMm - 10, 0));
    g.add(at(roundedBox(kit, lengthMm, 40, depthMm, 'laminate', 2), 0, 20, 0));
    g.add(
      at(
        box(kit, lengthMm - sideT * 2, heightMm - 60, 6, kit.materials.clone('laminate', 0x8d8073)),
        0,
        heightMm / 2,
        depthMm / 2 - 3,
      ),
    );

    for (const shelfTop of [260, 500, 760, 1000]) {
      if (shelfTop > heightMm - 60) continue;
      const shelf = roundedBox(kit, lengthMm - sideT * 2, 18, depthMm - 12, 'laminate', 2);
      g.add(at(shelf, 0, shelfTop - 9, -4));
    }

    return shadows(g, true, true);
  },

  /**
   * A row of books. Uneven heights, two leaners and a flat stack — a perfectly aligned row reads as
   * a texture swatch, and this shelf is 700 mm from the south-wall lane the player walks.
   */
  'living.bookRow': (kit) => {
    const g = new THREE.Group();
    let x = -330;
    while (x < 210) {
      const thick = 16 + kit.rand() * 26;
      const bookHeight = 168 + kit.rand() * 74;
      const volume = standingBook(kit, thick, bookHeight, 128);
      const lean = kit.rand() < 0.22 ? jitter(kit, 0.2) - 0.16 : 0;
      rot(volume, 0, jitter(kit, 0.05), lean);
      g.add(at(volume, x + thick / 2, bookHeight / 2, jitter(kit, 6)));
      x += thick + 3;
    }

    // A pair laid flat in the gap at the end: the shelf is used, not curated.
    let y = 0;
    for (let i = 0; i < 2; i++) {
      const thick = 22 + kit.rand() * 14;
      const flat = roundedBox(
        kit,
        190,
        thick,
        132,
        kit.materials.clone('cardboard', pick(kit, BOOK_COLOURS)),
        2,
      );
      rot(flat, 0, jitter(kit, 0.12), 0);
      g.add(at(flat, 275, y + thick / 2, jitter(kit, 8)));
      y += thick;
    }

    return shadows(g, true, true);
  },

  /** Floor plant. The one organic silhouette in a room of boxes, which is what makes it read as a home. */
  'living.pottedPlant': (kit) => {
    const pot = kit.materials.clone('porcelain', 0xb5a795);
    const g = group(
      at(cylinder(kit, 155, 148, 18, pot, 16), 0, 9, 0),
      at(cylinder(kit, 140, 104, 205, pot, 16), 0, 120, 0),
      at(cylinder(kit, 132, 132, 16, 'grime', 16), 0, 216, 0),
    );
    const rim = ring(kit, 140, 9, pot);
    rot(rim, Math.PI / 2, 0, 0);
    g.add(at(rim, 0, 220, 0));

    const leafMat = kit.materials.clone('plasticGreen', 0x486b45);
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + kit.rand() * 0.6;
      const tipX = Math.cos(angle) * (110 + kit.rand() * 70);
      const tipZ = Math.sin(angle) * (110 + kit.rand() * 70);
      const topY = 430 + kit.rand() * 190;
      g.add(
        strut(
          kit,
          [0, 220, 0],
          [tipX * 0.5, topY, tipZ * 0.5],
          7,
          kit.materials.clone('plasticGreen', 0x4d5c3a),
        ),
      );

      for (let j = 0; j < 2; j++) {
        const leaf = sphere(kit, 70, leafMat, 8);
        leaf.scale.set(0.42, 0.1, 1);
        rot(leaf, jitter(kit, 0.4), angle + jitter(kit, 0.5), 0.45 + kit.rand() * 0.4);
        g.add(at(leaf, tipX * (0.4 + j * 0.4), topY - j * 90, tipZ * (0.4 + j * 0.4)));
      }
    }

    return shadows(g, true, true);
  },

  /** Tower air purifier. Standby light and a dark intake band so the cylinder is not a bare tube. */
  'living.airPurifier': (kit) => {
    const shell = 'plasticWhite';
    const g = group(
      at(cylinder(kit, 132, 140, 40, shell, 16), 0, 20, 0),
      at(cylinder(kit, 126, 132, 250, shell, 16), 0, 165, 0),
      at(
        cylinder(kit, 122, 126, 240, kit.materials.clone('plasticBlack', 0x2e3136), 16),
        0,
        410,
        0,
      ),
      at(cylinder(kit, 120, 124, 60, shell, 16), 0, 560, 0),
    );
    const outlet = ring(kit, 92, 14, kit.materials.clone('plasticBlack', 0x33373c));
    rot(outlet, Math.PI / 2, 0, 0);
    g.add(at(outlet, 0, 590, 0));
    g.add(at(roundedBox(kit, 76, 4, 44, 'screenOff', 1.5), 0, 592, -44));
    g.add(at(blob(kit, 5, 0.6, kit.materials.clone('plasticBlue', 0x7fd0ff), 6), 0, 594, -74));
    return shadows(g, true, true);
  },

  /** Standing fan, facing local +Z. The guard rings are what make it unmistakable in silhouette. */
  'living.standingFan': (kit) => {
    const shell = 'plasticWhite';
    const hubY = 830;
    const g = group(
      at(cylinder(kit, 150, 162, 30, shell, 16), 0, 15, 0),
      at(cylinder(kit, 84, 92, 22, kit.materials.clone('plasticWhite', 0xc4c1b8), 12), 0, 40, 0),
      at(cylinder(kit, 20, 27, 780, shell, 10), 0, 405, 0),
    );

    const motor = cylinder(kit, 48, 48, 120, shell, 12);
    rot(motor, Math.PI / 2, 0, 0);
    g.add(at(motor, 0, hubY, -60));

    const hub = cylinder(kit, 30, 30, 26, kit.materials.clone('plasticWhite', 0xb8b5ac), 12);
    rot(hub, Math.PI / 2, 0, 0);
    g.add(at(hub, 0, hubY, 6));

    for (let i = 0; i < 3; i++) {
      const blade = roundedBox(kit, 128, 5, 74, kit.materials.clone('plasticClear', 0xbcc4c6), 3);
      rot(blade, 0.35, 0, (i / 3) * Math.PI * 2);
      const angle = (i / 3) * Math.PI * 2;
      g.add(at(blade, Math.cos(angle) * 78, hubY + Math.sin(angle) * 78, 4));
    }

    for (const [r, t, z] of [
      [165, 7, 22],
      [104, 5, 26],
      [162, 6, -30],
    ] as const) {
      const guard = ring(kit, r, t, 'steelBrushed');
      g.add(at(guard, 0, hubY, z));
    }

    return shadows(g, true, true);
  },

  /** Floor lamp beside the sofa. Off all night, but it explains the reading routine's warm light. */
  'living.floorLamp': (kit) => {
    const g = group(
      at(cylinder(kit, 78, 88, 22, 'steelBrushed', 16), 0, 11, 0),
      at(cylinder(kit, 12, 15, 1290, 'steelBrushed', 10), 0, 667, 0),
      at(cylinder(kit, 16, 16, 44, 'brass', 10), 0, 1290, 0),
    );
    const weight = ring(kit, 70, 11, 'steelBrushed');
    rot(weight, Math.PI / 2, 0, 0);
    g.add(at(weight, 0, 22, 0));

    const shadeMat = kit.materials.clone('paper', 0xcfc4ae);
    // Capped, not open-ended: an open cylinder culls its far wall and the shade becomes a hole.
    g.add(at(cylinder(kit, 152, 192, 260, shadeMat, 18), 0, 1420, 0));
    const shadeRim = ring(kit, 192, 5, 'steelBrushed');
    rot(shadeRim, Math.PI / 2, 0, 0);
    g.add(at(shadeRim, 0, 1290, 0));
    g.add(at(sphere(kit, 34, 'glassFrosted', 10), 0, 1400, 0));

    g.add(
      tube(
        kit,
        [
          [0, 8, 60],
          [40, 6, 180],
          [-30, 5, 330],
        ],
        5,
        'cable',
        14,
      ),
    );

    return shadows(g, true, true);
  },

  /**
   * The drying rack. An A-frame with only two foot rails touching the floor — the household cannot
   * walk under it and the colony can, which is exactly the kind of asymmetry the room is built on.
   */
  'living.dryingRack': (kit, options) => {
    const widthMm = num(options, 'widthMm', 700);
    const depthMm = num(options, 'depthMm', 700);
    const heightMm = num(options, 'heightMm', 1000);
    const footZ = depthMm / 2 - 35;
    const topZ = 60;
    const g = new THREE.Group();

    for (const sz of [-1, 1]) {
      const railZ = sz * footZ;
      const rail = cylinder(kit, 11, 11, widthMm, 'steelBrushed', 8);
      rot(rail, 0, 0, Math.PI / 2);
      g.add(at(rail, 0, 11, railZ));
      for (const sx of [-1, 1]) {
        const footX = (sx * (widthMm - 40)) / 2;
        g.add(
          strut(kit, [footX, 11, railZ], [footX * 0.86, heightMm, sz * topZ], 9, 'steelBrushed'),
        );
      }
      const topRail = cylinder(kit, 9, 9, widthMm - 60, 'steelBrushed', 8);
      rot(topRail, 0, 0, Math.PI / 2);
      g.add(at(topRail, 0, heightMm, sz * topZ));
    }

    for (let i = 0; i < 5; i++) {
      const bar = cylinder(kit, 6, 6, widthMm - 80, 'steelBrushed', 6);
      rot(bar, 0, 0, Math.PI / 2);
      g.add(at(bar, 0, heightMm - 8, -topZ + (i / 4) * topZ * 2));
    }

    // Laundry actually hanging on it. An empty rack is a jungle gym, not a household object.
    for (const [x, z, w] of [
      [-140, -40, 300],
      [130, 45, 260],
    ] as const) {
      const towel = hangingCloth(kit, w, 520, 34, 'fabricTowel', 8);
      rot(towel, Math.PI / 2, jitter(kit, 0.1), 0);
      g.add(at(towel, x, heightMm - 10, z));
    }

    return shadows(g, true, true);
  },

  /** Laundry basket with clothes spilling over the rim — a soft mass in a room of hard edges. */
  'living.laundryBasket': (kit) => {
    const weave = kit.materials.clone('plasticWhite', 0xc3b39a);
    const g = group(
      at(cylinder(kit, 212, 176, 400, weave, 16, true), 0, 200, 0),
      // Capped plug 14 mm below the rim: it reads as a basket full of dark washing, and it stops
      // the camera seeing through the open weave wall to the floor behind.
      at(cylinder(kit, 200, 168, 380, 'grime', 16), 0, 196, 0),
      at(cylinder(kit, 178, 178, 14, weave, 16), 0, 7, 0),
    );
    const rim = ring(kit, 210, 12, weave);
    rot(rim, Math.PI / 2, 0, 0);
    g.add(at(rim, 0, 400, 0));

    const pile = drape(kit, 360, 340, 46, 'fabricClothes', 8);
    g.add(at(pile, 0, 386, 0));
    const spill = hangingCloth(
      kit,
      220,
      210,
      30,
      kit.materials.clone('fabricClothes', 0x7d6a62),
      6,
    );
    rot(spill, Math.PI / 2, 0.5, 0);
    g.add(at(spill, -170, 404, 60));

    return shadows(g, true, true);
  },

  /**
   * The robot vacuum dock, ramp facing local +Z into the room. The machine is director-spawned; the
   * dock is authored so the threat has a legible home the player can learn to watch.
   */
  'living.robotDock': (kit) => {
    const shell = 'plasticWhite';
    const g = group(
      at(roundedBox(kit, 300, 190, 32, shell, 6), 0, 95, -96),
      at(roundedBox(kit, 340, 16, 210, shell, 4), 0, 8, 22),
      at(
        roundedBox(kit, 300, 34, 60, kit.materials.clone('plasticWhite', 0xbdbab2), 5),
        0,
        24,
        -66,
      ),
    );
    for (const sx of [-1, 1]) {
      g.add(at(roundedBox(kit, 26, 130, 96, shell, 5), sx * 152, 65, -68));
      g.add(at(roundedBox(kit, 48, 6, 24, 'brass', 1.5), sx * 62, 20, -52));
    }
    g.add(at(box(kit, 34, 5, 6, kit.materials.clone('plasticBlue', 0x7fd0ff)), 0, 78, -78));
    g.add(
      tube(
        kit,
        [
          [120, 12, -110],
          [190, 9, -160],
          [230, 7, -240],
        ],
        5,
        'cable',
        14,
      ),
    );
    return shadows(g, true, true);
  },

  /** The dog's steel bowl, and the wet floor around it. The only reliable water on the west side. */
  'living.dogBowl': (kit) => {
    const g = group(
      at(cylinder(kit, 90, 62, 62, 'steelPolished', 18), 0, 31, 0),
      at(cylinder(kit, 78, 50, 54, 'steelBrushed', 18), 0, 36, 0),
      at(cylinder(kit, 66, 66, 8, 'rubber', 16), 0, 4, 0),
      at(cylinder(kit, 72, 72, 3, 'water', 16), 0, 44, 0),
    );
    const rim = ring(kit, 88, 5, 'steelPolished');
    rot(rim, Math.PI / 2, 0, 0);
    g.add(at(rim, 0, 60, 0));

    // The slop the dog throws when it drinks. This is the moisture resource made visible.
    g.add(at(patch(kit, 150, 200, 'water'), 6, 0.6, 150));
    g.add(at(patch(kit, 70, 90, kit.materials.clone('water', 0x6d8d9c)), -34, 1.2, 108));

    return shadows(g, true, true);
  },

  /** Kibble the dog knocked out. Individually modelled pellets: at 35 mm scale each one is cargo. */
  'living.kibbleScatter': (kit, options) => {
    const radiusMm = num(options, 'radiusMm', 220);
    const pellet = kit.materials.clone('crumb', 0x8a6238);
    const g = scatter(kit, 15, radiusMm, () => {
      const piece = blob(kit, 5 + kit.rand() * 3.5, 0.62, pellet, 7);
      rot(piece, jitter(kit, 0.5), 0, jitter(kit, 0.5));
      return at(piece, 0, 3.6, 0);
    });
    // Two crushed ones: a dog stood on them, and a flattened pellet reads differently at macro range.
    for (let i = 0; i < 2; i++) {
      const crushed = blob(kit, 9 + kit.rand() * 4, 0.2, pellet, 7);
      g.add(at(crushed, jitter(kit, radiusMm), 1.8, jitter(kit, radiusMm)));
    }
    return shadows(g, true, true);
  },

  /** Chewed rubber ball. Its worn band is what stops it reading as an untextured sphere. */
  'living.dogToyBall': (kit) => {
    const shell = kit.materials.clone('rubber', 0x5a4038);
    const g = group(at(sphere(kit, 38, shell, 14), 0, 38, 0));
    for (const [axis, colour] of [
      [0, 0x9c3a34],
      [Math.PI / 2, 0xb0a05a],
    ] as const) {
      const band = ring(kit, 34, 6, kit.materials.clone('plasticRed', colour));
      rot(band, Math.PI / 2, axis, 0);
      g.add(at(band, 0, 38, 0));
    }
    g.add(at(blob(kit, 13, 0.3, kit.materials.clone('rubber', 0x3d2c26), 7), 22, 52, 18));
    return shadows(g, true, true);
  },

  /** A pair of indoor slippers, kicked apart. Nothing says "Korean apartment" faster at the door. */
  'living.slipperPair': (kit) => {
    const g = new THREE.Group();
    const upper = kit.materials.clone('fabricTowel', 0x9aa4a8);
    for (const sx of [-1, 1]) {
      const one = new THREE.Group();
      one.add(at(roundedBox(kit, 262, 18, 94, 'rubber', 6), 0, 9, 0));
      one.add(at(roundedBox(kit, 244, 10, 82, upper, 4), 0, 22, 0));

      const toe = sphere(kit, 58, upper, 10);
      toe.scale.set(0.86, 0.5, 0.78);
      one.add(at(toe, -72, 22, 0));
      const cavity = sphere(kit, 46, 'grime', 8);
      cavity.scale.set(0.8, 0.42, 0.72);
      one.add(at(cavity, -58, 30, 0));

      one.add(at(roundedBox(kit, 96, 22, 92, upper, 8), 96, 24, 0));
      rot(one, 0, sx * 0.22 + jitter(kit, 0.08), 0);
      g.add(at(one, sx * 74, 0, jitter(kit, 26)));
    }
    return shadows(g, true, true);
  },

  /** One grain of rice under the sofa. Tiny, but it is a real resource, so it is a real object. */
  'living.riceGrain': (kit) => {
    const grain = sphere(kit, 4, 'rice', 8);
    grain.scale.set(1.9, 0.62, 0.62);
    rot(grain, 0, 0.6, 0.08);
    const groove = box(kit, 6.4, 0.6, 0.8, kit.materials.clone('rice', 0xcac5b6));
    rot(groove, 0, 0.6, 0);
    return shadows(group(at(grain, 0, 2.5, 0), at(groove, 0, 5, 0)), true, true);
  },

  /** Dust bunny. Soft, flat, and deliberately not a sphere — it is lint, and it never casts. */
  'living.dustBunny': (kit) => {
    const fluff = kit.materials.clone('grime', 0x6d6357);
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const lump = blob(kit, 16 + kit.rand() * 12, 0.3, fluff, 7);
      g.add(at(lump, jitter(kit, 26), 4 + kit.rand() * 3, jitter(kit, 22)));
    }
    for (let i = 0; i < 2; i++) {
      g.add(
        tube(
          kit,
          [
            [jitter(kit, 30), 3, -30 - kit.rand() * 20],
            [jitter(kit, 24), 9, 0],
            [jitter(kit, 30), 3, 28 + kit.rand() * 20],
          ],
          0.9,
          fluff,
          10,
        ),
      );
    }
    return shadows(g, false, true);
  },

  /**
   * Balcony sliding door. It is the room's only standing light source, so the glazing is a single
   * clean sheet and the frame is heavy enough to read as a silhouette against it.
   */
  'living.balconyDoor': (kit, options) => {
    const widthMm = num(options, 'widthMm', 1300);
    const heightMm = num(options, 'heightMm', 2150);
    const frame = kit.materials.clone('plasticWhite', 0xb0aca3);

    const g = group(
      at(box(kit, widthMm, 24, 66, 'steelBrushed'), 0, 12, 0),
      at(box(kit, widthMm - 60, 8, 22, 'steelBrushed'), 0, 28, -14),
      at(box(kit, widthMm - 92, heightMm - 190, 8, 'glass'), 0, 24 + (heightMm - 190) / 2 + 60, 0),
    );

    for (const sx of [-1, 1]) {
      g.add(
        at(roundedBox(kit, 46, heightMm, 58, frame, 3), (sx * (widthMm - 46)) / 2, heightMm / 2, 0),
      );
    }
    g.add(at(roundedBox(kit, widthMm, 50, 58, frame, 3), 0, heightMm - 25, 0));
    g.add(at(roundedBox(kit, widthMm - 92, 70, 44, frame, 3), 0, 60, -6));
    // The meeting stile: without it a sliding door is a window.
    g.add(at(roundedBox(kit, 58, heightMm - 90, 50, frame, 3), 20, heightMm / 2 - 30, -12));
    g.add(at(roundedBox(kit, 26, 190, 30, 'steelBrushed', 4), -18, 980, -34));
    g.add(at(roundedBox(kit, 36, 62, 26, 'steelBrushed', 4), 52, 940, -30));

    return shadows(g, true, true);
  },

  /** Curtain hanging from its rail at the top. The origin is the rail, so the cloth falls from zero. */
  'living.curtain': (kit) => {
    const cloth = kit.materials.clone('fabricClothes', 0x7b7468);
    const rail = cylinder(kit, 14, 14, 1560, 'steelBrushed', 10);
    rot(rail, 0, 0, Math.PI / 2);
    const g = group(at(rail, 0, 24, 0));
    g.add(
      at(
        roundedBox(kit, 1560, 70, 34, kit.materials.clone('fabricClothes', 0x6a6459), 6),
        0,
        -18,
        0,
      ),
    );

    for (const sx of [-1, 1]) {
      const panel = hangingCloth(kit, 640, 2020, 62, cloth, 12);
      rot(panel, Math.PI / 2, sx * 0.05, 0);
      g.add(at(panel, sx * 400, -60, 0));
      // Gathered at the heading: a flat sheet reads as cardboard, and this one is backlit all night.
      const gather = drape(kit, 620, 180, 42, cloth, 8);
      g.add(at(gather, sx * 400, -74, 0));
    }

    return shadows(g, true, true);
  },

  /** Wall split-type air conditioner, high on the east wall. Louvre shut, drain pipe running down. */
  'living.airconWall': (kit) => {
    const shell = 'plasticWhite';
    const g = group(
      at(
        roundedBox(kit, 900, 296, 20, kit.materials.clone('plasticWhite', 0xbab7ae), 3),
        0,
        148,
        10,
      ),
      at(roundedBox(kit, 916, 306, 190, shell, 26), 0, 150, 108),
    );
    g.add(at(box(kit, 840, 6, 112, kit.materials.clone('plasticWhite', 0xc6c3ba)), 0, 300, 96));
    g.add(at(box(kit, 830, 62, 44, 'grime'), 0, 36, 150));

    const louvre = roundedBox(kit, 820, 46, 26, shell, 6);
    rot(louvre, 0.32, 0, 0);
    g.add(at(louvre, 0, 34, 172));
    g.add(at(roundedBox(kit, 132, 28, 5, 'screenOff', 2), 300, 96, 200));

    g.add(
      tube(
        kit,
        [
          [-430, 40, 30],
          [-470, -200, 26],
          [-476, -560, 24],
        ],
        16,
        kit.materials.clone('plasticWhite', 0xa9a69e),
        14,
      ),
    );

    return shadows(g, true, true);
  },

  /** Ceiling pendant, hung from the origin. Off all night — but a bare ceiling reads as a diagram. */
  'living.ceilingPendant': (kit) => {
    const shadeMat = kit.materials.clone('paper', 0xd2c8b4);
    const g = group(
      at(cylinder(kit, 70, 78, 26, 'plasticWhite', 14), 0, -13, 0),
      at(cylinder(kit, 22, 22, 44, 'brass', 10), 0, -268, 0),
      at(cylinder(kit, 62, 208, 240, shadeMat, 18), 0, -370, 0),
      at(sphere(kit, 36, 'glassFrosted', 10), 0, -424, 0),
      // Diffuser sits just under the shade's bottom cap, so nothing shows an unlit paper disc.
      at(cylinder(kit, 196, 196, 4, 'glassFrosted', 18), 0, -494, 0),
    );
    g.add(
      tube(
        kit,
        [
          [0, -24, 0],
          [4, -140, 3],
          [0, -250, 0],
        ],
        4,
        'cable',
        10,
      ),
    );
    const hoop = ring(kit, 206, 6, 'plasticWhite');
    rot(hoop, Math.PI / 2, 0, 0);
    g.add(at(hoop, 0, -488, 0));
    return shadows(g, true, true);
  },
};

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
import { num, str, type PropRegistry } from './registry';

/**
 * Chapter 1 props — the kitchen.
 *
 * The room has to be named "kitchen" by someone who has never seen the game, from silhouette alone,
 * at a low diagonal angle. That job is done by five shapes and nothing else: the unbroken horizontal
 * of the worktop, the tall box of the fridge, the drum of the rice cooker, the tap's gooseneck, and
 * the dark 100 mm slot at the floor. Everything else in this file exists to stop those five reading
 * as a diagram.
 *
 * Every dimension is real millimetres against a Korean apartment kitchen: 660 mm base units, an
 * 880 mm worktop, a 150 mm × 100 mm toe-kick, wall units starting at 1480 mm.
 */

const COUNTER_TOP_MM = 880;
const WORKTOP_THICK_MM = 40;
const WORKTOP_OVERHANG_MM = 20;
const TOEKICK_HEIGHT_MM = 150;
const TOEKICK_DEPTH_MM = 100;
const DOOR_THICK_MM = 18;
const DOOR_REVEAL_MM = 5;
const TARGET_DOOR_WIDTH_MM = 620;

/**
 * The sink aperture, in the north run's own local frame (+X along the run from its west end, +Z out
 * of the wall). It lives here rather than in the region file because a cut-out is a property of the
 * worktop, not of the bowl dropped into it — and without it the basin is a rectangle painted on a
 * solid slab, which is exactly the flat-diagram defect this build exists to kill.
 *
 * Sized between the bowl's outer wall and the sink's rim, so the rim covers the raw edge.
 */
const SINK_APERTURE = { x0: 1546, x1: 1954, z0: 146, z1: 514 } as const;

/**
 * Both cabinet runs are authored in one local frame — +X along the run, +Z out of the wall toward
 * the room — and rotated into place. The east run's placement sits on its *face* rather than its
 * back, so the rotated copy is pushed out by its own depth to land the carcass against the wall.
 */
function orient<T extends THREE.Object3D>(node: T, axis: string, depthMm: number): THREE.Group {
  if (axis !== 'z') return group(node);
  return group(at(rot(node, 0, -Math.PI / 2, 0), depthMm, 0, 0));
}

/**
 * `roundedBox` inflates its cross-section: three.js `bevelSize` grows the extruded profile outward,
 * so a 418 mm box with a 20 mm bevel measures 458 mm. Measured, not assumed — a rice cooker asked
 * for at 418 mm came back 40 mm too wide and broke its own footprint.
 *
 * Every number in this file is a real millimetre measurement of a real object, so all of them go
 * through here and the bevel is taken out of the requested size rather than added to it.
 */
function bevelledBox(
  kit: Kit,
  widthMm: number,
  heightMm: number,
  depthMm: number,
  material: Parameters<typeof roundedBox>[4],
  bevelMm: number,
): THREE.Mesh {
  // A sixth keeps the helper's own 0.32 clamp from kicking in and quietly changing the bevel.
  const bevel = Math.min(bevelMm, widthMm / 6, heightMm / 6, depthMm / 3);
  return roundedBox(kit, widthMm - bevel * 2, heightMm - bevel * 2, depthMm, material, bevel);
}

/** How many doors a run of this length gets. Real units are 600 mm wide give or take a corner. */
function doorCount(lengthMm: number): number {
  return Math.max(1, Math.round(lengthMm / TARGET_DOOR_WIDTH_MM));
}

/**
 * A raised-panel cabinet door.
 *
 * A door built as one slab is the exact defect that makes a kitchen read as a flat elevation: at
 * macro scale there is no highlight anywhere on it. The proud centre panel costs one mesh and gives
 * every door two silhouette edges and a shadow line that moves with the camera.
 */
function cabinetDoor(kit: Kit, widthMm: number, heightMm: number): THREE.Group {
  const slab = bevelledBox(kit, widthMm, heightMm, DOOR_THICK_MM, 'cabinetDoor', 2);
  const panel = at(
    bevelledBox(kit, widthMm - 84, heightMm - 84, 7, 'cabinetDoor', 3),
    0,
    0,
    DOOR_THICK_MM / 2 + 2,
  );
  return group(slab, panel);
}

/** A bottle with an actual shoulder and neck — a plain cylinder reads as a placeholder up close. */
function bottle(
  kit: Kit,
  heightMm: number,
  radiusMm: number,
  bodyMaterial: Parameters<typeof cylinder>[4],
  capMaterial: Parameters<typeof cylinder>[4],
): THREE.Group {
  const bodyH = heightMm * 0.62;
  const shoulderH = heightMm * 0.18;
  const neckH = heightMm * 0.12;
  const capH = heightMm - bodyH - shoulderH - neckH;
  const neckR = radiusMm * 0.38;
  return group(
    at(cylinder(kit, radiusMm, radiusMm * 0.94, bodyH, bodyMaterial), 0, bodyH / 2, 0),
    at(cylinder(kit, neckR * 1.15, radiusMm, shoulderH, bodyMaterial), 0, bodyH + shoulderH / 2, 0),
    at(cylinder(kit, neckR, neckR * 1.1, neckH, bodyMaterial), 0, bodyH + shoulderH + neckH / 2, 0),
    at(cylinder(kit, neckR * 1.25, neckR * 1.3, capH, capMaterial), 0, heightMm - capH / 2, 0),
  );
}

/** A bowl: cone body, foot ring, and a lip you can see the thickness of. */
function ceramicBowl(kit: Kit, rimMm: number, heightMm: number): THREE.Group {
  return group(
    at(cylinder(kit, rimMm, rimMm * 0.52, heightMm, 'porcelain', 16), 0, heightMm / 2, 0),
    at(rot(ring(kit, rimMm - 2, 2.5, 'porcelain'), Math.PI / 2, 0, 0), 0, heightMm, 0),
    at(cylinder(kit, rimMm * 0.5, rimMm * 0.5, 5, 'porcelain', 14), 0, 2.5, 0),
  );
}

export const KITCHEN_PROPS: PropRegistry = {
  /**
   * The base units. The toe-kick is the whole point of the room: a 150 mm high, 100 mm deep slot
   * running the full length, built as a genuine recess so the colony's home is a place you can see
   * into and not a texture.
   */
  'kitchen.baseRun': (kit, options) => {
    const lengthMm = Math.abs(num(options, 'lengthMm', 1200));
    const depthMm = num(options, 'depthMm', 660);
    const axis = str(options, 'axis', 'x');
    const frontTopMm = COUNTER_TOP_MM - WORKTOP_THICK_MM;
    // The carcass deck stops 180 mm short of the worktop. Real base units are open under the sink,
    // and here it is load-bearing: a full-height deck plane would slice straight through the basin
    // and cap it off when you look down through the cut-out.
    const deckH = frontTopMm - 180;
    const carcassD = depthMm - TOEKICK_DEPTH_MM;

    const parts: THREE.Object3D[] = [
      at(box(kit, lengthMm, deckH, carcassD, 'laminate'), lengthMm / 2, deckH / 2, carcassD / 2),
      // The back of the slot. Kept as its own dark panel so the void reads as depth from a low
      // camera rather than as a painted line along the floor.
      at(
        box(kit, lengthMm, TOEKICK_HEIGHT_MM, 8, 'laminateDark'),
        lengthMm / 2,
        TOEKICK_HEIGHT_MM / 2,
        carcassD + 4,
      ),
    ];

    const count = doorCount(lengthMm);
    const pitch = lengthMm / count;
    const doorW = pitch - DOOR_REVEAL_MM;
    const doorH = frontTopMm - TOEKICK_HEIGHT_MM - DOOR_REVEAL_MM;
    const handleY = frontTopMm - 78;
    for (let i = 0; i < count; i++) {
      const cx = (i + 0.5) * pitch;
      const cy = TOEKICK_HEIGHT_MM + doorH / 2;
      parts.push(at(cabinetDoor(kit, doorW, doorH), cx, cy, depthMm - DOOR_THICK_MM / 2));
      // Bar handle across the top of each door — the one bright horizontal on the cabinet face.
      parts.push(
        at(
          rot(cylinder(kit, 6, 6, doorW * 0.55, 'chrome', 8), 0, 0, Math.PI / 2),
          cx,
          handleY,
          depthMm + 22,
        ),
      );
      parts.push(at(box(kit, 10, 10, 28, 'chrome'), cx - doorW * 0.27, handleY, depthMm + 8));
      parts.push(at(box(kit, 10, 10, 28, 'chrome'), cx + doorW * 0.27, handleY, depthMm + 8));
    }

    return shadows(orient(group(...parts), axis, depthMm));
  },

  /**
   * The worktop slab. Its origin is the walkable surface, so the slab hangs *below* y = 0 — a
   * cockroach standing on `kitchen.counter` at 880 mm must be standing on stone, not floating over
   * it. The east run starts one overhang further along so the two slabs meet edge to edge instead
   * of overlapping and z-fighting at the corner.
   */
  'kitchen.worktop': (kit, options) => {
    const rawLength = Math.abs(num(options, 'lengthMm', 1200));
    const depthMm = num(options, 'depthMm', 660);
    const axis = str(options, 'axis', 'x');
    const startMm = axis === 'z' ? WORKTOP_OVERHANG_MM : 0;
    const lengthMm = rawLength - startMm;
    const slabD = depthMm + WORKTOP_OVERHANG_MM;

    const nose = WORKTOP_THICK_MM / 2;
    const deckD = slabD - nose;
    // Segments are exactly edge-to-edge, never overlapping: two coplanar slab tops sharing a
    // millimetre is the dashed-seam artefact a critic caught on the previous build.
    const cut =
      axis === 'x' && lengthMm >= SINK_APERTURE.x1 && deckD >= SINK_APERTURE.z1
        ? SINK_APERTURE
        : null;
    const slab = (x0: number, x1: number, z0: number, z1: number): THREE.Object3D =>
      at(
        box(kit, x1 - x0, WORKTOP_THICK_MM, z1 - z0, 'worktop'),
        (x0 + x1) / 2,
        -nose,
        (z0 + z1) / 2,
      );

    const parts: THREE.Object3D[] = cut
      ? [
          slab(startMm, cut.x0, 0, deckD),
          slab(cut.x1, startMm + lengthMm, 0, deckD),
          slab(cut.x0, cut.x1, 0, cut.z0),
          slab(cut.x0, cut.x1, cut.z1, deckD),
        ]
      : [slab(startMm, startMm + lengthMm, 0, deckD)];

    parts.push(
      // Bullnose, centred on the slab's front face so the two intersect rather than sit coplanar.
      // The lit curve along the front of the counter is what separates the worktop from the cabinet
      // doors in silhouette at this camera angle.
      at(
        rot(cylinder(kit, nose, nose, lengthMm, 'worktop', 12), 0, 0, Math.PI / 2),
        startMm + lengthMm / 2,
        -nose,
        slabD - nose,
      ),
      // Shadow reveal in the gap between the slab underside and the door tops.
      at(
        box(kit, lengthMm, 8, 16, 'laminateDark'),
        startMm + lengthMm / 2,
        -WORKTOP_THICK_MM - 2,
        slabD - nose - 8,
      ),
    );

    return shadows(orient(group(...parts), axis, depthMm));
  },

  /**
   * Tiled splashback. The grid is the strongest "this is a kitchen and not an office" signal in the
   * room, so the grout lines are real geometry standing 1 mm proud — a painted grid disappears the
   * moment the moonlight rakes across it.
   */
  'kitchen.splashback': (kit, options) => {
    const lengthMm = Math.abs(num(options, 'lengthMm', 1200));
    const axis = str(options, 'axis', 'x');
    const heightMm = 600;
    const parts: THREE.Object3D[] = [
      at(box(kit, lengthMm, heightMm, 9, 'grout'), lengthMm / 2, heightMm / 2, 4.5),
      at(box(kit, lengthMm, heightMm, 5, 'tileWall'), lengthMm / 2, heightMm / 2, 11),
    ];

    const courses = 3;
    for (let i = 1; i < courses; i++) {
      parts.push(at(box(kit, lengthMm, 5, 7, 'grout'), lengthMm / 2, (heightMm / courses) * i, 12));
    }
    const columns = Math.min(14, Math.max(2, Math.round(lengthMm / 300)));
    for (let i = 1; i < columns; i++) {
      parts.push(at(box(kit, 5, heightMm, 7, 'grout'), (lengthMm / columns) * i, heightMm / 2, 12));
    }
    // Sealant bead where the tile meets the stone. Grime collects here and the colony knows it.
    parts.push(at(box(kit, lengthMm, 10, 22, 'grime'), lengthMm / 2, 5, 12));

    return shadows(orient(group(...parts), axis, 14), true, true);
  },

  /**
   * Wall units. Origin is where they meet the wall, at their underside. They carry the valance the
   * under-cabinet strip light shines out of, which is why that light has somewhere to come from.
   */
  'kitchen.wallUnits': (kit, options) => {
    const lengthMm = Math.abs(num(options, 'lengthMm', 2400));
    const heightMm = 700;
    const depthMm = 340;
    const parts: THREE.Object3D[] = [
      at(
        box(kit, lengthMm, heightMm, depthMm, 'laminate'),
        lengthMm / 2,
        heightMm / 2,
        depthMm / 2,
      ),
      // Diffuser under the front lip: the visible source of the sink light.
      at(
        bevelledBox(kit, lengthMm - 30, 26, 90, 'plasticWhite', 4),
        lengthMm / 2,
        -13,
        depthMm - 55,
      ),
      at(
        box(kit, lengthMm, 18, depthMm + 16, 'laminateDark'),
        lengthMm / 2,
        heightMm - 9,
        depthMm / 2,
      ),
    ];

    const count = doorCount(lengthMm);
    const pitch = lengthMm / count;
    const doorW = pitch - DOOR_REVEAL_MM;
    const doorH = heightMm - DOOR_REVEAL_MM * 2;
    for (let i = 0; i < count; i++) {
      const cx = (i + 0.5) * pitch;
      parts.push(at(cabinetDoor(kit, doorW, doorH), cx, heightMm / 2, depthMm - DOOR_THICK_MM / 2));
      // Wall-unit handles sit low, at the bottom rail, where a standing adult reaches.
      parts.push(
        at(
          rot(cylinder(kit, 6, 6, doorW * 0.55, 'chrome', 8), 0, 0, Math.PI / 2),
          cx,
          64,
          depthMm + 20,
        ),
      );
    }

    return shadows(group(...parts));
  },

  /**
   * Single-bowl stainless sink, set into the worktop. Built as an open box with real wall thickness
   * because the scout can stand on the rim and look down into it, and a solid block there would
   * read as a metal lid.
   */
  'kitchen.sink': (kit) => {
    const w = 380;
    const d = 340;
    const depth = 180;
    const rim = 30;
    const parts: THREE.Object3D[] = [
      at(box(kit, w + rim * 2, 7, rim, 'steelBrushed'), 0, -2, -(d / 2 + rim / 2)),
      at(box(kit, w + rim * 2, 7, rim, 'steelBrushed'), 0, -2, d / 2 + rim / 2),
      at(box(kit, rim, 7, d, 'steelBrushed'), -(w / 2 + rim / 2), -2, 0),
      at(box(kit, rim, 7, d, 'steelBrushed'), w / 2 + rim / 2, -2, 0),
      at(box(kit, w, depth, 7, 'steelBrushed'), 0, -depth / 2, -d / 2),
      at(box(kit, w, depth, 7, 'steelBrushed'), 0, -depth / 2, d / 2),
      at(box(kit, 7, depth, d, 'steelBrushed'), -w / 2, -depth / 2, 0),
      at(box(kit, 7, depth, d, 'steelBrushed'), w / 2, -depth / 2, 0),
      at(box(kit, w, 7, d, 'steelBrushed'), 0, -depth, 0),
      at(cylinder(kit, 34, 30, 10, 'steelPolished', 14), 0, -depth + 5, 20),
      at(rot(ring(kit, 26, 4, 'chrome'), Math.PI / 2, 0, 0), 0, -depth + 9, 20),
      // Standing water round the waste. This is the moisture the colony comes up the cable for.
      at(blob(kit, 92, 0.02, 'water', 12), 0, -depth + 4, 10),
    ];
    return shadows(group(...parts));
  },

  /**
   * Mixer tap. The gooseneck is the single most legible kitchen silhouette there is — a bent chrome
   * line at eye height over the counter — so it is a swept tube, not a stack of cylinders.
   */
  'kitchen.tap': (kit) => {
    const spout = tube(
      kit,
      [
        [0, 170, 0],
        [0, 262, 12],
        [0, 300, 86],
        [0, 272, 152],
        [0, 238, 162],
      ],
      13,
      'chrome',
      20,
    );
    return shadows(
      group(
        at(cylinder(kit, 27, 32, 8, 'chrome', 16), 0, 4, 0),
        at(cylinder(kit, 16, 18, 170, 'chrome', 14), 0, 85, 0),
        spout,
        at(cylinder(kit, 12, 14, 16, 'steelPolished', 12), 0, 226, 162),
        // Single lever, thrown to the cold side. It reads as "somebody used this an hour ago".
        at(rot(cylinder(kit, 7, 9, 84, 'chrome', 10), 0, 0, -0.9), 32, 196, -14),
        at(cylinder(kit, 20, 22, 26, 'chrome', 14), 0, 178, -6),
      ),
    );
  },

  /**
   * Draining rack with plates still in it. The plates standing on edge are what make the object
   * read from across the room; the tray under them is what makes the puddle beside the sink
   * plausible.
   */
  'kitchen.dishRack': (kit) => {
    const parts: THREE.Object3D[] = [
      at(bevelledBox(kit, 366, 16, 306, 'plasticWhite', 5), 0, 8, 0),
      at(box(kit, 366, 14, 10, 'plasticWhite'), 0, 20, -148),
      at(box(kit, 366, 14, 10, 'plasticWhite'), 0, 20, 148),
      at(box(kit, 10, 14, 306, 'plasticWhite'), -178, 20, 0),
      at(box(kit, 10, 14, 306, 'plasticWhite'), 178, 20, 0),
    ];
    // Wire dividers. Six is enough to read as a grid and cheap enough to keep the prop honest.
    for (let i = 0; i < 6; i++) {
      const x = -140 + i * 56;
      parts.push(at(cylinder(kit, 3, 3, 118, 'chrome', 6), x, 75, -70));
      parts.push(at(cylinder(kit, 3, 3, 118, 'chrome', 6), x, 75, 70));
    }
    parts.push(
      at(rot(cylinder(kit, 3, 3, 320, 'chrome', 6), 0, 0, Math.PI / 2), 0, 130, -70),
      at(rot(cylinder(kit, 3, 3, 320, 'chrome', 6), 0, 0, Math.PI / 2), 0, 130, 70),
    );
    for (let i = 0; i < 3; i++) {
      const plate = rot(cylinder(kit, 96, 96, 9, 'porcelain', 20), 0, 0, Math.PI / 2);
      parts.push(at(plate, -84 + i * 84 + kit.rand() * 8, 104, 0));
    }
    return shadows(group(...parts));
  },

  /**
   * Dish sponge on a rim caddy. The world places this node inside the sink's footprint, so the
   * sponge is carried on a wire tray whose arms hook back onto the bowl edge — otherwise the
   * moisture node reads as a sponge hovering over an open basin.
   */
  'kitchen.sponge': (kit) => {
    const foam = kit.materials.clone('plasticWhite', 0xd8c05a);
    return shadows(
      group(
        at(bevelledBox(kit, 128, 8, 92, 'steelBrushed', 3), 0, 6, 0),
        at(rot(ring(kit, 62, 3, 'steelBrushed'), Math.PI / 2, 0, 0), 0, 11, 0),
        tube(
          kit,
          [
            [-58, 10, -34],
            [-84, 22, -36],
            [-98, 4, -36],
            [-90, -12, -32],
          ],
          3.5,
          'steelBrushed',
          10,
        ),
        tube(
          kit,
          [
            [-58, 10, 34],
            [-84, 22, 36],
            [-98, 4, 36],
            [-90, -12, 32],
          ],
          3.5,
          'steelBrushed',
          10,
        ),
        at(bevelledBox(kit, 94, 26, 60, foam, 7), 4, 23, 0),
        at(bevelledBox(kit, 90, 9, 57, 'plasticGreen', 3), 4, 40, 0),
        at(blob(kit, 64, 0.014, 'water', 10), 6, 11, 4),
      ),
    );
  },

  /** Dish detergent. Tall, green, and unmistakable next to the sink. */
  'kitchen.detergent': (kit) => {
    const body = bottle(kit, 236, 41, 'plasticGreen', 'plasticWhite');
    return shadows(
      group(
        body,
        // Wrap label, a hair proud of the body so it catches its own highlight.
        at(cylinder(kit, 43, 43, 74, 'paper', 16, true), 0, 74, 0),
        at(box(kit, 14, 10, 22, 'plasticWhite'), 0, 226, 16),
        // A dried run of soap down one side — the reason the bottle is worth a second look.
        at(blob(kit, 30, 0.09, 'grime', 8), 24, 4, 8),
      ),
    );
  },

  /**
   * The rice cooker. In a Korean kitchen this is the landmark object on the worktop, and the world
   * data makes its body a hard blocker — so its footprint has to be honest, and the lid, vent and
   * control panel have to be separable at a glance.
   */
  'kitchen.riceCooker': (kit) => {
    const panel = kit.materials.clone('plasticWhite', 0xcfd2d4);
    return shadows(
      group(
        at(bevelledBox(kit, 450, 220, 340, panel, 12), 0, 110, 0),
        at(box(kit, 456, 8, 346, 'grime'), 0, 222, 0),
        at(bevelledBox(kit, 464, 82, 348, 'plasticWhite', 14), 0, 262, 0),
        // Hinge boss at the back and the steam vent — the two things that say "this cooks".
        at(bevelledBox(kit, 162, 52, 36, 'plasticBlack', 8), 0, 268, -176),
        at(cylinder(kit, 24, 30, 22, 'plasticBlack', 12), 100, 312, -60),
        at(cylinder(kit, 16, 18, 12, 'steelBrushed', 10), 100, 328, -60),
        at(bevelledBox(kit, 260, 114, 10, 'plasticBlack', 5), 0, 128, 168),
        at(box(kit, 206, 66, 5, 'screenOff'), 0, 134, 175),
        at(bevelledBox(kit, 104, 34, 12, 'plasticBlack', 4), 0, 62, 168),
        // Carry handle folded flat onto the lid, which is where it lives between meals — standing
        // it up would put a wire arch above the room's cleanest silhouette.
        at(rot(ring(kit, 110, 8, 'steelBrushed', Math.PI), Math.PI / 2, 0, 0), 0, 306, -30),
        at(cylinder(kit, 12, 14, 16, 'plasticBlack', 10), 0, 306, 82),
      ),
    );
  },

  /** Electric kettle. Small, metallic, and the thing that gives the far end of the counter a beat. */
  'kitchen.kettle': (kit) => {
    const spout = tube(
      kit,
      [
        [0, 150, 62],
        [0, 196, 96],
        [0, 222, 116],
      ],
      13,
      'steelBrushed',
      12,
    );
    const handle = tube(
      kit,
      [
        [0, 46, -74],
        [0, 128, -128],
        [0, 214, -104],
        [0, 226, -66],
      ],
      10,
      'plasticBlack',
      14,
    );
    return shadows(
      group(
        at(cylinder(kit, 88, 94, 18, 'plasticBlack', 18), 0, 9, 0),
        at(cylinder(kit, 76, 86, 186, 'steelBrushed', 18), 0, 111, 0),
        at(cylinder(kit, 68, 76, 18, 'steelBrushed', 18), 0, 213, 0),
        at(cylinder(kit, 64, 68, 20, 'plasticBlack', 18), 0, 231, 0),
        at(sphere(kit, 15, 'plasticBlack', 8), 0, 248, 0),
        spout,
        handle,
        // Water window. Half full, left over from tea.
        at(bevelledBox(kit, 22, 120, 10, 'plasticClear', 4), 78, 106, 30),
      ),
    );
  },

  /** Chopping board propped flat with the evening's trimmings still on it. */
  'kitchen.cuttingBoard': (kit) => {
    // 310 × 205 rather than a full chef's board: the placement sits 140 mm from the counter's front
    // edge and the world turns it 0.2 rad, which swings a bigger board's corner out over thin air.
    const parts: THREE.Object3D[] = [
      at(bevelledBox(kit, 310, 20, 205, 'wood', 5), 0, 10, 0),
      at(rot(ring(kit, 122, 3, 'woodDark'), Math.PI / 2, 0, 0), 0, 20, 0),
      // Knife laid along it — a hard bright line that stops the board reading as a mat.
      at(rot(box(kit, 148, 4, 26, 'steelPolished'), 0, 0.14, 0), -28, 22, -28),
      at(rot(bevelledBox(kit, 76, 16, 22, 'woodDark', 4), 0, 0.14, 0), 84, 28, -40),
    ];
    // Spring-onion trimmings. Three is a detail; thirty would be a mess.
    for (let i = 0; i < 3; i++) {
      parts.push(
        at(
          rot(cylinder(kit, 6, 6, 22, 'plasticGreen', 8), 0, 0, Math.PI / 2),
          -50 + kit.rand() * 110,
          26,
          20 + kit.rand() * 40,
        ),
      );
    }
    return shadows(group(...parts));
  },

  /** Bowls left out of the cupboard, stacked. Reads instantly as crockery from any angle. */
  'kitchen.bowlStack': (kit) => {
    const parts: THREE.Object3D[] = [];
    for (let i = 0; i < 3; i++) {
      parts.push(
        at(ceramicBowl(kit, 96 - i * 3, 62), kit.rand() * 6 - 3, i * 26, kit.rand() * 6 - 3),
      );
    }
    // Two plates face down beside the stack, on the west side — the draining rack owns the counter
    // to the east and a plate laid that way would grow straight through its tray.
    parts.push(at(cylinder(kit, 106, 110, 9, 'porcelain', 20), -122, 4.5, 34));
    parts.push(at(cylinder(kit, 104, 108, 9, 'porcelain', 20), -126, 13, 38));
    return shadows(group(...parts));
  },

  /**
   * The fridge. Its back is against the west wall and its face points into the room, because the
   * door seal along that face is a food node — the player has to be able to see the gasket line
   * they are being sent to.
   */
  'kitchen.fridge': (kit) => {
    const w = 700;
    const d = 680;
    const h = 1750;
    const doorThick = 42;
    const carcassW = w - doorThick;
    const upperH = 560;
    const lowerH = 1090;
    const seal = kit.materials.clone('rubber', 0x1b1d1f);
    const shell = kit.materials.clone('plasticWhite', 0xc9ccc9);

    return shadows(
      group(
        at(bevelledBox(kit, carcassW, h, d, shell, 8), -doorThick / 2, h / 2, 0),
        // Freezer over fridge, the common Korean two-door. The gap between them is a real slot.
        at(
          bevelledBox(kit, doorThick, upperH, d - 16, shell, 10),
          w / 2 - doorThick / 2,
          h - 40 - upperH / 2,
          0,
        ),
        at(
          bevelledBox(kit, doorThick, lowerH, d - 16, shell, 10),
          w / 2 - doorThick / 2,
          74 + lowerH / 2,
          0,
        ),
        at(box(kit, 12, upperH - 30, d - 60, seal), w / 2 - doorThick - 4, h - 40 - upperH / 2, 0),
        at(box(kit, 12, lowerH - 30, d - 60, seal), w / 2 - doorThick - 4, 74 + lowerH / 2, 0),
        at(box(kit, doorThick + 8, 26, d - 16, 'laminateDark'), w / 2 - doorThick / 2, h - 53, 0),
        // Vertical bar handles on the near edge of each door.
        at(cylinder(kit, 11, 11, 300, 'steelBrushed', 10), w / 2 + 14, h - 200, -230),
        at(cylinder(kit, 11, 11, 520, 'steelBrushed', 10), w / 2 + 14, 720, -230),
        // Compressor grille and feet: the reason there is a warm, filthy 74 mm gap underneath.
        at(box(kit, doorThick + 6, 68, d - 40, 'plasticBlack'), w / 2 - doorThick / 2, 36, 0),
        at(cylinder(kit, 22, 26, 60, 'rubber', 8), w / 2 - 120, 30, d / 2 - 70),
        at(cylinder(kit, 22, 26, 60, 'rubber', 8), w / 2 - 120, 30, -(d / 2 - 70)),
        at(box(kit, carcassW - 40, 22, d - 40, 'grime'), -doorThick / 2, 11, 0),
      ),
    );
  },

  /**
   * Food-waste bin by the door: the richest and loudest node in chapter 1. It has to look like the
   * thing you should not touch — lid ajar, liner showing, a stain under it.
   */
  /**
   * The dining table. 1400 x 800, top at 730 mm — a real Korean apartment 4인 식탁.
   *
   * The kitchen had two walkable planes, floor and worktop, and a player was expected to spend a
   * whole run on them. The table is the second destination the room needed: high enough to be a
   * separate world, low enough that a chair reaches it, and covered in the by-products of people
   * having eaten — which is what a cockroach is actually there for.
   *
   * The underside matters as much as the top. A 35 mm insect reads the rail and the leg brackets as
   * architecture, and the shadow they throw is the darkest floor in the room away from the toe-kick.
   */
  'kitchen.diningTable': (kit, options) => {
    const width = num(options, 'widthMm', 1400);
    const depth = num(options, 'depthMm', 800);
    const height = num(options, 'heightMm', 730);
    const oak = kit.materials.clone('wood', 0xbe9a6e);
    const leg = kit.materials.clone('wood', 0xa07f57);

    const top = at(bevelledBox(kit, width, 34, depth, oak, 4), 0, height - 17, 0);
    // The apron the top sits on. Inset so the underside reads as built rather than as a slab.
    const apron = new THREE.Group();
    apron.add(at(bevelledBox(kit, width - 120, 62, 22, leg, 3), 0, height - 65, depth / 2 - 70));
    apron.add(at(bevelledBox(kit, width - 120, 62, 22, leg, 3), 0, height - 65, -depth / 2 + 70));
    apron.add(at(bevelledBox(kit, 22, 62, depth - 120, leg, 3), width / 2 - 70, height - 65, 0));
    apron.add(at(bevelledBox(kit, 22, 62, depth - 120, leg, 3), -width / 2 + 70, height - 65, 0));

    const legs = new THREE.Group();
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        legs.add(
          at(
            bevelledBox(kit, 58, height - 34, 58, leg, 3),
            sx * (width / 2 - 80),
            (height - 34) / 2,
            sz * (depth / 2 - 80),
          ),
        );
      }
    }

    // Crumbs and a dried ring where a glass stood. Both are why the colony climbs up here.
    const litter = scatter(kit, 14, 260, (i) =>
      at(blob(kit, 2.6 + kit.rand() * 3.4, 0.6, i % 3 === 0 ? 'crumb' : 'rice'), 0, height + 1, 0),
    );
    const stain = at(rot(ring(kit, 34, 2.4, 'grime'), Math.PI / 2, 0, 0), 300, height + 0.8, -120);

    return shadows(group(top, apron, legs, litter, stain));
  },

  /**
   * A dining chair, pulled out from the table.
   *
   * It exists to be climbed. The seat at 440 mm is the only halfway step between the floor and the
   * 730 mm table, and the gap between its edge and the table edge is the jump the player has to
   * find. A chair pushed neatly in would close that route, which is why this one is out.
   */
  'kitchen.chair': (kit, options) => {
    const seatH = num(options, 'seatMm', 440);
    const w = 420;
    const d = 420;
    const wood = kit.materials.clone('wood', 0xb0895f);

    const seat = at(bevelledBox(kit, w, 30, d, wood, 3), 0, seatH - 15, 0);
    const legs = new THREE.Group();
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        legs.add(
          at(cylinder(kit, 20, 24, seatH - 30, wood, 12), sx * (w / 2 - 34), (seatH - 30) / 2, sz * (d / 2 - 34)),
        );
      }
    }
    // Stretchers between the front legs — a real climbing hold, and the reason the leg is scalable.
    const rails = new THREE.Group();
    for (const sz of [-1, 1]) {
      rails.add(at(cylinder(kit, 14, 14, w - 68, wood, 10), 0, 150, sz * (d / 2 - 34)));
    }
    rails.children.forEach((c) => c.rotateZ(Math.PI / 2));

    const back = new THREE.Group();
    back.add(at(bevelledBox(kit, w, 300, 26, wood, 3), 0, seatH + 170, -d / 2 + 16));
    for (const sx of [-1, 1]) {
      back.add(at(bevelledBox(kit, 34, 340, 30, wood, 3), sx * (w / 2 - 24), seatH + 170, -d / 2 + 16));
    }

    return shadows(group(seat, legs, rails, back));
  },

  'kitchen.wasteBin': (kit) => {
    const shell = kit.materials.clone('plasticGreen', 0x6f7a5e);
    return shadows(
      group(
        at(cylinder(kit, 204, 186, 460, shell, 20), 0, 240, 0),
        at(cylinder(kit, 198, 202, 22, 'plasticBlack', 20), 0, 11, 0),
        at(rot(ring(kit, 202, 9, shell), Math.PI / 2, 0, 0), 0, 470, 0),
        // Lid tipped open a few degrees. That gap is the smell, and the smell is the gameplay.
        at(rot(cylinder(kit, 188, 206, 46, shell, 20), 0.14, 0, 0), 0, 500, 6),
        at(bevelledBox(kit, 78, 22, 34, 'plasticBlack', 4), 0, 528, -160),
        // Liner pinched under the rim.
        at(rot(ring(kit, 194, 7, 'plasticWhite'), Math.PI / 2, 0, 0), 0, 466, 0),
        at(bevelledBox(kit, 130, 16, 62, 'plasticBlack', 5), 0, 26, 214),
        at(cylinder(kit, 7, 7, 430, 'steelBrushed', 6), 176, 230, 130),
        at(patch(kit, 520, 520, 'grime'), 0, 0.6, 20),
      ),
    );
  },

  /** Recycling stacked by the doorway — a box, bottles, a can, and a bagged bundle on top. */
  'kitchen.recycling': (kit) => {
    const parts: THREE.Object3D[] = [
      at(bevelledBox(kit, 416, 292, 296, 'cardboard', 5), 0, 146, 0),
      // Flaps folded out; the open top is what stops it reading as a solid crate.
      at(rot(box(kit, 416, 8, 140, 'cardboard'), -1.05, 0, 0), 0, 320, -148),
      at(rot(box(kit, 416, 8, 140, 'cardboard'), 1.15, 0, 0), 0, 314, 150),
      // Bottles stand *in* the box with their shoulders above the rim, which is what makes the flaps
      // read as open rather than as two boards glued to a crate.
      at(rot(bottle(kit, 300, 44, 'plasticClear', 'plasticBlue'), 0, 0, 0.26), -104, 150, -40),
      at(rot(bottle(kit, 262, 40, 'plasticClear', 'plasticGreen'), 0, 0, -0.34), 84, 168, 46),
      at(rot(cylinder(kit, 33, 33, 122, 'foil', 14), Math.PI / 2, 0, 0.4), 150, 326, -110),
      at(drape(kit, 260, 196, 22, 'plasticWhite', 8), -46, 300, 34),
    ];
    return shadows(group(...parts));
  },

  /**
   * The rice cooker's power lead, running down the face of the units. This is a link the player
   * climbs one body at a time, so it must read as a single climbable strand from the floor to the
   * worktop edge — not as decoration.
   */
  'kitchen.cableDrop': (kit, options) => {
    const topMm = num(options, 'topMm', COUNTER_TOP_MM);
    const run = tube(
      kit,
      [
        [0, 8, -12],
        [-14, topMm * 0.28, -30],
        [10, topMm * 0.58, -26],
        [-4, topMm * 0.9, -20],
        [26, topMm + 40, 34],
      ],
      6,
      'cable',
      28,
    );
    return shadows(
      group(
        run,
        at(rot(ring(kit, 62, 6, 'cable'), Math.PI / 2, 0, 0), -36, 7, 18),
        at(rot(ring(kit, 48, 6, 'cable'), Math.PI / 2, 0.4, 0), -30, 19, 26),
        at(bevelledBox(kit, 48, 30, 36, 'plasticWhite', 4), 44, 15, 12),
        at(bevelledBox(kit, 22, 16, 10, 'plasticWhite', 3), 6, topMm * 0.62, -6),
      ),
    );
  },

  /**
   * Crumbs in the toe-kick. The colony's first food, so it has to be findable: a grubby halo you
   * can see from standing height, with individual fragments only readable up close.
   */
  'kitchen.crumbField': (kit, options) => {
    const radiusMm = num(options, 'radiusMm', 160);
    const seed = num(options, 'seed', 0);
    const count = 22 + (Math.abs(Math.round(seed)) % 9);
    const field = scatter(kit, count, radiusMm, () => {
      const size = 2.2 + kit.rand() * 4.6;
      return at(
        bevelledBox(kit, size * 1.6, size, size * 1.2, 'crumb', size * 0.3),
        0,
        size / 2,
        0,
      );
    });
    const larger = scatter(kit, 3, radiusMm * 0.7, () =>
      at(blob(kit, 7 + kit.rand() * 4, 0.55, 'crumb', 8), 0, 3, 0),
    );
    // A shed wing case and a scrap of wrapper: evidence that something has been eating here.
    const litter = group(
      at(rot(box(kit, 26, 0.8, 18, 'paper'), 0, 0.7, 0.06), radiusMm * 0.5, 1.4, -radiusMm * 0.3),
      at(blob(kit, 9, 0.28, 'grime', 8), -radiusMm * 0.4, 1.2, radiusMm * 0.25),
    );
    return shadows(
      group(
        at(patch(kit, radiusMm * 2.4, radiusMm * 2.4, 'grime'), 0, 0.5, 0),
        field,
        larger,
        litter,
      ),
      false,
      true,
    );
  },

  /** Spilled rice on the worktop. Individual grains, because a beige blob is a placeholder. */
  'kitchen.riceSpill': (kit, options) => {
    const seed = num(options, 'seed', 0);
    const count = 26 + (Math.abs(Math.round(seed)) % 11);
    const grains = scatter(kit, count, 88, () => {
      const grain = sphere(kit, 1.5, 'rice', 6);
      grain.scale.set(1, 0.75, 2.5);
      return at(grain, 0, 1.2, 0);
    });
    return shadows(group(at(blob(kit, 22, 0.3, 'rice', 10), 12, 0, -8), grains), false, true);
  },

  /** The drip under the trap. A moisture node, so it has to read as wet, not as a painted circle. */
  'kitchen.puddle': (kit, options) => {
    const radiusMm = num(options, 'radiusMm', 110);
    const droplets = scatter(kit, 5, radiusMm * 1.4, () =>
      at(blob(kit, 3 + kit.rand() * 4, 0.42, 'water', 8), 0, 1, 0),
    );
    return shadows(
      group(
        at(patch(kit, radiusMm * 2.6, radiusMm * 2.6, 'grime'), 0, 0.5, 0),
        at(blob(kit, radiusMm, 0.028, 'water', 18), 0, 0.9, 0),
        // Dried tide line from the last time it evaporated.
        at(rot(ring(kit, radiusMm * 1.12, 1.6, 'grime'), Math.PI / 2, 0, 0), 0, 1.1, 0),
        droplets,
      ),
      false,
      true,
    );
  },
};

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
 * Bedroom props.
 *
 * The room has to name itself. A player who has never seen the game should read "bedroom" from the
 * silhouettes alone, so the budget is spent on the four objects that carry that read from a low
 * diagonal camera — the wardrobe slab, the low bed with a body under the duvet, the bedside table
 * with its lamp, and the curtained window — and everything else exists to make those four look
 * lived in rather than staged.
 *
 * Every gap the region data sells as gameplay is built as a real gap here: the 60 mm slot under the
 * wardrobe doors, the 90 mm strip behind the headboard, the open foot end of the bed frame, and the
 * 100 mm channel between the table and the bed rail. If the geometry closes one of them the level
 * stops matching its own navigation.
 */

/**
 * One slipper: a sole, a wedge of upper, and an opening the foot goes into.
 *
 * The opening is what makes it read as a slipper rather than as a lozenge — at this scale the dark
 * void inside is most of the silhouette.
 */
function slipper(kit: Kit, upper: THREE.Material): THREE.Group {
  const sole = roundedBox(kit, 96, 14, 250, 'rubber', 5);
  sole.position.y = mm(7);
  const body = roundedBox(kit, 90, 44, 150, upper, 12);
  body.position.set(0, mm(34), mm(-42));
  const mouth = roundedBox(kit, 74, 26, 40, 'grime', 8);
  mouth.position.set(0, mm(42), mm(22));
  const toe = roundedBox(kit, 82, 30, 60, upper, 14);
  toe.position.set(0, mm(28), mm(-108));
  return group(sole, body, mouth, toe);
}

/**
 * A heap of soft fabric — a shirt on the floor, a laundry pile, a dropped towel.
 *
 * Stacked drapes of decreasing width, each rotated and offset, so the pile has folds and a silhouette
 * instead of being a mound. Clothes on the floor are cover in this game, so they have to be legible
 * as something you could crawl under.
 */
function clothHeap(
  kit: Kit,
  spreadMm: number,
  material: THREE.Material | 'fabricClothes' | 'fabricTowel' | 'fabricBed',
  layers: number,
  phase: number,
): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(1, layers);
    const sheet = drape(
      kit,
      spreadMm * (1 - t * 0.32),
      spreadMm * (0.74 - t * 0.22),
      11 + i * 4,
      material,
      8,
    );
    sheet.position.set(mm(kit.rand() * 18 - 9), mm(5 + i * 9), mm(kit.rand() * 18 - 9));
    sheet.rotation.y = phase * 0.6 + i * 0.7;
    g.add(sheet);
  }
  return g;
}

/** One hardback lying flat: boards proud of the page block, so a stack shows separation lines. */
function book(
  kit: Kit,
  widthMm: number,
  depthMm: number,
  thickMm: number,
  cover: THREE.Material,
): THREE.Group {
  const boards = roundedBox(kit, widthMm, thickMm, depthMm, cover, 1.5);
  const block = at(roundedBox(kit, widthMm - 12, thickMm - 4, depthMm - 9, 'paper', 0.8), 5, 0, 0);
  return group(boards, block);
}

/**
 * The region seeds each placement explicitly so two dropped shirts differ. Folding the seed in as a
 * phase rather than as a second generator keeps `kit.rand()` the single reproducible source.
 */
function seedPhase(seed: number): number {
  return (seed * 2.399963) % (Math.PI * 2);
}

/**
 * Long props name their run direction with `axis`. Everything here is authored with its length
 * along local +x; 'z' simply swings that frame so local +x lands on world +z.
 */
function orient<T extends THREE.Object3D>(node: T, axis: string): T {
  if (axis === 'z') node.rotation.y = -Math.PI / 2;
  return node;
}

/** A tumbler with a real inside. DoubleSide is what stops it reading as a solid plastic slug. */
function tumblerGlass(kit: Kit): THREE.MeshStandardMaterial {
  const material = kit.materials.clone('glass');
  material.side = THREE.DoubleSide;
  return material;
}

export const BEDROOM_PROPS: PropRegistry = {
  /**
   * Wardrobe. The largest mass in the room and its strongest silhouette.
   *
   * The doors hang 100 mm clear of the floor and the plinth is set back flush with the carcass, so
   * the strip of floor in front of the plinth is genuinely open, unlit and roofed — that slot is
   * the region's safest foothold and it has to exist in geometry, not only in the blocker table.
   */
  'bedroom.wardrobe': (kit, options) => {
    const width = num(options, 'widthMm', 2200);
    const depth = num(options, 'depthMm', 600);
    const height = num(options, 'heightMm', 2200);
    const skirt = num(options, 'skirtMm', 60);
    const carcass = depth - skirt;
    const front = carcass / 2;
    const doorFace = front + skirt;

    const back = at(
      roundedBox(kit, width, height - 40, 18, 'laminateDark', 2),
      0,
      110 + (height - 40) / 2 - 100,
      -front + 9,
    );
    const left = at(
      roundedBox(kit, 20, height - 100, carcass, 'laminate', 2),
      -width / 2 + 10,
      100 + (height - 100) / 2,
      0,
    );
    const right = at(
      roundedBox(kit, 20, height - 100, carcass, 'laminate', 2),
      width / 2 - 10,
      100 + (height - 100) / 2,
      0,
    );
    const top = at(roundedBox(kit, width, 26, carcass, 'laminate', 2), 0, height - 43, 0);
    const cornice = at(
      roundedBox(kit, width + 16, 30, depth, 'laminateDark', 3),
      0,
      height - 15,
      skirt / 2,
    );
    const plinth = at(roundedBox(kit, width - 20, 100, carcass - 30, 'laminateDark', 2), 0, 50, -8);

    const leaves = new THREE.Group();
    const leafWidth = width / 3;
    for (let i = 0; i < 3; i++) {
      const x = -width / 2 + leafWidth * (i + 0.5);
      const leaf = at(
        roundedBox(kit, leafWidth - 6, height - 130, skirt - 6, 'cabinetDoor', 3),
        x,
        100 + (height - 130) / 2,
        doorFace - skirt / 2,
      );
      const panel = at(
        roundedBox(kit, leafWidth - 96, height - 260, 8, 'laminateDark', 2),
        x,
        100 + (height - 130) / 2,
        doorFace - 2,
      );
      // Vertical bar handles: at scout scale they are the only thing that gives the slab a scale cue.
      const handleX = i === 2 ? x - leafWidth / 2 + 46 : x + leafWidth / 2 - 46;
      const handle = at(
        cylinder(kit, 9, 9, 340, 'steelBrushed', 8),
        handleX,
        height * 0.46,
        doorFace + 14,
      );
      leaves.add(leaf, panel, handle);
    }

    // A folded spare blanket on top — a wardrobe with a bare top reads as a shipping crate.
    const blanket = at(
      drape(kit, width * 0.42, carcass * 0.62, 22, 'fabricBed', 8),
      width * 0.18,
      height + 22,
      0,
    );

    return shadows(group(back, left, right, top, cornice, plinth, leaves, blanket));
  },

  /**
   * Low Korean double frame. The foot end carries a rail at 320 mm so the bed reads as furniture,
   * but nothing blocks the floor beneath it: the under-bed run is the darkest cover in the region
   * and its only entrance is that end.
   */
  'bedroom.bedFrame': (kit, options) => {
    const length = num(options, 'lengthMm', 2000);
    const width = num(options, 'widthMm', 1400);
    const top = num(options, 'topMm', 520);
    const rail = num(options, 'railMm', 80);
    const deck = top - 200;

    const legs = new THREE.Group();
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        legs.add(
          at(
            cylinder(kit, 30, 24, deck, 'woodDark', 8),
            sx * (length / 2 - 70),
            deck / 2,
            sz * (width / 2 - 70),
          ),
        );
      }
    }

    const railHeight = top - deck;
    const side = (sz: number) =>
      at(
        roundedBox(kit, length, railHeight, rail, 'wood', 4),
        0,
        deck + railHeight / 2,
        sz * (width / 2 - rail / 2),
      );
    const foot = at(
      roundedBox(kit, rail, railHeight, width - rail * 2, 'wood', 4),
      -length / 2 + rail / 2,
      deck + railHeight / 2,
      0,
    );
    const platform = at(
      roundedBox(kit, length - rail * 2, 18, width - rail * 2, 'wood', 2),
      0,
      deck - 9,
      0,
    );

    // Two exposed slats at the open end. They are what tells the player the dark under there is a
    // roofed run and not a hole in the floor.
    const slats = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      slats.add(
        at(
          roundedBox(kit, 62, 14, width - rail * 2, 'wood', 2),
          -length / 2 + rail + 90 + i * 190,
          deck - 24,
          0,
        ),
      );
    }

    return shadows(group(legs, side(-1), side(1), foot, platform, slats));
  },

  /** Mattress. Origin is its walking surface, so the whole body hangs below y = 0. */
  'bedroom.mattress': (kit, options) => {
    const length = num(options, 'lengthMm', 1840);
    const width = num(options, 'widthMm', 1240);

    const core = at(roundedBox(kit, length, 200, width, 'fabricBed', 24), 0, -100, 0);
    const tape = at(roundedBox(kit, length + 6, 26, width + 6, 'fabricTowel', 8), 0, -104, 0);
    // A sheet with real undulation. A perfectly flat 1.8 m plane at macro scale is the single
    // fastest way to make the bed look like a diagram.
    const sheet = at(drape(kit, length - 10, width - 10, 7, 'fabricBed', 14), 0, -2, 0);

    const tufts = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      tufts.add(
        at(
          blob(kit, 26, 0.35, 'fabricBed', 8),
          (i % 2 ? 1 : -1) * length * 0.26,
          -4,
          (i < 2 ? 1 : -1) * width * 0.26,
        ),
      );
    }

    return shadows(group(core, tape, sheet, tufts));
  },

  /** Headboard. Its back face stops 90 mm short of the wall — that void is the chapter objective. */
  'bedroom.headboard': (kit, options) => {
    const width = num(options, 'widthMm', 1400);
    const height = num(options, 'heightMm', 620);

    const panel = at(roundedBox(kit, 80, height, width, 'woodDark', 4), 0, height / 2, 0);
    const pad = at(
      roundedBox(kit, 34, height - 90, width - 90, 'fabricSofa', 12),
      -52,
      height / 2 + 20,
      0,
    );
    const cap = at(roundedBox(kit, 104, 34, width + 20, 'woodDark', 5), 0, height + 17, 0);
    const posts = new THREE.Group();
    for (const sz of [-1, 1]) {
      posts.add(
        at(
          roundedBox(kit, 92, height + 40, 92, 'woodDark', 5),
          0,
          (height + 40) / 2,
          sz * (width / 2 - 46),
        ),
      );
    }
    const buttons = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      buttons.add(
        at(
          blob(kit, 15, 0.5, 'fabricSofa', 8),
          -68,
          height * (i < 3 ? 0.34 : 0.66),
          (i % 3 === 0 ? -1 : i % 3 === 1 ? 0 : 1) * width * 0.28,
        ),
      );
    }

    return shadows(group(panel, pad, cap, posts, buttons));
  },

  /**
   * Duvet. Lofted 150 mm above the mattress so the sleeper form fits underneath, with the top edge
   * turned down at the shoulders and one corner hanging to the floor — that hanging corner is the
   * fabric climb the region authors, so it has to visibly reach the boards.
   */
  'bedroom.duvet': (kit, options) => {
    const phase = seedPhase(num(options, 'seed', 0));
    const hem = num(options, 'hemMm', 520);

    const loft = at(roundedBox(kit, 1400, 150, 1250, 'fabricBed', 40), -90, 78, 0);
    const quilt = at(drape(kit, 1450, 1300, 28, 'fabricBed', 12), -90, 156, 0);
    // Turned-down sheet: a pale roll across the shoulders. It separates bedding from body.
    const fold = rot(
      at(cylinder(kit, 48, 48, 1290, 'fabricTowel', 10), 640, 168, 0),
      Math.PI / 2,
      phase * 0.02,
      0,
    );

    // The hanging edge. Rotated a quarter turn so the drape's sag becomes horizontal folds.
    const hang = drape(kit, 820, hem, 26, 'fabricBed', 10);
    rot(hang, Math.PI / 2 + 0.1, 0, 0);
    at(hang, -60, -hem / 2 + 20, 660);

    const wrinkles = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      wrinkles.add(
        at(
          blob(kit, 90 + kit.rand() * 60, 0.4, 'fabricBed', 8),
          -420 + i * 300 + kit.rand() * 60,
          170,
          (kit.rand() - 0.5) * 800,
        ),
      );
    }

    return shadows(group(loft, quilt, fold, hang, wrinkles));
  },

  /**
   * The sleeper. Never a mannequin — a chain of soft mounds under bedding plus one bare head, which
   * is all the camera ever sees of a person in bed and all the player needs to understand that the
   * brightest surface in the room is occupied.
   */
  'bedroom.sleeperForm': (kit) => {
    const skin = kit.materials.clone('leather', 0xbb977c);
    const hair = kit.materials.clone('rubber', 0x1d1a18);

    const mounds = new THREE.Group();
    const shape: readonly (readonly [number, number, number, number])[] = [
      [-700, 80, 110, 0.45],
      [-540, 70, 175, 0.42],
      [-250, 40, 245, 0.44],
      [120, -30, 320, 0.42],
      [400, -10, 255, 0.5],
      [560, -40, 195, 0.55],
    ];
    for (const [x, z, radius, flatten] of shape) {
      mounds.add(at(blob(kit, radius, flatten, 'fabricBed', 10), x, 0, z));
    }
    // An arm lying along the duvet edge — the detail that makes the mound read as a body.
    const arm = tube(
      kit,
      [
        [430, 96, -190],
        [280, 84, -250],
        [90, 74, -270],
      ],
      62,
      'fabricBed',
      14,
    );

    const neck = at(cylinder(kit, 58, 66, 90, skin, 10), 610, 120, -10);
    const head = at(sphere(kit, 92, skin, 14), 690, 190, 0);
    head.scale.set(1.1, 1, 0.92);
    const crown = at(blob(kit, 104, 0.86, hair, 12), 712, 206, 0);
    const fringe = at(blob(kit, 78, 0.7, hair, 10), 640, 214, 34);

    return shadows(group(mounds, arm, neck, head, crown, fringe));
  },

  /** Pillow. Long axis across the bed, with the flange seam that separates a pillow from a brick. */
  'bedroom.pillow': (kit) => {
    const core = at(roundedBox(kit, 240, 116, 600, 'fabricBed', 46), 0, 58, 0);
    const flange = at(roundedBox(kit, 256, 16, 616, 'fabricTowel', 6), 0, 30, 0);
    const crease = at(roundedBox(kit, 190, 10, 24, 'fabricBed', 4), 0, 108, 0);
    const ends = new THREE.Group();
    for (const sz of [-1, 1]) {
      ends.add(at(blob(kit, 62, 0.72, 'fabricBed', 8), 0, 62, sz * 282));
    }
    return shadows(group(core, flange, crease, ends));
  },

  /** Bedside table. Everything worth stealing in the region sits on its 550 × 500 top. */
  'bedroom.bedsideTable': (kit, options) => {
    const width = num(options, 'widthMm', 550);
    const depth = num(options, 'depthMm', 500);
    const height = num(options, 'heightMm', 560);

    const top = at(roundedBox(kit, width, 26, depth, 'wood', 3), 0, height - 13, 0);
    const legs = new THREE.Group();
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        legs.add(
          at(
            cylinder(kit, 15, 11, height - 26, 'woodDark', 8),
            sx * (width / 2 - 44),
            (height - 26) / 2,
            sz * (depth / 2 - 44),
          ),
        );
      }
    }
    const carcass = at(roundedBox(kit, width - 70, 150, depth - 60, 'wood', 3), 0, height - 110, 0);
    const front = at(
      roundedBox(kit, width - 80, 128, 18, 'laminate', 3),
      0,
      height - 110,
      depth / 2 - 30,
    );
    const knob = rot(
      at(cylinder(kit, 13, 9, 26, 'brass', 10), 0, height - 110, depth / 2 - 12),
      Math.PI / 2,
      0,
      0,
    );
    const shelf = at(roundedBox(kit, width - 80, 16, depth - 70, 'wood', 2), 0, 150, 0);

    return shadows(group(top, legs, carcass, front, knob, shelf));
  },

  /** Bedside lamp. Motivates the region's only warm light, so the shade has to look lit-through. */
  'bedroom.bedsideLamp': (kit) => {
    const base = at(cylinder(kit, 78, 88, 22, 'brass', 16), 0, 11, 0);
    const stem = at(cylinder(kit, 9, 12, 250, 'brass', 10), 0, 147, 0);
    const socket = at(cylinder(kit, 17, 15, 34, 'plasticBlack', 10), 0, 289, 0);
    const bulb = at(sphere(kit, 27, 'glassFrosted', 12), 0, 318, 0);
    // Open cylinder, both sides lit: from a low camera you look up into the shade, and a backfaced
    // hole there is one of the defects this project bans outright.
    const shadeMaterial = kit.materials.clone('paper', 0xe8d3ad);
    shadeMaterial.side = THREE.DoubleSide;
    const shade = at(cylinder(kit, 92, 130, 186, shadeMaterial, 20, true), 0, 372, 0);
    const collar = rot(at(ring(kit, 90, 4, 'brass'), 0, 464, 0), -Math.PI / 2, 0, 0);
    const cord = tube(
      kit,
      [
        [0, 8, 60],
        [40, 6, 120],
        [86, 4, 150],
      ],
      4,
      'cable',
      12,
    );

    return shadows(group(base, stem, socket, bulb, shade, collar, cord));
  },

  /**
   * The water glass. Open-topped with a real water column and a real meniscus, because a worker
   * that climbs into it must stay legible from above — this is the object the region's best
   * moisture source lives in.
   */
  'bedroom.waterGlass': (kit) => {
    const wall = tumblerGlass(kit);
    const body = at(cylinder(kit, 35, 30, 112, wall, 18, true), 0, 56, 0);
    const floorDisc = at(cylinder(kit, 30, 29, 10, 'glass', 18), 0, 5, 0);
    const rim = rot(at(ring(kit, 34, 2.4, 'glass'), 0, 112, 0), -Math.PI / 2, 0, 0);
    const column = at(cylinder(kit, 31, 28, 64, 'water', 18), 0, 42, 0);
    const meniscus = at(cylinder(kit, 32, 32, 2, 'water', 18), 0, 74, 0);
    const beads = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const angle = kit.rand() * Math.PI * 2;
      beads.add(
        at(
          blob(kit, 2.2 + kit.rand() * 2, 0.7, 'water', 6),
          Math.cos(angle) * 33,
          20 + kit.rand() * 60,
          Math.sin(angle) * 33,
        ),
      );
    }
    return shadows(group(body, floorDisc, rim, column, meniscus, beads));
  },

  /** Tissue box. The sheet standing out of the slot is the whole silhouette. */
  'bedroom.tissueBox': (kit) => {
    const carton = at(roundedBox(kit, 225, 92, 142, 'cardboard', 4), 0, 46, 0);
    const band = at(
      roundedBox(kit, 228, 34, 145, kit.materials.clone('cardboard', 0x8fa6b0), 4),
      0,
      58,
      0,
    );
    const slot = at(box(kit, 118, 4, 50, 'plasticBlack'), 0, 92, 0);
    const sheetA = rot(at(roundedBox(kit, 96, 54, 3, 'paper', 1), -8, 116, 6), 0.18, 0.4, -0.22);
    const sheetB = rot(at(roundedBox(kit, 82, 40, 3, 'paper', 1), 18, 104, -10), -0.1, -0.6, 0.3);
    return shadows(group(carton, band, slot, sheetA, sheetB));
  },

  /** Phone, face up and charging. Its LED is the light the region places over the cable climb. */
  'bedroom.phone': (kit) => {
    const shell = at(
      roundedBox(kit, 72, 9, 148, kit.materials.clone('plasticBlack', 0x1a1c20), 3),
      0,
      4.5,
      0,
    );
    const screen = at(box(kit, 66, 1.2, 140, 'screenOff'), 0, 9.4, 0);
    const led = at(
      blob(kit, 2.6, 0.8, kit.materials.clone('plasticRed', 0xff7a4a), 6),
      22,
      9.6,
      -68,
    );
    const plug = at(roundedBox(kit, 14, 8, 22, 'plasticWhite', 2), 0, 5, -82);
    const lead = tube(
      kit,
      [
        [0, 5, -92],
        [18, 4, -118],
        [56, 4, -134],
      ],
      3.4,
      'cable',
      12,
    );
    return shadows(group(shell, screen, led, plug, lead));
  },

  /**
   * Charger cable, floor to table edge. The visible object behind a one-body climb, so it is built
   * with a real hanging bow rather than a straight line: the slack is what makes it look climbable.
   */
  'bedroom.chargerCable': (kit, options) => {
    const top = num(options, 'topMm', 560);
    const slack = num(options, 'slackMm', 140);
    const bow = slack * 0.35;

    const run = tube(
      kit,
      [
        [46, 8, 104],
        [30, 34, 62],
        [-bow * 0.4, top * 0.24, 22],
        [bow * 0.5, top * 0.52, -18],
        [-bow * 0.3, top * 0.8, 6],
        [0, top - 6, -8],
        [-26, top + 6, -58],
      ],
      3.6,
      'cable',
      36,
    );
    const plug = at(roundedBox(kit, 26, 16, 34, 'plasticWhite', 3), 46, 12, 106);
    const head = at(roundedBox(kit, 13, 8, 20, 'plasticWhite', 2), -30, top + 8, -66);
    // A loose coil left on the floor — every charging cable in a bedroom has one.
    const coil = rot(at(ring(kit, 58, 3.6, 'cable'), 84, 4, 78), -Math.PI / 2, 0.4, 0);

    return shadows(group(run, plug, head, coil));
  },

  /** Power strip. Where the cable climb starts, so its sockets read from directly above. */
  'bedroom.powerStrip': (kit) => {
    const body = at(roundedBox(kit, 252, 32, 62, 'plasticWhite', 5), 0, 17, 0);
    const sockets = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const x = -84 + i * 56;
      sockets.add(at(cylinder(kit, 22, 22, 4, 'plasticBlack', 14), x, 33, 0));
      for (const sz of [-1, 1]) {
        sockets.add(at(cylinder(kit, 3, 3, 8, 'plasticBlack', 6), x, 32, sz * 9));
      }
    }
    const rocker = at(roundedBox(kit, 20, 8, 14, 'plasticRed', 2), 112, 34, 0);
    const lead = tube(
      kit,
      [
        [-126, 12, 0],
        [-176, 8, 34],
        [-232, 6, 30],
      ],
      4,
      'cable',
      12,
    );
    const feet = new THREE.Group();
    for (const sx of [-1, 1]) {
      feet.add(at(roundedBox(kit, 22, 4, 44, 'rubber', 1), sx * 100, 2, 0));
    }
    return shadows(group(body, sockets, rocker, lead, feet));
  },

  /** Snack wrapper. Crumpled foil catches the lamp — it is how the player spots the food source. */
  'bedroom.snackWrapper': (kit, options) => {
    const phase = seedPhase(num(options, 'seed', 0));
    const sheetA = rot(at(drape(kit, 156, 122, 14, 'foil', 8), 0, 8, 0), 0, phase, 0);
    const sheetB = rot(at(drape(kit, 104, 88, 18, 'foil', 8), 44, 16, -26), 0.12, phase + 1.7, 0.1);
    const torn = rot(
      at(roundedBox(kit, 62, 3, 40, 'foil', 1), -58, 6, 30),
      0.2,
      phase - 0.9,
      -0.14,
    );

    const crumbs = scatter(kit, 10, 58, () => blob(kit, 2 + kit.rand() * 2.6, 0.7, 'crumb', 6));
    at(crumbs, 0, 2, 0);

    const wrapper = group(sheetA, sheetB, torn, crumbs);
    shadows(wrapper);
    // Crumbs are 4 mm of nothing; a shadow-map sample each buys no readability.
    shadows(crumbs, false, true);
    return wrapper;
  },

  /** Reading glasses, folded. Two rings and a bridge is the entire recognisable signal. */
  'bedroom.readingGlasses': (kit) => {
    const frame = kit.materials.clone('steelPolished', 0x6f6a62);
    const parts = new THREE.Group();
    for (const sz of [-1, 1]) {
      parts.add(rot(at(ring(kit, 25, 2.4, frame), 0, 8, sz * 32), -Math.PI / 2, 0, 0));
      parts.add(at(cylinder(kit, 23, 23, 1, 'glass', 16), 0, 8, sz * 32));
    }
    const bridge = at(roundedBox(kit, 10, 3, 20, frame, 1), 0, 9, 0);
    const temples = new THREE.Group();
    for (const sz of [-1, 1]) {
      temples.add(rot(at(roundedBox(kit, 118, 3, 4, frame, 1), 34, 13, sz * 12), 0, sz * 0.16, 0));
    }
    return shadows(group(parts, bridge, temples));
  },

  /**
   * Window. Origin sits on the wall plane at the bottom corner of the opening, so the frame is
   * authored from (0,0) outward and the whole assembly swings onto the wall's axis.
   *
   * Built as a two-leaf slider because that is what a Korean apartment bedroom has, and because the
   * centre mullion breaks the moonlight into two panels — a single sheet of glass at this size
   * reads as a hole cut in the wall.
   */
  'bedroom.window': (kit, options) => {
    const width = num(options, 'widthMm', 1000);
    const height = num(options, 'heightMm', 1300);
    const frame = 'plasticWhite';

    const outer = group(
      at(roundedBox(kit, width, 60, 76, frame, 3), width / 2, 30, 38),
      at(roundedBox(kit, width, 60, 76, frame, 3), width / 2, height - 30, 38),
      at(roundedBox(kit, 60, height - 120, 76, frame, 3), 30, height / 2, 38),
      at(roundedBox(kit, 60, height - 120, 76, frame, 3), width - 30, height / 2, 38),
    );
    const mullion = at(roundedBox(kit, 64, height - 120, 70, frame, 3), width / 2, height / 2, 40);

    const sashes = new THREE.Group();
    for (const [index, x0] of [60, width / 2 + 32].entries()) {
      const leaf = width / 2 - 92;
      const z = index === 0 ? 26 : 54;
      const cx = x0 + leaf / 2;
      const cy = height / 2;
      const inner = height - 180;
      sashes.add(at(roundedBox(kit, 38, inner, 26, frame, 2), x0 + 19, cy, z));
      sashes.add(at(roundedBox(kit, 38, inner, 26, frame, 2), x0 + leaf - 19, cy, z));
      sashes.add(at(roundedBox(kit, leaf, 38, 26, frame, 2), cx, cy - inner / 2 + 19, z));
      sashes.add(at(roundedBox(kit, leaf, 38, 26, frame, 2), cx, cy + inner / 2 - 19, z));
      sashes.add(at(box(kit, leaf - 60, inner - 60, 5, 'glass'), cx, cy, z));
    }
    const latch = at(roundedBox(kit, 22, 60, 20, 'chrome', 3), width / 2 - 44, height * 0.42, 62);

    return orient(shadows(group(outer, mullion, sashes, latch)), str(options, 'axis', 'x'));
  },

  /**
   * Window sill. Origin is the room-side top edge of the ledge; the slab runs back toward the wall
   * along local -z, which is the direction the region's sill surface occupies.
   */
  'bedroom.windowSill': (kit, options) => {
    const length = num(options, 'lengthMm', 1000);
    const depth = num(options, 'depthMm', 150);

    const slab = at(roundedBox(kit, length, 26, depth, 'worktop', 4), length / 2, -13, -depth / 2);
    // A rounded nosing on the exposed edge. The highlight along it is what tells the player the
    // ledge is a solid ledge with a lip, not a painted band on the wall.
    const nosing = rot(
      at(cylinder(kit, 13, 13, length, 'worktop', 12), length / 2, -13, -2),
      0,
      0,
      Math.PI / 2,
    );
    const apron = at(
      roundedBox(kit, length, 44, depth - 24, 'plasterWall', 2),
      length / 2,
      -48,
      -depth / 2 - 6,
    );
    // Dust collects in the back corner of every sill; it is also the moisture source's excuse.
    const dust = at(patch(kit, length - 60, 34, 'grime'), length / 2, -24, -depth + 22);

    return orient(shadows(group(slab, nosing, apron, dust)), str(options, 'axis', 'x'));
  },

  /**
   * Curtain. Origin is the top of the drop; everything hangs below it.
   *
   * A wavy sheet plus three deep folds in front: from a low diagonal camera the folds are what give
   * the curtain a readable vertical silhouette against the moonlit window, and the hem reaching the
   * boards is what makes the curtain climb believable.
   */
  'bedroom.curtain': (kit, options) => {
    const width = num(options, 'widthMm', 1300);
    const drop = num(options, 'dropMm', 2180);
    const phase = seedPhase(num(options, 'seed', 0));
    const cloth = kit.materials.clone('fabricClothes', 0x59606b);

    // Built flat, then stood up: the sheet's sag becomes horizontal billow instead of vertical sag.
    const sheetHolder = new THREE.Group();
    const sheet = rot(drape(kit, width, drop, 46, cloth, 14), Math.PI / 2, 0, 0);
    at(sheet, 0, -drop / 2, 0);
    sheetHolder.add(sheet);
    sheetHolder.rotation.y = Math.PI / 2;

    const folds = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const z = -width / 2 + (width / 4) * (i + 0.5);
      const fold = at(
        cylinder(kit, 44, 58, drop, cloth, 10),
        -34 - Math.sin(phase + i) * 14,
        -drop / 2,
        z,
      );
      fold.rotation.z = (kit.rand() - 0.5) * 0.04;
      folds.add(fold);
      // Weighted hem: the fabric pools where it meets the floor rather than ending in mid air.
      folds.add(at(blob(kit, 62, 0.42, cloth, 8), -40, -drop + 24, z));
    }

    const header = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      header.add(
        at(roundedBox(kit, 40, 84, 62, cloth, 8), -30, -46, -width / 2 + (width / 5) * (i + 0.5)),
      );
    }

    return shadows(group(sheetHolder, folds, header));
  },

  /** Curtain rail. The rings read as hoops at scout scale, which is most of what sells the rail. */
  'bedroom.curtainRail': (kit, options) => {
    const length = num(options, 'lengthMm', 1400);

    const rod = rot(cylinder(kit, 11, 11, length, 'steelBrushed', 12), Math.PI / 2, 0, 0);
    const ends = new THREE.Group();
    for (const sx of [-1, 1]) {
      ends.add(at(sphere(kit, 20, 'steelBrushed', 10), sx * (length / 2 + 8), 0, 0));
    }
    const brackets = new THREE.Group();
    for (const sx of [-1, 1]) {
      brackets.add(at(roundedBox(kit, 16, 14, 46, 'steelBrushed', 2), sx * length * 0.34, 0, 24));
      brackets.add(
        rot(at(ring(kit, 16, 4, 'steelBrushed'), sx * length * 0.34, 0, 0), 0, Math.PI / 2, 0),
      );
    }
    const rings = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      rings.add(
        rot(
          at(ring(kit, 21, 3.4, 'steelBrushed'), -length * 0.36 + i * length * 0.144, -6, 0),
          0,
          Math.PI / 2,
          0,
        ),
      );
    }

    return orient(shadows(group(rod, ends, brackets, rings)), str(options, 'axis', 'x'));
  },

  /** Condensation on the cold sill: a film, real beads, and two runs. Flat, so it never casts. */
  'bedroom.condensation': (kit, options) => {
    const radius = num(options, 'radiusMm', 90);
    const phase = seedPhase(num(options, 'seed', 0));

    const film = at(blob(kit, radius, 0.03, 'water', 14), 0, 1, 0);
    const beads = scatter(kit, 16, radius * 0.92, () =>
      blob(kit, 1.8 + kit.rand() * 4, 0.62, 'water', 6),
    );
    const runs = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const a = phase + i * 2.1;
      const run = at(
        blob(kit, radius * 0.3, 0.09, 'water', 8),
        Math.cos(a) * radius * 0.4,
        1.4,
        Math.sin(a) * radius * 0.4,
      );
      run.scale.set(2.1, 1, 0.42);
      run.rotation.y = a;
      runs.add(run);
    }
    // The mineral ring left by every previous night of the same condensation.
    const tide = rot(at(ring(kit, radius * 0.96, 1.1, 'grime'), 0, 0.8, 0), -Math.PI / 2, 0, 0);

    return shadows(group(film, beads, runs, tide), false, true);
  },

  /**
   * Door leaf, hinged at the origin and swung by the placement. Left ajar, so its edge and the
   * light down its side are what the player reads as "the hallway is open".
   */
  'bedroom.doorLeaf': (kit, options) => {
    const width = num(options, 'widthMm', 800);
    const height = num(options, 'heightMm', 2050);
    const face = kit.materials.clone('plasticWhite', 0xd4ccbe);

    const leaf = at(
      roundedBox(kit, width, height, 38, 'plasticWhite', 3),
      width / 2,
      height / 2,
      0,
    );
    const panels = new THREE.Group();
    for (const y of [height * 0.28, height * 0.68]) {
      for (const sz of [-1, 1]) {
        panels.add(
          at(roundedBox(kit, width - 200, height * 0.3, 8, face, 4), width / 2, y, sz * 22),
        );
      }
    }
    const furniture = new THREE.Group();
    for (const sz of [-1, 1]) {
      furniture.add(
        rot(
          at(cylinder(kit, 32, 32, 10, 'steelBrushed', 14), width - 62, 1000, sz * 22),
          Math.PI / 2,
          0,
          0,
        ),
      );
      furniture.add(at(cylinder(kit, 12, 12, 96, 'steelBrushed', 10), width - 62, 1000, sz * 60));
    }
    const hinges = new THREE.Group();
    for (const y of [280, height / 2, height - 280]) {
      hinges.add(at(roundedBox(kit, 16, 96, 44, 'brass', 2), 6, y, 0));
    }

    return shadows(group(leaf, panels, furniture, hinges));
  },

  /**
   * Door architrave. Stands 22 mm proud of the wall and 90 mm deep into the room, which is exactly
   * the nook the relay foothold occupies — the colony's only join to the hallway network.
   */
  'bedroom.architrave': (kit, options) => {
    const width = num(options, 'widthMm', 800);
    const height = num(options, 'heightMm', 2050);

    const jambs = new THREE.Group();
    for (const sx of [-1, 1]) {
      jambs.add(
        at(roundedBox(kit, 26, height, 92, 'skirting', 3), sx * (width / 2 + 13), height / 2, -46),
      );
      // Stop bead: the ledge the scout actually shelters behind.
      jambs.add(
        at(
          roundedBox(kit, 14, height - 40, 20, 'skirting', 2),
          sx * (width / 2 - 7),
          height / 2 - 20,
          -74,
        ),
      );
    }
    const head = at(roundedBox(kit, width + 52, 26, 92, 'skirting', 3), 0, height + 13, -46);
    const headStop = at(roundedBox(kit, width - 14, 14, 20, 'skirting', 2), 0, height - 7, -74);
    const threshold = at(roundedBox(kit, width, 8, 76, 'wood', 2), 0, 4, -38);

    return shadows(group(jambs, head, headStop, threshold));
  },

  /** A pair of house slippers, one kicked askew. Nothing says "someone sleeps here" faster. */
  'bedroom.slippers': (kit) => {
    const upper = kit.materials.clone('fabricTowel', 0x7f7568);
    // The helper builds a slipper with its length along +z, so the pair separates across x.
    const left = at(slipper(kit, upper), -58, 0, 0);
    // One of a pair is always kicked out of line. That asymmetry is what stops it reading as a set
    // of blocks placed by a level editor.
    const right = rot(at(slipper(kit, upper), 62, 0, -26), 0, 0.26, 0);
    return shadows(group(left, right));
  },

  /** Dropped shirt. Sleeves and buttons — without them a heap of cloth is just a heap. */
  'bedroom.shirtOnFloor': (kit, options) => {
    const spread = num(options, 'spreadMm', 560);
    const phase = seedPhase(num(options, 'seed', 0));
    const cloth = kit.materials.clone('fabricClothes', 0x8d939c);

    const body = clothHeap(kit, spread, cloth, 3, phase);
    const sleeves = new THREE.Group();
    for (const sz of [-1, 1]) {
      sleeves.add(
        tube(
          kit,
          [
            [spread * 0.1, 34, sz * spread * 0.24],
            [spread * 0.34, 26, sz * spread * 0.4],
            [spread * 0.54, 18, sz * spread * 0.3],
          ],
          46,
          cloth,
          14,
        ),
      );
      sleeves.add(at(ring(kit, 40, 9, cloth), spread * 0.54, 18, sz * spread * 0.3));
    }
    const collar = rot(
      at(ring(kit, 62, 16, cloth, Math.PI * 1.2), -spread * 0.26, 40, 0),
      -Math.PI / 2,
      0,
      phase,
    );
    const buttons = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      buttons.add(
        at(cylinder(kit, 7, 7, 2.4, 'plasticWhite', 10), -spread * 0.1 + i * 62, 52, -8 + i * 6),
      );
    }

    return shadows(group(body, sleeves, collar, buttons));
  },

  /** Dropped trousers. Two tube legs off a waistband — the shape reads even in near-darkness. */
  'bedroom.trousersOnFloor': (kit, options) => {
    const spread = num(options, 'spreadMm', 520);
    const phase = seedPhase(num(options, 'seed', 0));
    const denim = kit.materials.clone('fabricClothes', 0x3f4653);

    const waist = rot(at(ring(kit, 96, 30, denim), -spread * 0.3, 32, 0), -Math.PI / 2, 0, phase);
    const legs = new THREE.Group();
    for (const sz of [-1, 1]) {
      legs.add(
        tube(
          kit,
          [
            [-spread * 0.26, 30, sz * 52],
            [-spread * 0.02, 26, sz * 96],
            [spread * 0.26, 22, sz * 58],
            [spread * 0.46, 18, sz * 96],
          ],
          52,
          denim,
          20,
        ),
      );
      legs.add(at(ring(kit, 46, 10, denim), spread * 0.46, 18, sz * 96));
    }
    const crumple = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      crumple.add(
        at(
          blob(kit, 62 + kit.rand() * 30, 0.5, denim, 8),
          -spread * 0.1 + i * 130,
          44,
          (kit.rand() - 0.5) * 90,
        ),
      );
    }
    const stud = at(cylinder(kit, 9, 9, 4, 'brass', 10), -spread * 0.3, 60, -76);
    const loops = new THREE.Group();
    for (const sz of [-1, 1]) {
      loops.add(at(roundedBox(kit, 12, 26, 6, denim, 2), -spread * 0.3, 44, sz * 78));
    }

    return shadows(group(waist, legs, crumple, stud, loops));
  },

  /** One sock lying out, one balled up. The pair state is the joke; both shapes are distinct. */
  'bedroom.sockPair': (kit) => {
    const knit = kit.materials.clone('fabricTowel', 0x9aa2a8);

    const laid = tube(
      kit,
      [
        [-118, 26, -40],
        [-30, 22, -58],
        [56, 20, -34],
        [104, 24, 6],
      ],
      27,
      knit,
      18,
    );
    const toe = at(sphere(kit, 28, knit, 10), 112, 24, 14);
    const cuff = rot(
      at(cylinder(kit, 33, 30, 34, knit, 12, true), -122, 26, -38),
      0,
      0,
      Math.PI / 2,
    );

    const balled = at(blob(kit, 48, 0.82, knit, 10), 40, 40, 118);
    const lobe = at(blob(kit, 34, 0.9, knit, 8), 6, 44, 138);
    const tail = rot(at(ring(kit, 26, 9, knit, Math.PI * 1.4), 74, 34, 132), -Math.PI / 2, 0, 0.6);

    return shadows(group(laid, toe, cuff, balled, lobe, tail));
  },

  /** Laundry basket. Ribs and an open mouth, so the camera sees down into it from the diagonal. */
  'bedroom.laundryBasket': (kit) => {
    const weave = kit.materials.clone('plasticWhite', 0xb3aa99);
    weave.side = THREE.DoubleSide;

    const shell = at(cylinder(kit, 218, 186, 430, weave, 18, true), 0, 215, 0);
    const base = at(cylinder(kit, 186, 182, 14, weave, 18), 0, 7, 0);
    const rim = rot(at(ring(kit, 218, 12, weave), 0, 430, 0), -Math.PI / 2, 0, 0);
    const ribs = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const y = 90 + i * 130;
      ribs.add(rot(at(ring(kit, 190 + i * 10, 7, weave), 0, y, 0), -Math.PI / 2, 0, 0));
    }
    const handles = new THREE.Group();
    for (const sx of [-1, 1]) {
      handles.add(
        rot(at(ring(kit, 46, 9, weave, Math.PI), sx * 206, 372, 0), 0, (sx * Math.PI) / 2, Math.PI),
      );
    }
    // Something always hangs over the edge, and it is what makes the basket read as in use.
    const spill = rot(
      at(drape(kit, 240, 300, 40, 'fabricClothes', 8), -150, 400, 40),
      0.5,
      0.7,
      -0.4,
    );

    return shadows(group(shell, base, rim, ribs, handles, spill));
  },

  /** Laundry pile. The best floor cover in the region, so it has to look like a hole in the light. */
  'bedroom.laundryPile': (kit, options) => {
    const spread = num(options, 'spreadMm', 320);
    const phase = seedPhase(num(options, 'seed', 0));

    const base = clothHeap(
      kit,
      spread * 1.6,
      kit.materials.clone('fabricClothes', 0x4c525c),
      3,
      phase,
    );
    const towel = clothHeap(kit, spread * 1.1, 'fabricTowel', 2, phase + 1.4);
    at(towel, spread * 0.12, 48, -spread * 0.1);
    const sleeve = tube(
      kit,
      [
        [spread * 0.2, 70, spread * 0.1],
        [spread * 0.6, 44, spread * 0.3],
        [spread * 0.9, 26, spread * 0.2],
      ],
      42,
      'fabricSofa',
      14,
    );

    return shadows(group(base, towel, sleeve));
  },

  /** Ultrasonic humidifier. The one object in the room a cockroach wants, and the blue standby glow
   *  the region's floor-level light is motivated by. */
  'bedroom.humidifier': (kit) => {
    const shellMaterial = kit.materials.clone('plasticClear', 0xb8c6cc);
    shellMaterial.side = THREE.DoubleSide;

    const base = at(cylinder(kit, 104, 110, 62, 'plasticWhite', 20), 0, 31, 0);
    const foot = rot(at(ring(kit, 104, 6, 'rubber'), 0, 6, 0), -Math.PI / 2, 0, 0);
    const tank = at(cylinder(kit, 92, 102, 250, shellMaterial, 20, true), 0, 187, 0);
    const water = at(cylinder(kit, 86, 94, 138, 'water', 20), 0, 131, 0);
    const cap = at(cylinder(kit, 80, 92, 32, 'plasticWhite', 20), 0, 328, 0);
    const nozzle = at(cylinder(kit, 27, 36, 42, 'plasticWhite', 16), 0, 362, 0);
    const throat = at(cylinder(kit, 22, 22, 10, 'plasticBlack', 14), 0, 380, 0);
    const glow = rot(
      at(ring(kit, 98, 3.6, kit.materials.clone('plasticBlue', 0x4f86d6)), 0, 210, 0),
      -Math.PI / 2,
      0,
      0,
    );
    const cord = tube(
      kit,
      [
        [-96, 14, 30],
        [-190, 8, 74],
        [-300, 6, 60],
      ],
      4,
      'cable',
      14,
    );

    return shadows(group(base, foot, tank, water, cap, nozzle, throat, glow, cord));
  },

  /** Bedroom waste basket, tissues and all. Open-topped so the diagonal camera sees the contents. */
  'bedroom.wasteBasket': (kit) => {
    const shell = kit.materials.clone('plasticWhite', 0xa8a49b);
    shell.side = THREE.DoubleSide;

    const body = at(cylinder(kit, 118, 94, 268, shell, 18, true), 0, 134, 0);
    const base = at(cylinder(kit, 94, 92, 10, shell, 18), 0, 5, 0);
    const rim = rot(at(ring(kit, 118, 5, shell), 0, 268, 0), -Math.PI / 2, 0, 0);
    // The liner folded over the lip: a bin without one reads as a plant pot.
    const liner = rot(at(drape(kit, 150, 120, 22, 'plasticClear', 8), 0, 250, 0), 0.3, 0.4, 0);
    const contents = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      contents.add(
        at(
          blob(kit, 32 + kit.rand() * 16, 0.86, 'paper', 8),
          (kit.rand() - 0.5) * 100,
          210 + kit.rand() * 60,
          (kit.rand() - 0.5) * 100,
        ),
      );
    }

    return shadows(group(body, base, rim, liner, contents));
  },

  /** A leaning stack of paperbacks. Deterministic skew, so the stack looks stacked by a person. */
  'bedroom.bookStack': (kit) => {
    const covers = [
      kit.materials.clone('cabinetDoor', 0x2f4a5c),
      kit.materials.clone('plasticRed', 0x8a3f36),
      kit.materials.clone('cardboard', 0xa8946c),
      kit.materials.clone('plasticGreen', 0x3f5c47),
      kit.materials.clone('laminateDark', 0x3a3630),
    ];
    const stack = new THREE.Group();
    let y = 0;
    for (let i = 0; i < covers.length; i++) {
      const thick = 22 + kit.rand() * 16;
      const volume = book(kit, 150 - i * 4, 212 - i * 6, thick, covers[i]);
      at(volume, (kit.rand() - 0.5) * 22, y + thick / 2, (kit.rand() - 0.5) * 20);
      volume.rotation.y = (kit.rand() - 0.5) * 0.22;
      stack.add(volume);
      y += thick;
    }
    // A ribbon marker trailing out of the top book, at scout scale a road across the cover.
    const ribbon = at(
      roundedBox(kit, 12, 2, 118, kit.materials.clone('fabricTowel', 0x9a5a4c), 0.8),
      40,
      y - 6,
      120,
    );

    return shadows(group(stack, ribbon));
  },

  /** Full-length mirror leaning on the wall. Tilted about Z so the top falls back into the plaster. */
  'bedroom.mirrorLean': (kit, options) => {
    const height = num(options, 'heightMm', 1500);
    const width = 620;

    const glass = at(box(kit, 8, height - 92, width - 92, 'chrome'), -4, height / 2, 0);
    const backing = at(
      roundedBox(kit, 12, height - 76, width - 76, 'cardboard', 2),
      8,
      height / 2,
      0,
    );
    const frame = new THREE.Group();
    for (const sz of [-1, 1]) {
      frame.add(
        at(roundedBox(kit, 34, height, 46, 'woodDark', 3), 0, height / 2, sz * (width / 2 - 23)),
      );
    }
    for (const y of [23, height - 23]) {
      frame.add(at(roundedBox(kit, 34, 46, width - 92, 'woodDark', 3), 0, y, 0));
    }
    const pads = new THREE.Group();
    for (const sz of [-1, 1]) {
      pads.add(at(roundedBox(kit, 30, 6, 40, 'rubber', 1), 0, 3, sz * (width / 2 - 23)));
    }

    const leaning = group(glass, backing, frame, pads);
    // The lean is the prop: a mirror standing perfectly upright reads as a doorway.
    leaning.rotation.z = 0.075;
    return shadows(leaning);
  },

  /** Bedside rug. Undulating pile plus fringe — a flat quad here would read as a painted rectangle. */
  'bedroom.rug': (kit, options) => {
    const width = num(options, 'widthMm', 900);
    const depth = num(options, 'depthMm', 600);

    const pile = at(drape(kit, width - 60, depth - 60, 5, 'fabricRug', 16), 0, 7, 0);
    const border = at(
      roundedBox(kit, width, 8, depth, kit.materials.clone('fabricRug', 0x5f5044), 3),
      0,
      4,
      0,
    );
    const fringe = new THREE.Group();
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const strand = at(
          cylinder(kit, 3, 3, 34, 'fabricRug', 6),
          sx * (width / 2 + 15),
          4,
          -depth / 2 + 40 + i * ((depth - 80) / 6),
        );
        rot(strand, 0, (kit.rand() - 0.5) * 0.3, Math.PI / 2);
        fringe.add(strand);
      }
    }

    // A rug is furniture-flat: it grounds other objects but should not throw its own shadow.
    return shadows(group(pile, border, fringe), false, true);
  },

  /** Hair tie. At 35 mm this is an archway, so it is a real torus with a real hole through it. */
  'bedroom.hairTie': (kit) => {
    const elastic = kit.materials.clone('fabricClothes', 0x6c4a66);
    const loop = rot(at(ring(kit, 19, 2.6, elastic), 0, 2.8, 0), -Math.PI / 2, 0, 0);
    const twist = rot(at(ring(kit, 13, 2.4, elastic), 6, 4.4, 3), -Math.PI / 2 + 0.5, 0.4, 0);
    const hairs = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      hairs.add(
        tube(
          kit,
          [
            [10 + i * 6, 1, 8],
            [46 + i * 14, 2.4, -18 + i * 20],
            [96 + i * 20, 1, 6 - i * 26],
          ],
          0.5,
          kit.materials.clone('rubber', 0x241f1c),
          12,
        ),
      );
    }
    return shadows(group(loop, twist, hairs));
  },

  /** The dust line under the bed: lint, grit and hair. Flat detritus, so it never casts. */
  'bedroom.dustLine': (kit, options) => {
    const length = num(options, 'lengthMm', 1700);
    const phase = seedPhase(num(options, 'seed', 0));
    const lintMaterial = kit.materials.clone('grime', 0x6b6156);

    const film = at(patch(kit, length, 96, 'grime'), 0, 0, 0);
    const lint = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const clump = at(
        blob(kit, 6 + kit.rand() * 11, 0.42, lintMaterial, 8),
        -length / 2 + (length / 14) * (i + kit.rand()),
        3,
        Math.sin(phase + i * 1.3) * 34,
      );
      clump.scale.set(1.6, 1, 0.8);
      clump.rotation.y = kit.rand() * Math.PI;
      lint.add(clump);
    }
    const hairs = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const x = -length / 2 + (length / 4) * (i + 0.4);
      hairs.add(
        tube(
          kit,
          [
            [x, 1, -40 + kit.rand() * 20],
            [x + 90, 2.2, 20 - kit.rand() * 40],
            [x + 190, 1, -10 + kit.rand() * 30],
          ],
          0.6,
          kit.materials.clone('rubber', 0x2a2622),
          14,
        ),
      );
    }

    return orient(shadows(group(film, lint, hairs), false, true), str(options, 'axis', 'x'));
  },

  /** Crumbs worked into the floor under the bed. The hidden food source: findable, never obvious. */
  'bedroom.crumbTrace': (kit, options) => {
    const radius = num(options, 'radiusMm', 140);

    const ground = at(patch(kit, radius * 2, radius * 1.7, 'grime'), 0, 0, 0);
    const fine = scatter(kit, 22, radius, () => blob(kit, 1.4 + kit.rand() * 3, 0.7, 'crumb', 6));
    const chunks = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const angle = kit.rand() * Math.PI * 2;
      const chunk = at(
        roundedBox(kit, 7 + kit.rand() * 6, 5, 6 + kit.rand() * 5, 'crumb', 1),
        Math.cos(angle) * radius * 0.5,
        3,
        Math.sin(angle) * radius * 0.5,
      );
      chunk.rotation.set(kit.rand(), kit.rand() * Math.PI, kit.rand() * 0.4);
      chunks.add(chunk);
    }
    const grains = scatter(kit, 5, radius * 0.7, () => {
      const grain = blob(kit, 3, 0.55, 'rice', 6);
      grain.scale.set(2.2, 1, 0.9);
      return grain;
    });

    return shadows(group(ground, fine, chunks, grains), false, true);
  },

  /** Wall clock. Hands at an angle read as a working clock; a blank disc reads as a vent. */
  'bedroom.wallClock': (kit) => {
    const caseMaterial = kit.materials.clone('plasticWhite', 0xe8e4dc);
    const shell = rot(
      at(cylinder(kit, 140, 144, 36, caseMaterial, 24), 0, 0, -18),
      Math.PI / 2,
      0,
      0,
    );
    const dial = rot(at(cylinder(kit, 128, 128, 3, 'paper', 24), 0, 0, -34), Math.PI / 2, 0, 0);
    const bezel = at(ring(kit, 134, 8, caseMaterial), 0, 0, -34);
    const crystal = rot(at(cylinder(kit, 130, 130, 2, 'glass', 24), 0, 0, -37), Math.PI / 2, 0, 0);

    const markers = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const mark = at(
        box(kit, 10, 26, 2, 'plasticBlack'),
        Math.sin(angle) * 106,
        Math.cos(angle) * 106,
        -36,
      );
      mark.rotation.z = -angle;
      markers.add(mark);
    }
    const hour = rot(at(roundedBox(kit, 9, 74, 3, 'plasticBlack', 1), 22, 32, -38), 0, 0, -0.6);
    const minute = rot(at(roundedBox(kit, 6, 112, 3, 'plasticBlack', 1), -34, 46, -39), 0, 0, 0.64);
    const second = rot(at(roundedBox(kit, 3, 122, 2, 'plasticRed', 0.8), 40, -42, -40), 0, 0, 2.4);
    const cap = rot(at(cylinder(kit, 8, 8, 6, 'plasticBlack', 10), 0, 0, -41), Math.PI / 2, 0, 0);

    return shadows(group(shell, dial, bezel, crystal, markers, hour, minute, second, cap));
  },

  /**
   * Wall air conditioner. Hung with its top at the placement height and its body below, because the
   * only part the low camera ever sees is the underside and the discharge louvre.
   */
  'bedroom.acUnit': (kit, options) => {
    const width = num(options, 'widthMm', 820);
    const height = num(options, 'heightMm', 290);
    const depth = 232;
    const fascia = kit.materials.clone('plasticWhite', 0xe9e6df);

    const body = at(
      roundedBox(kit, width, height, depth, 'plasticWhite', 14),
      0,
      -height / 2,
      -depth / 2,
    );
    const front = at(
      roundedBox(kit, width - 16, height - 40, 20, fascia, 10),
      0,
      -height / 2,
      -depth + 6,
    );
    const outlet = at(box(kit, width - 130, 48, 30, 'plasticBlack'), 0, -height + 44, -depth + 22);
    const vanes = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      vanes.add(
        rot(
          at(roundedBox(kit, width - 150, 5, 26, fascia, 1), 0, -height + 58 - i * 15, -depth + 20),
          -0.5,
          0,
          0,
        ),
      );
    }
    const intake = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      intake.add(at(roundedBox(kit, width - 90, 6, 12, fascia, 1), 0, -8, -34 - i * 30));
    }
    const display = at(box(kit, 92, 16, 3, 'screenOff'), width * 0.28, -height + 66, -depth - 3);
    const drain = tube(
      kit,
      [
        [width / 2 - 20, -height + 20, -40],
        [width / 2 + 10, -height - 60, -20],
        [width / 2 + 14, -height - 200, -12],
      ],
      9,
      'plasticWhite',
      14,
    );

    return shadows(group(body, front, outlet, vanes, intake, display, drain));
  },
};

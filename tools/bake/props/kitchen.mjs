import * as THREE from 'three';
import * as M from '../lib/materials.mjs';
import { cylinder, mesh, roundedBox } from '../lib/shapes.mjs';
import { mm } from '../lib/units.mjs';

/**
 * Kitchen architecture: the cabinet runs, counter edges and floor.
 *
 * These exist to kill the defect reported first and loudest — "large blue-black rectangular
 * surfaces dominate the screen". The old renderer filled a 1080x470-unit counter with one flat
 * colour, which at play zoom is wider than the screen. `ART_BIBLE.md` actually *mandated* that
 * ("cabinets and appliances are walls, not props"), so the defect was the art direction working as
 * written. That rule is rescinded.
 *
 * The replacement is a real cross-section. A kitchen cabinet seen from 26° off vertical resolves,
 * top to bottom, into: worktop surface, a bright front lip, a dark shadow reveal, the door face, a
 * handle, and the toe-kick void that never receives light. That is six value changes inside
 * ~120 mm, and it is what makes a fixture read as furniture instead of as a painted rectangle.
 *
 * These slices are authored to TILE horizontally, so a counter of any length is built by repeating
 * one strip and the renderer never draws a bare rectangle again.
 */

/** Horizontal tile period. Wide enough to carry a door and a handle, narrow enough that the
 *  directional key light does not visibly ramp across one copy. */
const SLICE_W = 240;

/**
 * A base-cabinet cross-section slice: worktop, lip, reveal, door, handle, toe-kick.
 *
 * Modelled at true joinery dimensions — 600 mm deep carcass, 150 mm toe-kick recessed 60 mm, 38 mm
 * worktop with a 12 mm overhang. Those numbers are why the shadows land where the eye expects.
 */
function cabinetRun({ handle = true, drawer = false } = {}) {
  const g = new THREE.Group();

  /*
   * Only the TOP of the cabinet is modelled, and that is the whole lesson from the first attempt.
   *
   * A full 760 mm carcass was baked first. At 26° off vertical it projected into a 662-unit-tall
   * slab of flat door — a bigger version of exactly the rectangle this prop exists to destroy. In a
   * near-top-down game the player sees the WORKTOP; the cabinet front is a narrow band along its
   * leading edge. So the useful asset is a shallow edge profile, not a piece of furniture.
   *
   * Total modelled height is ~210 mm, which projects to roughly 70 world units of screen band:
   * enough to carry six value changes, small enough that it reads as an edge.
   */
  const VISIBLE_FACE = 150;

  // Worktop slab. Its top face is the surface props actually stand on.
  const top = mesh(roundedBox(SLICE_W, 34, 560, 2), M.counterStone());
  top.position.set(0, mm(VISIBLE_FACE), 0);
  g.add(top);

  // Front lip: overhangs the door by 14 mm, so it casts a hard shadow line onto the face below.
  // This is the brightest horizontal in the run and the thing that says "solid surface".
  const lip = mesh(roundedBox(SLICE_W, 22, 26, 4), M.counterStone());
  lip.position.set(0, mm(VISIBLE_FACE - 4), mm(-286));
  g.add(lip);

  // Shadow reveal: the dark gap between worktop and door. Modelled as real recessed geometry rather
  // than painted, so the key light produces the gradient instead of a flat band.
  const reveal = mesh(roundedBox(SLICE_W, 26, 18, 1), M.laminate(0x11161b));
  reveal.position.set(0, mm(VISIBLE_FACE - 34), mm(-268));
  g.add(reveal);

  // Door face, proud of the carcass.
  const door = mesh(roundedBox(SLICE_W - 14, VISIBLE_FACE - 40, 20, 3), M.laminate(0x6e665b));
  door.position.set(0, 0, mm(-278));
  g.add(door);
  if (drawer) {
    // A drawer bank splits the face horizontally — the rhythm that stops a long run repeating.
    const split = mesh(roundedBox(SLICE_W - 14, 8, 24, 1), M.laminate(0x1b2128));
    split.position.set(0, mm(VISIBLE_FACE - 62), mm(-280));
    g.add(split);
  }

  if (handle) {
    // A horizontal bar pull, in FRONT of the door face so it is not swallowed by it. Small, but a
    // hard specular line at a known height, and the eye uses it to size everything else in frame.
    const bar = mesh(cylinder(6, SLICE_W - 110, 12), M.steelPolished());
    bar.rotation.z = Math.PI / 2;
    bar.position.set(mm((SLICE_W - 110) / 2), mm(VISIBLE_FACE - 86), mm(-296));
    g.add(bar);
  }

  // Toe-kick void, recessed and unlit, in front of nothing so it reads as darkness under the run.
  // This is the strongest depth cue on a cabinet — and it is where the colony actually lives.
  const kick = mesh(roundedBox(SLICE_W, 30, 44, 1), M.laminate(0x0a0e12));
  kick.position.set(0, mm(-30), mm(-252));
  g.add(kick);

  return g;
}

/**
 * A ceramic floor tile with its grout channel.
 *
 * Authored as one tile plus grout so it repeats without a seam. Grout sits 2 mm proud-of-recessed,
 * which at insect scale is a real 1.5-unit step the light catches — that shallow relief is the
 * difference between a tiled floor and a flat fill.
 */
function floorTile() {
  const g = new THREE.Group();
  // Grout bed, deliberately much darker and wider than the first attempt, where a 7 mm value step
  // vanished entirely at play zoom and the floor went back to being a flat fill.
  g.add(mesh(roundedBox(320, 4, 320, 0.5), M.laminate(0x1a2027)));
  // The tile sits proud with a chamfered edge, so the grout channel is a real 14 mm trench that
  // catches a shadow on one side and a highlight on the other.
  const tile = mesh(roundedBox(292, 12, 292, 6), M.ceramicFoot(0x8e9aa2));
  tile.position.y = mm(3);
  g.add(tile);
  return g;
}

/** A brushed-steel panel slice for appliance fronts and the sink run. */
function steelPanel() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(SLICE_W, 620, 40, 3), M.steelBrushed()));
  // A horizontal seam breaks the panel so a fridge front is never one unbroken plane.
  const seam = mesh(roundedBox(SLICE_W, 10, 46, 2), M.laminate(0x161c22));
  seam.position.set(0, mm(430), 0);
  g.add(seam);
  return g;
}

export const KITCHEN_PROPS = {
  'cabinet-run': { build: () => cabinetRun({ handle: true }), shadow: false },
  'cabinet-drawer': { build: () => cabinetRun({ handle: true, drawer: true }), shadow: false },
  'cabinet-blank': { build: () => cabinetRun({ handle: false }), shadow: false },
  'floor-tile': { build: floorTile, shadow: false },
  'steel-panel': { build: steelPanel, shadow: false },
};

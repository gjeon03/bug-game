import * as THREE from 'three';
import * as M from '../lib/materials.mjs';
import {
  cylinder,
  dome,
  lathe,
  makeRng,
  mesh,
  radialArray,
  ring,
  roundedBox,
} from '../lib/shapes.mjs';
import { mm } from '../lib/units.mjs';

/**
 * Sink-and-dishes zone props.
 *
 * This is the proving zone for the whole art pipeline: if a plate here does not read as crockery
 * and the drain does not read as a drain, no amount of work elsewhere will save the kitchen.
 *
 * Every dimension below is a real measurement of a real object found in a Korean apartment
 * kitchen, in millimetres. Do not "adjust to taste" — adjust the measurement.
 */

/**
 * Dinner plate, 200 mm.
 *
 * The profile is the entire illusion. A disc is a disc; a plate has a well, a rim that rises and
 * rolls over, an overhanging underside, and an unglazed foot ring that is the only part touching
 * the surface. That foot ring is also what casts the thin dark contact line telling the player the
 * plate is a solid object lying on something.
 */
function plateGeometry(diameterMm = 200) {
  const s = diameterMm / 200;
  return lathe(
    [
      [0, 4.5 * s],
      [55 * s, 4.0 * s],
      [75 * s, 6.2 * s],
      [88 * s, 13.0 * s],
      [97 * s, 17.2 * s],
      [100 * s, 17.6 * s],
      [100 * s, 14.4 * s],
      [95 * s, 10.0 * s],
      [68 * s, 5.2 * s],
      [50 * s, 3.2 * s],
      [47 * s, 0],
      [43 * s, 3.0 * s],
      [0, 3.4 * s],
    ],
    112,
  );
}

function plate(diameterMm = 200) {
  const g = new THREE.Group();
  g.add(mesh(plateGeometry(diameterMm), M.ceramicWhite()));
  // The foot ring is unglazed on real crockery — a rougher band stops the plate reading as one
  // uniform white blob and gives a stack visible separation lines.
  const s = diameterMm / 200;
  const foot = mesh(ring(43 * s, 50 * s, 3.2, 64), M.ceramicFoot());
  foot.position.y = mm(1.6);
  g.add(foot);
  return g;
}

/**
 * A leaning stack of washed plates — the most recognizable silhouette in the dish zone.
 * Deterministic jitter keeps it hand-stacked without changing between bakes.
 */
function plateStack() {
  const g = new THREE.Group();
  const rng = makeRng(0x51ac);
  const sizes = [200, 200, 185, 200, 170];
  let y = 0;
  sizes.forEach((d, i) => {
    const p = plate(d);
    p.position.y = mm(y);
    p.position.x = mm((rng() - 0.5) * 7);
    p.position.z = mm((rng() - 0.5) * 7);
    p.rotation.y = rng() * Math.PI * 2;
    p.rotation.z = (rng() - 0.5) * 0.035 * (i > 1 ? 1 : 0.3);
    g.add(p);
    y += 13.5;
  });
  return g;
}

/**
 * Korean sink basket strainer, 145 mm opening.
 *
 * Built from real solids with real gaps — concentric rings plus radial spokes over a dark well.
 * That is what a perforated strainer physically is, and it is why this reads as a drain instead of
 * the cross-hatched circle the old renderer drew. The well interior uses BackSide so the camera
 * tilt looks down into genuine darkness: the "under-sink darkness" the brief asks for.
 */
function sinkDrain() {
  const g = new THREE.Group();

  // Shallower than a real drain throat. At 52 mm the camera's 26° tilt could not see the far wall
  // at all and the aperture rendered as a flat black void; 30 mm keeps the sense of depth while
  // letting the environment reflection reach the inside face, which is what actually reads as
  // "there is a hole here" rather than "someone painted a black circle".
  const wellDepth = 30;
  const wellR = 72;

  // The drain is an INSET, not a free-standing object. Baked alone it read as a black disc floating
  // in nothing — a hole needs a surface to be a hole in. So the sprite carries its own patch of
  // brushed sink deck with a real circular aperture cut through it, which is also what gives the
  // flange something to sit proud of and the strainer somewhere to be recessed below.
  const deckHalf = 150;
  const deckShape = new THREE.Shape();
  deckShape.moveTo(-mm(deckHalf), -mm(deckHalf));
  deckShape.lineTo(mm(deckHalf), -mm(deckHalf));
  deckShape.lineTo(mm(deckHalf), mm(deckHalf));
  deckShape.lineTo(-mm(deckHalf), mm(deckHalf));
  deckShape.closePath();
  const aperture = new THREE.Path();
  aperture.absarc(0, 0, mm(wellR), 0, Math.PI * 2, true);
  deckShape.holes.push(aperture);
  const deckGeo = new THREE.ExtrudeGeometry(deckShape, {
    depth: mm(6),
    bevelEnabled: true,
    bevelThickness: mm(1.2),
    bevelSize: mm(1.2),
    bevelSegments: 2,
    curveSegments: 64,
  });
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.translate(0, mm(6), 0);
  g.add(mesh(deckGeo, M.steelBrushed()));
  const wellGeo = new THREE.CylinderGeometry(
    mm(wellR),
    mm(wellR * 0.86),
    mm(wellDepth),
    64,
    1,
    true,
  );
  wellGeo.translate(0, mm(-wellDepth / 2), 0);
  const well = new THREE.Mesh(
    wellGeo,
    // Lighter and glossier than instinct suggests: the first bake used a dark matte interior and
    // the whole drain went to featureless black. A real drain throat is wet steel that still
    // catches a rim of light, and that rim is what reads as depth.
    new THREE.MeshStandardMaterial({
      color: 0x59636d,
      metalness: 0.78,
      roughness: 0.34,
      side: THREE.BackSide,
    }),
  );
  well.receiveShadow = true;
  g.add(well);

  // The pipe below stays the darkest value in the sprite, but not pure black: an absolute-black
  // disc read as a printed dot rather than as distance, and the player needs to believe the colony
  // can get *into* this.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(mm(wellR * 0.86), 48),
    new THREE.MeshBasicMaterial({ color: 0x161d24 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = mm(-wellDepth);
  g.add(floor);

  // Polished flange sitting proud of the steel deck.
  g.add(mesh(ring(70, 82, 4, 80), M.steelPolished()));

  // The strainer basket: concentric rings plus radial spokes, sunk 10 mm below the deck.
  // Sits only 7 mm below the deck so the key light still reaches it. At the first attempt it was
  // recessed far enough to fall entirely into the well's shadow, which is why the strainer read as
  // concentric grooves in a record rather than as a perforated basket.
  const basket = new THREE.Group();
  basket.position.y = mm(-7);
  for (const r of [26, 44, 62]) {
    basket.add(mesh(ring(r - 2.6, r + 2.6, 3.2, 64), M.steelPolished()));
  }
  basket.add(
    radialArray(() => {
      const spoke = mesh(roundedBox(62, 3.2, 5.0, 1.2), M.steelPolished());
      spoke.position.x = mm(37);
      return spoke;
    }, 16),
  );
  const knob = mesh(dome(11, 0.75, 28), M.steelPolished());
  knob.position.y = mm(1.5);
  basket.add(knob);
  g.add(basket);

  return g;
}

/** Dish sponge: foam block with a bonded abrasive scour layer. Two materials, two roughnesses —
 *  this prop exists partly to prove material separation at gameplay scale. */
function sponge() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(96, 24, 62, 7), M.spongeFoam()));
  const scour = mesh(roundedBox(92, 9, 58, 5), M.spongeScour());
  scour.position.y = mm(23);
  g.add(scour);
  return g;
}

/** Dish detergent bottle with a pump — 230 mm tall, the tallest thing on the sink deck and a
 *  reliable landmark for the zone. */
/**
 * Dish detergent bottle with a pump — 230 mm tall.
 *
 * Seen from 26° off vertical a tall bottle foreshortens hard, so its silhouette alone cannot carry
 * it: the first bake was an unreadable teal blob. What makes it legible from above is horizontal
 * banding — a shoulder step, a contrasting label wrap and a dark collar — plus a pump head that
 * breaks the outline sideways. Heavy transmission was also removed; a full bottle of detergent is
 * near-opaque, and the translucency was flattening every internal edge.
 */
function detergentBottle() {
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe([
        [0, 0],
        [41, 0],
        [43, 5],
        [43, 92],
        [42, 120],
        [38, 146],
        [26, 166],
        [19, 178],
        [19, 196],
        [17, 200],
        [0, 200],
      ]),
      M.plasticGloss(0x2f8f86),
    ),
  );
  // Label wrap: the strongest above-view read on any bottle, because it is the one feature whose
  // full width stays visible when the body foreshortens.
  const label = mesh(cylinder(44.5, 54, 48), M.plasticMatte(0xe6ece8));
  label.position.y = mm(28);
  g.add(label);
  const labelBand = mesh(cylinder(45.0, 9, 48), M.plasticGloss(0x1f6f68));
  labelBand.position.y = mm(64);
  g.add(labelBand);

  const collar = mesh(cylinder(22, 15, 32), M.plasticMatte(0x24333d));
  collar.position.y = mm(198);
  g.add(collar);
  // Pump head, offset sideways so it breaks the circular top-down outline.
  const head = mesh(roundedBox(52, 17, 22, 7), M.plasticMatte(0x24333d));
  head.position.set(mm(13), mm(213), 0);
  g.add(head);
  const spout = mesh(cylinder(6.5, 13, 20), M.plasticMatte(0x1a262e));
  spout.position.set(mm(34), mm(202), 0);
  g.add(spout);
  return g;
}

/** A food crumb. Irregular by construction — a jittered low-poly solid, never a sphere, because a
 *  sphere at this scale is exactly the "circle" defect. */
function crumb(seed = 1, sizeMm = 5) {
  const geo = new THREE.IcosahedronGeometry(mm(sizeMm), 1);
  const rng = makeRng(seed);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const f = 0.62 + rng() * 0.76;
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.72, pos.getZ(i) * f);
  }
  geo.computeVertexNormals();
  geo.translate(0, mm(sizeMm * 0.45), 0);
  return mesh(geo, M.foodCrumb(seed % 2 ? 0xc9a463 : 0xa8763f));
}

/**
 * A water droplet holding surface tension.
 *
 * A bare dome baked to a flat grey disc twice, because a lone convex blob has no edge information.
 * What identifies water in a photograph is not its body but its boundary: a dark wetting ring where
 * the meniscus grips the surface, and a tight specular spark offset toward the key light. Both are
 * built explicitly here rather than hoped for from the shader.
 */
function droplet(sizeMm = 9) {
  const g = new THREE.Group();
  // Wetting ring: the darker damp halo where the droplet meets the surface.
  const wet = mesh(
    ring(sizeMm * 0.86, sizeMm * 1.22, 0.5, 40),
    new THREE.MeshStandardMaterial({
      color: 0x6f8494,
      roughness: 0.12,
      metalness: 0.0,
      transparent: true,
      opacity: 0.55,
    }),
  );
  wet.position.y = mm(0.15);
  g.add(wet);
  g.add(mesh(dome(sizeMm, 0.66, 40), M.water()));
  // A small high-gloss cap offset toward the key light gives the droplet its catchlight, which is
  // the single cue that separates "water" from "grey circle" at 30 px.
  const spark = mesh(
    dome(sizeMm * 0.34, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0xf2fbff, roughness: 0.02, metalness: 0.0 }),
  );
  spark.position.set(mm(-sizeMm * 0.3), mm(sizeMm * 0.42), mm(-sizeMm * 0.18));
  g.add(spark);
  return g;
}

/** A mug, 82 mm across the body with a 95 mm handle loop. Its handle is the whole silhouette —
 *  a handle-less cylinder from above is indistinguishable from a jar or a tin. */
function mug() {
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe([
        [0, 0],
        [38, 0],
        [41, 4],
        [41, 92],
        [38, 96],
        [35, 92],
        [35, 6],
        [0, 5],
      ]),
      M.ceramicWhite(),
    ),
  );
  // Handle: a torus arc standing out sideways, the one feature that survives a top-down view.
  const handle = mesh(
    new THREE.TorusGeometry(mm(26), mm(6), 12, 28, Math.PI * 1.25),
    M.ceramicWhite(),
  );
  handle.position.set(mm(56), mm(52), 0);
  handle.rotation.z = -Math.PI / 2.6;
  g.add(handle);
  return g;
}

/** A folded dish towel. Cloth is the softest silhouette in the kitchen and the only prop that
 *  should look slumped rather than machined. */
function dishTowel() {
  const g = new THREE.Group();
  const rng = makeRng(0x70e1);
  for (let i = 0; i < 3; i += 1) {
    const fold = mesh(
      roundedBox(240 - i * 14, 9, 150 - i * 10, 8),
      M.cloth(i % 2 ? 0x94a6b4 : 0xa6b6c2),
    );
    fold.position.set(mm((rng() - 0.5) * 12), mm(2 + i * 7), mm((rng() - 0.5) * 10));
    fold.rotation.y = (rng() - 0.5) * 0.16;
    g.add(fold);
  }
  return g;
}

/** A screw-top storage jar with visible contents — pantry identity object. */
function jar() {
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe([
        [0, 0],
        [44, 0],
        [46, 5],
        [46, 108],
        [40, 120],
        [30, 126],
        [30, 132],
        [0, 132],
      ]),
      M.plasticTranslucent(0xcfd8dc),
    ),
  );
  const lid = mesh(cylinder(33, 16, 40), M.plasticMatte(0x8a6b42));
  lid.position.y = mm(128);
  g.add(lid);
  // Grain fill, so the jar reads as full rather than as an empty vessel.
  const fill = mesh(cylinder(41, 62, 36), M.foodCrumb(0xd8bd83));
  fill.position.y = mm(6);
  g.add(fill);
  return g;
}

export const SINK_PROPS = {
  'plate-single': { build: () => plate(200) },
  'plate-stack': { build: plateStack },
  'sink-drain': { build: sinkDrain, shadow: false },
  sponge: { build: sponge },
  'detergent-bottle': { build: detergentBottle },
  'crumb-a': { build: () => crumb(1, 5.5) },
  'crumb-b': { build: () => crumb(7, 4.0) },
  'crumb-c': { build: () => crumb(13, 7.0) },
  'droplet-s': { build: () => droplet(6) },
  'droplet-m': { build: () => droplet(11) },
  mug: { build: mug },
  'dish-towel': { build: dishTowel },
  jar: { build: jar },
};

import * as THREE from 'three';
import * as M from '../lib/materials.mjs';
import { cylinder, dome, makeRng, mesh, roundedBox } from '../lib/shapes.mjs';
import { mm } from '../lib/units.mjs';

/**
 * Pantry, waste and floor identity objects.
 *
 * These cover the three zones that did not read in the first visual sweep. Each one is chosen
 * because it is a silhouette a Korean player recognises instantly from directly above — the test
 * is not "is it detailed" but "would you name it in half a second".
 */

/** A snack packet, part-crushed. Foil creases are the read: a flat rounded rectangle is a card,
 *  a creased one is packaging. */
function packet() {
  const g = new THREE.Group();
  const rng = makeRng(0x9a11);
  g.add(mesh(roundedBox(210, 34, 140, 14), M.filmPlastic(0xb9c4cc)));
  // Crease facets catching the key light at different angles.
  for (let i = 0; i < 7; i += 1) {
    const facet = mesh(roundedBox(28 + rng() * 60, 5, 16 + rng() * 40, 3), M.filmPlastic(0xd7e0e6));
    facet.position.set(mm((rng() - 0.5) * 150), mm(33), mm((rng() - 0.5) * 96));
    facet.rotation.y = rng() * Math.PI;
    g.add(facet);
  }
  // A sealed crimp along one edge — the single most packet-like feature there is.
  const crimp = mesh(roundedBox(210, 10, 20, 4), M.filmPlastic(0x92a0a9));
  crimp.position.set(0, mm(6), mm(-76));
  g.add(crimp);
  return g;
}

/**
 * A tied rubbish bag (종량제 봉투).
 *
 * The knot at the top is the whole silhouette — an untied bag from above is a puddle. Built as a
 * slumped body with a gathered neck and two ears, because that is what a tied bag actually is.
 */
function binBag() {
  const g = new THREE.Group();
  const body = new THREE.SphereGeometry(mm(150), 26, 18);
  body.scale(1, 0.72, 0.92);
  const m = mesh(body, M.filmPlastic(0xcfd6c8));
  m.position.y = mm(96);
  g.add(m);
  // Gathered neck.
  const neck = mesh(cylinder(34, 60, 24, 22), M.filmPlastic(0xc3cbbb));
  neck.position.y = mm(180);
  g.add(neck);
  // Two knot ears, splayed.
  for (const side of [-1, 1]) {
    const ear = new THREE.SphereGeometry(mm(46), 16, 12);
    ear.scale(1, 0.42, 0.66);
    const e = mesh(ear, M.filmPlastic(0xd8dfd0));
    e.position.set(mm(46 * side), mm(232), 0);
    e.rotation.z = side * 0.5;
    g.add(e);
  }
  return g;
}

/** A pet bowl — shallow, wide, with a rolled rim and a little kibble. Reads as "an animal lives
 *  here", which is a different and useful fact about the household. */
function petBowl() {
  const g = new THREE.Group();
  g.add(
    mesh(
      new THREE.LatheGeometry(
        [
          [0, 6],
          [62, 4],
          [76, 14],
          [84, 40],
          [90, 46],
          [90, 40],
          [84, 34],
          [76, 8],
          [66, 0],
          [0, 2],
        ].map(([r, h]) => new THREE.Vector2(Math.max(1e-4, mm(r)), mm(h))),
        84,
      ),
      M.plasticGloss(0x3f6f8a),
    ),
  );
  const rng = makeRng(0x4b0b);
  for (let i = 0; i < 9; i += 1) {
    const k = mesh(roundedBox(11 + rng() * 6, 7, 9 + rng() * 5, 3), M.foodCrumb(0x8a6034));
    k.position.set(mm((rng() - 0.5) * 90), mm(6), mm((rng() - 0.5) * 90));
    k.rotation.y = rng() * Math.PI;
    g.add(k);
  }
  return g;
}

/** Refrigerator condenser grille — horizontal fins with real gaps, the fridge's identity cue from
 *  behind and the classic warm-dark refuge for a colony. */
function condenserGrille() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(420, 16, 120, 3), M.laminate(0x141a20)));
  for (let i = 0; i < 9; i += 1) {
    const fin = mesh(roundedBox(400, 26, 7, 2), M.steelBrushed());
    fin.position.set(0, mm(14), mm(-52 + i * 13));
    g.add(fin);
  }
  return g;
}

/** A rubber slipper by the doorway — unmistakably domestic, and a landmark at insect scale. */
function slipper() {
  const g = new THREE.Group();
  const sole = new THREE.SphereGeometry(mm(120), 24, 16);
  sole.scale(0.46, 0.2, 1.0);
  const s = mesh(sole, M.plasticMatte(0x2f4f63));
  s.position.y = mm(14);
  g.add(s);
  // The strap arch — the feature that separates a slipper from a stone.
  const strap = mesh(
    new THREE.TorusGeometry(mm(46), mm(11), 12, 24, Math.PI),
    M.plasticMatte(0x24404f),
  );
  strap.position.set(0, mm(22), mm(-28));
  strap.rotation.y = Math.PI / 2;
  g.add(strap);
  return g;
}

export const PANTRY_PROPS = {
  packet: { build: packet },
  'bin-bag': { build: binBag },
  'pet-bowl': { build: petBowl },
  'condenser-grille': { build: condenserGrille },
  slipper: { build: slipper },
};

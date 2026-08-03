import * as THREE from 'three';
import { mm } from './units.mjs';

/**
 * Reusable geometry constructors.
 *
 * Every prop is modelled from real millimetre measurements, so these helpers all take mm and
 * convert once. Hand-tuning shapes in world units is how objects drift out of scale with each
 * other and the kitchen stops reading as one room.
 */

/**
 * Lathe a profile given as [radiusMm, heightMm] pairs.
 *
 * The workhorse for anything turned on an axis — plates, bowls, bottles, drain flanges, rice-cooker
 * bodies. A believable plate is entirely a matter of its profile: the well, the rim rise, the
 * overhang and the foot ring are what make it read as crockery instead of a disc.
 */
export function lathe(profileMm, segments = 96) {
  const pts = profileMm.map(([r, h]) => new THREE.Vector2(Math.max(1e-4, mm(r)), mm(h)));
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

/**
 * A box with rounded edges, built by extruding a rounded rectangle with a bevel. Real household
 * objects have no perfectly sharp edges; the bevel is what catches the key light and gives a sponge
 * or a container its readable silhouette highlight.
 */
export function roundedBox(wMm, hMm, dMm, radiusMm = 2) {
  const w = mm(wMm);
  const d = mm(dMm);
  const h = mm(hMm);
  const r = Math.min(mm(radiusMm), w / 2 - 1e-3, d / 2 - 1e-3);
  const bevel = Math.max(0, Math.min(r, h / 2 - 1e-3));

  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r);
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-3, h - bevel * 2),
    bevelEnabled: bevel > 1e-3,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });
  // Extrude builds along +Z; stand it up so +Y is height and the base sits on the ground plane.
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  g.computeVertexNormals();
  return g;
}

/** An upright cylinder whose base sits on the ground plane. */
export function cylinder(radiusMm, heightMm, segments = 48, topRadiusMm = null) {
  const h = mm(heightMm);
  const g = new THREE.CylinderGeometry(
    mm(topRadiusMm ?? radiusMm),
    mm(radiusMm),
    h,
    segments,
    1,
    false,
  );
  g.translate(0, h / 2, 0);
  return g;
}

/** A hemispherical dome — water droplets, knobs, domed lids. */
export function dome(radiusMm, squash = 0.6, segments = 32) {
  const r = mm(radiusMm);
  const g = new THREE.SphereGeometry(
    r,
    segments,
    Math.max(8, Math.round(segments / 2)),
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  g.scale(1, squash, 1);
  return g;
}

/** A thin ring lying flat — strainer rings, bottle collars, seals. */
export function ring(innerMm, outerMm, thicknessMm, segments = 72) {
  const mid = mm((innerMm + outerMm) / 2);
  const tube = mm((outerMm - innerMm) / 2);
  const g = new THREE.TorusGeometry(mid, tube, 10, segments);
  g.rotateX(-Math.PI / 2);
  g.scale(1, mm(thicknessMm) / (tube * 2), 1);
  return g;
}

/**
 * Arrange copies of a child around the Y axis.
 *
 * Used for strainer spokes and appliance vents. The gaps between the copies are the point: a
 * perforated surface has to be built from real solids with real gaps, or it flattens back into the
 * cross-hatched circle the current build draws.
 */
export function radialArray(makeChild, count, radiusMm = 0, startDeg = 0) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const a = ((startDeg + (360 / count) * i) * Math.PI) / 180;
    const child = makeChild(i, a);
    if (!child) continue;
    child.position.x += Math.cos(a) * mm(radiusMm);
    child.position.z += Math.sin(a) * mm(radiusMm);
    child.rotation.y -= a;
    group.add(child);
  }
  return group;
}

/** Mesh helper that turns shadows on by default — every prop must cast and receive. */
export function mesh(geometry, material) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Deterministic jitter.
 *
 * Clutter must look scattered but must not change between bakes, or every rebuild produces a
 * different kitchen and screenshots stop being comparable evidence.
 */
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

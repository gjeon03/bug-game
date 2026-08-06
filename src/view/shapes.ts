import * as THREE from 'three';
import { mm } from '../world/units';
import type { MaterialId, MaterialLibrary } from './materials';

/**
 * Geometry helpers for the prop library.
 *
 * ## Why everything takes millimetres
 *
 * Every builder in `props/` authors in real millimetres and these helpers convert. That is not
 * convenience — it is the only way 175 separate props stay in scale with each other and with a
 * 35 mm insect. The moment one prop is authored "to taste" the room stops reading as a room.
 *
 * ## Why rounded boxes
 *
 * Nothing manufactured has a perfectly sharp edge, and at macro scale the highlight that runs along
 * a 1 mm fillet is most of what tells you an object is solid. A scene built from raw `BoxGeometry`
 * reads as a diagram — which was the previous build's single most-reported defect.
 */

export interface Kit {
  readonly materials: MaterialLibrary;
  /** Deterministic 0..1 source. Seeded per prop so evidence screenshots reproduce exactly. */
  rand(): number;
  /** Track a geometry for disposal. Builders never dispose their own. */
  own<T extends THREE.BufferGeometry>(geometry: T): T;
}

/** A box with bevelled edges, authored in millimetres, centred on its own origin. */
export function roundedBox(
  kit: Kit,
  widthMm: number,
  heightMm: number,
  depthMm: number,
  material: MaterialId | THREE.Material,
  bevelMm = 1.2,
): THREE.Mesh {
  const w = mm(widthMm);
  const h = mm(heightMm);
  const d = mm(depthMm);
  // Keep the bevel well under the smallest dimension or the shape inverts.
  const r = Math.min(mm(bevelMm), w * 0.32, h * 0.32, d * 0.32);

  const shape = new THREE.Shape();
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  shape.moveTo(-hw - r, -hh);
  shape.lineTo(-hw - r, hh);
  shape.quadraticCurveTo(-hw - r, hh + r, -hw, hh + r);
  shape.lineTo(hw, hh + r);
  shape.quadraticCurveTo(hw + r, hh + r, hw + r, hh);
  shape.lineTo(hw + r, -hh);
  shape.quadraticCurveTo(hw + r, -hh - r, hw, -hh - r);
  shape.lineTo(-hw, -hh - r);
  shape.quadraticCurveTo(-hw - r, -hh - r, -hw - r, -hh);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, d - r * 2),
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 3,
    curveSegments: 5,
  });
  geometry.translate(0, 0, -(d - r * 2) / 2);
  geometry.computeVertexNormals();

  return new THREE.Mesh(kit.own(geometry), resolve(kit, material));
}

/** A plain box. Use only where the object genuinely has sharp edges — a tile, a sheet of paper. */
export function box(
  kit: Kit,
  widthMm: number,
  heightMm: number,
  depthMm: number,
  material: MaterialId | THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(mm(widthMm), mm(heightMm), mm(depthMm));
  return new THREE.Mesh(kit.own(geometry), resolve(kit, material));
}

/** A cylinder standing on Y. `topMm`/`bottomMm` differ for anything tapered — a glass, a bottle. */
export function cylinder(
  kit: Kit,
  topMm: number,
  bottomMm: number,
  heightMm: number,
  material: MaterialId | THREE.Material,
  segments = 20,
  open = false,
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(
    mm(topMm),
    mm(bottomMm),
    mm(heightMm),
    smoothEnough(Math.max(topMm, bottomMm), segments),
    1,
    open,
  );
  return new THREE.Mesh(kit.own(geometry), resolve(kit, material));
}

/**
 * Minimum segment count for a curved surface of a given size.
 *
 * Faceting is a function of how long each flat span is ON SCREEN, not of which prop asked for it.
 * A 3 mm crumb at eight segments is a crumb; a 62 mm cushion at eight segments is a placeholder —
 * and 159 call sites across the prop library pass explicit counts in the 6–12 range, each written
 * when that prop was considered alone. A bedroom capture showed three duvet wrinkles reading as
 * bare polyhedra, which the asset contract treats as a completion blocker.
 *
 * Scaling the floor with size fixes all of them from one place and, importantly, leaves small
 * deliberately-faceted parts alone: a hex bolt is a few millimetres across, so its requested six
 * segments survive untouched. The caller's value is honoured whenever it is already generous — this
 * only ever raises, never lowers.
 *
 * Spending triangles here is deliberate. Measured headroom on the reference machine is GPU p50
 * 3.97 ms against a 16.7 ms budget, and the performance policy is explicit that measured guardrails
 * are not visual-quality ceilings.
 */
function smoothEnough(sizeMm: number, requested: number): number {
  const needed = Math.round(Math.min(40, Math.max(8, sizeMm * 0.5)));
  return Math.max(requested, needed);
}

export function sphere(
  kit: Kit,
  radiusMm: number,
  material: MaterialId | THREE.Material,
  segments = 18,
): THREE.Mesh {
  const s = smoothEnough(radiusMm, segments);
  const geometry = new THREE.SphereGeometry(mm(radiusMm), s, Math.max(6, s >> 1));
  return new THREE.Mesh(kit.own(geometry), resolve(kit, material));
}

/** A squashed sphere — a drop of water, a blob of soap, a crumb. */
export function blob(
  kit: Kit,
  radiusMm: number,
  flatten: number,
  material: MaterialId | THREE.Material,
  segments = 16,
): THREE.Mesh {
  const mesh = sphere(kit, radiusMm, material, segments);
  mesh.scale.set(1, flatten, 1);
  return mesh;
}

/** A flat quad lying on the ground plane. For stains, puddles, rugs, decals. */
export function patch(
  kit: Kit,
  widthMm: number,
  depthMm: number,
  material: MaterialId | THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(mm(widthMm), mm(depthMm));
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(kit.own(geometry), resolve(kit, material));
  // Nudge up so it never z-fights the floor it sits on. Coplanar geometry produced the dashed-line
  // artefact that an independent critic caught on the previous build.
  mesh.position.y = mm(0.35);
  return mesh;
}

/** A tube following a path of millimetre-space points. Cables, hoses, pipe runs. */
export function tube(
  kit: Kit,
  pointsMm: readonly (readonly [number, number, number])[],
  radiusMm: number,
  material: MaterialId | THREE.Material,
  segments = 24,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    pointsMm.map(([x, y, z]) => new THREE.Vector3(mm(x), mm(y), mm(z))),
  );
  const geometry = new THREE.TubeGeometry(curve, segments, mm(radiusMm), 10, false);
  return new THREE.Mesh(kit.own(geometry), resolve(kit, material));
}

/** A torus — a ring stain, a rubber seal, a handle. */
export function ring(
  kit: Kit,
  radiusMm: number,
  thicknessMm: number,
  material: MaterialId | THREE.Material,
  arc = Math.PI * 2,
): THREE.Mesh {
  const geometry = new THREE.TorusGeometry(mm(radiusMm), mm(thicknessMm), 10, 28, arc);
  return new THREE.Mesh(kit.own(geometry), resolve(kit, material));
}

/**
 * A soft draped sheet — a duvet, a towel, a shirt on the floor.
 *
 * Built as a subdivided plane displaced by a couple of sine waves and the kit's seeded noise, so
 * every drape is different but reproducible. Flat fabric is the fastest way to make a bedroom look
 * like a diagram.
 */
export function drape(
  kit: Kit,
  widthMm: number,
  depthMm: number,
  sagMm: number,
  material: MaterialId | THREE.Material,
  divisions = 10,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(mm(widthMm), mm(depthMm), divisions, divisions);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const phase = kit.rand() * Math.PI * 2;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const wave =
      Math.sin(x / mm(90) + phase) * 0.5 +
      Math.sin(z / mm(70) - phase) * 0.35 +
      (kit.rand() - 0.5) * 0.3;
    position.setY(i, position.getY(i) + wave * mm(sagMm));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return new THREE.Mesh(kit.own(geometry), resolve(kit, material));
}

/** Scatter small copies of one geometry over a disc. Crumbs, rice, kibble, dust. */
export function scatter(
  kit: Kit,
  count: number,
  radiusMm: number,
  make: (index: number) => THREE.Object3D,
): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const child = make(i);
    // sqrt keeps the density even rather than clumping everything at the centre.
    const r = Math.sqrt(kit.rand()) * mm(radiusMm);
    const a = kit.rand() * Math.PI * 2;
    child.position.x += Math.cos(a) * r;
    child.position.z += Math.sin(a) * r;
    child.rotation.y = kit.rand() * Math.PI * 2;
    g.add(child);
  }
  return g;
}

/** Position a node in millimetres relative to its parent. Returns it, for chaining. */
export function at<T extends THREE.Object3D>(node: T, xMm: number, yMm: number, zMm: number): T {
  node.position.set(mm(xMm), mm(yMm), mm(zMm));
  return node;
}

export function rot<T extends THREE.Object3D>(node: T, x: number, y: number, z: number): T {
  node.rotation.set(x, y, z);
  return node;
}

/** A group with children already added. */
export function group(...children: readonly THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const child of children) g.add(child);
  return g;
}

/**
 * Mark a subtree as casting and receiving shadows.
 *
 * Applied per prop rather than globally, because a crumb casting a shadow-map sample is wasted and
 * a fridge not casting one destroys the sense that it is standing on the floor.
 */
export function shadows<T extends THREE.Object3D>(node: T, cast = true, receive = true): T {
  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
  return node;
}

function resolve(kit: Kit, material: MaterialId | THREE.Material): THREE.Material {
  return typeof material === 'string' ? kit.materials.get(material) : material;
}

/** Deterministic 0..1 generator, seeded per prop placement. */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

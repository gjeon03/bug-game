import * as THREE from 'three';
import * as M from '../lib/materials.mjs';
import { cylinder, makeRng, mesh } from '../lib/shapes.mjs';
import { mm } from '../lib/units.mjs';

/**
 * The colony's bodies.
 *
 * These are the emotional centre of the game and the most-criticised asset in the old build, where
 * a roach was a drawn oval with radiating lines. A cockroach is not an oval: it is a broad shield
 * (pronotum) hiding a small head, a pair of overlapping leathery wing covers over a flatter
 * abdomen, six legs of three distinct lengths held in a sprawled tripod, and two antennae longer
 * than the whole body. Every one of those parts is modelled here, because each is a silhouette cue
 * the player reads before they read anything else on screen.
 *
 * Species reference: Periplaneta-scale adult at 35 mm body length, matching the 26-unit scout.
 */

/** Canonical heading is -Z, i.e. "up" on screen. The runtime rotates the sprite from there. */
const FORWARD = -1;

/**
 * One leg: femur, tibia, tarsus. Real roach legs sprawl outward and downward, and the tibia angles
 * back under the body — that zigzag is what makes a leg read as a leg rather than a radiating line.
 */
function leg({ femurMm, tibiaMm, spreadDeg, pitchDeg, swingDeg }) {
  const g = new THREE.Group();
  const femur = mesh(cylinder(0.62, femurMm, 10, 0.5), M.chitinLimb());
  // Cylinders build upward from their base; lay the femur out along +X, then tilt it down and back.
  femur.rotation.z = -Math.PI / 2;
  const femurGroup = new THREE.Group();
  femurGroup.add(femur);
  femurGroup.rotation.y = ((spreadDeg + swingDeg) * Math.PI) / 180;
  femurGroup.rotation.z = (-pitchDeg * Math.PI) / 180;
  g.add(femurGroup);

  const knee = new THREE.Group();
  knee.position.x = mm(femurMm);
  const tibia = mesh(cylinder(0.5, tibiaMm, 10, 0.34), M.chitinLimb(0x5b3616));
  tibia.rotation.z = -Math.PI / 2;
  const tibiaGroup = new THREE.Group();
  tibiaGroup.add(tibia);
  // The tibia angles down to the floor and sweeps back — the classic sprawled crouch. Kept shallow
  // enough that the joint stays visible from above: the knee bend is what makes six lines read as
  // six legs rather than as a starburst.
  tibiaGroup.rotation.z = (-30 * Math.PI) / 180;
  tibiaGroup.rotation.y = (34 * Math.PI) / 180;
  knee.add(tibiaGroup);

  const tarsus = mesh(cylinder(0.34, 5.5, 8, 0.2), M.chitinLimb(0x462a11));
  tarsus.rotation.z = -Math.PI / 2;
  const tarsusGroup = new THREE.Group();
  tarsusGroup.position.x = mm(tibiaMm);
  tarsusGroup.rotation.z = (-72 * Math.PI) / 180;
  tarsusGroup.add(tarsus);
  tibiaGroup.add(tarsusGroup);

  femurGroup.add(knee);
  return g;
}

/**
 * An antenna: a long tapered filament sweeping forward and outward with a gentle curve.
 *
 * Antennae are the roach's most expressive feature and the brief names them explicitly. They are
 * built from short segments with accumulating rotation, so the curve is real geometry rather than
 * a straight line pretending to be one.
 */
function antenna({ side, lengthMm = 38, curl = 1, sweepDeg = 26 }) {
  const g = new THREE.Group();
  const segments = 14;
  const segLen = lengthMm / segments;
  let node = g;
  for (let i = 0; i < segments; i += 1) {
    const t = i / segments;
    const seg = new THREE.Group();
    if (i === 0) {
      seg.rotation.y = (side * sweepDeg * Math.PI) / 180;
      seg.rotation.z = (16 * Math.PI) / 180;
    } else {
      seg.position.z = mm(segLen) * FORWARD;
      seg.rotation.y = (side * 3.1 * curl * Math.PI) / 180;
      seg.rotation.x = (-1.5 * curl * Math.PI) / 180;
    }
    const r = 0.42 * (1 - t * 0.62);
    const piece = mesh(cylinder(r, segLen * 1.08, 6, r * 0.9), M.chitinLimb(0x4e2f13));
    piece.rotation.x = (Math.PI / 2) * -FORWARD;
    seg.add(piece);
    node.add(seg);
    node = seg;
  }
  return g;
}

/**
 * Assemble one roach.
 *
 * `gait` is the tripod phase in turns. Real roaches run an alternating tripod: front-left,
 * mid-right and hind-left swing together while the other three plant. Driving both triads from one
 * phase is what makes the walk read as locomotion instead of six independent twitches.
 */
/*
 * Exported so the live three.js runtime can build a roach at ANY gait phase.
 *
 * The bake pipeline only ever needed the four phases named in `ROACH_PROPS` because it was
 * flattening them into sprite frames. A 3D scene interpolates, so it wants the parametric builder
 * itself. `ROACH_PROPS` is unchanged — the bake tool is unaffected by this export.
 */
export function roach({
  bodyMm = 35,
  gait = 0,
  dead = false,
  carrying = null,
  palette = 'scout',
} = {}) {
  const g = new THREE.Group();
  const s = bodyMm / 35;
  const tone =
    palette === 'nymph'
      ? { shell: 0x6d4a24, dark: 0x3a2410 }
      : palette === 'workerPale'
        ? { shell: 0x9c6a34, dark: 0x5a3616 }
        : palette === 'workerDark'
          ? { shell: 0x6b3f18, dark: 0x331d09 }
          : { shell: 0x8a5524, dark: 0x4a2b11 };

  const swing = Math.sin(gait * Math.PI * 2) * (dead ? 0 : 15);
  const swingB = Math.sin((gait + 0.5) * Math.PI * 2) * (dead ? 0 : 15);

  // Abdomen: flat and distinctly longer than wide. The first pass was too round and read as a
  // beetle; a roach's body is a flattened blade, which is exactly what lets it live in a crack.
  const abdomenGeo = new THREE.SphereGeometry(mm(5.6 * s), 28, 20);
  abdomenGeo.scale(1.0, 0.3, 1.95);
  const abdomen = mesh(abdomenGeo, M.chitin(tone.shell));
  abdomen.position.set(0, mm(2.1 * s), mm(6.6 * s) * -FORWARD);
  g.add(abdomen);

  // Tegmina: two leathery wing covers overlapping down the midline. The seam between them is the
  // strongest single cue that this is a roach and not a beetle. They now sit clearly ABOVE the
  // abdomen and are pushed apart, because at the first bake they sank into the body and the seam —
  // the whole point — disappeared.
  for (const side of [-1, 1]) {
    const wingGeo = new THREE.SphereGeometry(mm(3.9 * s), 22, 16);
    wingGeo.scale(1.0, 0.24, 2.5);
    const wing = mesh(wingGeo, M.chitin(tone.shell));
    wing.position.set(mm(2.5 * s * side), mm(3.5 * s), mm(5.4 * s) * -FORWARD);
    wing.rotation.y = (side * 6 * Math.PI) / 180;
    wing.rotation.z = (-side * 11 * Math.PI) / 180;
    g.add(wing);
  }

  // Pronotum: the broad shield over the thorax that hides the head from above. Widened past the
  // abdomen so the body has the roach's characteristic front-heavy taper rather than a uniform egg.
  const pronotumGeo = new THREE.SphereGeometry(mm(7.4 * s), 26, 18);
  pronotumGeo.scale(1.0, 0.26, 0.78);
  const pronotum = mesh(pronotumGeo, M.chitinDark(tone.dark));
  pronotum.position.set(0, mm(2.7 * s), mm(6.6 * s) * FORWARD);
  g.add(pronotum);

  // Head, mostly tucked under the pronotum.
  const headGeo = new THREE.SphereGeometry(mm(3.3 * s), 20, 14);
  headGeo.scale(1.0, 0.62, 0.86);
  const head = mesh(headGeo, M.chitinDark(tone.dark));
  head.position.set(0, mm(2.3 * s), mm(11.2 * s) * FORWARD);
  g.add(head);

  const headMount = new THREE.Group();
  headMount.position.copy(head.position);
  g.add(headMount);
  headMount.add(antenna({ side: -1, lengthMm: 38 * s, curl: 1, sweepDeg: 24 }));
  headMount.add(antenna({ side: 1, lengthMm: 38 * s, curl: 1, sweepDeg: 24 }));

  // Three leg pairs, each with its own length and rest angle, on an alternating tripod.
  //
  // The first bake hid the legs entirely: they were short and pitched steeply downward, so from
  // above they vanished under the body and the roach read as a tick. Real roach legs are long and
  // sprawled — the tarsi plant well OUTSIDE the body outline, and that spiky silhouette is the
  // single most recognisable thing about the animal. Femurs are now longer than the body is wide
  // and the pitch is shallow, so the legs project sideways instead of tucking under.
  //
  // `spread` is a rotation about Y, and rotating +X by θ yields (cos θ, 0, −sin θ) — so POSITIVE
  // angles aim forward (−Z) and negative angles aim backward. The first attempt used 46/88/132,
  // which pointed all three pairs forward and swung the hind legs across the body's midline where
  // the abdomen hid them. Front splays forward, mid goes straight out, hind rakes backward.
  const legPlan = [
    { z: 7.6, femur: 10.5 * s, tibia: 9.5 * s, spread: 52, pitch: 8 },
    { z: 1.2, femur: 12.5 * s, tibia: 12.0 * s, spread: 6, pitch: 6 },
    { z: -5.0, femur: 15.0 * s, tibia: 16.0 * s, spread: -46, pitch: 5 },
  ];
  legPlan.forEach((plan, i) => {
    for (const side of [-1, 1]) {
      const tripodA = (i + (side < 0 ? 0 : 1)) % 2 === 0;
      const l = leg({
        femurMm: plan.femur,
        tibiaMm: plan.tibia,
        spreadDeg: side < 0 ? 180 - plan.spread : plan.spread,
        pitchDeg: dead ? -62 : plan.pitch,
        swingDeg: (tripodA ? swing : swingB) * side,
      });
      l.position.set(mm(2.0 * s * side), mm(2.3 * s), mm(plan.z * s) * FORWARD);
      g.add(l);
    }
  });

  // Cerci: the two short sensory appendages at the abdomen tip.
  for (const side of [-1, 1]) {
    const cercus = mesh(cylinder(0.5, 5.0 * s, 6, 0.2), M.chitinLimb(0x4e2f13));
    cercus.rotation.z = -Math.PI / 2;
    const cg = new THREE.Group();
    cg.add(cercus);
    cg.position.set(mm(1.6 * s * side), mm(2.2 * s), mm(13.4 * s) * -FORWARD);
    cg.rotation.y = ((side < 0 ? 200 : -20) * Math.PI) / 180;
    g.add(cg);
  }

  if (dead) {
    // On its back, as roaches die, with the legs curled upward.
    g.rotation.z = Math.PI * 0.94;
    g.position.y = mm(3.0 * s);
  }

  if (carrying) {
    // Cargo is GRIPPED, never floating. It sits forward, clamped low against the head and
    // mandibles, and it is a real irregular solid — a detached circle over a roach was one of the
    // named defects.
    const rng = makeRng(0x0a11);
    const cargoGeo = new THREE.IcosahedronGeometry(mm(carrying), 1);
    const pos = cargoGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const f = 0.66 + rng() * 0.7;
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.8, pos.getZ(i) * f);
    }
    cargoGeo.computeVertexNormals();
    const cargo = mesh(cargoGeo, M.foodCrumb(0xc9a463));
    cargo.position.set(0, mm(2.6 * s), mm((13.0 + carrying * 0.55) * s) * FORWARD);
    g.add(cargo);
  }

  return g;
}

export const ROACH_PROPS = {
  'scout-gait0': { build: () => roach({ bodyMm: 35, gait: 0 }) },
  'scout-gait1': { build: () => roach({ bodyMm: 35, gait: 0.25 }) },
  'scout-gait2': { build: () => roach({ bodyMm: 35, gait: 0.5 }) },
  'scout-gait3': { build: () => roach({ bodyMm: 35, gait: 0.75 }) },
  'worker-gait0': { build: () => roach({ bodyMm: 27, gait: 0, palette: 'workerDark' }) },
  'worker-carry': {
    build: () => roach({ bodyMm: 27, gait: 0.5, palette: 'workerPale', carrying: 5 }),
  },
  'nymph-gait0': { build: () => roach({ bodyMm: 17, gait: 0.15, palette: 'nymph' }) },
  'roach-dead': { build: () => roach({ bodyMm: 27, dead: true, palette: 'workerDark' }) },
};

import * as THREE from 'three';
import * as M from '../lib/materials.mjs';
import { cylinder, dome, makeRng, mesh, radialArray, ring, roundedBox } from '../lib/shapes.mjs';
import { mm } from '../lib/units.mjs';

/**
 * The remaining household objects.
 *
 * Deliberately excluded: `greaseSmear`, `scuffMark` and `baseboardGap`. Those are marks ON a
 * surface, not objects standing on one — a decal has no silhouette to model and no contact shadow
 * to bake, so the procedural path is the correct one for them rather than a gap in this file.
 */

/** Stove burner: cast-iron trivet arms over a recessed gas ring. The arms are what make it a hob
 *  rather than a circle, and they are also the shadow the colony hides in. */
function burner() {
  const g = new THREE.Group();
  g.add(mesh(cylinder(112, 6, 56), M.laminate(0x1a2028)));
  const bowl = mesh(
    new THREE.LatheGeometry(
      [
        [0, 26],
        [40, 14],
        [62, 8],
        [78, 16],
        [78, 20],
        [0, 30],
      ].map(([r, h]) => new THREE.Vector2(Math.max(1e-4, mm(r)), mm(h))),
      48,
    ),
    M.steelBrushed(),
  );
  g.add(bowl);
  g.add(
    radialArray(
      () => {
        const arm = mesh(roundedBox(96, 16, 22, 6), M.laminate(0x14181d));
        arm.position.set(mm(56), mm(30), 0);
        return arm;
      },
      4,
      0,
      45,
    ),
  );
  const cap = mesh(cylinder(30, 18, 32), M.laminate(0x0f1317));
  cap.position.y = mm(20);
  g.add(cap);
  return g;
}

/** Oven vent: a louvred slot. Real gaps between real fins, same reasoning as the drain strainer. */
function ovenVent() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(300, 10, 64, 3), M.laminate(0x11161b)));
  for (let i = 0; i < 5; i += 1) {
    const fin = mesh(roundedBox(288, 14, 6, 2), M.steelBrushed());
    fin.position.set(0, mm(9), mm(-22 + i * 11));
    fin.rotation.x = 0.4;
    g.add(fin);
  }
  return g;
}

/** A pan handle jutting off the hob — the strongest "someone cooked here" cue in the room. */
function panHandle() {
  const g = new THREE.Group();
  const shaft = mesh(cylinder(13, 190, 20), M.laminate(0x15191e));
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(0, mm(52), 0);
  g.add(shaft);
  const collar = mesh(cylinder(19, 26, 20), M.steelBrushed());
  collar.rotation.z = Math.PI / 2;
  collar.position.set(mm(96), mm(52), 0);
  g.add(collar);
  const rim = mesh(ring(96, 108, 12, 48), M.steelBrushed());
  rim.position.set(mm(200), mm(46), 0);
  g.add(rim);
  return g;
}

/** The U-bend under the sink: chrome pipe with the dark gap behind it a roach can live in. */
function pipeElbow() {
  const g = new THREE.Group();
  const down = mesh(cylinder(30, 150, 28), M.steelPolished());
  down.position.set(0, mm(60), 0);
  g.add(down);
  const bend = mesh(new THREE.TorusGeometry(mm(52), mm(30), 16, 28, Math.PI), M.steelPolished());
  bend.position.set(mm(52), mm(60), 0);
  bend.rotation.x = Math.PI / 2;
  bend.rotation.z = Math.PI;
  g.add(bend);
  const out = mesh(cylinder(30, 130, 28), M.steelPolished());
  out.rotation.z = Math.PI / 2;
  out.position.set(mm(104), mm(60), 0);
  g.add(out);
  for (const y of [46, 150]) {
    const collar = mesh(ring(30, 40, 16, 32), M.steelBrushed());
    collar.position.y = mm(y);
    g.add(collar);
  }
  return g;
}

/** Wall socket with a plug and the cable running out of it. */
function outlet() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(120, 14, 78, 8), M.plasticMatte(0xd6dce0)));
  for (const dx of [-20, 20]) {
    const slot = mesh(roundedBox(10, 6, 30, 2), M.laminate(0x0d1116));
    slot.position.set(mm(dx), mm(14), 0);
    g.add(slot);
  }
  const led = mesh(dome(6, 0.6, 16), M.plasticGloss(0x66e0ff));
  led.position.set(0, mm(14), mm(24));
  g.add(led);
  return g;
}

/** Fridge door gasket: the ribbed rubber seam. A warm, damp, permanently dark corridor. */
function fridgeGasket() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(46, 12, 420, 4), M.plasticMatte(0x1b2026)));
  for (let i = 0; i < 11; i += 1) {
    const rib = mesh(roundedBox(34, 16, 12, 4), M.plasticMatte(0x2a3138));
    rib.position.set(0, mm(10), mm(-190 + i * 38));
    g.add(rib);
  }
  return g;
}

/** Bin castor wheel. */
function binWheel() {
  const g = new THREE.Group();
  const tyre = mesh(new THREE.TorusGeometry(mm(34), mm(13), 12, 28), M.plasticMatte(0x15191d));
  tyre.rotation.y = Math.PI / 2;
  tyre.position.y = mm(34);
  g.add(tyre);
  const hub = mesh(cylinder(14, 22, 20), M.steelBrushed());
  hub.rotation.z = Math.PI / 2;
  hub.position.set(mm(-11), mm(34), 0);
  g.add(hub);
  const fork = mesh(roundedBox(18, 46, 40, 5), M.plasticMatte(0x232a31));
  fork.position.y = mm(46);
  g.add(fork);
  return g;
}

/** Floor vent grille — a colony highway, and the reason a room has airflow. */
function vent() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(200, 8, 108, 4), M.laminate(0x141a20)));
  for (let i = 0; i < 6; i += 1) {
    const slat = mesh(roundedBox(188, 10, 8, 2), M.steelBrushed());
    slat.position.set(0, mm(8), mm(-42 + i * 17));
    g.add(slat);
  }
  return g;
}

/** Pet mat: a soft rubber rectangle, the only thing on the floor with give. */
function petMat() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(340, 9, 240, 22), M.plasticMatte(0x35505e)));
  const inner = mesh(roundedBox(300, 4, 200, 18), M.plasticMatte(0x2a4351));
  inner.position.y = mm(8);
  g.add(inner);
  return g;
}

/** Scattered kibble. */
function kibble() {
  const g = new THREE.Group();
  const rng = makeRng(0x1b17);
  for (let i = 0; i < 7; i += 1) {
    const k = mesh(roundedBox(13 + rng() * 5, 8, 11 + rng() * 4, 4), M.foodCrumb(0x7d5528));
    k.position.set(mm((rng() - 0.5) * 110), 0, mm((rng() - 0.5) * 90));
    k.rotation.y = rng() * Math.PI;
    g.add(k);
  }
  return g;
}

/** A coiled appliance cable. */
function cableCoil() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const loop = mesh(
      new THREE.TorusGeometry(mm(52 - i * 11), mm(7), 10, 34),
      M.plasticMatte(0x14181d),
    );
    loop.rotation.x = -Math.PI / 2;
    loop.position.y = mm(7 + i * 5);
    loop.rotation.z = i * 0.5;
    g.add(loop);
  }
  return g;
}

/** Broom head: bristle block with a stub of handle. */
function broomHead() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(260, 26, 70, 8), M.plasticMatte(0x2f4150)));
  const rng = makeRng(0x8b00);
  for (let i = 0; i < 26; i += 1) {
    const b = mesh(roundedBox(5, 34, 5, 2), M.cloth(0x6d5a3a));
    b.position.set(mm(-120 + i * 9.5), mm(-14), mm((rng() - 0.5) * 44));
    b.rotation.x = (rng() - 0.5) * 0.3;
    g.add(b);
  }
  const stub = mesh(cylinder(15, 150, 18), M.laminate(0x7a6a52));
  stub.position.set(0, mm(24), 0);
  stub.rotation.z = 0.5;
  g.add(stub);
  return g;
}

/** A dropped sock. Soft, slumped, unmistakably domestic. */
function sock() {
  const g = new THREE.Group();
  const body = new THREE.SphereGeometry(mm(64), 20, 14);
  body.scale(1.0, 0.36, 1.7);
  const s = mesh(body, M.cloth(0xb9c2cb));
  s.position.y = mm(22);
  g.add(s);
  const cuff = mesh(cylinder(52, 26, 26), M.cloth(0xa2acb6));
  cuff.position.set(mm(20), mm(14), mm(-96));
  cuff.rotation.x = 1.3;
  g.add(cuff);
  return g;
}

export const FIXTURE_PROPS = {
  burner: { build: burner },
  'oven-vent': { build: ovenVent },
  'pan-handle': { build: panHandle },
  'pipe-elbow': { build: pipeElbow },
  outlet: { build: outlet },
  'fridge-gasket': { build: fridgeGasket },
  'bin-wheel': { build: binWheel },
  vent: { build: vent },
  'pet-mat': { build: petMat },
  kibble: { build: kibble },
  'cable-coil': { build: cableCoil },
  'broom-head': { build: broomHead },
  sock: { build: sock },
};

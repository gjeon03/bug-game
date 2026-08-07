import * as THREE from 'three';
import { SWAT_DURATION, SWAT_FALL } from '../colony/household';
import { mm } from '../world/units';
import type { Run, Threat } from '../colony/types';

/**
 * Drawing the household's responses.
 *
 * ## Why this file has to exist
 *
 * An independent critic grepped for `run.threats` across the codebase and found exactly one read
 * outside the simulation — the audio bridge. Every threat had a telegraph phase, a decision window
 * and a radius, and none of it was ever on screen. A hazard the player cannot see is not a
 * telegraph; it is an ambush with a sound cue.
 *
 * ## Telegraph and impact are different shapes, on purpose
 *
 * During `telegraph` the marker is a thin expanding ring that grows toward the real radius: it says
 * *something is coming here, and this is how big it will be*, and it cannot hurt anything. When it
 * goes `active` the ring snaps to full size, fills, and the kind-specific body drops in. The change
 * between the two states is deliberately abrupt — that instant is the end of the decision window.
 */

/** How many threats can be on screen at once. The director never runs more than one per region. */
const POOL = 6;

const COLOUR: Readonly<Record<string, number>> = {
  footsteps: 0xd8b26a,
  light: 0xf0e2b0,
  wipe: 0x8fb4d0,
  move: 0xc0a080,
  trap: 0xd08050,
  vacuum: 0xe0a45c,
  spray: 0xd2585a,
  sleeper: 0xa0a8c0,
  swat: 0xe4614e,
};

interface Slot {
  readonly root: THREE.Group;
  readonly ring: THREE.Mesh;
  readonly ringMaterial: THREE.MeshBasicMaterial;
  readonly fill: THREE.Mesh;
  readonly fillMaterial: THREE.MeshBasicMaterial;
  readonly bodies: Map<string, THREE.Object3D>;
  active: string;
}

export interface ThreatView {
  readonly group: THREE.Group;
  update(run: Run, dt: number): void;
  reset(): void;
  dispose(): void;
}

export function createThreatView(): ThreatView {
  const group = new THREE.Group();
  group.name = 'threats';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const own = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // One unit-radius ring and disc, scaled per threat — a threat's radius is data, not geometry.
  const ringGeometry = own(new THREE.RingGeometry(0.86, 1, 40));
  ringGeometry.rotateX(-Math.PI / 2);
  const discGeometry = own(new THREE.CircleGeometry(1, 40));
  discGeometry.rotateX(-Math.PI / 2);

  const slots: Slot[] = [];
  for (let i = 0; i < POOL; i++) {
    const root = new THREE.Group();
    root.visible = false;

    const ringMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const fillMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    materials.push(ringMaterial, fillMaterial);

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = mm(2);
    ring.renderOrder = 3;
    const fill = new THREE.Mesh(discGeometry, fillMaterial);
    fill.position.y = mm(1.5);
    fill.renderOrder = 2;

    root.add(ring, fill);
    group.add(root);
    slots.push({ root, ring, ringMaterial, fill, fillMaterial, bodies: new Map(), active: '' });
  }

  /** The physical thing making the threat, built once per (slot, kind) and then reused. */
  const bodyFor = (slot: Slot, kind: string): THREE.Object3D => {
    const existing = slot.bodies.get(kind);
    if (existing) return existing;
    const body = buildBody(kind, own, materials);
    /*
     * Threat bodies cast shadows.
     *
     * They did not, and the hand in particular read as pasted onto the frame rather than arriving
     * in it — no contact shadow means no contact, which at 35 mm scale is the only cue that says
     * how far above the floor the thing currently is. It receives too, so the descending hand darkens
     * as it enters the cabinet's own shadow.
     */
    body.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    body.visible = false;
    slot.root.add(body);
    slot.bodies.set(kind, body);
    return body;
  };

  let time = 0;

  return {
    group,

    update(run, dt) {
      time += dt;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]!;
        const threat = run.threats[i];
        if (!threat) {
          slot.root.visible = false;
          continue;
        }
        draw(slot, threat, run, time, bodyFor);
      }
    },

    reset() {
      time = 0;
      for (const slot of slots) slot.root.visible = false;
    },

    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      geometries.length = 0;
      materials.length = 0;
      group.clear();
      slots.length = 0;
    },
  };
}

function draw(
  slot: Slot,
  threat: Threat,
  run: Run,
  time: number,
  bodyFor: (slot: Slot, kind: string) => THREE.Object3D,
): void {
  const y = run.house.surfaces.get(threat.surface)?.y ?? 0;
  slot.root.position.set(threat.x, y, threat.z);
  slot.root.visible = true;

  const colour = COLOUR[threat.kind] ?? 0xd2585a;
  const telegraphing = threat.phase === 'telegraph';

  // During the telegraph the ring grows toward the real radius, so its size IS the warning.
  const grow = telegraphing ? 0.35 + 0.65 * (1 - Math.min(1, threat.timer / 6)) : 1;
  const radius = threat.radius * grow;
  slot.ring.scale.set(radius, 1, radius);
  slot.fill.scale.set(radius, 1, radius);

  const pulse = 0.55 + 0.45 * Math.sin(time * (telegraphing ? 4.4 : 9));
  slot.ringMaterial.color.setHex(colour);
  slot.ringMaterial.opacity = telegraphing ? 0.35 + 0.4 * pulse : 0.85;
  slot.fillMaterial.color.setHex(colour);
  slot.fillMaterial.opacity = telegraphing ? 0.04 : 0.16 + 0.08 * pulse;

  for (const [kind, body] of slot.bodies) body.visible = kind === threat.kind && !telegraphing;
  if (!telegraphing) {
    const body = bodyFor(slot, threat.kind);
    body.visible = true;
    if (slot.active !== threat.kind) slot.active = threat.kind;
    // A vacuum crosses the floor; everything else arrives and stays.
    if (threat.kind === 'vacuum') body.rotation.y = time * 2.4;
    /*
     * The hand actually falls.
     *
     * Every other body in this file appears at ground level the instant its threat goes active,
     * which is fine for a cloth being dragged or a trap being set down — those are slow, and the
     * ring already carried the warning. A swat is neither. It is the one response aimed at the
     * player personally and it resolves in under two seconds, so the impact has to be a visible
     * event or the death reads as the game deciding rather than the household reacting.
     *
     * Squared falloff, so the hand is still high for most of the fall and then arrives fast — the
     * shape of something accelerating, rather than something being lerped.
     */
    if (threat.kind === 'swat') {
      const fallen = Math.min(1, Math.max(0, (SWAT_DURATION - threat.timer) / SWAT_FALL));
      body.position.y = mm(620) * (1 - fallen) ** 2;
    }
  }
}

/**
 * A minimal but readable body per response family.
 *
 * These are silhouettes, not models: at insect scale you read a sole, a cloth, a pad and a nozzle by
 * their outline long before any detail resolves, and every one of them has to be identifiable in the
 * quarter-second between the ring filling and the damage landing.
 */
function buildBody(
  kind: string,
  own: <T extends THREE.BufferGeometry>(g: T) => T,
  materials: THREE.Material[],
): THREE.Object3D {
  const g = new THREE.Group();
  const mat = (colour: number, rough = 0.8): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color: colour, roughness: rough, metalness: 0.05 });
    materials.push(m);
    return m;
  };

  if (kind === 'footsteps') {
    // The underside of a slipper, coming down.
    const sole = new THREE.Mesh(
      own(new THREE.BoxGeometry(mm(105), mm(22), mm(268))),
      mat(0x2c2e30, 0.95),
    );
    sole.position.y = mm(70);
    const toe = new THREE.Mesh(own(new THREE.SphereGeometry(mm(52), 10, 6)), mat(0x35383b, 0.95));
    toe.scale.set(1, 0.32, 1.25);
    toe.position.set(0, mm(70), mm(-118));
    g.add(sole, toe);
  } else if (kind === 'wipe') {
    const cloth = new THREE.Mesh(
      own(new THREE.BoxGeometry(mm(220), mm(16), mm(180))),
      mat(0x8fb4d0, 0.97),
    );
    cloth.position.y = mm(30);
    g.add(cloth);
  } else if (kind === 'trap') {
    // A sticky pad: card base, glossy adhesive face.
    const card = new THREE.Mesh(
      own(new THREE.BoxGeometry(mm(150), mm(6), mm(210))),
      mat(0xd6cfc0, 0.9),
    );
    card.position.y = mm(3);
    const glue = new THREE.Mesh(
      own(new THREE.BoxGeometry(mm(128), mm(3), mm(188))),
      mat(0xc8a35a, 0.18),
    );
    glue.position.y = mm(7);
    g.add(card, glue);
  } else if (kind === 'vacuum') {
    const shell = new THREE.Mesh(
      own(new THREE.CylinderGeometry(mm(165), mm(165), mm(86), 20)),
      mat(0x25272b, 0.4),
    );
    shell.position.y = mm(43);
    const bumper = new THREE.Mesh(
      own(new THREE.TorusGeometry(mm(166), mm(9), 6, 24)),
      mat(0x15171a, 0.6),
    );
    bumper.rotation.x = Math.PI / 2;
    bumper.position.y = mm(18);
    const eye = new THREE.Mesh(
      own(new THREE.CylinderGeometry(mm(26), mm(26), mm(14), 12)),
      mat(0x8fb4d0, 0.2),
    );
    eye.position.set(0, mm(90), 0);
    g.add(shell, bumper, eye);
  } else if (kind === 'spray') {
    const can = new THREE.Mesh(
      own(new THREE.CylinderGeometry(mm(32), mm(32), mm(150), 14)),
      mat(0xb04a3c, 0.35),
    );
    can.position.y = mm(100);
    const nozzle = new THREE.Mesh(
      own(new THREE.CylinderGeometry(mm(11), mm(14), mm(26), 10)),
      mat(0x25272b, 0.5),
    );
    nozzle.position.y = mm(188);
    // The cone of droplets is the part that matters: it is the shape of the damage.
    const cone = new THREE.Mesh(
      own(new THREE.ConeGeometry(mm(190), mm(260), 16, 1, true)),
      mat(0xd2585a, 0.9),
    );
    cone.position.y = mm(60);
    cone.rotation.x = Math.PI;
    g.add(can, nozzle, cone);
  } else if (kind === 'swat') {
    /*
     * An open hand, palm down, authored at life size.
     *
     * The proportions are a real adult hand in millimetres — 92 mm across the palm, fingers 60–82 mm
     * — and that is the entire point of the prop. The scout is 35 mm long. Nothing else in the
     * kitchen states the size difference this plainly, because everything else in the kitchen is
     * furniture, and furniture is big for reasons that have nothing to do with the player. A hand
     * is big *relative to the thing it is coming down on*.
     *
     * Seen from the game's camera this is the back of the hand, so the knuckle line is the read.
     */
    /*
     * Skin, not white plastic.
     *
     * The first version used 0xd9a488 at roughness 0.72 and photographed as an untextured white
     * box — an art review called it exactly that. Two things were wrong: the value was far too
     * light for a hand seen against pale kitchen wood under a warm spill, and skin at 0.72 is
     * glossy enough to blow out under a direct source. Real skin is a mid-tone, and it is matte.
     */
    const skin = mat(0xa86f52, 0.94);
    const palm = new THREE.Mesh(own(new THREE.BoxGeometry(mm(92), mm(26), mm(104))), skin);
    palm.position.set(0, mm(13), mm(18));

    const knuckles = new THREE.Mesh(own(new THREE.SphereGeometry(mm(46), 14, 10)), skin);
    knuckles.scale.set(1, 0.3, 0.42);
    knuckles.position.set(0, mm(24), mm(-32));

    /*
     * A wrist and a forearm running out of frame.
     *
     * Without them the hand is an object; with them it is a PERSON, and §3 asks that approaching
     * danger stays readable. It also fixes the scale read: a disembodied palm could be any size,
     * while a forearm leaving the top of the shot says how far away the rest of the body is.
     */
    const wrist = new THREE.Mesh(own(new THREE.CylinderGeometry(mm(30), mm(34), mm(90), 12)), skin);
    wrist.rotation.x = Math.PI / 2 - 0.22;
    wrist.position.set(0, mm(34), mm(112));

    const forearm = new THREE.Mesh(
      own(new THREE.CylinderGeometry(mm(34), mm(52), mm(520), 14)),
      skin,
    );
    forearm.rotation.x = Math.PI / 2 - 0.42;
    forearm.position.set(0, mm(150), mm(360));

    g.add(palm, knuckles, wrist, forearm);

    // Index, middle, ring, little — splayed slightly, because a hand mid-swat is not a paddle.
    const FINGERS: readonly (readonly [number, number, number])[] = [
      [-33, 78, -0.16],
      [-11, 82, -0.05],
      [11, 76, 0.05],
      [31, 60, 0.17],
    ];
    for (const [x, length, splay] of FINGERS) {
      const finger = new THREE.Mesh(own(new THREE.BoxGeometry(mm(19), mm(21), mm(length))), skin);
      finger.position.set(mm(x), mm(12), mm(-34 - length / 2));
      finger.rotation.y = splay;
      g.add(finger);
    }

    const thumb = new THREE.Mesh(own(new THREE.BoxGeometry(mm(25), mm(23), mm(62))), skin);
    thumb.position.set(mm(-56), mm(12), mm(14));
    thumb.rotation.y = 0.62;
    g.add(thumb);
  } else if (kind === 'move') {
    const foot = new THREE.Mesh(
      own(new THREE.BoxGeometry(mm(120), mm(120), mm(120))),
      mat(0x5b4a38, 0.85),
    );
    foot.position.y = mm(60);
    g.add(foot);
  } else {
    // 'light' and 'sleeper': nothing physical arrives, the ring is the whole event.
    const glow = new THREE.Mesh(own(new THREE.SphereGeometry(mm(60), 10, 8)), mat(0xf0e2b0, 0.1));
    glow.position.y = mm(120);
    g.add(glow);
  }

  return g;
}

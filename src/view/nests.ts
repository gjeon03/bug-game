import * as THREE from 'three';
import { mm } from '../world/units';
import type { House } from '../world/house';
import type { Run } from '../colony/types';

/**
 * What a refuge looks like.
 *
 * ## Why this file exists
 *
 * `grep -rn "footholds" src/view/` returned nothing. Four refuges are the entire victory condition,
 * the objective panel spends the whole run saying 남은 거점을 차지해 — take the remaining refuges —
 * and not one of them was drawn. A reviewer put it plainly: the game asks you to claim things it
 * never draws. The only feedback that a refuge existed at all was the contextual prompt, and `REACH`
 * is 150 mm, so it appeared once you were already standing on it.
 *
 * It is also the whole of §10's "growth changes capability AND world presentation". Population is a
 * number in the corner; a colony that has taken four refuges should look different from one that has
 * taken one, in the room, without a label.
 *
 * ## Three states, three readings
 *
 * - **Unclaimed** — a crack with nothing in it. Dust and a strand of web: enough to say "something
 *   could live here", not enough to say "something does".
 * - **Claimed** — egg cases, frass, and a stain spreading from the mouth. A cockroach refuge is
 *   recognisable by its filth, and filth accumulates, so this is also the growth channel.
 * - **Damaged** — the egg cases scattered and broken, the stain scuffed through. Damage is
 *   recoverable now, so it has to read as "wrecked", not "gone".
 *
 * All three are built once and toggled. That keeps this off the per-frame allocation path and makes
 * restart free: nothing here is rebuilt, it is re-shown.
 */

export interface NestView {
  readonly group: THREE.Group;
  /** Read foothold state and re-show. Cheap enough to call every frame. */
  update(run: Run): void;
  reset(run: Run): void;
  dispose(): void;
}

/** Colours are authored against the night palette: nothing here is saturated. */
const EGG = 0x6b5642;
const FRASS = 0x33291f;
const STAIN = 0x3f3a33;
const WEB = 0x8a8f8c;

interface Site {
  readonly empty: THREE.Group;
  readonly held: THREE.Group;
  readonly wrecked: THREE.Group;
}

/**
 * A deterministic 0..1 source seeded per site.
 *
 * Local rather than shared so a refuge's clutter is identical every run and evidence screenshots
 * still compare — the same reason `shapes.ts` seeds per prop.
 */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function createNestView(house: House): NestView {
  const group = new THREE.Group();
  group.name = 'nests';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const sites = new Map<string, Site>();

  const own = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const mat = (colour: number, roughness: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0 });
    materials.push(m);
    return m;
  };

  const eggMaterial = mat(EGG, 0.62);
  const frassMaterial = mat(FRASS, 0.95);
  const stainMaterial = mat(STAIN, 0.98);
  const webMaterial = mat(WEB, 0.9);

  let index = 0;
  for (const site of house.footholds.values()) {
    const y = house.surfaces.get(site.surface)?.y ?? 0;
    const rand = seeded(0x9e37 + index * 7919);
    index++;

    const root = new THREE.Group();
    root.position.set(site.at.x, y, site.at.z);

    /* ---- unclaimed: dust and a few strands of web ---- */
    const empty = new THREE.Group();
    const dust = new THREE.Mesh(own(new THREE.CircleGeometry(mm(60), 14)), stainMaterial);
    dust.rotation.x = -Math.PI / 2;
    dust.position.y = mm(0.4);
    empty.add(dust);
    for (let i = 0; i < 3; i++) {
      const strand = new THREE.Mesh(
        own(new THREE.CylinderGeometry(mm(0.7), mm(0.7), mm(40 + rand() * 30), 4)),
        webMaterial,
      );
      strand.rotation.z = Math.PI / 2;
      strand.rotation.y = rand() * Math.PI;
      strand.position.set((rand() - 0.5) * mm(50), mm(6 + rand() * 10), (rand() - 0.5) * mm(50));
      empty.add(strand);
    }

    /* ---- claimed: a clutch of egg cases, frass, and a spreading stain ---- */
    const held = new THREE.Group();
    const stain = new THREE.Mesh(own(new THREE.CircleGeometry(mm(140), 20)), stainMaterial);
    stain.rotation.x = -Math.PI / 2;
    stain.position.y = mm(0.5);
    held.add(stain);

    /*
     * Ootheca — the purse-shaped egg case, about 8 mm long. Six in a loose cluster is what a real
     * refuge looks like, and it is the one prop in this game that says "this colony reproduces"
     * without a number.
     */
    for (let i = 0; i < 6; i++) {
      const ootheca = new THREE.Mesh(
        own(new THREE.CapsuleGeometry(mm(2.6), mm(5), 4, 8)),
        eggMaterial,
      );
      ootheca.scale.set(1, 1, 0.55);
      ootheca.rotation.z = Math.PI / 2;
      ootheca.rotation.y = rand() * Math.PI;
      ootheca.position.set((rand() - 0.5) * mm(90), mm(3), (rand() - 0.5) * mm(90));
      held.add(ootheca);
    }
    // Frass: coarse dark specks, denser toward the mouth of the crack.
    for (let i = 0; i < 14; i++) {
      const speck = new THREE.Mesh(own(new THREE.SphereGeometry(mm(1.1), 5, 4)), frassMaterial);
      const r = Math.sqrt(rand()) * mm(120);
      const a = rand() * Math.PI * 2;
      speck.position.set(Math.cos(a) * r, mm(1), Math.sin(a) * r);
      held.add(speck);
    }

    /* ---- damaged: the same clutch, broken and thrown wider ---- */
    const wrecked = new THREE.Group();
    const scuff = new THREE.Mesh(own(new THREE.CircleGeometry(mm(150), 20)), stainMaterial);
    scuff.rotation.x = -Math.PI / 2;
    scuff.position.y = mm(0.5);
    wrecked.add(scuff);
    for (let i = 0; i < 5; i++) {
      const shard = new THREE.Mesh(
        own(new THREE.CapsuleGeometry(mm(2.2), mm(2.4), 3, 6)),
        eggMaterial,
      );
      shard.rotation.set(rand() * 0.8, rand() * Math.PI, Math.PI / 2 + (rand() - 0.5) * 0.9);
      // Thrown further than the intact clutch — something swept through here.
      shard.position.set((rand() - 0.5) * mm(230), mm(2), (rand() - 0.5) * mm(230));
      wrecked.add(shard);
    }

    for (const part of [empty, held, wrecked]) {
      part.visible = false;
      part.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      });
      root.add(part);
    }

    group.add(root);
    sites.set(site.id, { empty, held, wrecked });
  }

  const show = (run: Run): void => {
    for (const [id, parts] of sites) {
      const state = run.footholds.get(id);
      const claimed = state?.claimed === true;
      const damage = state?.damage ?? 0;
      parts.empty.visible = !claimed;
      parts.held.visible = claimed && damage < 0.5;
      parts.wrecked.visible = claimed && damage >= 0.5;
    }
  };

  return {
    group,
    update: show,
    reset: show,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      geometries.length = 0;
      materials.length = 0;
      sites.clear();
      group.clear();
    },
  };
}

import * as THREE from 'three';
import {
  BASEBOARD_DEPTH_MM,
  BASEBOARD_HEIGHT_MM,
  WALL_HEIGHT_MM,
  WALL_STUB_MM,
  mm,
} from '../world/units';
import type { House } from '../world/house';
import type { RegionId, RegionSpec, WallSpec } from '../world/types';
import { VIEW_DIR_X, VIEW_DIR_Z } from './camera';
import { createMaterials, type MaterialId, type MaterialLibrary } from './materials';
import { box, makeRandom, roundedBox, shadows, type Kit } from './shapes';
import { PROPS } from './props';
import { missingBuilders } from './props/registry';
import { OcclusionSystem } from './occlusion';

/**
 * Building the apartment.
 *
 * ## The wall cut is static, and that is the whole point
 *
 * The camera's orientation never changes, so which walls stand between the viewer and each room is
 * known before the first frame. Those walls are simply *built short* — a 320 mm stub with its
 * baseboard intact. No per-frame wall fading, no alpha sorting between wall panels, no popping when
 * the scout crosses a threshold. An entire class of defect is designed out rather than debugged.
 *
 * Props still fade, because a mug or a bin genuinely can move between the camera and the scout in a
 * way that is not knowable in advance. That is what `OcclusionSystem` is for.
 */

/** Floor material per region — it is a large part of what makes a room recognisable. */
const FLOOR_MATERIAL: Readonly<Record<RegionId, MaterialId>> = {
  kitchen: 'floorVinyl',
  hallway: 'floorWood',
  living: 'floorWood',
  bathroom: 'tileFloor',
  bedroom: 'floorWood',
};

export interface SceneStats {
  readonly props: number;
  readonly meshes: number;
  readonly geometries: number;
  readonly materials: number;
  readonly missingProps: readonly string[];
}

export interface BuiltScene {
  readonly root: THREE.Group;
  readonly occlusion: OcclusionSystem;
  readonly materials: MaterialLibrary;
  /** Gate id → the geometry that moves when it opens. */
  readonly gateProps: ReadonlyMap<string, THREE.Object3D>;
  /** Region id → everything in it, so occlusion and culling can work per room. */
  readonly regionGroups: ReadonlyMap<RegionId, THREE.Group>;
  readonly stats: SceneStats;
  dispose(): void;
}

export function buildScene(house: House): BuiltScene {
  const root = new THREE.Group();
  root.name = 'apartment';

  const materials = createMaterials();
  const geometries: THREE.BufferGeometry[] = [];
  const occlusion = new OcclusionSystem();
  const gateProps = new Map<string, THREE.Object3D>();
  const regionGroups = new Map<RegionId, THREE.Group>();

  let rand = makeRandom(1);
  const kit: Kit = {
    materials,
    rand: () => rand(),
    own(geometry) {
      geometries.push(geometry);
      return geometry;
    },
  };

  const wanted = new Set<string>();
  for (const region of house.regions) for (const prop of region.props) wanted.add(prop.kind);
  const missing = missingBuilders(PROPS, wanted);

  let meshes = 0;
  let props = 0;

  for (const region of house.regions) {
    const group = new THREE.Group();
    group.name = region.id;

    group.add(buildFloor(kit, region));
    for (const wall of region.walls) group.add(...buildWall(kit, wall));

    for (const placement of region.props) {
      const builder = PROPS[placement.kind];
      if (!builder) continue;
      // Seeded per placement so the same prop in two rooms differs, reproducibly.
      rand = makeRandom(hash(`${placement.kind}:${placement.at.x}:${placement.at.z}`));
      const node = builder(kit, placement.options ?? {});
      node.position.set(placement.at.x, placement.at.y, placement.at.z);
      if (placement.rotY) node.rotation.y = placement.rotY;
      if (placement.scale) node.scale.setScalar(placement.scale);
      node.name = placement.kind;
      group.add(node);
      props++;
      node.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshes++;
      });

      if (placement.occluder) {
        occlusion.register(node, { floor: placement.fadeFloor, region: region.id });
      }
    }

    // The thing that actually moves when a gate opens.
    for (const gate of house.gates) {
      if (gate.from !== region.id) continue;
      const seal = buildGateSeal(kit, gate.kind);
      seal.position.set(gate.at.x, mm(1), gate.at.z);
      seal.name = gate.id;
      group.add(seal);
      gateProps.set(gate.id, seal);
      meshes += 3;
    }

    regionGroups.set(region.id, group);
    root.add(group);
  }

  return {
    root,
    occlusion,
    materials,
    gateProps,
    regionGroups,
    stats: {
      props,
      meshes,
      geometries: geometries.length,
      materials: materials.stats().materials,
      missingProps: missing,
    },
    dispose() {
      occlusion.dispose();
      for (const geometry of geometries) geometry.dispose();
      geometries.length = 0;
      materials.dispose();
      root.clear();
      gateProps.clear();
      regionGroups.clear();
    },
  };
}

/* -------------------------------------------------------------------- floor */

function buildFloor(kit: Kit, region: RegionSpec): THREE.Mesh {
  const { x0, z0, x1, z1 } = region.bounds;
  const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const mesh = new THREE.Mesh(kit.own(geometry), kit.materials.get(FLOOR_MATERIAL[region.id]));
  mesh.receiveShadow = true;
  mesh.name = `${region.id}.floor`;
  return mesh;
}

/* --------------------------------------------------------------------- wall */

/**
 * Is this wall between the camera and the room it encloses?
 *
 * A wall faces the viewer when its outward normal points back along the view direction. Those are
 * the ones that would block, and they are built as stubs.
 */
export function isNearWall(wall: WallSpec): boolean {
  if (wall.solid) return false;
  return wall.outward.x * VIEW_DIR_X + wall.outward.z * VIEW_DIR_Z < -0.15;
}

function buildWall(kit: Kit, wall: WallSpec): THREE.Object3D[] {
  const dx = wall.to.x - wall.from.x;
  const dz = wall.to.z - wall.from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-4) return [];

  const angle = Math.atan2(dx, dz);
  const thickness = mm(wall.thicknessMm ?? 110);
  const cut = isNearWall(wall);
  const height = cut ? mm(WALL_STUB_MM) : mm(WALL_HEIGHT_MM);
  const out: THREE.Object3D[] = [];

  // Openings split the wall into spans. A doorway is a real hole, not a decal, because the scout
  // walks through it and the light spills through it.
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.start - b.start);
  const spans: { start: number; length: number }[] = [];
  let cursor = 0;
  for (const opening of openings) {
    if (opening.start > cursor) spans.push({ start: cursor, length: opening.start - cursor });
    cursor = opening.start + opening.width;
  }
  if (cursor < length) spans.push({ start: cursor, length: length - cursor });

  for (const span of spans) {
    if (span.length < mm(20)) continue;
    const mid = span.start + span.length / 2;
    const cx = wall.from.x + (dx / length) * mid;
    const cz = wall.from.z + (dz / length) * mid;

    const panel = box(kit, 1, 1, 1, cut ? 'plasterCut' : 'plasterWall');
    panel.scale.set(span.length, height, thickness);
    panel.position.set(cx, height / 2, cz);
    panel.rotation.y = angle - Math.PI / 2;
    panel.castShadow = !cut;
    panel.receiveShadow = true;
    out.push(panel);

    // The baseboard survives the cut. It is the single most important 90 mm in the game — the
    // colony's motorway — and a room without one stops reading as a room at all.
    const skirt = box(kit, 1, 1, 1, 'skirting');
    skirt.scale.set(span.length, mm(BASEBOARD_HEIGHT_MM), thickness + mm(BASEBOARD_DEPTH_MM * 2));
    skirt.position.set(cx, mm(BASEBOARD_HEIGHT_MM) / 2, cz);
    skirt.rotation.y = angle - Math.PI / 2;
    skirt.receiveShadow = true;
    out.push(skirt);
  }

  // A lintel over a full-height doorway, so a door reads as a door rather than as a gap.
  if (!cut) {
    for (const opening of openings) {
      if (opening.sill !== undefined) continue;
      const above = mm(WALL_HEIGHT_MM) - opening.height;
      if (above < mm(30)) continue;
      const mid = opening.start + opening.width / 2;
      const lintel = box(kit, 1, 1, 1, 'plasterWall');
      lintel.scale.set(opening.width, above, thickness);
      lintel.position.set(
        wall.from.x + (dx / length) * mid,
        opening.height + above / 2,
        wall.from.z + (dz / length) * mid,
      );
      lintel.rotation.y = angle - Math.PI / 2;
      lintel.castShadow = true;
      out.push(lintel);
    }
  }

  return out;
}

/* --------------------------------------------------------------------- gate */

/**
 * The physical thing sealing a passage.
 *
 * This is what the player looks at, walks up to, and works on — and what visibly moves when the
 * operation completes. A gate that opened without geometry changing would be a level-unlock message
 * wearing a costume.
 */
function buildGateSeal(kit: Kit, kind: string): THREE.Group {
  const g = new THREE.Group();

  if (kind === 'pipe' || kind === 'baseboard') {
    // A pipe collar bedded in cracked silicone.
    const collar = roundedBox(kit, 96, 78, 26, 'plasticWhite', 3);
    collar.position.y = mm(39);
    const bead = roundedBox(kit, 108, 16, 30, kit.materials.clone('plasticWhite', 0xbfb9ac), 4);
    bead.position.y = mm(8);
    const mouth = box(kit, 44, 42, 8, 'grime');
    mouth.position.set(0, mm(40), mm(-11));
    g.add(collar, bead, mouth);
  } else if (kind === 'doorsweep') {
    // A draught strip pressed into the gap under a door.
    const strip = roundedBox(kit, 420, 26, 20, 'rubber', 5);
    strip.position.y = mm(13);
    const brush = box(kit, 420, 14, 6, 'fabricTowel');
    brush.position.set(0, mm(6), mm(11));
    const tack = box(kit, 6, 6, 6, 'steelBrushed');
    tack.position.set(mm(-150), mm(24), 0);
    g.add(strip, brush, tack);
  } else {
    // A screwed-down toe-kick or cable-port cover.
    const panel = roundedBox(kit, 200, 140, 12, 'cabinetDoor', 2.5);
    panel.position.y = mm(70);
    const screwA = box(kit, 7, 7, 4, 'steelBrushed');
    screwA.position.set(mm(-78), mm(120), mm(7));
    const screwB = box(kit, 7, 7, 4, 'steelBrushed');
    screwB.position.set(mm(78), mm(120), mm(7));
    g.add(panel, screwA, screwB);
  }

  return shadows(g, true, true);
}

/**
 * Start the opening animation.
 *
 * The seal swings, drops and stops — it is not removed, because a hole with the thing that used to
 * block it lying beside it is far more legible than a hole.
 */
export function openGateVisual(seal: THREE.Object3D): void {
  seal.userData.opening = 0;
}

export function updateGateVisuals(gateProps: ReadonlyMap<string, THREE.Object3D>, dt: number): void {
  for (const seal of gateProps.values()) {
    const t = seal.userData.opening;
    if (typeof t !== 'number' || t >= 1) continue;
    const next = Math.min(1, t + dt / 0.9);
    seal.userData.opening = next;
    const eased = 1 - (1 - next) * (1 - next);
    seal.rotation.z = eased * 1.35;
    seal.position.y = mm(1) - eased * mm(9);
  }
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

import * as THREE from 'three';

/**
 * The counter run: worktop, inset sink basin, drain, splashback, cabinet carcass and toe-kick.
 *
 * WHY THIS EXISTS AS REAL GEOMETRY. The sprite-era prop library carried a `sink-drain` that came
 * with its own little steel deck, because a baked sprite has to be a self-contained island. Dropped
 * into a 3D scene that deck rendered as a flat dark rectangle lying on the worktop with hard
 * straight edges — the exact defect this rebuild exists to kill, and the most reported complaint
 * about the previous build.
 *
 * A sink is not a decal. It is a hole. The worktop here is built as four slabs around a real
 * aperture, with a basin hanging below it, so the drain is recognizable for the reason a real drain
 * is recognizable: it sits at the bottom of a recess the surrounding surface falls away into.
 *
 * Everything is modelled in real millimetres through the one scale anchor.
 */

/** Millimetres per world unit. Mirrors `tools/bake/lib/units.mjs`; the scout is 26 units = 35 mm. */
const MM_PER_UNIT = 35 / 26;
const mm = (millimetres: number): number => millimetres / MM_PER_UNIT;

/* ------------------------------------------------------------- dimensions */

/** A standard Korean apartment kitchen run, in millimetres. */
const COUNTER_WIDTH = 1240;
const COUNTER_DEPTH = 660;
const COUNTER_THICK = 38;
/** Worktop height above the floor. At 880 mm it is 25 scouts tall — that ratio is the scale gag. */
const COUNTER_HEIGHT = 880;
const SPLASHBACK_HEIGHT = 210;

/** Single-bowl sink, inset left of centre the way a one-bowl unit usually sits. */
const BOWL_WIDTH = 380;
const BOWL_DEPTH = 330;
/*
 * MEASURED CORRECTION (proof-09). At 165 mm the bowl walls shadowed their own floor so completely
 * that the recess rendered as a flat black quad and the drain ring floated on it like a decal — the
 * defect the aperture was built to remove, reappearing for a different reason. A shallower bowl lets
 * the key light reach the floor, which is what makes the recess read AS a recess.
 */
const BOWL_DROP = 105;
const BOWL_CENTRE_X = -190;
const BOWL_CENTRE_Z = -60;
/** Width of the pressed steel lip around the bowl. */
const BOWL_LIP = 26;

const DRAIN_RADIUS = 45;
const TOE_KICK_HEIGHT = 100;
const TOE_KICK_RECESS = 60;

export interface CounterMaterials {
  readonly stone: THREE.Material;
  readonly steel: THREE.Material;
  /**
   * Bowl interior.
   *
   * Deliberately LESS metallic than the outside steel. A `metalness > 0.9` surface has almost no
   * diffuse response, so it is lit only by what it reflects — and what a sink bowl's walls reflect
   * is the environment map's lower hemisphere, which in a night kitchen is nearly black. Physically
   * correct, and it rendered the bowl as a void. Dropping metalness lets the hemisphere and key
   * light actually land on it.
   */
  readonly steelBowl: THREE.Material;
  readonly steelPolished: THREE.Material;
  readonly laminate: THREE.Material;
  readonly laminateDark: THREE.Material;
  readonly floor: THREE.Material;
}

export interface Counter {
  readonly group: THREE.Group;
  /** Worktop surface is the walkable plane and sits at y = 0. */
  readonly halfWidth: number;
  readonly halfDepth: number;
  /** Axis-aligned footprint of the sink aperture on the worktop plane, in world units. */
  readonly bowl: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** World-space centre of the drain, for route endpoints and camera framing. */
  readonly drainCentre: THREE.Vector3;
  readonly dispose: () => void;
}

function slab(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  geometries: THREE.BufferGeometry[],
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Build the counter run.
 *
 * The worktop surface is the plane y = 0, so gameplay positions on the counter need no offset and
 * the simulation's existing 2D coordinates map straight onto XZ.
 */
export function buildCounter(materials: CounterMaterials): Counter {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];

  const halfWidth = mm(COUNTER_WIDTH) / 2;
  const halfDepth = mm(COUNTER_DEPTH) / 2;
  const thick = mm(COUNTER_THICK);

  const bowlHalfW = mm(BOWL_WIDTH) / 2;
  const bowlHalfD = mm(BOWL_DEPTH) / 2;
  const cx = mm(BOWL_CENTRE_X);
  const cz = mm(BOWL_CENTRE_Z);

  const bowl = {
    minX: cx - bowlHalfW,
    maxX: cx + bowlHalfW,
    minZ: cz - bowlHalfD,
    maxZ: cz + bowlHalfD,
  };

  /* ------------------------------------------------- worktop, four slabs */

  // Back slab, from the splashback down to the aperture.
  const backDepth = bowl.minZ - -halfDepth;
  const back = slab(halfWidth * 2, thick, backDepth, materials.stone, geometries);
  back.position.set(0, -thick / 2, -halfDepth + backDepth / 2);
  group.add(back);

  // Front slab, from the aperture to the counter's front edge.
  const frontDepth = halfDepth - bowl.maxZ;
  const front = slab(halfWidth * 2, thick, frontDepth, materials.stone, geometries);
  front.position.set(0, -thick / 2, bowl.maxZ + frontDepth / 2);
  group.add(front);

  // Left and right slabs fill the band beside the aperture.
  const sideDepth = bowl.maxZ - bowl.minZ;
  const leftWidth = bowl.minX - -halfWidth;
  const left = slab(leftWidth, thick, sideDepth, materials.stone, geometries);
  left.position.set(-halfWidth + leftWidth / 2, -thick / 2, cz);
  group.add(left);

  const rightWidth = halfWidth - bowl.maxX;
  const right = slab(rightWidth, thick, sideDepth, materials.stone, geometries);
  right.position.set(bowl.maxX + rightWidth / 2, -thick / 2, cz);
  group.add(right);

  /* -------------------------------------------------------- the sink bowl */

  const drop = mm(BOWL_DROP);
  const lip = mm(BOWL_LIP);
  const wall = mm(6);

  /*
   * A pressed-steel lip around the aperture.
   *
   * This is the "stainless-steel sink edge" the proof scene is required to show, and it is what
   * makes the recess read as a manufactured fixture rather than as a rectangular hole. It sits a
   * hair proud of the stone, which is how an inset sink actually sits.
   */
  const rimY = mm(2);
  const rimSpecs: Array<[number, number, number, number]> = [
    // [width, depth, centreX, centreZ]
    [bowlHalfW * 2 + lip * 2, lip, cx, bowl.minZ - lip / 2],
    [bowlHalfW * 2 + lip * 2, lip, cx, bowl.maxZ + lip / 2],
    [lip, bowlHalfD * 2, bowl.minX - lip / 2, cz],
    [lip, bowlHalfD * 2, bowl.maxX + lip / 2, cz],
  ];
  for (const [w, d, x, z] of rimSpecs) {
    const rim = slab(w, rimY * 2, d, materials.steel, geometries);
    rim.position.set(x, 0, z);
    group.add(rim);
  }

  // Bowl walls, hanging from the aperture down to the bowl floor.
  const wallSpecs: Array<[number, number, number, number]> = [
    [bowlHalfW * 2, wall, cx, bowl.minZ + wall / 2],
    [bowlHalfW * 2, wall, cx, bowl.maxZ - wall / 2],
    [wall, bowlHalfD * 2, bowl.minX + wall / 2, cz],
    [wall, bowlHalfD * 2, bowl.maxX - wall / 2, cz],
  ];
  for (const [w, d, x, z] of wallSpecs) {
    const side = slab(w, drop, d, materials.steelBowl, geometries);
    side.position.set(x, -drop / 2, z);
    group.add(side);
  }

  const bowlFloor = slab(bowlHalfW * 2, wall, bowlHalfD * 2, materials.steelBowl, geometries);
  bowlFloor.position.set(cx, -drop + wall / 2, cz);
  group.add(bowlFloor);

  /* ------------------------------------------------------------- the drain */

  const drainCentre = new THREE.Vector3(cx, -drop + wall, cz);
  const drainR = mm(DRAIN_RADIUS);

  /*
   * The drain reads through three cues, in this order of importance: a bright polished ring
   * catching the environment, a dark aperture beneath it, and a crosshair of grate bars. The
   * previous build's drain failed because it had only the third — a cross on a disc, which is a
   * diagram of a drain rather than a drain.
   */
  const ringGeo = new THREE.TorusGeometry(drainR, mm(3.5), 8, 32);
  geometries.push(ringGeo);
  const ring = new THREE.Mesh(ringGeo, materials.steelPolished);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(drainCentre);
  ring.castShadow = true;
  ring.receiveShadow = true;
  group.add(ring);

  const wellGeo = new THREE.CylinderGeometry(drainR * 0.92, drainR * 0.72, mm(26), 24, 1, true);
  geometries.push(wellGeo);
  const well = new THREE.Mesh(wellGeo, materials.steel);
  well.position.set(cx, drainCentre.y - mm(13), cz);
  well.receiveShadow = true;
  group.add(well);

  // A dark disc at the bottom so the well never shows the empty backside of the world.
  const plateGeo = new THREE.CircleGeometry(drainR * 0.75, 24);
  geometries.push(plateGeo);
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x0a0e13, roughness: 0.9 });
  const plate = new THREE.Mesh(plateGeo, plateMaterial);
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(cx, drainCentre.y - mm(26), cz);
  group.add(plate);

  const barGeo = new THREE.BoxGeometry(drainR * 1.7, mm(3), mm(5));
  geometries.push(barGeo);
  for (let i = 0; i < 2; i++) {
    const bar = new THREE.Mesh(barGeo, materials.steelPolished);
    bar.position.set(cx, drainCentre.y - mm(3), cz);
    bar.rotation.y = (i * Math.PI) / 2;
    bar.castShadow = true;
    group.add(bar);
  }

  /* ---------------------------------------------------------- splashback */

  const splash = slab(halfWidth * 2, mm(SPLASHBACK_HEIGHT), mm(12), materials.steel, geometries);
  splash.position.set(0, mm(SPLASHBACK_HEIGHT) / 2, -halfDepth + mm(6));
  group.add(splash);

  /* ------------------------------------------- cabinet carcass and toe-kick */

  const cabinetHeight = mm(COUNTER_HEIGHT - TOE_KICK_HEIGHT);
  const cabinetDepth = mm(COUNTER_DEPTH - 40);
  const cabinet = slab(halfWidth * 2, cabinetHeight, cabinetDepth, materials.laminate, geometries);
  cabinet.position.set(0, -thick - cabinetHeight / 2, -mm(20));
  group.add(cabinet);

  /*
   * The toe-kick is recessed, and that recess is the point.
   *
   * It is the darkest reachable space in the room and the colony's safest highway, and the shadow
   * that makes it dark is cast by the cabinet above it — not painted on. An under-cabinet band that
   * is merely a darker rectangle is the flat-diagram failure wearing a different costume.
   */
  const toeHeight = mm(TOE_KICK_HEIGHT);
  const toeDepth = cabinetDepth - mm(TOE_KICK_RECESS);
  const toe = slab(halfWidth * 2, toeHeight, toeDepth, materials.laminateDark, geometries);
  toe.position.set(0, -thick - cabinetHeight - toeHeight / 2, -mm(20) - mm(TOE_KICK_RECESS) / 2);
  group.add(toe);

  /* ---------------------------------------------------------------- floor */

  const floorGeo = new THREE.PlaneGeometry(mm(4200), mm(3400));
  geometries.push(floorGeo);
  const floor = new THREE.Mesh(floorGeo, materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -thick - mm(COUNTER_HEIGHT);
  floor.receiveShadow = true;
  group.add(floor);

  return {
    group,
    halfWidth,
    halfDepth,
    bowl,
    drainCentre,
    dispose: () => {
      for (const g of geometries) g.dispose();
      plateMaterial.dispose();
    },
  };
}

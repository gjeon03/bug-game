import * as THREE from 'three';

/**
 * The kitchen floor plan — the single source of truth for where everything is.
 *
 * ## Why a greybox first
 *
 * Eight parallel researchers specified 188 props across eight zones, of which 121 do not yet exist.
 * Authoring 121 props and only then discovering which of them the camera can never frame would be
 * the most expensive possible order of operations. So the room is built as boxes at real millimetre
 * dimensions first, the eight anchor frames are captured from the real gameplay camera, and the cut
 * list is decided against actual pixels before a single builder is written.
 *
 * A greybox is explicitly NOT a deliverable — the brief says so. It is a measuring instrument.
 *
 * ## Coordinates
 *
 * Origin at the room's centre, on the floor. X runs east, Z runs south (toward the camera), Y is
 * height. The worktop plane the existing sink run is authored against sits at `COUNTER_HEIGHT_MM`
 * above the floor, so a prop placed at y = 0 in `counter.ts` is at y = `COUNTER_HEIGHT_MM` here.
 *
 * ## Room size
 *
 * 3700 x 3400 mm of floor: a 전용 84 m²-class Korean apartment kitchen with room for a small island —
 * large enough that the north run carries pantry, sink and stove side by side without either
 * overlapping or the camera ever seeing all three at a useful scale at once.
 */

/** Millimetres per world unit. Mirrors `tools/bake/lib/units.mjs`; the scout is 26 units = 35 mm. */
const MM_PER_UNIT = 35 / 26;
export const mm = (millimetres: number): number => millimetres / MM_PER_UNIT;

export const ROOM_WIDTH_MM = 3700;
export const ROOM_DEPTH_MM = 3400;
export const WALL_HEIGHT_MM = 2400;

/** Korean apartment worktop height. Base cabinets are 600 deep; the run is 660 with the overhang. */
export const COUNTER_HEIGHT_MM = 880;
export const COUNTER_DEPTH_MM = 660;

/** The three traversal bands from the game contract. */
export type Band = 'floor' | 'baseboard' | 'counter';

export interface Zone {
  readonly id: string;
  /** Player-facing names live in the i18n catalog; this is a designer label only. */
  readonly label: string;
  /** Centre of the zone's footprint, in millimetres, on the floor plane. */
  readonly x: number;
  readonly z: number;
  readonly widthMm: number;
  readonly depthMm: number;
  readonly heightMm: number;
  readonly band: Band;
  /** Why this zone exists, in one line. A zone that cannot answer this is cut. */
  readonly role: string;
}

/**
 * The eight zones.
 *
 * Laid out as a Korean apartment L-kitchen: a continuous north run carrying pantry, sink and stove;
 * an east run carrying the refrigerator and the waste corner; a free-standing island for prep; and
 * the doorway on the south wall where the household enters. The baseboard band is the perimeter and
 * is handled separately because it is an edge set, not a footprint.
 *
 * Dimensions come from the eight zone research specs, trimmed to fit one coherent room. Where a spec
 * asked for more space than the room has — the prep island was specified at 2600 x 1750 — the zone is
 * scaled to what a real 84 m² apartment would actually contain, rather than the room being inflated
 * to fit the wish list.
 */
export const ZONES: readonly Zone[] = [
  {
    id: 'pantry',
    label: 'pantry / 팬트리',
    x: -1245,
    z: -1370,
    widthMm: 1210,
    depthMm: 625,
    heightMm: 2300,
    band: 'counter',
    role: 'Densest renewable food in the kitchen, and the darkest zone — its light is entirely borrowed.',
  },
  {
    id: 'sink',
    label: 'sink / 싱크대',
    x: -20,
    z: -1370,
    widthMm: 1240,
    depthMm: 660,
    heightMm: 1450,
    band: 'counter',
    role: 'The colony moisture line — the only self-renewing water. Already built in counter.ts.',
  },
  {
    id: 'stove',
    label: 'stove / 레인지',
    x: 1200,
    z: -1370,
    widthMm: 1200,
    depthMm: 660,
    heightMm: 2300,
    band: 'counter',
    role: 'Tier-1 renewable pantry where the food is a FILM rather than an object: grease.',
  },
  {
    id: 'fridge',
    label: 'refrigerator / 냉장고',
    x: 1400,
    z: -420,
    widthMm: 900,
    depthMm: 750,
    heightMm: 1853,
    band: 'floor',
    role: 'Warm, permanently dark, structurally roofed, near water — the colony prize and its trap.',
  },
  {
    id: 'waste',
    label: 'waste / 음식물 쓰레기',
    x: 1400,
    z: 640,
    widthMm: 700,
    depthMm: 900,
    heightMm: 1050,
    band: 'floor',
    role: 'Richest food in the kitchen on the most exposed floor. Engine early, liability late.',
  },
  {
    id: 'prep',
    label: 'prep island / 아일랜드 조리대',
    x: -160,
    z: 240,
    widthMm: 1600,
    depthMm: 900,
    heightMm: 900,
    band: 'counter',
    role: 'Teaches route choice: a cheap safe approach and an expensive arrival.',
  },
  {
    id: 'doorway',
    label: 'doorway / 문간',
    x: -900,
    z: 1700,
    widthMm: 900,
    depthMm: 120,
    heightMm: 2100,
    band: 'floor',
    role: 'The only aperture: household spawn corridor, brightest floor, most valuable territory.',
  },
  {
    id: 'baseboard',
    label: 'baseboard network / 걸레받이',
    x: 0,
    z: 0,
    widthMm: ROOM_WIDTH_MM,
    depthMm: ROOM_DEPTH_MM,
    heightMm: 160,
    band: 'baseboard',
    role: 'The safest travel band and the literal edge set of the routing graph. ~504 scout-lengths.',
  },
];

/**
 * Anchor shots.
 *
 * Every prop must appear in at least one of these frames or it is cut before it is authored. These
 * are the frames a critic judges and a regression re-captures — so they are named, fixed and stored
 * here rather than chosen ad hoc at capture time.
 */
export interface AnchorShot {
  readonly id: string;
  /** Where the camera looks, in millimetres on the floor plane. */
  readonly x: number;
  readonly z: number;
  /** Height of the focus point — a counter shot looks at the worktop, not at the tile. */
  readonly y: number;
  readonly what: string;
}

export const ANCHOR_SHOTS: readonly AnchorShot[] = [
  { id: 'sink', x: -20, z: -1180, y: COUNTER_HEIGHT_MM, what: 'sink bowl, drain, drying crockery' },
  { id: 'stove', x: 1200, z: -1180, y: COUNTER_HEIGHT_MM, what: 'hob, hood light, grease film' },
  { id: 'pantry', x: -1245, z: -1080, y: 600, what: 'pantry column, torn rice sack, floor' },
  {
    id: 'fridge-gap',
    x: 1400,
    z: -60,
    y: 120,
    what: 'compressor gap, condenser, the dark harbourage',
  },
  { id: 'waste', x: 1400, z: 640, y: 200, what: 'food-waste pail, the exposed floor around it' },
  {
    id: 'island',
    x: -160,
    z: 240,
    y: COUNTER_HEIGHT_MM,
    what: 'prep surface, the route across open ground',
  },
  { id: 'doorway', x: -900, z: 1420, y: 200, what: 'threshold, hall light spill, slippers' },
  { id: 'toe-kick', x: -20, z: -1000, y: 60, what: 'the baseboard highway and its terminator' },
];

export interface RoomMaterials {
  readonly floor: THREE.Material;
  readonly wall: THREE.Material;
  readonly carcass: THREE.Material;
  readonly appliance: THREE.Material;
  readonly worktop: THREE.Material;
}

export interface Room {
  readonly group: THREE.Group;
  /** Greybox volumes by zone id, so occlusion can register them before any prop exists. */
  readonly volumes: ReadonlyMap<string, THREE.Object3D>;
  readonly dispose: () => void;
}

/**
 * Build the greybox room.
 *
 * Every volume is at its real millimetre dimension, so the anchor frames measure the actual
 * composition rather than a sketch of it. Zones are returned individually because occlusion has to
 * be tuned against these silhouettes at these distances now — retrofitting it after 121 props exist
 * is how fade behaviour ends up wrong in ways nobody can localise.
 */
export function buildRoom(materials: RoomMaterials): Room {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const volumes = new Map<string, THREE.Object3D>();

  const box = (w: number, h: number, d: number, material: THREE.Material): THREE.Mesh => {
    const geometry = new THREE.BoxGeometry(mm(w), mm(h), mm(d));
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  /* ------------------------------------------------------------ shell */

  const floorGeo = new THREE.PlaneGeometry(mm(ROOM_WIDTH_MM), mm(ROOM_DEPTH_MM));
  geometries.push(floorGeo);
  const floor = new THREE.Mesh(floorGeo, materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Two walls only — north and east. The camera looks north-west, so a south or west wall would sit
  // between it and the room and be permanently faded: cost with no image to show for it.
  const northWall = box(ROOM_WIDTH_MM, WALL_HEIGHT_MM, 60, materials.wall);
  northWall.position.set(0, mm(WALL_HEIGHT_MM) / 2, mm(-ROOM_DEPTH_MM / 2 - 30));
  group.add(northWall);

  const eastWall = box(60, WALL_HEIGHT_MM, ROOM_DEPTH_MM, materials.wall);
  eastWall.position.set(mm(ROOM_WIDTH_MM / 2 + 30), mm(WALL_HEIGHT_MM) / 2, 0);
  group.add(eastWall);

  /* ------------------------------------------------------------ zones */

  for (const zone of ZONES) {
    if (zone.id === 'baseboard') continue; // an edge set, not a volume
    if (zone.id === 'sink') continue; // already real geometry in counter.ts

    const volume = new THREE.Group();

    if (zone.band === 'counter' && zone.heightMm <= 1500) {
      // A run: carcass, worktop slab and a recessed toe-kick, so the greybox already carries the
      // silhouette that matters at insect scale.
      const carcassH = COUNTER_HEIGHT_MM - 100;
      const carcass = box(zone.widthMm, carcassH, zone.depthMm - 60, materials.carcass);
      carcass.position.set(0, mm(100 + carcassH / 2), mm(30));
      volume.add(carcass);

      const worktop = box(zone.widthMm, 38, zone.depthMm, materials.worktop);
      worktop.position.set(0, mm(COUNTER_HEIGHT_MM - 19), 0);
      volume.add(worktop);

      const kick = box(zone.widthMm, 100, zone.depthMm - 120, materials.carcass);
      kick.position.set(0, mm(50), mm(-30));
      volume.add(kick);
    } else {
      const solid = box(zone.widthMm, zone.heightMm, zone.depthMm, materials.appliance);
      solid.position.y = mm(zone.heightMm / 2);
      volume.add(solid);
    }

    volume.position.set(mm(zone.x), 0, mm(zone.z));
    group.add(volume);
    volumes.set(zone.id, volume);
  }

  /* -------------------------------------------------------- baseboard */

  // The perimeter skirting. Modelled because the shadow it casts into its own recess IS the
  // traversal band — an under-cabinet strip that is merely a darker rectangle is the flat-diagram
  // failure wearing a different costume.
  const skirting = 22;
  const north = box(ROOM_WIDTH_MM, 160, skirting, materials.carcass);
  north.position.set(0, mm(80), mm(-ROOM_DEPTH_MM / 2 + skirting / 2));
  group.add(north);

  const east = box(skirting, 160, ROOM_DEPTH_MM, materials.carcass);
  east.position.set(mm(ROOM_WIDTH_MM / 2 - skirting / 2), mm(80), 0);
  group.add(east);

  return {
    group,
    volumes,
    dispose: () => {
      for (const g of geometries) g.dispose();
    },
  };
}

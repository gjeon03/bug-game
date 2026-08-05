import { mm } from './units';
import { VIEW_DIR_X, VIEW_DIR_Z } from '../view/camera';
import { buildGrid, paintExposure, resetExposure, type Nav, type SurfaceGrid } from './nav';
import type {
  FootholdSite,
  Gate,
  Link,
  RegionId,
  RegionSpec,
  ResourceSite,
  Surface,
} from './types';
import { KITCHEN } from './regions/kitchen';
import { HALLWAY } from './regions/hallway';
import { LIVING } from './regions/living';
import { BATHROOM } from './regions/bathroom';
import { BEDROOM } from './regions/bedroom';

/**
 * The apartment.
 *
 * Five authored regions tiled into one navigable world, plus the gate graph that decides which of
 * them the colony can currently reach.
 *
 * ## Why gates add links rather than remove barriers
 *
 * A locked region here is not a region with a wall in front of it — it is a region with **no edge
 * into it in the navigation graph at all**. That is a stronger guarantee than a flag check: there
 * is no code path by which a worker, a route repair, or a stray A* query can enter the bedroom
 * before the bedroom door sweep has actually been chewed through, because no sequence of moves
 * exists. The player's first evidence that a gate opened is that the world changes shape.
 */

export const REGIONS: readonly RegionSpec[] = [KITCHEN, HALLWAY, LIVING, BATHROOM, BEDROOM];

/* ------------------------------------------------------------------- gates */

/**
 * The five physical passages, in the order they normally open.
 *
 * Every one of them is a real thing in a real Korean apartment. The kitchen exit is the silicone
 * seal where the sink waste pipe passes through the wall into the service chase — which is exactly
 * how a real infestation leaves a kitchen, and which is also why the bathroom, sharing that chase,
 * later becomes a shortcut rather than a dead end.
 */
/*
 * A NOTE ON THESE COSTS — a tuning attempt that was measured and rejected.
 *
 * These numbers produce a run the automated player wins in 24.5 minutes, but with all five gates
 * opened inside the first three minutes and the remaining twenty spent accumulating toward the
 * victory condition. That is the wrong SHAPE for the 25-35 minute chapter structure, so the costs
 * were raised roughly 2.5x to spread the chapters out.
 *
 * The raised costs were then measured on the same seed and REVERTED, because they did not merely
 * slow the run down — they broke it:
 *
 *   |               | these costs   | raised 2.5x       |
 *   | result        | WON, 24.5 min | not won at 45 min |
 *   | gates opened  | 5             | 3                 |
 *   | sightings     | 9             | 183               |
 *   | workers lost  | 52            | 99                |
 *   | end population| 39            | 0                 |
 *
 * The colony spent so long at each gate that it out-scouted its own moisture supply and starved
 * (final food 404, final moisture 0). Pacing cannot be fixed by making requirements larger while
 * the store ceiling and source amounts stay where they are; it needs the economy re-derived
 * alongside. That work is not done, and shipping an unwinnable run to get a nicer chapter curve
 * would be the wrong trade. The known-winnable numbers stand, and the pacing defect is recorded
 * in GAUNTLET_STATE.md as open rather than quietly left in the code.
 */
export const GATES: readonly Gate[] = [
  {
    id: 'gate.kitchen.hallway',
    from: 'kitchen',
    to: 'hallway',
    at: { x: mm(2120), z: mm(-2690) },
    surface: 'kitchen.floor',
    kind: 'baseboard',
    labelKey: 'gate.kitchen.hallway',
    descriptionKey: 'gate.kitchen.hallway.desc',
    requires: {
      workers: 6,
      food: 52,
      moisture: 36,
      footholds: ['kitchen.undersink'],
      maxAlert: 2,
    },
    workSeconds: 9,
    opens: [
      {
        id: 'link.kitchen.hallway',
        from: 'kitchen.floor',
        to: 'hallway.floor',
        at: { x: mm(2120), z: mm(-2690) },
        exitAt: { x: mm(2120), z: mm(-160) },
        seconds: 5.4,
        capacity: 3,
        kind: 'pipe',
        labelKey: 'link.kitchen.hallway',
      },
    ],
  },
  {
    id: 'gate.hallway.living',
    from: 'hallway',
    to: 'living',
    at: { x: mm(5000), z: mm(1180) },
    surface: 'hallway.floor',
    kind: 'doorsweep',
    labelKey: 'gate.hallway.living',
    descriptionKey: 'gate.hallway.living.desc',
    requires: {
      workers: 13,
      food: 84,
      moisture: 55,
      maxAlert: 2,
    },
    workSeconds: 11,
    opens: [
      {
        id: 'link.hallway.living',
        from: 'hallway.floor',
        to: 'living.floor',
        at: { x: mm(5000), z: mm(1180) },
        exitAt: { x: mm(5000), z: mm(1420) },
        seconds: 2.6,
        capacity: 4,
        kind: 'gap',
        labelKey: 'link.hallway.living',
      },
    ],
  },
  {
    id: 'gate.hallway.bathroom',
    from: 'hallway',
    to: 'bathroom',
    at: { x: mm(1400), z: mm(1180) },
    surface: 'hallway.floor',
    kind: 'pipe',
    labelKey: 'gate.hallway.bathroom',
    descriptionKey: 'gate.hallway.bathroom.desc',
    requires: { workers: 9, moisture: 46, maxAlert: 3 },
    workSeconds: 8,
    opens: [
      {
        id: 'link.hallway.bathroom',
        from: 'hallway.floor',
        to: 'bathroom.floor',
        at: { x: mm(1400), z: mm(1180) },
        exitAt: { x: mm(1400), z: mm(1420) },
        seconds: 2.4,
        capacity: 3,
        kind: 'gap',
        labelKey: 'link.hallway.bathroom',
      },
    ],
  },
  {
    id: 'gate.bathroom.kitchen',
    from: 'bathroom',
    to: 'kitchen',
    at: { x: mm(560), z: mm(1620) },
    surface: 'bathroom.floor',
    kind: 'pipe',
    labelKey: 'gate.bathroom.kitchen',
    descriptionKey: 'gate.bathroom.kitchen.desc',
    // The riser is already there — the work is clearing the dried silicone at the kitchen end.
    requires: { workers: 9, moisture: 62, footholds: ['kitchen.undersink'] },
    workSeconds: 10,
    opens: [
      {
        // The shortcut. Four metres of route collapsed into one slow climb, which is what makes
        // the bathroom worth the risk for a player who took it and irrelevant for one who did not.
        id: 'link.bathroom.kitchen',
        from: 'bathroom.floor',
        to: 'kitchen.floor',
        at: { x: mm(560), z: mm(1620) },
        exitAt: { x: mm(1980), z: mm(-2700) },
        seconds: 7.2,
        capacity: 2,
        kind: 'pipe',
        labelKey: 'link.bathroom.kitchen',
      },
    ],
  },
  {
    id: 'gate.hallway.bedroom',
    from: 'hallway',
    to: 'bedroom',
    at: { x: mm(7000), z: mm(-240) },
    surface: 'hallway.floor',
    kind: 'doorsweep',
    labelKey: 'gate.hallway.bedroom',
    descriptionKey: 'gate.hallway.bedroom.desc',
    requires: {
      workers: 22,
      food: 126,
      moisture: 84,
      adaptation: 'any',
      maxAlert: 2,
    },
    workSeconds: 14,
    opens: [
      {
        id: 'link.hallway.bedroom',
        from: 'hallway.floor',
        to: 'bedroom.floor',
        at: { x: mm(7000), z: mm(-240) },
        exitAt: { x: mm(7000), z: mm(-420) },
        seconds: 3.4,
        capacity: 3,
        kind: 'gap',
        labelKey: 'link.hallway.bedroom',
      },
    ],
  },
];

/* ------------------------------------------------------------------- house */

export interface House {
  readonly regions: readonly RegionSpec[];
  readonly gates: readonly Gate[];
  readonly surfaces: ReadonlyMap<string, Surface>;
  readonly resources: ReadonlyMap<string, ResourceSite>;
  readonly footholds: ReadonlyMap<string, FootholdSite>;
  /** Every link that could ever exist, gated or not. */
  readonly allLinks: readonly Link[];
  readonly regionOf: ReadonlyMap<string, RegionId>;
}

export function buildHouse(): House {
  const surfaces = new Map<string, Surface>();
  const regionOf = new Map<string, RegionId>();
  const resources = new Map<string, ResourceSite>();
  const footholds = new Map<string, FootholdSite>();
  const allLinks: Link[] = [];

  for (const region of REGIONS) {
    for (const surface of region.surfaces) {
      if (surfaces.has(surface.id)) throw new Error(`duplicate surface id: ${surface.id}`);
      surfaces.set(surface.id, surface);
      regionOf.set(surface.id, region.id);
    }
    for (const r of region.resources) resources.set(r.id, r);
    for (const f of region.footholds) footholds.set(f.id, f);
    allLinks.push(...region.links);
  }

  for (const gate of GATES) {
    for (const link of gate.opens) allLinks.push({ ...link, gate: gate.id });
  }

  validate(surfaces, footholds, resources, allLinks);
  validateWalls();

  return { regions: REGIONS, gates: GATES, surfaces, resources, footholds, allLinks, regionOf };
}

/**
 * Check every cross-reference at load, with a message that names the offender.
 *
 * A surface-id typo that only shows up as a worker standing still four minutes into a run is the
 * single most expensive class of bug this project has had. Boundary validation is cheap here and
 * unaffordable later.
 */
function validate(
  surfaces: ReadonlyMap<string, Surface>,
  footholds: ReadonlyMap<string, FootholdSite>,
  resources: ReadonlyMap<string, ResourceSite>,
  allLinks: readonly Link[],
): void {
  const known = [...surfaces.keys()].sort().join(', ');

  for (const link of allLinks) {
    if (!surfaces.has(link.from)) {
      throw new Error(`link ${link.id} leaves unknown surface "${link.from}". known: ${known}`);
    }
    if (!surfaces.has(link.to)) {
      throw new Error(`link ${link.id} enters unknown surface "${link.to}". known: ${known}`);
    }
  }

  for (const site of [...resources.values(), ...footholds.values()]) {
    if (!surfaces.has(site.surface)) {
      throw new Error(`site ${site.id} sits on unknown surface "${site.surface}". known: ${known}`);
    }
  }

  for (const gate of GATES) {
    if (!surfaces.has(gate.surface)) {
      throw new Error(`gate ${gate.id} sits on unknown surface "${gate.surface}"`);
    }
    for (const foothold of gate.requires.footholds ?? []) {
      if (!footholds.has(foothold)) {
        throw new Error(`gate ${gate.id} requires unknown foothold "${foothold}"`);
      }
    }
    const supplied = gate.requires.suppliedFoothold;
    if (supplied && !footholds.has(supplied)) {
      throw new Error(`gate ${gate.id} requires unknown supplied foothold "${supplied}"`);
    }
  }
}

/**
 * A wall marked `solid` must never be one the camera stands in front of.
 *
 * `solid` forces a wall to full height regardless of the camera. That is only ever correct for a
 * wall on the far side of a room. When the fixed camera yaw was flipped 45° -> 225°, nine
 * `solid: true` flags — every one in the apartment — silently became flags on CAMERA-NEAR walls,
 * and four of the five regions rendered as a 2 400 mm plasterboard slab filling the frame.
 *
 * The yaw lives in the view layer and the flags live in the world layer, so nothing connected them.
 * This does, at load, by name.
 */
function validateWalls(): void {
  for (const region of REGIONS) {
    for (const wall of region.walls) {
      if (!wall.solid) continue;
      const facing = wall.outward.x * VIEW_DIR_X + wall.outward.z * VIEW_DIR_Z;
      if (facing < -0.15) {
        throw new Error(
          `${region.id}: a wall with outward (${wall.outward.x},${wall.outward.z}) is marked solid ` +
            `but faces the camera (dot ${facing.toFixed(2)}). It would block the whole room.`,
        );
      }
    }
  }
}

/**
 * Build the navigation graph for a given set of opened gates.
 *
 * Called once at boot and again each time a gate opens — a few milliseconds, and it keeps
 * reachability a property of the graph rather than a condition sprinkled through the pathfinder.
 */
export function buildNav(house: House, openGates: ReadonlySet<string>): Nav {
  const grids = new Map<string, SurfaceGrid>();
  const order: string[] = [];

  for (const region of house.regions) {
    for (const surface of region.surfaces) {
      const blockers = region.blockers.filter((b) => b.surface === surface.id).map((b) => b.rect);
      const grid = buildGrid(surface, blockers);
      for (const zone of region.exposureZones) {
        // Routine-gated zones are painted live each tick, not baked in here.
        if (zone.surface === surface.id && !zone.routine) {
          paintExposure(grid, zone.rect, zone.level);
        }
      }
      /*
       * Sync the live layer from the base layer AFTER painting.
       *
       * `buildGrid` seeds `exposure` from `baseExposure` at construction, which is before any zone
       * has been painted. Without this line every authored exposure zone in the apartment is
       * silently discarded and the whole flat reads as one uniform value — measured: 4 428 of
       * 4 428 hallway cells at 0.43, which made the safe route and the fast route identical and
       * removed chapter 2's entire mechanic without failing anything.
       */
      resetExposure(grid);
      grids.set(surface.id, grid);
      order.push(surface.id);
    }
  }

  const links = house.allLinks.filter((l) => !l.gate || openGates.has(l.gate));
  const linksFrom = new Map<string, Link[]>();
  const push = (surface: string, link: Link): void => {
    const list = linksFrom.get(surface);
    if (list) list.push(link);
    else linksFrom.set(surface, [link]);
  };
  for (const link of links) {
    push(link.from, link);
    push(link.to, link);
  }

  return { grids, order, linksFrom, links };
}

/** Which region a surface belongs to. */
export function regionOfSurface(house: House, surface: string): RegionId {
  return house.regionOf.get(surface) ?? 'kitchen';
}

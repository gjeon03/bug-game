import { describe, expect, it } from 'vitest';
import { GATES, SEALED_GATES, SEALED_REGIONS, buildHouse, buildNav } from '../../src/world/house';
import { cellCentre, isWalkable, nearestWalkable } from '../../src/world/nav';
import { mm, toMm } from '../../src/world/units';

/**
 * Does the authored apartment actually work as a place?
 *
 * Typecheck proves the five region files have the right *shape*. It cannot prove that a foothold
 * sits somewhere a cockroach can stand, that the regions tile without overlapping, or that opening
 * the bedroom gate makes the bedroom reachable. Those are runtime facts about authored data, and
 * they are exactly the facts that fail silently — as a worker standing still four minutes into a
 * run rather than as an error.
 */

const house = buildHouse();
const ALL_GATES = new Set(GATES.map((g) => g.id));
const openNav = buildNav(house, ALL_GATES);

describe('the apartment assembles', () => {
  it('builds without an unresolved cross-reference', () => {
    // buildHouse throws with the offending id if any link, site or gate names a surface that does
    // not exist. Reaching this line at all is the assertion.
    expect(house.regions).toHaveLength(1);
    expect(house.regions[0]?.id).toBe('kitchen');
    /*
     * The kitchen currently stands on two planes: the floor and the worktop. That is the honest
     * measure of how thin it is — a room a player is meant to spend a whole run in, with two places
     * to be. This number is expected to GROW as the kitchen is built out; it is here so that growth
     * is visible in the diff rather than assumed.
     */
    expect(house.surfaces.size).toBeGreaterThanOrEqual(2);
  });

  it('gives every region a floor and at least one foothold', () => {
    for (const region of house.regions) {
      const floor = region.surfaces.find((s) => s.id === `${region.id}.floor`);
      expect(floor, `${region.id} has no <region>.floor surface`).toBeDefined();
      expect(region.footholds.length, `${region.id} has no footholds`).toBeGreaterThan(0);
    }
  });

  it('places the five region envelopes without overlapping in plan', () => {
    const rects = house.regions.map((r) => ({ id: r.id, ...r.bounds }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        const overlaps = overlapX > 1 && overlapZ > 1;
        expect(overlaps, `${a.id} overlaps ${b.id} by ${toMm(overlapX)}x${toMm(overlapZ)} mm`).toBe(
          false,
        );
      }
    }
  });
});

describe('every authored site stands somewhere a cockroach can stand', () => {
  /**
   * The tolerance is deliberately tight. `nearestWalkable` will happily relocate a site by half a
   * metre, which would silently move a foothold out from under the wardrobe it is named after. A
   * site that has to move more than two grid cells is an authoring error, not a rounding artefact.
   */
  const MAX_MOVE_MM = 135;

  it.each([...house.footholds.values()].map((f) => [f.id, f] as const))(
    'foothold %s resolves to walkable space',
    (_id, foothold) => {
      const hit = nearestWalkable(openNav, foothold.surface, foothold.at.x, foothold.at.z);
      expect(hit, `${foothold.id} has no walkable cell within 12 rings`).not.toBeNull();
      expect(toMm(hit!.moved)).toBeLessThan(MAX_MOVE_MM);
    },
  );

  it.each([...house.resources.values()].map((r) => [r.id, r] as const))(
    'resource %s resolves to walkable space',
    (_id, resource) => {
      const hit = nearestWalkable(openNav, resource.surface, resource.at.x, resource.at.z);
      expect(hit, `${resource.id} has no walkable cell within 12 rings`).not.toBeNull();
      expect(toMm(hit!.moved)).toBeLessThan(MAX_MOVE_MM);
    },
  );

  it.each(GATES.map((g) => [g.id, g] as const))(
    'gate %s can be reached and worked',
    (_id, gate) => {
      const hit = nearestWalkable(openNav, gate.surface, gate.at.x, gate.at.z);
      expect(hit, `${gate.id} is not standable`).not.toBeNull();
      expect(toMm(hit!.moved)).toBeLessThan(MAX_MOVE_MM);
    },
  );
});

describe('the rest of the flat is absent, not merely locked', () => {
  /*
   * The kitchen is the whole game now, and this is the contract that says so structurally.
   *
   * "Locked" would be a flag somebody could forget to check. Shipping no gates means there is no
   * navigation edge out of the kitchen at all — nothing can path there, no worker can wander there,
   * no objective can ask for it. The authored passages still exist in `SEALED_GATES`, so bringing a
   * room back is adding it to `REGIONS` and restoring its gate, not re-deriving it.
   */
  it('ships no gates, so no edge leaves the kitchen', () => {
    const house = buildHouse();
    expect(house.gates).toEqual([]);
    expect(GATES).toEqual([]);
  });

  it('keeps the sealed rooms authored and typechecked, so they can come back', () => {
    expect(SEALED_REGIONS.map((r) => r.id).sort()).toEqual(
      ['bathroom', 'bedroom', 'hallway', 'living'].sort(),
    );
    expect(SEALED_GATES.length).toBeGreaterThan(0);
  });

  it('builds a navigation graph containing only kitchen surfaces', () => {
    const house = buildHouse();
    const nav = buildNav(house, new Set());
    for (const id of nav.grids.keys()) {
      expect(id.startsWith('kitchen.'), `${id} should not exist while the kitchen is the game`).toBe(
        true,
      );
    }
    for (const link of nav.links) {
      expect(link.from.startsWith('kitchen.')).toBe(true);
      expect(link.to.startsWith('kitchen.')).toBe(true);
    }
  });
});

describe('the apartment is dense enough to read as somewhere people live', () => {
  it.each(house.regions.map((r) => [r.id, r] as const))('%s carries authored props', (_id, r) => {
    expect(r.props.length, `${r.id} has only ${r.props.length} props`).toBeGreaterThanOrEqual(20);
  });

  it('lights every region from something visible', () => {
    for (const region of house.regions) {
      expect(region.lights.length, `${region.id} has no lights`).toBeGreaterThan(0);
    }
  });

  it('carries no player-facing text in world data', () => {
    // Every label is a catalog key. A key has dots and no spaces; a sentence does not.
    const keys: string[] = [];
    for (const region of house.regions) {
      keys.push(region.labelKey);
      for (const s of region.surfaces) keys.push(s.labelKey);
      for (const r of region.resources) keys.push(r.labelKey);
      for (const f of region.footholds) keys.push(f.labelKey, f.descriptionKey);
      for (const l of region.links) keys.push(l.labelKey);
    }
    for (const gate of GATES) keys.push(gate.labelKey, gate.descriptionKey);

    for (const key of keys) {
      expect(key, `"${key}" looks like prose, not a catalog key`).toMatch(/^[a-z][a-zA-Z0-9.]*$/);
    }
  });
});

/**
 * A raised surface must not be walkable where there is nothing under it.
 *
 * `kitchen.counter` is authored as one rectangle, but the worktop it represents is an L: a north run
 * across the full width, and an east run turning the corner. The inside of the L — 3.1 m by 1.2 m of
 * it — was walkable at y = 880 mm with nothing beneath, so climbing to the worktop and walking
 * inward left the scout striding through mid-air over the floor. A player found it in about a
 * minute ("싱크대 위로 올라가서 돌아다니니 그냥 떠서 돌아다녀졌어"); no automated gate did.
 *
 * The general rule this encodes: for every surface above y = 0, every walkable cell has to sit over
 * authored geometry. Bounds are a cheap rectangle, and a cheap rectangle is a lie for any worktop
 * that turns a corner.
 */
describe('raised surfaces are only walkable where something holds them up', () => {
  const COUNTER_H = 880;
  const NORTH_FACE = -2640;
  const EAST_FACE = 3140;

  it('the inside of the kitchen worktop L is not walkable', () => {
    const house = buildHouse();
    const nav = buildNav(house, new Set());

    // Dead centre of the void: past the north run's face, west of the east run.
    const voidSamples: readonly (readonly [number, number])[] = [
      [1500, -2000],
      [800, -1600],
      [2500, -1800],
      [2000, -2400],
      [400, -2500],
      // Just past the north run's face — the rasteriser rounds conservatively, so this is where a
      // one-cell strip of floating would survive if the blocker were authored short.
      [1500, -2560],
      [1500, -1450],
    ];
    for (const [x, z] of voidSamples) {
      expect(
        isWalkable(nav, 'kitchen.counter', mm(x), mm(z)),
        `counter should be void at (${x}, ${z}) — nothing is under it`,
      ).toBe(false);
    }
  });

  it('the worktop itself is still walkable on both runs', () => {
    const house = buildHouse();
    const nav = buildNav(house, new Set());

    // North run, well inside its 660 mm depth.
    expect(isWalkable(nav, 'kitchen.counter', mm(1200), mm(-2900)), 'north run').toBe(true);
    // East run, past the corner.
    expect(isWalkable(nav, 'kitchen.counter', mm(3500), mm(-2000)), 'east run').toBe(true);
    void COUNTER_H;
    void NORTH_FACE;
    void EAST_FACE;
  });
});

/**
 * Every raised surface must say where it is held up — or be on the record as not yet checked.
 *
 * This is the general form of the worktop defect. A surface is a rectangle because a grid is a
 * rectangle; furniture usually is not. Wherever the two disagree the difference is walkable
 * emptiness, and above the floor that reads as the scout walking on air.
 *
 * The kitchen is the region under active work, so its surfaces must declare `support`. The other
 * regions are listed explicitly rather than skipped silently: this test is the record that they
 * have NOT been verified, and it fails the moment someone adds a raised surface without deciding.
 */
describe('raised surfaces declare their footprint', () => {
  /** Raised surfaces outside the kitchen, not yet audited. Shrink this list; never grow it. */
  const UNVERIFIED: ReadonlySet<string> = new Set([
    'hallway.shoetop',
    'living.sofa.seat',
    'living.table.top',
    'living.tvstand.top',
    'bathroom.pipevoid',
    'bathroom.basin',
    'bathroom.shelf',
    'bathroom.cistern',
    'bathroom.tray',
    'bedroom.bed',
    'bedroom.bedside',
    'bedroom.sill',
  ]);

  it('kitchen raised surfaces declare support, and the debt list is honest', () => {
    const house = buildHouse();
    const missing: string[] = [];
    const unknown: string[] = [];

    for (const surface of house.surfaces.values()) {
      if (surface.y <= 0) continue;
      if (surface.support && surface.support.length > 0) continue;
      if (surface.region === 'kitchen') missing.push(surface.id);
      else if (!UNVERIFIED.has(surface.id)) unknown.push(surface.id);
    }

    expect(missing, 'kitchen raised surfaces without a declared footprint').toEqual([]);
    expect(
      unknown,
      'a raised surface appeared that is neither verified nor on the debt list — decide which',
    ).toEqual([]);
  });

  it('a declared footprint actually removes area, or it is not saying anything', () => {
    const house = buildHouse();
    const counter = house.surfaces.get('kitchen.counter');
    expect(counter?.support?.length ?? 0).toBeGreaterThan(1);

    const nav = buildNav(house, new Set());
    const grid = nav.grids.get('kitchen.counter');
    expect(grid).toBeDefined();
    if (!grid) return;

    let walkable = 0;
    for (let i = 0; i < grid.flags.length; i++) if (grid.flags[i] === 0) walkable++;
    const fraction = walkable / grid.flags.length;
    // The L covers appreciably less than its bounding box; if this ever reaches ~1 the footprint
    // has stopped constraining anything.
    expect(fraction).toBeLessThan(0.75);
    expect(fraction).toBeGreaterThan(0.2);
  });
});

/**
 * A grid is a whole number of cells, so it always overhangs its surface a little. That is fine —
 * what is not fine is any of that overhang being WALKABLE.
 *
 * `cols`/`rows` round up, leaving up to a cell of slack past the far edge: 40 mm in x on both
 * kitchen surfaces, with `kitchen.floor` cell 63 centred at 3810 mm against a 3800 mm bound. No
 * authored blocker reaches past the room, so conservative rasterisation never covered it and the
 * room had a thin lip of standable space outside itself.
 */
describe('grids do not extend the room', () => {
  it('no walkable cell centre lies outside its surface bounds', () => {
    const nav = buildNav(house, new Set());
    const outside: string[] = [];

    for (const [id, grid] of nav.grids) {
      const b = grid.surface.bounds;
      for (let i = 0; i < grid.flags.length; i++) {
        if (grid.flags[i] !== 0) continue;
        const c = cellCentre(grid, i);
        if (c.x < b.x0 || c.x > b.x1 || c.z < b.z0 || c.z > b.z1) {
          outside.push(`${id} cell ${i} at (${Math.round(toMm(c.x))}, ${Math.round(toMm(c.z))})mm`);
          break;
        }
      }
    }

    expect(outside, 'walkable cells outside the room').toEqual([]);
  });
});

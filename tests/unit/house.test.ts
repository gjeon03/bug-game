import { describe, expect, it } from 'vitest';
import { GATES, buildHouse, buildNav } from '../../src/world/house';
import { findPath, nearestWalkable } from '../../src/world/nav';
import { toMm } from '../../src/world/units';
import type { RegionId } from '../../src/world/types';

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
const sealedNav = buildNav(house, new Set<string>());

describe('the apartment assembles', () => {
  it('builds without an unresolved cross-reference', () => {
    // buildHouse throws with the offending id if any link, site or gate names a surface that does
    // not exist. Reaching this line at all is the assertion.
    expect(house.regions).toHaveLength(5);
    expect(house.surfaces.size).toBeGreaterThan(10);
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

describe('progression is physical, not a flag', () => {
  const home = house.footholds.get('kitchen.undersink');

  it('starts the colony in the kitchen', () => {
    expect(home).toBeDefined();
    expect(home!.initial).toBe(true);
    expect(home!.region).toBe('kitchen');
  });

  const reachable = (regionId: RegionId, nav = openNav): boolean => {
    const region = house.regions.find((r) => r.id === regionId)!;
    const target = region.footholds[0]!;
    const path = findPath(
      nav,
      { surface: home!.surface, x: home!.at.x, z: home!.at.z },
      { surface: target.surface, x: target.at.x, z: target.at.z },
    );
    return path.ok;
  };

  it('seals every region except the kitchen when no gate is open', () => {
    // This is the strong form of the claim. It is not "the UI hides the bedroom" — there is no
    // edge in the graph, so no sequence of legal moves reaches it.
    expect(reachable('kitchen', sealedNav)).toBe(true);
    for (const id of ['hallway', 'living', 'bathroom', 'bedroom'] as const) {
      expect(reachable(id, sealedNav), `${id} is reachable before its gate opened`).toBe(false);
    }
  });

  it('makes every region reachable once its gate is open', () => {
    for (const id of ['kitchen', 'hallway', 'living', 'bathroom', 'bedroom'] as const) {
      expect(reachable(id, openNav), `${id} is unreachable with all gates open`).toBe(true);
    }
  });

  it('opens regions one at a time, in the authored order', () => {
    // Opening only the kitchen gate must reach the hallway and nothing further. If this fails, a
    // region is being entered through the wrong door.
    const nav = buildNav(house, new Set(['gate.kitchen.hallway']));
    expect(reachable('hallway', nav)).toBe(true);
    expect(reachable('living', nav)).toBe(false);
    expect(reachable('bedroom', nav)).toBe(false);
  });

  it('makes the bathroom pipe a genuine shortcut, not a reskin of the hallway', () => {
    const kitchen = house.footholds.get('kitchen.undersink')!;
    const bathroom = house.regions.find((r) => r.id === 'bathroom')!.footholds[0]!;

    const viaHallway = findPath(
      buildNav(house, new Set(['gate.kitchen.hallway', 'gate.hallway.bathroom'])),
      { surface: kitchen.surface, x: kitchen.at.x, z: kitchen.at.z },
      { surface: bathroom.surface, x: bathroom.at.x, z: bathroom.at.z },
    );
    const viaPipe = findPath(
      buildNav(
        house,
        new Set(['gate.kitchen.hallway', 'gate.hallway.bathroom', 'gate.bathroom.kitchen']),
      ),
      { surface: kitchen.surface, x: kitchen.at.x, z: kitchen.at.z },
      { surface: bathroom.surface, x: bathroom.at.x, z: bathroom.at.z },
    );

    expect(viaHallway.ok).toBe(true);
    expect(viaPipe.ok).toBe(true);
    // The shortcut has to actually be shorter, or it is a decoration with a cost.
    expect(viaPipe.length).toBeLessThan(viaHallway.length);
  });
});

describe('the hallway is an exposure problem, not a resource problem', () => {
  it('offers a safer, longer route and a shorter, riskier one', () => {
    const nav = buildNav(house, new Set(['gate.kitchen.hallway']));
    const hallway = house.regions.find((r) => r.id === 'hallway')!;
    const from = { surface: 'hallway.floor', x: hallway.bounds.x0 + 200, z: 0 };
    const to = { surface: 'hallway.floor', x: hallway.bounds.x1 - 400, z: 0 };

    const reckless = findPath(nav, from, to, { exposureWeight: 0 });
    const careful = findPath(nav, from, to, { exposureWeight: 6 });

    expect(reckless.ok).toBe(true);
    expect(careful.ok).toBe(true);
    // The careful route must be measurably safer. If these are equal the corridor has no
    // exposure gradient and chapter 2 has no mechanic.
    expect(careful.exposure).toBeLessThan(reckless.exposure);
    // ...and it must cost something, or there is no decision.
    expect(careful.length).toBeGreaterThan(reckless.length);
  });

  it('carries less food than the kitchen', () => {
    const foodIn = (region: RegionId): number =>
      house.regions
        .find((r) => r.id === region)!
        .resources.filter((r) => r.kind === 'food')
        .reduce((sum, r) => sum + r.amount, 0);

    expect(foodIn('hallway')).toBeLessThan(foodIn('kitchen') * 0.35);
  });
});

describe('the bedroom is the scarcity chapter', () => {
  const total = (region: RegionId): number =>
    house.regions.find((r) => r.id === region)!.resources.reduce((sum, r) => sum + r.amount, 0);

  it('has less food and moisture than the kitchen or the living room', () => {
    expect(total('bedroom')).toBeLessThan(total('kitchen'));
    expect(total('bedroom')).toBeLessThan(total('living'));
  });

  it('makes everything near the sleeper expensive to touch', () => {
    const mean = (region: RegionId): number => {
      const list = house.regions.find((r) => r.id === region)!.resources;
      return list.reduce((sum, r) => sum + r.disturbance, 0) / list.length;
    };
    expect(mean('bedroom')).toBeGreaterThan(mean('kitchen'));
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

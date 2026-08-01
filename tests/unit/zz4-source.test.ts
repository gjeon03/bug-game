import { describe, expect, it } from 'vitest';
import { createWorld, type World } from '../../src/sim/world.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { firstResource, HOME, pt, satellitesFor } from '../map.ts';
import { claimNest, layLine, playFor, type PlayerOptions } from './play.ts';
import { activeRoutine } from '../../src/sim/routines.ts';

const COVERED: PlayerOptions = { style: 'covered' };

/** Records how long each hud.source is on screen, by intercepting every assignment. */
function occupancy(world: World) {
  const total = new Map<string, number>();
  let hud = world.hud;
  let last = hud.source;
  let lastT = 0;
  Object.defineProperty(world, 'hud', {
    get: () => hud,
    set: (v) => {
      if (v.source !== last) {
        total.set(last, (total.get(last) ?? 0) + (world.time - lastT));
        last = v.source;
        lastT = world.time;
      }
      hud = v;
    },
    configurable: true,
  });
  return {
    finish: (w: World) => {
      total.set(last, (total.get(last) ?? 0) + (w.time - lastT));
      return total;
    },
  };
}

describe('zz hud source occupancy', () => {
  it('what fraction of the run is each objective rule in charge', () => {
    const world = createWorld(31337);
    const occ = occupancy(world);
    layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), COVERED);
    layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y }, COVERED);
    const until = world.time + 600;
    while (world.time < until && world.status === 'playing') {
      playFor(world, 20, COVERED);
      for (const sat of satellitesFor(world.operation)) {
        const n = world.nests.find((x) => x.id === sat.id)!;
        if (n.claimed || world.colony.food < sat.costFood + 25) continue;
        claimNest(world, sat.id, COVERED);
        break;
      }
    }
    const map = occ.finish(world);
    const t = world.time;
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
    console.log(
      [
        `run t=${t.toFixed(0)} status=${world.status} op=${world.operation}`,
        ...rows.map(
          ([k, v]) => `  ${((v / t) * 100).toFixed(1).padStart(5)}%  ${v.toFixed(0).padStart(4)}s  ${k}`,
        ),
      ].join('\n'),
    );
    expect(rows.length).toBeGreaterThan(0);
  }, 300_000);

  it('routine duty cycle with no player at all', () => {
    const world = createWorld(31337);
    world.operation = 2;
    let up = 0;
    let incoming = 0;
    let count = 0;
    let lastId = -1;
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 600; i++) {
      world.colony.food = 60;
      world.colony.water = 60;
      stepWorld(world, dt);
      const r = activeRoutine(world);
      if (r) {
        up += dt;
        if (r.phase === 'incoming') incoming += dt;
        if (r.id !== lastId) {
          lastId = r.id;
          count++;
        }
      }
    }
    console.log(
      `600 s at operation 2: ${count} routines; incoming-or-active ${up.toFixed(0)}s = ${((up / 600) * 100).toFixed(0)}% of the time (of which incoming ${incoming.toFixed(0)}s)`,
    );
    expect(count).toBeGreaterThan(0);
  }, 300_000);

  it('routine duty cycle at operation 3', () => {
    const world = createWorld(31337);
    world.operation = 3;
    let up = 0;
    let count = 0;
    let lastId = -1;
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 600; i++) {
      world.colony.food = 60;
      world.colony.water = 60;
      stepWorld(world, dt);
      const r = activeRoutine(world);
      if (r) {
        up += dt;
        if (r.id !== lastId) {
          lastId = r.id;
          count++;
        }
      }
    }
    console.log(
      `600 s at operation 3: ${count} routines; incoming-or-active ${up.toFixed(0)}s = ${((up / 600) * 100).toFixed(0)}%`,
    );
    expect(count).toBeGreaterThan(0);
  }, 300_000);
});

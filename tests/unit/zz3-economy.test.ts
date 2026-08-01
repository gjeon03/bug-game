import { describe, expect, it } from 'vitest';
import { createWorld, type World } from '../../src/sim/world.ts';
import { firstResource, HOME, pt, satellitesFor } from '../map.ts';
import { claimNest, fitOut, layLine, playFor, type PlayerOptions } from './play.ts';
import { heldZones } from '../../src/sim/territory.ts';
import { knownCellCount, totalHeat } from '../../src/sim/heat.ts';
import { currentGate } from '../../src/sim/operations.ts';

const COVERED: PlayerOptions = { style: 'covered' };

function snapshot(w: World): string {
  const g = currentGate(w);
  return [
    `t=${w.time.toFixed(0).padStart(4)}`,
    `op${w.operation}`,
    `gate=${g?.id ?? 'none'}`,
    `pop=${String(w.colony.population).padStart(2)}/${w.colony.capacity}`,
    `food=${w.colony.food.toFixed(0).padStart(3)}/${w.colony.foodCap}`,
    `wat=${w.colony.water.toFixed(0).padStart(3)}/${w.colony.waterCap}`,
    `routes=${w.routes.filter((r) => r.linked).length}/${w.routes.length}`,
    `claims=${w.nests.filter((n) => n.claimed).length}`,
    `fn=${w.nests.filter((n) => n.fn).length}`,
    `adapt=${w.adaptations.taken.length}(offer ${w.adaptations.offer.length})`,
    `routExp=${w.stats.routinesExploited}`,
    `tier=${w.suspicion.tier}`,
    `heat=${totalHeat(w).toFixed(1)}/${knownCellCount(w)}`,
    `zones=${heldZones(w).length}`,
    `deliv=${w.stats.deliveries}`,
    `src=${w.hud.source}`,
  ].join(' ');
}

/** Sources: how much stock is left in the whole kitchen. */
function stock(w: World): string {
  return w.resources
    .filter((r) => !r.id.startsWith('routine:'))
    .map((r) => `${r.id}:${r.amount.toFixed(0)}/${r.initial.toFixed(0)}`)
    .join(' ');
}

function run(seed: number, seconds: number, opts: PlayerOptions = COVERED) {
  const world = createWorld(seed);
  const log: string[] = [];
  layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), opts);
  layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y }, opts);

  const until = world.time + seconds;
  let nextLog = 0;
  while (world.time < until && world.status === 'playing') {
    playFor(world, 20, opts);
    for (const sat of satellitesFor(world.operation)) {
      const n = world.nests.find((x) => x.id === sat.id)!;
      if (n.claimed) continue;
      if (world.colony.food < sat.costFood + 25) continue;
      claimNest(world, sat.id, opts);
      break;
    }
    for (const n of world.nests) {
      if (!n.claimed || n.home || n.fn !== null) continue;
      if (world.colony.food < n.fitFood + 20) continue;
      fitOut(world, n.id, world.colony.caches === 0 ? 'cache' : 'nursery', opts);
      break;
    }
    if (world.time >= nextLog) {
      log.push(snapshot(world));
      nextLog = world.time + 30;
    }
  }
  log.push(snapshot(world));
  log.push(`END status=${world.status} cause=${world.loseCause ?? '—'} ` + JSON.stringify(world.finalTally));
  log.push(`stock: ${stock(world)}`);
  return { world, log };
}

describe('zz economy + stall', () => {
  it('traces the stalled seed', () => {
    const { log } = run(20260801, 900);
    console.log(log.join('\n'));
  }, 300_000);

  it('traces the exterminated seed', () => {
    const { log } = run(31337, 900);
    console.log(log.join('\n'));
  }, 300_000);

  it('how many seeds win at all', () => {
    const out: string[] = [];
    for (const seed of [1, 7, 99, 421, 909, 5150, 31337, 20260801]) {
      const { world } = run(seed, 900);
      out.push(
        `seed ${String(seed).padEnd(9)} -> ${world.status.padEnd(8)} cause=${(world.loseCause ?? '—').padEnd(14)} t=${world.time.toFixed(0).padStart(4)} op=${world.operation} pop=${world.colony.population} zones=${heldZones(world).length} adapt=${world.adaptations.taken.length} deliv=${world.stats.deliveries}`,
      );
    }
    console.log(out.join('\n'));
    expect(out.length).toBe(8);
  }, 900_000);
});

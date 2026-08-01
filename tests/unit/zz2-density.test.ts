import { describe, expect, it } from 'vitest';
import { createWorld, type World } from '../../src/sim/world.ts';
import type { GameEvent } from '../../src/sim/types.ts';
import { firstResource, HOME, pt, satellitesFor } from '../map.ts';
import { bankUntil, claimNest, fitOut, layLine, playFor, type PlayerOptions } from './play.ts';

interface Beat {
  t: number;
  what: string;
}

/** Anything a player would notice as "something new to think about". */
const NOTABLE = new Set<GameEvent['t']>([
  'adaptOffer',
  'adapt',
  'operation',
  'routineWarn',
  'routineStart',
  'routineEnd',
  'trapArmed',
  'sprayStart',
  'sweepWarn',
  'footWarn',
  'tier',
  'zoneHeld',
  'zoneLost',
  'finalResponse',
  'claim',
  'fitOut',
  'routeDry',
  'routeLost',
  'win',
  'lose',
]);

function instrument(world: World): { beats: Beat[]; sources: Beat[] } {
  const beats: Beat[] = [];
  const sources: Beat[] = [];

  const arr = world.events;
  const origPush = Array.prototype.push.bind(arr);
  (arr as unknown as { push: (...a: GameEvent[]) => number }).push = (...items: GameEvent[]) => {
    for (const e of items) {
      if (NOTABLE.has(e.t)) beats.push({ t: world.time, what: e.t + (('kind' in e ? `:${String(e.kind)}` : '') as string) });
    }
    return origPush(...items);
  };

  let hud = world.hud;
  let lastSource = '';
  Object.defineProperty(world, 'hud', {
    get: () => hud,
    set: (v) => {
      hud = v;
      if (v.source !== lastSource) {
        lastSource = v.source;
        sources.push({ t: world.time, what: `${v.source} :: ${v.objective}` });
      }
    },
    configurable: true,
  });
  return { beats, sources };
}

function gaps(times: number[], end: number): { max: number; at: number } {
  let max = 0;
  let at = 0;
  let prev = 0;
  for (const t of times) {
    if (t - prev > max) {
      max = t - prev;
      at = prev;
    }
    prev = t;
  }
  if (end - prev > max) {
    max = end - prev;
    at = prev;
  }
  return { max, at };
}

const COVERED: PlayerOptions = { style: 'covered' };

function fullRun(seed: number, seconds: number) {
  const world = createWorld(seed);
  const rec = instrument(world);
  layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), COVERED);
  layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y }, COVERED);

  const until = world.time + seconds;
  while (world.time < until && world.status === 'playing') {
    playFor(world, 20, COVERED);
    for (const sat of satellitesFor(world.operation)) {
      const n = world.nests.find((x) => x.id === sat.id)!;
      if (n.claimed) continue;
      if (world.colony.food < sat.costFood + 25) continue;
      claimNest(world, sat.id, COVERED);
      break;
    }
    for (const n of world.nests) {
      if (!n.claimed || n.home || n.fn !== null) continue;
      if (world.colony.food < n.fitFood + 20) continue;
      fitOut(world, n.id, world.colony.caches === 0 ? 'cache' : 'nursery', COVERED);
      break;
    }
  }
  return { world, rec };
}

describe('zz decision density', () => {
  it('measures the longest decision-free plateau in a competent full run', () => {
    const { world, rec } = fullRun(31337, 900);
    const end = world.time;
    const all = [...rec.beats.map((b) => b.t), ...rec.sources.map((s) => s.t)].sort((a, b) => a - b);
    const g = gaps(all, end);
    const gs = gaps(
      rec.sources.map((s) => s.t),
      end,
    );
    const gb = gaps(
      rec.beats.map((b) => b.t),
      end,
    );

    console.log(
      [
        `run: ${world.status} t=${end.toFixed(1)} op=${world.operation} pop=${world.colony.population} deliveries=${world.stats.deliveries}`,
        `beats: ${rec.beats.length}, source-changes: ${rec.sources.length}`,
        `LONGEST GAP (source OR beat): ${g.max.toFixed(1)}s starting at t=${g.at.toFixed(1)}`,
        `LONGEST GAP (source only):    ${gs.max.toFixed(1)}s starting at t=${gs.at.toFixed(1)}`,
        `LONGEST GAP (beats only):     ${gb.max.toFixed(1)}s starting at t=${gb.at.toFixed(1)}`,
        '',
        '── source timeline ──',
        ...rec.sources.map((s) => `  ${s.t.toFixed(1).padStart(7)}  ${s.what}`),
        '',
        '── beat timeline ──',
        ...rec.beats.map((b) => `  ${b.t.toFixed(1).padStart(7)}  ${b.what}`),
      ].join('\n'),
    );
    expect(end).toBeGreaterThan(0);
  }, 300_000);

  it('measures a second seed', () => {
    const { world, rec } = fullRun(20260801, 900);
    const end = world.time;
    const all = [...rec.beats.map((b) => b.t), ...rec.sources.map((s) => s.t)].sort((a, b) => a - b);
    const g = gaps(all, end);
    console.log(
      [
        `run: ${world.status} t=${end.toFixed(1)} op=${world.operation} pop=${world.colony.population}`,
        `LONGEST GAP (source OR beat): ${g.max.toFixed(1)}s starting at t=${g.at.toFixed(1)}`,
        '── source timeline ──',
        ...rec.sources.map((s) => `  ${s.t.toFixed(1).padStart(7)}  ${s.what}`),
      ].join('\n'),
    );
    expect(end).toBeGreaterThan(0);
  }, 300_000);
});

import { describe, expect, it } from 'vitest';
import { createWorld, type World } from '../../src/sim/world.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { SIM_DT } from '../../src/core/clock.ts';
import { heatIndexAt, heatCellCentre, HEAT_COLS } from '../../src/sim/heat.ts';
import { regionName } from '../../src/sim/director.ts';
import { zoneAt, ZONES, HOLD_THRESHOLD, HOLD_GAIN, HOLD_DECAY, HOLD_SUPPRESS, HOLD_FULL_STAFF } from '../../src/sim/territory.ts';
import { firstResource, HOME, pt, mostExposedPoint } from '../map.ts';
import { layLine, playFor, type PlayerOptions } from './play.ts';
import { idle } from './helpers.ts';

const COVERED: PlayerOptions = { style: 'covered' };

describe('zz household aiming', () => {
  it('do traps/sweeps/sprays land where the player actually worked', () => {
    const world = createWorld(4242);
    layLine(world, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), COVERED);
    layLine(world, pt(firstResource('water')), { x: HOME.x + 30, y: HOME.y }, COVERED);

    const placements: string[] = [];
    let hazards = 0;
    let sweeps = 0;
    let sprays = 0;
    let patrols = 0;
    const until = world.time + 500;
    while (world.time < until && world.status === 'playing') {
      playFor(world, 10, COVERED);
      for (const h of world.hazards.slice(hazards)) {
        placements.push(`hazard ${h.kind} @${h.x.toFixed(0)},${h.y.toFixed(0)} = ${regionName(h.x, h.y)} / zone ${zoneAt(h.x, h.y)?.id ?? '—'}`);
      }
      hazards = world.hazards.length;
      for (const s of world.sweeps.slice(sweeps)) {
        placements.push(`sweep  @${s.x.toFixed(0)},${s.y.toFixed(0)} = ${regionName(s.x, s.y)}`);
      }
      sweeps = world.sweeps.length;
      for (const s of world.sprays.slice(sprays)) {
        placements.push(`spray  @${s.x.toFixed(0)},${s.y.toFixed(0)} = ${regionName(s.x, s.y)}`);
      }
      sprays = world.sprays.length;
      for (const p of world.patrols.slice(patrols)) {
        placements.push(`patrol @${p.x.toFixed(0)},${p.y.toFixed(0)} = ${regionName(p.x, p.y)}`);
      }
      patrols = world.patrols.length;
    }

    // Where did the colony actually live?
    const cells: { i: number; v: number }[] = [];
    for (let i = 0; i < world.heat.value.length; i++) {
      if (world.heat.value[i] > 0.01) cells.push({ i, v: world.heat.value[i] });
    }
    cells.sort((a, b) => b.v - a.v);
    console.log('── hottest cells (household memory) ──');
    for (const c of cells.slice(0, 8)) {
      const p = heatCellCentre(c.i);
      console.log(`  ${c.v.toFixed(3)}  cell ${c.i} (${(c.i % HEAT_COLS)},${Math.floor(c.i / HEAT_COLS)}) @${p.x.toFixed(0)},${p.y.toFixed(0)} = ${regionName(p.x, p.y)}`);
    }
    console.log('\n── where the household acted ──');
    console.log(placements.map((p) => '  ' + p).join('\n'));
    const home = `home crack region: ${regionName(HOME.x, HOME.y)}; food source region: ${regionName(firstResource('food').x, firstResource('food').y)}`;
    console.log('\n' + home);
    expect(placements.length).toBeGreaterThan(0);
  }, 300_000);

  it('heat deposited by a short covered line vs a long exposed line', () => {
    const measure = (opts: PlayerOptions) => {
      const w = createWorld(777);
      layLine(w, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), opts);
      idle(w, 200);
      let total = 0;
      let peak = 0;
      let peakIdx = -1;
      for (let i = 0; i < w.heat.value.length; i++) {
        total += w.heat.value[i];
        if (w.heat.value[i] > peak) {
          peak = w.heat.value[i];
          peakIdx = i;
        }
      }
      const c = heatCellCentre(peakIdx);
      return `total=${total.toFixed(3)} peak=${peak.toFixed(3)} at ${regionName(c.x, c.y)} droppings=${w.suspicion.causes.droppings.toFixed(1)} traffic=${w.suspicion.causes.traffic.toFixed(1)} tier=${w.suspicion.tier}`;
    };
    console.log(`covered: ${measure({ style: 'covered' })}`);
    console.log(`through the light: ${measure({ style: 'open', detour: true })}`);
    console.log(`brightest tile is ${JSON.stringify(mostExposedPoint())} = ${regionName(mostExposedPoint().x, mostExposedPoint().y)}`);
  }, 300_000);
});

describe('zz territory arithmetic', () => {
  it('what it costs to hold three zones', () => {
    const secondsToHold = HOLD_THRESHOLD / HOLD_GAIN;
    const secondsToLoseIdle = HOLD_THRESHOLD / HOLD_DECAY;
    const secondsToLoseContested = HOLD_THRESHOLD / (HOLD_DECAY + HOLD_SUPPRESS);
    console.log(
      [
        `full staff = ${HOLD_FULL_STAFF} workers inside the zone, with a linked route through it`,
        `0 -> held  : ${secondsToHold.toFixed(1)}s at full staff (${(secondsToHold * 2).toFixed(1)}s at half staff)`,
        `held -> 0 unattended : ${secondsToLoseIdle.toFixed(1)}s`,
        `held -> 0 contested  : ${secondsToLoseContested.toFixed(1)}s  (household wipes hold ${((HOLD_DECAY + HOLD_SUPPRESS) / HOLD_GAIN).toFixed(1)}x faster than you build it)`,
        `3 zones at full staff needs ${HOLD_FULL_STAFF * 3} workers standing in three different regions at once, each with its own linked route`,
        '',
        'zones the opening route already sits in:',
        `  home crack (${HOME.x},${HOME.y}) -> ${zoneAt(HOME.x, HOME.y)?.id ?? 'none'}`,
        `  first food (${firstResource('food').x},${firstResource('food').y}) -> ${zoneAt(firstResource('food').x, firstResource('food').y)?.id ?? 'none'}`,
        `  first water (${firstResource('water').x},${firstResource('water').y}) -> ${zoneAt(firstResource('water').x, firstResource('water').y)?.id ?? 'none'}`,
        '',
        'zone list: ' + ZONES.map((z) => z.id).join(', '),
      ].join('\n'),
    );
    expect(secondsToHold).toBeGreaterThan(0);
  });

  it('sheltering vs holding: what happens to hold during the extermination', () => {
    const w = createWorld(88);
    w.operation = 4;
    // A colony that has genuinely done the work: three zones held, a real population.
    for (let i = 0; i < 3; i++) w.zones[i].hold = 1;
    w.colony.food = 200;
    w.colony.water = 150;
    w.finalResponse = true;
    w.finalResponseTime = 0;
    const lines: string[] = [];
    for (let i = 0; i < 60 * 64; i++) {
      stepWorld(w, SIM_DT);
      if (i % (60 * 8) === 0) {
        lines.push(
          `t=${w.finalResponseTime.toFixed(0).padStart(3)} pop=${w.colony.population} sprays=${w.sprays.length} holds=[${w.zones.map((z) => z.hold.toFixed(2)).join(' ')}] held=${w.zones.filter((z) => z.hold >= HOLD_THRESHOLD).length} shelter=${w.workers.filter((x) => x.alive && x.state === 'shelter').length}`,
        );
      }
      if (w.status !== 'playing') break;
    }
    lines.push(`END ${w.status} ${w.loseCause ?? ''} at t=${w.finalResponseTime.toFixed(1)}`);
    console.log(lines.join('\n'));
  });
});

function hottestRegion(w: World): string {
  let best = 0;
  let bi = 0;
  for (let i = 0; i < w.heat.value.length; i++) {
    if (w.heat.value[i] > best) {
      best = w.heat.value[i];
      bi = i;
    }
  }
  const c = heatCellCentre(bi);
  return `${regionName(c.x, c.y)} (${best.toFixed(3)})`;
}

describe('zz heat is a memory of place', () => {
  it('a route confined to one corridor makes that corridor the known one', () => {
    const w = createWorld(31);
    layLine(w, { x: HOME.x + 30, y: HOME.y }, pt(firstResource('food')), COVERED);
    idle(w, 240);
    console.log(`after 240 s on one short line: hottest = ${hottestRegion(w)}`);
    console.log(`  home is in ${regionName(HOME.x, HOME.y)}, cell ${heatIndexAt(HOME.x, HOME.y)}`);
  }, 120_000);
});

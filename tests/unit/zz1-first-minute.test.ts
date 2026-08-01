import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/clock.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { createWorld } from '../../src/sim/world.ts';
import { interactTarget } from '../../src/sim/colony.ts';
import { firstResource, HOME, pt } from '../map.ts';
import { layLine } from './play.ts';
import { idle } from './helpers.ts';

const dump = (w: ReturnType<typeof createWorld>, tag: string) => {
  const h = w.hud;
  return [
    `t=${w.time.toFixed(1)} ${tag}`,
    `  op:        ${h.operation}`,
    `  objective: ${h.objective}`,
    `  source:    ${h.source}`,
    `  blocker:   ${h.blocker ?? '—'}`,
    `  forecast:  ${h.forecast}`,
    `  counter:   ${h.counterplay ?? '—'}`,
    `  tutorial:  ${w.tutorial}`,
    `  hint:      ${w.hint}`,
    `  checklist: ${h.checklist.map((c) => `${c.label} ${c.have}/${c.need}`).join(' | ')}`,
    `  guide:     ${h.target ? `${h.target.label} @${Math.round(h.target.x)},${Math.round(h.target.y)}` : '—'}`,
    `  res:       food ${w.colony.food.toFixed(0)}/${w.colony.foodCap} water ${w.colony.water.toFixed(0)}/${w.colony.waterCap} pop ${w.colony.population}/${w.colony.capacity} deliv ${w.stats.deliveries}`,
  ].join('\n');
};

describe('zz first minute', () => {
  it('idle player: what does the screen say for 90 s', () => {
    const w = createWorld(7);
    const lines: string[] = [dump(w, 'BOOT(pre-step)')];
    stepWorld(w, SIM_DT);
    lines.push(dump(w, 'STEP 1'));
    for (let s = 0; s < 90; s += 5) {
      idle(w, 5);
      lines.push(dump(w, 'idle'));
    }
    console.log(lines.join('\n'));
    expect(w.status).toBe('playing');
  });

  it('competent player: time to first delivery', () => {
    const w = createWorld(7);
    const food = firstResource('food');
    const marks: string[] = [];
    // Straight to the nearest food, lay a line back.
    layLine(w, pt(food), pt(HOME), { style: 'covered' });
    marks.push(`line laid at t=${w.time.toFixed(1)} linked=${w.routes.filter((r) => r.linked).length}`);
    let t0 = -1;
    while (w.time < 200 && w.stats.deliveries === 0) {
      stepWorld(w, SIM_DT);
    }
    t0 = w.time;
    marks.push(`first delivery at t=${t0.toFixed(1)}`);
    console.log(marks.join('\n'));
    console.log(dump(w, 'at first delivery'));
  });

  it('what is within reach in 10 s of walking', () => {
    const w = createWorld(7);
    const food = firstResource('food');
    const water = firstResource('water');
    console.log(
      `home=${HOME.x},${HOME.y}\n` +
        `nearest food ${food.id} @${food.x},${food.y} dist=${Math.hypot(food.x - HOME.x, food.y - HOME.y).toFixed(0)}\n` +
        `nearest water ${water.id} @${water.x},${water.y} dist=${Math.hypot(water.x - HOME.x, water.y - HOME.y).toFixed(0)}\n` +
        `scout speed=218 sprint=402 -> 10 s of walking = 2180 units straight line`,
    );
    stepWorld(w, SIM_DT);
    console.log(`interact at spawn: ${JSON.stringify(interactTarget(w))}`);
  });
});

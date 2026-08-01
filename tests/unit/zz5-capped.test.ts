import { describe, expect, it } from 'vitest';
import { createWorld, type World } from '../../src/sim/world.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import { SIM_DT } from '../../src/core/clock.ts';
import { cappedAdvice, resolveHud, FINAL_RESPONSE_LENGTH } from '../../src/sim/operations.ts';
import { recomputeLimits } from '../../src/sim/colony.ts';
import { recomputeTraits } from '../../src/sim/adaptations.ts';
import { startRoutine } from '../../src/sim/routines.ts';
import { depositHeat } from '../../src/sim/heat.ts';

/**
 * The contract's rule: "whenever food or moisture is at cap, at least one affordable, non-automatic
 * spend exists, and the HUD names it." A string that names no spend fails the rule even though
 * cappedAdvice() returns non-null.
 */
const NAMES_A_SPEND = new Set([
  'capped:adaptation',
  'capped:claim',
  'capped:fit',
  'capped:repair',
  'capped:territory',
]);

function fill(w: World): void {
  recomputeLimits(w);
  w.colony.food = w.colony.foodCap;
  w.colony.water = w.colony.waterCap;
}

describe('zz capped-resource rule', () => {
  it('sweeps reachable colony states with a full larder', () => {
    const rows: string[] = [];
    const seen = new Map<string, string>();

    for (const op of [1, 2, 3, 4] as const) {
      for (const claimed of [0, 1, 3, 5]) {
        for (const fitted of [0, 1, 3, 5]) {
          if (fitted > claimed) continue;
          for (const fn of ['cache', 'nursery', 'bolthole'] as const) {
            for (const milestones of [0, 1, 2, 3, 4]) {
              for (const atCapacity of [false, true]) {
                const w = createWorld(1);
                w.operation = op;
                w.adaptations.milestonesUsed = milestones;
                w.adaptations.taken = [];
                recomputeTraits(w);
                const sats = w.nests.filter((n) => !n.home);
                sats.forEach((n, i) => {
                  n.claimed = i < claimed;
                  n.fn = i < fitted ? fn : null;
                });
                recomputeLimits(w);
                w.colony.population = atCapacity ? w.colony.capacity : 1;
                fill(w);
                const a = cappedAdvice(w);
                const key = a?.source ?? 'NULL';
                if (!seen.has(key)) seen.set(key, `${a?.text ?? 'NULL'}`);
                if (!a || !NAMES_A_SPEND.has(a.source)) {
                  rows.push(
                    `op${op} claimed=${claimed} fitted=${fitted}(${fn}) milestones=${milestones} atCap=${atCapacity} pop=${w.colony.population}/${w.colony.capacity} food=${w.colony.food}/${w.colony.foodCap}` +
                      `\n    -> ${a?.source ?? 'NULL'}: ${a?.text ?? '(null)'}`,
                  );
                }
              }
            }
          }
        }
      }
    }
    console.log('── every capped source reachable ──');
    for (const [k, v] of seen) console.log(`  ${k}: ${v}`);
    console.log(`\n── ${rows.length} states where a full larder names NO spend ──`);
    console.log(rows.slice(0, 25).join('\n'));
    expect(seen.size).toBeGreaterThan(0);
  });

  it('the dead end: every crack claimed and fitted, population at capacity', () => {
    const w = createWorld(2);
    w.operation = 4;
    w.adaptations.milestonesUsed = 4;
    for (const n of w.nests) {
      if (n.home) continue;
      n.claimed = true;
      n.fn = 'cache';
      n.integrity = 1;
    }
    recomputeLimits(w);
    w.colony.population = w.colony.capacity;
    fill(w);
    for (const z of w.zones) z.hold = 1; // every zone already held
    const a = cappedAdvice(w);
    console.log(
      `capacity=${w.colony.capacity} foodCap=${w.colony.foodCap} pop=${w.colony.population}\n  -> ${a?.source}: ${a?.text}`,
    );
    const hud = resolveHud(w);
    console.log(`  hud.source=${hud.source} objective="${hud.objective}"`);
  });
});

describe('zz the extermination objective', () => {
  it('a household routine outranks the extermination in the objective hierarchy', () => {
    const w = createWorld(3);
    w.operation = 4;
    w.finalResponse = true;
    w.finalResponseTime = 10;
    w.threatAdvice = 'Get the colony into claimed cracks and keep them there.';
    w.forecast = 'EXTERMINATION';
    startRoutine(w, 'snack');
    const hud = resolveHud(w);
    console.log(
      `finalResponse=${w.finalResponse} (${(FINAL_RESPONSE_LENGTH - w.finalResponseTime).toFixed(0)}s left)\n` +
        `  objective: ${hud.objective}\n  source:    ${hud.source}\n  blocker:   ${hud.blocker}`,
    );
    expect(hud.source.startsWith('routine')).toBe(true);
  });

  it('and a shortage also outranks it', () => {
    const w = createWorld(4);
    w.operation = 4;
    w.finalResponse = true;
    w.finalResponseTime = 10;
    w.threatAdvice = 'Get the colony into claimed cracks and keep them there.';
    w.shortage = 'water';
    const hud = resolveHud(w);
    console.log(`  objective: ${hud.objective}\n  source: ${hud.source}`);
    expect(hud.source).toBe('shortage');
  });

  it('what the extermination actually looks like second by second', () => {
    const w = createWorld(5);
    w.operation = 4;
    // Give the household somewhere to aim.
    depositHeat(w, 700, 1700, 1);
    w.finalResponse = true;
    w.finalResponseTime = 0;
    let last = '';
    const lines: string[] = [];
    for (let i = 0; i < 60 * 70; i++) {
      stepWorld(w, SIM_DT);
      const key = `${w.hud.source}|${w.hud.objective}`;
      if (key !== last) {
        last = key;
        lines.push(
          `t=${w.finalResponseTime.toFixed(1).padStart(5)} sprays=${w.sprays.length} pop=${w.colony.population} zones=${w.zones.filter((z) => z.hold >= 0.8).length} :: [${w.hud.source}] ${w.hud.objective}`,
        );
      }
      if (w.status !== 'playing') {
        lines.push(`ENDED ${w.status} ${w.loseCause ?? ''} at finalResponseTime=${w.finalResponseTime.toFixed(1)}`);
        break;
      }
    }
    console.log(lines.join('\n'));
  });
});

import { describe, expect, it } from 'vitest';
import { judge, type ProfileResult, type SceneCeilings } from '../../src/three/profiler.ts';

/**
 * The perf verdict is tested because the verdict is the thing that can lie.
 *
 * Under Canvas2D the frame-callback duration tracked rendering cost honestly, so a CPU budget was a
 * real budget. Under WebGL `gl.draw*` returns before the GPU does the work, and measurement on this
 * machine shows exactly how wide that gap is: with the proof scene idling on an Apple M1,
 * **CPU p99 was 3.60 ms while GPU p99 was 11.09 ms**. A `cpuP99 <= 8` gate would have reported
 * comfortable headroom while two thirds of the frame budget was already spent.
 *
 * So the rules that matter here are not "is the number small" but "can this function report success
 * when it does not know". The unmeasured-GPU case is the one that has to fail.
 */

const CEILINGS: SceneCeilings = {
  drawCalls: 900,
  triangles: 400_000,
  geometries: 140,
  textures: 24,
  programs: 24,
};

const BUDGET = { p50: 16.7, p95: 20, p99: 33, over50Pct: 1 };

function result(overrides: Partial<ProfileResult> = {}): ProfileResult {
  return {
    label: 'test',
    frames: 300,
    seconds: 5,
    p50: 16.7,
    p95: 17.2,
    p99: 18,
    worst: 18.3,
    over16: 0,
    over33: 0,
    over50: 0,
    over100: 0,
    over50Pct: 0,
    cpuP50: 2.7,
    cpuP99: 3.6,
    gpuP50: 8.23,
    gpuP99: 11.09,
    gpuSamples: 300,
    peak: { drawCalls: 613, triangles: 174_184, geometries: 71, textures: 7, programs: 10 },
    ...overrides,
  };
}

const find = (lines: ReturnType<typeof judge>, metric: string) =>
  lines.find((l) => l.metric === metric);

describe('perf verdict', () => {
  it('passes a genuinely healthy window', () => {
    const lines = judge(result(), BUDGET, CEILINGS);
    expect(lines.every((l) => l.pass)).toBe(true);
  });

  it('FAILS when GPU timing is unavailable, because unmeasured is not verified', () => {
    const lines = judge(result({ gpuP50: null, gpuP99: null, gpuSamples: 0 }), BUDGET, CEILINGS);
    const gpu = find(lines, 'gpu p99');
    expect(gpu?.pass).toBe(false);
    expect(gpu?.value).toBeNull();
    expect(gpu?.note).toContain('UNMEASURED');
  });

  it('catches a GPU-bound frame that a CPU-only budget would call healthy', () => {
    // The exact shape of the failure this module exists to prevent: the CPU is idle, the presented
    // interval is still vsync-locked, and the GPU is over budget with no headroom left.
    const lines = judge(
      result({ cpuP50: 1.9, cpuP99: 2.4, gpuP50: 30, gpuP99: 41 }),
      BUDGET,
      CEILINGS,
    );
    expect(find(lines, 'gpu p99')?.pass).toBe(false);
    // And the CPU numbers are nowhere in the verdict, so they cannot vouch for it.
    expect(lines.map((l) => l.metric)).not.toContain('cpu p99');
  });

  it('fails a single frame over 100 ms, with no tolerance', () => {
    const lines = judge(result({ over100: 1 }), BUDGET, CEILINGS);
    expect(find(lines, 'frames over 100 ms')?.pass).toBe(false);
  });

  it('fails unbounded scene growth even when every millisecond budget passes', () => {
    // 2,743 geometries is what the pose-swapping build actually produced for twenty props. A
    // millisecond budget on fast hardware would have shrugged at it; a count ceiling does not.
    const lines = judge(result({ peak: { ...result().peak, geometries: 2743 } }), BUDGET, CEILINGS);
    expect(find(lines, 'peak geometries')?.pass).toBe(false);
    expect(find(lines, 'p50')?.pass).toBe(true);
  });

  it('reports every metric rather than collapsing to one boolean', () => {
    // A summary verdict is how a failing sub-metric gets lost.
    const lines = judge(result(), BUDGET, CEILINGS);
    expect(lines.map((l) => l.metric)).toEqual([
      'p50',
      'p95',
      'p99',
      'frames over 50 ms (%)',
      'frames over 100 ms',
      'gpu p99',
      'peak draw calls',
      'peak triangles',
      'peak geometries',
      'peak textures',
      'peak programs',
    ]);
  });
});

import type * as THREE from 'three';

/**
 * A frame profiler for a WebGL renderer, built so it cannot report success while the game gets
 * slower.
 *
 * ## Why the existing telemetry is not enough
 *
 * `src/core/telemetry.ts` records two things: presented-frame intervals (rAF timestamp deltas) and
 * the wall-clock duration of the game's frame callback. Under Canvas2D the second number was
 * honest — `ctx.*` calls are largely synchronous CPU work, so callback time tracked rendering cost.
 *
 * Under WebGL it is not. `gl.draw*` returns as soon as the command is queued; the GPU does the work
 * afterwards. A CPU-callback budget of 8 ms would therefore go **green while the frame rate fell**,
 * because heavier rendering moves cost off the CPU and onto a clock nobody is reading. The test
 * audit flagged this explicitly, and it is the single easiest way for this project to lie to itself.
 *
 * ## What this measures instead
 *
 * Three independent channels, because any one of them can be gamed:
 *
 * 1. **Presented-frame interval** — the only number the player actually experiences. Immune to where
 *    the work happens, but blind to headroom: a vsync-locked 60 fps looks identical at 30 % and 95 %
 *    GPU load.
 * 2. **GPU time**, via `EXT_disjoint_timer_query_webgl2` when the driver exposes it. This is the
 *    number that reveals headroom. It is unavailable in many browsers for fingerprinting reasons —
 *    when it is missing that is REPORTED rather than silently skipped, because an absent measurement
 *    is not a passing one.
 * 3. **Scene ceilings** — draw calls, triangles, geometries, textures, programs. These cannot detect
 *    a slow shader, but they catch the failure mode that actually threatened the previous build:
 *    counts growing without bound. A budget on a count still means something when the hardware
 *    changes.
 *
 * Percentiles are computed over a captured window rather than continuously, so a measurement can be
 * anchored to a named scenario ("peak play", "household attack") instead of to whatever happened to
 * be on screen.
 */

/** Ring capacity. 20 000 frames is ~5.5 minutes at 60 Hz — longer than any single capture. */
const MAX_SAMPLES = 20_000;

export interface FrameBudget {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  /** Percentage of frames allowed to exceed 50 ms. */
  readonly over50Pct: number;
}

export interface SceneCeilings {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

export interface ProfileResult {
  readonly label: string;
  readonly frames: number;
  readonly seconds: number;
  /** Presented-frame interval percentiles, in milliseconds. */
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly worst: number;
  readonly over16: number;
  readonly over33: number;
  readonly over50: number;
  readonly over100: number;
  readonly over50Pct: number;
  /** CPU time inside the frame callback. Kept for continuity, never used alone as a verdict. */
  readonly cpuP50: number;
  readonly cpuP99: number;
  /**
   * GPU time percentiles in milliseconds, or `null` when the driver does not expose timer queries.
   * `null` means UNMEASURED, not "fine".
   */
  readonly gpuP50: number | null;
  readonly gpuP99: number | null;
  readonly gpuSamples: number;
  /** Peak scene counts observed during the window. */
  readonly peak: SceneCeilings;
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[index] ?? 0;
}

interface TimerExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/**
 * GPU timer queries, when the driver allows them.
 *
 * Queries are asynchronous by nature — the result of frame N is not available until several frames
 * later — so this keeps a small pool in flight and harvests whatever has resolved.
 * `GPU_DISJOINT_EXT` means the GPU was interrupted (power state change, another context) and every
 * outstanding result is garbage; those are discarded rather than averaged in, because a disjoint
 * sample reads as a fast frame and would flatter the numbers.
 */
class GpuTimer {
  private readonly gl: WebGL2RenderingContext | null;
  private readonly ext: TimerExtension | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  readonly samples: number[] = [];

  constructor(renderer: THREE.WebGLRenderer) {
    const context = renderer.getContext() as unknown as WebGL2RenderingContext;
    this.gl = context && typeof context.createQuery === 'function' ? context : null;
    this.ext = this.gl
      ? ((this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null) ?? null)
      : null;
  }

  get available(): boolean {
    return this.gl !== null && this.ext !== null;
  }

  begin(): void {
    if (!this.gl || !this.ext || this.active) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (!this.gl || !this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    this.harvest();
  }

  private harvest(): void {
    const gl = this.gl;
    const ext = this.ext;
    if (!gl || !ext) return;

    // A disjoint invalidates every outstanding query, so throw the whole batch away.
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const q of this.pending) gl.deleteQuery(q);
      this.pending.length = 0;
      return;
    }

    while (this.pending.length > 0) {
      const query = this.pending[0];
      if (!query) break;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      const nanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
      if (this.samples.length < MAX_SAMPLES) this.samples.push(nanoseconds / 1e6);
      gl.deleteQuery(query);
      this.pending.shift();
    }
  }

  reset(): void {
    this.samples.length = 0;
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    for (const q of this.pending) gl.deleteQuery(q);
    this.pending.length = 0;
    if (this.active) {
      gl.deleteQuery(this.active);
      this.active = null;
    }
  }
}

export class Profiler {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly gpu: GpuTimer;

  private label = '';
  private capturing = false;
  private startedAt = 0;
  private lastRaf = -1;

  private readonly intervals: number[] = [];
  private readonly cpu: number[] = [];
  private peak: SceneCeilings = {
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
  };

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.gpu = new GpuTimer(renderer);
  }

  /** Whether GPU timing is actually available on this driver. Reported, never assumed. */
  get gpuAvailable(): boolean {
    return this.gpu.available;
  }

  /** Wrap the render call so the GPU query brackets exactly the work being measured. */
  beginRender(): void {
    if (this.capturing) this.gpu.begin();
  }

  endRender(): void {
    if (this.capturing) this.gpu.end();
  }

  /** Call once per frame, after rendering. `cpuMs` is the game's own frame-callback duration. */
  frame(rafNow: number, cpuMs: number): void {
    const delta = this.lastRaf < 0 ? -1 : rafNow - this.lastRaf;
    this.lastRaf = rafNow;
    if (!this.capturing || delta < 0) return;

    if (this.intervals.length < MAX_SAMPLES) {
      this.intervals.push(delta);
      this.cpu.push(cpuMs);
    }

    const info = this.renderer.info;
    this.peak = {
      drawCalls: Math.max(this.peak.drawCalls, info.render.calls),
      triangles: Math.max(this.peak.triangles, info.render.triangles),
      geometries: Math.max(this.peak.geometries, info.memory.geometries),
      textures: Math.max(this.peak.textures, info.memory.textures),
      programs: Math.max(this.peak.programs, info.programs?.length ?? 0),
    };
  }

  /** Open a named capture window. The first frame after this is discarded as a warm-up. */
  begin(label: string): void {
    this.label = label;
    this.intervals.length = 0;
    this.cpu.length = 0;
    this.gpu.reset();
    this.peak = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };
    this.lastRaf = -1;
    this.startedAt = performance.now();
    this.capturing = true;
  }

  end(): ProfileResult | null {
    if (!this.capturing) return null;
    this.capturing = false;

    const sorted = [...this.intervals].sort((a, b) => a - b);
    const cpuSorted = [...this.cpu].sort((a, b) => a - b);
    const gpuSorted = [...this.gpu.samples].sort((a, b) => a - b);
    const count = (limit: number): number => sorted.filter((v) => v > limit).length;
    const frames = sorted.length;

    return {
      label: this.label,
      frames,
      seconds: (performance.now() - this.startedAt) / 1000,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      worst: sorted[sorted.length - 1] ?? 0,
      over16: count(16.7),
      over33: count(33),
      over50: count(50),
      over100: count(100),
      over50Pct: frames > 0 ? (count(50) / frames) * 100 : 0,
      cpuP50: percentile(cpuSorted, 0.5),
      cpuP99: percentile(cpuSorted, 0.99),
      gpuP50: gpuSorted.length > 0 ? percentile(gpuSorted, 0.5) : null,
      gpuP99: gpuSorted.length > 0 ? percentile(gpuSorted, 0.99) : null,
      gpuSamples: gpuSorted.length,
      peak: this.peak,
    };
  }

  dispose(): void {
    this.gpu.dispose();
  }
}

export interface VerdictLine {
  readonly metric: string;
  readonly value: number | null;
  readonly budget: number;
  readonly pass: boolean;
  readonly note?: string;
}

/**
 * Turn a profile into pass/fail lines.
 *
 * Deliberately returns every line rather than a single boolean, because a summary verdict is how a
 * failing sub-metric gets lost. An UNMEASURED GPU line is reported as failing-to-verify rather than
 * as passing — the point of this module is that silence is never success.
 */
export function judge(
  result: ProfileResult,
  budget: FrameBudget,
  ceilings: SceneCeilings,
): VerdictLine[] {
  const lines: VerdictLine[] = [
    { metric: 'p50', value: result.p50, budget: budget.p50, pass: result.p50 <= budget.p50 },
    { metric: 'p95', value: result.p95, budget: budget.p95, pass: result.p95 <= budget.p95 },
    { metric: 'p99', value: result.p99, budget: budget.p99, pass: result.p99 <= budget.p99 },
    {
      metric: 'frames over 50 ms (%)',
      value: result.over50Pct,
      budget: budget.over50Pct,
      pass: result.over50Pct < budget.over50Pct,
    },
    { metric: 'frames over 100 ms', value: result.over100, budget: 0, pass: result.over100 === 0 },
  ];

  if (result.gpuP99 === null) {
    lines.push({
      metric: 'gpu p99',
      value: null,
      budget: budget.p99,
      pass: false,
      note: 'EXT_disjoint_timer_query_webgl2 unavailable — GPU headroom is UNMEASURED, not verified',
    });
  } else {
    lines.push({
      metric: 'gpu p99',
      value: result.gpuP99,
      budget: budget.p99,
      pass: result.gpuP99 <= budget.p99,
      note: `${result.gpuSamples} samples`,
    });
  }

  const peaks: [keyof SceneCeilings, string][] = [
    ['drawCalls', 'peak draw calls'],
    ['triangles', 'peak triangles'],
    ['geometries', 'peak geometries'],
    ['textures', 'peak textures'],
    ['programs', 'peak programs'],
  ];
  for (const [key, metric] of peaks) {
    lines.push({
      metric,
      value: result.peak[key],
      budget: ceilings[key],
      pass: result.peak[key] <= ceilings[key],
    });
  }

  return lines;
}

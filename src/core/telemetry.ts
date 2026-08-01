export interface PerfWindowResult {
  label: string;
  frames: number;
  durationMs: number;
  /** Presented frame interval (rAF timestamp delta) — the metric the budget is written against. */
  p50: number;
  p95: number;
  p99: number;
  worst: number;
  mean: number;
  over16: number;
  over33: number;
  over50: number;
  over100: number;
  over50Pct: number;
  /** Time spent inside the game's own frame callback: simulation + rendering CPU cost. */
  cpuP50: number;
  cpuP95: number;
  cpuP99: number;
  cpuWorst: number;
  peak: {
    roaches: number;
    workers: number;
    hazards: number;
    particles: number;
    voices: number;
    drawCalls: number;
    pheromoneNodes: number;
  };
}

export interface Counters {
  roaches: number;
  workers: number;
  hazards: number;
  particles: number;
  voices: number;
  drawCalls: number;
  pheromoneNodes: number;
}

const EMPTY_COUNTERS: Counters = {
  roaches: 0,
  workers: 0,
  hazards: 0,
  particles: 0,
  voices: 0,
  drawCalls: 0,
  pheromoneNodes: 0,
};

/**
 * Frame-time recorder with named capture windows.
 *
 * Storage is a fixed-size ring buffer so a long session cannot grow memory; a capture window keeps
 * its own bounded sample array (capped at 20 000 frames ≈ 5.5 min at 60 Hz).
 */
export class Telemetry {
  private ring = new Float32Array(600);
  private ringLen = 0;
  private ringHead = 0;

  private windowLabel: string | null = null;
  private windowSamples: number[] = [];
  private windowCpu: number[] = [];
  private windowStart = 0;
  private windowPeak: Counters = { ...EMPTY_COUNTERS };
  private lastRaf = -1;

  results: PerfWindowResult[] = [];
  counters: Counters = { ...EMPTY_COUNTERS };
  startup: Record<string, number> = {};

  /**
   * Records one presented frame.
   *
   * `cpuMs` is the time spent inside the game's frame callback; `rafNow` is the browser's frame
   * timestamp, whose delta is the actual presented frame interval. The budget is written against the
   * interval, because that — not the callback cost — is what the player perceives as smoothness.
   */
  frame(cpuMs: number, rafNow: number): void {
    const delta = this.lastRaf < 0 ? -1 : rafNow - this.lastRaf;
    this.lastRaf = rafNow;
    if (delta < 0) return;

    this.ring[this.ringHead] = delta;
    this.ringHead = (this.ringHead + 1) % this.ring.length;
    if (this.ringLen < this.ring.length) this.ringLen++;

    if (this.windowLabel !== null) {
      if (this.windowSamples.length < 20000) {
        this.windowSamples.push(delta);
        this.windowCpu.push(cpuMs);
      }
      const c = this.counters;
      const p = this.windowPeak;
      if (c.roaches > p.roaches) p.roaches = c.roaches;
      if (c.workers > p.workers) p.workers = c.workers;
      if (c.hazards > p.hazards) p.hazards = c.hazards;
      if (c.particles > p.particles) p.particles = c.particles;
      if (c.voices > p.voices) p.voices = c.voices;
      if (c.drawCalls > p.drawCalls) p.drawCalls = c.drawCalls;
      if (c.pheromoneNodes > p.pheromoneNodes) p.pheromoneNodes = c.pheromoneNodes;
    }
  }

  /** Rolling average FPS over the ring buffer, for the on-screen readout. */
  recentFps(): number {
    if (this.ringLen === 0) return 0;
    let total = 0;
    for (let i = 0; i < this.ringLen; i++) total += this.ring[i];
    return this.ringLen / (total / 1000);
  }

  recentP95(): number {
    if (this.ringLen === 0) return 0;
    const arr = Array.from(this.ring.subarray(0, this.ringLen)).sort((a, b) => a - b);
    return arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))];
  }

  beginWindow(label: string, nowMs: number): void {
    this.windowLabel = label;
    this.windowSamples = [];
    this.windowCpu = [];
    this.windowStart = nowMs;
    this.windowPeak = { ...EMPTY_COUNTERS };
  }

  endWindow(nowMs: number): PerfWindowResult | null {
    if (this.windowLabel === null) return null;
    const samples = this.windowSamples.slice().sort((a, b) => a - b);
    const cpu = this.windowCpu.slice().sort((a, b) => a - b);
    const n = samples.length;
    const pick = (q: number) => (n === 0 ? 0 : samples[Math.min(n - 1, Math.floor(n * q))]);
    const pickCpu = (q: number) =>
      cpu.length === 0 ? 0 : cpu[Math.min(cpu.length - 1, Math.floor(cpu.length * q))];
    const count = (limit: number) => samples.reduce((acc, v) => acc + (v > limit ? 1 : 0), 0);
    const over50 = count(50);
    const result: PerfWindowResult = {
      label: this.windowLabel,
      frames: n,
      durationMs: nowMs - this.windowStart,
      p50: round2(pick(0.5)),
      p95: round2(pick(0.95)),
      p99: round2(pick(0.99)),
      worst: round2(n ? samples[n - 1] : 0),
      mean: round2(n ? samples.reduce((a, b) => a + b, 0) / n : 0),
      over16: count(16.7),
      over33: count(33),
      over50,
      over100: count(100),
      over50Pct: n ? round3((over50 / n) * 100) : 0,
      cpuP50: round2(pickCpu(0.5)),
      cpuP95: round2(pickCpu(0.95)),
      cpuP99: round2(pickCpu(0.99)),
      cpuWorst: round2(cpu.length ? cpu[cpu.length - 1] : 0),
      peak: { ...this.windowPeak },
    };
    this.results.push(result);
    this.windowLabel = null;
    this.windowSamples = [];
    this.windowCpu = [];
    return result;
  }

  reset(): void {
    this.ringLen = 0;
    this.ringHead = 0;
    this.windowLabel = null;
    this.windowSamples = [];
    this.windowCpu = [];
    this.lastRaf = -1;
    this.results = [];
    this.counters = { ...EMPTY_COUNTERS };
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

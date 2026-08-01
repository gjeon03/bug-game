/** Fixed simulation timestep, in seconds. */
export const SIM_DT = 1 / 60;
/** Real time is never advanced by more than this in a single frame. */
export const MAX_FRAME_DELTA = 0.25;
/** Hard cap on catch-up steps per rendered frame (spiral-of-death guard). */
export const MAX_STEPS_PER_FRAME = 5;

/**
 * Accumulator-based fixed-step clock, separated from rendering.
 *
 * Discarded time (the accumulator remainder thrown away when the step cap is hit) is counted so a
 * stalling machine shows up in telemetry instead of silently desynchronising the simulation.
 */
export class FixedClock {
  accumulator = 0;
  /** Total sim steps executed since construction. */
  steps = 0;
  /** Seconds of real time discarded by the step cap. */
  discardedTime = 0;
  /** Number of frames in which the step cap was reached. */
  overloadFrames = 0;

  /** Reset timing state without discarding counters' meaning across a restart. */
  reset(): void {
    this.accumulator = 0;
    this.steps = 0;
    this.discardedTime = 0;
    this.overloadFrames = 0;
  }

  /** Drop pending time — used after a tab regains focus so the sim never fast-forwards. */
  flush(): void {
    this.accumulator = 0;
  }

  /**
   * Feeds one rendered frame's real delta and returns how many fixed steps must run now.
   */
  advance(deltaSeconds: number): number {
    let d = deltaSeconds;
    if (!(d > 0)) return 0;
    if (d > MAX_FRAME_DELTA) {
      this.discardedTime += d - MAX_FRAME_DELTA;
      d = MAX_FRAME_DELTA;
    }
    this.accumulator += d;
    let n = Math.floor(this.accumulator / SIM_DT);
    if (n > MAX_STEPS_PER_FRAME) {
      this.overloadFrames++;
      this.discardedTime += (n - MAX_STEPS_PER_FRAME) * SIM_DT;
      this.accumulator -= (n - MAX_STEPS_PER_FRAME) * SIM_DT;
      n = MAX_STEPS_PER_FRAME;
    }
    this.accumulator -= n * SIM_DT;
    this.steps += n;
    return n;
  }
}

import { MAX_STEPS_PER_FRAME, SIM_DT } from '../colony/state';

/**
 * The fixed-step clock.
 *
 * The simulation always advances in exact 1/60 s steps regardless of display rate, and the renderer
 * interpolates between the last two. That is what makes a run reproducible from a seed: the same
 * inputs produce the same state on a 60 Hz laptop and a 144 Hz monitor.
 *
 * `MAX_STEPS_PER_FRAME` is the spiral guard. If a frame takes 400 ms — a tab returning from the
 * background, a shader compile — draining the whole backlog would take longer than the frame that
 * caused it and the game would fall further behind every frame. Dropping the excess loses a little
 * simulated time exactly once, which is invisible; the alternative is a death spiral.
 */
export class Clock {
  private accumulator = 0;
  private previous = 0;
  private running = false;

  /** Fraction through the current step, for render interpolation. */
  get alpha(): number {
    return this.accumulator / SIM_DT;
  }

  start(now: number): void {
    this.previous = now;
    this.accumulator = 0;
    this.running = true;
  }

  /**
   * Absorb elapsed real time and return how many simulation steps to run.
   *
   * Also called on focus return, where `now` may be minutes ahead. `resume()` is the honest way to
   * handle that; this method assumes it was called.
   */
  advance(now: number): number {
    if (!this.running) return 0;
    const elapsed = Math.max(0, (now - this.previous) / 1000);
    this.previous = now;
    this.accumulator += elapsed;

    let steps = 0;
    while (this.accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= SIM_DT;
      steps++;
    }
    // Anything still banked beyond the cap is discarded rather than carried, or the backlog
    // compounds across frames.
    if (this.accumulator > SIM_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;
    return steps;
  }

  /**
   * Re-anchor after the tab was hidden.
   *
   * Without this, returning to a backgrounded tab hands `advance` a delta of minutes, and even with
   * the step cap the first visible frame is a jolt. The game does not simulate time the player was
   * not watching.
   */
  resume(now: number): void {
    this.previous = now;
    this.accumulator = 0;
  }

  stop(): void {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }
}

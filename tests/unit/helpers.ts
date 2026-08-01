import { SIM_DT } from '../../src/core/clock.ts';
import { stepWorld } from '../../src/sim/sim.ts';
import type { World } from '../../src/sim/world.ts';

export interface DriveOptions {
  lay?: boolean;
  sprint?: boolean;
  /** Give up after this many seconds. */
  timeout?: number;
  arrive?: number;
}

function clearInput(world: World): void {
  const i = world.input;
  i.up = i.down = i.left = i.right = false;
  i.lay = i.sprint = i.erase = false;
}

/** Steps the simulation while steering the scout toward a point, exactly as a player would. */
export function driveTo(world: World, x: number, y: number, opts: DriveOptions = {}): boolean {
  const timeout = opts.timeout ?? 30;
  const arrive = opts.arrive ?? 34;
  let elapsed = 0;
  while (elapsed < timeout) {
    const s = world.scout;
    const dx = x - s.x;
    const dy = y - s.y;
    if (Math.hypot(dx, dy) <= arrive) {
      clearInput(world);
      return true;
    }
    const i = world.input;
    i.left = dx < -6;
    i.right = dx > 6;
    i.up = dy < -6;
    i.down = dy > 6;
    i.lay = !!opts.lay;
    i.sprint = !!opts.sprint;
    stepWorld(world, SIM_DT);
    elapsed += SIM_DT;
  }
  clearInput(world);
  return false;
}

/** Steps the simulation for `seconds` with no player input. */
export function idle(world: World, seconds: number): void {
  clearInput(world);
  let t = 0;
  while (t < seconds) {
    stepWorld(world, SIM_DT);
    t += SIM_DT;
  }
}

/** Steps until `predicate` holds or `seconds` elapse. Returns the seconds consumed, or -1. */
export function stepUntil(
  world: World,
  predicate: (w: World) => boolean,
  seconds: number,
  onStep?: (w: World) => void,
): number {
  let t = 0;
  while (t < seconds) {
    if (predicate(world)) return t;
    onStep?.(world);
    stepWorld(world, SIM_DT);
    t += SIM_DT;
  }
  return predicate(world) ? t : -1;
}

export function press(world: World, key: keyof World['input']): void {
  (world.input as unknown as Record<string, boolean>)[key] = true;
}

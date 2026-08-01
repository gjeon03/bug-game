import { clamp01 } from '../core/math.ts';
import {
  EXPOSURE_DANGER,
  SPOT_DECAY_RATE,
  SPOT_FILL_RATE,
  SUSPICION_WEIGHTS,
} from './constants.ts';
import { coneLightAt, coverAt, exposureFrom, staticLightAt } from './field.ts';
import { addSuspicion } from './suspicion.ts';
import type { World } from './world.ts';

/**
 * The light field the humans see by — the same field the renderer composites.
 *
 * Immediate exposure is "danger happening now": bright light, a patrol's cone, and open floor.
 * Persistent suspicion is a separate, slower layer handled in `suspicion.ts`.
 */
export function lightAt(world: World, x: number, y: number): number {
  let v = staticLightAt(x, y) + world.roomLight * 0.78;
  for (let i = 0; i < world.patrols.length; i++) {
    const p = world.patrols[i];
    v += coneLightAt(x, y, {
      x: p.x,
      y: p.y,
      angle: p.angle,
      power: p.lightPower,
      range: p.coneRange,
      looking: p.looking,
    });
  }
  return v;
}

export function exposureAt(world: World, x: number, y: number): number {
  return exposureFrom(lightAt(world, x, y), coverAt(x, y));
}

/** True when a patrol has line-of-sight-ish coverage of the point and is actively looking. */
export function isWatched(world: World, x: number, y: number): boolean {
  for (let i = 0; i < world.patrols.length; i++) {
    const p = world.patrols[i];
    if (!p.looking) continue;
    if (
      coneLightAt(x, y, {
        x: p.x,
        y: p.y,
        angle: p.angle,
        power: 1,
        range: p.coneRange,
        looking: true,
      }) > 0.42
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Scout exposure and the "spotted" meter.
 *
 * The meter is the fair-warning device: it fills visibly and audibly before anything lethal happens,
 * so being seen is always something the player could have perceived coming.
 */
export function updateExposure(world: World, dt: number): void {
  const s = world.scout;
  if (!s.alive) {
    s.spotted = Math.max(0, s.spotted - SPOT_DECAY_RATE * dt);
    return;
  }

  const cover = coverAt(s.x, s.y);
  let e = exposureFrom(lightAt(world, s.x, s.y), cover);
  if (s.sprinting) e = clamp01(e + 0.18);
  if (s.laying) e = clamp01(e + 0.05);
  s.exposure = e;

  const watched = isWatched(world, s.x, s.y);
  const pressure = (e - EXPOSURE_DANGER) / (1 - EXPOSURE_DANGER);
  if (e > EXPOSURE_DANGER) {
    s.spotted = clamp01(s.spotted + SPOT_FILL_RATE * (0.5 + pressure) * (watched ? 2.1 : 1) * dt);
  } else {
    s.spotted = Math.max(0, s.spotted - SPOT_DECAY_RATE * dt);
  }

  if (s.spotted >= 1) {
    s.spotted = 0.55;
    addSuspicion(world, 'seen', SUSPICION_WEIGHTS.seen, s.x, s.y);
    world.events.push({ t: 'scoutHurt', x: s.x, y: s.y });
    // Being noticed brings a foot down where you were standing — attributable, and survivable.
    world.pendingStomp = { x: s.x, y: s.y };
  }
}

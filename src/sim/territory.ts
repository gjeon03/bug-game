import { clamp01 } from '../core/math.ts';
import type { World } from './world.ts';

/**
 * Territory.
 *
 * The old win condition was four numbers, two of which a player who walked away satisfied inside two
 * minutes. Territory replaces them with a place: the run ends when the colony *holds* three regions
 * of the kitchen at once, through the household's answer to holding them.
 *
 * Hold is made of routes and bodies, so route geometry stays strategically load-bearing to the last
 * second — you cannot bank territory the way you can bank food.
 */

export interface ZoneSpec {
  id: string;
  /** Shown on the operation card and the zone banner. Never floated over the world as a label. */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The eight semantic regions of the kitchen. These are the same regions the art is built around, so
 * "hold the sink" is a sentence the player can act on by looking at the room.
 */
export const ZONES: readonly ZoneSpec[] = [
  { id: 'sink', name: 'the sink run', x: 56, y: 820, w: 720, h: 780 },
  { id: 'dishwasher', name: 'the dishwasher', x: 56, y: 1600, w: 720, h: 480 },
  { id: 'pantry', name: 'the pantry', x: 56, y: 2080, w: 900, h: 464 },
  { id: 'stove', name: 'the stove', x: 1040, y: 56, w: 900, h: 720 },
  { id: 'fridge', name: 'the refrigerator', x: 2400, y: 56, w: 1144, h: 900 },
  { id: 'island', name: 'the island', x: 1180, y: 1120, w: 1400, h: 800 },
  { id: 'trash', name: 'the bin corner', x: 2680, y: 1900, w: 864, h: 644 },
  { id: 'doorway', name: 'the hall doorway', x: 2900, y: 2200, w: 644, h: 400 },
] as const;

export interface ZoneState {
  id: string;
  /** 0..1. Three zones at or above HOLD_THRESHOLD simultaneously is the win. */
  hold: number;
  /** Live worker count inside the zone this step, for the HUD and for hold gain. */
  workers: number;
  /** Whether a linked route currently runs through the zone. */
  routed: boolean;
  /** Whether the household is actively suppressing this zone right now. */
  contested: boolean;
}

/** Hold at or above this counts as held. */
export const HOLD_THRESHOLD = 0.8;
/** How many zones must be held at once to complete the final operation. */
export const ZONES_TO_WIN = 3;
/**
 * Hold gained per second at full staffing.
 *
 * Tuned from play: at 0.055 with four workers a region locked in fifteen seconds, so the two regions
 * around the home crack were held before the player had done anything deliberate about territory and
 * the final operation's gate was satisfied on arrival. At 0.028 with six, holding three regions at
 * once demands roughly eighteen roaches spread across three parts of the kitchen with a live line
 * into each — which is the logistical problem the operation is supposed to be.
 */
export const HOLD_GAIN = 0.028;
/** Hold lost per second while nothing of the colony is present. */
export const HOLD_DECAY = 0.022;
/** Extra hold lost per second while the household is actively working the zone. */
export const HOLD_SUPPRESS = 0.13;
/** Workers inside a zone needed for full hold gain. */
export const HOLD_FULL_STAFF = 6;

export function createZoneStates(): ZoneState[] {
  return ZONES.map((z) => ({ id: z.id, hold: 0, workers: 0, routed: false, contested: false }));
}

function inside(z: ZoneSpec, x: number, y: number): boolean {
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}

export function zoneAt(x: number, y: number): ZoneSpec | null {
  for (let i = 0; i < ZONES.length; i++) if (inside(ZONES[i], x, y)) return ZONES[i];
  return null;
}

export function updateTerritory(world: World, dt: number): void {
  const states = world.zones;
  for (let i = 0; i < states.length; i++) {
    states[i].workers = 0;
    states[i].routed = false;
    states[i].contested = false;
  }

  // Bodies present.
  for (let i = 0; i < world.workers.length; i++) {
    const w = world.workers[i];
    if (!w.alive || w.nymphTime > 0) continue;
    for (let z = 0; z < ZONES.length; z++) {
      if (inside(ZONES[z], w.x, w.y)) {
        states[z].workers++;
        break;
      }
    }
  }

  // A live supply line through the zone. Bodies passing through without a route are tourists.
  for (let r = 0; r < world.routes.length; r++) {
    const route = world.routes[r];
    if (!route.linked) continue;
    for (let n = 0; n < route.nodes.length; n += 3) {
      const node = route.nodes[n];
      for (let z = 0; z < ZONES.length; z++) {
        if (inside(ZONES[z], node.x, node.y)) {
          states[z].routed = true;
          break;
        }
      }
    }
  }

  // Household suppression: a spray cloud, a cleaning sweep or a patrol standing in the zone.
  for (let s = 0; s < world.sprays.length; s++) {
    const z = zoneAt(world.sprays[s].x, world.sprays[s].y);
    if (z) states[ZONES.indexOf(z)].contested = true;
  }
  for (let s = 0; s < world.sweeps.length; s++) {
    const z = zoneAt(world.sweeps[s].x, world.sweeps[s].y);
    if (z) states[ZONES.indexOf(z)].contested = true;
  }
  for (let p = 0; p < world.patrols.length; p++) {
    const z = zoneAt(world.patrols[p].x, world.patrols[p].y);
    if (z) states[ZONES.indexOf(z)].contested = true;
  }

  for (let i = 0; i < states.length; i++) {
    const st = states[i];
    const staffed = Math.min(1, st.workers / HOLD_FULL_STAFF);
    let delta = -HOLD_DECAY;
    if (st.routed && st.workers > 0) delta = HOLD_GAIN * staffed;
    if (st.contested) delta -= HOLD_SUPPRESS;
    const before = st.hold;
    st.hold = clamp01(st.hold + delta * dt);
    if (before < HOLD_THRESHOLD && st.hold >= HOLD_THRESHOLD) {
      world.events.push({ t: 'zoneHeld', zone: st.id });
    } else if (before >= HOLD_THRESHOLD && st.hold < HOLD_THRESHOLD) {
      world.events.push({ t: 'zoneLost', zone: st.id });
    }
  }
}

export function heldZones(world: World): ZoneState[] {
  return world.zones.filter((z) => z.hold >= HOLD_THRESHOLD);
}

/** The zone closest to being held that is not held yet — what the HUD should point at. */
export function nextZoneToHold(world: World): { spec: ZoneSpec; state: ZoneState } | null {
  let best: { spec: ZoneSpec; state: ZoneState } | null = null;
  for (let i = 0; i < world.zones.length; i++) {
    const st = world.zones[i];
    if (st.hold >= HOLD_THRESHOLD) continue;
    if (!best || st.hold > best.state.hold) best = { spec: ZONES[i], state: st };
  }
  return best;
}

export function zoneName(id: string): string {
  return ZONES.find((z) => z.id === id)?.name ?? id;
}

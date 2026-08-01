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
  /** Claimed cracks inside the region — standing presence that a panic cannot remove. */
  footholds: number;
  /** 0..1. Rises with a live route and bodies present, falls when the household works the zone. */
  hold: number;
  /**
   * Whether the region currently counts as held.
   *
   * Deliberately hysteretic: a zone becomes held at {@link HOLD_THRESHOLD} and stops being held only
   * below {@link HOLD_RELEASE}. Without the gap, a region dropped out of "held" the instant its
   * staffing lapsed for a second, so holding three at once through a 62-second extermination was a
   * knife-edge rather than a fight — measured: a run reached the finale with 45 roaches and four
   * adaptations and still finished holding one region. You should have to be *pushed out* of a
   * region, not merely distracted from it.
   */
  held: boolean;
  /** Live worker count inside the zone this step, for the HUD and for hold gain. */
  workers: number;
  /** Whether a linked route currently runs through the zone. */
  routed: boolean;
  /** Whether the household is actively suppressing this zone right now. */
  contested: boolean;
}

/** Hold at or above this claims a region. */
export const HOLD_THRESHOLD = 0.8;
/** Hold below this loses it again. */
export const HOLD_RELEASE = 0.5;
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
/** Hold lost per second while a live line still runs through, but nobody is working it. */
export const HOLD_IDLE_DECAY = 0.008;
/**
 * Extra hold lost per second while the household is actively working the zone.
 *
 * Sized against the 62-second extermination: a cloud that parks on a staffed region breaks it in
 * about forty seconds, so it is a threat the player has to answer by reinforcing or re-routing, not
 * an automatic loss. At 0.06 two clouds reliably broke two of the three held regions inside the
 * window and a competent run could not survive its own ending.
 */
export const HOLD_SUPPRESS = 0.032;
/** Bodies inside a zone needed for full hold gain. */
export const HOLD_FULL_STAFF = 6;
/**
 * How many bodies a claimed crack inside the region is worth.
 *
 * This is the link between operation 3 and operation 4. Without it, territory depended entirely on
 * roaches standing in the open — so the moment the extermination started and the colony panicked
 * into the walls, every region the player had taken evaporated, and a run that arrived at the finale
 * with 45 roaches and four adaptations still finished holding one. A crack you own is a presence in
 * that part of the kitchen whether or not anybody is currently standing outside it.
 *
 * Weighted heavily on purpose. During the extermination the colony panics into the walls, so a
 * region held only by roaches standing in the open evaporates exactly when it matters most — and a
 * measured run reached the finale with 32 roaches and four adaptations and still lost two regions.
 * A crack you own is the colony *dug in*, which is the fiction and now also the mechanic: five
 * bodies' worth of presence, so one claimed crack nearly holds its region on its own.
 */
export const FOOTHOLD_PRESENCE = 5;
/** Share of the hold rate a region earns from presence alone, with no live line through it. */
export const ROUTELESS_GAIN = 0.55;

export function createZoneStates(): ZoneState[] {
  return ZONES.map((z) => ({
    id: z.id,
    footholds: 0,
    hold: 0,
    held: false,
    workers: 0,
    routed: false,
    contested: false,
  }));
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
    states[i].footholds = 0;
    states[i].routed = false;
    states[i].contested = false;
  }

  for (let i = 0; i < world.nests.length; i++) {
    const n = world.nests[i];
    if (!n.claimed) continue;
    for (let z = 0; z < ZONES.length; z++) {
      if (inside(ZONES[z], n.x, n.y)) {
        states[z].footholds++;
        break;
      }
    }
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
    // Territory is bodies and owned ground; a live line through the region makes it faster, but is
    // not a precondition. Requiring one was measured doing the wrong thing: a region containing a
    // claimed crack and nineteen working roaches lost hold at full rate for the seconds between the
    // player finishing one supply line and starting the next, so hold thrashed between 0 and 1 all
    // through the final operation and three regions were never held at the same moment.
    const presence = st.workers + st.footholds * FOOTHOLD_PRESENCE;
    const staffed = Math.min(1, presence / HOLD_FULL_STAFF);
    let delta: number;
    if (presence > 0) delta = HOLD_GAIN * staffed * (st.routed ? 1 : ROUTELESS_GAIN);
    else delta = st.routed ? -HOLD_IDLE_DECAY : -HOLD_DECAY;
    if (st.contested) delta -= HOLD_SUPPRESS;
    st.hold = clamp01(st.hold + delta * dt);
    if (!st.held && st.hold >= HOLD_THRESHOLD) {
      st.held = true;
      world.events.push({ t: 'zoneHeld', zone: st.id });
    } else if (st.held && st.hold < HOLD_RELEASE) {
      st.held = false;
      world.events.push({ t: 'zoneLost', zone: st.id });
    }
  }
}

/**
 * Regions that count toward taking the kitchen.
 *
 * The region containing the home crack is excluded. Operation 1's mandatory opening route runs from
 * the home crack to the first food source and both sit inside the same region, so that region was
 * being "held" 35 seconds into the tutorial — a third of the win condition satisfied before
 * territory had been mentioned. Claiming the kitchen means ground beyond your own doorstep.
 */
export function heldZones(world: World): ZoneState[] {
  const home = world.nests.find((n) => n.home);
  const homeZone = home ? zoneAt(home.x, home.y)?.id : undefined;
  return world.zones.filter((z) => z.held && z.id !== homeZone);
}

/** The zone closest to being held that is not held yet — what the HUD should point at. */
export function nextZoneToHold(world: World): { spec: ZoneSpec; state: ZoneState } | null {
  let best: { spec: ZoneSpec; state: ZoneState } | null = null;
  const home = world.nests.find((n) => n.home);
  const homeZone = home ? zoneAt(home.x, home.y)?.id : undefined;
  for (let i = 0; i < world.zones.length; i++) {
    const st = world.zones[i];
    if (st.held || st.id === homeZone) continue;
    if (!best || st.hold > best.state.hold) best = { spec: ZONES[i], state: st };
  }
  return best;
}

export function zoneName(id: string): string {
  return ZONES.find((z) => z.id === id)?.name ?? id;
}

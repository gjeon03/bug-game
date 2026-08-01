import { doInteract, updateColony } from './colony.ts';
import { evaluateRun, updateDirector } from './director.ts';
import { updateExposure } from './exposure.ts';
import { updateOnboarding } from './onboarding.ts';
import { updatePheromone } from './pheromone.ts';
import { updateScout } from './scout.ts';
import { updateSuspicion } from './suspicion.ts';
import { updateThreats } from './threats.ts';
import { updateWorkers } from './workers.ts';
import type { World } from './world.ts';

/** Events never accumulate without bound, even if presentation stops draining them. */
const MAX_PENDING_EVENTS = 512;

/**
 * One fixed simulation step. This is the only entry point into the simulation, and the update order
 * here is the one documented in ARCHITECTURE.md.
 *
 * Nothing in this call graph touches the DOM, `window`, `Math.random` or `Date`, which is what lets
 * the whole thing run headless in Vitest and reproduce a run exactly from (seed, input log).
 */
export function stepWorld(world: World, dt: number): void {
  world.tick++;
  world.time += dt;
  world.stats.runSeconds = world.time;

  // 1. Operation gates, household routines and the pressure director.
  updateDirector(world, dt);

  if (world.status === 'playing') {
    // 2. Player.
    updateScout(world, dt);
    if (world.input.interactPressed) {
      world.input.interactPressed = false;
      doInteract(world);
      world.hintTime = 4;
    }

    // 3. Pheromone field.
    updatePheromone(world, dt);

    // 4. Colony units.
    updateWorkers(world, dt);

    // 5. Resource state.
    updateResources(world, dt);

    // 6. Economy.
    updateColony(world, dt);

    // 7. Threats.
    updateThreats(world, dt);

    // 8. Immediate exposure.
    updateExposure(world, dt);

    // 9. Persistent suspicion and regional evidence.
    updateSuspicion(world, dt);

    // 10. Outcome and objective.
    evaluateRun(world);

    updateOnboarding(world, dt);
  }

  if (world.hintTime > 0) {
    world.hintTime -= dt;
    if (world.hintTime <= 0) {
      world.hint = '';
      world.hintTime = 0;
    }
  }

  if (world.events.length > MAX_PENDING_EVENTS) {
    world.events.splice(0, world.events.length - MAX_PENDING_EVENTS);
  }
}

/**
 * Fraction of a source's original size that comes back per second.
 *
 * The kitchen is in use: crumbs keep falling, the tap keeps dripping. 0.0007 is about 4 % a minute —
 * a trickle, not a fountain.
 *
 * This exists because of a measured failure mode, and it is deliberately small. The old build gave
 * every node 3 600 units against a whole-night draw of ~474 and regrew 30 % between nights, which
 * made scarcity arithmetically impossible; cutting the amounts hard fixed that but produced the
 * opposite failure — by the third operation every source within reach of home was bare and a colony
 * that had done nothing wrong starved. A slow trickle keeps the opening ground alive without ever
 * being enough to feed a grown colony, so expansion is still the answer.
 */
const RESOURCE_REGEN = 0.0007;

function updateResources(world: World, dt: number): void {
  for (let i = 0; i < world.resources.length; i++) {
    const r = world.resources[i];
    if (r.disturbance > 0) r.disturbance = Math.max(0, r.disturbance - dt * 0.04);
    // Household spills are one-off: they are cleared away, not replenished.
    if (!r.id.startsWith('routine:') && r.amount < r.initial) {
      r.amount = Math.min(r.initial, r.amount + r.initial * RESOURCE_REGEN * dt);
      // A source that has come back is workable again, and its route stops reading as dry.
      if (r.depleted && r.amount > r.initial * 0.02) {
        r.depleted = false;
        r.depletedReported = false;
      }
    }
    if (r.amount <= 0.001 && !r.depleted) r.depleted = true;
  }
}

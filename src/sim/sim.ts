import { doInteract, updateColony } from './colony.ts';
import { evaluateRun, handleEscalation, updateDirector } from './director.ts';
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

  // 1. Phase clock and authored beats.
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

    // 9. Persistent suspicion, then the escalation it triggers.
    updateSuspicion(world, dt);
    handleEscalation(world);

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

function updateResources(world: World, dt: number): void {
  for (let i = 0; i < world.resources.length; i++) {
    const r = world.resources[i];
    if (r.disturbance > 0) r.disturbance = Math.max(0, r.disturbance - dt * 0.04);
    if (r.amount <= 0.001 && !r.depleted) r.depleted = true;
  }
}

import { GameAudio } from './audio';
import type { Cue, Run } from '../colony/types';

/**
 * The bridge from simulation cues to sound.
 *
 * `src/audio/audio.ts` is a synthesiser: it knows how to make a skitter and a trap snap and knows
 * nothing about this game. This file is the only place that maps *what happened* to *what is heard*,
 * which keeps the synthesiser reusable and keeps the simulation deaf — the sim pushes cues and never
 * learns whether anyone is listening.
 *
 * ## Panning is spatial, not decorative
 *
 * Every cue carries a world position. It is projected against the camera's own basis so a trap
 * snapping to the player's left is heard on the left. At insect scale, where most of the danger is
 * off-screen, that is not polish — it is the only channel that tells you which way to run before you
 * can see why.
 */

/** Beyond this distance from the scout, a cue is too far away to be worth a voice. */
const AUDIBLE_RANGE = 2600;
/** Camera basis for panning: the fixed yaw's right vector, XZ. */
const RIGHT_X = Math.sin((5 * Math.PI) / 4 + Math.PI / 2);
const RIGHT_Z = -Math.cos((5 * Math.PI) / 4 + Math.PI / 2);

export interface AudioBridge {
  /** Called once from a user gesture — browsers refuse to start an AudioContext without one. */
  unlock(): void;
  /** Consume this frame's cues and update the continuous beds. Cues are not read again. */
  update(run: Run, dt: number): void;
  suspend(): void;
  resume(): void;
  readonly started: boolean;
  readonly voices: number;
  dispose(): void;
}

export function createAudioBridge(): AudioBridge {
  const audio = new GameAudio();
  let skitterTimer = 0;
  let workerTimer = 0;

  /** -1 (left) .. +1 (right) relative to the camera, from a world position. */
  const panOf = (run: Run, x: number, z: number): number => {
    const dx = x - run.scout.x;
    const dz = z - run.scout.z;
    const lateral = dx * RIGHT_X + dz * RIGHT_Z;
    return Math.max(-1, Math.min(1, lateral / 900));
  };

  const near = (run: Run, cue: Cue): boolean =>
    Math.hypot(cue.x - run.scout.x, cue.z - run.scout.z) < AUDIBLE_RANGE;

  const playThreat = (cue: Cue, pan: number): void => {
    const telegraph = cue.kind.endsWith('.telegraph');
    if (cue.kind.startsWith('threat.spray')) {
      if (telegraph) audio.sweepWarn(pan);
      else audio.sprayStart(pan);
      return;
    }
    if (cue.kind.startsWith('threat.trap')) {
      if (telegraph) audio.sweepWarn(pan);
      else audio.trapSnap(pan);
      return;
    }
    if (cue.kind.startsWith('threat.light')) {
      if (!telegraph) audio.lightOn();
      return;
    }
    if (cue.kind.startsWith('threat.vacuum')) {
      if (telegraph) audio.sweepWarn(pan);
      else audio.sweepPass(pan);
      return;
    }
    // footsteps, wipe, move — the household moving about.
    if (telegraph) audio.footWarn(pan, 0.5);
    else audio.footHit(pan, 0.4);
  };

  const play = (run: Run, cue: Cue): void => {
    const pan = panOf(run, cue.x, cue.z);

    switch (cue.kind) {
      case 'route.laid':
        audio.routeLinked(pan);
        break;
      case 'route.erased':
        audio.routeLost(pan);
        break;
      case 'worker.born':
        audio.hatch(pan);
        break;
      case 'worker.died':
        audio.workerDied(pan);
        break;
      case 'worker.pickup':
        audio.pickup(pan);
        break;
      case 'worker.deliver':
        audio.deliver(pan, Math.min(1, cue.amount ?? 1));
        break;
      case 'worker.recover':
        // Deliberately quiet and distinct. A worker giving up is information, not an event.
        audio.uiTick();
        break;
      case 'scout.seen':
        audio.suspicionUp();
        break;
      case 'scout.found':
        audio.routeLinked(pan);
        break;
      case 'scout.climb':
        audio.skitter(pan, 0.6);
        break;
      case 'foothold.claimed':
        audio.fitOut(pan);
        break;
      case 'gate.opened':
        // The single most important sound in the game: the world just changed shape.
        audio.zoneHeld();
        break;
      case 'adaptation.chosen':
        audio.adapt('brood');
        break;
      case 'routine.incoming':
        audio.routineWarn('dishes', pan);
        break;
      case 'routine.active':
        audio.routineStart('dishes', pan);
        break;
      default:
        if (cue.kind.startsWith('threat.')) playThreat(cue, pan);
    }
  };

  return {
    unlock() {
      audio.start();
      audio.applySettings();
    },

    update(run, dt) {
      if (!audio.started) return;

      for (const cue of run.cues) {
        if (near(run, cue)) play(run, cue);
      }

      /*
       * Continuous layers. The scout's own footfalls are rate-limited by its actual ground speed, so
       * standing still is silent and sprinting is frantic — the gait you hear is the gait you see.
       */
      if (run.scout.speed > 1) {
        skitterTimer -= dt * (run.scout.speed / 240);
        if (skitterTimer <= 0) {
          skitterTimer = 0.13;
          audio.skitter(0, Math.min(1, run.scout.speed / 545));
        }
      }

      // One worker footfall stands in for the whole column, picked from whichever is nearest, so a
      // busy route sounds busy without spending twenty voices on it.
      let nearest: number | null = null;
      let nearestDistance = 700;
      for (const worker of run.workers) {
        if (!worker.alive || worker.speed <= 0.5) continue;
        const d = Math.hypot(worker.x - run.scout.x, worker.z - run.scout.z);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = worker.id;
        }
      }
      if (nearest !== null) {
        workerTimer -= dt;
        if (workerTimer <= 0) {
          workerTimer = 0.19;
          const worker = run.workers[nearest];
          if (worker) audio.workerSkitter(panOf(run, worker.x, worker.z));
        }
      }

      // Ambience beds: colony size, whether something lethal is in the air, and how alarmed the
      // loudest room currently is.
      let alert = 0;
      for (const region of run.regions.values()) {
        if (region.unlocked && region.alert > alert) alert = region.alert;
      }
      const spraying = run.threats.some((t) => t.kind === 'spray' && t.phase === 'active');
      const water = run.routines.get('bathroom.use')?.phase === 'active' ? 1 : 0;
      const fridge = run.routines.get('kitchen.dinner')?.phase === 'active' ? 1 : 0;
      audio.updateBeds(run.colony.population, spraying, dt, {
        fridgeOpen: fridge,
        water,
        alert: alert / 4,
      });
    },

    suspend: () => audio.suspend(),
    resume: () => audio.resume(),
    get started() {
      return audio.started;
    },
    get voices() {
      return audio.voices;
    },
    dispose() {
      audio.resetMix();
      audio.suspend();
    },
  };
}

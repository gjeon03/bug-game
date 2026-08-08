import * as THREE from 'three';
import '../ui/styles.css';
import { t } from '../i18n';
import { mm } from '../world/units';
import { SIM_DT, createRun, logEvent } from '../colony/state';
import { RECALL_COOLDOWN_SECONDS, panic } from '../colony/workers';
import { stepRun } from '../colony/step';
import {
  eraseNearestRoute,
  nestInReach,
  sealTrail,
  sourceInReach,
  startTrail,
} from '../colony/trail';
import {
  beginClimb,
  claimFoothold,
  climbInReach,
  footholdInReach,
  gateInReach,
} from '../colony/scout';
import {
  BAIT_EVIDENCE,
  beginGateWork,
  checkGate,
  chooseAdaptation,
  stopGateWork,
} from '../colony/progression';
import { createRenderer, type GameRenderer } from '../view/render';
import { FRAME_BUDGET, SCENE_CEILINGS, judge } from '../view/profiler';
import { createHud, type Hud, type PromptState } from '../ui/hud';
import { createAudioBridge, type AudioBridge } from '../audio/bridge';
import { createInput, type Input } from './input';
import { Clock } from './loop';
import type { Run } from '../colony/types';

/**
 * The entry point.
 *
 * Owns exactly one `Run` and one `GameRenderer` at a time. Restart drops both and builds new ones,
 * which is what makes the five-restart leak gate a property of construction rather than of anyone
 * remembering to reset a field.
 */

const CANVAS_ID = 'game';
const SEED_PARAM = 'seed';

interface Session {
  run: Run;
  renderer: GameRenderer;
}

export async function boot(): Promise<void> {
  const found = document.getElementById(CANVAS_ID) as HTMLCanvasElement | null;
  if (!found) throw new Error(`canvas #${CANVAS_ID} not found`);
  const canvas: HTMLCanvasElement = found;

  document.documentElement.lang = 'ko';
  document.title = t('meta.title');
  // The description is player-facing too — it is what a shared link shows. `index.html` ships it
  // empty so there is exactly one place these words live.
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', t('meta.description'));

  // Text is measured only after the vendored font is actually available. A swap mid-measure is the
  // layout jump the font gate forbids.
  if (document.fonts?.ready) await document.fonts.ready;

  const hud: Hud = createHud('hud');
  const input: Input = createInput();
  const audio: AudioBridge = createAudioBridge();

  /*
   * An AudioContext cannot be created outside a user gesture. The help card is dismissed with a
   * keypress, which is that gesture — so the game is silent for exactly as long as the player has
   * not touched anything, and audible from their first input onward.
   */
  const unlockAudio = (): void => {
    audio.unlock();
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('pointerdown', unlockAudio);
  };
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('pointerdown', unlockAudio);
  const clock = new Clock();

  const params = new URLSearchParams(window.location.search);
  const requested = Number(params.get(SEED_PARAM));
  const seed = Number.isFinite(requested) && requested !== 0 ? requested : 20260805;

  let session = start(canvas, seed);
  let paused = false;
  let stamina = 1;
  let finalPressure = 0;
  let frame = 0;

  hud.showCurtain('help', session.run);

  function start(target: HTMLCanvasElement, withSeed: number): Session {
    const run = createRun(withSeed);
    const renderer = createRenderer(target, run);
    resize(renderer);
    renderer.reset(run);
    return { run, renderer };
  }

  function resize(renderer: GameRenderer): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.resize(window.innerWidth, window.innerHeight, dpr);
  }

  /** Screen point to a world position on the plane the scout is currently standing on. */

  /** What the scout could do right now, if anything. Drives the contextual prompt. */
  function currentPrompt(run: Run): PromptState | null {
    if (run.scout.working) return { key: 'E', labelKey: 'prompt.working' };
    const gate = gateInReach(run);
    if (gate) {
      const check = checkGate(run, gate);
      return check.ok
        ? { key: 'E', labelKey: 'prompt.claim' }
        : { key: '', labelKey: check.blockerKey ?? 'prompt.claim', params: check.blockerParams };
    }
    /*
     * The pheromone keys, which had no prompt at all.
     *
     * Laying a route is the mechanic the whole design rests on, and the only place F was ever named
     * was the help card — which `input.ts` dismisses on the first keypress of any kind and which
     * has exactly one call site, at boot. A player who pressed a key before reading it never saw
     * the binding again, and the objective panel tells them to lay a route without naming a key.
     *
     * Ordered below the refuge prompt so an unclaimed refuge still offers E first, and above the
     * climb prompt so standing on a claimed refuge offers the thing you actually came to do.
     */
    if (run.trail) {
      return sourceInReach(run)
        ? { key: 'F', labelKey: 'prompt.sealRoute' }
        : { key: '', labelKey: 'prompt.walkingRoute' };
    }
    const foothold = footholdInReach(run);
    if (foothold) {
      const damaged = (run.footholds.get(foothold)?.damage ?? 0) > 0;
      return { key: 'E', labelKey: damaged ? 'prompt.rebuild' : 'prompt.claim' };
    }
    if (nestInReach(run)) return { key: 'F', labelKey: 'prompt.startRoute' };
    if (climbInReach(run)) return { key: 'Space', labelKey: 'prompt.climb' };
    return null;
  }

  /**
   * Start a fresh run.
   *
   * The renderer is REUSED, not rebuilt. Constructing a second `WebGLRenderer` on a canvas whose
   * context has been force-lost throws, and a real-browser capture caught exactly that. The GL
   * context is created once per page load; `rebuild` swaps the world inside it.
   */
  function restart(): void {
    hud.hideCurtain();
    const run = createRun(seed);
    session = { run, renderer: session.renderer };
    session.renderer.rebuild(run);
    paused = false;
    stamina = 1;
    finalPressure = 0;
    clock.start(performance.now());
  }

  window.addEventListener('resize', () => resize(session.renderer));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      input.releaseAll();
      audio.suspend();
    } else {
      // Re-anchor rather than simulate the time the player was not watching.
      clock.resume(performance.now());
      audio.resume();
    }
  });

  clock.start(performance.now());

  /** Wall-clock stamp of the previous frame, for the visual `dt` below. */
  let lastFrame = performance.now();

  function tick(now: number): void {
    frame++;
    const run = session.run;
    // CPU cost of everything that is not the draw call — simulation, input, HUD. Measured
    // separately from GPU because a frame budget with one total and no breakdown sends you to
    // optimise whatever you guessed, which is how the previous build lost five attempts.
    const cpuStart = performance.now();

    for (const action of input.take()) {
      if (action.kind === 'dismiss') {
        if (hud.curtain === 'help') hud.hideCurtain();
        continue;
      }
      if (action.kind === 'restart') {
        restart();
        return requestAnimationFrame(tick) as unknown as void;
      }
      if (action.kind === 'pause') {
        if (run.status !== 'playing') continue;
        paused = !paused;
        if (paused) hud.showCurtain('pause', run);
        else hud.hideCurtain();
        continue;
      }
      if (run.status !== 'playing' || paused) continue;

      switch (action.kind) {
        case 'trail':
          // One key, two meanings, decided by whether a line is already being walked.
          if (run.trail) sealTrail(run);
          else startTrail(run);
          break;
        case 'eraseNearest':
          eraseNearestRoute(run);
          break;
        case 'broodHold': {
          run.colony.broodHold = !run.colony.broodHold;
          logEvent(
            run,
            run.colony.broodHold ? 'log.broodHold.on' : 'log.broodHold.off',
            'info',
            {},
          );
          break;
        }
        /*
         * Emergency recall.
         *
         * Three independent critics scored the gameplay loop lowest of everything, and all three
         * named the same cause: after a route is drawn there is nothing to decide, and the whole
         * answer to a threat is "erase the line and draw it again". `panic()` — the thing that
         * makes a colony drop cargo and run — already existed and was reachable only by the
         * household. The player could watch it happen and could not cause it.
         *
         * Wiring it to a key turns a threat telegraph into a question with a price. Recalling
         * saves the workers standing in the spray and throws away every crumb in transit; the
         * cooldown means spending it on a false alarm leaves the colony unable to run from the
         * next one. That is a decision, and it repeats all run.
         */
        case 'recall': {
          if (run.time < run.colony.recallReadyAt) {
            logEvent(run, 'log.recall.cooling', 'warn', {});
            break;
          }
          run.colony.recallReadyAt = run.time + RECALL_COOLDOWN_SECONDS;
          const running = run.workers.filter((w) => w.alive && !w.climb).length;
          panic(run, run.scout.x, run.scout.z, Number.POSITIVE_INFINITY);
          logEvent(run, 'log.recall.ordered', 'warn', { count: running });
          break;
        }
        /*
         * Bait the sweep.
         *
         * `step.ts` measured the defect and then only named it: every gameplay condition is met by
         * 169 s, the run ends at 242-252 s, and the 75-77 seconds between them are the sweep
         * cooldown ticking down with nothing to decide — 31-37 % of a run. Calling it
         * `blocker.extermination` in the objective panel made the silence explained. It did not
         * make it shorter, and a designer reviewing the loop scored it a P0 anyway. Naming a wait
         * is not removing it.
         *
         * Baiting removes it the only honest way: by letting the player end the wait on their own
         * terms. Leave a deliberate trace and the household comes now instead of eventually — but
         * it comes angrier, because the evidence you just planted is the same number that sets the
         * sweep's severity. Wait and stay quiet, or finish it while the colony is still strong.
         *
         * Gated to the final chapter with a cooldown actually pending, because that is exactly the
         * situation the measurement describes. Offering it earlier would be a different feature
         * with a balance cost nobody has measured.
         */
        case 'bait': {
          if (run.chapter !== 'final' || run.sweepCooldown <= 0) {
            logEvent(run, 'log.bait.pointless', 'info', {});
            break;
          }
          const region = run.house.regionOf.get(run.scout.surface);
          const state = region ? run.regions.get(region) : undefined;
          if (state) state.evidence = Math.min(1, state.evidence + BAIT_EVIDENCE);
          run.sweepCooldown = 0;
          logEvent(run, 'log.bait.laid', 'danger', {});
          break;
        }
        case 'interact': {
          if (run.scout.working) {
            stopGateWork(run);
            break;
          }
          const gate = gateInReach(run);
          if (gate) {
            beginGateWork(run, gate);
            break;
          }
          const foothold = footholdInReach(run);
          if (foothold) claimFoothold(run, foothold);
          break;
        }
        case 'traverse': {
          const link = climbInReach(run);
          if (link) beginClimb(run, link);
          break;
        }
        case 'adapt':
          chooseAdaptation(run, action.family);
          break;
        case 'zoom':
          session.renderer.camera.zoom(action.delta * mm(180));
          break;
      }
    }

    const blocked = paused || run.status !== 'playing' || hud.curtain === 'help';
    const move = blocked ? { x: 0, z: 0 } : input.movement();

    const steps = blocked ? 0 : clock.advance(now);
    if (blocked) clock.resume(now);

    for (let i = 0; i < steps; i++) {
      const result = stepRun(run, SIM_DT, {
        moveX: move.x,
        moveZ: move.z,
        sprint: input.sprinting(),
        stamina,
      });
      stamina = result.stamina;
      finalPressure = result.finalPressure;
    }

    /*
     * Visual time is WALL time, not simulation steps.
     *
     * This was `Math.min(0.05, steps * SIM_DT || 1 / 60)`. A frame that produces no simulation step
     * — which above 60 Hz is most of them — got charged a full 1/60 s anyway, so the view layer's
     * clock ran fast in proportion to the refresh rate. Measured by replicating both paths:
     *
     *   60 Hz 1.00x · 120 Hz 2.00x · 144 Hz 2.40x · 240 Hz 4.00x
     *
     * This `dt` reaches occlusion fading, camera damping, gait, threat pulse and the audio beds.
     * `DEFAULT_FADE_SECONDS = 0.22` became 92 ms at 144 Hz, under the 150-300 ms floor §3 states as
     * a contract clause — so the build broke a numbered requirement on any high-refresh display.
     *
     * Every piece of evidence in this repo missed it because the capture and perf harnesses run at
     * 60 Hz, where the old expression happens to be exactly right. The condition that breaks it has
     * never existed in our own measurements.
     *
     * The simulation is untouched: it still advances in fixed `SIM_DT` steps through `clock`. Only
     * the interpolated presentation reads real elapsed time, which is what it always meant to do.
     */
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;

    // Cues are produced by the simulation and consumed here, once — by audio, then discarded.
    // Nothing reads them back, which is why the simulation can push them without knowing whether
    // sound is even switched on.
    audio.update(run, dt);
    run.cues.length = 0;
    session.renderer.render(run, dt, clock.alpha);
    hud.update(run, run.scout.seen, blocked ? null : currentPrompt(run));
    session.renderer.profiler.frame(now, performance.now() - cpuStart);

    if (run.status !== 'playing' && hud.curtain !== 'won' && hud.curtain !== 'lost') {
      hud.showCurtain(run.status === 'won' ? 'won' : 'lost', run);
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  // A minimal, deliberately read-only handle for automated playtesting and evidence capture.
  // It exposes state and the same actions a player has; it cannot write simulation state.
  Object.defineProperty(window, '__game', {
    value: {
      get run() {
        return session.run;
      },
      get stats() {
        return session.renderer.stats();
      },
      /** Scene graph, for evidence capture. See the note on `GameRenderer.scene`. */
      get scene() {
        return session.renderer.scene;
      },
      get frame() {
        return frame;
      },
      get pressure() {
        return finalPressure;
      },
      get audio() {
        return { started: audio.started, voices: audio.voices };
      },
      /**
       * Judge a profile against the shipped budget, from inside the page.
       *
       * `scripts/perf.mjs` runs under node and cannot import TypeScript, so without this the only
       * way for the harness to enforce §10 would be to restate `FRAME_BUDGET` and `SCENE_CEILINGS`
       * in a second place — and a budget the gate and the test disagree about is worse than no
       * budget. Exposing the judgement instead of the numbers keeps one source of truth.
       */
      judge(profile: Parameters<typeof judge>[0]) {
        return judge(profile, FRAME_BUDGET, SCENE_CEILINGS);
      },
      /**
       * World position to CSS pixels.
       *
       * Kept for evidence capture and defect triage — it is how a screenshot harness answers "where
       * on screen is the thing I am claiming something about". It no longer has anything to do with
       * route drawing, which is walked with the keyboard.
       */
      project(x: number, y: number, z: number) {
        const v = new THREE.Vector3(x, y, z).project(session.renderer.camera.camera);
        const rect = canvas.getBoundingClientRect();
        return {
          x: rect.left + ((v.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - v.y) / 2) * rect.height,
        };
      },
      /** Read-only camera diagnostics, for evidence capture and defect triage. */
      get camera() {
        const c = session.renderer.camera;
        const p = c.camera.position;
        const f = c.focusPoint;
        return {
          pos: { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) },
          focus: { x: Math.round(f.x), y: Math.round(f.y), z: Math.round(f.z) },
          pulledIn: Math.round(c.pulledIn),
        };
      },
      /** What lies between the focus point and the camera right now, nearest first. */
      probe: () => session.renderer.probeView(),
      /** Photograph a room. Evidence capture only — the simulation is untouched. */
      viewRegion: (id: string, distance: number) => {
        session.renderer.viewRegion(id as never, distance, session.run);
      },
      releaseView: () => session.renderer.releaseView(),
      occluderDebug: () => session.renderer.occluderDebug(),
      profile: () => session.renderer.profiler.end(),
      beginProfile: (label: string) => session.renderer.profiler.begin(label),
      restart,
    },
    configurable: true,
  });
}

boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const node = document.getElementById('hud');
  if (node) {
    node.innerHTML = `<div class="panel" style="margin:auto">${t('error.runtime')}</div>`;
  }
  // Surfaced rather than swallowed: a boot failure with a silent console is unfixable.
  throw new Error(`boot failed: ${message}`);
});

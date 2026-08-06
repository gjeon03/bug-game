import * as THREE from 'three';
import '../ui/styles.css';
import { t } from '../i18n';
import { mm } from '../world/units';
import { SIM_DT, createRun } from '../colony/state';
import { stepRun } from '../colony/step';
import { createRoute, eraseRoute, type DrawnPoint } from '../colony/routes';
import {
  beginClimb,
  claimFoothold,
  climbInReach,
  footholdInReach,
  gateInReach,
} from '../colony/scout';
import { beginGateWork, checkGate, chooseAdaptation, stopGateWork } from '../colony/progression';
import { createRenderer, type GameRenderer } from '../view/render';
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

  // Text is measured only after the vendored font is actually available. A swap mid-measure is the
  // layout jump the font gate forbids.
  if (document.fonts?.ready) await document.fonts.ready;

  const hud: Hud = createHud('hud');
  const input: Input = createInput(canvas);
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

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();

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
  function toWorld(clientX: number, clientY: number, run: Run): THREE.Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, session.renderer.camera.camera);
    const y = run.house.surfaces.get(run.scout.surface)?.y ?? 0;
    plane.set(new THREE.Vector3(0, 1, 0), -y);
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  /**
   * Turn a finished drag into a route.
   *
   * The nest is the claimed foothold nearest where the drag started and the source is the
   * discovered resource nearest where it ended, both on the scout's surface. That is the reading a
   * player intends when they drag from their nest to some food, and it never silently picks
   * something they cannot see.
   */
  function commitDrag(run: Run, samples: readonly { clientX: number; clientY: number }[]): void {
    if (samples.length < 2) return;
    const points: DrawnPoint[] = [];
    for (const sample of samples) {
      const world = toWorld(sample.clientX, sample.clientY, run);
      if (world) points.push({ surface: run.scout.surface, x: world.x, z: world.z });
    }
    if (points.length < 2) return;

    const head = points[0]!;
    const tail = points[points.length - 1]!;

    let nest = '';
    let nestDistance = mm(900);
    for (const [id, state] of run.footholds) {
      if (!state.claimed || state.damage >= 1) continue;
      const site = run.house.footholds.get(id);
      if (!site) continue;
      const d = Math.hypot(site.at.x - head.x, site.at.z - head.z);
      if (d < nestDistance) {
        nestDistance = d;
        nest = id;
      }
    }

    let target = '';
    let targetDistance = mm(900);
    for (const [id, state] of run.resources) {
      if (!state.found || state.remaining <= 0) continue;
      const site = run.house.resources.get(id);
      if (!site) continue;
      const d = Math.hypot(site.at.x - tail.x, site.at.z - tail.z);
      if (d < targetDistance) {
        targetDistance = d;
        target = id;
      }
    }

    if (!nest || !target) return;
    createRoute(run, nest, target, points);
    run.idleFor = 0;
  }

  /** What the scout could do right now, if anything. Drives the contextual prompt. */
  function currentPrompt(run: Run): PromptState | null {
    if (run.scout.working) return { key: 'E', labelKey: 'help.interact' };
    const gate = gateInReach(run);
    if (gate) {
      const check = checkGate(run, gate);
      return check.ok
        ? { key: 'E', labelKey: 'help.interact' }
        : { key: '', labelKey: check.blockerKey ?? 'help.interact', params: check.blockerParams };
    }
    if (footholdInReach(run)) return { key: 'E', labelKey: 'help.interact' };
    if (climbInReach(run)) return { key: 'Space', labelKey: 'help.traverse' };
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
        case 'erase': {
          // Erase the route whose nearest point is closest to the cursor.
          const p = input.pointer;
          if (!p) break;
          const world = toWorld(p.clientX, p.clientY, run);
          if (!world) break;
          let best = '';
          let bestDistance = mm(320);
          for (const route of run.routes) {
            for (const point of route.points) {
              const d = Math.hypot(point.x - world.x, point.z - world.z);
              if (d < bestDistance) {
                bestDistance = d;
                best = route.id;
              }
            }
          }
          if (best) eraseRoute(run, best);
          break;
        }
        case 'zoom':
          session.renderer.camera.zoom(action.delta * mm(180));
          break;
      }
    }

    if (!input.dragging && input.drag.length > 0) {
      commitDrag(run, input.endDrag());
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

    const dt = Math.min(0.05, steps * SIM_DT || 1 / 60);

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
       * World position to CSS pixels.
       *
       * Exposed so an automated playtest can drag between two things that actually exist rather
       * than between arbitrary screen coordinates — the difference between testing route drawing
       * and testing whether a blind drag happens to land on something.
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

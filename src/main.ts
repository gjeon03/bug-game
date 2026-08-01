import './style.css';

import { FixedClock, SIM_DT } from './core/clock.ts';
import { clamp } from './core/math.ts';
import { Telemetry } from './core/telemetry.ts';
import { GameAudio } from './audio/audio.ts';
import { buildAtlas } from './render/atlas.ts';
import { TINT } from './render/atlas.ts';
import { Camera } from './render/camera.ts';
import { PRIO, Particles } from './render/particles.ts';
import { Renderer, type RenderSettings } from './render/renderer.ts';
import { WORLD_H, WORLD_W } from './sim/constants.ts';
import { stepWorld } from './sim/sim.ts';
import { createWorld, type World } from './sim/world.ts';
import { snapshot, telemetrySnapshot, type LogicalKey, type TestApi } from './testapi.ts';
import { Hud } from './ui/hud.ts';
import { Overlays } from './ui/overlays.ts';
import { loadSettings, saveBestRun, saveSettings, type Settings } from './ui/settings.ts';

const VERSION = '1.0.0';
/** Seconds the world-space win/lose payoff plays before the end card appears over it. */
const END_CARD_DELAY = 2.4;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;
const overlayRoot = document.getElementById('overlay') as HTMLElement;

const errors: string[] = [];
window.addEventListener('error', (e) => {
  errors.push(`${e.message} @ ${e.filename}:${e.lineno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  errors.push(`unhandled rejection: ${String(e.reason)}`);
});

const t0 = performance.now();
const settings: Settings = loadSettings();
const telemetry = new Telemetry();
const atlas = buildAtlas(WORLD_W, WORLD_H, 0xb00c);
telemetry.startup.atlasMs = atlas.buildMs;

const renderer = new Renderer(canvas, atlas, 0xb00c);
telemetry.startup.rendererMs = Math.round((performance.now() - t0) * 100) / 100;

const camera = new Camera();
const particles = new Particles();
const audio = new GameAudio();
audio.settings = {
  master: settings.master,
  music: settings.music,
  sfx: settings.sfx,
  muted: settings.muted,
};

const hud = new Hud(hudRoot);
const clock = new FixedClock();

let world: World = createWorld(pickSeed());
let paused = false;
/** True while the tab is in the background: the run halts rather than playing on unseen. */
let backgrounded = false;
let lastTime = performance.now();
let bestSaved = false;
let skitterAcc = 0;
/** Seconds since the run ended, so the world-space payoff plays before the end card covers it. */
let outcomeTime = -1;
let celebrateAcc = 0;

const overlays = new Overlays(overlayRoot, settings, {
  resume: () => {
    if (overlays.kind === 'help' && paused) {
      overlays.showPause(world);
      return;
    }
    setPaused(false);
  },
  restart: () => startRun(),
  skipInterlude: () => {
    world.intent.skipInterlude = true;
  },
  settingsChanged: () => {
    saveSettings(settings);
    audio.settings = {
      master: settings.master,
      music: settings.music,
      sfx: settings.sfx,
      muted: settings.muted,
    };
    audio.applySettings();
  },
});

function pickSeed(): number {
  return (Math.floor(Math.random() * 0xffffff) ^ Date.now()) >>> 0;
}

function startRun(seed?: number): void {
  world = createWorld(seed ?? pickSeed());
  world.onboarding.seenBefore = settings.seenOnboarding;
  particles.clear();
  clock.reset();
  outcomeTime = -1;
  celebrateAcc = 0;
  renderer.setOutcome(null, 0);
  camera.snapTo(world.scout.x, world.scout.y);
  audio.resetMix();
  overlays.hide();
  paused = false;
  bestSaved = false;
  lastTime = performance.now();
  canvas.focus();
}

// ── Input ────────────────────────────────────────────────────────────────────

const held = new Set<string>();
let erasePressAt = 0;

function ensureAudio(): void {
  audio.start();
  audio.applySettings();
}

function setPaused(next: boolean): void {
  if (world.status === 'won' || world.status === 'lost') return;
  paused = next;
  if (paused) {
    overlays.showPause(world);
    audio.suspend();
  } else {
    overlays.hide();
    audio.resume();
    lastTime = performance.now();
    clock.flush();
  }
}

function keyDown(e: KeyboardEvent): void {
  ensureAudio();
  const code = e.code;
  if (
    code === 'Space' ||
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight' ||
    code === 'Tab'
  ) {
    e.preventDefault();
  }
  if (held.has(code)) return;
  held.add(code);

  switch (code) {
    case 'Escape':
    case 'KeyP':
      if (world.status === 'playing' || world.status === 'interlude') setPaused(!paused);
      break;
    case 'KeyR':
      startRun();
      break;
    case 'Enter':
      if (world.status === 'interlude') world.intent.skipInterlude = true;
      else if (world.status === 'won' || world.status === 'lost') startRun();
      break;
    case 'KeyE':
      world.input.interactPressed = true;
      break;
    case 'KeyX':
      erasePressAt = performance.now();
      break;
    default:
      break;
  }
  applyHeld();
}

function keyUp(e: KeyboardEvent): void {
  held.delete(e.code);
  if (e.code === 'KeyX' && performance.now() - erasePressAt < 240) {
    world.input.erasePressed = true;
  }
  applyHeld();
}

function applyHeld(): void {
  const i = world.input;
  i.up = held.has('KeyW') || held.has('ArrowUp');
  i.down = held.has('KeyS') || held.has('ArrowDown');
  i.left = held.has('KeyA') || held.has('ArrowLeft');
  i.right = held.has('KeyD') || held.has('ArrowRight');
  i.sprint = held.has('ShiftLeft') || held.has('ShiftRight');
  i.lay = held.has('Space') || held.has('Mouse0');
  i.erase = held.has('KeyX') || held.has('Mouse2');
}

canvas.addEventListener('pointerdown', (e) => {
  ensureAudio();
  canvas.setPointerCapture?.(e.pointerId);
  if (e.button === 0) held.add('Mouse0');
  if (e.button === 2) {
    held.add('Mouse2');
    erasePressAt = performance.now();
  }
  applyHeld();
});

window.addEventListener('pointerup', (e) => {
  if (e.button === 0) held.delete('Mouse0');
  if (e.button === 2) {
    held.delete('Mouse2');
    if (performance.now() - erasePressAt < 240) world.input.erasePressed = true;
  }
  applyHeld();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', keyDown);
window.addEventListener('keyup', keyUp);
window.addEventListener('blur', () => {
  held.clear();
  applyHeld();
});

document.addEventListener('visibilitychange', () => {
  backgrounded = document.hidden;
  if (document.hidden) {
    audio.suspend();
    held.clear();
    applyHeld();
  } else {
    // Discard the time spent hidden so the colony never fast-forwards while the tab slept.
    lastTime = performance.now();
    clock.flush();
    if (!paused && !overlays.visible) audio.resume();
  }
});

// ── Resize ───────────────────────────────────────────────────────────────────

function resize(): void {
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.resize(w, h, dpr);
  camera.resize(w, h);
}
window.addEventListener('resize', resize);
resize();
camera.snapTo(world.scout.x, world.scout.y);

// ── Event reactions (audio + VFX + camera) ───────────────────────────────────

function panOf(x: number): number {
  return clamp((x - camera.x) / (camera.viewW / camera.zoom / 2), -1, 1);
}

function distOf(x: number, y: number): number {
  return Math.hypot(x - camera.x, y - camera.y);
}

function processEvents(rs: RenderSettings): void {
  const events = world.events;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    switch (e.t) {
      case 'trailLaid':
        audio.layTick(panOf(e.x));
        particles.emit('glow', TINT.cold, e.x, e.y, 0, 0, 0.55, 13, 0.5, PRIO.feedback, 3);
        break;
      case 'trailAcquired':
        audio.uiTick();
        particles.ring(TINT.cold, e.x, e.y, 5, 26, 0.45, 0.7, PRIO.signal);
        break;
      case 'routeLinked':
        audio.routeLinked(panOf(e.x));
        particles.ring(TINT.warm, e.x, e.y, 8, 74, 0.75, 0.9, PRIO.signal);
        break;
      case 'routeLost':
        audio.routeLost(panOf(e.x));
        break;
      case 'pickup':
        audio.pickup(panOf(e.x));
        particles.burst(
          'spark',
          e.kind === 'food' ? TINT.amber : TINT.cold,
          e.x,
          e.y,
          6,
          70,
          0.4,
          5,
          0.8,
          PRIO.feedback,
          Math.random,
        );
        break;
      case 'deliver':
        audio.deliver(panOf(e.x), world.colony.food / world.colony.foodCap);
        particles.burst(
          'glow',
          e.kind === 'food' ? TINT.warm : TINT.cold,
          e.x,
          e.y,
          10,
          95,
          0.6,
          8,
          0.75,
          PRIO.feedback,
          Math.random,
        );
        particles.ring(
          e.kind === 'food' ? TINT.warm : TINT.cold,
          e.x,
          e.y,
          6,
          44,
          0.5,
          0.6,
          PRIO.feedback,
        );
        break;
      case 'hatch':
        audio.hatch(panOf(e.x));
        particles.burst(
          'glow',
          TINT.bone,
          e.x,
          e.y,
          8,
          60,
          0.7,
          6,
          0.6,
          PRIO.feedback,
          Math.random,
        );
        break;
      case 'claim':
        particles.ring(TINT.warm, e.x, e.y, 12, 210, 1.1, 1, PRIO.signal);
        break;
      case 'upgrade':
        audio.upgrade(panOf(e.x));
        particles.burst(
          'glow',
          TINT.warm,
          e.x,
          e.y,
          46,
          190,
          1.5,
          13,
          0.85,
          PRIO.signal,
          Math.random,
        );
        particles.ring(TINT.warm, e.x, e.y, 16, 300, 1.5, 0.9, PRIO.signal);
        renderer.addFlash(255, 190, 110, 0.22, 5, rs);
        break;
      case 'suspicion':
        if (e.delta > 1.5) {
          audio.suspicionUp();
          if (e.x !== 0 || e.y !== 0) {
            particles.ring(TINT.danger, e.x, e.y, 10, 90, 0.7, 0.75, PRIO.signal);
          }
        }
        break;
      case 'tier':
        audio.tierUp();
        renderer.addFlash(255, 90, 60, 0.2, 4, rs);
        camera.addShake(3);
        break;
      case 'footWarn':
        audio.footWarn(panOf(e.x), distOf(e.x, e.y));
        break;
      case 'footHit': {
        const d = distOf(e.x, e.y);
        audio.footHit(panOf(e.x), d);
        camera.addShake(Math.max(0, 13 - d / 130));
        particles.burst(
          'dust',
          TINT.bone,
          e.x,
          e.y,
          24,
          260,
          0.85,
          20,
          0.5,
          PRIO.danger,
          Math.random,
        );
        particles.ring(TINT.danger, e.x, e.y, 40, 220, 0.45, 0.9, PRIO.danger);
        if (d < 420) renderer.addFlash(255, 70, 50, 0.16, 7, rs);
        break;
      }
      case 'lightOn':
        audio.lightOn();
        renderer.addFlash(240, 235, 220, 0.3, 3.2, rs);
        break;
      case 'trapArmed':
        particles.ring(TINT.danger, e.x, e.y, 8, 110, 0.9, 0.55, PRIO.signal);
        break;
      case 'trapSprung':
        audio.trapSnap(panOf(e.x));
        particles.burst(
          'spark',
          TINT.bone,
          e.x,
          e.y,
          12,
          110,
          0.5,
          6,
          0.7,
          PRIO.danger,
          Math.random,
        );
        camera.addShake(2.5);
        break;
      case 'sprayStart':
        audio.sprayStart(panOf(e.x));
        renderer.addFlash(150, 220, 110, 0.18, 4, rs);
        break;
      case 'scoutHurt':
        audio.scoutHurt(panOf(e.x));
        camera.addShake(4);
        break;
      case 'scoutDied':
        audio.scoutDied(panOf(e.x));
        camera.addShake(11);
        particles.burst(
          'dust',
          TINT.danger,
          e.x,
          e.y,
          26,
          150,
          0.9,
          11,
          0.6,
          PRIO.danger,
          Math.random,
        );
        renderer.addFlash(255, 60, 40, 0.3, 4, rs);
        break;
      case 'scoutRespawn':
        particles.ring(TINT.cold, e.x, e.y, 6, 90, 0.7, 0.8, PRIO.signal);
        break;
      case 'workerDied':
        audio.workerDied(panOf(e.x));
        particles.burst(
          'chip',
          TINT.amber,
          e.x,
          e.y,
          5,
          70,
          0.5,
          3,
          0.7,
          PRIO.feedback,
          Math.random,
        );
        break;
      case 'phase':
        renderer.addFlash(60, 90, 130, 0.24, 2.4, rs);
        break;
      case 'win':
        audio.victory();
        renderer.addFlash(255, 210, 150, 0.5, 1.4, rs);
        break;
      case 'lose':
        audio.defeat();
        renderer.addFlash(10, 12, 16, 0.6, 1.2, rs);
        break;
      default:
        break;
    }
  }
  events.length = 0;
}

// ── Frame loop ───────────────────────────────────────────────────────────────

function frame(now: number): void {
  const frameStart = performance.now();
  const dtReal = (now - lastTime) / 1000;
  lastTime = now;

  const rs: RenderSettings = {
    shakeScale: settings.reducedShake ? 0.32 : 1,
    reducedFlash: settings.reducedFlash,
    highContrast: settings.highContrast,
  };

  const active =
    !paused && !backgrounded && !(overlays.kind === 'pause' || overlays.kind === 'help');
  if (active) {
    const steps = clock.advance(dtReal);
    for (let i = 0; i < steps; i++) stepWorld(world, SIM_DT);
  }

  processEvents(rs);

  // Overlay state follows the simulation, never the other way round.
  if (world.status === 'interlude' && overlays.kind !== 'interlude') overlays.showInterlude(world);
  else if (world.status === 'playing' && overlays.kind === 'interlude') overlays.hide();
  else if (
    (world.status === 'won' || world.status === 'lost') &&
    overlays.kind !== 'win' &&
    overlays.kind !== 'lose' &&
    outcomeTime >= END_CARD_DELAY
  ) {
    overlays.showEnd(world);
    if (!bestSaved) {
      bestSaved = true;
      settings.seenOnboarding = true;
      saveSettings(settings);
      saveBestRun({
        won: world.status === 'won',
        seconds: world.stats.runSeconds,
        population: world.colony.population,
        suspicionPeak: world.suspicion.peak,
        deliveries: world.stats.deliveries,
      });
    }
  }

  const dtRender = Math.min(dtReal, 0.05);

  // ── Outcome payoff. The simulation is frozen, so the celebration is presentation-only.
  if (world.status === 'won' || world.status === 'lost') {
    if (outcomeTime < 0) outcomeTime = 0;
    outcomeTime += dtRender;
    renderer.setOutcome(world.status, outcomeTime);
    if (world.status === 'won' && outcomeTime < 6) {
      // Celebrate around the camera, not around the home crack: the scout may be on the far side of
      // the kitchen when the run ends, and a payoff the player cannot see is not a payoff.
      celebrateAcc += dtRender * 110;
      while (celebrateAcc >= 1) {
        celebrateAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = 60 + Math.random() * 620 * Math.min(1, outcomeTime / 2.5);
        particles.emit(
          'glow',
          Math.random() < 0.5 ? TINT.warm : TINT.amber,
          camera.x + Math.cos(a) * r,
          camera.y + Math.sin(a) * r * 0.62,
          Math.cos(a) * 40,
          Math.sin(a) * 40,
          1.9,
          6 + Math.random() * 7,
          0.8,
          PRIO.signal,
        );
      }
      if (outcomeTime < 0.1) {
        particles.ring(TINT.warm, camera.x, camera.y, 20, 1100, 1.8, 1, PRIO.signal);
        for (const nest of world.nests) {
          if (nest.claimed)
            particles.ring(TINT.warm, nest.x, nest.y, 10, 260, 1.4, 0.9, PRIO.signal);
        }
      }
    } else if (world.status === 'lost' && outcomeTime < 6) {
      celebrateAcc += dtRender * 34;
      while (celebrateAcc >= 1) {
        celebrateAcc -= 1;
        const b = camera.bounds(0);
        particles.emit(
          'dust',
          TINT.bone,
          b.x0 + Math.random() * (b.x1 - b.x0),
          b.y0 + Math.random() * (b.y1 - b.y0) - 200,
          0,
          40 + Math.random() * 60,
          3.6,
          3 + Math.random() * 4,
          0.5,
          PRIO.decor,
          0,
          0.05,
        );
      }
    }
  }

  const s = world.scout;
  camera.follow(s.x, s.y, s.vx, s.vy, dtRender, rs.shakeScale);
  particles.update(dtRender);

  // Skitter audio + dust follow the scout's actual motion.
  if (active && s.alive && s.speed > 30) {
    skitterAcc += (s.speed / 120) * dtRender * (s.sprinting ? 2.1 : 1);
    while (skitterAcc >= 1) {
      skitterAcc -= 1;
      audio.skitter(panOf(s.x), Math.min(1, s.speed / 400));
      particles.emit(
        'dust',
        TINT.bone,
        s.x - Math.cos(s.angle) * 12,
        s.y - Math.sin(s.angle) * 12,
        -s.vx * 0.12,
        -s.vy * 0.12,
        0.32,
        s.sprinting ? 6 : 3.4,
        0.28,
        PRIO.ambient,
      );
    }
    if (s.sprinting) audio.sprint(panOf(s.x));
  }
  if (active && world.tick % 24 === 0) {
    for (let i = 0; i < world.workers.length; i++) {
      const w = world.workers[i];
      if (!w.alive || w.state === 'idle') continue;
      if (Math.abs(w.x - camera.x) > 700 || Math.abs(w.y - camera.y) > 500) continue;
      audio.workerSkitter(panOf(w.x));
      break;
    }
  }

  renderer.draw(world, camera, particles, rs, now / 1000, dtRender);
  audio.updateBeds(world.colony.population, world.sprays.length > 0, dtRender);

  canvas.classList.toggle('laying', s.laying);

  telemetry.counters.roaches = world.colony.population + (s.alive ? 1 : 0);
  telemetry.counters.workers = world.colony.population;
  telemetry.counters.hazards = world.hazards.length + world.sprays.length + world.patrols.length;
  telemetry.counters.particles = particles.count;
  telemetry.counters.voices = audio.voices;
  telemetry.counters.drawCalls = renderer.drawCalls;
  telemetry.counters.pheromoneNodes = world.pheromoneNodeCount;

  hud.update(
    world,
    telemetry.recentFps(),
    settings.showPerf,
    `${renderer.drawCalls} draws · ${particles.count} fx · ${audio.voices} voices`,
  );

  telemetry.frame(performance.now() - frameStart, now);
  requestAnimationFrame(frame);
}

telemetry.startup.bootMs = Math.round((performance.now() - t0) * 100) / 100;
world.onboarding.seenBefore = settings.seenOnboarding;
requestAnimationFrame((t) => {
  lastTime = t;
  telemetry.startup.firstFrameMs = Math.round((performance.now() - t0) * 100) / 100;
  frame(t);
});

// ── Test API ─────────────────────────────────────────────────────────────────

const keyMap: Record<LogicalKey, keyof World['input']> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  lay: 'lay',
  erase: 'erase',
  sprint: 'sprint',
  interact: 'interact',
};

const api: TestApi = {
  ready: true,
  version: VERSION,
  newRun(seed?: number) {
    startRun(seed);
  },
  state() {
    return snapshot(world, paused, overlays.kind);
  },
  telemetry() {
    return telemetrySnapshot(
      telemetry,
      audio.voices,
      clock.steps,
      clock.discardedTime,
      clock.overloadFrames,
    );
  },
  markPerf(label: string) {
    telemetry.beginWindow(label, performance.now());
  },
  endPerf() {
    return telemetry.endWindow(performance.now());
  },
  input: {
    press(key: LogicalKey) {
      (world.input as unknown as Record<string, boolean>)[keyMap[key]] = true;
      if (key === 'interact') world.input.interactPressed = true;
    },
    release(key: LogicalKey) {
      (world.input as unknown as Record<string, boolean>)[keyMap[key]] = false;
    },
    releaseAll() {
      const i = world.input;
      i.up = i.down = i.left = i.right = false;
      i.lay = i.erase = i.sprint = i.interact = false;
    },
  },
  setPaused(next: boolean) {
    setPaused(next);
  },
  errors,
  assetAudit() {
    return {
      version: VERSION,
      atlasBuildMs: atlas.buildMs,
      roachAtlas: { w: atlas.roach.width, h: atlas.roach.height },
      floorTile: { w: atlas.floor.width, h: atlas.floor.height },
      debris: { w: atlas.debris.width, h: atlas.debris.height },
      materials: Object.keys(atlas.materials),
      glowTints: atlas.glows.length,
      audioStarted: audio.started,
      externalRequests: performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((n) => !n.startsWith(location.origin)),
    };
  },
};

(window as unknown as { __roach: TestApi }).__roach = api;

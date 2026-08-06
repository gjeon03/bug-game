import { cameraRelative } from '../view/camera';
import type { Run } from '../colony/types';
import type { AdaptationFamily } from '../colony/types';

/**
 * Keyboard and pointer.
 *
 * Held keys are polled, discrete actions are queued. That split matters: movement must sample the
 * key's *current* state every tick or a dropped frame eats a step of walking, while pressing E
 * twice in one frame must not claim two footholds.
 *
 * The pointer's job is route drawing. A drag samples world positions and hands the polyline to the
 * simulation exactly as drawn — the shape of that line is the player's decision and the game's
 * central mechanic, so it is never smoothed away here.
 */

export type Action =
  | { readonly kind: 'interact' }
  | { readonly kind: 'traverse' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'restart' }
  | { readonly kind: 'dismiss' }
  | { readonly kind: 'adapt'; readonly family: AdaptationFamily }
  | { readonly kind: 'erase' }
  | { readonly kind: 'broodHold' }
  | { readonly kind: 'zoom'; readonly delta: number };

const FAMILY_KEYS: Readonly<Record<string, AdaptationFamily>> = {
  Digit1: 'brood',
  Digit2: 'scavenging',
  Digit3: 'shadow',
};

export interface DragSample {
  readonly clientX: number;
  readonly clientY: number;
}

export interface Input {
  /** Camera-relative movement vector for this tick, already normalised. */
  movement(): { readonly x: number; readonly z: number };
  sprinting(): boolean;
  /** Drain queued discrete actions. */
  take(): readonly Action[];
  /** Points sampled during the current drag, oldest first. Empty when not dragging. */
  readonly drag: readonly DragSample[];
  readonly dragging: boolean;
  /** Consume the finished drag. Returns the samples and clears them. */
  endDrag(): readonly DragSample[];
  readonly pointer: DragSample | null;
  /** Release every held key — used when focus is lost, so the scout does not walk into a wall. */
  releaseAll(): void;
  dispose(): void;
}

/** Minimum pointer travel, in CSS pixels, before another drag sample is recorded. */
const DRAG_SPACING = 9;

export function createInput(target: HTMLElement): Input {
  const held = new Set<string>();
  const queue: Action[] = [];
  let drag: DragSample[] = [];
  let dragging = false;
  let pointer: DragSample | null = null;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      held.add(event.code);
      return;
    }
    held.add(event.code);

    switch (event.code) {
      case 'KeyE':
        queue.push({ kind: 'interact' });
        break;
      case 'Space':
        queue.push({ kind: 'traverse' });
        event.preventDefault();
        break;
      case 'Escape':
        queue.push({ kind: 'pause' });
        break;
      case 'KeyR':
        queue.push({ kind: 'restart' });
        break;
      case 'KeyH':
        queue.push({ kind: 'broodHold' });
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        // Held, not queued — movement is polled. This only stops the page scrolling under the game.
        event.preventDefault();
        break;
      default: {
        const family = FAMILY_KEYS[event.code];
        if (family) queue.push({ kind: 'adapt', family });
        break;
      }
    }
    queue.push({ kind: 'dismiss' });
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(event.code);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      queue.push({ kind: 'erase' });
      return;
    }
    if (event.button !== 0) return;
    dragging = true;
    drag = [{ clientX: event.clientX, clientY: event.clientY }];
    target.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    pointer = { clientX: event.clientX, clientY: event.clientY };
    if (!dragging) return;
    const last = drag[drag.length - 1];
    if (
      last &&
      Math.hypot(event.clientX - last.clientX, event.clientY - last.clientY) < DRAG_SPACING
    ) {
      return;
    }
    drag.push(pointer);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: WheelEvent): void => {
    queue.push({ kind: 'zoom', delta: Math.sign(event.deltaY) });
    event.preventDefault();
  };

  const onContextMenu = (event: Event): void => event.preventDefault();
  const onBlur = (): void => held.clear();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerUp);
  target.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('contextmenu', onContextMenu);

  return {
    movement() {
      /*
       * Arrow keys are bound alongside WASD.
       *
       * They were not, and a player pressing them got nothing at all — the browser scrolled the
       * page instead, because nothing called `preventDefault` for them either. WASD is what a
       * player used to games reaches for; the arrows are what everyone else reaches for, and there
       * is no reason to make that a wrong guess.
       */
      const up = held.has('KeyW') || held.has('ArrowUp');
      const down = held.has('KeyS') || held.has('ArrowDown');
      const rightKey = held.has('KeyD') || held.has('ArrowRight');
      const leftKey = held.has('KeyA') || held.has('ArrowLeft');
      const forward = (up ? 1 : 0) - (down ? 1 : 0);
      const strafe = (rightKey ? 1 : 0) - (leftKey ? 1 : 0);
      if (forward === 0 && strafe === 0) return { x: 0, z: 0 };
      return cameraRelative(forward, strafe);
    },
    sprinting: () => held.has('ShiftLeft') || held.has('ShiftRight'),
    take() {
      const out = queue.slice();
      queue.length = 0;
      return out;
    },
    get drag() {
      return drag;
    },
    get dragging() {
      return dragging;
    },
    endDrag() {
      const out = drag;
      drag = [];
      return out;
    },
    get pointer() {
      return pointer;
    },
    releaseAll() {
      held.clear();
      dragging = false;
      drag = [];
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('contextmenu', onContextMenu);
      held.clear();
      queue.length = 0;
      drag = [];
    },
  };
}

/** True when the run is in a state where world input should be ignored. */
export function inputBlocked(run: Run, paused: boolean, curtain: string | null): boolean {
  return paused || run.status !== 'playing' || curtain === 'help';
}

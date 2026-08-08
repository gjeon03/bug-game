import { cameraRelative } from '../view/camera';
import type { Run } from '../colony/types';
import type { AdaptationFamily } from '../colony/types';

/**
 * Keyboard only.
 *
 * Held keys are polled, discrete actions are queued. That split matters: movement must sample the
 * key's *current* state every tick or a dropped frame eats a step of walking, while pressing E
 * twice in one frame must not claim two footholds.
 *
 * ## There is no pointer path
 *
 * Route drawing used to be a pointer drag, and it was removed rather than kept as a convenience.
 * Two mechanics for one action is what produced the surface-stamping defect: every drag sample was
 * written onto `run.scout.surface` at the moment of the drag, so a route could not cross from the
 * floor to the worktop — vertical routes were structurally impossible in a game whose whole subject
 * is vertical space. Laying the trail by walking records the surface the scout is actually on.
 *
 * CLAUDE.md §1a: a player who never touches the mouse must be able to play the whole game.
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
  | { readonly kind: 'recall' }
  | { readonly kind: 'trail' }
  | { readonly kind: 'eraseNearest' }
  | { readonly kind: 'zoom'; readonly delta: number };

/**
 * Hangul jamo back to the physical key that produced it.
 *
 * `event.code` is meant to be layout-independent, and usually is. But this game ships Korean-first,
 * so a player very often has the IME in Hangul mode, and in that state a letter keydown can reach
 * the page with `code` empty or unidentified while the arrow keys — which no IME touches — keep
 * working perfectly. That is the exact signature reported: the arrows moved the scout right and D
 * did nothing, even though both run through the identical branch of `movement()`.
 *
 * Mapping the produced jamo back to its QWERTY position makes the controls work in either mode
 * without asking the player to notice what their 한/영 key is doing. 2-set layout.
 */
const HANGUL_TO_CODE: Readonly<Record<string, string>> = {
  ㄹ: 'KeyF',
  ㅎ: 'KeyG',
  ㅈ: 'KeyW',
  ㅁ: 'KeyA',
  ㄴ: 'KeyS',
  ㅇ: 'KeyD',
  ㄷ: 'KeyE',
  ㄱ: 'KeyR',
  ㅗ: 'KeyH',
  ㅂ: 'KeyQ',
};

/**
 * The canonical physical key for an event.
 *
 * Prefers `event.code`; falls back to the character when a layout or IME has emptied it. The Latin
 * fallback costs nothing and covers the same class of failure on other layouts.
 */
function resolveCode(event: KeyboardEvent): string {
  if (event.code) return event.code;
  const key = event.key ?? '';
  const jamo = HANGUL_TO_CODE[key];
  if (jamo) return jamo;
  if (key.length === 1 && /[a-zA-Z]/.test(key)) return `Key${key.toUpperCase()}`;
  return key;
}

const FAMILY_KEYS: Readonly<Record<string, AdaptationFamily>> = {
  Digit1: 'brood',
  Digit2: 'scavenging',
  Digit3: 'shadow',
};

export interface Input {
  /** Camera-relative movement vector for this tick, already normalised. */
  movement(): { readonly x: number; readonly z: number };
  sprinting(): boolean;
  /** Drain queued discrete actions. */
  take(): readonly Action[];
  /** Release every held key — used when focus is lost, so the scout does not walk into a wall. */
  releaseAll(): void;
  dispose(): void;
}

export function createInput(): Input {
  const held = new Set<string>();
  const queue: Action[] = [];

  const onKeyDown = (event: KeyboardEvent): void => {
    const code = resolveCode(event);
    // Both are recorded: `code` is what the game reads, and the jamo mapping means a Hangul-mode
    // press and an English-mode press of the same physical key land on the same token.
    const jamo = HANGUL_TO_CODE[event.key ?? ''];
    if (event.repeat) {
      held.add(code);
      if (jamo) held.add(jamo);
      return;
    }
    held.add(code);
    if (jamo) held.add(jamo);

    switch (jamo ?? code) {
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
      case 'KeyQ':
        queue.push({ kind: 'recall' });
        break;
      case 'KeyF':
        queue.push({ kind: 'trail' });
        break;
      case 'KeyG':
        queue.push({ kind: 'eraseNearest' });
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        // Held, not queued — movement is polled. This only stops the page scrolling under the game.
        event.preventDefault();
        break;
      default: {
        const family = FAMILY_KEYS[code];
        if (family) queue.push({ kind: 'adapt', family });
        break;
      }
    }
    /*
     * Only the keys that MEAN "I have read it" close the control card.
     *
     * This used to fire on every keydown, unconditionally, and `help.dismiss` invited it — 「아무
     * 키나 눌러 시작」, press any key to begin. So a player who reached for W before finishing the
     * ten lines destroyed them, and `showCurtain('help', …)` has exactly one call site, at boot.
     *
     * Most of the bindings get re-taught: F, Space, E and the number keys all appear on the
     * contextual prompt or the adaptation cards. Three do not — G (erase), H (hold brood) and Shift
     * (sprint) — and neither does the existence of Esc and R. Those were gone for the session.
     */
    if (code === 'Space' || code === 'Enter' || code === 'Escape') {
      queue.push({ kind: 'dismiss' });
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(resolveCode(event));
    const jamo = HANGUL_TO_CODE[event.key ?? ''];
    if (jamo) held.delete(jamo);
    /*
     * A Hangul keyup can arrive with a different `key` than its keydown — the IME may have composed
     * a syllable in between, so the jamo that went down is not the character that comes up. Left
     * unhandled that pins a direction on forever, which is worse than the key not working at all.
     */
    if (!event.code && !jamo) held.clear();
  };

  /** Focus loss must drop every held key, or the scout keeps walking while the tab is away. */
  const onBlur = (): void => {
    held.clear();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    movement() {
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
    releaseAll() {
      held.clear();
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      held.clear();
      queue.length = 0;
    },
  };
}

/** True when the run is in a state where world input should be ignored. */
export function inputBlocked(run: Run, paused: boolean, curtain: string | null): boolean {
  return paused || run.status !== 'playing' || curtain === 'help';
}

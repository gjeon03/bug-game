import { ko } from './ko';

/**
 * The development control locale.
 *
 * This is deliberately **not** an English translation. It is a key echo: every key resolves to its
 * own name.
 *
 * The reason is the defect this project has already shipped twice. A parallel English catalog makes
 * two failures possible and both have happened here: a component builds a string in code while a
 * correct Korean key sits unused (`src/render/renderer.ts:1707`, `2 tiles` reaching production),
 * and a slot silently falls back to English when a Korean key is missing. A key echo makes both
 * visible instead: switch to `en` and every slot shows the key that fills it, so a hardcoded string
 * is the one thing on screen that does not change.
 *
 * Nothing selects this locale by default and nothing ships it to a player. `ko` is the game.
 */
export const en: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.keys(ko).map((key) => [key, key])),
);

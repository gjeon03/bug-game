import { en } from './en.ts';
import { ko, type KoKey } from './ko.ts';

/**
 * The one place player-facing text comes from.
 *
 * `ko-KR` is the shipped locale, not a translation layered over an English original — the English
 * catalog exists only so a developer can diff wording, and is never selected at runtime by default.
 *
 * Lookups are total: `t()` always returns a string. A missing key must never blank a HUD slot or
 * throw mid-frame, so it degrades to the key itself and is recorded for the test that fails the
 * build over it. Silent English fallback is deliberately NOT the behaviour — falling back to
 * English would ship exactly the defect this catalog exists to remove, and would do it invisibly.
 */

export type LocaleId = 'ko' | 'en';

const CATALOGS: Record<LocaleId, Readonly<Record<string, string>>> = { ko, en };

/** Korean is the default and the shipped experience. */
let current: LocaleId = 'ko';

/**
 * Keys requested but absent from the active catalog.
 *
 * Exposed so a unit test can assert it is empty after exercising every screen, which is the only
 * way a missing string gets caught before a player sees a raw key in the middle of a run.
 */
export const MISSING_KEYS = new Set<string>();

export function setLocale(locale: LocaleId): void {
  current = locale;
}

export function getLocale(): LocaleId {
  return current;
}

/** The BCP 47 tag for `<html lang>` and `Intl` formatting. */
export function localeTag(): string {
  return current === 'ko' ? 'ko-KR' : 'en';
}

/**
 * Does this value end in a consonant (받침)?
 *
 * Korean object and subject particles are chosen by the final sound of the preceding word, and for
 * a NUMBER that means the sound it is *read* as, not the digit. 24 is read 이십사 and takes 가;
 * 18 is read 십팔 and takes 이. Interpolating a number and then hardcoding one particle therefore
 * gets it wrong for roughly half of all reachable values — which is exactly what the catalog was
 * doing across a dozen keys before this existed.
 *
 * Sino-Korean digit readings: 영 일 이 삼 사 오 육 칠 팔 구. Of those, 이 사 오 구 end in a vowel.
 * Any number ending in 0 is read 십/백/천/만 (or 영), all of which end in a consonant.
 */
function endsWithConsonant(value: string | number): boolean {
  if (typeof value === 'number' || /^-?\d+$/.test(value)) {
    const digit = Math.abs(Math.trunc(Number(value))) % 10;
    return ![2, 4, 5, 9].includes(digit);
  }
  const last = value.trim().slice(-1);
  const code = last.charCodeAt(0);
  // Hangul syllables: the final consonant index is the remainder mod 28; 0 means no 받침.
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // A Latin tail is read aloud in Korean; the common ones in this game end in a consonant sound.
  return /[a-zA-Z]/.test(last);
}

/**
 * `{name}` interpolates a value. `{name?이/가}` interpolates the PARTICLE that value requires,
 * picking the first form after a consonant and the second after a vowel.
 */
const PLACEHOLDER = /\{(\w+)(?:\?([^/}]+)\/([^}]+))?\}/g;

/**
 * Look up `key` and substitute `{name}` placeholders.
 *
 * Values are stringified with the active locale so numbers group the way a Korean player expects.
 */
export function t(key: KoKey | string, params?: Readonly<Record<string, string | number>>): string {
  const template = CATALOGS[current][key];
  if (template === undefined) {
    MISSING_KEYS.add(key);
    return key;
  }
  if (!params) return template;
  return template.replace(
    PLACEHOLDER,
    (whole, name: string, afterConsonant?: string, afterVowel?: string) => {
      const value = params[name];
      if (value === undefined) return whole;
      if (afterConsonant !== undefined && afterVowel !== undefined) {
        return endsWithConsonant(value) ? afterConsonant : afterVowel;
      }
      return typeof value === 'number' ? value.toLocaleString(localeTag()) : String(value);
    },
  );
}

/**
 * True when the catalog has a key. Used where a slot is genuinely optional — for example a hint
 * that only some blockers define — so absence is not reported as a missing translation.
 */
export function has(key: string): boolean {
  return CATALOGS[current][key] !== undefined;
}

/**
 * Pick the `.short` variant when the caller knows its slot is tight.
 *
 * The localization spec measured two hard overflows at 1280x720 and authored shorter strings for
 * them. A `.short` key is a different sentence chosen to fit, never a synonym, so the decision to
 * use one belongs to the layout that has the width — not to the catalog.
 */
export function tFit(
  key: string,
  compact: boolean,
  params?: Readonly<Record<string, string | number>>,
): string {
  const short = `${key}.short`;
  return compact && has(short) ? t(short, params) : t(key, params);
}

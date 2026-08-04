import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en.ts';
import { ko } from '../../src/i18n/ko.ts';
import { MISSING_KEYS, getLocale, t } from '../../src/i18n/index.ts';
import { INTENTIONALLY_PROCEDURAL, SPRITE_FOR_KIND } from '../../src/render/props.ts';
import { PROPS } from '../../src/sim/kitchen.ts';

describe('the shipped locale is Korean', () => {
  it('defaults to ko without anyone selecting it', () => {
    expect(getLocale()).toBe('ko');
  });

  it('has the same keys in both catalogs, so no screen can silently lose a string', () => {
    const koKeys = Object.keys(ko).sort();
    const enKeys = Object.keys(en).sort();
    expect(koKeys.length).toBeGreaterThan(300);
    expect(enKeys).toEqual(koKeys);
  });

  it('has no English left in a Korean value', () => {
    // Latin is allowed only where it is a key cap the player physically presses (WASD, SHIFT) or a
    // placeholder token. Anything else is untranslated text that would ship.
    const offenders = Object.entries(ko).filter(([, value]) => {
      // Markup and placeholders are structure, not copy — a `<strong>` tag is never read aloud.
      const copyOnly = value.replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '');
      const words = copyOnly.match(/[A-Za-z]{3,}/g) ?? [];
      return words.some((w) => !/^(WASD|SHIFT|SPACE|ESC|LMB|RMB)$/i.test(w));
    });
    expect(offenders.map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });

  it('records a lookup for a key that does not exist instead of falling back to English', () => {
    const before = MISSING_KEYS.size;
    // Falling back to English would ship the exact defect the catalog exists to remove, invisibly.
    expect(t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
    expect(MISSING_KEYS.size).toBe(before + 1);
  });
});

describe('interpolation', () => {
  it('substitutes named placeholders', () => {
    expect(t('unit.food', { amount: 12 })).toContain('12');
  });

  it('leaves an unfilled placeholder visible rather than printing undefined', () => {
    expect(t('unit.food', {})).toContain('{amount}');
  });
});

describe('Korean particles follow the sound of the value, not the digit', () => {
  /**
   * The rule this guards: a particle after a number is chosen by how the number is READ.
   * 24 is 이십사 and takes 가; 18 is 십팔 and takes 이. Hardcoding one particle after a
   * placeholder — which the catalog originally did — is wrong for roughly half of all values.
   */
  const cases: Array<[number, string]> = [
    [0, '이'], // 영
    [1, '이'], // 일
    [2, '가'], // 이
    [3, '이'], // 삼
    [4, '가'], // 사
    [5, '가'], // 오
    [6, '이'], // 육
    [7, '이'], // 칠
    [8, '이'], // 팔
    [9, '가'], // 구
    [10, '이'], // 십
    [18, '이'], // 십팔
    [22, '가'], // 이십이
    [24, '가'], // 이십사
    [30, '이'], // 삼십
    [100, '이'], // 백
  ];

  for (const [amount, particle] of cases) {
    it(`${amount} takes ${particle}`, () => {
      expect(t('objective.saving.food', { amount })).toContain(`${amount}${particle}`);
    });
  }

  it('picks the particle from a Korean word by its final consonant', () => {
    // 설거지 ends in a vowel and takes 가; 야식 ends in a consonant and takes 이. Getting this
    // wrong produced '설거지이', which is the kind of error a Korean player reads as machine output.
    expect(t('objective.routine.harvesting', { title: '설거지', seconds: 30 })).toContain(
      '설거지가',
    );
    expect(t('objective.routine.harvesting', { title: '야식', seconds: 30 })).toContain('야식이');
  });
});

describe('every prop kind is accounted for', () => {
  /**
   * The asset manifest claims a set of kinds are baked and a set are deliberately procedural. That
   * claim rotted twice during the reboot — first when props were baked but not wired, then when the
   * manifest still listed kinds that had since been baked. This turns the claim into an invariant:
   * add a `PropKind` and forget to classify it, and this fails.
   */
  it('is either baked or explicitly listed as intentionally procedural', () => {
    const kinds = new Set(PROPS.map((p) => p.kind));
    const unclassified = [...kinds].filter(
      (k) => !SPRITE_FOR_KIND[k] && !INTENTIONALLY_PROCEDURAL.includes(k),
    );
    expect(unclassified).toEqual([]);
  });

  it('does not claim a kind is procedural while also baking it', () => {
    const both = INTENTIONALLY_PROCEDURAL.filter((k) => SPRITE_FOR_KIND[k]);
    expect(both).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Source-literal scan for player-facing English.
 *
 * ## Why this exists
 *
 * A real browser found `2 tiles` in a hover tooltip on the deployed build. Seventeen headless gates
 * had passed it. The blind spot was four layers deep, and every layer is structural rather than
 * careless:
 *
 * 1. `i18n.test.ts` scans `Object.entries(ko)` — a closed set. A literal that never entered the
 *    catalog is not in that set and cannot fail the test.
 * 2. The deployed-build test reads `document.getElementById('hud').innerText`. The offending string
 *    was painted with `ctx.fillText` onto a `<canvas>`, and a canvas contains **no text nodes at
 *    all**. Widening the scan to `document.body` would still return nothing.
 * 3. `MISSING_KEYS` is populated inside `t()`. The offending module did not import `t`. Non-use of
 *    the i18n API is invisible to any instrumentation of the i18n API — this is the deepest layer.
 * 4. No assertion ever drove the code path that would have drawn it.
 *
 * Every one of those observes the localization *pathway*. This test observes the *source*, which is
 * the only layer that can catch a string that bypasses the pathway entirely.
 *
 * ## Why it targets sinks rather than every literal
 *
 * A naive "flag any literal with Latin words" scan drowns in font stacks, CSS values, DOM event
 * names, key codes and module paths, and a test that cries wolf gets suppressed. So it checks the
 * places where text actually reaches a player's eye: DOM text assignment, canvas text painting, and
 * accessible names. That is precisely the class the shipped defect belonged to.
 *
 * A future 3D label — a `CanvasTexture`, an `SDFText`, a `CSS2DRenderer` overlay — repeats the same
 * blind spot unless it is added to `TEXT_SINKS` below.
 */

const SRC = join(process.cwd(), 'src');

/** Where player-visible text is actually emitted. Add every new text surface here. */
const TEXT_SINKS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'textContent', pattern: /\.textContent\s*=\s*([`'"])((?:\\.|(?!\1).)*)\1/g },
  { name: 'innerText', pattern: /\.innerText\s*=\s*([`'"])((?:\\.|(?!\1).)*)\1/g },
  { name: 'innerHTML', pattern: /\.innerHTML\s*=\s*([`'"])((?:\\.|(?!\1).)*)\1/g },
  { name: 'fillText', pattern: /\.fillText\(\s*([`'"])((?:\\.|(?!\1).)*)\1/g },
  { name: 'strokeText', pattern: /\.strokeText\(\s*([`'"])((?:\\.|(?!\1).)*)\1/g },
  { name: 'aria-label', pattern: /aria-label\s*=\s*["']([^"']*)["']/g },
];

/**
 * Latin allowed inside player-facing copy.
 *
 * Only things a Korean player reads as a symbol rather than as a word: key caps they physically
 * press, and the mouse buttons.
 */
const ALLOWED_WORDS = /^(WASD|SHIFT|SPACE|ESC|ENTER|CTRL|ALT|TAB|LMB|RMB|FPS|UI|HUD)$/i;

/**
 * Files exempt by path, each with a stated reason.
 *
 * `en.ts` is the development control catalog and is English on purpose. `index.ts` is the
 * interpolation engine. `proof/` is a rendering proof page rather than the game; its copy moves into
 * the catalog when it becomes the game, and it is listed here rather than pretending the strings are
 * not in it.
 */
const EXEMPT = [/^i18n[/\\]en\.ts$/, /^i18n[/\\]index\.ts$/, /^proof[/\\]/];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Strip the parts of a literal that are structure rather than copy. */
function copyOnly(literal: string): string {
  return literal
    .replace(/\$\{[^}]*\}/g, ' ') // template interpolations
    .replace(/<[^>]+>/g, ' ') // markup
    .replace(/\{[^}]*\}/g, ' '); // catalog placeholders
}

function englishWordsIn(literal: string): string[] {
  const words = copyOnly(literal).match(/[A-Za-z]{3,}/g) ?? [];
  return words.filter((w) => !ALLOWED_WORDS.test(w));
}

interface Offence {
  readonly file: string;
  readonly line: number;
  readonly sink: string;
  readonly literal: string;
  readonly words: string[];
}

function scanSource(source: string, file: string): Offence[] {
  const offences: Offence[] = [];
  for (const sink of TEXT_SINKS) {
    // Each RegExp is module-level and stateful; reset before reuse.
    sink.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = sink.pattern.exec(source)) !== null) {
      const literal = match[2] ?? match[1] ?? '';
      const words = englishWordsIn(literal);
      if (words.length === 0) continue;
      offences.push({
        file,
        line: source.slice(0, match.index).split('\n').length,
        sink: sink.name,
        literal,
        words,
      });
    }
  }
  return offences;
}

function scan(): Offence[] {
  const offences: Offence[] = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file);
    if (EXEMPT.some((rx) => rx.test(rel))) continue;
    offences.push(...scanSource(readFileSync(file, 'utf8'), rel));
  }
  return offences;
}

describe('player-facing English', () => {
  it('never reaches a text surface as a source literal', () => {
    const offences = scan();
    const report = offences.map(
      (o) => `${o.file}:${o.line} via ${o.sink} — "${o.literal}" (${o.words.join(', ')})`,
    );
    expect(report).toEqual([]);
  });

  it('scans a non-trivial number of files, so a broken walk cannot pass silently', () => {
    // A scan that finds nothing because it looked nowhere is the failure mode this guards against.
    expect(walk(SRC).length).toBeGreaterThan(20);
  });

  /*
   * A scan that finds nothing because its patterns never match is indistinguishable from a clean
   * codebase, and that is exactly the failure this whole file exists to prevent happening again.
   * The synthetic sample below MUST be caught; if it is not, the green result above means nothing.
   */
  it('catches the exact defect that shipped, through the real sink patterns', () => {
    const sample = [
      'ctx.fillText(`${guide.label} · ${tiles} tile${n === 1 ? "" : "s"}`, lx, ly);',
      "el.textContent = 'Colony collapsed';",
      "el.textContent = '군체가 무너졌다';",
      "el.textContent = 'WASD로 움직여라';",
    ].join('\n');

    const found = scanSource(sample, 'synthetic.ts');
    const words = found.flatMap((o) => o.words);

    // English plural morphology on a Korean-only build is the tell — Korean has no plural agreement.
    expect(words).toContain('tile');
    expect(words).toContain('Colony');
    // Korean copy and bare key caps are not offences.
    expect(found).toHaveLength(2);
  });

  it('does not flag key caps a player physically presses', () => {
    expect(englishWordsIn('WASD로 움직여라')).toEqual([]);
    expect(englishWordsIn('SHIFT를 눌러 질주')).toEqual([]);
  });
});

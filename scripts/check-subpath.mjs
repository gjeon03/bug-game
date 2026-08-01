/**
 * Fails if the production build contains any root-absolute reference.
 *
 * A GitHub Pages project site is served from `/<repo>/`, so anything resolving from `/` 404s. The
 * build is path-agnostic by construction (`base: './'`), and this asserts it stays that way across
 * *every* emitted file — HTML, CSS and JS — not just the entry document.
 *
 *   node scripts/check-subpath.mjs [dir]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = process.argv[2] ?? 'dist';
if (!existsSync(root)) {
  console.error(`[check-subpath] ${root} does not exist. Run the build first.`);
  process.exit(1);
}

const PATTERNS = [
  { what: 'absolute src/href in markup', re: /(?:src|href)\s*=\s*["']\/(?!\/)/g, ext: ['.html'] },
  { what: 'absolute url() in CSS', re: /url\(\s*["']?\/(?!\/)/g, ext: ['.css'] },
  { what: 'absolute @import in CSS', re: /@import\s+["']\/(?!\/)/g, ext: ['.css'] },
  {
    what: 'absolute fetch/import path in JS',
    re: /(?:fetch|import)\(\s*["']\/(?!\/)/g,
    ext: ['.js'],
  },
  { what: 'absolute new URL base in JS', re: /new\s+URL\(\s*["']\/(?!\/)/g, ext: ['.js'] },
];

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(root);

let failures = 0;
for (const file of files) {
  const ext = extname(file);
  const applicable = PATTERNS.filter((p) => p.ext.includes(ext));
  if (applicable.length === 0) continue;
  const text = readFileSync(file, 'utf8');
  for (const { what, re } of applicable) {
    const hits = text.match(re);
    if (hits) {
      failures += hits.length;
      console.error(
        `::error::${file}: ${hits.length}× ${what} — would 404 under a repository subpath`,
      );
    }
  }
}

if (!existsSync(join(root, '.nojekyll'))) {
  failures++;
  console.error('::error::dist/.nojekyll missing — GitHub Pages would run Jekyll over the build');
}

if (failures > 0) process.exit(1);
console.log(`[check-subpath] ${files.length} file(s) checked; build is subpath-safe.`);

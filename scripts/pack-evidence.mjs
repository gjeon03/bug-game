/**
 * Shrinks captured screenshots in place so the evidence package stays reviewable without committing
 * megabytes of raw 1600×900 captures. Detail relevant to review (HUD text, sprite silhouettes,
 * threat decals) survives a 1280-wide 256-colour PNG; the file gets ~6× smaller.
 *
 *   node scripts/pack-evidence.mjs [dir]
 *
 * Requires ImageMagick (`magick`). If it is not installed the script reports and exits 0, so the
 * verification pipeline is never blocked by an optional tool.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'artifacts/evidence/shots';
if (!existsSync(dir)) {
  console.log(`[pack-evidence] ${dir} does not exist; nothing to do.`);
  process.exit(0);
}

try {
  execFileSync('magick', ['-version'], { stdio: 'ignore' });
} catch {
  console.log('[pack-evidence] ImageMagick not found; leaving captures at full size.');
  process.exit(0);
}

let before = 0;
let after = 0;
let count = 0;

for (const name of readdirSync(dir)) {
  if (!name.endsWith('.png')) continue;
  const path = join(dir, name);
  const sizeBefore = statSync(path).size;
  // Already packed? A packed capture is well under 400 kB.
  if (sizeBefore < 400_000) {
    before += sizeBefore;
    after += sizeBefore;
    continue;
  }
  execFileSync('magick', [
    path,
    '-resize',
    '1280x',
    '-colors',
    '256',
    '-depth',
    '8',
    '-strip',
    '-define',
    'png:compression-level=9',
    path,
  ]);
  before += sizeBefore;
  after += statSync(path).size;
  count++;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`[pack-evidence] packed ${count} capture(s): ${mb(before)} → ${mb(after)}`);

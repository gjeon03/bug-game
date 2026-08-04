import atlasData from '../art/atlas.json';
import sheetUrl from '../art/props.png';

/**
 * The baked sprite sheet.
 *
 * Every world object the player sees comes from here rather than from runtime drawing commands.
 * The art is rendered offline by `tools/bake/` — real 3D geometry, real materials, real shadows,
 * 16x supersampled — because a plate drawn as two arcs at 60 fps will always look like two arcs.
 *
 * Both the sheet and the atlas are imported as modules on purpose. Vite fingerprints them and
 * rewrites the URL relative to the document, which is what keeps the build working under the
 * `/bug-game/` repository subpath; anything served out of `public/` would emit an absolute path
 * and 404 there.
 */

export interface Frame {
  /** Position and size within the sheet, in sheet pixels. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /**
   * Where the object's ground origin sits inside its frame, in frame pixels from the top-left.
   *
   * This is the whole reason a 3D-baked sprite can stand correctly on a 2D floor. The prop was
   * rendered from a camera tilted 26° off vertical, so its visual centre is NOT where it touches
   * the ground — a tall bottle's pixels extend far above its footprint. Drawing by anchor puts the
   * contact point at the world position and lets depth sorting use that same point.
   */
  readonly anchorX: number;
  readonly anchorY: number;
}

interface AtlasFile {
  readonly ppu: number;
  readonly sheet: { readonly file: string; readonly w: number; readonly h: number };
  readonly frames: Readonly<Record<string, Frame>>;
}

const atlas = atlasData as AtlasFile;

/** Pixels baked per world unit. Dividing by this converts frame pixels back to world units. */
export const SPRITE_PPU = atlas.ppu;

let sheet: HTMLImageElement | null = null;

/**
 * Per-frame cutouts, keyed by sprite name.
 *
 * Anything drawn with a rotation cannot be pre-composed into the world — the angle changes every
 * frame — so it must read from a source every frame. Reading a small sub-rectangle out of the full
 * 2040x2128 sheet is the last remaining per-frame read, and the sheet more than doubled in height
 * when the full prop set landed.
 *
 * Isolated by controlled comparison rather than guesswork: rebuilding `src/` at the pre-batch
 * commit and re-running the same spec measured `active-play` frame-callback CPU p99 at 2.0 ms
 * against 32.3 ms with the batch — a 16x regression that three separate hypotheses had failed to
 * shift. Cutting each frame into its own small canvas once keeps the rotation while shrinking the
 * blit source from four megapixels to a few thousand.
 */
const cutouts = new Map<string, HTMLCanvasElement>();

function cutout(name: string, f: Frame): HTMLCanvasElement | null {
  const hit = cutouts.get(name);
  if (hit) return hit;
  if (!sheet) return null;
  const c = document.createElement('canvas');
  c.width = f.w;
  c.height = f.h;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(sheet, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  cutouts.set(name, c);
  return c;
}

/**
 * Decode the sheet once, before the first frame.
 *
 * Resolves rather than rejects on failure: a missing sheet must degrade to "no props drawn", not to
 * a boot that never completes. The caller reports it through the normal error channel and the asset
 * audit catches it, which is a far better failure than a black screen.
 */
export function loadSprites(): Promise<boolean> {
  if (sheet) return Promise.resolve(true);
  // No DOM, no sheet. The unit suite runs in Node and imports this module transitively (a test
  // asserting every PropKind is classified pulls in props.ts, which pulls in this file), so an
  // unguarded `new Image()` at import time threw inside Vitest. It reported `Errors 1 error`
  // alongside "159 passed" and exited non-zero — a failure that is easy to read as transient and
  // is not. The simulation must stay runnable headless; that is the whole reason it is DOM-free.
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      sheet = img;
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = sheetUrl;
  });
}

/**
 * Start decoding as soon as this module is imported.
 *
 * The sheet is on the critical path for how the game looks, so the fetch should not wait for the
 * boot sequence to get around to it. `spritesReady()` gates drawing, and the renderer falls back to
 * procedural bodies until this resolves, so an early frame is never blocked on it — it just gains
 * detail the moment the decode lands. Awaiting `spriteLoad` additionally lets boot hold the first
 * frame until the art is real, which is what keeps a screenshot honest.
 */
export const spriteLoad: Promise<boolean> = loadSprites();

/**
 * Build every rotated-draw cutout up front.
 *
 * `cutout()` is a cache, and a cache that fills lazily fills during rendering. Peak load is exactly
 * when new body types first appear — nymphs hatch, corpses land, worker variants spawn — so several
 * first-draws collide in one frame. CI measured a 42.8 ms worst frame-callback against a 19.0 ms
 * host-scaled budget while the sustained percentiles were fine, which is the signature of an
 * allocation spike rather than a per-frame cost.
 *
 * This is the third one-off cost this renderer has paid on a rendered frame instead of at load.
 * Same fix each time: do it during boot.
 */
export function warmCutouts(): void {
  if (!sheet) return;
  for (const [name, f] of Object.entries(atlas.frames)) cutout(name, f);
}

export function spritesReady(): boolean {
  return sheet !== null;
}

export function frame(name: string): Frame | undefined {
  return atlas.frames[name];
}

export function frameNames(): readonly string[] {
  return Object.keys(atlas.frames);
}

/**
 * Draw a baked sprite so its ground anchor lands on world position (x, y).
 *
 * `scale` is in world units per baked pixel and defaults to the bake's own resolution, so a sprite
 * drawn with the default occupies exactly the real size it was modelled at. `rotation` spins the
 * sprite about its anchor — correct for small bodies like roaches, and deliberately not used for
 * large props, whose baked perspective only holds at the angle they were rendered from.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  opts: { scale?: number; rotation?: number; alpha?: number } = {},
): boolean {
  const f = atlas.frames[name];
  if (!f || !sheet) return false;

  const scale = (opts.scale ?? 1) / SPRITE_PPU;
  const alpha = opts.alpha ?? 1;
  const rotation = opts.rotation ?? 0;
  if (alpha <= 0.004) return false;

  const prevAlpha = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = prevAlpha * alpha;

  if (rotation === 0) {
    // Fast path: no transform push for the overwhelming majority of static props.
    ctx.drawImage(
      sheet,
      f.x,
      f.y,
      f.w,
      f.h,
      x - f.anchorX * scale,
      y - f.anchorY * scale,
      f.w * scale,
      f.h * scale,
    );
  } else {
    // Rotated draws happen every frame and cannot be pre-composed, so they read from a small
    // per-frame cutout rather than from the full sheet. See `cutouts`.
    const src = cutout(name, f);
    if (!src) return false;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.drawImage(
      src,
      0,
      0,
      f.w,
      f.h,
      -f.anchorX * scale,
      -f.anchorY * scale,
      f.w * scale,
      f.h * scale,
    );
    ctx.restore();
  }

  if (alpha !== 1) ctx.globalAlpha = prevAlpha;
  return true;
}

/** Sheet dimensions, for the asset audit and telemetry. */
export function sheetInfo(): { w: number; h: number; frames: number } {
  return { w: atlas.sheet.w, h: atlas.sheet.h, frames: Object.keys(atlas.frames).length };
}

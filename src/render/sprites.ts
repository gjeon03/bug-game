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
 * Decode the sheet once, before the first frame.
 *
 * Resolves rather than rejects on failure: a missing sheet must degrade to "no props drawn", not to
 * a boot that never completes. The caller reports it through the normal error channel and the asset
 * audit catches it, which is a far better failure than a black screen.
 */
export function loadSprites(): Promise<boolean> {
  if (sheet) return Promise.resolve(true);
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
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.drawImage(
      sheet,
      f.x,
      f.y,
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

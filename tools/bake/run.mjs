import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Offline asset bake.
 *
 * Renders every parametric prop through the one shared camera and light rig in headless Chromium
 * and writes one packed sprite sheet plus an atlas index to `src/art/`.
 *
 * Why offline rather than at runtime: 16x supersampling, soft shadow maps, physical transmission
 * and a full PBR light rig cost nothing at build time and are unaffordable per frame. Chromium's
 * WebGL runs on SwiftShader here, which is software rasterisation — slower, but deterministic, so
 * the same commit always produces comparable art and screenshots stay valid evidence.
 *
 * three.js is a devDependency used only by this tool. It never enters the runtime bundle.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/**
 * Output lives in src/, not public/.
 *
 * Vite copies public/ verbatim and leaves references to it untouched, which 404s under the
 * /bug-game/ repository subpath. Emitting into src/ means the sheet is imported like any other
 * module asset: Vite fingerprints it, rewrites the URL relatively, and check-subpath.mjs stays
 * green. Same reasoning as the vendored fonts.
 */
const OUT_DIR = path.join(ROOT, 'src', 'art');
const ORIGIN = 'https://bake.local';

/** Pixels baked per world unit; mirrors tools/bake/lib/units.mjs and the runtime ATLAS_SCALE. */
const BAKE_PPU = 2.0;

/**
 * Sheet width cap.
 *
 * The reference machine reports MAX_TEXTURE_SIZE 8192, but 2048 keeps the sheet inside the limits
 * of every desktop GPU worth supporting and keeps decode time down — a 4096-wide RGBA sheet is
 * 64 MB uncompressed in memory regardless of how well the PNG compresses.
 */
const SHEET_MAX_W = 2048;

/** Prop families to bake, in atlas order. */
const FAMILIES = [
  { module: '/tools/bake/props/sink.mjs', registry: 'SINK_PROPS' },
  { module: '/tools/bake/props/roach.mjs', registry: 'ROACH_PROPS' },
];

const PAGE_HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<script type="importmap">
{"imports":{"three":"${ORIGIN}/vendor/three.module.js"}}
</script></head>
<body><script type="module">
import * as THREE from 'three';
import { renderProp } from '${ORIGIN}/tools/bake/lib/rig.mjs';
${FAMILIES.map((f, i) => `import { ${f.registry} as R${i} } from '${ORIGIN}${f.module}';`).join('\n')}

const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: true, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const REGISTRY = Object.assign({}, ${FAMILIES.map((_, i) => `R${i}`).join(', ')});
const BAKED = new Map();
window.__names = () => Object.keys(REGISTRY);
window.__bake = (name) => {
  const spec = REGISTRY[name];
  const info = renderProp(renderer, spec.build(), spec);
  // Resolve the supersampled framebuffer down to shipping resolution. This downsample IS the
  // antialiasing: 16 rendered samples collapse into every output pixel.
  const out = document.createElement('canvas');
  out.width = info.w;
  out.height = info.h;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, info.w * info.ssaa, info.h * info.ssaa, 0, 0, info.w, info.h);
  BAKED.set(name, { canvas: out, info });
  return { w: info.w, h: info.h, anchorX: info.anchorX, anchorY: info.anchorY };
};

/**
 * Pack every baked sprite into one sheet.
 *
 * The runtime must not make one HTTP request and hold one Image per prop: the frame-time gate was
 * already failing before any of this art existed, and a hundred separate textures is exactly how a
 * 2D renderer loses its budget to state changes. One sheet is one decode and one draw source.
 *
 * Shelf packing, tallest-first. Sprites are padded by 2 px because the renderer scales them and a
 * bilinear tap at a sprite's edge would otherwise pull in its neighbour's pixels.
 */
window.__pack = (maxW) => {
  const PAD = 2;
  const items = [...BAKED.entries()].sort((a, b) => b[1].info.h - a[1].info.h);
  const frames = {};
  let x = 0, y = 0, shelfH = 0, sheetW = 0;
  for (const [name, { info }] of items) {
    const w = info.w + PAD * 2, h = info.h + PAD * 2;
    if (x + w > maxW) { x = 0; y += shelfH; shelfH = 0; }
    frames[name] = { x: x + PAD, y: y + PAD, w: info.w, h: info.h,
                     anchorX: info.anchorX, anchorY: info.anchorY };
    x += w;
    if (w + (x - w) > sheetW) sheetW = Math.min(maxW, Math.max(sheetW, x));
    if (h > shelfH) shelfH = h;
  }
  const sheetH = y + shelfH;
  const sheet = document.createElement('canvas');
  sheet.width = sheetW;
  sheet.height = sheetH;
  const sctx = sheet.getContext('2d');
  for (const [name, { canvas: c }] of BAKED) {
    const f = frames[name];
    sctx.drawImage(c, f.x, f.y);
  }
  return { w: sheetW, h: sheetH, frames, png: sheet.toDataURL('image/png') };
};
window.__ready = true;
</script></body></html>`;

const MIME = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.json': 'application/json',
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // Serve the repository and the three.js ESM build from a synthetic origin. Nothing is fetched
  // from the network, so a bake is reproducible offline.
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/index.html') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE_HTML });
    }
    // `three.module.js` re-exports from sibling chunks (`three.core.js`), so the whole build
    // directory has to be reachable, not just the entry point.
    const rel = url.pathname.startsWith('/vendor/')
      ? `node_modules/three/build/${url.pathname.slice('/vendor/'.length)}`
      : url.pathname.replace(/^\//, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      return route.fulfill({ status: 404, body: `not found: ${rel}` });
    }
    return route.fulfill({
      status: 200,
      contentType: MIME[path.extname(file)] ?? 'application/octet-stream',
      body: fs.readFileSync(file),
    });
  });

  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });

  const names = await page.evaluate(() => window.__names());

  for (const name of names) {
    const t0 = Date.now();
    const r = await page.evaluate((n) => window.__bake(n), name);
    console.log(
      `  ${name.padEnd(20)} ${String(r.w).padStart(4)}x${String(r.h).padEnd(4)} ${Date.now() - t0} ms`,
    );
  }

  const sheet = await page.evaluate((maxW) => window.__pack(maxW), SHEET_MAX_W);
  fs.writeFileSync(
    path.join(OUT_DIR, 'props.png'),
    Buffer.from(sheet.png.replace(/^data:image\/png;base64,/, ''), 'base64'),
  );
  const atlas = {
    ppu: BAKE_PPU,
    generatedBy: 'tools/bake/run.mjs',
    sheet: { file: 'props.png', w: sheet.w, h: sheet.h },
    frames: Object.fromEntries(
      Object.entries(sheet.frames).map(([k, f]) => [
        k,
        {
          ...f,
          anchorX: Math.round(f.anchorX * 100) / 100,
          anchorY: Math.round(f.anchorY * 100) / 100,
        },
      ]),
    ),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'atlas.json'), `${JSON.stringify(atlas, null, 2)}\n`);
  const kb = Math.round(fs.statSync(path.join(OUT_DIR, 'props.png')).size / 1024);
  console.log(`\n  sheet ${sheet.w}x${sheet.h}  ${kb} kB  ${names.length} frames`);

  await browser.close();

  if (errors.length) {
    console.error('\nBake produced page errors:');
    for (const e of errors.slice(0, 20)) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`\nBaked ${names.length} props into src/art/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

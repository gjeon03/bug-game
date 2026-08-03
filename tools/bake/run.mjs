import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Offline asset bake.
 *
 * Renders every parametric prop through the one shared camera and light rig in headless Chromium
 * and writes PNG sprites plus an atlas index to `public/art/`.
 *
 * Why offline rather than at runtime: 16x supersampling, soft shadow maps, physical transmission
 * and a full PBR light rig cost nothing at build time and are unaffordable per frame. Chromium's
 * WebGL runs on SwiftShader here, which is software rasterisation — slower, but deterministic, so
 * the same commit always produces comparable art and screenshots stay valid evidence.
 *
 * three.js is a devDependency used only by this tool. It never enters the runtime bundle.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(ROOT, 'public', 'art');
const ORIGIN = 'https://bake.local';

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
window.__names = () => Object.keys(REGISTRY);
window.__bake = (name, pass) => {
  const spec = REGISTRY[name];
  const info = renderProp(renderer, spec.build(), Object.assign({}, spec, { pass }));
  // Resolve the supersampled framebuffer down to shipping resolution. This downsample IS the
  // antialiasing: 16 rendered samples collapse into every output pixel.
  const out = document.createElement('canvas');
  out.width = info.w;
  out.height = info.h;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, info.w * info.ssaa, info.h * info.ssaa, 0, 0, info.w, info.h);
  return { w: info.w, h: info.h, anchorX: info.anchorX, anchorY: info.anchorY,
           png: out.toDataURL('image/png') };
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
  const atlas = { ppu: 2.0, generatedBy: 'tools/bake/run.mjs', props: {} };

  for (const name of names) {
    const t0 = Date.now();
    const r = await page.evaluate((n) => window.__bake(n), name);
    const file = `${name}.png`;
    fs.writeFileSync(
      path.join(OUT_DIR, file),
      Buffer.from(r.png.replace(/^data:image\/png;base64,/, ''), 'base64'),
    );
    atlas.props[name] = {
      file,
      w: r.w,
      h: r.h,
      anchorX: Math.round(r.anchorX * 100) / 100,
      anchorY: Math.round(r.anchorY * 100) / 100,
    };
    const bytes = fs.statSync(path.join(OUT_DIR, file)).size;
    console.log(
      `  ${name.padEnd(20)} ${String(r.w).padStart(4)}x${String(r.h).padEnd(4)} ` +
        `${String(Math.round(bytes / 1024)).padStart(4)} kB  ${Date.now() - t0} ms`,
    );
  }

  fs.writeFileSync(path.join(OUT_DIR, 'atlas.json'), `${JSON.stringify(atlas, null, 2)}\n`);
  await browser.close();

  if (errors.length) {
    console.error('\nBake produced page errors:');
    for (const e of errors.slice(0, 20)) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`\nBaked ${names.length} props into public/art/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

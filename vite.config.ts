import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// `base: './'` emits relative URLs for every generated script/style/asset reference.
// That is what makes the build work identically from the domain root, from a
// GitHub Pages repository subpath (https://<owner>.github.io/<repo>/), and from
// file-relative static hosting, without baking the repository name into the build.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsDir: 'assets',
    rollupOptions: {
      // Two entry points during the three.js reboot: `index.html` is the Canvas2D game that still
      // works, `proof.html` is the final-quality 3D proof scene that has to be judged before the
      // whole map is rebuilt. This is a temporary state — when the proof passes, the old renderer
      // is deleted and `proof.html` is folded into `index.html`. Two production renderers are
      // never kept side by side.
      input: {
        main: resolve(__dirname, 'index.html'),
        proof: resolve(__dirname, 'proof.html'),
      },
    },
    // The published payload is three files. A 456 kB sourcemap was 76 % of it and is not something a
    // static game site needs to ship; `pnpm dev` keeps full sourcemaps for development.
    sourcemap: false,
    reportCompressedSize: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5273,
  },
  preview: {
    host: '127.0.0.1',
    port: 4273,
  },
});

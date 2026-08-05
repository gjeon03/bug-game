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
      // One entry point. The three.js reboot's proof scene has been folded into the game and the
      // Canvas2D runtime is being replaced — two production renderers are never kept side by side.
      input: { main: resolve(__dirname, 'index.html') },
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

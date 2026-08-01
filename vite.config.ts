import { defineConfig } from 'vite';

// `base: './'` emits relative URLs for every generated script/style/asset reference.
// That is what makes the build work identically from the domain root, from a
// GitHub Pages repository subpath (https://<owner>.github.io/<repo>/), and from
// file-relative static hosting, without baking the repository name into the build.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsDir: 'assets',
    sourcemap: true,
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

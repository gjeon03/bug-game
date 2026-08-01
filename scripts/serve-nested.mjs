/**
 * Serves the production build under a nested path, the way GitHub Pages serves a project site at
 * https://<owner>.github.io/<repo>/.
 *
 * This is the local stand-in that proves the build is path-agnostic: it refuses to serve anything at
 * the domain root, so a single absolute `/assets/...` reference anywhere in the bundle fails loudly
 * instead of passing by accident.
 *
 *   node scripts/serve-nested.mjs [port] [prefix] [dir]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 4178);
const prefix = process.argv[3] ?? '/bug-game/';
const root = resolve(process.argv[4] ?? 'dist');

if (!existsSync(root)) {
  console.error(`[serve-nested] ${root} does not exist. Run \`pnpm build\` first.`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  let path = decodeURIComponent(url.pathname);

  if (!path.startsWith(prefix)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`Not found. This server only exposes ${prefix} (simulating a GitHub Pages subpath).`);
    return;
  }

  path = path.slice(prefix.length - 1);
  if (path === '' || path === '/') path = '/index.html';

  const filePath = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'content-length': body.length,
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[serve-nested] http://127.0.0.1:${port}${prefix} → ${root}`);
});

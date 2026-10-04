/* server.js — static dev server (no dependencies) */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    if (urlPath === '/') urlPath = '/index.html';
    const file = normalize(join(ROOT, urlPath));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    let s;
    try { s = await stat(file); } catch {
      console.log(`404 ${urlPath}`);
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    if (s.isDirectory()) {
      console.log(`404 dir ${urlPath}`);
      res.writeHead(404); res.end('Not found'); return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(data);
  } catch (err) {
    console.error(err);
    res.writeHead(500); res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`فلوسي | FLOUSY running at http://localhost:${PORT}`);
  console.log(`(Open in browser — the app works offline after first visit via PWA)`);
});

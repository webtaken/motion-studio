// Servidor estático mínimo (sin dependencias). Sirve la raíz del estudio para que
// las composiciones carguen /lib, /assets y sus fuentes por HTTP.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/**
 * @param {{port?: number, root?: string, handler?: (req, res, url: URL) => boolean | Promise<boolean>}} opts
 * handler devuelve true si ya respondió (rutas extra del modo dev).
 */
export function startServer({ port = 0, root = ROOT, handler } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (handler && (await handler(req, res, url))) return;
      serveFile(req, res, root, decodeURIComponent(url.pathname));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(err?.stack || err));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address();
      resolve({
        url: `http://127.0.0.1:${p}`,
        port: p,
        server,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function serveFile(req, res, root, pathname) {
  let file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end('Fuera de la raíz');
    return;
  }
  let stat;
  try {
    stat = fs.statSync(file);
    if (stat.isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { location: pathname + '/' }).end();
        return;
      }
      file = path.join(file, 'index.html');
      stat = fs.statSync(file);
    }
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`No existe: ${pathname}`);
    return;
  }

  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);

  if (range) {
    // Range/206: necesario para que <audio> pueda saltar a cualquier segundo.
    let start = range[1] === '' ? stat.size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(stat.size - 1, end);
    if (start > end) {
      res.writeHead(416, { 'content-range': `bytes */${stat.size}` }).end();
      return;
    }
    res.writeHead(206, {
      ...headers,
      'content-range': `bytes ${start}-${end}/${stat.size}`,
      'content-length': end - start + 1,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, 'content-length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

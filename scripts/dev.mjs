// Preview: servidor local con reproductor (scrubber, beats, sfx, formatos) y recarga en vivo.
import fs from 'node:fs';
import path from 'node:path';
import { args, num } from './lib/args.mjs';
import { ROOT, readJSON, exists } from './lib/paths.mjs';
import { startServer } from './lib/server.mjs';

const a = args({ port: { type: 'string', short: 'p' } }, 'npm run dev [-- --port 4321]\n  Abre http://localhost:4321 y elige un video.');

const PLAYER = path.join(ROOT, 'scripts', 'player');
const clients = new Set();

function listVideos() {
  const dir = path.join(ROOT, 'videos');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && exists(path.join(dir, d.name, 'index.html')))
    .map((d) => {
      const cfg = readJSON(path.join(dir, d.name, 'video.json'), {});
      return {
        slug: d.name,
        title: cfg.title ?? d.name,
        duration: cfg.duration,
        fps: cfg.fps,
        bpm: cfg.bpm,
        formats: cfg.formats ?? ['9x16', '1x1', '16x9'],
        template: d.name.startsWith('_'),
        hasMix: exists(path.join(ROOT, 'out', d.name, 'mix.wav')),
      };
    })
    .sort((x, y) => Number(x.template) - Number(y.template) || x.slug.localeCompare(y.slug));
}

function sendFile(res, file, type) {
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

async function handler(req, res, url) {
  const p = url.pathname;
  if (p === '/' || p === '/index.html') return sendFile(res, path.join(PLAYER, 'index.html'), 'text/html; charset=utf-8'), true;
  if (p === '/__player' || p === '/__player/') return sendFile(res, path.join(PLAYER, 'player.html'), 'text/html; charset=utf-8'), true;
  if (p === '/__api/videos') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(listVideos()));
    return true;
  }
  if (p === '/__events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return true;
  }
  return false;
}

// Recarga en vivo: cambios en videos/, lib/ o assets/ (no audio ni out/).
let timer;
let pending = new Set();
for (const d of ['videos', 'lib', 'assets']) {
  const full = path.join(ROOT, d);
  if (!exists(full)) continue;
  fs.watch(full, { recursive: true }, (_ev, file) => {
    if (!file || /(^|[\\/])(audio|\.seg)([\\/]|$)|\.tmp|~$/.test(file)) return;
    pending.add(`${d}/${file}`);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const msg = JSON.stringify({ type: 'reload', files: [...pending] });
      pending = new Set();
      for (const c of clients) c.write(`data: ${msg}\n\n`);
    }, 150);
  });
}

let port = num(a.port, 4321);
let srv;
for (let i = 0; i < 10 && !srv; i++) {
  try {
    srv = await startServer({ port: port + i, handler });
  } catch (err) {
    if (err.code !== 'EADDRINUSE') throw err;
  }
}
if (!srv) throw new Error(`Puertos ${port}–${port + 9} ocupados. Usa --port.`);
console.log(`\n▶ Estudio en http://localhost:${srv.port}\n`);
console.log('  Espacio play/pausa · ←/→ un fotograma · Shift+←/→ un segundo · 1/2/3 formato · S zona segura · M audio');
console.log('  Se recarga solo al guardar. Ctrl+C para salir.\n');

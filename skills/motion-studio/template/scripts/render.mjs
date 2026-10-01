// Render: abre la composición en Chromium sin ventana, pinta cada fotograma con
// seek(t), lo fotografía y lo manda a ffmpeg. Trabaja en segmentos de 2 s para poder
// re-renderizar solo los segundos que cambiaron (--from/--to) y repartir entre workers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { args, num } from './lib/args.mjs';
import { loadVideo, outDir, ensureDir, rel, writeJSON, readJSON, fail, exists } from './lib/paths.mjs';
import { resolveFormats } from './lib/formats.mjs';
import { startServer } from './lib/server.mjs';
import { launch, openComposition, reportIssues } from './lib/browser.mjs';
import { spawnEncoder, concatAndMux, assertVideo } from './lib/ffmpeg.mjs';
import { buildMix } from './audio.mjs';

const USAGE = `npm run render -- <slug> [opciones]
  --format, -f   9x16 | 1x1 | 16x9 | 4x5 | all | lista "9x16,1x1"  (por defecto: el primero de video.json)
  --from, --to   re-renderiza solo esos segundos (y los segmentos que los tocan)
  --scale        0.5 = borrador a mitad de resolución (más rápido)
  --quality      final | draft  (draft: x264 veryfast; automático con --scale < 1)
  --workers, -w  pestañas en paralelo (por defecto ${defaultWorkers()})
  --img          jpeg | png  (png para degradados delicados; más lento)
  --seg          segundos por segmento (por defecto 2)
  --no-audio     sin música ni sfx
  --allow-net    permite pedir recursos de internet (por defecto bloqueado)
  --out          ruta del MP4 final (solo con un formato)`;

function defaultWorkers() {
  return Math.max(1, Math.min(3, os.cpus().length - 1));
}

const a = args(
  {
    format: { type: 'string', short: 'f' },
    from: { type: 'string' },
    to: { type: 'string' },
    scale: { type: 'string' },
    quality: { type: 'string' },
    workers: { type: 'string', short: 'w' },
    img: { type: 'string' },
    seg: { type: 'string' },
    'no-audio': { type: 'boolean' },
    'allow-net': { type: 'boolean' },
    out: { type: 'string' },
  },
  USAGE,
);

const { slug, config } = loadVideo(a._[0]);
let formats;
try {
  formats = resolveFormats(a.format, config);
} catch (err) {
  fail(err.message);
}
if (a.out && formats.length > 1) fail('--out solo funciona con un formato.');

const scale = num(a.scale, 1);
if (!(scale > 0 && scale <= 1)) fail('--scale debe estar entre 0 y 1.');
const quality = a.quality ?? (scale < 1 ? 'draft' : 'final');
const img = a.img === 'png' ? 'png' : 'jpeg';
const segSeconds = num(a.seg, 2);
const workersWanted = Math.max(1, num(a.workers, defaultWorkers()));
const from = a.from !== undefined ? num(a.from) : undefined;
const to = a.to !== undefined ? num(a.to) : undefined;
const partial = from !== undefined || to !== undefined;

const OUT = ensureDir(outDir(slug));
const t0 = Date.now();
const server = await startServer();
let browser;

try {
  browser = await launch();
  let mix = null;
  let metaRef = null;

  for (const fmt of formats) {
    const W = fmt.w;
    const H = fmt.h;
    const probe = await openComposition(browser, server.url, slug, { fmt: fmt.name, w: W, h: H, allowNet: a['allow-net'] });
    const meta = probe.meta;
    const fps = meta.fps;
    const total = Math.round(meta.duration * fps);
    const segFrames = Math.max(1, Math.round(segSeconds * fps));
    const nSeg = Math.ceil(total / segFrames);

    // Los sfx deben ser idénticos en todos los formatos (una sola mezcla de audio).
    if (!metaRef) {
      metaRef = meta;
      writeJSON(path.join(OUT, 'meta.json'), meta);
    } else if (JSON.stringify(meta.sfx) !== JSON.stringify(metaRef.sfx)) {
      console.warn(`! Los sfx de ${fmt.name} no coinciden con ${formats[0].name}: no los hagas depender del formato.`);
    }

    // Segmentos a dibujar.
    const fA = from !== undefined ? Math.max(0, Math.floor(from * fps)) : 0;
    const fB = to !== undefined ? Math.min(total, Math.ceil(to * fps)) : total;
    if (fB <= fA) fail(`Rango vacío: --from ${from} --to ${to} (duración ${meta.duration}s).`);
    const segA = Math.floor(fA / segFrames);
    const segB = Math.floor((fB - 1) / segFrames);
    const todo = [];
    for (let i = segA; i <= segB; i++) todo.push(i);

    // Caché de segmentos: se invalida si cambian fps, duración o tamaño.
    const tag = `${fmt.name}${scale < 1 ? `@${scale}` : ''}-${img}-${quality}`;
    const segDir = ensureDir(path.join(OUT, '.seg', tag));
    const manifestFile = path.join(segDir, 'manifest.json');
    const manifest = { fps, total, segFrames, w: W, h: H, scale };
    const prev = readJSON(manifestFile, null);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(manifest)) {
      fs.rmSync(segDir, { recursive: true, force: true });
      ensureDir(segDir);
      writeJSON(manifestFile, manifest);
    }
    const segFile = (i) => path.join(segDir, `${String(i).padStart(4, '0')}.mp4`);

    const nWorkers = Math.min(workersWanted, todo.length);
    // Hilos fijos por encoder: x264 da bytes distintos con otro número de hilos, y así
    // el MP4 sale idéntico uses 1 o 3 workers.
    const threads = 2;
    const comps = [probe];
    for (let k = 1; k < nWorkers; k++) {
      comps.push(await openComposition(browser, server.url, slug, { fmt: fmt.name, w: W, h: H, allowNet: a['allow-net'] }));
    }

    console.log(
      `\n▶ ${slug} · ${fmt.name} ${Math.round(W * scale)}×${Math.round(H * scale)} · ${fps} fps · ${meta.duration}s · ` +
        `${partial ? `segmentos ${segA}–${segB} de ${nSeg - 1}` : `${total} fotogramas`} · ${nWorkers} worker(s)`,
    );

    const framesTodo = todo.reduce((s, i) => s + Math.min(segFrames, total - i * segFrames), 0);
    let done = 0;
    const tStart = Date.now();
    const progress = () => {
      const pct = done / framesTodo;
      const el = (Date.now() - tStart) / 1000;
      const rate = done / Math.max(el, 0.001);
      const eta = rate > 0 ? Math.round((framesTodo - done) / rate) : 0;
      const bar = '█'.repeat(Math.round(pct * 24)).padEnd(24, '░');
      const line = `  ${bar} ${String(Math.round(pct * 100)).padStart(3)}%  ${done}/${framesTodo}  ${rate.toFixed(1)} fps  ETA ${eta}s`;
      if (process.stdout.isTTY) process.stdout.write(`\r${line}`);
      else if (done === framesTodo || done % (fps * 4) === 0) console.log(line);
    };

    const queue = [...todo];
    await Promise.all(
      comps.map(async (comp) => {
        while (queue.length) {
          const i = queue.shift();
          const first = i * segFrames;
          const last = Math.min(total, first + segFrames);
          const tmp = segFile(i) + '.tmp.mp4';
          const enc = spawnEncoder({ out: tmp, fps, img, quality, threads });
          for (let f = first; f < last; f++) {
            await comp.seek(f / fps);
            await enc.write(await comp.shot({ format: img, scale }));
            done++;
            progress();
          }
          await enc.end();
          fs.renameSync(tmp, segFile(i));
        }
      }),
    );
    if (process.stdout.isTTY) process.stdout.write('\n');

    for (const [k, c] of comps.entries()) await reportIssues(c, k === 0 ? fmt.name : undefined);
    await Promise.all(comps.map((c) => c.close()));

    // Audio (una vez por corrida).
    if (!a['no-audio'] && mix === null) {
      mix = (await buildMix(slug, metaRef)) || false;
    }

    // Salida: video completo si están todos los segmentos; si no, el tramo pedido.
    const all = Array.from({ length: nSeg }, (_, i) => i);
    const complete = all.every((i) => exists(segFile(i)));
    const suffix = scale < 1 || quality === 'draft' ? '.draft' : '';
    let outFile;
    let segs;
    let audioFrom = 0;
    let dur;
    if (complete) {
      segs = all.map(segFile);
      outFile = a.out ? path.resolve(a.out) : path.join(OUT, `${fmt.name}${suffix}.mp4`);
      dur = total / fps;
    } else {
      segs = todo.map(segFile);
      const sa = (segA * segFrames) / fps;
      const sb = Math.min(total, (segB + 1) * segFrames) / fps;
      outFile = a.out ? path.resolve(a.out) : path.join(OUT, `${fmt.name}${suffix}.${sa}-${sb}.mp4`);
      audioFrom = sa;
      dur = sb - sa;
    }
    ensureDir(path.dirname(outFile));
    await concatAndMux({ segments: segs, listFile: path.join(segDir, 'list.txt'), out: outFile, audio: mix || null, audioFrom, duration: dur });

    const problems = await assertVideo(outFile, {
      w: Math.floor((W * scale) / 2) * 2,
      h: Math.floor((H * scale) / 2) * 2,
      fps,
      frames: Math.round(dur * fps),
      audio: Boolean(mix),
    });
    const size = (fs.statSync(outFile).size / 1e6).toFixed(1);
    if (problems.length) console.warn(`! ${rel(outFile)} no cumple: ${problems.join('; ')}`);
    console.log(`✓ ${rel(outFile)}  (${size} MB${complete ? '' : ', tramo parcial'}${mix ? ', con audio' : ', sin audio'})`);
    if (partial && complete) console.log(`  Re-render de ${(segA * segFrames) / fps}s a ${Math.min(total, (segB + 1) * segFrames) / fps}s; el resto se reutilizó.`);
  }
  console.log(`\nListo en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
} catch (err) {
  fail(err.message);
} finally {
  await browser?.close();
  await server.close();
}

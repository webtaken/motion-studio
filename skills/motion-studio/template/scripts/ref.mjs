// Estudia un video de referencia: fotogramas cada 0.5 s, cortes de escena, paleta y
// hojas de contacto con tiempos. Con eso Claude escribe la guía de estilo y la lista de tomas.
import fs from 'node:fs';
import path from 'node:path';
import { args, num } from './lib/args.mjs';
import { ROOT, ensureDir, writeJSON, rel, fail, exists } from './lib/paths.mjs';
import { run, FFMPEG, probe } from './lib/ffmpeg.mjs';
import { launch } from './lib/browser.mjs';
import { layout, sheetHtml, renderSheet } from './lib/sheet-html.mjs';
import { findPython, runPython } from './lib/python.mjs';

const USAGE = `npm run ref -- <video> [--every 0.5] [--scene 0.12] [--beats]
  Ej: npm run ref -- refs/lanzamiento.mp4
  Salida en refs/<nombre>/: frames/, sheet-NN.png, cuts.json, palette.json (y beats.json con --beats).
  Después: escribe docs/guia_estilo.md y docs/lista_tomas.md (plantillas en docs/_plantillas/)
  y espera el OK antes de escribir código.`;

const a = args({ every: { type: 'string' }, scene: { type: 'string' }, beats: { type: 'boolean' } }, USAGE);
const file = a._[0] && path.resolve(a._[0]);
if (!file || !exists(file)) fail(`No encuentro el video. ${USAGE}`);
const every = num(a.every, 0.5);
const sceneThr = num(a.scene, 0.12); // motion graphics: fondos planos dan puntajes bajos
const name = path.basename(file).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const out = ensureDir(path.join(ROOT, 'refs', name));
const framesDir = path.join(out, 'frames');
fs.rmSync(framesDir, { recursive: true, force: true });
ensureDir(framesDir);

try {
  const info = await probe(file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  if (!v) fail('Ese archivo no tiene video.');
  const duration = Number(info.format.duration);
  const [n, d] = v.r_frame_rate.split('/').map(Number);
  console.log(`→ ${rel(file)}: ${v.width}×${v.height}, ${(n / d).toFixed(2)} fps, ${duration.toFixed(2)} s`);

  // 1. Fotogramas cada `every` segundos (tomados en el centro de cada intervalo).
  await run(FFMPEG, ['-v', 'error', '-i', file, '-vf', `fps=1/${every}:round=down,scale=480:-2`, '-q:v', '3', path.join(framesDir, 'f_%04d.jpg')]);
  const frames = fs.readdirSync(framesDir).filter((f) => f.endsWith('.jpg')).sort();

  // 2. Cortes de escena.
  const { out: sceneOut } = await run(FFMPEG, ['-hide_banner', '-i', file, '-vf', `select='gt(scene,${sceneThr})',metadata=print:file=-`, '-an', '-f', 'null', '-']);
  const cuts = [];
  for (const m of sceneOut.matchAll(/pts_time:([\d.]+)/g)) {
    const t = Number(Number(m[1]).toFixed(3));
    if (!cuts.length || t - cuts[cuts.length - 1] > 0.25) cuts.push(t); // una transición = un corte
  }
  const bounds = [0, ...cuts, duration];
  const shots = bounds.slice(1).map((e, i) => ({ start: bounds[i], end: e, dur: Number((e - bounds[i]).toFixed(3)) }));
  const avg = shots.reduce((s, x) => s + x.dur, 0) / shots.length;
  writeJSON(path.join(out, 'cuts.json'), {
    source: rel(file),
    duration,
    width: v.width,
    height: v.height,
    fps: n / d,
    threshold: sceneThr,
    cuts,
    shots,
    avgShot: Number(avg.toFixed(3)),
  });

  // 3. Paleta + hojas con tiempos (en el navegador: sin dependencias de imagen).
  const browser = await launch();
  try {
    const dataUrls = frames.map((f) => `data:image/jpeg;base64,${fs.readFileSync(path.join(framesDir, f)).toString('base64')}`);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const palette = await page.evaluate(async (urls) => {
      const counts = new Map();
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 48;
      const g = c.getContext('2d');
      for (const u of urls) {
        const img = new Image();
        img.src = u;
        await img.decode();
        g.drawImage(img, 0, 0, 48, 48);
        const d = g.getImageData(0, 0, 48, 48).data;
        for (let i = 0; i < d.length; i += 4) {
          const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      const total = [...counts.values()].reduce((s, x) => s + x, 0);
      const hex = (k) => '#' + [(k >> 8) & 15, (k >> 4) & 15, k & 15].map((x) => (x * 17).toString(16).padStart(2, '0')).join('');
      const out = [];
      for (const [k, cnt] of [...counts].sort((x, y) => y[1] - x[1])) {
        const rgb = [(k >> 8) & 15, (k >> 4) & 15, k & 15];
        if (out.some((o) => Math.hypot(...o.rgb.map((v, i) => v - rgb[i])) < 2.5)) continue;
        out.push({ hex: hex(k), share: +(cnt / total).toFixed(3), rgb });
        if (out.length >= 10) break;
      }
      return out.map(({ hex: h, share }) => ({ hex: h, share }));
    }, dataUrls);
    await ctx.close();
    writeJSON(path.join(out, 'palette.json'), palette);

    const L = layout({ w: v.width, h: v.height, cols: v.width > v.height ? 4 : 6 });
    for (const f of fs.readdirSync(out)) if (/^sheet-\d+\.png$/.test(f)) fs.rmSync(path.join(out, f));
    const cells = frames.map((f, i) => {
      const t = i * every;
      const cut = cuts.find((c) => c > t - every && c <= t);
      return { src: dataUrls[i], label: `${t.toFixed(2)}s`, sub: cut !== undefined ? `✂ corte ${cut.toFixed(2)}s` : '', mark: cut !== undefined };
    });
    const pages = Math.ceil(cells.length / L.perPage);
    for (let p = 0; p < pages; p++) {
      const sheet = sheetHtml({
        title: `ref · ${name}`,
        subtitle: `pág ${p + 1}/${pages} · 1 fotograma cada ${every}s · ${cuts.length} cortes · toma media ${avg.toFixed(2)}s`,
        cells: cells.slice(p * L.perPage, (p + 1) * L.perPage),
        cols: L.cols,
        cellW: L.cellW,
        cellH: L.cellH,
      });
      const f = path.join(out, `sheet-${String(p + 1).padStart(2, '0')}.png`);
      await renderSheet(browser, sheet, f);
      console.log(`✓ ${rel(f)}`);
    }
    console.log(`✓ ${frames.length} fotogramas en ${rel(framesDir)}/`);
    console.log(`✓ ${cuts.length} cortes (toma media ${avg.toFixed(2)} s) → ${rel(path.join(out, 'cuts.json'))}`);
    console.log(`✓ paleta: ${palette.slice(0, 6).map((p) => p.hex).join(' ')} → ${rel(path.join(out, 'palette.json'))}`);
  } finally {
    await browser.close();
  }

  // 4. Beats del audio de la referencia (opcional).
  if (a.beats) {
    if (!findPython()) console.warn('! Sin Python: no puedo sacar los beats.');
    else await runPython('beats.py', [file, '--out', path.join(out, 'beats.json')]);
  }

  console.log(`
Siguiente (no escribas código todavía):
  1. Mira las hojas ${rel(out)}/sheet-*.png
  2. Escribe docs/guia_estilo.md (plantilla: docs/_plantillas/guia_estilo.md)
  3. Escribe docs/lista_tomas.md (plantilla: docs/_plantillas/lista_tomas.md)
  4. Toma la gramática de la referencia, nunca su contenido, logos ni personajes.
  5. Muestra los dos archivos y espera el OK.`);
} catch (err) {
  fail(err.message);
}

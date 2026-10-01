// Hoja de contactos: miniaturas de momentos clave para MIRAR el video sin verlo entero.
// Por defecto: el gancho (0–2 s a 4 fps) + un fotograma por beat.
import fs from 'node:fs';
import path from 'node:path';
import { args, list, num } from './lib/args.mjs';
import { loadVideo, outDir, ensureDir, rel, fail } from './lib/paths.mjs';
import { resolveFormats } from './lib/formats.mjs';
import { startServer } from './lib/server.mjs';
import { launch, openComposition, reportIssues } from './lib/browser.mjs';
import { layout, sheetHtml, renderSheet } from './lib/sheet-html.mjs';

const USAGE = `npm run sheet -- <slug> [opciones]
  (sin opciones)   gancho 0–2 s a 4 fps + un fotograma por beat
  --fps 2          N fotogramas por segundo en vez de por beat
  --mobile         miniaturas de 360 px de ancho (¿se lee en un celular?), 1 por segundo
  --sfx            cada sonido: 2 fotogramas antes, en el golpe y 2 después (sincronía)
  --times 1,2.5    instantes exactos
  --from, --to     limita el rango (para revisar solo lo que corregiste)
  --format 9x16    formato (por defecto el primero de video.json)
  --cols 6         columnas
Salida: out/<slug>/sheet-<formato>[-modo]-NN.png (páginas ≤1568 px para que Claude las lea sin reducir).`;

const a = args(
  {
    format: { type: 'string', short: 'f' },
    fps: { type: 'string' },
    mobile: { type: 'boolean' },
    sfx: { type: 'boolean' },
    times: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    cols: { type: 'string' },
    'allow-net': { type: 'boolean' },
  },
  USAGE,
);

const { slug, config } = loadVideo(a._[0]);
const [fmt] = resolveFormats(a.format?.split(',')[0], config);
const server = await startServer();
const browser = await launch();

try {
  const comp = await openComposition(browser, server.url, slug, { fmt: fmt.name, w: fmt.w, h: fmt.h, allowNet: a['allow-net'] });
  const { duration, fps, beats, sfx } = comp.meta;
  const lastT = duration - 1 / fps;
  const from = num(a.from, 0);
  const to = num(a.to, duration);
  const snap = (t) => Math.min(lastT, Math.max(0, Math.round(t * fps) / fps));

  // Qué instantes mirar.
  let mode = '';
  let shots = [];
  if (a.times) {
    mode = 'times';
    shots = list(a.times).map((t) => ({ t: Number(t) }));
  } else if (a.sfx) {
    mode = 'sfx';
    sfx.forEach((e, i) => {
      for (const d of [-2, 0, 2]) shots.push({ t: e.t + d / fps, sub: d === 0 ? `♪${e.type}` : `${d > 0 ? '+' : ''}${d}f`, mark: d === 0, group: i });
    });
  } else if (a.mobile) {
    mode = 'mobile';
    for (let t = 0.5; t < duration; t += 1) shots.push({ t });
  } else if (a.fps) {
    const step = 1 / num(a.fps, 2);
    for (let t = 0; t < duration; t += step) shots.push({ t });
  } else {
    for (let t = 0; t < Math.min(2, duration); t += 0.25) shots.push({ t, sub: 'gancho' });
    beats.filter((b) => b >= 2 && b < duration).forEach((b) => shots.push({ t: b }));
  }
  shots = shots
    .map((s) => ({ ...s, t: snap(s.t) }))
    .filter((s) => s.t >= from - 1e-6 && s.t <= to + 1e-6);
  if (!a.sfx) shots = shots.filter((s, i, arr) => arr.findIndex((x) => x.t === s.t) === i);
  if (!shots.length) fail('No hay instantes para mostrar en ese rango.');

  const L = a.mobile
    ? layout({ w: fmt.w, h: fmt.h, cellW: 360 })
    : layout({ w: fmt.w, h: fmt.h, cols: num(a.cols, fmt.w > fmt.h ? 4 : 6) });
  const scale = L.cellW / fmt.w;

  const beatOf = (t) => {
    const i = beats.findIndex((b) => Math.abs(b - t) < 0.5 / fps);
    return i >= 0 ? ` · b${i}` : '';
  };
  const near = (t) =>
    sfx
      .filter((e) => Math.abs(e.t - t) < 0.12)
      .map((e) => `♪${e.type}`)
      .join(' ');

  const cells = [];
  for (const s of shots) {
    await comp.seek(s.t);
    const jpg = await comp.shot({ format: 'jpeg', quality: 88, scale });
    cells.push({
      src: `data:image/jpeg;base64,${jpg.toString('base64')}`,
      label: `${s.t.toFixed(2)}s · f${Math.round(s.t * fps)}${beatOf(s.t)}`,
      sub: s.sub ?? near(s.t),
      mark: s.mark,
    });
  }
  await reportIssues(comp);
  await comp.close();

  const dir = ensureDir(outDir(slug));
  const prefix = `sheet-${fmt.name}${mode ? `-${mode}` : ''}-`;
  for (const f of fs.readdirSync(dir)) if (f.startsWith(prefix) && f.endsWith('.png')) fs.rmSync(path.join(dir, f));

  const pages = Math.ceil(cells.length / L.perPage);
  const files = [];
  for (let p = 0; p < pages; p++) {
    const chunk = cells.slice(p * L.perPage, (p + 1) * L.perPage);
    const sheet = sheetHtml({
      title: `${slug} · ${fmt.name}${mode ? ` · ${mode}` : ''}`,
      subtitle: `pág ${p + 1}/${pages} · ${cells.length} fotogramas · ${duration}s @ ${fps} fps${a.mobile ? ' · 360 px de ancho' : ''}`,
      cells: chunk,
      cols: L.cols,
      cellW: L.cellW,
      cellH: L.cellH,
    });
    const file = path.join(dir, `${prefix}${String(p + 1).padStart(2, '0')}.png`);
    await renderSheet(browser, sheet, file);
    files.push(file);
  }
  for (const f of files) console.log(`✓ ${rel(f)}`);
  console.log('\nAbre cada hoja y ponle nota (1–10) a: gancho, lectura en celular, movimiento, variedad, marca, audio.');
} catch (err) {
  fail(err.message);
} finally {
  await browser.close();
  await server.close();
}

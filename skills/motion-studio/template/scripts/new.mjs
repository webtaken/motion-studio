// Crea videos/<slug>/ desde una plantilla.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { args, num } from './lib/args.mjs';
import { ROOT, videoDir, exists, readJSON, writeJSON, rel, fail } from './lib/paths.mjs';

const USAGE = `npm run new -- <slug> [--tipo showreel|producto] [--marca <marca>] [--dur 15] [--bpm 120] [--fps 30] [--titulo "..."]
  showreel: videos/_plantilla (tipografía + interfaz + dato + cierre)
  producto: videos/_producto  (5 beats con capturas y marca reales de assets/<marca>)`;

const a = args(
  {
    tipo: { type: 'string' },
    marca: { type: 'string' },
    dur: { type: 'string' },
    bpm: { type: 'string' },
    fps: { type: 'string' },
    titulo: { type: 'string' },
  },
  USAGE,
);

const slug = a._[0];
if (!slug) fail(USAGE);
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(`Slug inválido "${slug}": usa minúsculas, números y guiones (ej: lanzamiento-app).`);
const dest = videoDir(slug);
if (exists(dest)) fail(`Ya existe ${rel(dest)}.`);

const tipo = a.tipo ?? (a.marca ? 'producto' : 'showreel');
const src = path.join(ROOT, 'videos', tipo === 'producto' ? '_producto' : '_plantilla');
if (!exists(src)) fail(`No existe la plantilla ${rel(src)}.`);
if (a.marca && !exists(path.join(ROOT, 'assets', a.marca, 'brand.json')))
  console.warn(`! assets/${a.marca}/brand.json no existe todavía. Corre: npm run capture -- <url> ${a.marca}`);

fs.cpSync(src, dest, {
  recursive: true,
  filter: (p) => !/[\\/](audio|beats\.json|critica\.md)$/.test(p),
});

const cfg = readJSON(path.join(dest, 'video.json'), {});
const oldDur = cfg.duration ?? 12;
const dur = num(a.dur, oldDur);
const bpm = num(a.bpm, cfg.bpm ?? 120);
const spb = 60 / bpm;
const next = {
  ...cfg,
  title: a.titulo ?? slug.replace(/-/g, ' '),
  duration: dur,
  fps: num(a.fps, cfg.fps ?? 30),
  bpm,
  seed: crypto.randomInt(1, 2 ** 31 - 1),
};
if (a.marca) next.brand = a.marca;
if (dur !== oldDur && Array.isArray(cfg.sections)) {
  const k = dur / oldDur;
  const snap = (x) => Math.round((x * k) / spb) * spb;
  next.sections = cfg.sections.map((s, i, all) => ({ ...s, start: snap(s.start), end: i === all.length - 1 ? dur : snap(s.end) }));
}
writeJSON(path.join(dest, 'video.json'), next);

console.log(`✓ ${rel(dest)} creado desde ${rel(src)} (${dur}s, ${bpm} BPM, ${next.fps} fps)`);
console.log(`
Siguiente:
  1. Edita ${rel(path.join(dest, 'index.html'))} (setup + render).
  2. npm run dev                      → míralo en el navegador
  3. npm run check -- ${slug}         → reglas + determinismo
  4. npm run sheet -- ${slug}         → hoja de contactos para revisar
  5. npm run render -- ${slug} -f all → MP4 final en out/${slug}/`);

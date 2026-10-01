// Fotograma suelto en PNG: para revisar un instante exacto sin renderizar el video.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { args, list, num } from './lib/args.mjs';
import { loadVideo, outDir, ensureDir, rel, fail } from './lib/paths.mjs';
import { resolveFormats } from './lib/formats.mjs';
import { startServer } from './lib/server.mjs';
import { launch, openComposition, reportIssues } from './lib/browser.mjs';

const USAGE = `npm run still -- <slug> --t 2.5[,4,7.25] [--format 9x16] [--scale 1] [--hash] [--out archivo.png]
  Guarda out/<slug>/still-<formato>-<t>.png. --hash imprime el sha256 (para comparar renders).`;

const a = args(
  {
    t: { type: 'string' },
    format: { type: 'string', short: 'f' },
    scale: { type: 'string' },
    hash: { type: 'boolean' },
    out: { type: 'string' },
    'allow-net': { type: 'boolean' },
  },
  USAGE,
);

const { slug, config } = loadVideo(a._[0]);
const times = (list(a.t) ?? ['0']).map(Number);
const [fmt] = resolveFormats(a.format?.split(',')[0], config);
const scale = num(a.scale, 1);
const server = await startServer();
const browser = await launch();
try {
  const comp = await openComposition(browser, server.url, slug, { fmt: fmt.name, w: fmt.w, h: fmt.h, allowNet: a['allow-net'] });
  const dir = ensureDir(outDir(slug));
  for (const t of times) {
    const tt = Math.round(t * comp.meta.fps) / comp.meta.fps; // siempre sobre un fotograma real
    await comp.seek(tt);
    const png = await comp.shot({ format: 'png', scale });
    const file = a.out && times.length === 1 ? path.resolve(a.out) : path.join(dir, `still-${fmt.name}-${tt.toFixed(2)}.png`);
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, png);
    const h = a.hash ? `  sha256:${crypto.createHash('sha256').update(png).digest('hex').slice(0, 16)}` : '';
    console.log(`✓ ${rel(file)}  (t=${tt.toFixed(3)}s)${h}`);
  }
  await reportIssues(comp);
} catch (err) {
  fail(err.message);
} finally {
  await browser.close();
  await server.close();
}

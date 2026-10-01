// Descarga una fuente de Google Fonts como woff2 local + fonts.css.
// Al renderizar no hay red: las fuentes deben vivir en el estudio.
import fs from 'node:fs';
import path from 'node:path';
import { args, list } from './lib/args.mjs';
import { ROOT, ensureDir, fail, rel, isMain } from './lib/paths.mjs';

const USAGE = `npm run fonts -- "<Familia>" [pesos] [--italic] [--subsets latin,latin-ext] [--out carpeta]
  Ej: npm run fonts -- "Inter" 400,600,800
  Guarda en assets/_fonts/<familia>/ y escribe fonts.css para enlazar con <link rel="stylesheet">.`;

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export async function downloadFont(family, { weights = ['400', '700'], italic = false, subsets = ['latin'], out } = {}) {
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dir = ensureDir(out ?? path.join(ROOT, 'assets', '_fonts', slug));
  const axis = italic
    ? `ital,wght@${[...weights.map((w) => `0,${w}`), ...weights.map((w) => `1,${w}`)].join(';')}`
    : `wght@${weights.join(';')}`;
  const api = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${axis}&display=block`;
  const res = await fetch(api, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Google Fonts respondió ${res.status} para "${family}". ¿Nombre exacto? (${api})`);
  const css = await res.text();

  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]+)}/g)]
    .map(([, subset, body]) => ({
      subset,
      url: /url\(([^)]+)\)/.exec(body)?.[1],
      weight: /font-weight:\s*([^;]+);/.exec(body)?.[1].trim() ?? '400',
      style: /font-style:\s*([^;]+);/.exec(body)?.[1].trim() ?? 'normal',
      range: /unicode-range:\s*([^;]+);/.exec(body)?.[1].trim(),
    }))
    .filter((b) => b.url && subsets.includes(b.subset));
  // Fuente variable: Google devuelve el mismo archivo para varios pesos.
  const uses = new Map();
  for (const b of blocks) uses.set(b.url, (uses.get(b.url) ?? 0) + 1);
  const files = new Map();
  const faces = [];
  for (const b of blocks) {
    if (!files.has(b.url)) {
      const w = uses.get(b.url) > 1 ? 'var' : b.weight.replace(/\s+/g, '_');
      const name = `${slug}-${w}${b.style === 'italic' ? '-italic' : ''}-${b.subset}.woff2`;
      const buf = Buffer.from(await (await fetch(b.url)).arrayBuffer());
      fs.writeFileSync(path.join(dir, name), buf);
      files.set(b.url, name);
    }
    faces.push({ family, weight: b.weight, style: b.style, file: files.get(b.url), range: b.range });
  }
  if (!faces.length) throw new Error(`No encontré archivos para ${family} (${subsets.join(', ')}).`);

  const base = '/' + path.relative(ROOT, dir).split(path.sep).join('/');
  const out_css = faces
    .map(
      (f) => `@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: block;
  src: url('${base}/${f.file}') format('woff2');${f.range ? `\n  unicode-range: ${f.range};` : ''}
}`,
    )
    .join('\n');
  fs.writeFileSync(path.join(dir, 'fonts.css'), `/* ${family} — descargada de Google Fonts (licencia OFL) */\n${out_css}\n`);
  return { dir, base, faces };
}

if (isMain(import.meta.url)) {
  const a = args({ italic: { type: 'boolean' }, subsets: { type: 'string' }, out: { type: 'string' } }, USAGE);
  const [family, weights] = a._;
  if (!family) fail(USAGE);
  try {
    const r = await downloadFont(family, {
      weights: list(weights) ?? ['400', '700'],
      italic: a.italic,
      subsets: list(a.subsets) ?? ['latin'],
      out: a.out ? path.resolve(a.out) : undefined,
    });
    console.log(`✓ ${family}: ${r.faces.length} caras en ${rel(r.dir)}`);
    console.log(`  En tu index.html: <link rel="stylesheet" href="${r.base}/fonts.css">`);
    console.log(`  En CSS: font-family: '${family}', system-ui, sans-serif;`);
  } catch (err) {
    fail(err.message);
  }
}

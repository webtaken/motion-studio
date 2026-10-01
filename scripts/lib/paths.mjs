// Rutas del estudio. Todo se resuelve desde la raíz (carpeta con package.json).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const rel = (p) => path.relative(ROOT, p) || '.';
export const videoDir = (slug) => path.join(ROOT, 'videos', slug);
export const outDir = (slug) => path.join(ROOT, 'out', slug);

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function readJSON(p, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw new Error(`No pude leer ${rel(p)}: ${err.message}`);
  }
}

export function writeJSON(p, data) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

// Valida que el video exista y devuelve su configuración.
export function loadVideo(slug) {
  if (!slug) fail('Falta el slug del video. Ejemplo: npm run render -- demo');
  const dir = videoDir(slug);
  if (!exists(path.join(dir, 'index.html'))) {
    const disponibles = fs
      .readdirSync(path.join(ROOT, 'videos'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .join(', ');
    fail(`No existe videos/${slug}/index.html. Videos disponibles: ${disponibles || '(ninguno)'}`);
  }
  const config = readJSON(path.join(dir, 'video.json'), {});
  return { slug, dir, config };
}

export function fail(msg, code = 1) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(code);
}

// ¿Este módulo se ejecutó directo (node scripts/x.mjs) o lo importó otro script?
import { pathToFileURL } from 'node:url';
export const isMain = (metaUrl) => process.argv[1] && metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;

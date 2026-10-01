// Revisa que el estudio tenga todo lo necesario y dice cómo arreglar lo que falte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { args } from './lib/args.mjs';
import { ROOT, exists } from './lib/paths.mjs';
import { run, FFMPEG, FFPROBE, hasEncoder } from './lib/ffmpeg.mjs';
import { findPython, hasModule } from './lib/python.mjs';

const a = args({ json: { type: 'boolean' } }, 'npm run doctor [--json]');
const plat = process.platform;
const fix = {
  ffmpeg: plat === 'darwin' ? 'brew install ffmpeg' : plat === 'win32' ? 'winget install Gyan.FFmpeg' : 'sudo apt install ffmpeg',
  node: plat === 'darwin' ? 'brew install node@22' : 'https://nodejs.org (o nvm install 22)',
  python:
    plat === 'darwin'
      ? 'brew install python && python3 -m venv .venv && .venv/bin/pip install -r audio/requirements.txt'
      : plat === 'win32'
        ? 'winget install Python.Python.3.12; py -m venv .venv; .venv\\Scripts\\pip install -r audio\\requirements.txt'
        : 'uv venv .venv && uv pip install --python .venv/bin/python -r audio/requirements.txt   (o: python3 -m venv .venv && .venv/bin/pip install -r audio/requirements.txt)',
};

const checks = [];
const add = (name, ok, detail, hint, level = 'error') => checks.push({ name, ok, detail, hint: ok ? undefined : hint, level });

// Node
const major = Number(process.versions.node.split('.')[0]);
add('Node ≥ 22', major >= 22, `v${process.versions.node}`, fix.node);

// ffmpeg / ffprobe
let ffv = '';
try {
  ffv = (await run(FFMPEG, ['-hide_banner', '-version'])).out.split('\n')[0].replace('ffmpeg version ', '').split(' Copyright')[0];
  add('ffmpeg', true, ffv);
  add('ffmpeg: libx264', await hasEncoder('libx264'), 'H.264', `${fix.ffmpeg} (con libx264)`);
  add('ffmpeg: aac', await hasEncoder('aac'), 'audio AAC', fix.ffmpeg);
} catch {
  add('ffmpeg', false, 'no encontrado', fix.ffmpeg);
}
try {
  await run(FFPROBE, ['-version']);
  add('ffprobe', true, 'ok');
} catch {
  add('ffprobe', false, 'no encontrado', fix.ffmpeg);
}

// Playwright + Chromium
try {
  const { chromium } = await import('playwright');
  const t0 = Date.now();
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('about:blank');
  await b.close();
  add('Chromium sin ventana', true, `abre en ${Date.now() - t0} ms`);
} catch (err) {
  const missingLibs = /Host system is missing dependencies|install-deps/i.test(String(err));
  add(
    'Chromium sin ventana',
    false,
    String(err.message).split('\n')[0],
    missingLibs ? 'sudo npx playwright install-deps chromium' : 'npm install && npx playwright install chromium',
  );
}

// Python (audio)
const py = findPython();
add('Python + numpy (audio)', Boolean(py), py ? path.relative(ROOT, py) || py : 'no encontrado', fix.python);
if (py) add('librosa (beats de pistas propias)', hasModule('librosa'), hasModule('librosa') ? 'ok' : 'no (se usa detector numpy)', `${py} -m pip install -r audio/requirements-extra.txt`, 'warn');

// Fuentes por defecto
const fontsOk = ['unbounded', 'inter'].every((f) => fs.readdirSync(path.join(ROOT, 'lib', 'fonts', f)).some((x) => x.endsWith('.woff2')));
add('Fuentes locales (lib/fonts)', fontsOk, fontsOk ? 'Unbounded + Inter' : 'faltan', 'npm run fonts -- "Inter" 400,500,600,700 --out lib/fonts/inter');

// Disco
try {
  const st = fs.statfsSync(ROOT);
  const gb = (st.bavail * st.bsize) / 1e9;
  add('Espacio en disco', gb > 2, `${gb.toFixed(1)} GB libres`, 'libera espacio (los renders y segmentos viven en out/)', 'warn');
} catch {
  /* statfs no disponible */
}

const workers = Math.max(1, Math.min(3, os.cpus().length - 1));
const failed = checks.filter((c) => !c.ok && c.level === 'error');

if (a.json) {
  console.log(JSON.stringify({ ok: failed.length === 0, workers, checks }, null, 2));
} else {
  for (const c of checks) {
    const icon = c.ok ? '✓' : c.level === 'warn' ? '!' : '✗';
    console.log(`${icon} ${c.name.padEnd(34)} ${c.detail ?? ''}`);
    if (c.hint) console.log(`    → ${c.hint}`);
  }
  console.log(`\n${os.cpus().length} núcleos → workers sugeridos: ${workers}`);
  console.log(failed.length ? `\n✗ Falta(n) ${failed.length} cosa(s). Corrige y vuelve a correr npm run doctor.` : '\n✓ El estudio está listo.');
}
process.exit(failed.length ? 1 : 0);

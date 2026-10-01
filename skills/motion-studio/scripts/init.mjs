#!/usr/bin/env node
// Monta un estudio de motion desde cero (o actualiza su motor) a partir de ../template.
// Uso: node init.mjs [destino] [--update] [--force] [--skip-python] [--with-librosa] [--no-smoke] [--no-install]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.resolve(HERE, '..', 'template');
const MANIFEST = '.motion-studio-manifest.json';
const WIN = process.platform === 'win32';

const USAGE = `node init.mjs [destino] [opciones]
  destino          carpeta del estudio (por defecto: la actual)
  --update         actualiza el motor de un estudio existente (respeta tus videos y marcas)
  --force          permite una carpeta que no está vacía
  --skip-python    no prepara Python (sin música ni sfx)
  --with-librosa   instala también librosa (beats más precisos en pistas propias)
  --no-smoke       no hace el render de prueba
  --no-install     no corre npm install ni descarga Chromium`;

let opts;
try {
  opts = parseArgs({
    options: {
      update: { type: 'boolean' },
      force: { type: 'boolean' },
      'skip-python': { type: 'boolean' },
      'with-librosa': { type: 'boolean' },
      'no-smoke': { type: 'boolean' },
      'no-install': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });
} catch (err) {
  console.error(`${err.message}\n\n${USAGE}`);
  process.exit(1);
}
const a = opts.values;
if (a.help) {
  console.log(USAGE);
  process.exit(0);
}
const DEST = path.resolve(opts.positionals[0] ?? '.');

const step = (msg) => console.log(`\n▸ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const warn = (msg) => console.log(`  ! ${msg}`);
const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};
const sh = (cmd, args, extra = {}) => spawnSync(cmd, args, { stdio: 'inherit', cwd: DEST, shell: WIN, ...extra });
const quiet = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore', shell: WIN });
const has = (cmd, args = ['--version']) => quiet(cmd, args).status === 0;
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const INSTALL = {
  ffmpeg: { darwin: 'brew install ffmpeg', win32: 'winget install Gyan.FFmpeg', linux: 'sudo apt install ffmpeg   (o dnf/pacman)' },
  node: { darwin: 'brew install node@22', win32: 'winget install OpenJS.NodeJS.LTS', linux: 'nvm install 22   (https://github.com/nvm-sh/nvm)' },
};
const how = (k) => INSTALL[k][process.platform] ?? INSTALL[k].linux;

// ---------- 1. requisitos ----------
step('Revisando requisitos');
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) die(`Necesitas Node 22 o más nuevo (tienes ${process.versions.node}). Instala: ${how('node')}`);
ok(`Node ${process.versions.node}`);
if (!has('ffmpeg', ['-version'])) die(`Falta ffmpeg. Instala: ${how('ffmpeg')}`);
const enc = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8', shell: WIN }).stdout ?? '';
if (!/\slibx264\s/.test(enc)) die(`Tu ffmpeg no trae libx264. Instala uno completo: ${how('ffmpeg')}`);
ok('ffmpeg con libx264');
if (!fs.existsSync(TEMPLATE)) die(`No encuentro la plantilla en ${TEMPLATE}. ¿La skill está completa?`);

// ---------- 2. copiar plantilla ----------
const listFiles = (dir, base = dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
  });
const tplManifest = JSON.parse(fs.readFileSync(path.join(TEMPLATE, MANIFEST), 'utf8'));

if (a.update) {
  step(`Actualizando el motor en ${DEST}`);
  if (!fs.existsSync(path.join(DEST, 'package.json'))) die('Ahí no hay un estudio (falta package.json). Quita --update para crearlo.');
  const oldManifest = fs.existsSync(path.join(DEST, MANIFEST)) ? JSON.parse(fs.readFileSync(path.join(DEST, MANIFEST), 'utf8')) : { files: {} };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(DEST, '.motion-studio-backup', stamp);
  let updated = 0;
  let added = 0;
  let backed = 0;
  for (const [rel, hash] of Object.entries(tplManifest.files)) {
    const src = path.join(TEMPLATE, rel);
    const destRel = rel === '_gitignore' ? '.gitignore' : rel;
    const dst = path.join(DEST, destRel);
    if (rel === 'README.md' && fs.existsSync(dst)) continue; // el README es tuyo
    if (rel === 'package.json') continue; // se fusiona abajo
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      added++;
      continue;
    }
    const cur = sha(dst);
    if (cur === hash) continue;
    if (oldManifest.files[rel] !== cur) {
      // Lo modificaste tú: respaldo antes de pisarlo.
      const b = path.join(backupDir, destRel);
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.copyFileSync(dst, b);
      backed++;
    }
    fs.copyFileSync(src, dst);
    updated++;
  }
  // package.json: actualiza scripts, dependencias del motor y versión; conserva lo tuyo.
  const mine = JSON.parse(fs.readFileSync(path.join(DEST, 'package.json'), 'utf8'));
  const theirs = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'package.json'), 'utf8'));
  mine.scripts = { ...mine.scripts, ...theirs.scripts };
  mine.devDependencies = { ...mine.devDependencies, ...theirs.devDependencies };
  mine.engines = theirs.engines;
  mine.type = 'module';
  mine.motionStudio = { ...mine.motionStudio, ...theirs.motionStudio };
  fs.writeFileSync(path.join(DEST, 'package.json'), JSON.stringify(mine, null, 2) + '\n');
  fs.copyFileSync(path.join(TEMPLATE, MANIFEST), path.join(DEST, MANIFEST));
  ok(`${updated} archivo(s) actualizados, ${added} nuevos${backed ? `, ${backed} respaldados en ${path.relative(DEST, backupDir)}/` : ''}`);
} else {
  step(`Creando el estudio en ${DEST}`);
  if (fs.existsSync(DEST)) {
    const busy = fs.readdirSync(DEST).filter((f) => !['.git', '.DS_Store', '.claude', '.agents'].includes(f));
    if (busy.length && !a.force) die(`${DEST} no está vacía (${busy.slice(0, 5).join(', ')}…). Usa --force para escribir encima o --update para actualizar un estudio.`);
    if (fs.existsSync(path.join(DEST, 'package.json')) && a.force) warn('Ya había un package.json: se reemplaza.');
  }
  fs.mkdirSync(DEST, { recursive: true });
  for (const rel of listFiles(TEMPLATE)) {
    const dst = path.join(DEST, rel === '_gitignore' ? '.gitignore' : rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(TEMPLATE, rel), dst);
  }
  for (const d of ['out', 'refs', 'assets/_sfx', 'assets/_fonts']) fs.mkdirSync(path.join(DEST, d), { recursive: true });
  ok(`plantilla v${tplManifest.version} copiada (${Object.keys(tplManifest.files).length} archivos)`);
}

// ---------- 3. dependencias ----------
if (!a['no-install']) {
  step('Instalando Playwright');
  if (sh('npm', ['install', '--no-fund', '--no-audit']).status !== 0) die('npm install falló.');
  if (sh('npx', ['playwright', 'install', 'chromium']).status !== 0) {
    warn('No pude descargar Chromium. En Linux quizá falten librerías: sudo npx playwright install-deps chromium');
  } else ok('Chromium listo');
}

// ---------- 4. Python para el audio ----------
if (!a['skip-python']) {
  step('Preparando Python para música y sfx');
  const reqs = ['-r', 'audio/requirements.txt', ...(a['with-librosa'] ? ['-r', 'audio/requirements-extra.txt'] : [])];
  const venvPy = path.join(DEST, '.venv', WIN ? 'Scripts' : 'bin', WIN ? 'python.exe' : 'python');
  const uvCandidates = ['uv', path.join(os.homedir(), '.local', 'bin', 'uv'), path.join(os.homedir(), '.cargo', 'bin', 'uv')];
  const uv = uvCandidates.find((c) => has(c));
  const pyCmd = ['python3', 'python', 'py'].find((c) => has(c));
  let done = false;
  if (uv) {
    done = sh(uv, ['venv', '.venv', '--quiet']).status === 0 && sh(uv, ['pip', 'install', '--quiet', '--python', venvPy, ...reqs]).status === 0;
    if (done) ok('entorno .venv con uv');
  }
  if (!done && pyCmd) {
    done = sh(pyCmd, ['-m', 'venv', '.venv']).status === 0 && sh(venvPy, ['-m', 'pip', 'install', '--quiet', ...reqs]).status === 0;
    if (done) ok('entorno .venv con venv');
  }
  if (!done && pyCmd) {
    fs.rmSync(path.join(DEST, '.venv'), { recursive: true, force: true });
    done = sh(pyCmd, ['-m', 'pip', 'install', '--user', '--quiet', ...reqs]).status === 0;
    if (done) ok(`paquetes con ${pyCmd} -m pip --user`);
  }
  if (!done) warn('Sin Python con numpy: los videos saldrán sin audio. Instala Python 3 y corre npm run doctor.');
}

// ---------- 5. git ----------
if (!fs.existsSync(path.join(DEST, '.git')) && has('git')) {
  step('Inicializando git');
  if (quiet('git', ['-C', DEST, 'init', '-q']).status === 0) ok('repositorio creado (out/ y .venv/ ignorados)');
}

// ---------- 6. doctor + prueba ----------
step('Revisando el estudio');
const doctor = sh('node', ['scripts/doctor.mjs']);
if (!a['no-smoke'] && !a['no-install']) {
  step('Render de prueba (2 s, borrador)');
  const r = sh('node', ['scripts/render.mjs', '_plantilla', '--to', '2', '--scale', '0.25', '--workers', '1', '--no-audio', '--out', 'out/_smoke/9x16.mp4']);
  if (r.status === 0) ok('out/_smoke/9x16.mp4');
  else warn('El render de prueba falló: revisa el mensaje de arriba y npm run doctor.');
}

console.log(`
${doctor.status === 0 ? '✓' : '!'} Estudio ${a.update ? 'actualizado' : 'listo'} en ${DEST}

Siguiente:
  cd ${path.relative(process.cwd(), DEST) || '.'}
  npm run dev                         preview en http://localhost:4321 (abre videos/demo)
  npm run new -- mi-video             video nuevo desde la plantilla
  npm run capture -- <url> <marca>    capturas, logo, colores y fuentes reales
  npm run sheet -- mi-video           hoja de contactos para revisar
  npm run render -- mi-video -f all   MP4 9:16, 1:1 y 16:9

Reglas para el agente: AGENTS.md / CLAUDE.md · Prompts de la guía: prompts/`);

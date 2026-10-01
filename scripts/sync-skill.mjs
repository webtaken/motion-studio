// Copia el motor del estudio (fuente de verdad) a skills/motion-studio/template/ y genera
// skills/motion-studio/references/. --check falla si la skill está desactualizada (CI).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { args } from './lib/args.mjs';
import { ROOT, rel, fail } from './lib/paths.mjs';

const a = args({ check: { type: 'boolean' } }, 'npm run sync-skill [-- --check]');

const SKILL = path.join(ROOT, 'skills', 'motion-studio');
const TPL = path.join(SKILL, 'template');
const REFS = path.join(SKILL, 'references');
const MANIFEST = '.motion-studio-manifest.json';

// Qué forma parte del motor (lo demás es contenido del usuario).
const ENGINE = [
  'lib',
  'scripts',
  'audio/compose.py', 'audio/dsp.py', 'audio/mix.py', 'audio/sfx.py', 'audio/beats.py', 'audio/wavio.py',
  'audio/requirements.txt', 'audio/requirements-extra.txt',
  'videos/_plantilla/index.html', 'videos/_plantilla/video.json',
  'videos/_producto/index.html', 'videos/_producto/video.json',
  'videos/demo/index.html', 'videos/demo/video.json',
  'prompts',
  'docs/motor.md', 'docs/audio.md', 'docs/problemas.md',
  'docs/_plantillas/guia_estilo.md', 'docs/_plantillas/lista_tomas.md', 'docs/_plantillas/critica.md',
  'AGENTS.md', 'CLAUDE.md', '.nvmrc',
];
const SKIP = new Set(['scripts/sync-skill.mjs']);
const SKIP_RE = /(^|\/)(__pycache__|\.DS_Store|node_modules)(\/|$)|\.pyc$/;

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const want = new Map(); // ruta absoluta → Buffer

function addTree(relPath) {
  const full = path.join(ROOT, relPath);
  const st = fs.lstatSync(full);
  if (st.isSymbolicLink()) fail(`${relPath} es un symlink: la skill no puede llevar symlinks.`);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(full)) addTree(path.posix.join(relPath, f));
    return;
  }
  const r = relPath.split(path.sep).join('/');
  if (SKIP.has(r) || SKIP_RE.test(r)) return;
  if (path.basename(r) === 'metadata.json') fail(`${r}: el CLI de skills ignora archivos metadata.json; renómbralo.`);
  want.set(path.join(TPL, r), fs.readFileSync(full));
}
for (const e of ENGINE) addTree(e);

// package.json de un estudio nuevo (sin datos de este repo).
const tplPkg = {
  name: 'mi-motion-studio',
  version: '0.1.0',
  private: true,
  type: 'module',
  description: 'Estudio de motion graphics con código (window.seek(t) → MP4).',
  engines: pkg.engines,
  motionStudio: { version },
  scripts: Object.fromEntries(Object.entries(pkg.scripts).filter(([k]) => k !== 'sync-skill')),
  devDependencies: pkg.devDependencies,
};
want.set(path.join(TPL, 'package.json'), Buffer.from(JSON.stringify(tplPkg, null, 2) + '\n'));
want.set(path.join(TPL, '_gitignore'), fs.readFileSync(path.join(ROOT, '.gitignore')));
want.set(path.join(TPL, 'README.md'), fs.readFileSync(path.join(ROOT, 'docs', '_plantillas', 'README-estudio.md')));

// Manifiesto: hash de cada archivo del motor (init --update lo usa).
const files = {};
for (const [abs, buf] of [...want].sort(([x], [y]) => x.localeCompare(y))) {
  files[path.relative(TPL, abs).split(path.sep).join('/')] = crypto.createHash('sha256').update(buf).digest('hex');
}
want.set(path.join(TPL, MANIFEST), Buffer.from(JSON.stringify({ version, files }, null, 2) + '\n'));

// references/: generadas desde los docs del estudio (una sola fuente).
const head = (src) => `<!-- Generado por scripts/sync-skill.mjs desde ${src}. No editar aquí. -->\n\n`;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const prompts = fs
  .readdirSync(path.join(ROOT, 'prompts'))
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => read(`prompts/${f}`).trim())
  .join('\n\n---\n\n');
const refs = {
  'reglas.md': ['AGENTS.md', read('AGENTS.md')],
  'pipeline.md': ['docs/motor.md', read('docs/motor.md')],
  'prompts.md': ['prompts/*.md', `# Prompts de la Guía MOTION\n\n${prompts}\n`],
  'critica.md': ['docs/_plantillas/critica.md', read('docs/_plantillas/critica.md')],
  'audio.md': ['docs/audio.md', read('docs/audio.md')],
  'problemas.md': ['docs/problemas.md', read('docs/problemas.md')],
};
for (const [name, [src, body]] of Object.entries(refs)) want.set(path.join(REFS, name), Buffer.from(head(src) + body));

// Versión en los manifiestos del plugin.
const pluginFile = path.join(ROOT, '.claude-plugin', 'plugin.json');
const marketFile = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const plugin = JSON.parse(fs.readFileSync(pluginFile, 'utf8'));
const market = JSON.parse(fs.readFileSync(marketFile, 'utf8'));
plugin.version = version;
for (const p of market.plugins) if (p.name === 'motion-studio') p.version = version;
want.set(pluginFile, Buffer.from(JSON.stringify(plugin, null, 2) + '\n'));
want.set(marketFile, Buffer.from(JSON.stringify(market, null, 2) + '\n'));
if (pkg.motionStudio?.version !== version) fail(`package.json: motionStudio.version (${pkg.motionStudio?.version}) ≠ version (${version}).`);

// Comparar / escribir.
const onDisk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, String(f))).filter((f) => fs.statSync(f).isFile()) : []);
const existing = new Set([...onDisk(TPL), ...onDisk(REFS)]);
const changed = [];
for (const [abs, buf] of want) {
  if (!fs.existsSync(abs) || !fs.readFileSync(abs).equals(buf)) changed.push(`~ ${rel(abs)}`);
  existing.delete(abs);
}
const stale = [...existing].map((f) => `- ${rel(f)}`);

if (a.check) {
  if (changed.length || stale.length) {
    console.error([...changed, ...stale].slice(0, 30).join('\n'));
    fail(`La skill está desactualizada (${changed.length + stale.length} archivo/s). Corre: npm run sync-skill`);
  }
  console.log(`✓ skills/motion-studio al día (v${version}, ${Object.keys(files).length} archivos de plantilla).`);
  process.exit(0);
}

for (const f of existing) fs.rmSync(f);
for (const [abs, buf] of want) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
}
// Conserva permisos de ejecución de init.mjs.
fs.chmodSync(path.join(SKILL, 'scripts', 'init.mjs'), 0o755);
console.log(`✓ skills/motion-studio sincronizada (v${version}): ${changed.length} cambio(s), ${stale.length} borrado(s).`);

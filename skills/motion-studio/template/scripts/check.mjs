// Revisión automática antes de mostrar nada: reglas del estudio + determinismo.
// Determinista = el mismo t da el mismo píxel, sin importar el orden ni la pestaña.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { args } from './lib/args.mjs';
import { loadVideo, rel, fail } from './lib/paths.mjs';
import { resolveFormats } from './lib/formats.mjs';
import { startServer } from './lib/server.mjs';
import { launch, openComposition } from './lib/browser.mjs';

const USAGE = `npm run check -- <slug> [--format 9x16|all]
  Revisa: código prohibido (Math.random, timers, transiciones, fuentes remotas), errores JS,
  red bloqueada, fuentes que no cargaron, máximo 2 familias tipográficas y determinismo.`;

const a = args({ format: { type: 'string', short: 'f' }, 'allow-net': { type: 'boolean' } }, USAGE);
const { slug, dir, config } = loadVideo(a._[0]);
const formats = resolveFormats(a.format ?? 'all', config);

const errors = [];
const warns = [];

// 1. Código prohibido (estático).
const RULES = [
  [/Math\.random\s*\(/, 'error', 'Math.random(): usa ctx.rand(i, salt) o ctx.rng(salt)'],
  [/\bset(Timeout|Interval)\s*\(/, 'error', 'setTimeout/setInterval: todo lo animado sale de render(t)'],
  [/requestAnimationFrame\s*\(/, 'error', 'requestAnimationFrame: el motor llama a render(t)'],
  [/\b(Date\.now|performance\.now)\s*\(|new Date\(\s*\)/, 'error', 'reloj real: usa t'],
  [/fonts\.(googleapis|gstatic)\.com/, 'error', 'fuente remota: descárgala con npm run fonts'],
  [/transition\s*:\s*(?!\s*none)[^;'"]+/, 'warn', 'transition CSS: el guard la desactiva; anima en render(t)'],
  [/(src|href)\s*=\s*["']https?:\/\//, 'warn', 'recurso externo: guárdalo en assets/ (render sin red)'],
  [/url\(\s*["']?https?:\/\//, 'warn', 'url() externa en CSS: guárdala en assets/'],
];
const files = fs
  .readdirSync(dir, { recursive: true })
  .map(String)
  .filter((f) => /\.(html|js|mjs|css)$/.test(f) && !f.split(path.sep).includes('node_modules'));
for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|<!--)/.test(line)) return;
    for (const [re, level, msg] of RULES) {
      if (re.test(line)) (level === 'error' ? errors : warns).push(`${rel(path.join(dir, f))}:${i + 1}  ${msg}`);
    }
  });
}

const server = await startServer();
const browser = await launch();
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);

try {
  let sfxRef;
  for (const fmt of formats) {
    const open = () => openComposition(browser, server.url, slug, { fmt: fmt.name, w: fmt.w, h: fmt.h, allowNet: a['allow-net'] });
    const comp = await open();
    const { duration, fps } = comp.meta;
    const tag = `[${fmt.name}]`;

    // 2. Fuentes: ¿todas las familias usadas cargaron? ¿cuántas hay?
    const fonts = await comp.page.evaluate(() => {
      const used = new Set();
      for (const el of document.querySelectorAll('#stage *')) {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const fam = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
        used.add(fam);
      }
      const loaded = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/^["']|["']$/g, '')));
      return { used: [...used], missing: [...used].filter((f) => !loaded.has(f)) };
    });
    for (const m of fonts.missing) errors.push(`${tag} la fuente "${m}" no cargó: se ve la de reemplazo`);
    if (fonts.used.length > 2) warns.push(`${tag} ${fonts.used.length} familias tipográficas (${fonts.used.join(', ')}): la regla es 1 de títulos + 1 de interfaz`);

    // 3. Determinismo: mismos t → mismos píxeles (en orden, desordenado y en pestaña nueva).
    const times = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => Math.round(p * duration * fps) / fps);
    const pass = async (c, order) => {
      const out = {};
      for (const t of order) {
        await c.seek(t);
        out[t] = sha(await c.shot({ format: 'png', scale: 0.5 }));
      }
      return out;
    };
    const A = await pass(comp, times);
    const B = await pass(comp, [...times].reverse());
    const fresh = await open();
    const C = await pass(fresh, [times[2], times[0], times[4], times[1], times[3]]);
    for (const t of times) {
      if (A[t] !== B[t]) errors.push(`${tag} t=${t}s cambia según el orden de dibujo (render(t) no fija todo lo que anima)`);
      else if (A[t] !== C[t]) errors.push(`${tag} t=${t}s cambia entre pestañas (estado o aleatoriedad fuera de render)`);
    }

    // 4. sfx iguales en todos los formatos.
    const sfx = JSON.stringify(comp.meta.sfx);
    if (sfxRef === undefined) sfxRef = sfx;
    else if (sfx !== sfxRef) errors.push(`${tag} los sfx cambian con el formato (deben depender solo del tiempo)`);

    // 5. Errores de ejecución, red y reglas rotas.
    for (const c of [comp, fresh]) {
      const v = await c.violations();
      for (const x of v) errors.push(`${tag} regla rota en ejecución: ${x.type} ×${x.count} — ${x.hint}`);
      for (const e of c.issues.pageErrors) errors.push(`${tag} error JS: ${e}`);
      for (const b of new Set(c.issues.blocked)) errors.push(`${tag} pidió internet (bloqueado): ${b}`);
      for (const m of c.issues.console) warns.push(`${tag} consola ${m}`);
    }
    await comp.close();
    await fresh.close();
    console.log(`${tag} ${duration}s @ ${fps} fps · fuentes: ${fonts.used.join(', ') || '—'} · ${comp.meta.sfx.length} sfx · determinismo revisado en ${times.length} instantes`);
  }
} catch (err) {
  errors.push(err.message);
} finally {
  await browser.close();
  await server.close();
}

const uniq = (x) => [...new Set(x)];
for (const w of uniq(warns)) console.warn(`! ${w}`);
for (const e of uniq(errors)) console.error(`✗ ${e}`);
if (errors.length) fail(`${uniq(errors).length} problema(s) en ${slug}.`);
console.log(`✓ ${slug} pasa la revisión${warns.length ? ` (${uniq(warns).length} aviso(s))` : ''}.`);

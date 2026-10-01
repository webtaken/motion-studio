// Captura la marca real desde su web: capturas (escritorio, celular, página completa,
// secciones), logos, paleta y fuentes → assets/<marca>/brand.json + brand-sheet.png.
// Regla del estudio: nunca redibujar la interfaz de memoria; se recorta y anima la real.
import fs from 'node:fs';
import path from 'node:path';
import { args } from './lib/args.mjs';
import { ROOT, ensureDir, writeJSON, readJSON, rel, fail } from './lib/paths.mjs';
import { launch } from './lib/browser.mjs';
import { extractBrand } from './lib/palette.mjs';

const USAGE = `npm run capture -- <url> <marca> [--headed] [--steps flujo.json] [--locale es-ES]
  Guarda en assets/<marca>/: brand.json, brand-sheet.png, shots/, logos/, fonts/.
  --steps: pasos extra para capturar estados reales (clics, formularios):
    [{"click": "text=Probar gratis"}, {"wait": 800}, {"shot": "despues-del-clic"}, {"goto": "https://..."}]
  --headed: abre una ventana visible (si la web bloquea navegadores sin ventana).`;

const a = args({ headed: { type: 'boolean' }, steps: { type: 'string' }, locale: { type: 'string' } }, USAGE);
const [url, marca] = a._;
if (!url || !marca) fail(USAGE);
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(marca)) fail(`Nombre de marca inválido "${marca}": minúsculas y guiones.`);
let target;
try {
  target = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
} catch {
  fail(`URL inválida: ${url}`);
}

const dir = ensureDir(path.join(ROOT, 'assets', marca));
const D = (...p) => ensureDir(path.join(dir, ...p));
const shotsDir = D('shots');
const secDir = D('shots', 'sections');
const logosDir = D('logos');
const fontsDir = D('fonts');
const relA = (p) => path.relative(dir, p).split(path.sep).join('/');

const browser = await launch({ headed: a.headed });
const fontFiles = new Map(); // url → archivo guardado

async function settle(page) {
  // Cierra banners de cookies si hay un botón claro.
  const btn = page.getByRole('button', { name: /^(aceptar( todo| todas)?|accept( all)?|agree|allow all|ok|entendido|got it)$/i }).first();
  await btn.click({ timeout: 1500 }).catch(() => {});
  // Baja despacio para que cargue lo diferido y vuelve arriba.
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewportSize().height;
  for (let y = 0; y < Math.min(h, 20000); y += vh * 0.8) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(220);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
}

async function open(viewport, dsf, extra = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: dsf,
    reducedMotion: 'reduce',
    locale: a.locale,
    ...extra,
  });
  const page = await context.newPage();
  page.on('response', async (r) => {
    try {
      if (r.request().resourceType() !== 'font' || fontFiles.has(r.url())) return;
      const buf = await r.body();
      const base = decodeURIComponent(new URL(r.url()).pathname.split('/').pop() || 'font').replace(/[^\w.-]+/g, '_');
      const name = /\.(woff2?|ttf|otf)$/i.test(base) ? base : `${base}.woff2`;
      fs.writeFileSync(path.join(fontsDir, name), buf);
      fontFiles.set(r.url(), name);
    } catch {
      /* respuesta sin cuerpo */
    }
  });
  try {
    await page.goto(target.href, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    await page.goto(target.href, { waitUntil: 'load', timeout: 45000 });
  }
  await settle(page);
  return { context, page };
}

try {
  console.log(`→ ${target.href}`);

  // ---------- escritorio ----------
  const desk = await open({ width: 1440, height: 900 }, 2);
  const p = desk.page;
  await p.screenshot({ path: path.join(shotsDir, 'desktop.png') });
  try {
    await p.screenshot({ path: path.join(shotsDir, 'full.png'), fullPage: true });
  } catch {
    console.warn('! No pude capturar la página completa (muy alta).');
  }

  // Secciones: el material para "la interfaz se arma pieza por pieza".
  const sections = [];
  const handles = await p.$$('header, nav, main > section, body > section, section, [class*=hero], footer');
  let k = 0;
  const seenBoxes = new Set();
  for (const h of handles) {
    if (k >= 14) break;
    const box = await h.boundingBox();
    if (!box || box.width < 600 || box.height < 90 || box.height > 4000) continue;
    const key = `${Math.round(box.y / 20)}-${Math.round(box.height / 20)}`;
    if (seenBoxes.has(key)) continue;
    seenBoxes.add(key);
    const tag = await h.evaluate((el) => el.tagName.toLowerCase());
    const file = path.join(secDir, `${String(++k).padStart(2, '0')}-${tag}.png`);
    try {
      await h.screenshot({ path: file });
      sections.push({ file: relA(file), tag, w: Math.round(box.width), h: Math.round(box.height) });
    } catch {
      k--;
    }
  }

  // Botón principal (CTA).
  let cta = null;
  const ctaEl = p.locator('a, button').filter({ hasText: /\S/ }).filter({ visible: true });
  const n = Math.min(await ctaEl.count(), 60);
  let best = null;
  for (let i = 0; i < n; i++) {
    const info = await ctaEl
      .nth(i)
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
        const [rr, g, b, al = 1] = m ? m[1].split(/[\s,/]+/).map(Number) : [0, 0, 0, 0];
        const sat = Math.max(rr, g, b) - Math.min(rr, g, b);
        return { score: al > 0.5 ? sat + (r.top < 900 ? 80 : 0) : 0, w: r.width, h: r.height, text: el.textContent.trim().slice(0, 40) };
      })
      .catch(() => null);
    if (info && info.w > 60 && info.h > 24 && (!best || info.score > best.score)) best = { ...info, i };
  }
  if (best && best.score > 40) {
    const file = path.join(shotsDir, 'cta.png');
    await ctaEl.nth(best.i).screenshot({ path: file }).catch(() => {});
    if (fs.existsSync(file)) cta = { file: relA(file), text: best.text };
  }

  // Marca: paleta, fuentes, logos.
  const brandRaw = await p.evaluate(extractBrand);

  // Pasos opcionales (estados reales tras clics).
  const flow = [];
  if (a.steps) {
    const steps = readJSON(path.resolve(a.steps));
    const flowDir = D('shots', 'flow');
    for (const s of steps) {
      if (s.goto) await p.goto(s.goto, { waitUntil: 'networkidle' }).catch(() => {});
      if (s.click) await p.locator(s.click).first().click({ timeout: 5000 });
      if (s.fill) await p.locator(s.fill[0]).first().fill(s.fill[1]);
      if (s.wait) await p.waitForTimeout(s.wait);
      if (s.shot) {
        const file = path.join(flowDir, `${s.shot}.png`);
        await p.screenshot({ path: file });
        flow.push(relA(file));
      }
    }
  }
  await desk.context.close();

  // ---------- celular ----------
  const mob = await open({ width: 390, height: 844 }, 3, { isMobile: true, hasTouch: true });
  await mob.page.screenshot({ path: path.join(shotsDir, 'mobile.png') });
  try {
    await mob.page.screenshot({ path: path.join(shotsDir, 'mobile-full.png'), fullPage: true });
  } catch {
    /* página muy alta */
  }
  await mob.context.close();

  // ---------- logos e íconos ----------
  const req = (await browser.newContext()).request;
  const logos = [];
  let li = 0;
  for (const l of brandRaw.logos) {
    li++;
    if (l.kind === 'svg') {
      const file = path.join(logosDir, `logo-${li}.svg`);
      fs.writeFileSync(file, l.svg);
      logos.push({ file: relA(file), kind: 'svg', w: l.w, h: l.h });
    } else {
      try {
        const res = await req.get(l.url, { timeout: 15000 });
        const ext = (res.headers()['content-type'] || '').includes('svg') ? 'svg' : path.extname(new URL(l.url).pathname).slice(1) || 'png';
        const file = path.join(logosDir, `logo-${li}.${ext.replace(/[^a-z0-9]/gi, '')}`);
        fs.writeFileSync(file, await res.body());
        logos.push({ file: relA(file), kind: 'img', w: l.w, h: l.h, from: l.url });
      } catch {
        /* imagen no descargable */
      }
    }
  }
  const icons = [];
  for (const [i, ic] of [...brandRaw.icons, ...(brandRaw.ogImage ? [{ rel: 'og:image', url: brandRaw.ogImage }] : [])].entries()) {
    try {
      const res = await req.get(ic.url, { timeout: 15000 });
      if (!res.ok()) continue;
      const ext = path.extname(new URL(ic.url).pathname).slice(1).replace(/[^a-z0-9]/gi, '') || 'png';
      const file = path.join(logosDir, `${ic.rel === 'og:image' ? 'og-image' : `icon-${i + 1}`}.${ext}`);
      fs.writeFileSync(file, await res.body());
      icons.push({ file: relA(file), rel: ic.rel, sizes: ic.sizes ?? null });
    } catch {
      /* ícono no descargable */
    }
  }

  // ---------- fuentes: cruza @font-face con los archivos descargados ----------
  const fontFor = (role) => {
    const f = brandRaw.fonts[role];
    if (!f) return null;
    if (!f.family) return { family: null, stack: f.stack, weight: f.weight, files: [], local: false, system: true };
    const fam = f.family.toLowerCase();
    const files = [];
    for (const face of brandRaw.faces.filter((x) => x.family.toLowerCase() === fam)) {
      const u = face.urls.find((x) => fontFiles.has(x));
      if (u) files.push({ src: `fonts/${fontFiles.get(u)}`, weight: face.weight, style: face.style });
    }
    if (!files.length) {
      const slug = fam.replace(/[^a-z0-9]/g, '');
      for (const [, name] of fontFiles) if (name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(slug)) files.push({ src: `fonts/${name}`, weight: '400', style: 'normal' });
    }
    const uniq = [...new Map(files.map((x) => [`${x.src}|${x.weight}|${x.style}`, x])).values()];
    return { family: f.family, weight: f.weight, files: uniq, local: uniq.length > 0, ...(f.sample ? { sample: f.sample } : {}) };
  };
  const fonts = { title: fontFor('title'), ui: fontFor('ui') };

  const brand = {
    name: marca,
    url: target.href,
    title: brandRaw.title,
    description: brandRaw.description,
    siteName: brandRaw.siteName,
    capturedAt: new Date().toISOString(),
    colors: { ...brandRaw.colors, themeColor: brandRaw.themeColor },
    fonts,
    logos,
    icons,
    shots: {
      desktop: 'shots/desktop.png',
      mobile: 'shots/mobile.png',
      full: fs.existsSync(path.join(shotsDir, 'full.png')) ? 'shots/full.png' : null,
      mobileFull: fs.existsSync(path.join(shotsDir, 'mobile-full.png')) ? 'shots/mobile-full.png' : null,
      sections,
      cta,
      flow,
    },
  };
  writeJSON(path.join(dir, 'brand.json'), brand);

  // ---------- hoja de marca para MIRARLA ----------
  const dataUrl = (file, mime) => `data:${mime};base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}`;
  const mimeOf = (f) => ({ svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', gif: 'image/gif' })[f.split('.').pop().toLowerCase()] || 'image/png';
  const faceCss = ['title', 'ui']
    .map((r) => fonts[r])
    .filter((f) => f?.family && f.files?.length)
    .flatMap((f) => f.files.map((x) => `@font-face{font-family:"${f.family}";src:url(${dataUrl(x.src, 'font/woff2')});font-weight:${x.weight};font-style:${x.style}}`))
    .join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${faceCss}
  body{margin:0;padding:28px;width:1500px;background:#0b0c0e;color:#e8e6e1;font:14px ui-monospace,monospace}
  h2{font:600 13px ui-monospace,monospace;color:#8b919a;text-transform:uppercase;letter-spacing:.08em;margin:22px 0 10px}
  .row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
  .sw{width:120px}.sw i{display:block;height:70px;border-radius:8px;border:1px solid #333}.sw span{display:block;margin-top:6px}
  .logo{background:#fff;padding:14px;border-radius:8px;height:90px;display:flex;align-items:center}.logo.dark{background:#1d2026}.logo img{max-height:62px;max-width:260px}
  .font{background:${brand.colors.bg};color:${brand.colors.text};padding:18px 22px;border-radius:8px;width:100%}
  .shots img{height:420px;border:1px solid #333;border-radius:6px}
  </style></head><body>
  <div style="font:700 22px system-ui;color:#fff">${marca} <span style="color:#8b919a;font-weight:400;font-size:15px">${target.href}</span></div>
  <h2>Colores (fondo · texto · acento · paleta)</h2><div class="row">${[
    ['fondo', brand.colors.bg],
    ['texto', brand.colors.text],
    ['acento', brand.colors.accent],
    ...brand.colors.palette.map((c) => ['', c]),
  ]
    .filter(([, c]) => c)
    .map(([n, c]) => `<div class="sw"><i style="background:${c}"></i><span>${n ? `${n} ` : ''}${c}</span></div>`)
    .join('')}</div>
  <h2>Fuentes</h2>${['title', 'ui']
    .map((r) => fonts[r])
    .filter(Boolean)
    .map(
      (f, i) =>
        `<div class="font" style="font-family:'${f.family ?? 'system-ui'}',sans-serif;font-weight:${f.weight};font-size:${i ? 22 : 44}px;margin-bottom:8px">${i ? 'Interfaz' : 'Título'}: ${f.family ?? 'fuente del sistema'} ${f.local || f.system ? '' : '(⚠ no se descargó)'} — ${(f.sample || 'Así se ve tu marca en movimiento').slice(0, 50)}</div>`,
    )
    .join('')}
  <h2>Logos</h2><div class="row">${logos
    .map((l) => `<div class="logo"><img src="${dataUrl(l.file, mimeOf(l.file))}"></div><div class="logo dark"><img src="${dataUrl(l.file, mimeOf(l.file))}"></div>`)
    .join('') || 'ninguno encontrado'}</div>
  <h2>Capturas</h2><div class="row shots"><img src="${dataUrl('shots/desktop.png', 'image/png')}"><img src="${dataUrl('shots/mobile.png', 'image/png')}"></div>
  </body></html>`;
  const sctx = await browser.newContext({ viewport: { width: 1556, height: 900 } });
  const sp = await sctx.newPage();
  await sp.setContent(html, { waitUntil: 'load' });
  await sp.screenshot({ path: path.join(dir, 'brand-sheet.png'), fullPage: true });
  await sctx.close();

  // ---------- resumen ----------
  console.log(`✓ ${rel(dir)}/brand.json`);
  console.log(`  colores  fondo ${brand.colors.bg} · texto ${brand.colors.text} · acento ${brand.colors.accent ?? '—'}`);
  for (const r of ['title', 'ui']) {
    const f = fonts[r];
    if (!f) continue;
    if (f.system) {
      console.log(`  fuente ${r === 'title' ? 'título ' : 'interfaz'} del sistema (${f.stack.slice(0, 50)}…) → usa Inter (ya incluida) o elige una con npm run fonts`);
      continue;
    }
    console.log(`  fuente ${r === 'title' ? 'título ' : 'interfaz'} ${f.family} ${f.local ? `(${f.files.length} archivo/s)` : '— no se descargó: npm run fonts -- "' + f.family + '" si es de Google Fonts'}`);
  }
  console.log(`  logos    ${logos.length} · íconos ${icons.length} · secciones ${sections.length}${cta ? ` · CTA "${cta.text}"` : ''}`);
  console.log(`  capturas ${rel(shotsDir)}/ (desktop, mobile, full, sections/)`);
  console.log(`  revisa   ${rel(path.join(dir, 'brand-sheet.png'))}  ← míralo antes de animar`);
  console.log('\n  Ojo: usa logos, fuentes y capturas solo de marcas propias o con permiso.');
} catch (err) {
  fail(`Captura falló: ${err.message.split('\n')[0]}${a.headed ? '' : '\n  Si la web bloquea navegadores sin ventana, prueba con --headed.'}`);
} finally {
  await browser.close();
}

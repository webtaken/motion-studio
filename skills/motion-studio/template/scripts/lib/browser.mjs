// Navegador sin ventana: abre una composición, la mueve con seek(t) y saca fotos.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';

const GUARD = fs.readFileSync(path.join(ROOT, 'lib', 'guard.js'), 'utf8');

const ARGS = [
  '--force-color-profile=srgb', // colores de marca iguales en cualquier máquina
  '--disable-lcd-text', // antialias en gris, sin bordes de color en el texto
  '--font-render-hinting=none',
  '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  '--disable-gpu-vsync', // rAF sin esperar al refresco de pantalla: render más rápido
  '--disable-frame-rate-limit',
];

export async function launch({ headed = false } = {}) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Falta Playwright. Corre: npm install && npx playwright install chromium');
  }
  try {
    return await chromium.launch({ headless: !headed, args: ARGS });
  } catch (err) {
    throw new Error(`No pude abrir Chromium (${err.message.split('\n')[0]}). Corre: npx playwright install chromium`);
  }
}

/**
 * Abre videos/<slug>/ en una pestaña de w×h y espera a window.__ready.
 * render=true inyecta lib/guard.js (reloj virtual, sin aleatoriedad, sin transiciones).
 */
export async function openComposition(browser, baseUrl, slug, opts = {}) {
  const { fmt = '9x16', w = 1080, h = 1920, render = true, allowNet = false, params = {}, timeout = 60000 } = opts;
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const issues = { console: [], blocked: [], pageErrors: [] };

  if (!allowNet) {
    // Render offline: lo que no viene del estudio se bloquea y se reporta.
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return route.continue();
      issues.blocked.push(u.href);
      return route.abort('blockedbyclient');
    });
  }
  if (render) await context.addInitScript({ content: GUARD });

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') issues.console.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => issues.pageErrors.push(e.message));

  const qs = new URLSearchParams({ w: String(w), h: String(h), fmt, ...(render ? { render: '1' } : {}), ...params });
  const url = `${baseUrl}/videos/${slug}/?${qs}`;
  const explain = () =>
    [...issues.pageErrors, ...issues.console, ...issues.blocked.map((b) => `bloqueado: ${b}`)].slice(0, 8).join('\n  ');

  await page.goto(url, { waitUntil: 'load', timeout });
  const hasReady = await page
    .waitForFunction(() => window.__ready !== undefined, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!hasReady) {
    await context.close();
    throw new Error(`videos/${slug} nunca llamó a defineVideo() (no hay window.__ready).\n  ${explain()}`);
  }
  try {
    await page.evaluate(async (ms) => {
      const st = window.__realSetTimeout ?? setTimeout; // no cuenta como regla rota
      const to = new Promise((_, rej) => st(() => rej(new Error(`__ready tardó más de ${ms} ms`)), ms));
      await Promise.race([window.__ready, to]);
      await document.fonts.ready;
    }, timeout);
  } catch (err) {
    await context.close();
    throw new Error(`videos/${slug} falló al preparar: ${err.message.split('\n')[0]}\n  ${explain()}`);
  }

  const meta = await page.evaluate(() => window.__meta);
  const cdp = await context.newCDPSession(page);

  return {
    page,
    context,
    meta,
    issues,
    w,
    h,
    /** Pinta t y espera a que Chromium lo dibuje (doble rAF): sin esto la foto
     *  a veces sale del fotograma anterior. */
    async seek(t) {
      await page.evaluate(async (tt) => {
        await window.seek(tt);
        const raf = window.__realRAF ?? window.requestAnimationFrame.bind(window);
        await new Promise((r) => raf(() => raf(r)));
      }, t);
    },
    /** Foto del lienzo. scale < 1 = miniatura (borradores, hojas de contacto). */
    async shot({ format = 'jpeg', quality = 92, scale = 1 } = {}) {
      const r = await cdp.send('Page.captureScreenshot', {
        format,
        ...(format === 'jpeg' ? { quality } : {}),
        optimizeForSpeed: true,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: w, height: h, scale },
      });
      return Buffer.from(r.data, 'base64');
    },
    violations: () => page.evaluate(() => window.__guard?.violations ?? []),
    close: () => context.close(),
  };
}

/** Imprime advertencias de una pestaña (consola, red bloqueada, guard). */
export async function reportIssues(comp, label = '') {
  const v = await comp.violations().catch(() => []);
  const lines = [
    ...comp.issues.pageErrors.map((e) => `error JS: ${e}`),
    ...comp.issues.console,
    ...[...new Set(comp.issues.blocked)].map((b) => `red bloqueada (usa archivos locales): ${b}`),
    ...v.map((x) => `regla rota: ${x.type} ×${x.count}${x.hint ? ` — ${x.hint}` : ''}`),
  ];
  if (lines.length) {
    console.warn(`\n! Avisos${label ? ` (${label})` : ''}:`);
    for (const l of [...new Set(lines)].slice(0, 20)) console.warn(`  - ${l}`);
  }
  return lines;
}

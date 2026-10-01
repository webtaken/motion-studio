// Motor del estudio. Cada video llama defineVideo({ setup, render }).
// Contrato: window.__ready (promesa), window.seek(t) (pinta el fotograma t), window.__meta.
import { mulberry32, rand, strHash } from './rng.js';
import { loadBrand } from './brand.js';

export * from './easing.js';
export * from './interp.js';
export * from './spring.js';
export * from './rng.js';
export * from './stagger.js';
export * from './text.js';
export * from './scenes.js';
export * from './cursor.js';
export * from './camera.js';
export * from './texture.js';
export * from './media.js';
export { loadBrand };

export const FORMATS = { '9x16': [1080, 1920], '1x1': [1080, 1080], '16x9': [1920, 1080], '4x5': [1080, 1350] };

async function loadFonts() {
  await Promise.all(
    [...document.fonts].map((f) =>
      (f.status === 'unloaded' ? f.load() : f.loaded).catch(() => console.warn(`No cargó la fuente ${f.family} ${f.weight}`)),
    ),
  );
  await document.fonts.ready;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/**
 * defineVideo({
 *   config: './video.json',      // o un objeto {duration, fps, bpm, seed, ...}
 *   async setup(ctx) { ... },    // una vez: DOM, splitText, precargas, ctx.sfx(...)
 *   render(t, ctx) { ... },      // pura: fija TODO lo animado a partir de t
 * })
 */
export function defineVideo({ config = './video.json', setup, render }) {
  if (typeof render !== 'function') throw new Error('defineVideo necesita render(t, ctx)');
  const q = new URLSearchParams(location.search);
  const fmt = q.get('fmt') || '9x16';
  const [dw, dh] = FORMATS[fmt] || FORMATS['9x16'];
  const w = Number(q.get('w')) || dw;
  const h = Number(q.get('h')) || dh;
  const isRender = q.has('render');
  const u = Math.min(w, h) / 100;

  const root = document.documentElement;
  root.dataset.fmt = fmt;
  root.dataset.orient = w > h ? 'landscape' : w < h ? 'portrait' : 'square';
  root.style.setProperty('--w', `${w}px`);
  root.style.setProperty('--h', `${h}px`);
  root.style.setProperty('--u', `${u}px`);
  if (q.has('safe')) root.dataset.safe = '';

  let ctx;
  let ready = false;
  const sfx = [];

  window.__ready = (async () => {
    const cfg = typeof config === 'string' ? await fetchJSON(config) : config;
    // beats.json solo si video.json lo declara (npm run beats lo hace solo).
    const beatsFile = cfg.beats ? await fetchJSON(cfg.beats) : null;
    const duration = cfg.duration ?? 10;
    const fps = cfg.fps ?? 30;
    const bpm = beatsFile?.bpm ?? cfg.bpm ?? 120;
    const seed = cfg.seed ?? 1;
    const spb = 60 / bpm;
    const offset = beatsFile?.offset ?? 0;
    const real = beatsFile?.beats?.length ? beatsFile.beats : null;
    const grid = Array.from({ length: Math.floor((duration - offset) / spb) + 1 }, (_, i) => +(offset + i * spb).toFixed(4));
    const brand = cfg.brand ? await loadBrand(cfg.brand) : null;

    ctx = {
      w, h, u, fmt, isRender, duration, fps, bpm, seed, brand, config: cfg,
      portrait: h > w, landscape: w > h, square: w === h,
      beats: real ?? grid,
      /** Segundo del beat n (acepta fracciones: beat(2.5)). Usa beats.json si existe. */
      beat(n) {
        if (!real) return offset + n * spb;
        const i = Math.floor(n);
        const f = n - i;
        if (i < 0) return real[0] + n * spb;
        if (i + 1 < real.length) return real[i] + (real[i + 1] - real[i]) * f;
        return real[real.length - 1] + (n - (real.length - 1)) * spb;
      },
      bar(n) {
        return this.beat(n * 4);
      },
      /** Registra un efecto de sonido en t. SOLO en setup(): el audio se arma antes de dibujar. */
      sfx(t, type, opts = {}) {
        if (ready) {
          console.warn(`ctx.sfx('${type}') llamado fuera de setup(): se ignora`);
          return;
        }
        sfx.push({ t: Math.round(t * 1000) / 1000, type, ...opts });
      },
      rng: (salt = '') => mulberry32(seed ^ strHash(String(salt))),
      rand: (i, salt = '') => rand(i, salt, seed),
      /** Valor según formato: ctx.pick({'9x16': 120, '16x9': 90, default: 100}). */
      pick(map) {
        return map[fmt] ?? map[root.dataset.orient] ?? map.default ?? map['9x16'];
      },
      frame: (t) => Math.round(t * fps),
      $: (s) => document.querySelector(s),
      $$: (s) => [...document.querySelectorAll(s)],
    };
    window.__ctx = ctx;

    // Fuentes cargadas ANTES de setup (medidas correctas) y otra vez después
    // por si setup agregó alguna: nunca un fotograma con fuente de reemplazo.
    await loadFonts();
    if (setup) await setup(ctx);
    await loadFonts();
    await Promise.all(
      [...document.images].map((img) => img.decode().catch(() => console.warn(`Imagen sin cargar: ${img.currentSrc || img.src}`))),
    );
    const r0 = render(0, ctx);
    if (r0?.then) await r0;

    sfx.sort((a, b) => a.t - b.t);
    window.__meta = {
      title: cfg.title ?? document.title, duration, fps, bpm, seed, w, h, fmt,
      beats: ctx.beats, sfx, music: cfg.music ?? null, sections: cfg.sections ?? null,
    };
    ready = true;
    if (window.__guard) window.__guard.ready = true;
  })();
  window.__ready.catch((err) => console.error(`defineVideo: ${err?.stack || err}`));

  window.seek = (t) => {
    if (!ready) throw new Error('seek() antes de que __ready termine');
    const tt = Math.max(0, Math.min(t, ctx.duration));
    if (window.__clock) window.__clock.t = tt;
    // Animaciones CSS/WAAPI quedan congeladas en t (deterministas igual que render).
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = tt * 1000;
    }
    return render(tt, ctx);
  };

  // Abierto directo en el navegador (no en el reproductor ni en render): se reproduce en loop.
  if (!isRender && window.top === window) {
    window.__ready.then(() => {
      if (q.has('t')) return window.seek(Number(q.get('t')));
      const t0 = performance.now();
      const tick = () => {
        window.seek(((performance.now() - t0) / 1000) % ctx.duration);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
}

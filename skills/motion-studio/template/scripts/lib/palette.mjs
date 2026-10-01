// Se ejecuta DENTRO de la página capturada (page.evaluate): sin imports ni cierres externos.
// Extrae paleta (por área visible y cantidad de texto), fuentes, logos e íconos.
export function extractBrand() {
  const toRGB = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  };
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const oklab = ({ r, g, b }) => {
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const chroma = (c) => {
    const [, a, b] = oklab(c);
    return Math.hypot(a, b);
  };

  // Acumuladores con fusión de colores parecidos (distancia OKLab).
  const bucket = () => {
    const list = [];
    return {
      add(c, w) {
        if (!c || c.a < 0.5 || w <= 0) return;
        const L = oklab(c);
        const hit = list.find((x) => Math.hypot(...x.L.map((v, i) => v - L[i])) < 0.035);
        if (hit) hit.w += w;
        else list.push({ c, L, w });
      },
      top: (n) => [...list].sort((x, y) => y.w - x.w).slice(0, n),
    };
  };
  const bgs = bucket();
  const texts = bucket();
  const accents = bucket();
  const docH = Math.max(document.documentElement.scrollHeight, innerHeight);
  const vis = (el, r) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && r.bottom > 0 && r.top < docH;

  bgs.add(toRGB(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }, innerWidth * innerHeight * 0.5);
  const all = [...document.querySelectorAll('body *')].slice(0, 6000);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (!vis(el, r)) continue;
    const cs = getComputedStyle(el);
    const area = Math.min(r.width, innerWidth) * Math.min(r.height, 3000);
    const bg = toRGB(cs.backgroundColor);
    bgs.add(bg, area);
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (own) texts.add(toRGB(cs.color), own.length);
    const isBtn = el.matches('button, [role=button], input[type=submit], a[class*=btn], a[class*=button], a[class*=cta], [class*=button]');
    if (isBtn && bg && chroma(bg) > 0.06) accents.add(bg, area + 20000);
    if (el.matches('a') && own && chroma(toRGB(cs.color) || { r: 0, g: 0, b: 0 }) > 0.08) accents.add(toRGB(cs.color), own.length * 40);
  }
  const bgTop = bgs.top(6);
  const textTop = texts.top(4);
  let accent = accents.top(1)[0]?.c;
  if (!accent) accent = [...bgTop, ...textTop].map((x) => x.c).sort((a, b) => chroma(b) - chroma(a))[0];
  const palette = [...new Map([...bgTop, ...textTop, ...accents.top(3)].map((x) => [hex(x.c), x])).keys()].slice(0, 10);

  // Fuentes: título = h1 (o el texto más grande); interfaz = body/p.
  // Primera familia real de la pila (salta genéricas como ui-sans-serif o system-ui).
  const GENERIC = /^(ui-sans-serif|ui-serif|ui-monospace|ui-rounded|system-ui|-apple-system|blinkmacsystemfont|sans-serif|serif|monospace|cursive|fantasy|segoe ui|helvetica neue|helvetica|arial|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji)$/i;
  const fam = (el) => {
    if (!el) return null;
    const stack = getComputedStyle(el).fontFamily.split(',').map((x) => x.trim().replace(/^["']|["']$/g, ''));
    return stack.find((f) => !GENERIC.test(f)) ?? null;
  };
  let titleEl = document.querySelector('h1');
  if (!titleEl) {
    let best = 0;
    for (const el of all) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (own && fs > best) (best = fs), (titleEl = el);
    }
  }
  const uiEl = document.querySelector('main p, p, li, body');
  const stackOf = (el) => (el ? getComputedStyle(el).fontFamily : '');
  const fonts = {
    title: titleEl ? { family: fam(titleEl), stack: stackOf(titleEl), weight: getComputedStyle(titleEl).fontWeight, sample: titleEl.textContent.trim().slice(0, 60) } : null,
    ui: uiEl ? { family: fam(uiEl), stack: stackOf(uiEl), weight: getComputedStyle(uiEl).fontWeight } : null,
  };

  // @font-face legibles (las hojas de otro dominio no se pueden leer).
  const faces = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of rules) {
      if (r.constructor.name !== 'CSSFontFaceRule') continue;
      const src = r.style.getPropertyValue('src');
      const urls = [...src.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => new URL(m[1], sheet.href || location.href).href);
      faces.push({
        family: r.style.getPropertyValue('font-family').replace(/^["']|["']$/g, '').trim(),
        weight: r.style.getPropertyValue('font-weight') || '400',
        style: r.style.getPropertyValue('font-style') || 'normal',
        urls,
      });
    }
  }

  // Logos: SVG/IMG en header/nav, [class*=logo], enlace a la home; luego íconos.
  const logos = [];
  const seen = new Set();
  const pushImg = (url, kind, score, el) => {
    if (!url || seen.has(url) || url.startsWith('data:image/gif')) return;
    seen.add(url);
    const r = el?.getBoundingClientRect();
    logos.push({ kind, url, score, w: r ? Math.round(r.width) : undefined, h: r ? Math.round(r.height) : undefined });
  };
  const resolveSvg = (svg) => {
    const clone = svg.cloneNode(true);
    const color = getComputedStyle(svg).color;
    const html = clone.outerHTML.replace(/currentColor/g, color);
    return html.includes('xmlns') ? html : html.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  };
  const cands = [
    ...new Set(
      document.querySelectorAll(
        'header [class*=logo], nav [class*=logo], [class*=logo] svg, [class*=logo] img, [id*=logo], img[alt*=logo i], img[src*=logo i], svg[aria-label*=logo i], a[href="/"] svg, a[href="/"] img, header svg, header img, nav svg, nav img',
      ),
    ),
  ];
  const site = location.hostname.replace(/^www\./, '').split('.')[0].toLowerCase();
  for (const el of cands) {
    const r = el.getBoundingClientRect();
    if (!vis(el, r) || r.width < 16 || r.height < 10 || r.top > 1200) continue;
    const words = `${el.className?.baseVal ?? el.className} ${el.id} ${el.getAttribute('alt') ?? ''} ${el.getAttribute('src') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.closest('a')?.getAttribute('aria-label') ?? ''}`.toLowerCase();
    const isLogoish = /logo|brand/.test(words);
    const named = site.length > 2 && words.replace(/[^a-z0-9]/g, '').includes(site);
    const iconLike = r.width < 40 && r.height < 40 && Math.abs(r.width - r.height) < 6;
    const score = (isLogoish ? 3 : 0) + (named ? 3 : 0) + (el.closest('a[href="/"], a[href="./"]') ? 2 : 0) + (r.left < innerWidth / 3 ? 1 : 0) - (iconLike ? 4 : 0) - r.top / 600;
    if (el.tagName.toLowerCase() === 'svg') {
      const svg = resolveSvg(el);
      if (!seen.has(svg) && svg.length < 200000) {
        seen.add(svg);
        logos.push({ kind: 'svg', svg, score, w: Math.round(r.width), h: Math.round(r.height) });
      }
    } else if (el.tagName.toLowerCase() === 'img') pushImg(el.currentSrc || el.src, 'img', score, el);
    else {
      const inner = el.querySelector('svg, img');
      if (inner?.tagName.toLowerCase() === 'svg') {
        const svg = resolveSvg(inner);
        if (!seen.has(svg)) {
          seen.add(svg);
          logos.push({ kind: 'svg', svg, score: score + 1, w: Math.round(r.width), h: Math.round(r.height) });
        }
      } else if (inner) pushImg(inner.currentSrc || inner.src, 'img', score + 1, inner);
    }
  }
  const icons = [...document.querySelectorAll('link[rel~=icon], link[rel=apple-touch-icon], link[rel=mask-icon]')].map((l) => ({
    rel: l.rel,
    url: l.href,
    sizes: l.getAttribute('sizes'),
  }));
  const meta = (n) => document.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.content;

  return {
    url: location.href,
    title: document.title,
    description: meta('description') || meta('og:description') || '',
    siteName: meta('og:site_name') || '',
    themeColor: meta('theme-color') || null,
    ogImage: meta('og:image') ? new URL(meta('og:image'), location.href).href : null,
    colors: {
      bg: bgTop[0] ? hex(bgTop[0].c) : '#ffffff',
      text: textTop[0] ? hex(textTop[0].c) : '#111111',
      accent: accent ? hex(accent) : null,
      palette,
    },
    fonts,
    faces,
    logos: logos.sort((a, b) => b.score - a.score).slice(0, 8),
    icons,
  };
}

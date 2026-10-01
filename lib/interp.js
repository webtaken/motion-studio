// Interpolación pura en función de t: progress, remap, keyframes y track(el, t, {...}).
import { toEase } from './easing.js';

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, p) => a + (b - a) * p;

/** 0 antes de start, 1 después de end, lineal en medio (con easing opcional). */
export function progress(t, start, end, e) {
  if (end <= start) return t >= end ? 1 : 0;
  return toEase(e)(clamp((t - start) / (end - start)));
}

/** remap(t, [0, 1.2], [0, 400], 'outCubic') */
export function remap(t, [a, b], [c, d], e) {
  return lerp(c, d, progress(t, a, b, e));
}

/** Ventana [start, end): ¿está t dentro? */
export const within = (t, start, end) => t >= start && t < end;

// ---------- colores (interpolados en OKLab para que no se ensucien) ----------
function parseColor(c) {
  if (Array.isArray(c)) return c;
  const s = String(c).trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return null;
}
const isColor = (v) => typeof v === 'string' && parseColor(v) !== null;
const toLin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgbToOklab([r, g, b]) {
  [r, g, b] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ].map((x) => Math.round(clamp(x, 0, 255)));
}
export function mixColor(a, b, p) {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const la = rgbToOklab(ca);
  const lb = rgbToOklab(cb);
  const [r, g, bl] = oklabToRgb(la.map((v, i) => lerp(v, lb[i], p)));
  const al = lerp(ca[3], cb[3], p);
  return al >= 1 ? `rgb(${r}, ${g}, ${bl})` : `rgba(${r}, ${g}, ${bl}, ${al.toFixed(3)})`;
}

function mix(a, b, p) {
  if (typeof a === 'number') return lerp(a, b, p);
  if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], p));
  if (isColor(a)) return mixColor(a, b, p);
  return p < 1 ? a : b; // texto u otros: cambia de golpe al llegar
}

/**
 * keyframes(t, [[0, 0], [0.6, 120, 'outBack'], [2, 80]])
 * Cada clave: [tiempo, valor, easing del tramo que LLEGA a esa clave].
 * Valores: número, arreglo de números o color.
 */
export function keyframes(t, keys) {
  if (!keys.length) return undefined;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t < t1) {
      const [t0, v0] = keys[i - 1];
      return mix(v0, v1, toEase(e)((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

const TRANSFORM = ['x', 'y', 'z', 'scale', 'scaleX', 'scaleY', 'rotate', 'rotateX', 'rotateY', 'skewX', 'skewY'];
const PX = new Set(['width', 'height', 'left', 'top', 'right', 'bottom', 'borderRadius', 'fontSize', 'letterSpacing', 'strokeWidth', 'strokeDashoffset']);

const valueAt = (t, v) => (Array.isArray(v) && Array.isArray(v[0]) ? keyframes(t, v) : v);

/** Calcula los valores de un set de pistas en t (sin tocar el DOM). */
export function sample(t, props) {
  const out = {};
  for (const k in props) out[k] = valueAt(t, props[k]);
  return out;
}

/** Arma el string de transform desde x, y, scale, rotate, etc. */
export function transformOf(v) {
  let s = '';
  if (v.anchor) s += `translate(${v.anchor[0]}%, ${v.anchor[1]}%) `;
  // translate 2D a propósito: translate3d crea una capa de GPU cuya resolución de raster
  // depende de fotogramas anteriores, y el render deja de ser determinista.
  if (v.z !== undefined) s += `translate3d(${v.x ?? 0}px, ${v.y ?? 0}px, ${v.z}px) `;
  else if (v.x !== undefined || v.y !== undefined) s += `translate(${v.x ?? 0}px, ${v.y ?? 0}px) `;
  if (v.rotate !== undefined) s += `rotate(${v.rotate}deg) `;
  if (v.rotateX !== undefined) s += `rotateX(${v.rotateX}deg) `;
  if (v.rotateY !== undefined) s += `rotateY(${v.rotateY}deg) `;
  if (v.scale !== undefined) s += `scale(${v.scale}) `;
  if (v.scaleX !== undefined || v.scaleY !== undefined) s += `scale(${v.scaleX ?? 1}, ${v.scaleY ?? 1}) `;
  if (v.skewX !== undefined) s += `skewX(${v.skewX}deg) `;
  if (v.skewY !== undefined) s += `skewY(${v.skewY}deg) `;
  return s.trim() || 'none';
}

/**
 * track(el, t, { x: [[0, -200], [0.5, 0, 'snap']], opacity: [[0, 0], [0.2, 1]], blur: 0 })
 * Fija en el elemento TODOS los props indicados para el instante t.
 * Extras: anchor [ax, ay] en %, blur (px), clipX / clipY (0..1 revela desde izq/abajo),
 * clipXR (revela desde la derecha), clipYT (revela desde arriba), cualquier prop CSS.
 */
export function track(el, t, props) {
  if (!el) return;
  const v = sample(t, props);
  const st = el.style;
  if (TRANSFORM.some((k) => k in v) || 'anchor' in v) st.transform = transformOf(v);
  for (const k in v) {
    if (TRANSFORM.includes(k) || k === 'anchor') continue;
    const val = v[k];
    if (k === 'blur') st.filter = val > 0.01 ? `blur(${val}px)` : 'none';
    else if (k === 'clipX') st.clipPath = `inset(0 ${(1 - val) * 100}% 0 0)`;
    else if (k === 'clipXR') st.clipPath = `inset(0 0 0 ${(1 - val) * 100}%)`;
    else if (k === 'clipY') st.clipPath = `inset(${(1 - val) * 100}% 0 0 0)`;
    else if (k === 'clipYT') st.clipPath = `inset(0 0 ${(1 - val) * 100}% 0)`;
    else if (k === 'opacity') st.opacity = String(clamp(val, 0, 1));
    else if (k.startsWith('--')) st.setProperty(k, String(val));
    else if (typeof val === 'number' && PX.has(k)) st[k] = `${val}px`;
    else st[k] = String(val);
  }
  return v;
}

/** Fija estilos estáticos de golpe. */
export function set(el, styles) {
  if (!el) return;
  for (const k in styles) {
    if (k.startsWith('--')) el.style.setProperty(k, styles[k]);
    else el.style[k] = styles[k];
  }
}

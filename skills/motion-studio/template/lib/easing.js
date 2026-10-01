// Curvas de aceleración. Todas reciben p en [0,1] y devuelven [0,1] (back/elastic se pasan).
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;

export const ease = {
  linear: (p) => p,
  inQuad: (p) => p * p,
  outQuad: (p) => 1 - (1 - p) * (1 - p),
  inOutQuad: (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
  inCubic: (p) => p ** 3,
  outCubic: (p) => 1 - (1 - p) ** 3,
  inOutCubic: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  inQuart: (p) => p ** 4,
  outQuart: (p) => 1 - (1 - p) ** 4,
  inOutQuart: (p) => (p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2),
  inQuint: (p) => p ** 5,
  outQuint: (p) => 1 - (1 - p) ** 5,
  inOutQuint: (p) => (p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2),
  inExpo: (p) => (p === 0 ? 0 : 2 ** (10 * p - 10)),
  outExpo: (p) => (p === 1 ? 1 : 1 - 2 ** (-10 * p)),
  inOutExpo: (p) =>
    p === 0 ? 0 : p === 1 ? 1 : p < 0.5 ? 2 ** (20 * p - 10) / 2 : (2 - 2 ** (-20 * p + 10)) / 2,
  inCirc: (p) => 1 - Math.sqrt(1 - p * p),
  outCirc: (p) => Math.sqrt(1 - (p - 1) ** 2),
  inBack: (p) => c3 * p ** 3 - c1 * p * p,
  outBack: (p) => 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2,
  inOutBack: (p) =>
    p < 0.5 ? ((2 * p) ** 2 * ((c2 + 1) * 2 * p - c2)) / 2 : ((2 * p - 2) ** 2 * ((c2 + 1) * (p * 2 - 2) + c2) + 2) / 2,
  outElastic: (p) => (p === 0 ? 0 : p === 1 ? 1 : 2 ** (-10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1),
  // "Frenada suave" típica de motion design: entra rápido, se asienta largo.
  snap: (p) => 1 - (1 - p) ** 5,
};

/** Curva Bézier cúbica como en CSS: cubicBezier(.2,.8,.2,1). */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - p;
      if (Math.abs(err) < 1e-6) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

export const steps = (n) => (p) => Math.min(1, Math.floor(p * n) / n);

/** Acepta nombre ('outCubic'), función o undefined (lineal). */
export function toEase(e) {
  if (!e) return ease.linear;
  if (typeof e === 'function') return e;
  const f = ease[e];
  if (!f) throw new Error(`Easing desconocido: ${e}. Opciones: ${Object.keys(ease).join(', ')}`);
  return f;
}

// Resorte amortiguado en forma cerrada: valor exacto en cualquier t, sin simular
// paso a paso. Por eso se puede saltar hacia atrás o adelante sin errores.
export function spring(t, { from = 0, to = 1, stiffness = 170, damping = 26, mass = 1, velocity = 0, delay = 0 } = {}) {
  const tt = t - delay;
  if (tt <= 0) return from;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const x0 = from - to;
  const v0 = velocity;
  let x;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    x = Math.exp(-zeta * w0 * tt) * (x0 * Math.cos(wd * tt) + ((v0 + zeta * w0 * x0) / wd) * Math.sin(wd * tt));
  } else if (zeta === 1) {
    x = Math.exp(-w0 * tt) * (x0 + (v0 + w0 * x0) * tt);
  } else {
    const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const c2 = (v0 - r1 * x0) / (r2 - r1);
    const c1 = x0 - c2;
    x = c1 * Math.exp(r1 * tt) + c2 * Math.exp(r2 * tt);
  }
  return to + x;
}

/** Presets útiles. Úsalos como spring(t, {...SPRINGS.bouncy, from, to}). */
export const SPRINGS = {
  smooth: { stiffness: 120, damping: 22 },
  snappy: { stiffness: 320, damping: 30 },
  bouncy: { stiffness: 260, damping: 14 },
  heavy: { stiffness: 90, damping: 20, mass: 1.6 },
};

/** Segundos aproximados hasta que el resorte se asienta (para planear beats). */
export function springDuration({ stiffness = 170, damping = 26, mass = 1 } = {}, eps = 0.001) {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  return -Math.log(eps) / (Math.min(zeta, 1) * w0);
}

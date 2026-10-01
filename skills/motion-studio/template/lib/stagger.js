// Retrasos escalonados: el i-ésimo elemento arranca un poco después que el anterior.
export function stagger(i, { each = 0.06, from = 'start', n = 1, ease } = {}) {
  let k = i;
  if (from === 'end') k = n - 1 - i;
  else if (from === 'center') k = Math.abs(i - (n - 1) / 2);
  else if (typeof from === 'number') k = Math.abs(i - from);
  if (ease && n > 1) {
    const max = from === 'center' ? (n - 1) / 2 : n - 1;
    return ease(k / max) * max * each;
  }
  return k * each;
}

/** Escalonado en grilla 2D (distancia desde un punto). */
export function stagger2D(col, row, { each = 0.05, origin = [0, 0] } = {}) {
  return Math.hypot(col - origin[0], row - origin[1]) * each;
}

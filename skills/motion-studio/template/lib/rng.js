// Aleatoriedad con semilla. En render(t) usa rand(i, salt): no guarda estado, así
// cualquier fotograma da lo mismo sin importar el orden en que se dibuje.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash entero → [0,1). Sin estado. */
export function hash01(n, salt = 0) {
  let h = (Math.imul((n | 0) ^ 0x27d4eb2d, 0x165667b1) + Math.imul(salt | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** rand(i, 'salt', seed) → mismo número para los mismos argumentos. */
export const rand = (i, salt = '', seed = 1) => hash01(i, strHash(String(salt)) ^ seed);
export const randRange = (i, a, b, salt = '', seed = 1) => a + (b - a) * rand(i, salt, seed);

/** Ruido de valor 1D suave (continuo en x). Útil para temblor de cámara o deriva. */
export function noise1D(x, seed = 1) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(i, seed) * 2 - 1;
  const b = hash01(i + 1, seed) * 2 - 1;
  return a + (b - a) * u;
}

export function noise2D(x, y, seed = 1) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => hash01(a * 73856093 ^ b * 19349663, seed) * 2 - 1;
  const top = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
  const bot = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
  return top + (bot - top) * v;
}

/** Ruido fractal (varias octavas) para movimientos más orgánicos. */
export function fbm1D(x, { octaves = 3, seed = 1 } = {}) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise1D(x * freq, seed + o * 101);
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}

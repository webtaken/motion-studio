// Formatos de salida. Misma línea de tiempo, distinto lienzo.
export const FORMATS = {
  '9x16': { w: 1080, h: 1920 },
  '1x1': { w: 1080, h: 1080 },
  '16x9': { w: 1920, h: 1080 },
  '4x5': { w: 1080, h: 1350 },
};

export function resolveFormats(arg, config = {}) {
  const declared = config.formats?.length ? config.formats : ['9x16', '1x1', '16x9'];
  const names = !arg ? [declared[0]] : arg === 'all' ? declared : String(arg).split(',');
  for (const n of names) {
    if (!FORMATS[n]) throw new Error(`Formato desconocido "${n}". Usa: ${Object.keys(FORMATS).join(', ')} o all`);
  }
  return names.map((name) => ({ name, ...FORMATS[name] }));
}

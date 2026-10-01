// Textura: grano con semilla (rompe el banding de los degradados) y viñeta.
import { mulberry32 } from './rng.js';

/** Llamar en setup(). Devuelve {render(t)}: dibuja en un canvas (síncrono, determinista).
 *  Nada de cambiar background-image por fotograma: decodificar imágenes es asíncrono
 *  y la foto del fotograma podría salir sin grano. */
export function grain(ctx, { parent = document.getElementById('stage'), opacity = 0.07, tile = 220, variants = 6, every = 2, blend = 'overlay' } = {}) {
  const rnd = mulberry32(ctx.seed * 7919 + 17);
  const tiles = [];
  for (let v = 0; v < variants; v++) {
    const c = document.createElement('canvas');
    c.width = c.height = tile;
    const g = c.getContext('2d');
    const img = g.createImageData(tile, tile);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = Math.floor(rnd() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    tiles.push(c);
  }
  const el = document.createElement('canvas');
  el.width = ctx.w;
  el.height = ctx.h;
  Object.assign(el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '90', opacity: String(opacity), mixBlendMode: blend });
  parent.appendChild(el);
  const g = el.getContext('2d');
  const patterns = tiles.map((c) => g.createPattern(c, 'repeat'));
  let last = -1;
  return {
    el,
    render(t) {
      const k = Math.floor((t * ctx.fps) / every);
      if (k === last) return;
      last = k;
      g.save();
      g.translate((k * 37) % tile, (k * 61) % tile);
      g.fillStyle = patterns[k % variants];
      g.fillRect(-tile, -tile, ctx.w + tile, ctx.h + tile);
      g.restore();
    },
  };
}

/** Viñeta estática. */
export function vignette({ parent = document.getElementById('stage'), strength = 0.35, color = '0,0,0' } = {}) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '89',
    background: `radial-gradient(ellipse at center, rgba(${color},0) 55%, rgba(${color},${strength}) 100%)`,
  });
  parent.appendChild(el);
  return el;
}

// Cursor que hace clics reales sobre la interfaz. Cada clic registra un sfx 'click'
// en setup, así el sonido cae exacto sobre el fotograma del clic.
import { clamp, lerp } from './interp.js';
import { ease } from './easing.js';

const ARROW =
  '<svg viewBox="0 0 28 34" width="100%" height="100%" style="display:block;overflow:visible"><path d="M3 2 L3 27 L9.6 21.1 L14 31.4 L18.6 29.4 L14.3 19.4 L23.4 19.4 Z" fill="var(--cursor-fill,#fff)" stroke="var(--cursor-stroke,#111)" stroke-width="2" stroke-linejoin="round"/></svg>';

/**
 * createCursor(ctx, { points: [{t: 4, x: 300, y: 900}, {t: 4.8, x: 620, y: 1100, click: true}] })
 * x, y en px del lienzo. click: true dispara presión + onda + sfx. size en px.
 */
export function createCursor(ctx, { parent = document.getElementById('stage'), points, size = 5.4 * ctx.u, sfx = 'click', arc = 0.12, show } = {}) {
  const pts = [...points].sort((a, b) => a.t - b.t);
  const el = document.createElement('div');
  el.className = 'cursor';
  Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: `${size}px`, height: `${size * 1.2}px`, zIndex: '50' });
  el.innerHTML = ARROW;
  const ring = document.createElement('div');
  Object.assign(ring.style, {
    position: 'absolute', left: '0', top: '0', width: `${size * 1.6}px`, height: `${size * 1.6}px`,
    marginLeft: `${-size * 0.8}px`, marginTop: `${-size * 0.8}px`, borderRadius: '50%',
    border: `${Math.max(2, size * 0.08)}px solid var(--cursor-ring, var(--accent))`, opacity: '0', zIndex: '49',
  });
  parent.appendChild(ring);
  parent.appendChild(el);

  const clicks = pts.filter((p) => p.click).map((p) => p.t);
  if (sfx) for (const c of clicks) ctx.sfx(c, sfx);
  const [showFrom, showTo] = show ?? [pts[0].t - 0.3, Infinity];

  function pos(t) {
    if (t <= pts[0].t) return [pts[0].x, pts[0].y];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (t < b.t) {
        // Viaja en la segunda mitad del tramo y frena suave antes del destino.
        const travel = Math.min(b.travel ?? 0.55, b.t - a.t);
        const p = ease.inOutCubic(clamp((t - (b.t - travel)) / travel));
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const bend = Math.sin(Math.PI * p) * arc;
        return [lerp(a.x, b.x, p) - dy * bend, lerp(a.y, b.y, p) + dx * bend];
      }
    }
    const last = pts[pts.length - 1];
    return [last.x, last.y];
  }

  return {
    el,
    clicks,
    render(t) {
      const visible = t >= showFrom && t < showTo;
      el.style.visibility = ring.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) return;
      const [x, y] = pos(t);
      const fade = clamp((t - showFrom) / 0.2);
      let press = 1;
      let ringP = -1;
      for (const c of clicks) {
        const d = t - c;
        if (d >= -0.08 && d < 0.18) press = 1 - 0.18 * Math.sin(Math.PI * clamp((d + 0.08) / 0.26));
        if (d >= 0 && d < 0.45) ringP = d / 0.45;
      }
      el.style.opacity = String(fade);
      el.style.transform = `translate(${x}px, ${y}px) scale(${press})`;
      el.style.transformOrigin = '10% 6%';
      if (ringP >= 0) {
        const e = ease.outCubic(ringP);
        ring.style.opacity = String(0.9 * (1 - ringP));
        ring.style.transform = `translate(${x}px, ${y}px) scale(${0.3 + e * 0.9})`;
      } else ring.style.opacity = '0';
    },
  };
}

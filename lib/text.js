// Utilidades de tipografía: partir texto en piezas animables, contadores, tipeo.
import { progress } from './interp.js';

/**
 * Parte el texto de un elemento en spans. Llamar en setup().
 * by: 'chars' | 'words'. mask: envuelve cada pieza en un contenedor con overflow
 * oculto (para revelar desde abajo). Devuelve los spans animables.
 */
export function splitText(el, { by = 'chars', mask = false } = {}) {
  const text = el.textContent;
  el.textContent = '';
  el.setAttribute('aria-label', text);
  const pieces = [];
  const words = text.split(/(\s+)/);
  for (const w of words) {
    if (!w) continue;
    if (/^\s+$/.test(w)) {
      el.appendChild(document.createTextNode(w));
      continue;
    }
    const wordWrap = document.createElement('span');
    wordWrap.style.display = 'inline-block';
    wordWrap.style.whiteSpace = 'nowrap';
    const units = by === 'words' ? [w] : [...w];
    for (const u of units) {
      const span = document.createElement('span');
      span.textContent = u;
      span.style.display = 'inline-block';
      span.setAttribute('aria-hidden', 'true');
      if (mask) {
        const m = document.createElement('span');
        m.style.display = 'inline-block';
        m.style.overflow = 'hidden';
        m.style.verticalAlign = 'bottom';
        // Holgura arriba (tildes) y abajo (descendentes) sin mover la línea.
        m.style.padding = '0.22em 0.04em 0.1em';
        m.style.margin = '-0.22em -0.04em -0.1em';
        m.appendChild(span);
        wordWrap.appendChild(m);
      } else wordWrap.appendChild(span);
      pieces.push(span);
    }
    el.appendChild(wordWrap);
  }
  return pieces;
}

/** Número que cuenta: countUp(t, {start:2, end:3.2, to:900, suffix:' fps'}). */
export function countUp(t, { start = 0, end = 1, from = 0, to = 100, decimals = 0, ease = 'outCubic', locale = 'es-ES', prefix = '', suffix = '' } = {}) {
  const v = from + (to - from) * progress(t, start, end, ease);
  const s = v.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${prefix}${s}${suffix}`;
}

/** Texto que se escribe solo: typewriter('hola', t, {start: 1, cps: 18}). */
export function typewriter(text, t, { start = 0, cps = 18 } = {}) {
  const chars = [...text];
  const n = Math.max(0, Math.min(chars.length, Math.floor((t - start) * cps)));
  return chars.slice(0, n).join('');
}

/** Cuántos caracteres lleva escritos (útil para registrar sfx de tecleo en setup). */
export function typingTimes(text, { start = 0, cps = 18 } = {}) {
  return [...text].map((_, i) => start + (i + 1) / cps);
}

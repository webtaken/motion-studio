// Movimientos de cámara deterministas: temblor, deriva de mano y golpes al beat.
import { noise1D } from './rng.js';
import { clamp } from './interp.js';

/** Temblor que decae: shake(t, {start: 4, amp: 18, dur: 0.4}) → {x, y, rotate}. */
export function shake(t, { start = 0, dur = 0.4, amp = 14, freq = 22, seed = 7 } = {}) {
  const d = t - start;
  if (d < 0 || d > dur) return { x: 0, y: 0, rotate: 0 };
  const k = (1 - d / dur) ** 2;
  return {
    x: noise1D(d * freq, seed) * amp * k,
    y: noise1D(d * freq, seed + 13) * amp * k,
    rotate: noise1D(d * freq, seed + 29) * amp * 0.05 * k,
  };
}

/** Deriva suave tipo cámara en mano. */
export function handheld(t, { amp = 6, freq = 0.35, seed = 3 } = {}) {
  return {
    x: noise1D(t * freq, seed) * amp,
    y: noise1D(t * freq, seed + 5) * amp,
    rotate: noise1D(t * freq * 0.7, seed + 9) * amp * 0.03,
  };
}

/** Golpe de escala sobre un beat: punch(t, ctx.beat(8)) → 1..1+amount. */
export function punch(t, at, { amount = 0.045, dur = 0.32 } = {}) {
  const d = t - at;
  if (d < 0 || d > dur) return 1;
  const p = clamp(d / dur);
  return 1 + amount * (1 - p) ** 3;
}

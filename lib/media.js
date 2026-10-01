// Clips embebidos (<video>) sincronizados con t. Chromium de Playwright no decodifica
// H.264/AAC: convierte los clips a WebM (VP9) o a secuencia de imágenes.
//   ffmpeg -i clip.mp4 -c:v libvpx-vp9 -b:v 0 -crf 30 -an clip.webm
export function seekMedia(el, localT) {
  if (!el) return Promise.resolve();
  const target = Math.max(0, Math.min(localT, (el.duration || Infinity) - 0.001));
  if (Math.abs(el.currentTime - target) < 0.0005 && el.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener('seeked', done);
      resolve();
    };
    el.addEventListener('seeked', done);
    el.currentTime = target;
  });
}

/** Espera a que un <video> tenga datos. Llamar en setup(). */
export function loadMedia(el) {
  el.muted = true;
  el.preload = 'auto';
  if (el.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    el.addEventListener('loadeddata', () => resolve(), { once: true });
    el.addEventListener('error', () => reject(new Error(`No pude cargar ${el.currentSrc || el.src}`)), { once: true });
    el.load();
  });
}

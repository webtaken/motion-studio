// Inyectado SOLO al renderizar (antes que cualquier script de la página).
// Hace el render determinista y anota cada regla rota en window.__violations.
(() => {
  const clock = { t: 0 };
  const guard = { ready: false, violations: [] };
  window.__clock = clock;
  window.__guard = guard;
  window.__violations = guard.violations;

  const flag = (type, hint) => {
    const v = guard.violations.find((x) => x.type === type);
    if (v) v.count++;
    else guard.violations.push({ type, hint, count: 1 });
  };

  // Math.random → misma secuencia siempre (mulberry32 con semilla fija).
  let s = 0x9e3779b9;
  Math.random = () => {
    flag('Math.random', 'usa ctx.rng() o rand(i, salt) de /lib/rng.js');
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  // Reloj virtual: performance.now y Date siguen a seek(t), no al reloj real.
  const realNow = performance.now.bind(performance);
  window.__realNow = realNow;
  performance.now = () => clock.t * 1000;
  const RealDate = Date;
  const EPOCH = RealDate.UTC(2026, 0, 1);
  class VirtualDate extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(EPOCH + clock.t * 1000);
      else super(...a);
    }
    static now() {
      return EPOCH + clock.t * 1000;
    }
  }
  window.Date = VirtualDate;

  // Temporizadores: en render no hay "después". Antes de __ready se permiten
  // (cargas de librerías); después se ignoran y se reportan.
  const realSetTimeout = window.setTimeout.bind(window);
  const realRAF = window.requestAnimationFrame.bind(window);
  window.__realRAF = realRAF;
  window.__realSetTimeout = realSetTimeout;
  window.setTimeout = (fn, ms, ...rest) => {
    if (!guard.ready) return realSetTimeout(fn, ms, ...rest);
    flag('setTimeout', 'todo lo animado debe salir de render(t)');
    return 0;
  };
  window.setInterval = () => {
    if (guard.ready) flag('setInterval', 'todo lo animado debe salir de render(t)');
    return 0;
  };
  window.requestAnimationFrame = () => {
    if (guard.ready) flag('requestAnimationFrame', 'el motor llama a render(t); no uses rAF');
    return 0;
  };

  // Sin transiciones CSS: un cambio de estilo debe verse en el mismo fotograma.
  const css = '*,*::before,*::after{transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';
  const inject = () => {
    const st = document.createElement('style');
    st.setAttribute('data-guard', '');
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject, { once: true });
  else inject();
})();

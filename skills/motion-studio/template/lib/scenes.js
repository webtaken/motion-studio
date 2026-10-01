// Escenas con tiempo local. Llamar scenes() en setup(); scenes.render(t, {...}) en render().
// Fuera de su ventana, cada escena queda oculta; dentro, su función recibe el tiempo local.
export function scenes(ctx, list) {
  const items = list.map((s) => {
    const el = typeof s.el === 'string' ? document.querySelector(s.el) : s.el ?? document.getElementById(s.id);
    if (!el && s.el !== null) console.warn(`escena "${s.id}": no encontré su elemento`);
    return { ...s, el, dur: s.end - s.start };
  });
  for (const s of items) {
    if (s.sfxIn) ctx.sfx(s.start, s.sfxIn, s.sfxInOpts);
    if (s.sfxOut) ctx.sfx(s.end, s.sfxOut, s.sfxOutOpts);
  }
  const isOn = (s, t) => t >= s.start && (t < s.end || (s.end >= ctx.duration && t <= s.end));
  return {
    items,
    get: (id) => items.find((s) => s.id === id),
    /** Tiempo local de una escena (puede ser negativo o pasar su duración). */
    local: (t, id) => t - items.find((s) => s.id === id).start,
    active: (t) => items.filter((s) => isOn(s, t)).map((s) => s.id),
    render(t, fns = {}) {
      for (const s of items) {
        const on = isOn(s, t);
        // display:none oculta TODO el subárbol (visibility no: un hijo con
        // visibility:visible se seguiría viendo y el render dependería del orden).
        if (s.el) s.el.style.display = on ? '' : 'none';
        if (on && fns[s.id]) fns[s.id](t - s.start, s);
      }
    },
  };
}

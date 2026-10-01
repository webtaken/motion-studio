# Motor: referencia rápida

## Contrato de una composición

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/lib/base.css">   <!-- fuentes locales, --w --h --u, zonas seguras -->
  <style>/* layout en CSS con calc(var(--u) * N) */</style>
</head>
<body>
<div id="stage">
  <section id="gancho" class="layer">…</section>
</div>
<script type="module">
import { defineVideo, scenes, spring, SPRINGS, track, keyframes } from '/lib/motion.js';

let S;
defineVideo({
  // config: './video.json' (por defecto)
  async setup(ctx) {
    // Una vez: arma el DOM, parte textos, precarga, registra sfx y escenas.
    S = scenes(ctx, [{ id: 'gancho', start: 0, end: ctx.beat(4), sfxIn: 'whoosh' }]);
    ctx.sfx(ctx.beat(2), 'pop');
  },
  render(t, ctx) {
    // Pura: fija TODO lo animado a partir de t.
    S.render(t, {
      gancho(lt) {
        track(ctx.$('#titulo'), lt, { y: [[0, 80], [0.4, 0, 'snap']], clipY: [[0, 0], [0.3, 1]] });
      },
    });
  },
});
</script>
</body>
</html>
```

El motor expone en la página:

| Global | Qué es |
|---|---|
| `window.__ready` | Promesa: config, beats, marca, `setup`, fuentes, imágenes y `render(0)` listos |
| `window.seek(t)` | Pinta el fotograma `t` (congela animaciones CSS en `t` y llama a `render`) |
| `window.__meta` | `{duration, fps, bpm, seed, w, h, fmt, beats, sfx, music, sections}` |

Parámetros de URL: `?fmt=9x16|1x1|16x9|4x5`, `w`, `h`, `render=1` (lo pone el renderizador),
`safe=1` (marca zonas seguras), `t=3.2` (abre quieto en ese instante).

## `video.json`

```json
{
  "title": "Lanzamiento",
  "duration": 20, "fps": 30, "bpm": 120, "seed": 9137,
  "formats": ["9x16", "1x1", "16x9"],
  "brand": "mimarca",
  "music": { "mode": "compose", "style": "house", "key": "Am" },
  "beats": "./beats.json",
  "sections": [{ "start": 0, "end": 3, "energy": "hook" }],
  "copy": { "hook": "…", "features": ["…"], "metric": { "value": 100 }, "cta": "…", "url": "…" }
}
```

- `music.mode`: `compose` (se compone sola), `track` (con `file`), `none`.
- `beats` solo existe si usas pista propia (`npm run beats` lo agrega).
- `sections.energy` guía el arreglo musical: `hook intro build drop break outro`.
- `copy` es libre: la composición lo lee en `ctx.config.copy`.

## `ctx`

| Campo | Uso |
|---|---|
| `w h u` | lienzo en px; `u` = 1 % del lado corto (usa `n * u` para tamaños) |
| `fmt portrait landscape square` | formato actual |
| `duration fps bpm seed config brand` | datos del video |
| `beat(n)` `bar(n)` | segundo del beat `n` (acepta fracciones) / del compás `n` |
| `beats` | lista de beats en segundos |
| `sfx(t, tipo, {gain, pan, anchor})` | registra un sonido (solo en `setup`) |
| `rand(i, 'sal')` `rng('sal')` | aleatorio con semilla: sin estado / generador |
| `pick({'9x16': a, '16x9': b, default: c})` | valor según formato u orientación |
| `frame(t)` `$(sel)` `$$(sel)` | número de fotograma, querySelector(All) |

## Ayudantes (`/lib/motion.js`)

**Tiempo e interpolación**
- `progress(t, a, b, ease)` 0→1 entre `a` y `b`.
- `remap(t, [a, b], [c, d], ease)`.
- `keyframes(t, [[t0, v0], [t1, v1, ease], …])`: números, arreglos o colores (mezcla OKLab).
- `track(el, t, { x, y, scale, scaleX, scaleY, rotate, skewX, opacity, blur, clipX, clipY, clipXR, clipYT, anchor, …css })`:
  cada prop puede ser fija o una lista de keyframes. `clipX`/`clipY` revelan de 0 a 1.
- `set(el, estilos)`, `clamp`, `lerp`, `within`, `mixColor`.

**Curvas**: `ease.outCubic`, `inOutExpo`, `outBack`, `outElastic`, `snap` (frenada suave)…,
`cubicBezier(x1, y1, x2, y2)`, `steps(n)`. Donde se pide `ease` puedes pasar el nombre.

**Física**: `spring(t, { from, to, stiffness, damping, mass, velocity, delay })` en forma
cerrada (se puede saltar en el tiempo). Presets `SPRINGS.smooth | snappy | bouncy | heavy`.

**Texto**: `splitText(el, { by: 'chars' | 'words', mask: true })` (en setup),
`countUp(t, { start, end, from, to, decimals, prefix, suffix })`, `typewriter(texto, t, { start, cps })`.

**Escenas**: `scenes(ctx, [{ id, start, end, el?, sfxIn?, sfxOut? }])` → `.render(t, { id(lt, escena) })`.
Fuera de su ventana la escena queda en `display: none`.

**Cursor**: `createCursor(ctx, { points: [{ t, x, y, click, travel }], show: [desde, hasta] })`
→ `.render(t)`. Cada `click` registra un sfx `click` y dibuja la onda.

**Cámara**: `shake(t, { start, dur, amp })`, `handheld(t, { amp, freq })`, `punch(t, en, { amount })`.

**Textura**: `grain(ctx, { opacity })` → `.render(t)` (canvas, determinista), `vignette()`.

**Escalonados**: `stagger(i, { each, from: 'start' | 'center' | 'end' | n, n })`, `stagger2D(col, fila, { each, origin })`.

**Medios**: `loadMedia(video)` en setup y `await seekMedia(video, tLocal)` en render
(devuelve promesa; `seek` la espera). Chromium no decodifica H.264: usa WebM.

**Ruido**: `noise1D(x, seed)`, `noise2D`, `fbm1D`, `hash01`, `mulberry32`.

**Marca**: con `"brand": "x"` en `video.json`, `ctx.brand` trae `assets/x/brand.json` y
quedan definidas `--brand-bg --brand-text --brand-accent --brand-font-title --brand-font-ui`.
`ctx.brand.asset('shots/desktop.png')` da la ruta servible.

## Renderizado

- Segmentos de 2 s en `out/<slug>/.seg/`, repartidos entre workers. `--from/--to` solo
  rehace los segmentos que tocan ese rango y reutiliza el resto.
- Captura JPEG q92 por defecto (`--img png` para degradados delicados).
- Salida H.264 High, yuv420p, bt709, `+faststart`, AAC 48 kHz. Se verifica con ffprobe.
- Determinismo: `npm run check` compara hashes de fotogramas en orden, desordenados y en
  otra pestaña.

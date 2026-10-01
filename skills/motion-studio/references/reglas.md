<!-- Generado por scripts/sync-skill.mjs desde AGENTS.md. No editar aquí. -->

# Reglas del estudio de motion

Este estudio hace videos de motion graphics con código. Claude (o cualquier agente) no
"hace" el video: **escribe el programa que lo dibuja**. Cada video es una página HTML con
`window.seek(t)`, una función que pinta el fotograma exacto del segundo `t`. Un Chromium
sin ventana fotografía cada fotograma y ffmpeg los une en un MP4.

## Estructura

```
videos/<slug>/index.html   la composición (setup + render)
videos/<slug>/video.json   duración, fps, bpm, semilla, formatos, música, secciones, textos
videos/_plantilla/         punto de partida "showreel" (npm run new -- <slug>)
videos/_producto/          punto de partida "producto" con marca real (npm run new -- <slug> --marca <m>)
videos/demo/               ejemplo completo
lib/                       motor (motion.js y ayudantes). No lo edites para un solo video.
assets/<marca>/            marca capturada: brand.json, shots/, logos/, fonts/
assets/_fonts/ assets/_sfx/  fuentes descargadas · sonidos propios que reemplazan a los sintetizados
refs/<nombre>/             análisis de videos de referencia
docs/                      guía de estilo, lista de tomas, referencia del motor
prompts/                   los prompts de la guía, listos para copiar
out/<slug>/                renders, hojas de contacto, mezcla de audio (no se versiona)
```

## Render

- Cada video es una función del tiempo: `window.seek(t)` pinta el fotograma `t`.
  Se escribe con `defineVideo({ setup, render })` de `/lib/motion.js`.
- `render(t, ctx)` es **pura**: fija TODO lo que anima a partir de `t`. Si un elemento se
  mueve en algún momento, `render` le fija su estado en todos los `t` de su escena.
- Prohibido al renderizar: transiciones CSS, `setTimeout`, `setInterval`,
  `requestAnimationFrame`, `Date.now()`, `performance.now()`. El guard los bloquea y
  `npm run check` los reporta.
- Nunca `Math.random`: usa `ctx.rand(i, 'sal')` o `ctx.rng('sal')`. El render sale igual siempre.
- Nada de red al renderizar: fuentes, imágenes y clips viven en el estudio
  (`npm run fonts`, `npm run capture`). Fuentes de Google al vuelo = fotogramas con fuente equivocada.
- No cambies `src` ni `background-image` por fotograma (decodificar es asíncrono y el
  fotograma puede salir sin la imagen). Precarga en `setup` y muestra/oculta.
- Traslaciones 2D (`track()` ya lo hace): nada de `translate3d` ni `will-change`, que crean
  capas de GPU cuyo raster depende de los fotogramas anteriores.
- Los sonidos se registran **solo en `setup`** con `ctx.sfx(t, tipo)`. Así audio e imagen
  salen del mismo reloj.
- Exporta H.264, yuv420p, bt709 (el render ya lo hace).

## Estilo

- Prohibido: título centrado sobre degradado, todo entrando con fundido, etiquetas en
  las esquinas, brillos en la interfaz, explosiones de partículas.
- Una fuente de títulos, una de interfaz. Un solo color de acento.
- Cada 2 a 4 segundos pasa algo nuevo en pantalla.
- El fotograma de cada golpe (impacto, corte, clic) ya muestra el contenido: nada que
  aparezca "un rato después" del sonido.
- Con marca: usa la interfaz, el logo, los colores y las fuentes reales
  (`assets/<marca>/`). Nunca redibujes la interfaz de memoria: recorta y anima la real.
- 9:16 respeta las zonas seguras (`.safe`, `--safe-*`): arriba 12 %, abajo 20 %, derecha 14 %.
- Tamaño mínimo de texto: debe leerse en la hoja `--mobile` (360 px de ancho).

## Sonido

- Si no hay pista, la música se compone en código (`video.json → music.mode: "compose"`,
  estilos `minimal | house | lofi | cinematic`). Golpes sobre el beat: `ctx.beat(n)`.
- Con pista propia: `npm run beats -- <slug> pista.mp3` y `ctx.beat(n)` sigue sus beats reales.
- Tipos de sfx: `click tap tick pop whoosh swipe riser impact boom ding type glitch`.
  `riser` termina en `t` (usa `{ anchor: 'end' }`), `whoosh` pica en `t`.

## Antes de mostrar nada

1. `npm run check -- <slug>` sin errores (reglas + determinismo).
2. Renderiza una hoja con un fotograma por beat (`npm run sheet -- <slug>`) y **MÍRALA**.
   Mira también `--mobile` (lectura en celular) y `--sfx` (sincronía).
3. Ponle nota del 1 al 10 a: gancho en los primeros 2 s, lectura en celular, calidad del
   movimiento, variedad, fidelidad a la marca, sincronía con el audio
   (rúbrica en `docs/_plantillas/critica.md`). Anota cada vuelta en `videos/<slug>/critica.md`.
4. Corrige los 3 peores problemas. Revisa solo esos segundos (`--from/--to`). Repite hasta
   que todo tenga 8 o más (máximo 5 vueltas; después pregunta).
5. Solo entonces haz el render completo: `npm run render -- <slug> --format all`.

## Comandos

```bash
npm run doctor                         # ¿está todo instalado?
npm run new -- <slug> [--marca m]      # video nuevo desde plantilla
npm run dev                            # preview con scrubber en http://localhost:4321
npm run check -- <slug>                # reglas + determinismo
npm run sheet -- <slug> [--mobile|--sfx|--fps 2|--times 1,2]   # hojas de contacto
npm run still -- <slug> --t 2.5        # un fotograma en PNG
npm run render -- <slug> [-f all] [--from 4 --to 7] [--scale 0.5]
npm run capture -- <url> <marca>       # capturas, logo, colores, fuentes reales
npm run ref -- refs/video.mp4          # estudia una referencia
npm run music -- <slug> [--style house]   # compone la música
npm run beats -- <slug> pista.mp3      # beats de una pista propia
npm run fonts -- "Inter" 400,700       # fuente de Google Fonts a local
```

## Convenciones

- Slug en kebab-case sin acentos (`lanzamiento-app`). Un video = una carpeta en `videos/`.
- No toques otros videos ni `lib/` salvo que te lo pidan. Un ayudante que sirve a un solo
  video vive en su `index.html`.
- Llaves de APIs (voz, imágenes) en `.env`; nunca en un prompt ni en el código.
- Referencia completa del motor: `docs/motor.md`. Problemas comunes: `docs/problemas.md`.

---
name: motion-studio
description: >-
  Estudio de motion graphics con código: monta desde cero (o usa) un estudio donde cada video es un
  HTML con window.seek(t) que Playwright + ffmpeg renderizan a MP4, con música compuesta en código y
  sfx sobre el beat. Úsala para hacer videos animados, motion graphics, video de lanzamiento o promo de
  un producto desde su URL (capturas, logo, colores y fuentes reales), reels/TikTok 9:16, 1:1 y 16:9,
  showreels, tipografía cinética, copiar el estilo de un video de referencia, hojas de contacto y
  autocrítica de fotogramas. Use for animated video, product launch/promo video, motion design,
  HTML-to-MP4 rendering, social video, kinetic typography, "make a motion graphics video".
---

# Motion Studio

Claude no hace el video: **escribe el programa que lo dibuja**. Cada video es una página
HTML con `window.seek(t)` que pinta el fotograma exacto del segundo `t`. Chromium sin
ventana fotografía cada fotograma, ffmpeg los une en MP4, y Claude **mira sus propios
fotogramas** (hojas de contacto) y corrige antes del render final.

## 0. Encuentra o monta el estudio

Busca un `package.json` con la clave `"motionStudio"` en la carpeta actual o sus padres.

- **Existe** → trabaja ahí. Si su `motionStudio.version` es menor que la de
  `template/.motion-studio-manifest.json` de esta skill, ofrece actualizar el motor con
  `--update` (respeta videos, marcas y referencias; respalda lo modificado).
- **No existe** → pregunta dónde crearlo (por defecto `./motion-studio`) y corre:

```bash
node <carpeta-de-esta-skill>/scripts/init.mjs <destino>
```

`<carpeta-de-esta-skill>` es donde está este SKILL.md (Claude Code lo indica como "Base
directory"; en otros agentes suele ser `~/.agents/skills/motion-studio` o
`~/.claude/skills/motion-studio`). Sin la skill en disco:
`git clone --depth 1 https://github.com/webtaken/motion-studio /tmp/ms && node /tmp/ms/skills/motion-studio/scripts/init.mjs <destino>`.

`init.mjs` copia la plantilla, instala Playwright + Chromium, prepara Python (numpy) para el
audio, inicializa git, corre `npm run doctor` y hace un render de prueba de 2 s. Opciones:
`--force` (carpeta no vacía), `--update`, `--skip-python`, `--with-librosa`, `--no-smoke`.

Requisitos: Node ≥ 22, ffmpeg con libx264, Python 3 (opcional, para música y sfx).
Si algo falta, `npm run doctor` dice el comando exacto para el sistema operativo.

## 1. Lee las reglas del estudio

Dentro del estudio, `AGENTS.md` (y `CLAUDE.md`) mandan. Resumen:

- `render(t, ctx)` es **pura**: fija todo lo animado a partir de `t`. Nada de transiciones
  CSS, timers, `requestAnimationFrame`, reloj real ni `Math.random` (usa `ctx.rand`).
- Sin red al renderizar: fuentes, capturas y logos viven en el estudio.
- Sfx solo en `setup` con `ctx.sfx(t, tipo)`; tiempos con `ctx.beat(n)`.
- Prohibido: título centrado sobre degradado, todo con fundido, etiquetas en esquinas,
  brillos en la interfaz, explosiones de partículas. Una fuente de títulos, una de
  interfaz, un solo acento. Algo nuevo cada 2–4 s.
- Con marca: interfaz, logo, colores y fuentes **reales**. Nunca redibujar de memoria.

Detalle: [references/reglas.md](references/reglas.md) · API del motor:
[references/pipeline.md](references/pipeline.md) · Audio: [references/audio.md](references/audio.md).

## 2. Elige el flujo

Los prompts originales están en [references/prompts.md](references/prompts.md).

**A · Prueba (showreel de una línea).** Comprueba que todo renderiza.
`npm run new -- showreel --dur 15` → escribe la composición → bucle de revisión (paso 3).
Ejemplo terminado en `videos/demo/`.

**B · Producto desde su URL.**
1. `npm run capture -- <url> <marca>` → mira `assets/<marca>/brand-sheet.png` y **dile al
   usuario qué encontraste** (colores, fuentes, logo, secciones) antes de animar.
2. `npm run new -- <slug> --marca <marca> --dur 20` (parte de `videos/_producto`: gancho →
   la interfaz real se arma pieza por pieza → 3 funciones con cursor y clic real →
   métrica → logo + CTA).
3. Llena `copy` en `video.json`; ajusta la composición a la marca.
4. 9:16 primero; luego 1:1 y 16:9 de la misma línea de tiempo.

**C · Con referencia.**
1. `npm run ref -- refs/<video>.mp4` → mira `refs/<nombre>/sheet-*.png` y `cuts.json`.
2. Escribe `docs/guia_estilo.md` y `docs/lista_tomas.md` (plantillas en `docs/_plantillas/`).
   Toma la gramática de la referencia, nunca su contenido, logos ni personajes.
3. **Muéstralos y espera el OK antes de escribir código.**

**D · Autocrítica** de un video existente: paso 3 directo.

## 3. Bucle obligatorio antes de mostrar nada

```bash
npm run check -- <slug>              # reglas + determinismo; debe pasar
npm run sheet -- <slug>              # gancho + un fotograma por beat
npm run sheet -- <slug> --mobile     # 360 px de ancho: ¿se lee en un celular?
npm run sheet -- <slug> --sfx        # cada sonido: ¿cae en el fotograma del cambio?
```

1. **Abre los PNG** (`out/<slug>/sheet-*.png`) y míralos de verdad.
2. Nota 1–10 en: gancho (0–2 s), lectura en celular, movimiento, variedad, marca, audio.
   Rúbrica: [references/critica.md](references/critica.md). Anota la vuelta en
   `videos/<slug>/critica.md` con tiempos exactos.
3. Corrige los 3 peores. Revisa solo lo tocado: `npm run sheet -- <slug> --from 4 --to 7`.
4. Repite hasta que todo tenga ≥ 8. Máximo 5 vueltas; después muestra y pregunta.
5. Recién ahí: `npm run render -- <slug> --format all`.

Errores típicos que la hoja delata: el fotograma de un golpe vacío (usa pre-roll), texto
que se desliza sin frenar, beats donde no pasa nada, texto dentro de zonas inseguras,
salto al final del loop.

## 4. Gasta el esfuerzo donde importa

- Lista de tomas antes del código; la mayor parte del esfuerzo en los primeros 2 s.
- Itera con hojas y borradores (`npm run render -- <slug> --scale 0.5`), nunca con renders completos.
- Re-render parcial: `--from/--to` rehace solo los segmentos de 2 s afectados.
- Esfuerzo del modelo: medium para arreglos, xhigh por defecto, max para lanzamientos.
- Cada vuelta consume uso: cuando ya sirve para vender, para y pregunta.

## 5. Entrega

Reporta las rutas (`out/<slug>/9x16.mp4`, `1x1.mp4`, `16x9.mp4`), duración, tamaño, si
lleva audio y las notas finales de la crítica. El render ya verifica con ffprobe (H.264,
yuv420p, bt709, fps y número de fotogramas). Para revisar en vivo: `npm run dev`.

Problemas comunes y arreglos: [references/problemas.md](references/problemas.md).

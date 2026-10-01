# Motion Studio

**Animaciones de producto con Claude, escritas en código.** Claude no hace el video:
escribe el programa que lo dibuja. Cada video es una página HTML con `window.seek(t)` que
pinta el fotograma exacto de cada instante; Chromium sin ventana fotografía cada
fotograma y ffmpeg los une en un MP4 9:16, 1:1 y 16:9. La música se compone en código y
los efectos caen sobre el beat. Antes de renderizar, Claude mira sus propios fotogramas en
hojas de contacto y se corrige.

![Demo: showreel de 15 s hecho con el estudio](docs/demo.gif)

> Basado en la **Guía MOTION** de @saulautomatiza: el setup y
> los prompts para que Claude arme el video de lanzamiento de tu producto con tu logo, tus
> capturas y música, sin que se note hecho con IA.

## Instalar

### Como skill (Claude Code, Codex, Cursor, Gemini CLI, OpenCode…)

```bash
npx skills add webtaken/motion-studio
```

Luego pídele al agente: *"monta el estudio de motion en ./motion-studio"*. La skill corre
`init.mjs`, que copia el estudio, instala Playwright + Chromium, prepara Python para el
audio, inicializa git y hace un render de prueba.

### Como plugin de Claude Code

```
/plugin marketplace add webtaken/motion-studio
/plugin install motion-studio@motion-studio
```

### Clonando este repo

```bash
git clone https://github.com/webtaken/motion-studio && cd motion-studio
npm install && npx playwright install chromium
uv venv .venv && uv pip install --python .venv/bin/python -r audio/requirements.txt
#   (sin uv: python3 -m venv .venv && .venv/bin/pip install -r audio/requirements.txt)
npm run doctor
```

**Requisitos:** Node ≥ 22, ffmpeg con libx264, Python 3 con numpy (para música y sfx;
librosa es opcional). `npm run doctor` revisa todo y dice cómo arreglar lo que falte.

## Usar

Abre Claude Code en la carpeta del estudio (`claude --model claude-opus-5-5`, esfuerzo
**xhigh**; **max** para lanzamientos). Claude lee `CLAUDE.md` / `AGENTS.md` en cada sesión.

| Paso | Qué pedir | Prompt |
|---|---|---|
| 1 | Probar el setup con el showreel de una línea | [`prompts/01-prueba.md`](prompts/01-prueba.md) |
| 2 | Video de tu producto desde su URL (capturas, logo, colores y fuentes reales) | [`prompts/02-producto.md`](prompts/02-producto.md) |
| 3 | Copiar la gramática de un video de referencia | [`prompts/03-referencia.md`](prompts/03-referencia.md) |
| 4 | Autocrítica hasta sacar 8 en todo | [`prompts/04-autocritica.md`](prompts/04-autocritica.md) |

### Comandos

```bash
npm run doctor                          # ¿está todo instalado?
npm run new -- mi-video [--marca m]     # video nuevo (plantilla showreel o producto)
npm run dev                             # preview con scrubber, beats y sfx en localhost:4321
npm run check -- mi-video               # reglas + determinismo
npm run sheet -- mi-video               # hoja de contactos: gancho + un fotograma por beat
npm run sheet -- mi-video --mobile      # ¿se lee a 360 px?
npm run sheet -- mi-video --sfx         # ¿cada sonido cae en su fotograma?
npm run render -- mi-video -f all       # MP4 9:16, 1:1 y 16:9 en out/mi-video/
npm run render -- mi-video --from 4 --to 7   # re-render solo de esos segundos
npm run capture -- https://tuproducto.com marca   # marca real → assets/marca/
npm run ref -- refs/lanzamiento.mp4     # estudia una referencia (fotogramas, cortes, paleta)
npm run music -- mi-video --style house # música en código (minimal, house, lofi, cinematic)
npm run beats -- mi-video pista.mp3     # o tu pista, con sus beats reales
npm run fonts -- "Inter" 400,700        # fuentes de Google Fonts a local
```

## Cómo funciona

```
videos/<slug>/index.html ──defineVideo({ setup, render })──▶ window.seek(t)
        │                                                        │
        │   Chromium sin ventana (Playwright): seek(t) → foto    │  segmentos de 2 s,
        ▼                                                        ▼  varios workers
   video.json ─▶ audio/compose.py (música) ─▶ audio/mix.py ─▶ ffmpeg ─▶ out/<slug>/<formato>.mp4
                 ctx.sfx(t, tipo) ───────────────┘          H.264 · yuv420p · bt709 · AAC
```

- **Determinista**: en render se bloquean timers, `requestAnimationFrame`, reloj real,
  transiciones CSS y red; `Math.random` queda con semilla. `npm run check` compara
  fotogramas dibujados en distinto orden y en otra pestaña.
- **Re-render parcial**: el video se arma en segmentos de 2 s; `--from/--to` rehace solo
  los que cambiaron.
- **Audio sincronizado por construcción**: los sonidos se registran en `setup` con el
  mismo `ctx.beat(n)` que mueve la imagen.
- **Una línea de tiempo, tres formatos**: la composición recibe `?w=&h=` y adapta el
  layout con `ctx.pick()` y unidades `--u`.

Referencia completa: [`docs/motor.md`](docs/motor.md) · Audio: [`docs/audio.md`](docs/audio.md)
· Problemas comunes: [`docs/problemas.md`](docs/problemas.md).

## Estructura

```
AGENTS.md, CLAUDE.md     reglas del estudio para el agente
lib/                     motor del navegador (motion.js, easing, spring, escenas, cursor…)
scripts/                 render, sheet, check, capture, ref, dev (preview), doctor…
audio/                   síntesis de música y sfx, mezcla, detección de beats (numpy)
videos/_plantilla/       punto de partida "showreel"
videos/_producto/        punto de partida "producto" (5 beats con marca real)
videos/demo/             el showreel del GIF de arriba
prompts/  docs/          prompts de la guía, referencia, plantillas de estilo y crítica
skills/motion-studio/    la skill instalable (SKILL.md + plantilla + init.mjs)
.claude-plugin/          marketplace y manifiesto del plugin de Claude Code
```

## Desarrollar la skill

El estudio en la raíz es la fuente de verdad. Después de cambiar el motor, los docs o las
plantillas:

```bash
npm run sync-skill            # copia el motor a skills/motion-studio/template y regenera references/
npm run sync-skill -- --check # lo que corre la CI
```

Sube la versión en `package.json` (`version` y `motionStudio.version`) para que los
estudios existentes puedan actualizarse con `init.mjs --update`.

## Apoyar el proyecto

Si el estudio te ahorra horas, puedes invitarme un café: [buymeacoffee.com/sauldev](https://buymeacoffee.com/sauldev).

## Licencia

MIT. Usa logos, fuentes y capturas solo de marcas propias o con permiso.

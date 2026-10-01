# Problemas comunes

| Síntoma | Causa | Arreglo |
|---|---|---|
| `check`: "cambia según el orden de dibujo" | `render` no fija algo que otra parte del tiempo modifica, o un hijo con `visibility: visible` dentro de una escena oculta | Fija todos los props animados en toda la ventana de la escena; usa `scenes()` (oculta con `display: none`) |
| `check`: "cambia entre pestañas" | estado guardado fuera de `render` (contadores, `+=`), aleatoriedad sin semilla | Calcula todo desde `t`; `ctx.rand(i, 'sal')` |
| Fotogramas sueltos sin imagen o sin grano | Cambiar `src` / `background-image` por fotograma (decodificación asíncrona) | Precarga en `setup`, alterna visibilidad; dibuja en canvas |
| Texto con la fuente equivocada en algunos fotogramas | Fuente remota o no declarada | `npm run fonts -- "Familia"` y enlaza su `fonts.css`; `check` avisa |
| "red bloqueada" en el render | `<img src="https://…">`, CSS o fuentes de internet | Guarda el recurso en `assets/` |
| El sonido llega antes o después del golpe | El sfx se registró a un `t` distinto del cambio visual | Usa el mismo `ctx.beat(n)` para ambos; revisa con `npm run sheet -- <slug> --sfx` |
| El golpe suena y el fotograma está vacío | La animación arranca en el golpe desde 0 | Pre-roll: `spring(lt + 0.08, …)` o arranca un poco antes del beat |
| Clip `<video>` negro | Chromium de Playwright no decodifica H.264/AAC | `ffmpeg -i clip.mp4 -c:v libvpx-vp9 -b:v 0 -crf 30 -an clip.webm` |
| Rayas finas entre piezas de una imagen | Posiciones con decimales o un `background` por pieza | Píxeles enteros (`Math.round`) y recortar una misma `<img>` con `overflow: hidden` |
| Bandas en degradados | JPEG + yuv420p | `grain(ctx)` o `--img png` |
| Render lento | Blur, sombras grandes o `backdrop-filter` en software | Imágenes pre-difuminadas; borradores con `--scale 0.5` |
| `capture` falla o sale un captcha | La web bloquea navegadores sin ventana | `npm run capture -- <url> <marca> --headed` |
| Sin audio en el MP4 | Falta Python con numpy | `npm run doctor` y sigue el arreglo que indica |
| `Chromium sin ventana` falla en Linux | Faltan librerías del sistema | `sudo npx playwright install-deps chromium` |
| Un elemento se corre 1 px o tiembla entre fotogramas iguales | `translate3d` / `will-change` crean capas de GPU con raster que depende del historial | Usa `track()` (traslación 2D) y evita `will-change` |
| Contenido desplazado de golpe | `overflow: hidden` crea un contenedor con scroll que el navegador puede mover | `base.css` usa `overflow: clip`; no lo cambies a `hidden` en `#stage` |

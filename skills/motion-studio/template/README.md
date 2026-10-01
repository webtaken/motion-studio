# Mi estudio de motion

Estudio creado con la skill [`motion-studio`](https://github.com/webtaken/motion-studio).
Cada video es un programa: `window.seek(t)` pinta el fotograma exacto; Playwright y ffmpeg
lo convierten en MP4.

```bash
npm run doctor                    # revisa que todo esté instalado
npm run new -- mi-video           # video nuevo
npm run dev                       # preview en http://localhost:4321
npm run check -- mi-video         # reglas + determinismo
npm run sheet -- mi-video         # hoja de contactos para revisar
npm run render -- mi-video -f all # MP4 9:16, 1:1 y 16:9 en out/mi-video/
```

Reglas para agentes: `AGENTS.md` (Claude Code lee `CLAUDE.md`). Prompts de la guía en
`prompts/`. Referencia del motor en `docs/motor.md`.

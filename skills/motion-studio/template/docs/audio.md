# Audio

Todo el audio sale del mismo reloj que la imagen.

## Música compuesta en código (por defecto)

`video.json`:

```json
"bpm": 120,
"music": { "mode": "compose", "style": "house", "key": "Am" },
"sections": [
  { "start": 0, "end": 3, "energy": "hook" },
  { "start": 3, "end": 7, "energy": "build" },
  { "start": 7, "end": 15, "energy": "drop" },
  { "start": 15, "end": 20, "energy": "outro" }
]
```

- Estilos: `minimal` (tech limpio), `house` (4x4 con clap y bajo a contratiempo),
  `lofi` (swing, rhodes, vinilo), `cinematic` (golpes, pulsos, cuerdas).
- Energías: `hook intro build drop break outro`. Antes de cada `drop`/`outro` suena un
  riser y entra un crash; en `build` hay redoble en el último compás.
- `npm run music -- <slug> --style lofi --key C` recompone y guarda el cambio en `video.json`.
- El render la recompone sola si cambian bpm, duración, estilo, tonalidad o secciones.

## Pista propia

```bash
cp ~/musica/pista.mp3 videos/<slug>/audio/pista.mp3
npm run beats -- <slug> videos/<slug>/audio/pista.mp3
```

Escribe `videos/<slug>/beats.json` y cambia `video.json` a `music.mode: "track"`.
`ctx.beat(n)` usa entonces los beats reales (librosa si está, si no un detector numpy).

## Efectos de sonido

En `setup`: `ctx.sfx(t, tipo, { gain, pan, anchor })`.

| Tipo | Para |
|---|---|
| `click` `tap` | clics de interfaz, toques |
| `tick` | piezas que encajan, letras |
| `pop` | algo que aparece con rebote |
| `whoosh` `swipe` | transiciones (pican en `t`) |
| `riser` | subida que **termina** en `t` (`{ anchor: 'end' }`) |
| `impact` `boom` | cortes fuertes, logo |
| `ding` | éxito, "listo" |
| `type` | una tecla |
| `glitch` | cortes digitales |

`createCursor` y `scenes({ sfxIn })` registran sus propios sonidos. Para usar un sonido
tuyo, guarda `assets/_sfx/<tipo>.wav` y reemplaza al sintetizado.

## Mezcla

`npm run render` llama a `audio/mix.py`: música (−2 dB), sfx, ducking de la música bajo
impactos y whooshes, y normalización a −14 LUFS (pico −1 dBTP). Resultado:
`out/<slug>/mix.wav`, que también usa el reproductor de `npm run dev`.

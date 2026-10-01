<!-- Generado por scripts/sync-skill.mjs desde prompts/*.md. No editar aquí. -->

# Prompts de la Guía MOTION

# Paso 1 · Prueba el setup con el prompt de una línea

Es el prompt que se volvió viral (2,1 M de vistas). Sirve para comprobar que todo
renderiza. **No sirve para vender**: no tiene nada de tu marca y todos los resultados se
parecen. Esfuerzo: xhigh (o max).

```
make a dynamic 15-second motion graphics video that shows what an incredible motion designer you are, like it's your showreel for a résumé. go all out.
```

En este estudio, Claude debe:

1. `npm run new -- showreel --dur 15`
2. Escribir la composición en `videos/showreel/index.html`.
3. `npm run check -- showreel` → `npm run sheet -- showreel` → mirar → corregir.
4. `npm run render -- showreel --format all`.

Ejemplo terminado: `videos/demo/`.

---

# Paso 2 · Apúntalo a tu producto

La diferencia entre un video genérico y uno que vende son tres líneas: el link del
producto, "usa capturas, logo y assets reales" y "tiene que llevar música".

```
Haz un video de motion graphics de 20 segundos para [PRODUCTO] ([URL]),
con la energía del showreel de un motion designer. Dalo todo.

Assets
- Entra a la web. Usa capturas reales (Playwright), el logo real,
  los colores y fuentes reales. Guárdalo en ./assets y dime qué
  encontraste antes de animar.
- Nunca redibujes la interfaz de memoria. Recorta y anima la real.

Historia (un beat cada una, 2 a 4 segundos)
1. Gancho: el problema en 5 palabras de tipografía grande en movimiento.
2. Aparece el producto; la interfaz se arma pieza por pieza.
3. Tres funciones, cada una con un cursor haciendo una acción real.
4. Un número que prueba que funciona: [MÉTRICA].
5. Logo + [LLAMADO A LA ACCIÓN].

Sonido
- Música original a 120 BPM, compuesta en código.
- Clics de interfaz y whooshes sobre el beat.

Formato: 1080x1920 (9:16) primero; después 1:1 y 16:9 de la misma línea de tiempo.
Antes del render completo, muéstrame una hoja con un fotograma por beat.
```

En este estudio:

1. `npm run capture -- [URL] [marca]` → revisa `assets/[marca]/brand-sheet.png` y cuéntale
   al usuario qué encontraste (colores, fuentes, logo, secciones).
2. `npm run new -- [slug] --marca [marca] --dur 20` → parte de `videos/_producto`.
3. Llena `copy` en `video.json` (gancho, funciones, métrica, CTA, url).
4. Si `--steps` hace falta para capturar estados reales tras un clic, úsalo.
5. `check` → `sheet` → mirar → corregir → `render --format all`.

**Llaves de API** (voz, imágenes): en `.env`, nunca pegadas en el prompt.

---

# Paso 3 · Dale una referencia

Sin referencia, Claude vuelve a lo genérico. Nombrar un estilo funciona mejor que
describirlo, y un video o un fotograma de referencia le da ritmo, tipografía y
transiciones para copiar. Busca referencias en lanzamientos de la competencia, Dribbble o
whatships.com.

```
Referencia: ./refs/lanzamiento.mp4

1. Extrae un fotograma cada 0.5 s con ffmpeg y estúdialos.
2. Escribe ./docs/guia_estilo.md: paleta (hex), tipografía (familia,
   peso, espaciado), duración de tomas, tipos de transición, movimientos
   de cámara, textura, cómo entra y sale el texto.
3. Escribe ./docs/lista_tomas.md para un video de [DURACIÓN] s sobre
   [PRODUCTO] en ESE estilo. Toma la gramática de la referencia,
   nunca su contenido, logos ni personajes.
4. Muéstrame los dos archivos. Espera mi OK antes de escribir código.
```

En este estudio el paso 1 es `npm run ref -- refs/lanzamiento.mp4` (fotogramas, cortes,
duración media de toma, paleta y hojas con tiempos). Las plantillas de los dos documentos
están en `docs/_plantillas/`.

---

# Paso 4 · Haz que mire sus propios fotogramas

Opus lee imágenes. Ese hábito separa los videos que se hicieron virales de los que se
publicaron con un "quedó medio mediocre".

```
Sé un director de motion exigente.
Saca una hoja de contacto (2 fotogramas por segundo, 6 por fila)
y una versión a 360 px de ancho para ver cómo se lee en celular.

Pon nota del 1 al 10 a: gancho en los primeros 2 s, lectura en celular,
calidad del movimiento, composición, fidelidad a la marca, sincronía
con el sonido. Señala con tiempos exactos: texto que se desliza en vez
de frenar suave, etiquetas en las esquinas, texto borroso al escalar,
un beat donde no pasa nada, un salto al final del loop.

Corrige los 3 peores. Renderiza solo los segundos afectados,
muéstrame la nueva hoja y repite hasta que todo tenga 8 o más.
```

En este estudio:

```bash
npm run sheet -- <slug> --fps 2        # 2 fotogramas por segundo, 6 por fila
npm run sheet -- <slug> --mobile       # 360 px de ancho
npm run sheet -- <slug> --sfx          # cada sonido: antes, en el golpe, después
npm run sheet -- <slug> --from 4 --to 7   # solo lo que corregiste
npm run render -- <slug> --from 4 --to 7  # re-render solo de esos segmentos
```

Anota cada vuelta en `videos/<slug>/critica.md` (plantilla en `docs/_plantillas/critica.md`).

**Tú decides cuándo parar.** Cada vuelta mejora el video pero consume uso del plan. No hace
falta llegar a 10 en todo: cuando ya sirve para vender, para. Para ahorrar, re-renderiza
solo los segundos que cambiaron y usa esfuerzo medium para arreglos pequeños.

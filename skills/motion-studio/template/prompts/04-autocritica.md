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

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

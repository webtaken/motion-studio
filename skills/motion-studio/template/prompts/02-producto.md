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

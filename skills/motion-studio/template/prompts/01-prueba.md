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

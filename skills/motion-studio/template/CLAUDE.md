@AGENTS.md

# Para Claude Code

- Trabaja en esfuerzo **xhigh** para videos nuevos, **max** para lanzamientos (los primeros
  3 s cargan todo) y **medium** para arreglos pequeños y re-renders.
- Tú lees imágenes: después de cada cambio importante corre `npm run sheet` y abre los PNG
  con Read. No le muestres nada al usuario sin haber mirado sus fotogramas.
- Itera sobre hojas y borradores (`--scale 0.5`), nunca sobre renders completos.
- Gasta el esfuerzo donde importa: la lista de tomas antes del código y los primeros 2 s.
- Una sesión por marca: el segundo video de la misma marca sale más rápido porque las
  capturas, el audio y las plantillas ya existen.
- Cada vuelta consume uso del plan. Cuando el resultado ya sirve para vender, para y pregunta.

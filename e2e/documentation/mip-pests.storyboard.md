# Storyboard · Gestión de plagas V1

**Módulo:** Configuración → Catálogos MIP → Plagas  
**Salida:** `mip-gestion-plagas-v1.mp4`  
**Video ID:** `mip-gestion-plagas-v1`  
**Objetivo:** al terminar el video, el usuario podrá crear una plaga, comprender la diferencia entre monitoreo y categoría para productos, consultar y editar el registro, desactivarlo, reactivarlo y eliminarlo cuando no tenga relaciones ni historial.

## Reglas funcionales que debe enseñar

Cada plaga tiene dos dimensiones independientes:

- **Monitoreo con trampas:** define qué tipo de trampa puede monitorear la plaga: Rastreros o Voladores.
- **Categoría para productos:** define qué tipo de producto se usa para controlarla: Insectos rastreros, Insectos voladores o Roedores.

La interfaz muestra una ayuda breve debajo de **Monitoreo con trampas** y un icono de ayuda junto a **Categoría para productos**. El video debe mostrar ambos elementos de forma visible.

Combinaciones válidas:

- Voladores → Insectos voladores.
- Rastreros → Insectos rastreros o Roedores.

Ejemplos reales del catálogo:

- Cucaracha = Rastreros + Insectos rastreros.
- Roedor = Rastreros + Roedores.
- Mosca doméstica = Voladores + Insectos voladores.

Una plaga con relaciones o historial no debe eliminarse para reinterpretar su identidad semántica; se desactiva.

## Datos de demostración

| Dato | Valor |
|---|---|
| Plaga existente 1 | Cucaracha · Rastreros · Insectos rastreros |
| Plaga existente 2 | Roedor · Rastreros · Roedores |
| Plaga existente 3 | Mosca doméstica · Voladores · Insectos voladores |
| Nueva plaga | Roedor de demostración |
| Nombre editado | Roedor demostración bodega |
| Monitoreo final | Rastreros |
| Categoría final | Roedores |

Todos los datos son sintéticos y la prueba intercepta únicamente la frontera HTTP.

## Escenas

1. Portada.
2. Configuración → Catálogos MIP.
3. Abrir Plagas.
4. Explicar columnas.
5. Búsqueda y filtro.
6. Nueva plaga.
7. Nombre.
8. Explicar **Monitoreo con trampas** y su ayuda breve.
9. Seleccionar Voladores.
10. Mostrar **Insectos voladores** automático y abrir el tooltip de **Categoría para productos**.
11. Cambiar a Rastreros y mostrar las dos categorías de producto posibles.
12. Seleccionar Roedores.
13. Crear.
14. Mostrar registro creado.
15. Abrir detalle.
16. Mostrar Monitoreo y Categoría para productos.
17. Editar.
18. Guardar nombre actualizado.
19. Señalar Editar, Desactivar y Eliminar.
20. Desactivar.
21. Confirmar.
22. Mostrar Inactivas.
23. Reactivar.
24. Mostrar Activas.
25. Abrir eliminación y explicar restricción de historial.
26. Confirmar eliminación.
27. Mostrar resultado.
28. Cierre.

## Sincronización

- **Monitoreo con trampas** y su texto de ayuda permanecen visibles durante la explicación.
- El tooltip de **Categoría para productos** se abre durante la explicación de la segunda clasificación.
- La categoría automática se muestra con Voladores antes de cambiar a Rastreros.
- La selección Roedores ocurre solo después de que las opciones para Rastreros son visibles.
- El detalle permanece abierto durante toda su explicación.
- Las confirmaciones permanecen abiertas hasta el segmento que las confirma.
- Voz y subtítulos usan exactamente el mismo texto.
- Cada cambio importante deja una pausa visual mínima.

## Aprobación

- [ ] 1920 × 1080 real.
- [ ] Voz y subtítulos coinciden.
- [ ] Se muestran ambas dimensiones de clasificación.
- [ ] Se demuestra Voladores → Insectos voladores automático.
- [ ] Se demuestra Rastreros → Roedores.
- [ ] Se crea, consulta y edita.
- [ ] Se desactiva, reactiva y elimina solo el registro sintético.
- [ ] No aparecen datos reales.

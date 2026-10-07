# Storyboard de referencia: Gestión de productos

Este storyboard define la secuencia aprobada del video **Gestión de productos**. El texto pronunciado y los subtítulos proceden de `e2e/documentation/mip-catalogs.narration.json`.

## Ficha de producción

| Campo | Valor |
|---|---|
| Módulo | Configuración → Catálogos MIP → Productos |
| Propósito | Enseñar creación, consulta, archivo asociado, edición y cambio de estado |
| Duración esperada | 2:30 a 3:30 |
| Resolución | 1280 × 720, 30 fps |
| Datos principales | Producto demostración · Cipermetrina 40% · 10 ml / L |
| Archivo | ficha-tecnica-demo.pdf |
| Escenario automatizado | `e2e/documentation/mip-catalogs.docs.spec.ts` |
| Guion | `e2e/documentation/mip-catalogs.narration.json` |
| Resultado | Producto creado, editado a 12 ml / L y trasladado a Inactivos |

## Secuencia verificable

| Segmento | Estado visible antes del audio | Acción durante el audio | Estado visible al terminar |
|---|---|---|---|
| `open-catalogs` | Pantalla Configuración | Clic en Catálogos MIP | Listado de Productos abierto |
| `catalog-overview` | Listado, tabs Activos/Inactivos y buscador | Resaltado discreto de las pestañas de estado | Listado completo y estable |
| `new-product` | Botón Nuevo producto visible | Clic en Nuevo producto | Modal Nuevo producto abierto |
| `required-fields` | Formulario vacío | Escribir nombre, principio activo y dosis | Tres campos obligatorios diligenciados |
| `optional-fields` | Campos opcionales visibles | Escribir registro, grado, laboratorio y antídoto | Datos opcionales completos |
| `coverage-intro` | Botón Plagas que controla visible | Abrir el multiselect y resaltarlo | Selector abierto |
| `coverage-category` | Selector abierto | Seleccionar todos los insectos rastreros | Categoría incluida y sus plagas marcadas |
| `coverage-specific` | Selector todavía abierto | Seleccionar Mosca doméstica | Categoría y plaga individual visibles simultáneamente |
| `coverage-close` | Selector abierto con selección terminada | Clic en Listo | Formulario visible con resumen de control |
| `methods` | Campo Métodos de aplicación visible | Abrir, elegir Aspersión y Termonebulización, cerrar | Dos métodos seleccionados |
| `technical-sheet` | Control Adjuntar archivo visible | Seleccionar ficha-tecnica-demo.pdf | Nombre del archivo visible en el formulario |
| `save-product` | Formulario completo | Clic en Crear producto y espera del guardado | Modal cerrado y producto visible en la tabla |
| `open-detail` | Producto demostración visible en Activos | Clic en el nombre del producto | Modal de detalle abierto |
| `detail-overview` | Detalle completo visible | Zoom local breve sobre los datos | Detalle sin deformación y con todos los datos legibles |
| `open-sheet` | Botón Ver ficha técnica visible | Clic en Ver ficha técnica | Vista previa del documento abierta |
| `close-sheet` | Ficha técnica visible | Clic en Volver al detalle | Modal de detalle nuevamente visible |
| `open-edit` | Detalle del producto visible | Clic en Editar | Modal Editar producto abierto |
| `save-edit` | Dosis actual de 10 ml / L | Cambiar a 12 ml / L y guardar | Formulario cerrado |
| `edit-result` | Tabla de activos visible | Resaltar la fila | Nueva dosis de 12 ml / L visible |
| `delete-action` | Acciones de la fila visibles | Clic en Eliminar | Confirmación Eliminar producto abierta |
| `delete-restriction` | Mensaje de confirmación visible | Resaltar mensaje y cancelar | Producto conservado en la tabla |
| `deactivate-action` | Producto todavía activo | Clic en Desactivar | Confirmación Desactivar producto abierta |
| `confirm-deactivate` | Confirmación visible | Confirmar desactivación | Producto ausente de Activos |
| `inactive-tab` | Pestaña Activos sin el producto | Clic en Inactivos | Producto visible en Inactivos |
| `reactivate-note` | Fila inactiva visible | Resaltar fila y comprobar botón Reactivar | Acciones disponibles y legibles |
| `done` | Resultado final en Inactivos | Pausa de cierre | Estado final estable antes del outro |

## Puntos críticos de sincronización

1. `coverage-intro`, `coverage-category` y `coverage-specific` deben conservar abierto el mismo multiselect. Solo `coverage-close` puede cerrarlo.
2. La ficha técnica debe estar visible antes de comenzar `close-sheet`; no se debe volver al detalle durante `open-sheet`.
3. La edición debe mostrar primero el formulario, después el cambio y finalmente la dosis nueva en la tabla.
4. La confirmación de eliminación se cancela para conservar el registro que se desactivará después.
5. La confirmación de desactivación sí se ejecuta y debe comprobarse en Inactivos.
6. El subtítulo mostrado en cada escena debe ser exactamente el texto del segmento correspondiente.

## Criterios de aceptación específicos

- La portada utiliza `logo-light.png` y no el favicon ampliado.
- La portada y el cierre no muestran fondos pixelados ni texturas rasterizadas.
- El video no termina después de crear el producto; incluye detalle, ficha técnica, edición y estado.
- La ficha técnica mostrada contiene los mismos datos usados en la creación.
- La dosis visible al final de la edición es `12 ml / L`.
- El producto no queda visible en Activos después de confirmar la desactivación.
- Inactivos muestra `Producto demostración` y la acción `Reactivar Producto demostración`.

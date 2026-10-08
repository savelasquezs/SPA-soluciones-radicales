# Storyboard · Gestión de trampas V1

**Módulo:** Configuración → Catálogos MIP → Trampas  
**Salida:** `mip-gestion-trampas-v1.mp4`  
**Objetivo:** al terminar el video, el usuario podrá crear una trampa, comprender su clasificación de monitoreo, consultar y editar el registro, desactivarlo, reactivarlo y eliminarlo cuando no tenga historial.

## Alcance funcional

Trampas es un catálogo hermano de Productos, Plagas y Criterios. Cada trampa conserva:

- nombre;
- exactamente una clasificación de monitoreo: **Rastreros** o **Voladores**;
- estado activo/inactivo.

La clasificación pertenece al monitoreo. No representa una categoría química de producto y no selecciona plagas individuales.

Las trampas iniciales del sistema incluyen **Trampa adhesiva / Rastreros** y **Lámpara UV / Voladores**.

## Datos de demostración

| Dato | Valor |
|---|---|
| Trampa existente 1 | Trampa adhesiva · Rastreros |
| Trampa existente 2 | Lámpara UV · Voladores |
| Nueva trampa | Trampa de demostración |
| Clasificación | Voladores |
| Nombre editado | Trampa demostración UV |

Todos los datos son sintéticos. La prueba intercepta únicamente la frontera HTTP.

## Escenas

| # | ID | Acción visual | Narración / subtítulo | Estado final |
|---:|---|---|---|---|
| 1 | `intro` | Portada limpia con logo, título y subtítulo. | En este video aprenderás a crear, consultar y administrar las trampas del catálogo MIP. | Portada visible. |
| 2 | `open-catalogs` | Desde Configuración, clic en **Catálogos MIP**. | Desde Configuración, abre Catálogos MIP para administrar los maestros utilizados durante la operación técnica. | Catálogo abierto. |
| 3 | `open-traps` | Clic en **Trampas**. | Selecciona la pestaña Trampas. Aquí se administran los dispositivos utilizados para el monitoreo. | Trampas / Activas visible. |
| 4 | `trap-list` | Señalar pestañas de estado, columnas y acciones. | El listado separa las trampas activas e inactivas y muestra el nombre, el tipo de monitoreo, el estado y las acciones disponibles. | Listado estable. |
| 5 | `trap-search-filter` | Señalar búsqueda y selector **Monitoreo**; filtrar brevemente por Rastreros y volver a Todas. | Puedes buscar por nombre y filtrar el listado por monitoreo Rastreros o Voladores. | Listado completo. |
| 6 | `new-trap` | Clic en **Nueva trampa**. | Para registrar una trampa, selecciona Nueva trampa. | Modal visible. |
| 7 | `trap-name` | Escribir **Trampa de demostración**. | Escribe un nombre claro que permita reconocer el dispositivo durante la operación. | Nombre completo. |
| 8 | `monitoring-intro` | Señalar las opciones **Rastreros** y **Voladores**. | Cada trampa debe pertenecer a un solo tipo de monitoreo: Rastreros o Voladores. | Ambas opciones visibles. |
| 9 | `monitoring-meaning` | Mantener el selector visible y enfatizar el fieldset. | Esta clasificación indica el grupo de monitoreo donde puede utilizarse la trampa. No corresponde a las categorías químicas de los productos. | Modal sin avanzar. |
| 10 | `choose-monitoring` | Seleccionar **Voladores**. | Para esta demostración seleccionaremos Voladores. | Voladores seleccionado. |
| 11 | `create-trap` | Clic en **Crear trampa** y mostrar estado breve de guardado. | Cuando la información esté lista, selecciona Crear trampa. | Modal se cierra. |
| 12 | `created-trap` | Señalar fila **Trampa de demostración**. | La nueva trampa aparece inmediatamente en la lista de Activas. | Nueva fila visible. |
| 13 | `open-detail` | Clic en el nombre. | Selecciona el nombre de la trampa para consultar su detalle. | Detalle abierto. |
| 14 | `trap-detail` | Señalar **Activa** y **Monitoreo: Voladores**. | El detalle muestra el estado y la clasificación de monitoreo asignada. | Detalle visible. |
| 15 | `edit-trap` | Clic en **Editar** desde el detalle. | Desde el detalle puedes abrir Editar para modificar la información de la trampa. | Modal Editar trampa. |
| 16 | `save-edit` | Cambiar nombre a **Trampa demostración UV** y guardar. | Actualiza el nombre y selecciona Guardar cambios. | Fila actualizada. |
| 17 | `row-actions` | Señalar Editar, Desactivar y Eliminar. | En la fila encontrarás las acciones Editar, Desactivar y Eliminar. | Acciones identificadas. |
| 18 | `deactivate-trap` | Clic en **Desactivar Trampa demostración UV**. | Usa Desactivar cuando la trampa ya no deba ofrecerse para nuevas selecciones, pero necesites conservar su historial. | Confirmación abierta. |
| 19 | `confirm-deactivation` | Clic en **Desactivar**. | Confirma la desactivación para retirarla de la lista de Activas. | Registro desaparece de Activas. |
| 20 | `inactive-trap` | Clic en **Inactivas** y señalar el registro. | La trampa queda disponible en la pestaña Inactivas. | Registro inactivo visible. |
| 21 | `reactivate-trap` | Clic en **Reactivar** y confirmar. | Si necesitas volver a utilizarla, selecciona Reactivar y confirma la acción. | Registro sale de Inactivas. |
| 22 | `active-again` | Volver a **Activas** y señalar registro. | La trampa vuelve a Activas y queda disponible para nuevas selecciones. | Registro activo visible. |
| 23 | `delete-trap` | Clic en **Eliminar** y mantener confirmación abierta. | Eliminar solo debe usarse cuando la trampa no tiene referencias ni historial. Si ya fue utilizada, la opción correcta es desactivarla. | Confirmación visible. |
| 24 | `confirm-delete` | Confirmar **Eliminar**. | Como esta trampa de demostración no tiene historial, confirmaremos su eliminación. | Registro eliminado. |
| 25 | `deleted-trap` | Mostrar catálogo con trampas existentes. | Al finalizar, el registro desaparece del catálogo sin afectar las demás trampas. | Solo registros originales. |
| 26 | `outro` | Cierre con logo. | Con esto puedes crear, consultar, editar y administrar las trampas del catálogo MIP. | Cierre limpio. |

## Reglas de sincronización

1. La interfaz no cambia de estado antes de terminar la frase correspondiente.
2. Las opciones Rastreros y Voladores permanecen visibles durante `monitoring-intro` y `monitoring-meaning`.
3. La clasificación Voladores se selecciona únicamente dentro de `choose-monitoring`.
4. El detalle permanece abierto durante todo `trap-detail`.
5. La confirmación de desactivación permanece visible hasta `confirm-deactivation`.
6. La confirmación de eliminación permanece visible durante toda la explicación de `delete-trap`.
7. Voz y subtítulos usan exactamente el mismo `segment.text`.
8. Los cambios de estado dejan una pausa visual de al menos 400 ms.

## Criterios de aprobación

- [ ] Portada nítida.
- [ ] Resolución real 1920 × 1080.
- [ ] Se llega a Trampas desde Configuración.
- [ ] Se muestran búsqueda y filtro de monitoreo.
- [ ] Se crea una trampa con nombre y clasificación.
- [ ] Se explica que la clasificación es de monitoreo, no química.
- [ ] Se abre el detalle desde el nombre.
- [ ] Se edita el nombre.
- [ ] Se identifican Editar, Desactivar y Eliminar.
- [ ] Se desactiva y aparece en Inactivas.
- [ ] Se reactiva y vuelve a Activas.
- [ ] Se elimina únicamente la trampa sintética sin historial.
- [ ] Voz y subtítulos coinciden palabra por palabra.
- [ ] No aparecen datos reales.

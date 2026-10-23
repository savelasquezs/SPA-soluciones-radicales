# Storyboard · Gestión y reutilización de Áreas V1

**Módulo:** Clientes → Negocio → Sede → Áreas  
**ID:** `clientes-areas-v1`  
**Archivo objetivo:** `clientes-gestion-areas-v1.mp4`

## Objetivo
Enseñar al Administrador a registrar, clasificar, editar, consultar, desactivar, reactivar y eliminar Áreas, y a entender su reutilización entre servicios y la protección del historial.

## Reglas verificadas en el repositorio

- El formulario `AreaForm.vue` se reutiliza al crear y editar.
- Cada Área pertenece a una Sede de un cliente tipo Negocio.
- Nombre obligatorio; opción `Zona exterior o perimetral` define su clasificación.
- Listado: nombre, ubicación, número de puestos activos, estado y acciones.
- El backend rechaza nombres duplicados dentro de la misma Sede, ignorando mayúsculas.
- Las Áreas activas se toman automáticamente de la Sede en servicios MIP principales.
- **El snapshot se crea al iniciar** el servicio: guarda nombre y ubicación exterior, criterios y puestos; no se crean nuevas Áreas por cada visita.
- Desactivar excluye el Área de próximos servicios, sin modificar los snapshots de visitas iniciadas.
- Eliminar solo aplica si no tiene dependencias. FK de `servicio_areas` también protege referencias históricas.
- El recorrido puede ordenarse por visita independientemente de la configuración de Sede.

## Datos simulados, sin producción

- **Negocio:** Industrias Demo SAS. **Sede:** Sede Norte.
- **Áreas iniciales:** Cocina (interior, dos puestos, activa), Patio (exterior, activa), Bodega (interior, inactiva).
- **Nueva Área:** Zona de carga (marcada exterior), editada luego a Patio de carga.
- **Caso de protección:** Cocina no se puede eliminar por tener dispositivos; permite desactivar y reactivar.
- **Caso de eliminación:** Patio de carga, sin dependencias.
- La demostración realiza llamadas interceptadas a `api.example.test`. No accede a Neon ni R2 reales.

## Secuencia

| Paso | Segmento | Narración y estado visual |
| --- | --- | --- |
| 1 | `intro` | Aprenderás a administrar las Áreas de una Sede y a reutilizarlas en los siguientes servicios. |
| 2 | `open-client` | En Clientes, selecciona el Negocio que deseas gestionar. |
| 3 | `open-site` | Abre la Sede correspondiente para consultar sus espacios y configuraciones. |
| 4 | `open-areas` | Selecciona la pestaña Áreas. Aquí verás el nombre, la ubicación, los puestos de monitoreo y el estado de cada Área. |
| 5 | `area-types` | Las Áreas pueden ser interiores o exteriores. Esta diferencia también determina qué criterios se aplican durante un servicio. |
| 6 | `open-create` | Para registrar una nueva Área, selecciona Agregar Área. |
| 7 | `name-create` | Escribe un nombre claro y reconocible, por ejemplo, Zona de carga. |
| 8 | `mark-exterior` | Activa Zona exterior o perimetral cuando se trate de un espacio exterior. |
| 9 | `save-create` | Confirma con Agregar Área. El registro aparece inmediatamente en el listado. |
| 10 | `show-details` | Selecciona un Área para consultar su ubicación y la cantidad de puestos de monitoreo asociados. |
| 11 | `open-edit` | Con Editar Área, puedes cambiar el nombre y la clasificación, usando el mismo formulario de creación. |
| 12 | `save-edit` | Realiza los ajustes y selecciona Guardar cambios. |
| 13 | `reuse` | Las Áreas se registran una sola vez en la Sede. En las siguientes visitas el sistema reutiliza las Áreas activas, sin volver a crearlas. |
| 14 | `snapshots` | Al iniciar un Servicio Principal, se conserva una copia de sus nombres, su clasificación, los criterios y los puestos. Así, los cambios futuros no alteran el historial. |
| 15 | `delete-attempt` | Una Área que ya tiene puestos o hallazgos no puede eliminarse, porque posee información relacionada. |
| 16 | `deactivate` | En ese caso, selecciona Desactivar para conservar los datos históricos. |
| 17 | `inactive` | El Área permanece identificada como inactiva y deja de incluirse en los nuevos recorridos. |
| 18 | `reactivate` | Cuando vuelva a utilizarse, puedes seleccionar Reactivar. |
| 19 | `delete-empty` | Si una Área no tiene dependencias, sí puedes eliminarla después de confirmar. |
| 20 | `outro` | Así administras una sola estructura de Áreas por Sede, mientras cada Servicio conserva su propia información histórica. |

## Control de calidad
- Audio y subtítulos literales desde el mismo archivo `areas.narration.json`.
- Cursor visible; acciones sincronizadas con TTS y cuadro de diálogo visible durante la explicación.
- Grabación 1920×1080, H.264, AAC, subtítulos legibles.
- Nunca representar la vista de un servicio como si creara nuevas Áreas cada vez.
- Este archivo es **candidato para revisión**. No publicar a R2 ni Mintlify hasta aprobación explícita.

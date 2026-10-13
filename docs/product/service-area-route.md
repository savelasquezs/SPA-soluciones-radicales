# Recorrido de Áreas editable por Servicio

Decisión aprobada por Santiago durante la revisión del diseño móvil. Especifica el cambio solicitado: reorganizar las Áreas para recorrerlas en el orden más conveniente y mantener siempre visible el siguiente paso del flujo.

Complementa [service-execution.md](service-execution.md). Se aplica al modelo vigente de entidades y snapshots del dominio, sin constructor de formularios ni versiones de formulario. El PR #16 fue cerrado y sustituido por la especificación vigente y el PR #18; no es la base de esta implementación.

## Alcance

El Técnico con permiso de edición puede cambiar el orden del recorrido de Áreas del Servicio MIP en curso. Lista de Áreas, selector de Área y navegación secuencial comparten ese mismo orden.

El cambio NO modifica la configuración de la Sede, nombres o identidad de Áreas, catálogos, estados, criterios, evaluaciones, Puestos, capturas, Productos, Hallazgos, fotografías ni firmas. No impone un asistente lineal: se puede abrir cualquier Área en cualquier momento.

El orden pertenece al Servicio, no a una preferencia global del Técnico. Otro usuario autorizado que continúe el mismo Servicio verá el último orden sincronizado, sujeto a la exclusividad de edición ya vigente. No se habilita por esta decisión edición técnica simultánea.

## Orden inicial y conservación

- Al preparar/iniciar el recorrido se conserva la lista inicial ordenada de IDs de Áreas aplicables al Servicio.
- Se reutiliza el orden inicial proporcionado por el dominio. Si todavía no hay orden explícito, la implementación debe usar un orden determinista de nombre normalizado e ID, no el orden accidental de una consulta SQL.
- El orden inicial queda disponible para la acción «Restablecer orden inicial».
- Reabrir el mismo Servicio recupera su último orden aplicado, incluido el guardado local pendiente de sincronizar.
- Un Servicio futuro comienza con su propio orden inicial. No hereda automáticamente el recorrido de la visita anterior.
- Cambiar filtros, buscar un Área, entrar/salir de una pestaña o cambiar de tema no modifica el orden.

## UX: lista y selector de Áreas

La lista mantiene nombre, estado y resumen de cada Área. Se añade una acción compacta «Ordenar recorrido» junto al contexto del recorrido, sin aumentar innecesariamente el encabezado.

El selector que se abre desde el nombre del Área usa exactamente el mismo orden y también permite acceder a «Ordenar recorrido».

Todas las Áreas siguen visibles, tanto pendientes como resueltas. Cambiar de estado no mueve una tarjeta automáticamente: se conserva la secuencia que eligió el Técnico.

## UX: modo «Ordenar recorrido»

Pantalla móvil dedicada dentro del Servicio, con el contexto del Servicio visible y la indicación «Solo este servicio».

Cada fila muestra posición, nombre, estado y controles Subir/Bajar. Las flechas tienen zona táctil de al menos 44 × 44 px y nombres accesibles como «Subir Producción» o «Bajar Baños». El estado se comunica con texto, no solo color.

Se eligieron flechas para que reordenar no dependa de un gesto de arrastre preciso. El arrastre puede añadirse como mejora, pero no reemplaza esta alternativa y no es requisito de este cambio.

Reglas:

1. Entrar copia el orden aplicado a un borrador de recorrido; no modifica todavía el orden usado por «Siguiente».
2. Subir/Bajar intercambia dos posiciones adyacentes en ese borrador. La primera fila no puede subir y la última no puede bajar.
3. Es posible mover también Áreas evaluadas o no evaluadas; no se borra ni reinicia ninguna respuesta.
4. El modo muestra el recorrido completo. Una búsqueda de la lista no debe limitarlo ni producir una actualización incompleta del orden.
5. «Aplicar orden» confirma el borrador para este Servicio y vuelve a la superficie desde la que se abrió, lista o selector.
6. «Cancelar» o volver desde el editor descarta únicamente la reorganización no aplicada. Conserva el orden anterior y todos los datos técnicos.
7. «Restablecer orden inicial» sustituye el borrador por la secuencia inicial del Servicio; también requiere «Aplicar orden». No borra el progreso.
8. Cambiar el orden durante la visita no hace saltar al Técnico a otra Área de manera automática. La siguiente navegación sí usa el nuevo orden.

Feedback de aplicación: «Orden aplicado» cuando se confirma el guardado correspondiente, o «Orden guardado en este dispositivo» si falta sincronizar. Un error conserva el borrador y permite reintentar; nunca muestra éxito remoto sin confirmación.

## Qué se entiende por Área pendiente o resuelta

La navegación consulta la completitud real del dominio, no deduce que un Área fue revisada por haberla abierto o por su posición.

Para este recorrido se consideran resueltas:

- Áreas evaluadas con todos los criterios y revisiones/excepciones de Puestos requeridos completos, y las evidencias obligatorias registradas.
- Áreas no evaluadas cuya excepción de falta de acceso está justificada con descripción y fotografía obligatoria.

«No evaluada» no significa Cumple, NC ni capturas cero. Sigue mostrándose como excepción y mantiene su explicación y evidencia para el informe.

Una excepción incompleta sigue pendiente. Si se vuelve a habilitar la evaluación de un Área que estaba sin acceso, su elegibilidad se recalcula: vuelve a pendiente mientras no complete los requisitos aplicables.

La completitud de captura y la sincronización son dimensiones diferentes. Registrar una foto de forma durable localmente permite conservar la captura para continuar; no equivale a que ya esté subida ni evita las validaciones de sincronización del cierre del Servicio.

## «Siguiente: [nombre del Área]»

El botón muestra siempre el siguiente paso visible del flujo. Mientras exista otra Área después de la actual en el orden aplicado, muestra su nombre, por ejemplo «Siguiente: Oficinas». En la última Área muestra «Revisar servicio».

La navegación libre y el avance guiado son responsabilidades diferentes. Selector de Áreas y pestañas son libres y siempre permiten moverse sin evaluar. El botón Siguiente de cada sección comprueba los campos obligatorios de su etapa; al salir de Hallazgos comprueba toda el Área y señala el primer pendiente con desplazamiento contextual. «Anterior» nunca valida completitud. La revisión final explica qué Áreas requieren información antes de finalizar.

Algoritmo de avance guiado:

1. Criterios → Puestos: comprobar que todos los Criterios estén evaluados; si falta uno, marcarlo y desplazarlo a la vista.
2. Puestos → Hallazgos: comprobar que todos los Puestos estén revisados; si falta uno, abrir su tarjeta y enfocar la información pendiente.
3. Hallazgos → Siguiente Área o Cierre: comprobar Criterios, Puestos y evaluaciones de Hallazgos heredados (un Hallazgo nuevo no se evalúa en su propia visita).
4. Mostrar siempre las acciones «Anterior» y «Siguiente» al final de cada etapa, sin bloquear la navegación manual entre pestañas y Áreas.
5. El avance desde Hallazgos respeta el orden aplicado y termina en la revisión global después de la última Área.
6. La revisión final permite volver directamente al primer pendiente de cualquier Área y no confirma la finalización mientras existan pendientes.

Antes de navegar se conserva el borrador técnico mediante la capa compartida. Un guardado remoto pendiente no debe forzar permanecer en un Área si los datos están guardados localmente; un fallo real de persistencia local sí requiere advertencia para evitar pérdida de trabajo.

El conjunto vacío o de una sola Área debe manejarse sin índices inválidos ni navegación circular. Una sola Área continúa a revisión; ningún Área aplicable deja la revisión como siguiente superficie del Servicio.

### Ejemplos

| Situación | Acción | Resultado |
| --- | --- | --- |
| Criterio sin evaluación | Siguiente: Puestos | Enfoca y destaca el criterio pendiente |
| Puesto sin revisión | Siguiente: Hallazgos | Abre y destaca el puesto pendiente |
| Hallazgo previo abierto sin revisión | Siguiente área | Destaca el Hallazgo y ofrece Sigue igual / En proceso / Cerrado |
| Área completa | Siguiente área | Avanza en el orden aplicado |
| Última Área completa | Ir al cierre | Abre revisión y firmas |
| Área incompleta | Selector de Área / pestaña | Navega libremente, conservando borradores |

## Persistencia y autorización para desarrollo

Contrato conceptual, sin prescribir una tabla o migración en esta entrega:

- `servicio_id`: ámbito de la preferencia.
- `area_ids_orden_inicial`: secuencia estable inicial del recorrido.
- `area_ids_orden_recorrido`: secuencia aplicada actualmente.
- versión para concurrencia optimista y metadatos del último cambio según los patrones existentes.
- identificador idempotente de la operación sincronizable.

Las respuestas y revisiones siguen referenciando IDs de entidades. Nunca asociarlas por índice de la tarjeta: al cambiar posiciones, los datos siguen perteneciendo a la misma Área.

El servidor valida que el usuario pueda editar ese Servicio y que la secuencia sea una permutación exacta de sus Áreas aplicables: sin duplicados, omisiones, IDs ajenos ni Áreas de otra Sede. Reordenar no puede utilizarse para ocultar un Área y evadir su evaluación.

Un orden inválido se rechaza sin mutación parcial. El orden se actualiza atómicamente; no se envía una escritura independiente por cada fila movida.

Se mantiene el bloqueo persistente de un celular por Servicio, el estado editable y los controles de autorización. Un Servicio finalizado o cancelado no se vuelve editable por esta funcionalidad.

Si otra operación autorizada cambia legítimamente la composición del recorrido, se debe reconciliar el conjunto de IDs antes de aceptar un reordenamiento obsoleto. No inventar Áreas ni recrear datos descartados para conservar posiciones.

## Offline, conflictos y rendimiento

Aplicar actualiza el orden local durable y su cola de sincronización, con aislamiento por usuario/Servicio. No hace falta conectividad para reorganizar un Servicio que ya estaba preparado para trabajo offline.

Un reintento usa la misma operación idempotente y no duplica efectos. Si hay un conflicto de versión sobre el orden, se conserva la propuesta local y el orden remoto para resolverlo explícitamente; no mezclar posiciones de dos secuencias de forma que se dupliquen o pierdan Áreas.

Un conflicto de orden no debe sobrescribir respuestas técnicas. El servidor vuelve a validar permisos, pertenencia e integridad al sincronizar.

Lista, selector y «Siguiente» derivan del mismo estado compartido del Servicio. Reordenar no recarga el catálogo, no consulta cada Área de nuevo, no pierde scroll/filtros innecesariamente y no añade polling.

## Informe del cliente e histórico

Reordenar no cambia cumplimiento, totales, capturas, estados ni evidencias, y no altera informes de otras visitas. Las Áreas no evaluadas y Puestos no revisados mantienen sus razones y fotografías.

El orden planificado no demuestra el orden cronológico real de inspección. No generar en el informe afirmaciones de cronología a partir de la posición de una tarjeta; para eso se requerirían eventos/fechas reales.

Este cambio no obliga a agregar una nueva sección de recorrido al informe. Si el render documental usa la secuencia operativa para ordenar sus secciones, debe usar la guardada para ese Servicio y nunca una lista viva de la Sede.

## Criterios de aceptación

- Reordenar, aplicar y volver a abrir conserva la secuencia del mismo Servicio, sin afectar otra visita ni la Sede.
- Lista y selector coinciden en orden; cambiar de tema no lo reinicia.
- Cancelar y volver desde el editor conservan el orden aplicado; restablecer modifica solo el borrador hasta aplicar.
- Los estados y datos técnicos permanecen asociados a su Área, independientemente de su posición.
- Siguiente sigue el orden aplicado del Servicio sin depender de si un Área está resuelta o pendiente.
- El botón muestra el destino correcto tras reorganizar; jamás se dirige a sí mismo ni oculta el paso siguiente por datos incompletos.
- La última Área siempre conduce a revisión; la revisión muestra pendientes y bloquea la finalización hasta completar la matriz requerida.
- Volver a evaluar un Área sin acceso recalcula su completitud.
- Reordenar funciona con datos preparados offline y comunica persistencia local/sincronización sin confundirlas.
- Error, reintento y conflicto conservan el orden propuesto y todas las respuestas; el backend valida una permutación completa y autorizada.
- Funciona con cero, una o varias Áreas; controles táctiles de 44 px, teclado y nombres accesibles.
- No se reintroduce el modelo de formularios MIP eliminado.

## Diseño en Figma

Archivo `AWHeFImzH9BHPjEydCKJZT`, página `2:4`.

- Sección «Técnico · Orden del recorrido»: `266:23504`.
- Ordenar recorrido: claro `266:23507`, oscuro `266:23630`.
- Lista actualizada: claro `220:18579`, oscuro `231:21105`.
- Selector actualizado: claro `220:19032`, oscuro `231:21241`.
- Guía y escenarios de prueba: `266:24143`.

El prototipo usa tres Áreas ilustrativas, variables compartidas de orden y controles Subir/Bajar operativos. La implementación debe admitir N Áreas; no copiar el número ni las identidades del ejemplo al dominio. Los escenarios de guía y el guardado simulado no son controles de la aplicación ni evidencia de sincronización real.

La lógica de acciones del prototipo se contrastó para las 6 permutaciones de tres Áreas, 8 combinaciones de completitud y 3 posiciones actuales en ambos temas: 288 casos de navegación. También se revisaron aplicar, cancelar y feedback local. Esta validación no reemplaza las futuras pruebas unitarias, de autorización, persistencia y E2E de la aplicación.

# Consulta de puestos de monitoreo y hallazgos

## Alcance

Las pestañas de una Sede se llaman **Puestos de monitoreo** y **Hallazgos**. Son de solo lectura para el rol Administrador activo. No crean, editan, desactivan ni eliminan datos operativos; los flujos del Técnico siguen siendo la autoridad de escritura.

## Puestos

Listado paginado de 20 registros con búsqueda por número, ubicación, área o trampa; filtros por área, trampa, condición y habilitación. `activo` no equivale a `estado_actual`: un puesto no habilitado puede conservar una condición operativa. La última revisión finalizada se calcula desde fechas del Servicio, no desde la última edición del registro. Las revisiones en curso se identifican como provisionales.

Un drawer conserva contexto de Sede y contiene el historial paginado, con filtros por fecha del Servicio y estado. Cada revisión usa snapshots de número, ubicación, área, trampa y plagas. Muestra capturas, consumo, anotaciones, foto y los campos químicos históricos existentes. Los productos registrados a nivel de Servicio se presentan en una sección plegable explícitamente diferenciada; no se atribuyen a un puesto sin una relación persistida.

## Hallazgos

Listado paginado con búsqueda, área, rango de apertura y estados. Inicialmente muestra pendientes; permite consultar también cerrados. El detalle se abre desde el registro ya cargado, sin repetir la consulta. Incluye descripción, acción correctiva, responsable, apertura, cierre y enlaces a los servicios con sus técnicos responsables. El detalle presenta, si existen, las evaluaciones por visita (Sigue igual / En proceso / Cerrado), con fecha y técnico, sin confundir evaluación con estado global. No afirma que el técnico responsable del servicio sea necesariamente el autor individual de cada cambio.

Las fotografías de apertura y cierre se identifican por fase dentro del mismo visor. Un cierre registrado en un servicio aún en curso conserva esa advertencia. La eliminación de una fotografía no altera el estado ni la historia del hallazgo.

## Visor compartido

`EvidenceLightbox` reutiliza `BaseDialog`: anterior/siguiente, contador, zoom con botones y rueda, ajuste, desplazamiento de imagen ampliada, flechas de teclado, Escape, deslizamiento y pellizco táctil. Los controles permanecen accesibles cuando una foto falta. Al llegar a un extremo de la galería, el foco pasa al área de la fotografía para que deshabilitar la flecha no interrumpa el teclado. `BaseDrawer` adapta el diálogo existente sin duplicar gestión de foco.

No se cargan miniaturas ni se ejecutan HEAD por cada fila. El backend autoriza y resuelve una referencia de revisión/hallazgo/índice al abrir cada foto; jamás firma una ruta arbitraria proporcionada por el navegador. Libera la conexión de base de datos antes de consultar R2. Las URLs son privadas, temporales y no se persisten en almacenamiento local.

- Sin referencia: sin evidencia registrada.
- Objeto ausente y plazo de retención agotado: Foto vencida.
- Objeto ausente sin vencimiento determinable: Foto no disponible.
- Fallo de red, permisos o proveedor: error recuperable, nunca vencimiento supuesto.
- Imagen fallida después de obtener URL: renovar autorización una sola vez; después ofrecer Reintentar.

Los plazos provienen de `file-retention.md` (tres meses desde fin real; hallazgos un año abiertos o tres meses desde cierre según reglas). La clasificación de archivo ausente no certifica el motivo ni la fecha exacta de eliminación. Una foto aún disponible sigue mostrándose aunque haya transcurrido el plazo: estos paneles no activan ni modifican la automatización de retención. No se borran referencias históricas. La integración conserva el Worker y las funciones de retención incorporados en paralelo a `develop`.

## Arquitectura y UX

Endpoints GET bajo `/api/admin/sites/:siteId`: `monitoring-points`, `monitoring-points/:pointId/reviews`, `findings`, `photos/:kind/:recordId/:index`. Todos requieren Administrador activo; métodos de escritura rechazados. No se amplían grants de Data API y no hay migración propia de estos paneles.

Tablas compactas en desktop y cards apiladas en móvil, colores semánticos puntuales, enlaces de texto neutro, controles móviles de 44 px, temas claro/oscuro. En móvil la búsqueda queda visible y los filtros avanzados se despliegan desde un botón con contador; no desplazan la lista bajo el primer viewport. Filtros y página sobreviven cambios de pestaña mientras se conserva la Sede. La caché de lista es local al componente, con revalidación al volver después de 60 segundos; no hay polling. Cambiar contexto cancela solicitudes y descarta respuestas antiguas. Las actualizaciones conservan datos visibles y muestran carga/error/reintento contextual; los errores de colección utilizan el toast global.

El visor del historial recorre las fotografías de la página cargada, indicado cuando existe paginación. Para otras revisiones se cambia la página del historial.

## Pruebas

Pruebas de autorización, filtros, aislamiento de referencias, disponibilidad R2, errores recuperables, renovación acotada, galería/teclado/zoom y presentación de vencimiento. Pruebas SQL sobre PostgreSQL efímero y flujos E2E en Chromium, con revisión visual desktop/mobile y ambos temas. La validación no equivale a un despliegue del backend.

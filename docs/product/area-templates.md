# Plantillas de áreas

Las plantillas permiten reutilizar conjuntos de áreas al crear una Sede de tipo **Negocio** o en la pestaña **Áreas** de una Sede existente. No son formularios de inspección ni sustituyen el recorrido MIP.

## Administración

- Solo el Administrador activo puede consultar y modificar plantillas en **Configuración → Plantillas de áreas**.
- El mismo formulario y el mismo diálogo sirven para crear y editar. Cada plantilla tiene nombre, alcance, estado y áreas con nombre y clasificación interior/exterior.
- **Global:** disponible para las sedes de cualquier Cliente Negocio.
- **Privada:** disponible solo para sedes del Cliente Negocio elegido.
- La plantilla puede desactivarse o reactivarse, con confirmación, sin modificar áreas ya creadas. No hay borrado físico desde la interfaz.
- No se admite duplicar el nombre de una plantilla dentro del mismo alcance/cliente ni duplicar nombres de áreas dentro de una plantilla.
- Se aplica control de versión optimista para edición y cambios de estado.

## Aplicación

- **Crear Sede:** el formulario compartido ofrece seleccionar opcionalmente una plantilla activa global o privada de ese cliente. La Sede y sus áreas se crean en la **misma transacción**. Si la plantilla fue desactivada o dejó de corresponder al cliente, no se guarda una Sede incompleta.
- **Sede existente → Áreas → Aplicar plantilla:** carga las opciones activas, muestra la cantidad de áreas y copia solo las que aún no existan.
- La operación es repetible: compara nombres sin distinguir mayúsculas/minúsculas y omite duplicados mediante el índice único existente en `areas`, incluso cuando el área existente está inactiva. No cambia la clasificación, el estado, los puestos de monitoreo ni el historial de las áreas preexistentes.
- La plantilla actúa como **copia inicial**, sin vínculo que propague ediciones posteriores. El técnico sigue pudiendo dar de alta nuevas áreas durante la visita, mediante su flujo offline específico.

## Implementación y despliegue

- Reutiliza `public.plantillas_areas` y agrega `version`, timestamps y control de nombre mediante `20261022_001_area_templates.sql`. No duplica catálogos ni crea otro modelo de áreas.
- Endpoints administrativos: `GET/POST /api/area-templates`, `PATCH /api/area-templates/:id`, `POST /api/area-templates/sites/:siteId/apply`. La creación de Sede acepta opcionalmente `areaTemplateId`.
- Validación y permisos se ejecutan en backend. Se audita el alta, la edición y la aplicación; la inserción por lote es transaccional e idempotente.
- Ejecutar la migración **en la rama Neon correspondiente antes de desplegar la API**. El PR no ejecuta cambios automáticos sobre bases de datos reales.

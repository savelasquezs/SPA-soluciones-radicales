# Configuración → Catálogos MIP

Decisiones aprobadas con Santiago el 6 de octubre de 2026. Este documento especifica el cambio funcional de Productos/Trampas/Plagas y prevalece sobre las descripciones anteriores del catálogo genérico. No cambia Servicios ni ejecuta el módulo de monitoreo.

## Alcance

- Configuración es la entrada. Productos, Trampas y Plagas son secciones hermanas; Métodos de aplicación es administración auxiliar de Productos.
- La portada de Configuración usa filas compactas agrupadas. Certificados e Integraciones conservan sus rutas reales. No se crean pantallas ficticias de Parámetros.
- `/catalogos` redirige a `/configuracion/catalogos`; no aparece como entrada principal del sidebar.
- Solo el rol activo Administrador administra los catálogos. No basta con tener el rol asignado si se está operando como Técnico.

## Productos

El maestro sigue PRODUCTOS A APLICAR: nombre comercial, principio activo/composición, dosis de aplicación (texto con su unidad), registro sanitario, grado toxicológico, laboratorio/fabricante, antídoto y ficha técnica opcional.

Nombre, principio activo, dosis, al menos un método y al menos una categoría o plaga son obligatorios. Lote y vencimiento no son atributos del catálogo: se registran en el Servicio. La dosis del catálogo es referencia para la futura aplicación, no evidencia de la cantidad efectivamente utilizada. No hay inventario.

Cada producto admite múltiples métodos y una cobertura compuesta por categorías completas y/o plagas específicas. Las únicas categorías operativas son RASTREROS y VOLADORES. Seleccionar una categoría conserva una referencia a la categoría, no una copia de las plagas actuales. Las nuevas plagas de esa categoría se incluyen en la cobertura futura. No se persisten relaciones específicas redundantes con una categoría completa seleccionada.

## Trampas y Plagas

Cada una tiene nombre, exactamente una clasificación RASTREROS o VOLADORES y estado. Trampas iniciales: Trampa adhesiva / RASTREROS y Lámpara UV / VOLADORES. No se mezclan con productos químicos. Otros rastreros y Otros voladores son registros diferentes, no una tercera clasificación.

Las claves internas son estables y no se editan. Desactivar impide nuevas selecciones, pero permite conservar referencias existentes al editar un producto. El servidor rechaza asignaciones nuevas a opciones inactivas. Una plaga con relaciones o historia no cambia de clasificación ni se elimina; puede desactivarse.

## Persistencia e historial

La migración 009 reutiliza `configuracion` para métodos y plagas porque Servicios y revisiones ya referencian sus claves. Añade una clasificación tipada, timestamps/version, `trampas` y las relaciones `producto_metodos`, `producto_categorias_plaga` y `producto_plagas`. No crea un catálogo paralelo de métodos/plagas ni migra los puestos físicos.

Los listados incluyen el snapshot ligero editable. Crear/Editar comparte formulario y validación. Editar nunca consulta por ID cuando ya dispone del snapshot. El backend devuelve la entidad definitiva; la UI hace upsert y mueve entre Activos/Inactivos sin recargar la colección. El caché es de memoria, con caducidad de cinco minutos, invalidación por sesión/rol y descarte de lecturas anteriores a una mutación. Los conflictos de versión conservan el borrador; la recarga del registro es explícita.

Los productos, métodos y plagas referenciados no se borran. Las eliminaciones seguras solo retiran maestros sin uso y sus propias asociaciones, nunca servicios. La auditoría es append-only.

## Archivos

La ficha técnica usa el flujo autorizado existente de R2 (`PRODUCT_TECHNICAL_SHEET`), compresión y las fases reales Comprimiendo/Subiendo/Guardando. El archivo anterior no se quita antes de confirmar el nuevo registro. La protección de limpieza incluye fichas referenciadas. No se escribe base64 ni credenciales en la SPA.

## Datos previos y preparación

No importar productos/dosis del Excel automáticamente. `database/bootstrap/002_mip_catalogs.sql` incluye solo catálogos de referencia aprobados y es idempotente, sin reactivar ni sobrescribir cambios del administrador.

Los nombres duplicados previos deben resolverse antes de aplicar índices únicos: la migración falla en vez de fusionarlos silenciosamente. La dosis anterior no se inventa a partir de la unidad. El registro PLAGA/OTROS u otras claves sin clasificación inequívoca se conserva sin reclasificación automática; la UI permite completarlo explícitamente. La restricción `configuracion_plaga_clasificacion_check NOT VALID` permite esa transición, sin admitir registros nuevos sin clasificación. Al retirar los datos de prueba se debe validar el constraint mediante una nueva migración. Esto no es una tercera categoría funcional.

## Fuera de esta entrega

Puestos permanentes por Sede/Área, composición con trampas/productos, revisiones, campos dinámicos por categoría, snapshots de Servicios y operación técnica. No modificar respuestas históricas al editar el catálogo. La futura revisión conserva las plagas aplicables al iniciar el Servicio; no se reinterpretará contra el catálogo vivo.

## Referencia visual

Figma `AWHeFImzH9BHPjEydCKJZT`: Productos 9:14 / 9:15; formulario 20:1164 / 177:16416; Configuración 13:931 / 13:2264. Reutilizar los tokens y el estilo compacto del `develop` actual. Formularios reales, no variables internas del prototipo.

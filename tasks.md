# Tareas aprobadas

## Fundación frontend reutilizable

- [x] Integrar Neon Auth, Data API y Functions mediante services compartidos.
- [x] Crear la estructura base definida en `docs/frontend/reuse.md`.
- [x] Implementar las primitivas compartidas requeridas por el MVP.
- [x] Crear stores de autenticación, preferencias de aplicación y notificaciones para los flujos implementados.
- [ ] Crear composables comunes para estado asíncrono, formularios modificados y errores normalizados.
- [ ] Agregar pruebas unitarias para cada primitiva compartida antes de reutilizarla.

## Datos de prueba

- [ ] Exportar los datos de los Spreadsheets anteriores.
- [ ] Convertirlos en seeds reproducibles exclusivos para desarrollo y pruebas.
- [ ] Verificar que los seeds no incluyan credenciales, tokens ni información real no autorizada.

## Preparación de BD para datos reales

- [ ] Al retirar los registros actuales de prueba, cargar los datos definitivos requeridos por Clientes/Sedes y validar los constraints pendientes de la migración `20261005_006_clientes_sedes_areas.sql`: `negocios_certificado_tipo_check` y `sedes_contacto_celular_check` mediante `VALIDATE CONSTRAINT`. No inventar celulares, plantillas ni configuraciones para conservar datos de prueba; ejecutar esta tarea antes de empezar a almacenar datos reales.

## Archivos privados

- [x] Implementar backend autorizado y URLs firmadas para certificados de usuarios en Cloudflare R2 sin exponer credenciales a la SPA.
- [x] Implementar carga directa autorizada, reemplazo, eliminación y lectura firmada para planos de Sede y plantillas de certificados en Cloudflare R2.
- [ ] Configurar en Neon Functions las credenciales privadas R2 del runtime y ejecutar la validación real contra `sr-master-files`.

## Servicios residenciales

- [ ] Definir valor, duración, programación e informe aplicables a Clientes Casa antes de incluir sus ubicaciones internas en el catálogo de programación.

## Ejecución MIP

- [x] Documentar la eliminación del motor genérico de formularios y definir la ejecución por Áreas, Criterios, Dispositivos y snapshots históricos.
- [x] Retirar por completo el motor legacy de formularios MIP de BD, API y frontend mediante la migración 011.
- [ ] Definir la implementación mínima necesaria para ejecutar y finalizar el primer Servicio Principal según `docs/product/service-execution.md`.

## Certificados

- [x] Configuración por tipo, catálogo de variables, prueba PDF sintética y operación manual con correo editable.
- [x] Aplicar migración temporal de herencia de plantillas en la rama Neon autorizada y validar permisos reales.
- [ ] Aplicar `20261006_008_global_certificate_templates.sql` en desarrollo para eliminar personalizaciones por Negocio/Sede.
- [ ] Reautorizar Google con `drive.file` en desarrollo, configurar R2 y mantenimiento/retención, y realizar un envío expresamente autorizado. Los dos diseños Word ya fueron validados visualmente con Drive.
- [ ] Conectar generación automática al finalizar Servicios, únicamente al implementar y aprobar ese flujo. No llamar el motor desde finalización en esta fase.

## Configuración y catálogos MIP

- [x] Implementar Productos, Trampas, Plagas y Métodos de aplicación en Configuración, con formularios compartidos, cobertura por categorías/plagas y edición desde el snapshot ya cargado.
- [x] Añadir migración 009, bootstrap idempotente, protección de referencias, concurrencia y ficha técnica en el sistema privado de archivos existente.
- [x] Aplicar `20261006_009_mip_catalogs.sql` y `database/bootstrap/002_mip_catalogs.sql` en la rama Neon `desarrollo`, sin importar automáticamente productos ni dosis de los formatos.
- [x] Separar la clasificación de monitoreo RASTREROS/VOLADORES de la cobertura de productos INSECTOS_RASTREROS/INSECTOS_VOLADORES/ROEDORES, preservando Trampa adhesiva para todo RASTREROS y Lámpara UV para VOLADORES.
- [x] Aplicar `20261006_010_product_pest_categories.sql`, ejecutar bootstrap y desplegar la Function `api` en Neon `desarrollo`.
- [ ] Validar subida, visualización, reemplazo y limpieza de una ficha técnica con R2 real y el backend desplegado en desarrollo. Las pruebas de CI no usan credenciales reales.
- [ ] Al retirar los datos actuales de prueba, resolver plagas heredadas incompletas y validar `configuracion_plaga_clasificacion_check` y `configuracion_plaga_categoria_producto_check` con una nueva migración. No alterar historia para completar datos de prueba.
- [x] Implementar Catálogo de Criterios MIP con los cinco criterios iniciales, mismo patrón UX de Catálogos, edición desde snapshot sin GET adicional y sin clave/orden/versión.
- [ ] En la futura ejecución MIP/Monitoreo, consumir las plagas por RASTREROS/VOLADORES con snapshot por Servicio y asociar productos/trampas a puestos permanentes. No está incluido en el CRUD actual de catálogos.


## Programación de Servicios

- [x] Documentar reglas de Principal, Refuerzo editable a +21 días iniciales y Próximos por confirmar en `docs/product/service-scheduling.md`.
- [ ] Actualizar BD/API/frontend para retirar la restricción actual de Refuerzo a +20 días exactos y soportar propuesta inicial +21 días con reprogramación libre.
- [ ] Implementar reprogramación transaccional conjunta de Principal + Refuerzo, manteniendo reprogramación independiente del Refuerzo.
- [ ] Implementar Próximos por confirmar como preagenda separada de `servicios`, con estados, contactos por WhatsApp/correo, badge de próximos siete días y acción Agendar precargada.

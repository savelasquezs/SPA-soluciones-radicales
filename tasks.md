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

## Retención de evidencias

- [x] Aprobar y documentar la política de fotos ordinarias (3 meses), Hallazgos pendientes (máximo 1 año), Hallazgos cerrados (3 meses tras cierre para apertura y corrección) sin alterar el historial en PostgreSQL. La política anterior de PDF de informes fue descartada el 2026-10-09.
- [x] Definir que la **programación automática se ejecuta en Cloudflare Workers Cron Triggers**, nunca mediante Neon scheduled triggers ni el Worker de la SPA.
- [x] Añadir y aplicar migración aditiva `20261008_002_storage_retention.sql` en Neon `desarrollo` con vista privada de vencimientos, auditoría de borrados, excepciones, fallos y hash del secreto; checksum `c0b13513430b55c238cd16f3acaf891e3d9be3fd288deb25632de2c540e69420`. Verificación: 13 referencias, ninguna vencida, 0 borrados.
- [x] Añadir ruta privada `POST /jobs/retention` y ejecución protegida por bloqueo de registros, con `dry-run` por defecto, resultados auditados y reintentos. Desplegada en Neon `desarrollo` (versión 33) conservando las variables privadas.
- [x] Crear en Cloudflare el Worker independiente `sr-storage-retention-dev`, con secreto vinculado y Cron diario `0 7 * * *` UTC activo. Modo `delete` configurado y verificado (2026-10-08).
- [x] Configurar secreto `RETENTION_CRON_TOKEN` directamente mediante conexión de Cloudflare y guardar solo su SHA-256 en Neon `desarrollo`, sin generar ni copiar tokens de API de Wrangler. Confirmado el 2026-10-08.
- [x] Desplegar Neon Function `api` versión 33 con las rutas de retención y las diez variables privadas intactas. Smoke externa: `/health` responde y `POST /jobs/retention` sin bearer devuelve 401. Falta prueba autorizada con objetos sintéticos.
- [x] Activar Cron Trigger de Cloudflare en `desarrollo` (02:00 Colombia), vincular secreto privado a Neon y habilitar modo `delete`. Comprobada lectura posterior de horario, URL, modo y secret binding. Candidatos vencidos actualmente: cero.
- [ ] Extender el registro de disponibilidad de fotos en vistas de dispositivos/hallazgos e instrumentar proyección/alertas de capacidad R2.
- [ ] Añadir disponibilidad `SIN_FOTO/PENDIENTE/DISPONIBLE/VENCIDA` en las vistas de puestos, revisiones y hallazgos sin descargar miniaturas masivamente.
- [ ] Validar dry-run en desarrollo, condiciones de carrera al cerrar hallazgos, 404/errores de R2, alertas y presupuesto global de 8 GB.
- [x] Verificación externa de Neon API y prueba del Worker `node --test` en GitHub Actions: pasos superados; corregido `redirect: manual` para Cloudflare.
- [ ] Probar la primera ejecución autorizada del Cron y un borrado real **sobre archivos sintéticos en un entorno aislado**; en la fecha de activación no existían archivos vencidos y no se ejecutó ninguna eliminación. Monitorear el primer cron y su observabilidad antes de promover a `production`.

Fuente: `docs/product/file-retention.md`; despliegue: `docs/development/cloudflare-retention.md`.

## Servicios residenciales

- [ ] Definir valor, duración, programación e informe aplicables a Clientes Casa antes de incluir sus ubicaciones internas en el catálogo de programación.

## Ejecución MIP

- [x] Documentar la eliminación del motor genérico de formularios y definir la ejecución por Áreas, Criterios, Dispositivos y snapshots históricos.
- [x] Retirar por completo el motor legacy de formularios MIP de BD, API y frontend mediante la migración 011.
- [x] Definir la implementación mínima necesaria para ejecutar y finalizar el primer Servicio Principal según `docs/product/service-execution.md`.
- [x] Implementar la fundación de ejecución: inicio online desde una hora antes, snapshots, Productos administrativos de solo lectura, bloqueo persistente por celular, liberación administrativa, idempotencia y RLS.
- [x] Implementar la superficie mobile-first del Técnico y preparación durable del paquete por usuario/Servicio.
- [ ] Implementar autosave/outbox offline, recorrido, evaluaciones, revisiones de Dispositivos, Hallazgos y evidencias sobre la fundación autoritativa.
- [ ] Implementar firmas a pantalla completa, revisión de pendientes y finalización idempotente con confirmación del servidor.
- [x] Diseñar en Figma el orden editable del recorrido por Servicio, en claro/oscuro, con Subir/Bajar, Aplicar/Cancelar, restablecimiento y navegación a la siguiente Área pendiente; documentar en `docs/product/service-area-route.md`.
- [x] Implementar el recorrido editable según `docs/product/service-area-route.md`: orden compartido por Servicio, persistencia local/sincronización idempotente, validación de pertenencia y permutación completa, concurrencia, siguiente pendiente con vuelta al inicio y validaciones de casos límite. No modificar el orden de la Sede ni reintroducir formularios legacy.
- [x] Implementar evaluación `C/CP/NC/NA` y observación por Criterio MIP con autosave, outbox offline compartida, bloqueo del celular, idempotencia y resolución explícita de conflicto de versión.
- [x] Implementar la excepción de Área sin acceso con descripción y fotografía obligatorias, persistencia offline del archivo, carga autorizada a `sr-service-media`, idempotencia, concurrencia y limpieza de reemplazos.

## Informes técnicos MIP

- [x] Conservar consultas administrativas de resultados, criterios, puestos, hallazgos, firmas y URLs privadas para evidencias.
- [x] Descartar la generación automática de PDF de informes y limpiar código backend/frontend, datos PDF y dependencias nativas.
- [x] Publicar API sin `sharp`/`libvips` en Neon `desarrollo`: deployment 36 activo (2026-10-09), 10 variables privadas preservadas; `/health` OK y acceso administrativo sin JWT responde 401. Migración `20261009_001_remove_service_report_pdf.sql` aplicada, 10 Servicios y 1 certificado conservados.
- [ ] Ejecutar smoke autenticado de resultados, integración real de Gmail/Calendar, certificados y R2 tras este despliegue; no enviar correo ni modificar objetos sin autorización de prueba.
- [ ] Implementar después página pública HTML de informe por enlace de solo lectura revocable y con vencimiento.
- [x] Implementar el informe HTML administrativo desde Servicios → Historial, con fotografías contextualizadas, imágenes de las dos firmas, indicadores, histórico e impresión A4/Guardar PDF del navegador. No guardar PDFs en R2.
- [x] Permitir envío desde el informe administrativo: seleccionar correos de cliente/sede, añadir destinatarios y adjuntar certificados ya generados del servicio (opcional).
- [x] Incorporar página pública de solo lectura mediante enlace de 90 días, revocable, fotos y firmas protegidas; correo Gmail auditado e idempotente.
- [x] Incorporar QR PNG en el correo junto al botón HTML «Abrir aquí», mensaje y asunto editables en componente reutilizable compacto.
- [ ] Integrar posteriormente el QR en las plantillas PDF de certificado, la finalización del técnico y el contacto genérico de Clientes.
- [ ] Ejecutar smoke real autorizado del envío y acceso público en Neon desarrollo.
- [ ] Definir UX de fotografías vencidas en informe público conforme a retención de R2.
- [ ] Conectar certificados automáticos al cierre únicamente en una entrega separada y aprobada.

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
- [x] Actualizar BD/API/frontend para retirar la restricción actual de Refuerzo a +20 días exactos y soportar propuesta inicial +21 días con reprogramación libre.
- [x] Implementar reprogramación transaccional conjunta de Principal + Refuerzo, manteniendo reprogramación independiente del Refuerzo.
- [x] Implementar Próximos por confirmar como preagenda separada de `servicios`, con estados, contactos por WhatsApp/correo, badge de próximos siete días y acción Agendar precargada.

- [x] Implementar agenda/historial, detalle, formulario compartido, productos previstos, cobro separado de recaudo real, cancelación auditada y recuperación de borradores por usuario.
- [x] Integrar Calendar/Gmail mediante outbox con revisiones, control de duplicados y entrega incierta; retirar escrituras administrativas legacy.
- [x] Revisar e integrar PR #23 en `develop`, conservando los cambios recientes de documentación y marca. Merge: `3b6fd56cf5e060da4024d00a215c36880bac42d1` (2026-10-07).
- [x] Aplicar `20261007_001_admin_services.sql` en Neon `desarrollo` (`br-nameless-violet-b7y48a5v`), base `neondb`, a las 12:24:41 UTC del 2026-10-07. DDL y registro en `app_meta.schema_migrations` guardados en una transacción; SHA-256 `d567c9e2df9b5f241b3a03db3655796ddd67f3b8bd0abdb21bf798940b6d855e`. Verificados 13 registros de migración, cuatro nuevos triggers de Servicios, RLS/permisos de preagenda y los cuerpos de las funciones aplicadas. Los dos Servicios y cuatro jobs existentes se conservaron; no se generaron nuevos jobs externos.
- [x] Conservar respaldo previo sin compute: `backup-pre-pr23-servicios-20261007` (`br-tiny-block-b7plkedn`). No eliminarlo automáticamente.
- [x] Desplegar la nueva API en Neon `desarrollo` (deployment 21) conservando las variables privadas existentes y activar `services-outbox` sobre `/jobs/services`. Cron definitivo: `0 13-23 * * *` UTC, equivalente a una ejecución por hora de 8:00 a. m. a 6:00 p. m. en Colombia. El trigger queda como respaldo del procesamiento inmediato posterior al guardado.
- [ ] Santiago realizará las pruebas de funcionamiento en desarrollo: OAuth, invitaciones/cambios/cancelaciones de Calendar, correo explícitamente autorizado y recuperación por trigger real. En la revisión y migración no se enviaron correos ni invitaciones de prueba.

- [x] Refinar UX administrativa de Servicios: receptor de efectivo Administrador/Técnico, breadcrumb navegable, filtros compactos en desktop y agenda semanal horaria. Los nuevos rangos rápidos de fecha y el componente de rango/calendario quedan fuera de este cambio.
- [x] Integrar PR #24 en `develop`. Merge: `957fe5c2a2e4c770bac018585dc824a8ca75fd04`.
- [x] Aplicar `20261007_002_generic_cash_receiver.sql` en Neon `desarrollo` con SHA-256 `3c655f5b9ee8b77a022b5319a6e917cd4c3f38d1529e798b40655433cdc30d4c`. Se conservaron los 4 Servicios y los 6 jobs existentes; `recaudado_por_id` quedó sincronizado con la columna legacy sin incrementar versiones históricas.
- [x] Desplegar API actualizada en Neon `desarrollo` como deployment 22, conservando las variables privadas existentes. El trigger `services-outbox` continúa habilitado con cron `0 13-23 * * *`.
- [x] Conservar respaldo previo sin compute: `backup-pre-services-ux-20261007` (`br-still-dew-b7z82p1t`).
- [x] Añadir rangos rápidos de fecha en Servicios: Ayer, Hoy, Mañana, Esta semana (lunes–domingo) y Este mes, inmediatamente debajo del selector de rango y sin acoplarlos a la lógica interna del datepicker.
- [ ] Retirar `tecnico_que_recauda_id` en una migración posterior cuando la versión con `recaudado_por_id` esté estable en los entornos desplegados; hasta entonces se mantiene espejada solo para rollback.

Detalle técnico y comandos de verificación: `docs/architecture/admin-services.md`.

- [x] Reemplazar las barras horizontales del informe MIP por tendencias SVG interactivas: cumplimiento en línea y suma de capturas de todas las plagas en columnas, con valores, fechas, hover/touch y PDF A4 legible; sin nuevas dependencias ni cambios de DB.

- [x] Envío opcional del informe desde cierre técnico con correos precargados offline, editor reutilizado, outbox IndexedDB, sincronización posterior al cierre confirmado y reintento idempotente al reconectar; estados pendientes y revisión de entrega incierta.
- [ ] Verificar un correo real controlado desde cierre técnico en desarrollo, incluyendo prueba sin internet y reconexión, antes del uso con clientes.

# Retención automática de archivos: Cloudflare Cron

**Estado:** migración aplicada en Neon `desarrollo` y Worker `sr-storage-retention-dev` creado en Cloudflare. **Sin secreto, sin Cron activado y sin despliegue de API actualizado: no hay borrado activo.** Política funcional: [Conservación de evidencias y documentos MIP](../product/file-retention.md).

## Decisión de infraestructura

El **programador y ejecutor del job** será un Cloudflare Worker independiente, con un `scheduled()` invocado por un **Cron Trigger diario**. No usar Neon scheduled triggers para este fin. La SPA de producción `soluciones-radicales` continúa como Static Assets sin `main`; no añadir cron ni lógica de archivos a su `wrangler.jsonc`.

Nombres propuestos:
- Worker de cron: `sr-storage-retention` (separado de la SPA).
- Horario: `0 7 * * *` UTC, una ejecución diaria a las 02:00 hora de Bogotá.
- Buckets con archivos candidatos: `sr-service-media` (fotografías) y `sr-generated-documents` (informes). `sr-master-files` queda excluido.
- Entornos: configuración/credenciales y pruebas separadas de desarrollo/producción. Nunca apuntar un cron de desarrollo a los buckets de producción.

## Contrato de operación recomendado

1. El Cloudflare Worker invoca un endpoint **privado** del backend Neon con un secreto compartido en Workers Secrets/Neon Secrets; el backend valida origen/autorización y limita el lote. La programación no vive en Neon.
2. PostgreSQL calcula fechas de vencimiento a partir de `fin_real`, `fecha_apertura`, `fecha_cierre` e `informe_generado_at`, con el tratamiento especial de hallazgos. El backend bloquea/reclama candidatos con lease, evita expedientes en curso y protege retenciones explícitas.
3. El Worker toma solo claves confirmadas, con bucket y prefijo validados; elimina objetos individuales usando bindings privados de R2. **Nunca** borrar un prefijo/servicio completo.
4. Cada resultado se confirma mediante el backend en un registro centralizado de estado por archivo, manteniendo rutas históricas/metadatos sin enlaces inválidos. Un 404 de R2 se trata como éxito idempotente. Errores de servicio/R2 quedan reintentables.
5. Antes de cada `delete`, revalidar elegibilidad y, especialmente, un posible cierre concurrente de hallazgo: un cierre antes del vencimiento amplía la retención de la apertura hasta 3 meses después del cierre. Si no se puede resolver la concurrencia de forma segura, **no borrar** y reintentar después.
6. Dry-run inicial obligatorio: registrar candidatos y volumen previsto; verificar visualmente los tipos y plazos antes de autorizar eliminación.
7. Aplicar límites por ejecución (por ejemplo, 20–50 objetos) y continuar al día siguiente o en lotes adicionales controlados. Poner alarmas si el backlog de objetos expirados o el almacenamiento total aumenta.

### Configuración real en desarrollo

- Directorio versionado: `cloudflare/storage-retention/`.
- Worker remoto creado: `sr-storage-retention-dev`. Desplegado como módulo aislado, con `RETENTION_MODE=dry-run` y URL de Neon Functions desarrollo.
- `wrangler.jsonc` contiene el cron previsto `0 7 * * *`, pero el Cron Trigger **aún no está instalado en Cloudflare**. Esto evita ejecuciones fallidas mientras el endpoint de Neon no haya sido desplegado y autorizado.
- El secreto compartido no se configura desde conversaciones ni se registra en Git. Ejecutar **localmente** `node scripts/cloudflare/setup-retention-secret.mjs` sobre la rama Neon `desarrollo` autorizada; instala el secreto en el Worker y su SHA-256 en PostgreSQL.
- Desplegar la versión actualizada de la función Neon `api` usando `npx -y neon@6.2.4 deploy --env <archivo-local>`, conservando las variables actuales. No usar `--env` con un archivo sin todas las credenciales existentes.
- Con el endpoint operativo y dry-run validado, activar el trigger desde el directorio del Worker con `npx wrangler deploy --config cloudflare/storage-retention/wrangler.jsonc`. Mantener `RETENTION_MODE=dry-run` en la primera prueba. Para activar borrado, cambiar la configuración versionada a `delete`, desplegar de nuevo y comprobar logs. No activar sin verificar las referencias de R2 y la compatibilidad de Neon.
- La migración `20261008_002_storage_retention.sql` se aplicó en Neon `desarrollo`; el esquema aún no está en production.

### Datos y compatibilidad actual

Estado observado de `develop` al 2026-10-08:
- `public.revisiones_dispositivos.foto_storage_path`.
- `public.servicio_areas.sin_acceso_foto_storage_path`.
- `public.evaluaciones_mip_area.evidencias_storage_paths` (JSONB).
- `public.hallazgos.evidencias_apertura_storage_paths` y `evidencias_cierre_storage_paths` (JSONB), con `fecha_apertura`, `fecha_cierre` y `estado`.
- `public.servicios.informe_pdf_storage_path` y `informe_generado_at` (campos definidos; flujo de generación de informe pendiente de confirmar/terminar).
- `src/services/serviceMediaService.ts` optimiza fotografías antes de subida. `functions/api/r2.ts` genera rutas privadas `services/{id}/...`; imágenes, hallazgos y firmas comparten bucket/prefijo principal.
- La limpieza existente en `functions/api/certificates/cleanup.ts` trata huérfanos documentales: **no** equivale a la nueva política de vencimiento.

Antes del cron productivo hacen falta una migración aditiva del registro de objetos/expiración, backfill de referencias existentes, endpoints privados de claim/confirmación, código del Worker, tests e integración de disponibilidad en UI. No alterar migraciones históricas aplicadas ni borrar referencias de forma que se pierda trazabilidad.

### Seguimiento y seguridad

- Guardar fecha, tipo, vencimiento calculado, resultado, reintentos, errores y volumen liberado; exponer informe solo administrativo.
- Alertas de uso global R2: 70% y 85% del presupuesto interno de **8 GB**; reservas para hallazgos pendientes y maestros.
- No eliminar PDFs protegidos por obligaciones legales, certificados, planos, fichas, firmas u otros archivos no aprobados para esta tarea.
- Fallo seguro: ante error de backend, R2, reloj/fecha, cruce de referencias o ambigüedad de estado, mantener archivo y reintentar.
- No confiar únicamente en lifecycle rules por antigüedad del objeto: las reglas de negocio dependen de PostgreSQL y pueden cambiar al cerrarse un hallazgo.
- Probar con datos sintéticos, y desplegar primero el entorno de desarrollo; el Worker no debe activarse hasta contar con el backend compatible, pruebas de concurrencia y validación explícita de los candidatos en dry-run.

## Documentación oficial

- Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Precios R2 y nivel gratuito: https://developers.cloudflare.com/r2/pricing/
- Límites Workers Free: https://developers.cloudflare.com/workers/platform/limits/

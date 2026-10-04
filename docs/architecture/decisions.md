# Decisiones de arquitectura

Este archivo registra decisiones permanentes. Las tareas pendientes se mantienen en `tasks.md`.

## ADR-001 · Plataforma

- **Estado:** Supersedida por ADR-018
- **Fecha:** 2026-10-04
- **Decisión original:** Cloudflare Pages servía el frontend; Neon proveía PostgreSQL, Managed Better Auth, Data API y Functions; Cloudflare R2 almacenaba archivos; Google APIs proveía Gmail y Calendar.
- **Consecuencia:** La elección de Pages fue reemplazada el mismo día por Workers + Static Assets; el resto de la plataforma se mantiene.

## ADR-002 · Desarrollo de base con ramas Neon

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Los cambios de esquema se desarrollan y validan en ramas Neon asociadas al trabajo en Git.
- **Consecuencia:** Las migraciones viven en `database/migrations/`, se validan con `npm run db:check`, se inspeccionan con `npm run db:diff` y se aplican con `npm run db:migrate` únicamente sobre la rama autorizada.

## ADR-003 · Reutilización frontend

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Componentes, composables, stores, helpers, services y tipos compartidos forman la fundación del frontend.
- **Consecuencia:** Las vistas ensamblan capacidades existentes y se evita duplicación.

## ADR-004 · Propiedad del estado

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Estado efímero local; comportamiento reactivo reutilizable en composables; estado entre rutas en Pinia; PostgreSQL es fuente de verdad persistente.
- **Consecuencia:** No se crean stores por componente ni copias completas de tablas sin necesidad.

## ADR-005 · Acceso remoto desde frontend

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Todo I/O remoto pasa por `services`. La SPA usa Neon Auth/Data API para operaciones permitidas por RLS; las operaciones con secretos o privilegios usan Neon Functions.
- **Consecuencia:** Vistas y componentes no acoplan directamente lógica de proveedor.

## ADR-006 · Una empresa operadora

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Soluciones Radicales es la única empresa operadora. `negocios` representa clientes, no tenants.
- **Consecuencia:** No se agrega `tenant_id` ni infraestructura multiempresa.

## ADR-007 · Usuarios y rol activo

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Neon Auth gestiona identidad/sesión; `usuarios` autoriza el acceso interno y conserva roles Administrador/Técnico. Un usuario puede tener ambos y opera con uno activo por sesión.
- **Consecuencia:** El backend y RLS validan identidad y rol. Antes de persistir el mecanismo del rol activo se inspeccionará el payload real de `auth.session()` para no depender de claims inventados.

## ADR-008 · Acceso público

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** La consulta pública usa una operación limitada y un token aleatorio almacenado como hash, revocable y válido hasta un año después de `fin_real`.
- **Consecuencia:** La página pública no obtiene acceso general a `servicios` ni a archivos privados.

## ADR-009 · Almacenamiento y retención

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Cloudflare R2 es el almacenamiento de objetos. Buckets: `sr-master-files`, `sr-service-media`, `sr-generated-documents`.
- **Consecuencia:** Fotos/firmas operativas se eliminan siete días después de validar el documento final; PDF generados se conservan hasta un año; archivos maestros mientras estén activos.

## ADR-010 · Gmail y Calendar

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Gmail y Calendar operan únicamente mediante `solucionesradicales1@gmail.com`.
- **Consecuencia:** Los usuarios no autorizan recursos personales y los secretos permanecen en backend.

## ADR-011 · Integraciones tolerantes a fallos

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Los efectos externos son asíncronos, reintentables e idempotentes.
- **Consecuencia:** Un fallo de Gmail, Calendar, R2 o generación documental no revierte una operación interna ya validada.

## ADR-012 · Datos iniciales

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** No se migran registros de los Spreadsheets a producción. Los anteriores solo pueden convertirse en seeds de prueba.
- **Consecuencia:** Producción recibe bootstrap mínimo y datos maestros aprobados.

## ADR-013 · Datos estructurados y moneda

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** El histórico estructurado se conserva indefinidamente y los valores monetarios se almacenan como enteros en COP.
- **Consecuencia:** Expirar archivos o tokens no elimina el histórico estructurado.

## ADR-014 · Operación offline

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** La SPA conserva localmente borradores y operaciones después de perder conexión, si fue cargada y autenticada previamente.
- **Consecuencia:** Las entidades sincronizables usan IDs estables, versión, idempotencia y resolución explícita de conflictos.

## ADR-015 · Autoridad del servidor

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Roles, consecutivos, valores, relaciones, transiciones y autorización se derivan y validan en PostgreSQL o backend.
- **Consecuencia:** La interfaz puede anticipar validaciones por UX, pero no reemplaza la validación autoritativa.

## ADR-016 · Respuestas de formularios agrupadas en JSONB

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Se reemplaza el modelo de una fila por campo de `respuestas_mip` por una fila por Servicio + Formulario + Versión + Área, con las respuestas de campos agrupadas en JSONB.
- **Consecuencia:** Se reduce drásticamente la cantidad de filas, claves e índices repetidos. `formularios` continúa normalizado y versionado para poder interpretar el histórico.

## ADR-017 · Migraciones independientes del proveedor

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** La fuente de migraciones es `database/migrations/`, no una carpeta propia de un proveedor.
- **Consecuencia:** El nombre obligatorio es `YYYYMMDD_NNN_descripcion.sql`; las migraciones aplicadas son inmutables y se registran con checksum.

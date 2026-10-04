# Decisiones de arquitectura

Este archivo registra decisiones permanentes. Las tareas pendientes se mantienen en `tasks.md`.

## ADR-001 · Plataforma

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Cloudflare Pages sirve el frontend; Supabase provee Auth, PostgreSQL y Storage; Google APIs provee Gmail y Calendar.
- **Consecuencia:** La SPA permanece estática y las operaciones con secretos se ejecutan en RPC o Edge Functions.

## ADR-002 · Desarrollo remoto sin Docker

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** El desarrollo de base de datos usa el proyecto remoto de Supabase enlazado mediante la CLI.
- **Consecuencia:** Las migraciones se validan con `npm run db:lint` y se aplican con `npm run db:push`. No se requieren contenedores ni stack local.

## ADR-003 · Reutilización frontend

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Componentes, composables, stores, helpers, services y tipos compartidos se consideran parte de la fundación del frontend.
- **Consecuencia:** Las vistas ensamblan capacidades existentes. La segunda aparición de lógica o interfaz equivalente obliga a reutilizar o extraer antes de duplicar.

## ADR-004 · Propiedad del estado

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** El estado efímero permanece local; el comportamiento reactivo reutilizable vive en composables; el estado entre rutas o procesos vive en Pinia; PostgreSQL es la fuente de verdad.
- **Consecuencia:** No se crean stores por componente ni se duplican tablas completas en memoria sin una necesidad demostrable.

## ADR-005 · Acceso remoto desde frontend

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Todo acceso remoto del frontend pasa por `services`. Las operaciones sensibles usan RPC o Edge Functions.
- **Consecuencia:** Vistas y componentes no importan el cliente Supabase directamente y los errores se normalizan en un solo lugar.

## ADR-006 · Una empresa operadora

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Soluciones Radicales es la única empresa operadora. `negocios` representa clientes atendidos, no tenants.
- **Consecuencia:** No se agrega `tenant_id` ni infraestructura multiempresa.

## ADR-007 · Usuarios y rol activo

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Solo Administradores y Técnicos tienen cuentas. El usuario inicial `solucionesradicales1@gmail.com` tiene ambos roles y selecciona uno por sesión.
- **Consecuencia:** El backend y RLS validan el rol activo; la selección del navegador no concede permisos.

## ADR-008 · Acceso público

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** La consulta pública usa una RPC limitada y un token aleatorio almacenado como hash, revocable y válido hasta un año después de `fin_real`.
- **Consecuencia:** La página pública no consulta directamente `servicios` ni recibe datos internos.

## ADR-009 · Almacenamiento y retención

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Supabase Storage es el almacenamiento principal y todos los buckets son privados.
- **Consecuencia:** Imágenes operativas: siete días después de validar el documento final. PDF generados: un año. Archivos maestros: mientras estén activos.

## ADR-010 · Gmail y Calendar

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Gmail y Calendar operan únicamente mediante `solucionesradicales1@gmail.com`, una cuenta personal dedicada a la empresa.
- **Consecuencia:** La aplicación OAuth es externa, el refresh token permanece cifrado en backend y los usuarios no autorizan recursos personales.

## ADR-011 · Integraciones tolerantes a fallos

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Los efectos externos son asíncronos, reintentables e idempotentes.
- **Consecuencia:** Un fallo de Gmail, Calendar o generación documental no revierte ni bloquea la operación interna ya validada.

## ADR-012 · Datos iniciales

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** No se migran registros de los Spreadsheets a producción. Los datos anteriores se convierten únicamente en seeds de prueba.
- **Consecuencia:** Producción recibe solo el primer usuario, configuración global, catálogos aprobados y formularios oficiales.

## ADR-013 · Datos estructurados y moneda

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** El histórico estructurado se conserva indefinidamente y los valores monetarios se almacenan como enteros en COP.
- **Consecuencia:** La expiración de archivos o tokens no elimina registros; no se agrega columna de moneda mientras el sistema sea exclusivamente COP.

## ADR-014 · Operación offline

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** La SPA conserva localmente borradores y operaciones después de perder conexión, siempre que haya sido cargada y autenticada previamente.
- **Consecuencia:** Las entidades sincronizables usan UUID, versión, idempotencia y resolución explícita de conflictos.

## ADR-015 · Autoridad del servidor

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Roles, consecutivos, valores, relaciones, transiciones y autorización se derivan y validan en PostgreSQL, RPC o Edge Functions.
- **Consecuencia:** La interfaz puede anticipar validaciones para UX, pero el servidor repite y decide todas las reglas relevantes.

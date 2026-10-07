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
- **Consecuencia:** El backend y RLS validan identidad y rol. `auth.user_id()` retorna `text`; `auth.session()` no incluye un identificador de la sesión Better Auth. El baseline usa el contexto verificable `sub + iat + exp`, por lo que una renovación del JWT exige renovar la selección de rol activo.

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

- **Estado:** Supersedida por ADR-019
- **Fecha:** 2026-10-04
- **Decisión original:** Se reemplazaba el modelo de una fila por campo de `respuestas_mip` por una fila por Servicio + Formulario + Versión + Área, con las respuestas de campos agrupadas en JSONB.
- **Consecuencia histórica:** El baseline original creó `formularios` y `respuestas_formulario`; ADR-019 y la migración 011 retiraron ese modelo.

## ADR-017 · Migraciones independientes del proveedor

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** La fuente de migraciones es `database/migrations/`, no una carpeta propia de un proveedor.
- **Consecuencia:** El nombre obligatorio es `YYYYMMDD_NNN_descripcion.sql`; las migraciones aplicadas son inmutables y se registran con checksum.


## ADR-018 · Cloudflare Workers + Static Assets

- **Estado:** Aprobada
- **Fecha:** 2026-10-04
- **Decisión:** Cloudflare Workers + Static Assets reemplaza a Cloudflare Pages como plataforma de despliegue de la SPA.
- **Motivo:** Workers permite comenzar con assets estáticos y ampliar posteriormente con bindings, rutas edge y otras capacidades sin migrar de plataforma.
- **Implementación inicial:** `wrangler.jsonc` publica `./dist` con `not_found_handling = "single-page-application"` y no declara un script `main`.
- **Consecuencia:** La SPA permanece estática en esta fase. No se ejecuta código Worker dinámico para servir los assets. Cualquier Worker futuro debe responder a una necesidad concreta y preferir rutas selectivas.
- **Despliegue:** Cloudflare Builds ejecuta `npm run build` y luego `npx wrangler deploy`; los preview builds permanecen habilitados.


## ADR-019 · Ejecución MIP sin motor genérico de formularios

- **Estado:** Aprobada
- **Fecha:** 2026-10-06
- **Decisión:** La ejecución técnica no usa un constructor, definición ni versionado administrativo de formularios. La interfaz es estable y se compone directamente desde Servicio, Sede, Áreas, Criterios MIP, Productos, Dispositivos, Plagas, Hallazgos, Evidencias y Firmas.
- **Criterios:** Los criterios son un catálogo administrable independiente. Conservan identidad estable, nombre, estado y aplicabilidad exclusiva a Áreas externas/perimetrales cuando corresponda; se presentan alfabéticamente y no tienen orden administrable. `C/CP/NC/NA` y sus reglas de cálculo son constantes del dominio.
- **Histórico:** Al iniciar un Servicio se congelan los datos necesarios para interpretar posteriormente la evaluación y las revisiones, sin depender del nombre, estado o composición futura de los catálogos.
- **Monitoreo:** Los dispositivos permanecen como entidades de Sede/Área y cada Servicio crea revisiones; no se modelan como campos de formulario.
- **Transición completada:** `20261006_011_remove_legacy_mip_forms.sql` elimina `formularios`, `respuestas_formulario`, `formularios_aplicables_json` y `formularios_versiones_json` sin modificar migraciones ya aplicadas.
- **Referencia:** La composición funcional se especifica en `docs/product/service-execution.md`.

## ADR-020 · Inicio autoritativo y exclusividad móvil del Servicio

- **Estado:** Aprobada
- **Fecha:** 2026-10-07
- **Decisión:** La ejecución inicial aplica únicamente a Servicios `PRINCIPAL` de Sedes Negocio. Iniciar requiere conexión y confirmación del servidor desde una hora antes de la programación.
- **Snapshot:** La misma transacción crea la composición congelada de Áreas, Criterios, Dispositivos y Productos, registra `inicio_real` y cambia el estado a `EN_PROCESO`.
- **Exclusividad:** Un bloqueo persistente por Servicio, usuario y dispositivo permite un solo celular editor. No expira por inactividad; un Administrador puede liberarlo mediante una operación idempotente y auditada.
- **Productos:** El Administrador completa lote, dosis y método. El Técnico los consulta en modo de solo lectura y el inicio congela su significado histórico.
- **Offline:** La preparación puede almacenarse antes, pero no autoriza edición. El trabajo offline comienza después del inicio online confirmado.
- **Autoridad:** Neon Function valida rol, asignación, versión, tipo, estado, ventana temporal y completitud de Productos. RLS limita la lectura de snapshots y no concede escritura directa al rol autenticado.

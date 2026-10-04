# AGENTS.md

## Propósito

Este repositorio reconstruye Soluciones Radicales MIP como una SPA rápida, mantenible y orientada al trabajo de campo.

La arquitectura aprobada es:

- Cloudflare Workers + Static Assets para publicar el frontend Vue/Vite.
- Neon para PostgreSQL, Managed Better Auth, Data API y Functions.
- Cloudflare R2 para archivos privados y documentos generados.
- Google APIs para Gmail y Calendar mediante la cuenta empresarial.

Supabase no forma parte de la arquitectura activa. La aplicación anterior es referencia funcional, no técnica.

## Fuentes de verdad

Consultar en este orden:

1. `docs/product/` para comportamiento funcional y reglas de negocio.
2. `docs/ux-guidelines.md` para interacción y arquitectura de información.
3. `docs/design-system.md` para componentes, tokens, responsive y accesibilidad visual.
4. `docs/frontend/reuse.md` para reutilización, componentes, composables y stores.
5. `docs/architecture/` para decisiones técnicas vigentes.
6. `database/README.md` para reglas de esquema y migraciones.
7. Linear para alcance, prioridad, dependencias y estado.
8. Código y pruebas como evidencia de lo implementado.

No inventar requisitos. Ante una contradicción, detener únicamente la parte afectada.

## Antes de implementar

- Partir de `main` actualizado salvo instrucción contraria.
- Leer la issue completa y comprobar el comportamiento solicitado.
- Revisar reglas, entidades y criterios de aceptación afectados.
- Inspeccionar el flujo existente cuando ya sea ejecutable.
- Buscar piezas reutilizables antes de crear otras.
- Identificar qué estado es local, compartido, remoto o persistido.
- No adelantar issues ni funcionalidades futuras.
- Registrar en `tasks.md` una mejora aprobada que quede fuera del alcance.

## Reutilización frontend

- Las vistas ensamblan; no concentran acceso a datos ni reglas repetidas.
- Crear primitivas compartidas para botones, campos, selectores, diálogos, loadings, vacíos, errores, toasts y confirmaciones.
- Extraer a composables comportamiento Vue reutilizable.
- Usar Pinia solo para estado compartido entre rutas o procesos.
- Mantener helpers puros.
- Centralizar Neon Auth/Data API y otros I/O en `services`; componentes y vistas no consultan proveedores directamente.
- Centralizar tipos de dominio y contratos.
- Extraer una segunda implementación equivalente antes de aceptar duplicación.

## Autoridad y seguridad

- La interfaz nunca es autoridad para roles, permisos, precios, consecutivos, estados o relaciones.
- Toda tabla accesible mediante Data API debe tener RLS y privilegios mínimos.
- Para identidad en RLS usar las capacidades de Neon Data API/`pg_session_jwt`, preferentemente `auth.user_id()` y `auth.session()`.
- No asumir nombres de claims de sesión: verificarlos en el entorno Neon real antes de depender de ellos.
- La SPA nunca contiene `DATABASE_URL`, credenciales de R2, secretos de Google ni claves administrativas.
- El acceso público usa una operación limitada y token aleatorio, hasheado, revocable y con vencimiento.
- Los archivos permanecen privados y se entregan mediante backend autorizado o URL firmada de corta duración.
- Mantener auditoría append-only para eventos sensibles.

## Neon y datos

- PostgreSQL de Neon es la fuente de verdad estructurada.
- Managed Better Auth provee identidad; el registro de aplicación en `usuarios` sigue decidiendo si una identidad está autorizada y qué roles internos posee.
- Data API es la vía HTTP desde la SPA y trabaja con JWT + RLS.
- Functions ejecuta operaciones que requieren secretos o privilegios y las integraciones asíncronas.
- No usar una conexión PostgreSQL administrativa desde el navegador.
- Las migraciones activas viven exclusivamente en `database/migrations/`.
- Formato obligatorio: `YYYYMMDD_NNN_descripcion.sql`.
- Nunca modificar una migración aplicada; crear otra.
- Ejecutar `npm run db:check` después de modificar SQL.
- Ejecutar `npm run db:migrate` únicamente sobre la rama Neon autorizada.
- Usar ramas Neon para aislar cambios de esquema; producción corresponde a la rama Neon aprobada para producción.
- Separar bootstrap productivo y seeds de prueba.
- Los Spreadsheets anteriores son datos de prueba; no se migran automáticamente.
- Usar UUID estables para entidades del dominio e idempotencia/control de versión en operaciones sincronizables.
- Los identificadores de Neon Auth se tratan con el tipo real expuesto por `neon_auth`/`auth.user_id()`; no asumir UUID.
- Conservar montos en COP como enteros.
- No agregar multitenancy.

## Respuestas de formularios

- `formularios` define campos y versiones de forma normalizada.
- Las respuestas históricas se agrupan por Servicio + formulario + versión + Área.
- No crear una fila PostgreSQL por cada campo respondido.
- Cada grupo conserva las respuestas de campos en JSONB, incluyendo valor, evaluación, observación y referencias a evidencias cuando apliquen.
- El documento histórico debe permanecer interpretable contra la versión exacta del formulario.

## Cloudflare Workers

- La SPA se despliega con Workers Static Assets usando `wrangler.jsonc`.
- El build de Vue sigue generando `dist/`; Wrangler publica ese directorio.
- Mantener `assets.not_found_handling = "single-page-application"` para soportar Vue Router al recargar rutas internas.
- En la fase actual no existe un Worker dinámico `main`: las peticiones de la SPA deben resolverse como assets estáticos.
- No agregar un Worker runtime, rutas `/api/*` ni `run_worker_first` salvo que una necesidad real de edge/backend lo justifique.
- Si posteriormente se agrega código Worker, mantener los assets como ruta predeterminada y ejecutar el Worker solo en rutas explícitas cuando sea posible.
- Las variables `VITE_*` son públicas y se inyectan en build; secretos y credenciales nunca usan prefijo `VITE_`.
- R2 puede enlazarse mediante bindings de Worker cuando exista código backend Cloudflare; mientras tanto los secretos R2 permanecen fuera de la SPA.

## Cloudflare R2

- R2 es el almacén de archivos; PostgreSQL guarda claves/rutas y metadatos, no blobs.
- Buckets privados: `sr-master-files`, `sr-service-media`, `sr-generated-documents`.
- Imágenes operativas: eliminar siete días después de validar el documento final.
- PDF generados: conservar hasta un año.
- Archivos maestros: conservar mientras estén activos.
- Acceso y firma de URLs ocurren en backend; nunca exponer credenciales R2 al navegador.

## Google APIs

- Gmail y Calendar operan exclusivamente desde backend con `solucionesradicales1@gmail.com`.
- Los efectos externos son asíncronos, idempotentes y reintentables.
- Un fallo externo no impide guardar la operación interna.
- No registrar tokens ni secretos en logs.

## UX obligatoria

- Diseñar mobile-first para el Técnico.
- Mantener contexto Negocio → Sede → Área → Servicio.
- Usar loading, toast, confirmación y errores globales.
- Prevenir doble envío y preservar datos ante fallos.
- Toda pantalla contempla carga, contenido, vacío, error y reintento.
- Formularios largos no van en modales.
- Controles táctiles de al menos 44 px.

## Código

- Vue 3, TypeScript, Composition API, Pinia y Vue Router.
- Preferir `<script setup lang="ts">`.
- Evitar `any`, estado global mutable fuera de Pinia y efectos ocultos.
- No duplicar validaciones, formatos, mapeos de errores ni consultas.
- No introducir dependencias sin uso real.
- No dejar código muerto, mocks o compatibilidad temporal.
- No hacer refactors generales fuera de alcance.

## Pruebas y validación

Antes de terminar una tarea:

- `npm run lint`;
- `npm run test:unit:run`;
- `npm run build`;
- `npm run db:check` si cambió SQL;
- `npm run db:diff` antes de proponer un cambio de esquema ya aplicado a una rama Neon;
- pruebas E2E afectadas cuando exista flujo navegable;
- revisión visual desktop/mobile;
- validación de RLS con rol aplicable;
- limpieza de datos y archivos temporales.

## Git y entrega

- Cambios pequeños y trazables.
- No hacer merge ni desplegar a producción sin autorización explícita.
- No mezclar issues independientes.
- Actualizar documentación y pruebas junto con el comportamiento.
- Informar: rama/PR, commit, pruebas, validación real, estado de merge/producción y bloqueos.

## Definición de terminado

Una tarea termina cuando cumple criterios, respeta arquitectura y UX, pasa validaciones proporcionales al riesgo, no deja residuos y actualiza la documentación afectada.

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
7. Código y pruebas como evidencia de lo implementado.

No inventar requisitos. Ante una contradicción, detener únicamente la parte afectada.

## Antes de implementar

- Partir de `origin/develop` actualizado salvo autorización explícita para trabajar sobre otra base.
- Leer el alcance aprobado en `docs/` y comprobar el comportamiento solicitado.
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
- Crear y Editar comparten formulario y validación cuando sus campos son equivalentes.
- Editar usa el snapshot ya cargado cuando contiene los campos necesarios; create/update actualizan con la respuesta definitiva sin recargar toda la colección.

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

## Ejecución MIP

- No crear ni extender un motor genérico de formularios para la operación MIP.
- La pantalla del Técnico se compone desde Servicio, Sede, Áreas, Criterios MIP, Productos, Dispositivos, Plagas, Hallazgos, Evidencias y Firmas.
- Los Criterios MIP son catálogo administrable; `C/CP/NC/NA` y sus reglas de cálculo son constantes del dominio.
- Un Área externa incorpora los criterios exclusivos de exterior además de los generales.
- Al iniciar un Servicio, conservar snapshots suficientes para que cambios posteriores de criterios, plagas o dispositivos no reinterpreten el histórico.
- Los dispositivos son entidades permanentes de Sede/Área y sus revisiones pertenecen al Servicio; no son campos dinámicos.
- El modelo legacy de formularios MIP fue retirado por la migración `20261006_011_remove_legacy_mip_forms.sql`.
- No reintroducir `formularios`, `respuestas_formulario`, `formularios_aplicables_json` ni `formularios_versiones_json`.
- Leer `docs/product/service-execution.md` antes de implementar ejecución técnica o monitoreo.

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
- En desktop administrativo priorizar densidad y área útil: metadatos secundarios no deben desplazar listas, tablas o historiales innecesariamente bajo el fold.
- Todo celular visible y accionable usa el componente compartido de WhatsApp con icono inline y número; no duplicar un botón de WhatsApp separado.
- Los nombres de entidades navegables usan color normal de texto y comunican interacción mediante cursor, hover/focus y subrayado, no mediante color de acento permanente.
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

- `develop` es la rama permanente de integración y la base normal de todo trabajo nuevo.
- Crear cada rama de feature/fix desde `origin/develop` actualizado, nunca desde `main`, salvo autorización explícita.
- Todo PR de desarrollo debe apuntar a `develop` por defecto.
- `main` queda reservada para producción y solo recibe cambios mediante un PR de promoción `develop` → `main` autorizado explícitamente por Santiago.
- Antes de iniciar una nueva tarea, ejecutar el equivalente a `git fetch origin` y basar la rama nueva en el último `origin/develop` para no reimplementar trabajo ya integrado.
- Si una tarea ya comenzó desde una base anterior, actualizarla con `develop` antes de duplicar funcionalidad existente y resolver cualquier conflicto de forma explícita.
- Cambios pequeños y trazables.
- No hacer merge a `main` ni desplegar a producción sin autorización explícita.
- No mezclar issues independientes.
- Actualizar documentación y pruebas junto con el comportamiento.
- Informar: rama/PR, commit, pruebas, validación real, estado de merge/producción y bloqueos.

## Definición de terminado

Una tarea termina cuando cumple criterios, respeta arquitectura y UX, pasa validaciones proporcionales al riesgo, no deja residuos y actualiza la documentación afectada.

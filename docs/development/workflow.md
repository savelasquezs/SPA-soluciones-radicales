# Flujo de desarrollo

## Inicio de una tarea

1. Ejecutar `git fetch origin` y confirmar que `origin/develop` está actualizado.
2. Crear la rama de trabajo desde `origin/develop`; no usar `main` como base salvo autorización explícita.
3. Confirmar issue y alcance.
4. Leer `AGENTS.md` y documentación aplicable.
5. Verificar dependencias y decisiones.
6. Revisar código y flujo actual.
7. Buscar piezas reutilizables antes de implementar para no repetir trabajo ya integrado.
8. Definir pruebas y evidencia antes de editar.

## Cambios de base de datos

1. Crear una migración nueva en `database/migrations/`.
2. Nombrarla `YYYYMMDD_NNN_descripcion.sql`.
3. No editar migraciones que ya figuren en `app_meta.schema_migrations`.
4. Revisar restricciones, índices, RLS, grants, funciones y compatibilidad con Neon.
5. Ejecutar `npm run db:check`.
6. Confirmar con `npm run db:status` que el repo está enlazado al proyecto y rama Neon correctos.
7. Revisar `npm run db:diff` cuando corresponda.
8. Aplicar con `npm run db:migrate` únicamente sobre el entorno autorizado.
9. Verificar comportamiento con los roles aplicables.
10. Limpiar datos temporales.

No incluir SQL específico de Supabase como `auth.users`, `storage.buckets` o `service_role`.

El runner de migraciones crea `app_meta.schema_migrations` y registra nombre + checksum. Si un archivo aplicado cambia, la ejecución falla.

## Ramas Neon

- `production` de Neon queda reservada para producción.
- Desarrollo usa ramas hijas.
- Un cambio de esquema importante debe aislarse en una rama Neon antes de tocar producción.
- El checkout de Git no cambia automáticamente la rama Neon: verificar ambas.
- No aplicar migraciones a producción sin autorización explícita.

## Auth y RLS

Antes de implementar políticas que dependan de claims concretos:

1. habilitar Managed Better Auth;
2. habilitar Data API;
3. autenticar un usuario de prueba;
4. inspeccionar `auth.user_id()` y `auth.session()` desde una petición autenticada;
5. documentar los campos realmente disponibles;
6. recién entonces implementar el rol activo por sesión.

No asumir que un identificador de Neon Auth es UUID.

## Seeds y bootstrap

- `database/bootstrap/`: datos estructurales requeridos por producción.
- `database/seeds/`: datos ficticios de desarrollo/prueba.
- Un seed debe ser repetible.
- Nunca ejecutar seeds demostrativos en producción.
- No incluir archivos reales, tokens ni datos sensibles.

## Validación local

```bash
npm run lint
npm run test:unit:run
npm run build
npm run db:check
```

Cuando exista una base Neon enlazada:

```bash
npm run db:status
npm run db:diff
```

## Validación visual

Comprobar carga, contenido, vacío, error/reintento, guardado, preservación ante fallos, prevención de doble acción, navegación, teclado/foco, móvil sin overflow y consola limpia.

## Validación remota

Distinguir:

- pruebas unitarias locales;
- build local;
- rama Neon de desarrollo;
- preview de Cloudflare Workers;
- producción.

Una validación en una capa no demuestra las demás.

## Datos temporales

Crear los mínimos, identificarlos claramente y eliminarlos incluso tras fallos. No modificar registros reales para facilitar pruebas.

## Ramas Git

- `develop` es la rama permanente de integración y acumula el trabajo aprobado de desarrollo.
- Toda rama `codex/*`, feature o fix parte de `origin/develop` actualizado.
- Los PR normales apuntan a `develop`.
- `main` representa producción y no se usa como rama cotidiana de integración.
- La promoción a producción se realiza mediante PR `develop` → `main` únicamente cuando Santiago lo autorice.
- Después de integrar un PR a `develop`, las tareas nuevas deben refrescar `origin/develop` antes de crear su rama.

## Pull requests

- Una issue por PR salvo decisión explícita.
- Incluir código, pruebas y documentación.
- El destino normal es `develop`.
- No hacer merge a `main` sin autorización explícita.
- No modificar producción para validar desarrollo.

## Entrega

Informar rama/PR, commit, pruebas, validación remota/visual, estado de producción/merge y bloqueos.

## Verificación de pull requests

`SPA verification` reemplaza los cuatro workflows de certificados, servicios, catálogos y optimización de archivos. Conserva la unión de sus filtros de rutas; `scripts/ci/verification-paths.json` mantiene la selección de cada suite. Los cambios al workflow unificado o a sus scripts ejecutan todas las suites. La selección usa el diff desde el ancestro común del PR, con historial completo; un error al resolverlo falla el job en vez de omitir pruebas.

- Un job frontend instala dependencias y ejecuta lint, unitarias, build y comprobación de migraciones una sola vez. Instala Chromium una sola vez y reutiliza el build para las suites seleccionadas.
- La prueba E2E de optimización de archivos corre una sola vez cuando la selecciona su filtro o el de certificados.
- Servicios y certificados comparten una ejecución de las comprobaciones SQL en PostgreSQL descartable. Catálogos conserva otra base independiente: vuelve a aplicar las migraciones antes de su bootstrap y sus pruebas. No se comparte una base ya mutada entre ambas suites.
- Las pruebas de navegador continúan aunque falle otra suite; sus resultados tienen directorios separados. Se conservan los artefactos `services-review`, `certificate-test-results` y `mip-catalogs-qa`, con siete días de retención.
- El lanzamiento manual permite elegir una suite o `all`; por defecto ejecuta servicios, igual que el workflow manual anterior.
- Para validar la selección sin instalar dependencias: `node --test scripts/ci/test-select-verification.mjs` (Node 24).

Cuando todas las suites aplican, lint/unitarias/build pasan de cuatro ejecuciones a una, Chromium de cuatro instalaciones a una, y las comprobaciones SQL de certificados de tres ejecuciones a dos. Se mantienen todos los casos de prueba. Los workflows Neon API bundle, retention y documentation-video son independientes y no cambian.

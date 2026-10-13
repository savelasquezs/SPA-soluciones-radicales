# Soluciones Radicales MIP

SPA para la gestión administrativa y técnica de servicios de Manejo Integrado de Plagas.

## Arquitectura

- Vue 3, TypeScript, Pinia y Vue Router.
- Cloudflare Workers + Static Assets para publicar la SPA y sus previews.
- Neon para PostgreSQL, Managed Better Auth, Data API y Functions.
- Cloudflare R2 para fotografías, firmas, evidencias, archivos maestros e informes/certificados PDF.
- Google APIs para Gmail y Calendar.
- IndexedDB para borradores y cola offline del navegador.

Supabase ya no forma parte de la arquitectura activa.

## Configuración

```bash
npm install
```

Copiar `.env.example` como `.env`. Las únicas variables de Neon que puede consumir directamente la SPA son:

```env
VITE_NEON_AUTH_URL=
VITE_NEON_DATA_API_URL=
VITE_NEON_FUNCTION_URL=
```

`DATABASE_URL`, credenciales de R2 y secretos de Google son secretos de servidor y nunca llevan prefijo `VITE_`.

## Neon CLI

El repositorio no exige una instalación global. Los scripts fijan la versión de la CLI mediante `npx`.

Primera configuración local:

```bash
npx -y neon@6.2.4 auth
npx -y neon@6.2.4 link
npx -y neon@6.2.4 env pull
```

Antes de trabajar en una rama de base de datos, seleccionar o crear la rama Neon correspondiente con `neon checkout`.

## Desarrollo

```bash
npm run dev
```

## Cloudflare Workers

La SPA se publica como **Workers Static Assets**. `wrangler.jsonc` apunta a `./dist` y usa fallback SPA para Vue Router.

Desarrollo/preview del artefacto Cloudflare:

```bash
npm run cloudflare:dev
```

Despliegue manual:

```bash
npm run cloudflare:deploy
```

En Cloudflare Builds usar:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Preview builds: activados
- Cloudflare Access: desactivado salvo decisión posterior

Las variables `VITE_*` requeridas por la SPA se configuran como variables de build. No colocar secretos de servidor en variables públicas.

## Validación

```bash
npm run lint
npm run test:unit:run
npm run build
npm run db:check
```

Para revisar el estado y diferencias del esquema Neon:

```bash
npm run db:status
npm run db:diff
```

## Migraciones

Las migraciones activas viven en `database/migrations/` y siguen:

```text
YYYYMMDD_NNN_descripcion.sql
```

Ejemplo:

```text
20261004_001_initial_schema.sql
20261004_002_integrity_and_rls.sql
20261004_003_fix_correlated_rls_policies.sql
20261004_004_mvp_backend_support.sql
```

Aplicarlas únicamente sobre la rama Neon autorizada:

```bash
npm run db:migrate
```

El runner registra cada archivo y su checksum en `app_meta.schema_migrations`. Una migración aplicada no se modifica: se crea una nueva.

El bootstrap mínimo de un entorno autorizado es idempotente y se ejecuta, también solo sobre la rama Neon autorizada, con:

```bash
npm run db:bootstrap
```

## Documentación

- [Instrucciones para agentes](AGENTS.md)
- [Mapa documental](docs/README.md)
- [Arquitectura](docs/architecture/overview.md)
- [Decisiones técnicas](docs/architecture/decisions.md)
- [Base de datos y migraciones](database/README.md)
- [Configuración de Neon](docs/development/neon-setup.md)
- [**Runbook de despliegue de la API Neon (CLI o conector)**](docs/development/neon-functions-deploy.md)
- [Despliegue con Cloudflare Workers](docs/development/cloudflare-workers.md)
- [Videos del manual de usuario](docs/development/documentation-videos.md)
- [Reutilización frontend](docs/frontend/reuse.md)
- [Flujo de desarrollo](docs/development/workflow.md)
- [UX](docs/ux-guidelines.md)
- [Sistema de diseño](docs/design-system.md)
- [Producto](docs/product/README.md)
- [Tareas aprobadas](tasks.md)

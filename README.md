# Soluciones Radicales MIP

SPA para la gestión administrativa y técnica de servicios de Manejo Integrado de Plagas.

## Arquitectura

- Vue 3, TypeScript, Pinia y Vue Router.
- Cloudflare Pages para publicar la SPA.
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
```

Aplicarlas únicamente sobre la rama Neon autorizada:

```bash
npm run db:migrate
```

El runner registra cada archivo y su checksum en `app_meta.schema_migrations`. Una migración aplicada no se modifica: se crea una nueva.

## Documentación

- [Instrucciones para agentes](AGENTS.md)
- [Mapa documental](docs/README.md)
- [Arquitectura](docs/architecture/overview.md)
- [Decisiones técnicas](docs/architecture/decisions.md)
- [Base de datos y migraciones](database/README.md)
- [Reutilización frontend](docs/frontend/reuse.md)
- [Flujo de desarrollo](docs/development/workflow.md)
- [UX](docs/ux-guidelines.md)
- [Sistema de diseño](docs/design-system.md)
- [Producto](docs/product/README.md)
- [Tareas aprobadas](tasks.md)

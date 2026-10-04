# Soluciones Radicales MIP

SPA para la gestión administrativa y técnica de servicios de Manejo Integrado de Plagas.

## Arquitectura

- Vue 3, TypeScript, Pinia y Vue Router.
- Cloudflare Pages para el frontend.
- Supabase Auth, PostgreSQL y Storage para backend y persistencia.
- Supabase RPC y Edge Functions para operaciones privilegiadas.
- Google APIs para Gmail y Calendar.

El proyecto no usa Docker. El desarrollo trabaja con el proyecto remoto de Supabase enlazado mediante la CLI.

## Configuración

```bash
npm install
```

Copiar `.env.example` como `.env` y completar:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

La clave publicable puede llegar al navegador. Nunca agregar `service_role`, secretos de Google ni refresh tokens a variables `VITE_*`.

## Desarrollo

```bash
npm run dev
```

## Validación

```bash
npm run lint
npm run test:unit:run
npm run build
npm run db:lint
```

## Migraciones

```bash
npm run db:push
```

Las migraciones se aplican al proyecto remoto enlazado. Confirmar siempre el entorno antes de ejecutarlas. Los cambios de esquema no se realizan manualmente en el dashboard.

## Documentación

- [Instrucciones para agentes](AGENTS.md)
- [Mapa documental](docs/README.md)
- [Arquitectura](docs/architecture/overview.md)
- [Decisiones técnicas](docs/architecture/decisions.md)
- [Reutilización frontend](docs/frontend/reuse.md)
- [Flujo de desarrollo](docs/development/workflow.md)
- [UX](docs/ux-guidelines.md)
- [Sistema de diseño](docs/design-system.md)
- [Producto](docs/product/README.md)
- [Tareas aprobadas](tasks.md)

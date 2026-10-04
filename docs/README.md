# Documentación

La documentación versionada es la referencia viva de Soluciones Radicales MIP.

## Fuentes de verdad

| Tema | Fuente |
|---|---|
| Reglas y comportamiento | `docs/product/` |
| Interacción y navegación | `docs/ux-guidelines.md` |
| Componentes y estilo visual | `docs/design-system.md` |
| Reutilización frontend | `docs/frontend/reuse.md` |
| Arquitectura y decisiones | `docs/architecture/` |\n| Base de datos y migraciones | `database/README.md` |
| Proceso de implementación | `docs/development/workflow.md` |
| Estado de ejecución | Linear |
| Comportamiento implementado | Código y pruebas |

## Jerarquía

Ante una contradicción se debe detener la parte afectada y resolverla. El código no modifica silenciosamente una regla funcional para acomodar una implementación.

La aplicación anterior y sus Spreadsheets son referencia histórica. La documentación de producto conserva el comportamiento aprobado; la arquitectura técnica vigente es Neon + Cloudflare R2 + Cloudflare Pages.

## Estructura

```text
docs/
├── README.md
├── design-system.md
├── ux-guidelines.md
├── architecture/
│   ├── decisions.md
│   └── overview.md
├── development/
│   ├── neon-setup.md
│   └── workflow.md
├── frontend/
│   └── reuse.md
└── product/
    └── README.md
```

## Gobierno de cambios

- Una regla funcional cambia en `docs/product/` junto con su implementación.
- Una decisión técnica cambia en `docs/architecture/decisions.md`.\n- Una convención de esquema o migraciones cambia en `database/README.md`.
- Un patrón reutilizable cambia en `docs/frontend/reuse.md`.
- Un criterio transversal de interacción cambia en `docs/ux-guidelines.md`.
- Un token o componente visual cambia en `docs/design-system.md`.
- Una mejora aprobada fuera de alcance se registra en `tasks.md`.
- No duplicar la misma regla en varios documentos; enlazar su fuente principal.

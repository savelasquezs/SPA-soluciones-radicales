# Documentación

La documentación versionada es la referencia viva de Soluciones Radicales MIP.

## Fuentes de verdad

| Tema | Fuente |
|---|---|
| Reglas y comportamiento | `docs/product/` |
| Interacción y navegación | `docs/ux-guidelines.md` |
| Componentes y estilo visual | `docs/design-system.md` |
| Reutilización frontend | `docs/frontend/reuse.md` |
| Arquitectura y decisiones | `docs/architecture/` |
| Base de datos y migraciones | `database/README.md` |
| Proceso de implementación | `docs/development/workflow.md` |
| **Despliegue de la API Neon** | **`docs/development/neon-functions-deploy.md`** |
| Producción de videos de usuario | `docs/development/documentation-videos.md` y `docs/development/user-manual-video-standard.md` |
| Estado de implementación | `tasks.md`, código y pruebas |
| Comportamiento implementado | Código y pruebas |

## Jerarquía

Ante una contradicción se debe detener la parte afectada y resolverla. El código no modifica silenciosamente una regla funcional para acomodar una implementación.

La aplicación anterior y sus Spreadsheets son referencia histórica. La documentación de producto conserva el comportamiento aprobado; la arquitectura técnica vigente es Neon + Cloudflare R2 + Cloudflare Workers.

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
│   ├── cloudflare-workers.md
│   ├── documentation-videos.md
│   ├── neon-setup.md
│   ├── neon-functions-deploy.md
│   ├── user-manual-video-standard.md
│   └── workflow.md
├── frontend/
│   └── reuse.md
└── product/
    ├── README.md
    ├── certificates.md
    ├── mip-catalogs.md
    └── service-execution.md
```

Los storyboards ejecutables de cada video viven junto a sus pruebas en `e2e/documentation/`.

## Gobierno de cambios

- Una regla funcional cambia en `docs/product/` junto con su implementación.
- Una decisión técnica cambia en `docs/architecture/decisions.md`.
- Una convención de esquema o migraciones cambia en `database/README.md`.
- Un patrón reutilizable cambia en `docs/frontend/reuse.md`.
- Un criterio transversal de interacción cambia en `docs/ux-guidelines.md`.
- Un token o componente visual cambia en `docs/design-system.md`.
- Una regla editorial de videos cambia en `docs/development/user-manual-video-standard.md`.
- El alcance y orden de un video cambia en su `e2e/documentation/*.storyboard.md`.
- Una mejora aprobada fuera de alcance se registra en `tasks.md`.
- No duplicar la misma regla en varios documentos; enlazar su fuente principal.

### Almacenamiento y retención

- [Plazos y tratamiento especial de Hallazgos](product/file-retention.md).
- [Automatización diaria mediante Cloudflare Worker](development/cloudflare-retention.md).

### Certificados

- [Comportamiento manual y variables](product/certificates.md).
- [Motor, configuración privada y comprobación de despliegue](architecture/certificates.md).

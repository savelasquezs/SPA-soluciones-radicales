# Base de datos

Neon PostgreSQL es la fuente de verdad de datos estructurados.

## Estructura

```text
database/
├── README.md
├── migrations/
│   └── README.md
├── bootstrap/
│   └── README.md
└── seeds/
    └── README.md
```

- `migrations/`: cambios de esquema, funciones, índices, grants y RLS.
- `bootstrap/`: datos mínimos requeridos por cualquier entorno funcional.
- `seeds/`: datos ficticios de desarrollo y pruebas.

## Convención de migraciones

```text
YYYYMMDD_NNN_descripcion.sql
```

Baseline activo y extensiones del MVP:

```text
20261004_001_initial_schema.sql
20261004_002_integrity_and_rls.sql
20261004_003_fix_correlated_rls_policies.sql
20261004_004_mvp_backend_support.sql
20261004_005_usuario_certificado_fechas_obligatorias.sql
```

`NNN` es secuencial dentro del día. La descripción usa minúsculas y guion bajo.

No se crean migraciones vacías. El baseline se creó después de enlazar el proyecto, habilitar Managed Better Auth/Data API y verificar en la rama `desarrollo` el contexto real de `auth.user_id()` y `auth.session()`.

## Inmutabilidad

Una migración aplicada es inmutable. `npm run db:migrate` registra:

- nombre del archivo;
- SHA-256 del contenido;
- fecha de aplicación.

El registro vive en `app_meta.schema_migrations`. Si cambia el checksum de una migración aplicada, el runner falla.

## Compatibilidad Neon

SQL activo no debe contener dependencias de Supabase como:

- `auth.users`;
- `storage.buckets`;
- `service_role`;
- roles `anon`.

Para Data API, los roles esperados son `authenticated` y `anonymous`, y la identidad se obtiene mediante el contexto JWT de Neon.

## Modelo de formularios

`formularios` conserva definición normalizada y versionada de campos.

La respuesta histórica se agrupa en `respuestas_formulario` con una fila por:

```text
servicio_id + formulario_id + version_formulario + area_id
```

y un objeto `respuestas_jsonb` con las respuestas de los campos.

## Ejecución

```bash
npm run db:check
npm run db:status
npm run db:diff
npm run db:migrate
```

El repo debe estar enlazado a Neon mediante `neon link`. Confirmar siempre la rama Neon antes de migrar. Los runners de migración y bootstrap bloquean `production` salvo autorización explícita mediante `ALLOW_NEON_PRODUCTION=true`.

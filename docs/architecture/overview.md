# Arquitectura

## Objetivo

Soluciones Radicales MIP administra el ciclo completo de servicios de Manejo Integrado de Plagas con una SPA ágil en escritorio y móvil. La arquitectura separa interfaz, datos estructurados y archivos para mantener costos bajos y límites claros.

## Componentes

| Componente | Responsabilidad |
|---|---|
| Cloudflare Workers + Static Assets | Publicar la SPA y previews sin ejecutar lógica dinámica para las rutas estáticas |
| Vue 3 | Interfaz, navegación y composición |
| Pinia | Estado compartido entre rutas y procesos |
| Neon Managed Better Auth | Inicio de sesión con Google e identidad |
| Neon PostgreSQL | Fuente de verdad de datos estructurados |
| Neon Data API | Acceso HTTPS/PostgREST a PostgreSQL con JWT + RLS |
| PostgreSQL RLS | Autorización de lectura/escritura por identidad y rol |
| PostgreSQL functions | Operaciones transaccionales cercanas a los datos |
| Neon Functions | Integraciones y operaciones con secretos |
| Cloudflare R2 | Evidencias, firmas, maestros y documentos generados |
| Google APIs | Gmail y Calendar de la cuenta empresarial |
| IndexedDB | Borradores y cola offline del navegador |

## Flujo principal

```text
Cloudflare Workers + Static Assets
  └─ Vue SPA
      ├─ Neon Managed Better Auth
      ├─ Neon Data API + PostgreSQL RLS
      └─ Neon Functions
          ├─ PostgreSQL privilegiado cuando corresponda
          ├─ Cloudflare R2
          ├─ Gmail API
          └─ Calendar API
```

La SPA solo recibe endpoints públicos de Auth/Data API. Las cadenas PostgreSQL, credenciales R2 y secretos de Google permanecen fuera del navegador.

## Arquitectura frontend

```text
src/
├── components/
│   ├── base/
│   ├── layout/
│   └── domain/
├── composables/
├── helpers/
├── router/
├── services/
├── stores/
├── types/
└── views/
```

Dependencias:

```text
views
  → components/domain
  → components/base

views / composables / stores
  → services
  → Neon / backend

helpers y types
  ← reutilizables por todas las capas
```

Las vistas coordinan. Los componentes base no conocen proveedores. Los services son el único punto de I/O remoto del frontend.

## Estado

| Estado | Ubicación |
|---|---|
| Visual y efímero | `ref` / `reactive` local |
| Reutilizable en un flujo | composable |
| Compartido entre rutas | Pinia |
| Datos persistentes | Neon PostgreSQL |
| Borradores y operaciones offline | IndexedDB |
| Archivos binarios | Cloudflare R2 |
| Secretos | Neon Secrets / Cloudflare Secrets según runtime |

PostgreSQL continúa siendo la fuente de verdad estructurada.

## Autenticación y roles

Los usuarios internos ingresan con Google mediante Neon Managed Better Auth. Neon conserva identidad y sesiones en el esquema administrado `neon_auth`.

La tabla de dominio `usuarios` determina qué identidad está autorizada a usar Soluciones Radicales y si tiene rol Administrador, Técnico o ambos. Un usuario con dos roles utiliza uno activo por sesión.

La autorización efectiva vive en servidor/PostgreSQL. Ocultar una acción en la interfaz no concede ni revoca permisos.

Los IDs de Neon Auth se modelan con el tipo realmente expuesto por Neon; no se asumen UUID.

## Datos y autorización

Las tablas funcionales conservan el modelo de negocio. Las tablas privadas soportan leases, sincronización offline, trabajos externos y metadatos técnicos.

- RLS se habilita en toda tabla accesible desde Data API.
- Las políticas usan el contexto JWT provisto por Neon, principalmente `auth.user_id()` y `auth.session()`.
- Los nombres concretos de claims de sesión se verifican contra el proyecto Neon antes de crear dependencias permanentes.
- Las relaciones, transiciones y valores derivados se validan en PostgreSQL o Functions.
- Auditoría es append-only.
- Las entidades del dominio usan UUID estables e idempotencia cuando aplica.

## Ejecución MIP

La operación técnica no utiliza un motor genérico de formularios. La SPA compone la pantalla del Servicio directamente desde las entidades del dominio.

```text
Servicio
  ├─ Productos previstos/aplicados
  └─ Áreas de la Sede
      ├─ Criterios MIP aplicables
      ├─ Dispositivos y revisiones
      └─ Hallazgos y evidencias
  └─ Firmas y cierre
```

Los Criterios MIP son catálogo administrable. Las Áreas externas reciben además los criterios exclusivos de exterior. Los valores `C/CP/NC/NA` y sus reglas de cálculo son constantes del dominio.

Al iniciar un Servicio se conservan snapshots suficientes de criterios, dispositivos y opciones de monitoreo para que un cambio posterior de catálogo no altere el histórico. La persistencia histórica no depende de reconstruir una versión de formulario.

La migración `20261006_011_remove_legacy_mip_forms.sql` retiró las tablas y columnas del modelo anterior de formularios. El histórico MIP futuro no depende de versiones de formulario.

## Archivos

Cloudflare R2 reemplaza a Supabase Storage. Los buckets privados son:

- `sr-master-files`: planos, fichas, plantillas y certificados vigentes de técnicos.
- `sr-service-media`: fotografías, evidencias y firmas operativas.
- `sr-generated-documents`: certificados PDF generados; no informes MIP.

PostgreSQL almacena únicamente claves/rutas, metadatos y estado del archivo.

Las imágenes se optimizan en el navegador antes de subirlas. Los certificados se convierten a PDF mediante Google Drive; los informes MIP son datos estructurados para HTML.

Retención:

- fotografías de revisiones, áreas y criterios: tres meses después de finalizar el Servicio;
- fotografías de Hallazgos pendientes: un año máximo desde apertura; tras cierre, tres meses desde cierre para apertura y corrección si siguen disponibles;
- informes MIP: no se persiste ningún PDF; las evidencias fotográficas siguen la retención propia;
- certificados, firmas y maestros: políticas separadas, sin borrado por esta regla;
- registros históricos estructurados: permanentes.

La política completa y los casos límite se especifican en `docs/product/file-retention.md`. La limpieza programada dependerá de un **Cloudflare Worker con Cron Trigger independiente** (`docs/development/cloudflare-retention.md`), no de Neon scheduled triggers ni del Worker Static Assets de la SPA. Esta automatización todavía debe implementarse y desplegarse.

## Cloudflare Workers y assets estáticos

La primera versión se despliega como un Worker de **Static Assets únicamente**, sin script `main`.

`wrangler.jsonc` define:

- `assets.directory = "./dist"`;
- `assets.not_found_handling = "single-page-application"`.

Esto conserva la SPA como contenido estático, permite recargar rutas de Vue Router y deja preparado el proyecto para añadir capacidades de Worker cuando exista una necesidad concreta.

Si posteriormente se agregan endpoints Cloudflare, se prefieren rutas explícitas como `/api/*` y ejecución selectiva del Worker, evitando que las navegaciones y assets estáticos invoquen código dinámico innecesariamente.

## Integraciones

Gmail y Calendar usan exclusivamente `solucionesradicales1@gmail.com`. El refresh token nunca llega al navegador.

Los efectos externos se modelan como trabajos idempotentes y reintentables. Guardar un Servicio no depende de que Google o R2 estén disponibles en ese instante.

## Trabajo offline

La aplicación debe cargarse y autenticarse antes de perder conexión.

- IndexedDB conserva borradores, archivos pendientes y operaciones.
- Cada operación tiene ID estable e idempotente.
- El servidor revalida permisos, versión e integridad.
- Cambios independientes pueden combinarse.
- Un conflicto del mismo dato no se sobrescribe silenciosamente.
- Evidencias nuevas se tratan como adiciones independientes.

## Entornos y despliegue

- Frontend: Cloudflare Workers + Static Assets.
- Base/Auth/Data API/Functions: Neon.
- Archivos: Cloudflare R2.
- Desarrollo de esquema: ramas Neon.
- Producción: rama Neon explícitamente designada y protegida.
- Toda modificación del esquema se versiona en `database/migrations/`.
- No se usa Docker ni una instancia PostgreSQL local como requisito.
- Producción no se modifica sin autorización explícita.

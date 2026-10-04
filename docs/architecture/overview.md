# Arquitectura

## Objetivo

Soluciones Radicales MIP administra el ciclo completo de servicios de Manejo Integrado de Plagas con una SPA ágil en escritorio y móvil. La arquitectura separa interfaz, datos estructurados y archivos para mantener costos bajos y límites claros.

## Componentes

| Componente | Responsabilidad |
|---|---|
| Cloudflare Pages | Publicar la SPA y previews |
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
Cloudflare Pages
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

## Respuestas MIP

`formularios` conserva la definición versionada de secciones y campos.

Las respuestas históricas no se almacenan como una fila por campo. Se agrupan por:

```text
Servicio + Formulario + Versión + Área
```

Cada fila contiene un objeto JSONB con las respuestas de sus campos. Cada campo puede conservar valor, evaluación, observación y referencias a evidencias.

Esto reduce filas e índices repetidos sin perder la capacidad de interpretar el histórico contra la versión exacta del formulario.

## Archivos

Cloudflare R2 reemplaza a Supabase Storage. Los buckets privados son:

- `sr-master-files`: planos, fichas, plantillas y certificados vigentes de técnicos.
- `sr-service-media`: fotografías, evidencias y firmas operativas.
- `sr-generated-documents`: informes y certificados generados.

PostgreSQL almacena únicamente claves/rutas, metadatos y estado del archivo.

Las imágenes se optimizan antes de persistir y los PDF se generan comprimidos.

Retención:

- fotografías y firmas operativas: siete días después de validar el documento final;
- informes y certificados PDF: hasta un año;
- archivos maestros: mientras estén activos.

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

- Frontend: Cloudflare Pages.
- Base/Auth/Data API/Functions: Neon.
- Archivos: Cloudflare R2.
- Desarrollo de esquema: ramas Neon.
- Producción: rama Neon explícitamente designada y protegida.
- Toda modificación del esquema se versiona en `database/migrations/`.
- No se usa Docker ni una instancia PostgreSQL local como requisito.
- Producción no se modifica sin autorización explícita.

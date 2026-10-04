# Arquitectura

## Objetivo

Soluciones Radicales MIP administra el ciclo completo de los servicios de Manejo Integrado de Plagas con una experiencia ágil en escritorio y móvil. La arquitectura mantiene el frontend estático y delega identidad, persistencia, autorización, archivos y procesos privilegiados a Supabase.

## Componentes

| Componente | Responsabilidad |
|---|---|
| Cloudflare Pages | Publicar la SPA, servir recursos estáticos y previews |
| Vue 3 | Interfaz, navegación y composición de módulos |
| Pinia | Estado compartido entre rutas y procesos |
| Supabase Auth | Inicio de sesión con Google e identidad de sesión |
| PostgreSQL | Fuente de verdad de datos estructurados |
| Row Level Security | Autorización de lectura por usuario y rol activo |
| RPC | Operaciones transaccionales y acceso público limitado |
| Edge Functions | Integraciones, secretos, archivos y trabajos privilegiados |
| Supabase Storage | Archivos privados y documentos generados |
| Google APIs | Gmail y Calendar de la cuenta empresarial |
| IndexedDB | Borradores y cola offline del navegador |

## Flujo principal

```text
Cloudflare Pages
  └─ Vue SPA
      ├─ Supabase Auth
      ├─ Data API protegida por RLS
      ├─ RPC transaccionales
      ├─ Storage privado
      └─ Edge Functions
          ├─ Gmail API
          ├─ Calendar API
          └─ procesamiento de archivos
```

La SPA solo utiliza la URL y clave publicable de Supabase. Los secretos permanecen en Supabase o en la configuración segura del entorno que los ejecuta.

## Arquitectura frontend

La estructura objetivo es:

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

Las dependencias avanzan en una sola dirección:

```text
views
  → components/domain
  → components/base

views / composables / stores
  → services
  → Supabase

helpers y types
  ← reutilizables por todas las capas
```

Reglas:

- Una vista coordina la pantalla y no contiene consultas repetidas ni lógica transversal.
- Un componente base no conoce Supabase, rutas ni entidades de negocio.
- Un componente de dominio puede conocer tipos de negocio, pero recibe datos y emite eventos.
- Un composable encapsula comportamiento reactivo reutilizable.
- Un store conserva estado compartido o de ciclo de vida superior a una vista.
- Un helper es puro y no depende de Vue.
- Un service es el único punto de entrada frontend para I/O remoto.

La guía detallada está en `docs/frontend/reuse.md`.

## Estado

| Estado | Ubicación |
|---|---|
| Visual y efímero de un componente | `ref` o `reactive` local |
| Reutilizable dentro de un flujo | composable |
| Compartido entre rutas o módulos | store Pinia |
| Datos persistentes | PostgreSQL |
| Borradores y operaciones offline | IndexedDB |
| Parámetros no sensibles | configuración persistida |
| Secretos | Supabase Secrets o proveedor seguro |

No se replica en Pinia una tabla completa sin una necesidad concreta. Los stores mantienen contexto, cachés acotadas y estado de proceso; PostgreSQL continúa siendo la fuente de verdad.

## Autenticación y roles

Los usuarios internos ingresan con Google mediante Supabase Auth. Solo los registros activos de `usuarios` pueden operar.

Los roles disponibles son Administrador y Técnico. Un usuario puede tener ambos, pero utiliza un único rol activo por sesión y puede cambiarlo sin cerrar sesión. El rol se valida en backend; ocultar una acción en la interfaz no constituye autorización.

Clientes, contactos y destinatarios son datos informativos y no tienen cuentas. El sistema no es multiempresa.

## Datos y autorización

Las 18 tablas funcionales documentadas conservan el modelo de negocio anterior. Las tablas técnicas privadas soportan sesiones, leases de edición, sincronización offline y trabajos externos.

- RLS está habilitada en todas las tablas públicas.
- Las lecturas se filtran por usuario y rol activo.
- Las escrituras de negocio se implementan mediante RPC transaccionales.
- Las relaciones, transiciones y valores derivados se validan en servidor.
- Auditoría es append-only.
- Los IDs son UUID estables y pueden generarse antes de sincronizar.

## Archivos

Los buckets son privados:

- `master-files`: planos, fichas, plantillas y certificados vigentes.
- `service-media`: fotografías, evidencias y firmas operativas.
- `generated-documents`: informes y certificados generados.

Las imágenes se optimizan antes de persistir y los PDF se generan comprimidos con librerías mantenidas. No se desarrollan códecs propios.

Las fotografías operativas se eliminan después de siete días únicamente cuando el documento final fue generado y validado. Los PDF generados se conservan hasta un año. Los archivos maestros permanecen mientras estén activos.

## Integraciones

Gmail y Calendar usan exclusivamente `solucionesradicales1@gmail.com`. El refresh token nunca llega al navegador.

Cada efecto externo se representa como un trabajo idempotente, reintentable y desacoplado de la escritura principal. Guardar un Servicio no depende de que Google esté disponible. El estado de sincronización y el último error se conservan para diagnóstico y reintento.

## Trabajo offline

La aplicación debe haberse cargado y autenticado antes de perder conexión.

- IndexedDB conserva borradores, archivos pendientes y operaciones.
- Cada operación tiene ID estable e idempotente.
- El servidor vuelve a validar permisos, versión e integridad.
- Cambios en campos distintos pueden combinarse.
- Un conflicto sobre el mismo campo no se sobrescribe silenciosamente.
- Evidencias nuevas se tratan como adiciones independientes.

El Service Worker podrá conservar el shell y recursos estáticos, pero no reemplaza autenticación, autorización ni la base de datos.

## Entornos y despliegue

- El frontend se valida localmente y se publica mediante previews de Cloudflare Pages.
- La base se desarrolla contra un proyecto remoto enlazado de Supabase.
- No se usa Docker ni Supabase local.
- Toda modificación de esquema se versiona como migración.
- Producción no se modifica sin autorización explícita.
- Un resultado local o preview no demuestra por sí solo el comportamiento productivo.

# Configuración de Neon

Esta guía configura el backend aprobado para Soluciones Radicales MIP.

## 1. Proyecto actual

El proyecto aprobado ya existe:

- proyecto: `patient-pine-80293508`;
- PostgreSQL 18;
- rama productiva: `production`;
- rama de desarrollo: `desarrollo`.

No crear otro proyecto ni aplicar cambios directamente sobre `production`.

## 2. Enlazar el repositorio

Desde la raíz del repo:

```bash
npx -y neon@6.2.4 auth
npx -y neon@6.2.4 link --project-id patient-pine-80293508 --branch desarrollo -y
```

`neon link` crea el contexto local `.neon`. Ese archivo es específico del desarrollador y no debe tratarse como configuración compartida.

## 3. Crear la rama de desarrollo

No desarrollar directamente sobre la rama productiva.

```bash
npx -y neon@6.2.4 checkout desarrollo
```

Para una feature aislada puede usarse, por ejemplo:

```bash
npx -y neon@6.2.4 checkout dev-formularios-jsonb
```

## 4. Habilitar Managed Better Auth

En Neon Console, habilitar **Auth / Managed Better Auth** sobre la rama de desarrollo.

Por CLI:

```bash
npx -y neon@6.2.4 neon-auth enable
```

Al habilitarlo Neon crea el esquema administrado `neon_auth` y un endpoint Auth específico para la rama.

## 5. Configurar Google OAuth

En Google Cloud:

1. crear o reutilizar el proyecto OAuth de Soluciones Radicales;
2. crear un cliente OAuth Web;
3. copiar exactamente la URL de callback/redirect que Neon muestra para Google;
4. registrarla como Authorized redirect URI;
5. guardar Client ID y Client Secret en Neon, nunca en la SPA.

En Neon puede iniciarse la configuración con:

```bash
npx -y neon@6.2.4 neon-auth oauth-provider add --provider-id google
```

La autenticación con Google no significa autorización automática. El usuario también debe existir y estar activo en la tabla de dominio `usuarios`.

La SPA solicita la URL OAuth con redirección desactivada en el cliente y navega explícitamente a la URL devuelta por Neon Auth. La acción **Usar otra cuenta** agrega `prompt=select_account` a esa URL ya firmada para volver al selector de Google sin ampliar scopes ni implementar autenticación propia.

## 6. Registrar dominios permitidos

Agregar primero desarrollo local:

```bash
npx -y neon@6.2.4 neon-auth domain add http://localhost:5173
```

Cuando exista URL definitiva de Cloudflare Workers, agregar también ese origen. Los previews solo se habilitan cuando sean necesarios.

## 7. Habilitar Data API

Habilitar Data API para la rama desde Neon Console o mediante `neon data-api`.

Data API debe utilizar Neon Auth como proveedor de identidad para que PostgreSQL reciba el JWT y RLS pueda usar `auth.user_id()` / `auth.session()`.

## 8. Descargar variables de entorno

```bash
npx -y neon@6.2.4 env pull
```

La SPA necesita únicamente:

```env
VITE_NEON_AUTH_URL=
VITE_NEON_DATA_API_URL=
VITE_NEON_FUNCTION_URL=
```

`DATABASE_URL` es solo para servidor/CLI y nunca debe importarse desde código Vite ejecutado en el navegador.

## 9. Verificar el contexto de identidad antes del baseline

Con un usuario autenticado mediante Data API, comprobar qué expone Neon realmente:

```sql
select auth.user_id();
select auth.session();
```

Documentar el resultado antes de implementar el rol activo por sesión. No asumir que el ID del usuario es UUID ni que existe un claim con un nombre concreto.

### Resultado verificado en desarrollo el 2026-10-04

- `auth.user_id()` retorna `text` y coincide con `sub`.
- `auth.session()` retorna `jsonb`.
- La sesión observada expone `id`, `sub`, `name`, `email`, `emailVerified`, `role`, `banned`, `banReason`, `banExpires`, `createdAt`, `updatedAt`, `iss`, `aud`, `iat` y `exp`.
- La sesión no expone el proveedor OAuth ni un identificador de la sesión Better Auth.
- `usuarios.auth_user_id` usa `text`, alineado con `auth.user_id()`.
- Google se valida contra `neon_auth.account.providerId`, no contra un claim inventado.
- El baseline identifica el contexto de rol con un hash de `sub + iat + exp`. El rol debe renovarse cuando Neon renueve el JWT.

## 10. Crear el baseline Neon

Después de la comprobación anterior se crearon:

```text
database/migrations/20261004_001_initial_schema.sql
database/migrations/20261004_002_integrity_and_rls.sql
```

El modelo debe incluir `respuestas_formulario` agrupada por Servicio + Formulario + Versión + Área con `respuestas_jsonb`; no recuperar el diseño anterior de una fila por campo.

Validar:

```bash
npm run db:check
npm run db:status
npm run db:diff
```

Aplicar solo sobre `desarrollo` o una rama de desarrollo aislada autorizada:

```bash
npm run db:migrate
```

El soporte operativo del MVP se completa con:

```text
database/migrations/20261004_003_fix_correlated_rls_policies.sql
database/migrations/20261004_004_mvp_backend_support.sql
database/bootstrap/20261004_001_initial_admin.sql
```

El bootstrap se ejecuta de forma idempotente únicamente después de confirmar la rama:

```bash
npm run db:bootstrap
```

## 11. Desplegar Functions

La Function `api` centraliza operaciones privilegiadas, Google OAuth, Gmail y Calendar. Sus secretos se cargan en Neon y no se exponen como variables `VITE_*`.

```bash
npx -y neon@6.2.4 deploy
```

`ALLOWED_ORIGINS` debe incluir solo los orígenes locales, productivos y de preview realmente autorizados.

## 12. Configurar Cloudflare R2 por separado

Neon Object Storage no será el almacenamiento de archivos de este proyecto.

Crear tres buckets privados en R2:

```text
sr-master-files
sr-service-media
sr-generated-documents
```

Las credenciales R2 se guardan solo en el runtime backend correspondiente.

## 13. Producción

Cuando el producto esté listo:

1. validar esquema y RLS en rama Neon de desarrollo;
2. validar Auth Google real;
3. validar Functions e integraciones;
4. revisar `npm run db:diff`;
5. aplicar/promover cambios a la rama Neon designada para producción únicamente con autorización explícita;
6. configurar Cloudflare Workers con los endpoints públicos de Auth/Data API de producción.

# Cloudflare Workers

Cloudflare Workers + Static Assets es la plataforma aprobada para publicar la SPA de Soluciones Radicales MIP.

## Decisión

La aplicación comienza como **Static Assets únicamente**. No existe script Worker dinámico `main` en esta fase.

Esto permite:

- servir el build de Vue/Vite desde `dist/`;
- soportar rutas de Vue Router mediante fallback SPA;
- usar previews por branch/PR;
- añadir posteriormente código Worker, bindings de R2 u otras capacidades sin migrar desde Pages.

## Configuración versionada

La raíz del repositorio contiene `wrangler.jsonc`:

```jsonc
{
  "name": "soluciones-radicales",
  "compatibility_date": "2026-10-04",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  },
  "previews": {}
}
```

No agregar `main` hasta que exista una necesidad real de ejecutar código Worker.

El bloque `previews` habilita `wrangler preview` para los despliegues aislados de ramas y PR.

El nombre coincide con el Worker existente conectado a este repositorio; cambiarlo crearía un despliegue separado. El prefijo `spa-` permanece en el nombre del repositorio, no en el recurso Worker vigente.

## Configuración en Cloudflare Builds

Conectar el repositorio GitHub `savelasquezs/SPA-soluciones-radicales`.

Usar:

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Preview builds: activados
- Cloudflare Access: desactivado inicialmente

Wrangler toma `dist/` desde `wrangler.jsonc`; no se configura otro output directory en el comando de despliegue.

## Variables de entorno

Las variables públicas necesarias por Vite se configuran en el entorno de build:

```text
VITE_NEON_AUTH_URL
VITE_NEON_DATA_API_URL
VITE_NEON_FUNCTION_URL
```

Todo valor `VITE_*` termina disponible para el navegador y, por tanto, nunca puede contener secretos.

No exponer:

- `DATABASE_URL`;
- secretos OAuth;
- credenciales de R2;
- tokens de Google;
- claves administrativas de Neon.

Los tres valores públicos deben existir tanto en Production como en Preview. La URL exacta de cada preview autorizado se registra además en los dominios confiables de Neon Auth y en `ALLOWED_ORIGINS` de la Function.

La configuración actual de Cloudflare Builds no entrega variables de build a los previews. Para que las ramas distintas de `main` sigan siendo verificables, `vite.config.ts` define únicamente durante `WORKERS_CI=1` los endpoints públicos de la rama Neon `desarrollo`. Este fallback:

- solo aplica si `WORKERS_CI_BRANCH` no es `main`;
- no contiene secretos;
- no reemplaza una variable `VITE_*` que Cloudflare sí haya definido;
- nunca configura endpoints productivos.

El build de `main` no tiene fallback y debe recibir explícitamente los tres endpoints públicos de la rama Neon productiva antes de cualquier despliegue de producción.

## Desarrollo

La aplicación normal se desarrolla con:

```bash
npm run dev
```

Para probar el artefacto que publicará Cloudflare:

```bash
npm run cloudflare:dev
```

Ese comando construye `dist/` y ejecuta Wrangler localmente.

## Despliegue manual

```bash
npm run cloudflare:deploy
```

Normalmente producción se despliega mediante la integración Git de Cloudflare al actualizar `main`.

## Preview del MVP

La rama Git `codex/mvp-e2e` se publica mediante Cloudflare Builds en:

```text
https://codex-mvp-e2e-soluciones-radicales.solucionesradicales1.workers.dev
```

La validación del 2026-10-04 confirmó:

- build y despliegue automático de commits de la rama;
- carga directa y recarga de `/usuarios` sin 404 del servidor;
- fallback a la vista 404 de Vue para rutas desconocidas;
- Auth, Data API y Functions de la rama Neon `desarrollo`;
- navegación autenticada desktop y mobile sin desbordamiento horizontal inesperado.

Este preview no cambia el Worker productivo ni la rama Neon `production`. La promoción de `main` y la configuración de endpoints productivos requieren autorización separada.

## SPA routing

`not_found_handling = "single-page-application"` es obligatorio mientras Vue Router maneje las rutas del cliente.

Rutas como:

```text
/usuarios
/servicios
/servicios/:id
```

deben poder abrirse directamente y recargarse sin devolver 404.

## Código Worker futuro

No agregar un Worker dinámico por anticipación.

Cuando exista una necesidad real —por ejemplo un endpoint edge o un binding directo de R2—:

1. documentar la decisión;
2. agregar un `main` explícito;
3. preferir rutas `/api/*`;
4. usar ejecución selectiva del Worker cuando aplique;
5. mantener assets y navegación de SPA fuera de la ruta dinámica salvo necesidad concreta;
6. agregar pruebas de autorización y secretos.

Neon sigue siendo el backend principal de identidad y datos; adoptar Workers no implica trasladar PostgreSQL/Auth fuera de Neon.

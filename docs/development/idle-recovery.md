# Recuperación después de inactividad

## Alcance

Corrección sobre `develop` del bloqueo aparente al retomar la SPA. La suspensión de Neon se conserva: no se agregan heartbeats, polling, cron, dependencias, migraciones ni cambios de plan. Las observaciones previas identificaron riesgos de recuperación; no demostraron una causa única del incidente en el navegador del usuario.

## Contrato compartido

`requestControl.ts` limita toda la promesa y propaga AbortSignal, incluso cuando un SDK ignora la cancelación. `authorizedRequest.ts` reutiliza ese control en Functions (JSON/PDF) y Data API. El límite incluye obtener la sesión, recibir cabeceras y consumir el cuerpo, no solamente el primer `fetch`.

- Sesión de Neon Auth: máximo 12 segundos por consulta.
- Lecturas JSON: 30 segundos por intento; GET/HEAD pueden reintentarse una sola vez, tras 750 ms, ante red/timeout/401/502/503/504.
- Escrituras y PDF: 90 segundos por intento para no recortar prematuramente los flujos de documentos existentes. `timeoutMs` permite un límite explícito por operación.
- Cancelación del consumidor: inmediata, sin reintento ni envío tardío tras obtener el token.
- 403, 409 y errores de validación no se reintentan. Una respuesta JSON inválida no se convierte silenciosamente en datos nulos.
- POST/PUT/PATCH/DELETE nunca se repiten automáticamente, tampoco ante 401. Si se pierde la respuesta de un guardado se muestra `MUTATION_UNCONFIRMED`: conservar borrador y consultar el registro antes de repetir. Un timeout del navegador no prueba que el servidor haya revertido.

La sesión se recupera bajo demanda, al hacer una petición tras la inactividad. `exp` se usa únicamente como indicio de renovación (margen de 30 segundos), nunca como autorización. Un token próximo a vencer o vencido fuerza `getSession({ query: { disableCookieCache: true } })`. La renovación también envía `X-Force-Fetch` al cliente Neon para evitar su caché local; el SDK elimina ese header antes de la solicitud HTTP. Una lectura rechazada con 401 fuerza renovación una vez. No se persisten tokens ni se debilita JWT/RLS. Tampoco se cierra sesión por una falla de red ni se recarga la página automáticamente.

## Navegación y formularios

`useUnsavedChanges` mantiene la protección mientras una operación está ocupada y exige confirmación si hay cambios. Los clics repetidos comparten la misma promesa: confirmar, cancelar o desmontar resuelve todas las navegaciones pendientes. Los límites de I/O permiten que los `finally` existentes liberen el estado de guardado; no se habilita un segundo envío mientras el primero sigue esperando una respuesta.

No se modifican los borradores persistidos, la cola offline, la selección de roles ni los formularios de negocio.

## PostgreSQL / Functions

El pool conserva `max: 5` y `attachDatabasePool`:

- adquisición de conexión: 8 s;
- conexión ociosa: 10 s;
- sentencia en servidor: 20 s;
- espera de una consulta en cliente: 25 s.

Estos límites no son un límite total de una transacción ni de llamadas externas. No se introduce un timeout de transacción ociosa que pueda interrumpir las integraciones existentes. Los errores de conexiones ociosas se manejan sin imprimir mensajes, SQL, URLs ni credenciales. La conexión se descarta si quedó inutilizable; un fallo de rollback no oculta el error inicial. El trabajo de una transacción nunca se vuelve a ejecutar automáticamente, especialmente si se pierde la confirmación de COMMIT. En ese caso se informa `COMMIT_UNCONFIRMED` para consultar el registro antes de repetir el guardado.

## Pruebas

- `src/__tests__/requestRecovery.spec.ts`: suspensión simulada, 401, permisos, red, límite del cuerpo, cancelación durante Auth/reintento, escrituras sin replay, JSON, PDF y Data API.
- `src/__tests__/authRecovery.spec.ts`: avance de reloj 5/10/20 min, renovación, token que no se renueva, SDK bloqueado y conservación del verificador OAuth.
- `src/__tests__/unsavedNavigation.spec.ts`: guardado ocupado, clics repetidos, cancelar y desmontaje.
- `functions/api/db.spec.ts`: configuración, adquisición, liberación, rollback, pérdida de COMMIT y errores ociosos.
- `e2e/idle-recovery.spec.ts`: navegación desktop/móvil tras 5/10/20 min con reloj simulado, renovación real del cliente SDK contra respuestas interceptadas y formulario conservado ante red cortada. Incluido en el workflow existente de Services.

- `e2e/technician-services.spec.ts`: recuperación automática tras un fallo temporal de lectura y reintento manual después de agotar los dos intentos; ninguna preparación inicia el servicio.

Estas pruebas no equivalen a reproducir el incidente con la sesión Google del usuario ni a medir un arranque frío real de Neon. Tras integrar y desplegar, verificar la sesión real en Usuarios, Servicios y Catálogos después de 5, 10 y 20 minutos, incluyendo una pestaña en segundo plano. Registrar ruta, duración y estado HTTP sin tokens. Si solo fallan rutas cargadas por primera vez después de un despliegue, investigar aparte los chunks de Vite obsoletos.

## Referencias

- https://node-postgres.com/apis/pool
- https://node-postgres.com/apis/client
- https://better-auth.com/docs/concepts/session-management

El PR #68 se integró a `develop` con commit `ee76cb1` y su backend se publicó como deployment Neon **#46** (2026-10-10). Esta constatación es histórica: para futuras publicaciones seguir el [runbook de despliegue de Neon Functions](neon-functions-deploy.md), verificar el nuevo ID activo y ejecutar `GET /health`. El frontend se despliega por separado en Cloudflare.

# Perfil personal

## Alcance

Todo usuario autorizado puede abrir Mi perfil desde el mismo menú de fotografía y nombre en la cabecera y en el pie del sidebar.

- Datos editables: nombre, teléfono opcional y fotografía (imagen Google o privada).
- El correo cambia únicamente después de autenticar otra cuenta de Google, verificar que no esté asignada a otro usuario y confirmar la transferencia de identidad.
- Roles y estado son de solo lectura.
- Si tiene rol Técnico, el usuario puede cargar o sustituir su propio certificado y actualizar emisión y vencimiento. Un archivo exige ambas fechas.

## Transferencia Google tras el primer OAuth

- Better Auth admite dos destinos: `callbackURL` para la sesión existente y `newUserCallbackURL` para una identidad Google recién creada. Ambos deben volver a `/cuenta/cambiar-google` durante una transferencia.
- Tras crear la solicitud temporal con la identidad actual, el navegador **cierra expresamente la sesión de Neon Auth existente antes de iniciar el siguiente OAuth**. Evita que la primera confirmación reciba el JWT de la cuenta anterior (`Seleccionaste la misma cuenta de Google`), mientras el estado temporal se conserva en `sessionStorage`.
- Si falla cerrar sesión, no se inicia OAuth. Si el cierre fue correcto pero falla iniciar el nuevo OAuth, se limpia el estado y se vuelve a la pantalla de acceso, sin dejar un perfil antiguo que parezca editable.
- Antes de la transferencia, la nueva identidad *no* está en `public.usuarios`. El callback usa su JWT Google verificado directamente contra `POST /api/profile/google/finish`, sin intentar primero `GET /api/session`.
- Cuando el proveedor regresa a `/` en vez del callback, el guard recupera un cambio pendiente en la misma pestaña, con token de alta entropía vigente, y lleva al callback **solo** si la nueva cuenta está denegada. El servidor conserva toda la autorización real.
- El almacenamiento temporal tiene vencimiento local máximo de diez minutos; un error de red no destruye el estado, para permitir un reintento. Un éxito lo elimina y renueva la sesión del nuevo usuario.
- Una cuenta no registrada y sin transferencia válida **siempre** permanece sin acceso. No crear usuarios automáticamente en la aplicación.
- Regresión E2E: cubrir tanto la llegada al callback como el retorno inesperado a la raíz, la autorización del usuario recién vinculado y la denegación sin estado pendiente. No manipular manualmente las tablas de cuentas Google para completar un cambio fallido.

## Seguridad

La aplicación usa el ID interno de usuarios para conservar el historial, el ID del proveedor para autenticar y la autorización por rol para restringir operaciones. El flujo de cambio Google usa un estado aleatorio con vencimiento de diez minutos y un solo uso. La API verifica en Neon Auth la nueva cuenta y su correo antes de transferir la vinculación. Las sesiones anteriores dejan de satisfacer la autorización del usuario.

La fotografía personalizada y los certificados propios se alojan en el bucket privado existente de Cloudflare R2, en prefijos individuales por ID. Los permisos de archivos personales son distintos de los del administrador; los técnicos no obtienen acceso a datos de terceros. Se valida el tipo, tamaño, pertenencia del archivo y número de versión del registro.

## Experiencia de usuario

La página muestra carga, error recuperable, éxito, validación contextual, prevención de doble envío, confirmación de cambios pendientes y progreso real de archivos. Las vistas son mobile-first, de una sola columna en móvil, controles táctiles de al menos 44 px y sin scroll horizontal. En escritorio puede utilizarse diseño compacto de dos columnas. Ambos menús de cuenta utilizan un solo componente y las mismas acciones.

## Pruebas

Verificar unitarias, API, compilación TypeScript, migraciones, E2E en teléfono y escritorio, temas claro y oscuro. No desplegar a producción sin autorización.

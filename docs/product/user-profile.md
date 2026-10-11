# Perfil personal

## Alcance

Todo usuario autorizado puede abrir Mi perfil desde el mismo menú de fotografía y nombre en la cabecera y en el pie del sidebar.

- Datos editables: nombre, teléfono opcional y fotografía (imagen Google o privada).
- El correo cambia únicamente después de autenticar otra cuenta de Google, verificar que no esté asignada a otro usuario y confirmar la transferencia de identidad.
- Roles y estado son de solo lectura.
- Si tiene rol Técnico, el usuario puede cargar o sustituir su propio certificado y actualizar emisión y vencimiento. Un archivo exige ambas fechas.

## Seguridad

La aplicación usa el ID interno de usuarios para conservar el historial, el ID del proveedor para autenticar y la autorización por rol para restringir operaciones. El flujo de cambio Google usa un estado aleatorio con vencimiento de diez minutos y un solo uso. La API verifica en Neon Auth la nueva cuenta y su correo antes de transferir la vinculación. Las sesiones anteriores dejan de satisfacer la autorización del usuario.

La fotografía personalizada y los certificados propios se alojan en el bucket privado existente de Cloudflare R2, en prefijos individuales por ID. Los permisos de archivos personales son distintos de los del administrador; los técnicos no obtienen acceso a datos de terceros. Se valida el tipo, tamaño, pertenencia del archivo y número de versión del registro.

## Experiencia de usuario

La página muestra carga, error recuperable, éxito, validación contextual, prevención de doble envío, confirmación de cambios pendientes y progreso real de archivos. Las vistas son mobile-first, de una sola columna en móvil, controles táctiles de al menos 44 px y sin scroll horizontal. En escritorio puede utilizarse diseño compacto de dos columnas. Ambos menús de cuenta utilizan un solo componente y las mismas acciones.

## Pruebas

Verificar unitarias, API, compilación TypeScript, migraciones, E2E en teléfono y escritorio, temas claro y oscuro. No desplegar a producción sin autorización.

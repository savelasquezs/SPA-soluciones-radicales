# Storyboard · Gestión de vehículos de Sede V1

**Módulo:** Clientes → Negocio → Sede → Vehículos  
**Video ID:** `clientes-vehiculos-v1`  
**Salida:** `clientes-gestion-vehiculos-v1.mp4`

## Objetivo

Al finalizar, el Administrador podrá crear, localizar y editar placas, consultar certificados y gestionar la desactivación y reactivación de los vehículos de una Sede.

## Reglas verificadas en `develop`

- Vehículos se administra **dentro** de cada Sede, no en el sidebar principal.
- Solo Administrador, y la Sede debe estar activa y tener `Maneja vehículos` habilitado para dar de alta/editar/reactivar.
- El formulario compartido Crear/Editar solicita solamente la placa.
- La placa se normaliza a mayúsculas tanto en backend como en PostgreSQL.
- La búsqueda es local y la lista separa visualmente activos/inactivos.
- Si existen servicios o certificados vinculados, no se permite eliminar ni modificar la placa histórica; se puede desactivar.
- El historial por vehículo muestra servicios, expedición, vencimiento y disponibilidad del PDF.
- El PDF disponible se ve dentro del modal y puede descargarse. Los registros con PDF retirado conservan datos históricos.
- No se generan ni envían certificados desde esta pestaña.

## Datos de demostración (100 % ficticios)

**Negocio:** Industrias Demo SAS  
**Sede:** Sede Norte · Maneja vehículos, genera certificado vehicular con vigencia 6 meses  
**Vehículos iniciales:** ABC123 y DEF456 activos; GHI789 inactivo.  
**Vehículo nuevo:** jkl567 → JKL567; luego edición a MNO890.  
**Certificado ficticio:** ABC123 · Servicio 022 · Expedición 2026-10-10 · Vencimiento 2027-04-10.  
El PDF ilustrativo se genera localmente mediante `pdf-lib`; nunca se consulta información real de clientes, Neon o R2.

## Secuencia audiovisual

| Orden | Segmento | Escena |
| --- | --- | --- |
| 1 | `intro` | Aprende a registrar y administrar vehículos dentro de una Sede, y a consultar sus certificados. |
| 2 | `open-client` | Ingresa a Clientes y abre el Negocio al que pertenece la Sede. |
| 3 | `open-site` | Selecciona la Sede que administra los vehículos de ese Negocio. |
| 4 | `vehicles-tab` | En la ficha de la Sede, abre la pestaña Vehículos. |
| 5 | `vehicles-list` | Aquí aparecen las placas registradas y el estado activo o inactivo de cada vehículo. |
| 6 | `new-vehicle` | Para registrar otro vehículo, selecciona Agregar vehículo. |
| 7 | `plate-input` | Ingresa la placa. El sistema la convierte a mayúsculas y valida que tenga un formato correcto. |
| 8 | `save-vehicle` | Selecciona Crear vehículo. La nueva placa aparece de inmediato en el listado. |
| 9 | `search-vehicle` | Puedes localizar una placa usando el buscador, sin recorrer toda la lista. |
| 10 | `edit-vehicle` | El botón Editar abre el mismo formulario con los datos existentes. |
| 11 | `change-plate` | Corrige la placa y guarda los cambios. Una placa con historial no puede modificarse. |
| 12 | `open-certificates` | En Acciones, el icono de documento muestra el historial de certificados de ese vehículo. |
| 13 | `certificates-list` | Cada certificado muestra el servicio, la fecha de expedición y su vencimiento. |
| 14 | `certificate-preview` | Selecciona Ver para abrir el documento PDF sin salir de la Sede. |
| 15 | `certificate-download` | Desde este visor también puedes descargar el certificado. |
| 16 | `certificate-back` | Vuelve a la lista y cierra el historial para continuar administrando vehículos. |
| 17 | `delete-attempt` | Si intentas eliminar un vehículo con historial, el sistema conserva sus registros. |
| 18 | `deactivate` | En ese caso, puedes desactivarlo en lugar de borrarlo. |
| 19 | `inactive` | El vehículo queda identificado como inactivo, pero sus certificados siguen disponibles. |
| 20 | `reactivate` | Si necesitas volver a utilizarlo, selecciona Reactivar. |
| 21 | `outro` | Así mantienes actualizada la flota de cada Sede sin perder su historial. |

## Criterios de calidad

- Narración sintetizada por Google TTS y subtítulos literales desde el mismo JSON.
- El cursor, el formulario de placa y la pestaña de Vehículos permanecen legibles en 1920 × 1080.
- El cambio de mayúsculas se comprueba al escribir y tras la creación.
- Se verifica la relación del certificado con el vehículo seleccionado y se abre el iframe de PDF.
- Se presenta el rechazo de borrado con dependencias y se demuestra la desactivación.
- Sin credenciales, datos reales, llamadas a API de producción ni archivos ajenos.
- El MP4 es un **candidato**; revisión y aprobación humana preceden cualquier publicación en R2/Mintlify.

**Entrega:** candidato generado por GitHub Actions y sometido a revisión antes de su publicación.

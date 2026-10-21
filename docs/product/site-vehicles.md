# Vehículos de Sede

La gestión de Vehículos está en **Clientes → Negocio → Sede → Vehículos**; no crea ruta global.
La pestaña reutiliza ResponsiveTable en desktop, cards en móvil, BaseDialog para alta/edición
y certificados, BaseInput, BaseButton, ConfirmDialog y los toasts globales.

## Datos y permisos

- Solo el rol Administrador puede consultar o mutar Vehículos.
- La tabla existente `public.vehiculos` conserva `id, sede_id, placa, activo`; la migración
  añade `version`, `updated_at` y un trigger que normaliza la placa a mayúsculas
  desde PostgreSQL (sin confiar en el cliente HTTP).
- La unicidad es por Sede, insensible a mayúsculas; crear requiere Sede activa con
  `maneja_vehiculos` habilitado. Edición/reactivación también requiere esta configuración.
- Un Vehículo con servicios o certificados queda protegido de cambios de placa y de
  eliminación física: desactivar conserva historia. La placa histórica no cambia.
- Los endpoints CRUD están en `functions/api/app.ts`; devuelven registros definitivos
  para upsert local, y reportan conflictos de versión sin mostrar SQL al usuario.

## Historial de certificados

La acción por vehículo abre un BaseDialog paginado (20 registros por página) con
servicio, fechas y disponibilidad del PDF, consultados por la FK
`certificados.vehiculo_id`. Un certificado cuyo PDF se haya eliminado por retención
permanece visible en la lista con el estado de no disponible.
El botón Ver solicita la URL autorizada de lectura usando el endpoint existente
`/api/certificates/documents/:id/read-url` con `inline:true`; no expone rutas R2
ni concede permiso adicional. El mismo diálogo muestra el PDF y permite regresar
o descargarlo. La lectura `inline` no cambia el comportamiento de descarga previo.

Esta funcionalidad no genera ni envía certificados. La vigencia continúa configurada
en la Sede, las plantillas permanecen globales y el seguimiento del servicio usa
IDs de Vehículos en `vehiculos_atendidos_ids_json`.

## Manual en video

Actualizar el tutorial de Sedes y crear el de Vehículos en Mintlify solo después de
verificar el flujo contra la aplicación desplegada. Usar el pipeline de videos del
repositorio, R2 y marcas de tiempo de `ManualVideo`.

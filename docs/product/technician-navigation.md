# Servicios del técnico: Pendientes, Historial y Agenda

## Navegación
La sección del técnico mantiene Resumen, **Mis servicios** y **Agenda**. La ruta /agenda decide vista por rol activo: conserva el calendario administrativo para Administrador y muestra una agenda de solo lectura para Técnico. No se habilitan cambios de programación desde la vista técnica.

## Mis servicios
- Vista inicial **Pendientes**: servicios PRINCIPALES en proceso y programados, sin finalizados, con los que están en proceso primero y luego fecha programada ascendente.
- Las tarjetas completas son pulsables, de ~86 px de altura mínima. Enseñan solicitud, fecha/hora Bogotá, estado, cliente, sede e indicador local de preparación. La dirección completa continúa en el detalle. Si falla una descarga, aparece únicamente el botón de reintentar.
- **Historial**: principales finalizados, ordenados por fin_real descendente, paginados a 20, búsqueda por nombre del cliente/sede o solicitud y rango opcional de fecha de finalización (máximo diez años).
- GET /api/technician/services/history obliga al rol Técnico y usa el UUID del perfil autenticado para responsable o colaborador. El cliente nunca envía technicianId.
- Sin conexión, Pendientes utiliza la lista disponible en memoria o IndexedDB mediante el store actual; el Historial indica explícitamente que solo muestra visitas guardadas localmente. Se conserva la preparación y el outbox de ejecución.

## Agenda
- GET /api/technician/services/agenda exige rol Técnico; fechas desde/hasta exactamente siete días y filtro de asignación en backend.
- Incluye PRINCIPAL y REFUERZO, excluye cancelados. La semana se basa en inicio_programado en zona America/Bogota.
- En móvil reutiliza ServiceDayStrip y presenta las tarjetas compactas del día seleccionado. En escritorio muestra las siete columnas de la semana en horizontal.
- Los servicios PRINCIPALES abren el flujo técnico existente; los REFUERZOS son de **solo consulta**, sin enlace de ejecución. No se crean acciones para editar, arrastrar o programar.
- Se preservan los controles de las 44 px, estados, temas y el almacenamiento ya disponible. Cuando no hay conexión, la agenda avisa sobre su posible parcialidad.

## Implementación y validación
Se reutilizan ServicePage, TechnicianServiceCard, BaseDateRangePicker, BaseInput, ServiceDayStrip, BaseIconButton, StatusBadge, el store técnico y el guard actual. Sin nuevas tablas ni migraciones. Las consultas están parametrizadas y su alcance es la asignación del técnico. Pruebas de consultas, integración y E2E verifican aislamiento, filtros, navegación por fecha, responsividad y la exclusión de históricos en Pendientes.

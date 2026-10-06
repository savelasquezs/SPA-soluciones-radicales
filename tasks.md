# Tareas aprobadas

## Fundación frontend reutilizable

- [x] Integrar Neon Auth, Data API y Functions mediante services compartidos.
- [x] Crear la estructura base definida en `docs/frontend/reuse.md`.
- [x] Implementar las primitivas compartidas requeridas por el MVP.
- [x] Crear stores de autenticación, preferencias de aplicación y notificaciones para los flujos implementados.
- [ ] Crear composables comunes para estado asíncrono, formularios modificados y errores normalizados.
- [ ] Agregar pruebas unitarias para cada primitiva compartida antes de reutilizarla.

## Datos de prueba

- [ ] Exportar los datos de los Spreadsheets anteriores.
- [ ] Convertirlos en seeds reproducibles exclusivos para desarrollo y pruebas.
- [ ] Verificar que los seeds no incluyan credenciales, tokens ni información real no autorizada.

## Archivos privados

- [x] Implementar backend autorizado y URLs firmadas para certificados de usuarios en Cloudflare R2 sin exponer credenciales a la SPA.
- [x] Implementar carga directa autorizada, reemplazo, eliminación y lectura firmada para planos de Sede y plantillas de certificados en Cloudflare R2.
- [ ] Configurar en Neon Functions las credenciales privadas R2 del runtime y ejecutar la validación real contra `sr-master-files`.

## Servicios residenciales

- [ ] Definir valor, duración, programación e informe aplicables a Clientes Casa antes de incluir sus ubicaciones internas en el catálogo de programación.

## Formularios oficiales

- [ ] Cargar las secciones y campos oficiales de FO-PS-02 v03.
- [ ] Cargar las secciones y campos oficiales de FO-PS-10 v01.
- [ ] Cargar las secciones y campos oficiales de FO-PS-09 v01.

## Certificados

- [x] Configuración por tipo, catálogo de variables, prueba PDF sintética y operación manual con correo editable.
- [x] Aplicar migración de herencia de plantillas en la rama Neon autorizada y validar permisos reales.
- [ ] Reautorizar Google con `drive.file` en desarrollo, configurar R2 y mantenimiento/retención, y realizar un envío expresamente autorizado. Los dos diseños Word ya fueron validados visualmente con Drive.
- [ ] Conectar generación automática al finalizar Servicios, únicamente al implementar y aprobar ese flujo. No llamar el motor desde finalización en esta fase.

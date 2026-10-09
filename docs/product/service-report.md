# Informe técnico MIP · Vista administrativa (fase 1)

**Estado:** informe HTML de solo lectura, disponible desde **Servicios → Historial → Informe** para Servicios Principales finalizados de Sedes de negocio. La generación es dinámica a partir de PostgreSQL: **no crea archivos PDF/DOCX, jobs ni copias de fotografías**.

## Alcance de esta entrega

- Se agrega la ruta autenticada /servicios/:id/informe, protegida por el rol **Administrador** y por GET /api/admin/services/:id/results.
- Se muestra una acción **Informe** únicamente en los registros finalizados de tipo Principal del Historial administrativo. La acción **Ver resultados** y su modal permanecen intactos.
- Documento limpio con cabecera, identidad corporativa, número de solicitud, cliente, NIT, Sede, dirección, técnico, programación, ejecución y duración.
- Resumen de cumplimiento, áreas revisadas, puestos y hallazgos; productos realmente aplicados; evaluaciones por área; puestos con estado, trampa, capturas y observaciones; hallazgos con responsable y recomendaciones; histórico de hasta seis visitas.
- Las **fotografías aparecen junto al criterio, área sin acceso, puesto o hallazgo correspondiente**, con visor ampliable. Las **dos firmas capturadas** se muestran como imágenes originales embebidas en la última sección junto con los nombres.
- Impresión A4 con reglas CSS para ocultar navegación, conservar imágenes completas, repetir encabezados de tablas y evitar cortar bloques. **Imprimir / Guardar PDF** usa la impresión del navegador (window.print()), sin almacenamiento de PDF por la API.
- Las imágenes se obtienen por URLs firmadas de R2 sr-service-media, autorizadas individualmente mediante el backend administrativo. La carga limita concurrencia; se renuevan las URLs antes de imprimir porque caducan en cinco minutos. Si falta una fotografía, se informa sin ocultar el historial. **Si faltan las firmas, se bloquea la impresión y se invita a reintentar.**
- El cálculo usa C=100%, CP=50%, NC=0%; NA y áreas sin acceso no afectan los porcentajes. Si no hay criterios aplicables, se muestra «—», nunca un 0% ficticio. Se promedian los porcentajes de las áreas evaluadas, alineado con el histórico existente.

## Límites intencionales

- No existe **enlace público, QR, copia del informe enviada por correo, integración con certificados ni posibilidad de abrirlo sin rol Administrador**.
- No se crea token público ni se utiliza el campo token_publico_hash todavía.
- La respuesta actual del backend administrativo (service-results) es la fuente única: no se altera la evidencia histórica ni se añaden migraciones en esta fase.
- Los estados y las fotos de hallazgos reflejan las referencias existentes para el servicio; «Estado actual» no promete representar su estado en una fecha pasada.
- No se promete disponibilidad perpetua de fotografías: se preservan solo durante su plazo de retención. Las firmas están excluidas de la limpieza ordinaria.

## Próxima fase, separada de este PR

Conectar el informe al **QR y enlace enviado al cliente junto con su certificado**, con token aleatorio hasheado, expiración y revocación, permiso de solo lectura limitado al Servicio, controles contra abuso y evidencias R2 protegidas. Reutilizar la presentación HTML/A4 y los mismos resultados sin reconstruir PDFs en Neon.

**No adelantar el envío al cliente, la exposición pública ni la modificación de certificados sin una entrega específica.**

## Verificación

1. Abrir **Servicios → Historial** y localizar un Principal finalizado. La nueva acción debe abrir el informe solo para el Administrador.
2. Revisar cabecera, productos, evaluación C/CP/NC/NA, puestos, hallazgos, gráficos y fotografías en contexto.
3. Comprobar ambas firmas embebidas y ampliar una evidencia.
4. Usar **Imprimir / Guardar PDF**, confirmar A4, imágenes y firmas visibles, sin navegación de la SPA.
5. Probar fotografías vencidas o ausentes, ausencia de criterios, reintentos, redimensionado móvil y acceso técnico denegado.
6. Confirmar que no se crea documento en R2 ni trabajo en Neon, y que ningún enlace público quedó activo.

Ver también: [conservación de evidencias](file-retention.md).

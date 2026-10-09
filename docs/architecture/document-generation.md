# Documentos PDF: certificados únicamente

## Conversión existente que se conserva

`functions/api/certificates/docx.ts` valida y completa las plantillas Word de certificados; `functions/api/certificates/generator.ts` convierte su DOCX mediante `convertDocumentToPdfWithGoogleDrive` en `functions/api/google.ts`, usando OAuth empresarial y el scope `drive.file`.

El documento temporal se importa como Google Docs, se exporta a PDF y se elimina. Si falla la limpieza, se registra un trabajo `STORAGE_CLEANUP`. Las salidas son privadas en R2 `sr-generated-documents`. El módulo `functions/api/documents/limits.ts` aplica límites de lectura y tamaño. `pdf-lib` continúa para comprobar certificados, marcación de pruebas y optimización de archivos en el navegador.

## Informes técnicos MIP

Ya no hay PDF de informe ni transformación de fotos en la API. La información del Servicio sigue consultable desde `functions/api/service-results/` con medios privados. La página pública imprimible se implementará en una entrega posterior.

No instalar un conversor nativo, `sharp`, `libvips` o un nuevo procesador de PDF en Neon.

## Despliegue

`npx -y neon@6.2.4 deploy` es el procedimiento estándar sobre Neon `desarrollo`. No versionar ZIP de funciones, fragmentos Base64 ni binarios generados. Conservar secretos privados, configuración de R2 y Google, y el Cron `services-outbox` para Calendar/Gmail.

# Conversión documental compartida por Google Drive

Google Drive es el único conversor DOCX → PDF. La función convertDocumentToPdfWithGoogleDrive en functions/api/google.ts reutiliza OAuth empresarial y drive.file; functions/api/documents/limits.ts concentra los límites de lectura y PDF.

## Consumidores
- Certificados: certificates/docx.ts valida y rellena plantillas Word configurables; certificates/generator.ts llama al conversor. pdf-lib permanece solo para validación y marca de agua de vista previa.
- Informe MIP: reports/docx.ts prepara Word con datos históricos, evidencia fotográfica y firmas; reports/pipeline.ts llama al mismo conversor. No dibuja páginas PDF en código.
- Los PDF terminados se persisten en R2 privado; los DOCX temporales no se conservan en Google Drive.

## Seguridad
La conversión crea un Google Doc temporal, exporta PDF con límite de 15 MiB y elimina el temporal. Si la eliminación falla se encola STORAGE_CLEANUP y no se publica un resultado incompleto. No se crea otra integración OAuth ni se exponen credenciales.

sharp continúa en informes solo para convertir WebP/JPG/PNG a JPEG embebible en Word y acotar resolución/tamaño. No renderiza PDF. La integración sigue requiriendo validación real en Neon desarrollo.

## Entrega
No hay migraciones nuevas. Verificar unitarias, build y salida visual real del PDF, regenerar bundle Neon desde develop actualizado y desplegar solo en desarrollo. Los artefactos temporales anteriores son obsoletos.

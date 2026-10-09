# Informe técnico MIP — primera entrega

## Alcance
Un Servicio Principal de Sede Negocio genera PDF tras confirmarse su finalización en el servidor (incluido cierre offline sincronizado). Refuerzos y residenciales quedan excluidos.

## DOCX y conversión Google Drive compartida
No existe un renderizador propio de PDF para informes. La API prepara un Word temporal desde snapshots del Servicio, con fotos, firmas, tablas y resultados; lo importa a Google Docs mediante la cuenta empresarial y el permiso drive.file, lo exporta a PDF y elimina el archivo temporal. Este mismo adaptador convierte los Word de los certificados.

La preparación del DOCX vive en functions/api/reports/docx.ts, la conversión compartida en functions/api/google.ts y los límites comunes en functions/api/documents/limits.ts. Word se mantiene solo en memoria; únicamente el PDF final se guarda en R2 sr-generated-documents.

El Word se compone desde código en la primera versión; la edición administrativa de una plantilla Word del informe es una mejora futura. El motor anterior que dibujaba páginas PDF fue eliminado. Los certificados mantienen sus plantillas DOCX editables y las vistas previas.

## Datos y diseño
Se presentan cliente, sede, fechas y horas, resultados de criterios, productos, puestos, capturas, hallazgos, firmas y fotografías agrupadas por Área en tres columnas con proporción original. Las imágenes WebP, JPG y PNG se convierten temporalmente a JPG optimizado para incrustarlas en Word; R2 conserva los originales.

El historial muestra hasta seis Servicios Principales de la misma Sede en una tabla: cumplimiento, fecha y capturas. Cumplimiento: C=100 %, CP=50 %, NC=0 %, excluye NA y áreas sin acceso.

## Seguridad y persistencia
Finalizar crea un trabajo DOCUMENT/SERVICE_REPORT idempotente y reintentable. PDF y evidencias permanecen privados con URLs firmadas. Se conservan PDF hasta doce meses. Límite V1: 80 fotos y PDF de 15 MiB. Si falla R2, Drive o la limpieza del archivo temporal, no se publica informe incompleto.

Servicios → Historial → Ver resultados conserva cuatro pestañas: Criterios, Hallazgos, Puestos y Detalles, además de estados NO_GENERADO / PENDIENTE / GENERANDO / DISPONIBLE / ERROR.

## Validación previa al despliegue
- Probar typecheck, tests unitarios de Word y Google, build y pruebas de integración.
- Validar en Neon desarrollo con la cuenta Google conectada, R2 privado, fotografías y firmas reales.
- Verificar visualmente el PDF exportado y la limpieza de Google Drive.
- Regenerar el ZIP de Neon desde el código actual; los paquetes temporales anteriores contienen el motor retirado.

## Pendientes
Plantilla Word personalizable del informe; envío opcional, certificados automáticos, portal público con QR y regeneración histórica.

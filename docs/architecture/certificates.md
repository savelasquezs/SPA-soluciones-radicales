# Motor de certificados

## Piezas y reutilización

- `src/types/certificates.ts`: contratos y catálogo sin dependencias de proveedores.
- `functions/api/certificates/`: validación DOCX, conversión, repositorio, idempotencia, rutas y limpieza.
- `functions/api/r2.ts`: misma firma SigV4; se añade el bucket de documentos generados.
- `functions/api/mailMessage.ts` y `google.ts`: MIME con adjuntos mediante la integración Gmail existente.
- `useCertificateTemplates`, `useCertificateGeneration`, `certificatesService`: I/O/estado separados de la vista.
- Se reutilizan `configuracion`, `certificados`, `auditoria` y `private.integration_jobs`.
- Migración `20261006_007_certificate_template_defaults.sql`: habilitó temporalmente el fallback
  a plantillas generales sin invalidar filas legacy.
- Migración `20261006_008_global_certificate_templates.sql`: elimina las columnas de plantilla
  por Negocio/Sede y conserva únicamente las vigencias por entidad. Las plantillas efectivas se
  resuelven siempre desde `configuracion / SISTEMA` por tipo; no crea tablas, roles ni permisos.

## Conversión DOCX a PDF

Antes de usar PDF real en el entorno autorizado, configurar en Neon Functions (jamás en Vite):

```ini
R2_ACCOUNT_ID=<existente>
R2_ACCESS_KEY_ID=<existente>
R2_SECRET_ACCESS_KEY=<existente>
R2_BUCKET_MASTER_FILES=sr-master-files
R2_BUCKET_GENERATED_DOCUMENTS=sr-generated-documents
```

La integración empresarial de Google solicita además `drive.file`. El backend genera el DOCX final
con Docxtemplater, lo importa temporalmente como Google Docs, lo exporta inmediatamente a PDF y
elimina el archivo temporal antes de aceptar el resultado. El permiso no permite explorar ni editar
archivos de Drive ajenos a los creados o abiertos por la aplicación. No existe otro cliente OAuth ni
otro sistema de credenciales.

`converterReady` exige que el refresh token almacenado incluya `drive.file`; una integración anterior
debe volver a autorizarse. La conversión usa timeouts de 60 s, limita el PDF a 15 MiB y rechaza salidas
que no sean PDF, documentos vacíos y certificados fuera del rango de 1–30 páginas. Si la limpieza
inmediata del Google Doc temporal falla, el PDF no se persiste en R2 y el identificador se conserva
en `private.integration_jobs` como `STORAGE_CLEANUP` para reintento posterior. Después se optimizan
object streams con pdf-lib y se conserva la salida más pequeña cuando no es una vista previa.

Referencias del contrato: [Docxtemplater API](https://docxtemplater.com/docs/api/) y
[Google Drive import/export](https://developers.google.com/drive/api/guides/manage-uploads#import_to_google_docs_types).

## Persistencia, concurrencia y archivos

Los maestros se leen de R2 autorizado y los PDF se guardan con rutas nuevas
`certificates/<service-id>/<job-id>/<random-id>.pdf`. Nunca se sobrescribe el PDF anterior en R2.
La sustitución en PostgreSQL y su auditoría son atómicas y solo ocurren tras generar/subir todos
los elementos. El lock de job/token y la comparación del PDF anterior previenen reintentos solapados.
El lease de 15 min cubre el lote acotado de 10; la validez del intento vuelve a comprobarse al commit.
No hay una conexión abierta a PostgreSQL mientras se realiza conversión o carga de los PDF.

Después de fallos, se encola STORAGE_CLEANUP solo para rutas creadas por ese intento, no para los
resultados anteriores. `POST /api/certificates/maintenance/cleanup` procesa un trabajo vencido por
invocación, exige Administrador y espera al menos un día. Vuelve a bloquear/verificar el trabajo
origen y comprueba referencias actuales/históricas antes de borrar. No escanea otros objetos.
El despliegue debe ejecutar esta operación o integrarla en el mantenimiento autorizado existente;
este PR **no instala un scheduler**. Si se pierde la conexión antes de encolar, podría quedar un
objeto temporal huérfano que requiera conciliación operativa; se prioriza no borrar resultados válidos.

La eliminación compartida de maestros rechaza referencias vigentes o históricas con FILE_IN_USE;
las plantillas globales vigentes y las usadas históricamente siguen protegidas por esa verificación. No se intenta hacer
irreversible una URL PUT previamente firmada: la cuenta Administrador tiene autoridad sobre los
maestros. Los prefijos no son un sustituto de la autorización.

Retención aprobada: datos e historial permanentes; PDF físico generado por un mes; plantillas y maestros mientras sean necesarios. Para regenerar PDF vencidos se reutiliza el motor existente con la plantilla actual y fechas originales.
Configurar la retención del bucket de PDF de forma coherente, también para versiones anteriores.
El contenido del histórico no garantiza disponibilidad de bytes después del período de retención.
No aplicar una limpieza general de maestros que deje certificados/auditoría sin sus referencias.

## Comprobación antes de habilitar

1. Aplicar la migración a la rama Neon autorizada con el flujo normal y comprobar diff.
2. Configurar R2 privado y volver a autorizar la integración Google con `drive.file`; desplegar Functions y frontend de desarrollo.
3. Subir ambos DOCX preparados, probar PDF con datos ficticios y revisar las fuentes/diseño.
4. Generar un certificado de establecimiento y uno de un vehículo efectivamente atendido; descargar.
5. Con autorización explícita de prueba, enviar solo a destinatarios acordados y comprobar Gmail.
6. Confirmar reemplazo, concurrencia, permisos de Técnico/Administrador y retención/mantenimiento.

Las pruebas automatizadas simulan Auth/R2/Gmail/Drive y no envían mensajes. La prueba SQL de CI
usa PostgreSQL efímero y funciones de identidad de prueba, no constituye validación contra Neon Auth
real. La prueba visual debe repetirse cuando cambien las plantillas o el renderizador de Google.

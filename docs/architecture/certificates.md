# Motor de certificados

## Piezas y reutilización

- `src/types/certificates.ts`: contratos y catálogo sin dependencias de proveedores.
- `functions/api/certificates/`: validación DOCX, conversión, repositorio, idempotencia, rutas y limpieza.
- `functions/api/r2.ts`: misma firma SigV4; se añade el bucket de documentos generados.
- `functions/api/mailMessage.ts` y `google.ts`: MIME con adjuntos mediante la integración Gmail existente.
- `useCertificateTemplates`, `useCertificateGeneration`, `certificatesService`: I/O/estado separados de la vista.
- Se reutilizan `configuracion`, `certificados`, `auditoria` y `private.integration_jobs`.
- Migración `20261006_007_certificate_template_defaults.sql`: permite heredar plantilla general;
  no crea tablas, roles, datos ni amplía permisos. Mantiene la restricción antigua de Negocios
  como NOT VALID para no invalidar las filas legacy toleradas por la migración 006.

## Runtime privado

Antes de usar PDF real en el entorno autorizado, configurar en Neon Functions (jamás en Vite):

```ini
R2_ACCOUNT_ID=<existente>
R2_ACCESS_KEY_ID=<existente>
R2_SECRET_ACCESS_KEY=<existente>
R2_BUCKET_MASTER_FILES=sr-master-files
R2_BUCKET_GENERATED_DOCUMENTS=sr-generated-documents
CERTIFICATE_CONVERTER_URL=https://conversor-privado.example/
CERTIFICATE_CONVERTER_TOKEN=<secreto>
```

`neon.ts` pasa las nuevas variables al runtime. Vacías, la aplicación informa que el conversor
no está configurado; todavía permite guardar/validar Word. `converterReady` comprueba configuración,
**no** realiza un health check ni asegura que el proveedor esté disponible.

El adaptador hace POST multipart a `<base>/forms/libreoffice/convert`, con `files=certificado.docx`,
`Authorization: Bearer <token>`, timeout de 60 s y sin seguir redirecciones. El servicio privado debe
implementar este contrato, por ejemplo Gotenberg detrás de una puerta de acceso que valide ese
Bearer. No basta con exponer una instancia estándar sin configurar su autenticación. El host se
configura exclusivamente en backend, nunca viene en solicitudes del navegador. Se exige HTTPS;
solo se permite loopback HTTP en modo no productivo para pruebas.

No se incluye ni se despliega infraestructura del conversor en este PR. Elegir un runtime compatible,
actualizado, aislado, con límites de CPU/memoria, sin salida a redes internas ni recursos externos,
y las fuentes necesarias para los Word del cliente. La validación del DOCX reduce superficie de
ataque, pero no sustituye el aislamiento y actualizaciones del conversor. No usar servicios públicos
anónimos de conversión. LibreOffice conserva el diseño a partir del DOCX, pero no garantiza igualdad
píxel a píxel con Microsoft Word: revisar visualmente fuentes, encabezados, imágenes y saltos.

Parámetros nativos: compresión de imagen con calidad 85, resolución máxima 150 dpi, sin formularios
PDF interactivos ni actualización de índices; después se optimizan object streams mediante pdf-lib.
En un certificado real se conserva la versión más pequeña entre salida del conversor y optimizada.
No se rasteriza todo el documento. Un PDF generado admite 1–30 páginas y hasta 15 MiB. Los lectores
remotos están limitados incluso sin Content-Length. El navegador no carga el motor Word/PDF.

Referencias del contrato: [Docxtemplater API](https://docxtemplater.com/docs/api/) y
[Gotenberg LibreOffice](https://gotenberg.dev/docs/convert-with-libreoffice/convert-to-pdf).

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
los rollback de formularios tratan ese código como conservación deliberada. No se intenta hacer
irreversible una URL PUT previamente firmada: la cuenta Administrador tiene autoridad sobre los
maestros. Los prefijos no son un sustituto de la autorización.

Retención de producto: datos/auditoría indefinidos; PDF hasta un año; maestros mientras sean necesarios.
Configurar la retención del bucket de PDF de forma coherente, también para versiones anteriores.
El contenido del histórico no garantiza disponibilidad de bytes después del período de retención.
No aplicar una limpieza general de maestros que deje certificados/auditoría sin sus referencias.

## Comprobación antes de habilitar

1. Aplicar la migración a la rama Neon autorizada con el flujo normal y comprobar diff.
2. Configurar R2 privado y el conversor autenticado; desplegar Functions y frontend de desarrollo.
3. Subir ambos DOCX preparados, probar PDF con datos ficticios y revisar las fuentes/diseño.
4. Generar un certificado de establecimiento y uno de un vehículo efectivamente atendido; descargar.
5. Con autorización explícita de prueba, enviar solo a destinatarios acordados y comprobar Gmail.
6. Confirmar reemplazo, concurrencia, permisos de Técnico/Administrador y retención/mantenimiento.

Las pruebas automatizadas simulan Auth/R2/Gmail/conversor y no envían mensajes. La prueba SQL de CI
usa PostgreSQL efímero y funciones de identidad de prueba, no constituye validación contra Neon Auth
real. La prueba local visual de documentos, cuando se ejecute, tampoco demuestra el despliegue privado.

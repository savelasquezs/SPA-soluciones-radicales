# Optimización previa a R2

## Contrato

`uploadMasterFile(kind, file)` ejecuta `optimizeFileForStorage(kind, file)` **antes** de solicitar la URL firmada. Solo se firman y envían el nombre, MIME, tamaño y bytes del resultado. La API pública del motor devuelve exclusivamente `Promise<File>`: no métricas, pantallas, notificaciones de ahorro ni estados persistidos. `uploadMasterFile` acepta opcionalmente un callback efímero de fase para UX (`compressing` / `uploading`); no expone porcentajes ni información de ahorro.

Flujo: archivo → comprimir localmente → autorizar → PUT privado a R2.

## Implementación

- Un Web Worker propio, empaquetado por Vite y servido desde la misma aplicación. No CDN, servicios externos ni credenciales en el cliente. Se termina al completar, fallar o alcanzar 120 segundos.
- Imágenes JPG/PNG/WebP: Canvas nativo, orientación EXIF aplicada, recodificación WebP sin copiar metadatos, conservación de transparencia y proporción. Perfil normal: lado largo máximo 2560 px, calidad inicial 0.80, objetivo 2 MiB. Planos: 4096 px, 0.85 y 5 MiB. Los intentos son limitados y no se fuerza un porcentaje destruyendo detalle.
- PDF: `pdf-lib` 1.17.1 fijado en package.json y package-lock. Se sustituyen imágenes JPEG o Flate RGB/gris de 8 bits compatibles dentro del mismo objeto PDF. Texto, operadores vectoriales, enlaces y formularios no se rasterizan; no se regeneran apariencias de campos. Imágenes pequeñas, máscaras, transparencias, espacios de color especiales, predictores y filtros no soportados quedan intactos.
- Firmas digitales, permisos de certificación y XFA: se conserva el PDF original byte a byte. Los PDF cifrados o corruptos producen un error; no se elimina su protección.
- DOC/DOCX y formatos fuera del motor siguen el flujo existente sin transformación; el backend conserva la autoridad sobre extensiones permitidas.
- Se usa el original si la salida no es más pequeña. Si el proceso falla, no se solicita URL ni se sube silenciosamente el original.

Se usa Canvas + pdf-lib directamente en lugar de añadir una segunda biblioteca general de compresión: permite controlar explícitamente las excepciones documentales y mantener un único worker, sin descargas en runtime desde terceros.

## Límites y alcance

El original optimizable puede pesar hasta 64 MiB; la resolución decodificada se limita a 64 millones de píxeles. Las imágenes Flate de PDF se procesan individualmente hasta 16 millones de píxeles, con descompresión limitada al tamaño declarado. El certificado conserva el máximo existente de **10 MiB después de comprimir**, también validado por el backend. La validación previa del formulario no debe rechazar una foto de 30 MiB antes de que el motor pueda reducirla.

60–90 % es un objetivo para fotografías grandes y PDF con imágenes compatibles, no una garantía para cada archivo. Un PDF ya optimizado, firmado o con imágenes de formatos no soportados puede conservar su tamaño. No se almacenan copias del original junto al resultado y no se modifican archivos existentes en R2.

El alcance actual cubre las cargas centralizadas en `uploadMasterFile`. Los formularios que guardan archivos usan el patrón compartido `useFileSaveProgress`: `Comprimiendo…` → `Subiendo…` → `Guardando…`, mostrado en su botón principal mientras el formulario queda temporalmente inerte. Si no hay archivo nuevo, solo se muestra `Guardando…`. Los futuros flujos de evidencias o generación deben reutilizar este motor cuando corresponda, sin duplicarlo. Las evidencias operativas que se sincronicen durante un Servicio deben llevar progreso por evidencia en lugar de bloquear la pantalla completa. La compresión en cliente no es un control de seguridad ni una cuota del bucket: el servidor sigue validando permisos y tipos, y una carga directa externa a la SPA no queda cubierta por este motor.

## Validación

Pruebas de unidad para selección del resultado, errores, límites, limpieza del worker y orden compresión/autorización/PUT. Pruebas de navegador para los codecs reales y el worker generado por Vite, incluida compresión de imagen grande, PDF con imagen, conservación de contenido y PDF firmado. No necesitan credenciales de Neon o R2 ni crean archivos remotos.

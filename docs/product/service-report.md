# Informe técnico MIP — envío y consulta

## Desde Historial

El Administrador abre **Servicios → Historial → Informe** en un servicio Principal finalizado y firmado y selecciona **Enviar informe**.

- Puede marcar cualquier combinación de los correos registrados en cliente y sede (incluido contacto principal), añadir otros correos con validación y enviar a un máximo de 20 destinatarios únicos.
- Puede adjuntar opcionalmente uno o varios certificados PDF **ya generados del mismo servicio** (máximo 10 archivos, 15 MB en conjunto). No se generan certificados nuevos con esta operación.
- La aplicación envía un correo mediante Gmail empresarial con un enlace al informe y los certificados seleccionados. El envío es idempotente, auditable y usa loading/toast/errores. Los destinatarios adicionales no modifican el catálogo del cliente.
- En el mismo diálogo se indica cuántos enlaces siguen vigentes y pueden revocarse con confirmación.
- La edición del **asunto y mensaje** está dentro de una sección **desplegable cerrada inicialmente** para que el modal no crezca innecesariamente en móvil ni escritorio. Se pueden usar los textos predefinidos o editarlos antes de enviar. El editor `EmailComposerFields` es reutilizable para contactos del cliente y la futura finalización por técnicos; esa integración no se habilita en esta entrega.
- Aunque se edite el mensaje, el enlace de acceso, su vencimiento y el QR son bloques obligatorios añadidos por el servidor; se escapa el contenido del usuario. El QR se genera localmente con una biblioteca JavaScript pura, sin terceros ni nuevos archivos en R2.

## Informe público y seguridad

El correo incluye un enlace de solo lectura a /informe/consulta/:token, vigente 90 días. Se envía en formato HTML compacto: muestra un botón **«Abrir aquí»** en vez del URL completo visible y un **código QR PNG embebido** que abre exactamente el mismo informe. Ambos mantienen la protección de token y vencimiento, con versión alternativa de texto plano para clientes de correo que no admitan HTML. El cliente lo abre sin cuenta de la SPA. La página conserva gráficos, datos, evidencias fotográficas y **las dos firmas originales visibles**, además de impresión A4 mediante el navegador.

- Cada envío genera un token aleatorio de 256 bits. Se almacena solo su SHA-256 en la tabla privada private.service_report_links, con vencimiento, estado y auditoría.
- El token viaja al backend mediante POST (cuerpo), no en la URL del endpoint de Neon. El backend verifica vigencia y revocación antes de cada consulta.
- Las fotografías se entregan solo como referencias opacas en el JSON público, no rutas de R2. El backend comprueba pertenencia antes de otorgar URLs firmadas de 5 minutos.
- La revocación impide solicitudes futuras, aunque una URL temporal de R2 emitida antes podría funcionar hasta agotar esos cinco minutos.
- La ruta pública no inicializa Neon Auth ni expone navegación administrativa, nombres de destinatarios, archivos internos o identificadores de la base de datos.
- El origen de cada enlace se valida contra ALLOWED_ORIGINS y se requiere HTTPS salvo localhost en pruebas.
- Gmail usa el outbox idempotente existente con un scope independiente. Cuando la entrega es incierta se avisa revisar Enviados antes de repetirla.
- No se crea PDF de informe en Neon, Google Drive ni R2; los certificados mantienen su pipeline.

## Hallazgos acumulados y seguimiento

El informe describe la situación **al finalizar el servicio consultado**, no el estado actual de la sede: muestra hallazgos abiertos en ese momento (aunque provengan de visitas anteriores), nuevas aperturas y hallazgos cerrados durante esa visita. Un informe anterior no incorpora seguimientos posteriores ni cambia de estado por cierres futuros.

- Los pendientes de visitas anteriores se priorizan y se identifican como **Pendiente anterior**, con fecha y servicio de apertura, responsable, recomendación, número de visitas desde su detección e historial cronológico de las revisiones registradas hasta esa visita.
- Cada revisión de `hallazgo_seguimientos` conserva su resultado (`SIN_CAMBIOS`, `EN_PROCESO`, `CERRADO`), observación y fotografías, sin copiar hallazgos ni crear estados nuevos. Los cierres legados conservan la información histórica disponible.
- Se presentan por separado las evidencias de apertura y las de cada seguimiento. La ausencia de una fotografía, incluido su vencimiento por retención, no oculta la descripción ni el historial estructurado.
- Los datos se obtienen de `hallazgos`, `hallazgo_seguimientos` y `servicios` existentes. Sin nuevas migraciones ni escrituras en la ejecución técnica.
- Las fotos de servicios anteriores se autorizan solo si el informe autorizado incluye la referencia en un hallazgo de la sede. El backend comprueba la referencia contra el informe y firma la ruta con el ID del **servicio propietario del archivo**; en el enlace público se utiliza exclusivamente un identificador opaco, nunca la ruta privada de R2.
- Los encabezados del resumen reflejan la cantidad **pendiente al finalizar** y no confunden hallazgos heredados con nuevos del servicio.

## Tendencias en el informe y el PDF

La sección **Evolución histórica de la sede** utiliza únicamente **dos gráficos SVG vectoriales**, sin Chart.js ni dependencias adicionales:

- **Cumplimiento MIP:** línea cronológica con valores de 0 a 100 %. C=100 %, CP=50 %, NC=0 %; no se inventa 0 % cuando faltan evaluaciones. La línea se interrumpe si una visita no tiene cumplimiento registrado.
- **Capturas totales:** columnas con la suma de los individuos capturados de **todas las especies de plagas**, en todos los puestos revisados durante cada visita. El backend ya agrega todas las entradas de las capturas de los dispositivos revisados para ese servicio. No se crean gráficos independientes por plaga.

Ambos muestran hasta las seis últimas visitas finalizadas de tipo Principal de la misma sede, fechas reales, valores visibles y variaciones numéricas frente a la visita inmediatamente anterior. Son interactivos en la web: al mover el mouse aparece un detalle con fecha, solicitud, valor y variación; admiten pulsación táctil y foco del teclado. La impresión A4 conserva ejes, fechas, puntos, barras y valores **sin depender del tooltip**. Si existe una sola visita, se muestra el valor sin afirmar ninguna tendencia.

**Interpretación:** bajo los gráficos se presenta una explicación automática, calculada con las diferencias ya disponibles entre la visita actual y la inmediatamente anterior. Las variaciones de cumplimiento se expresan en puntos porcentuales y las de capturas en individuos, sin afirmar mejora o disminución de infestación a partir de capturas solamente. Sin una visita comparable no se inventan tendencias ni proyecciones.

## Envío opcional al finalizar el servicio técnico

El Técnico asignado abre **Trabajo de campo → Revisión y cierre**, completa las evaluaciones y las **dos firmas** y finaliza. A continuación aparece **Enviar informe**, tanto si el cierre ya se confirmó como si está guardado localmente por ausencia de red. El envío **no es obligatorio** ni bloquea el cierre.

- Reutiliza el modal compacto con correos registrados en la sede y en el negocio, posibilidad de agregar destinatarios y personalización desplegable de asunto/mensaje. Las direcciones se preparan dentro del paquete offline. El backend valida que sea un Técnico activo **asignado al servicio**, de tipo Principal y realmente finalizado. El Administrador conserva su flujo y la revocación de enlaces; el Técnico no obtiene el permiso de revocación.
- Con conexión y cierre confirmado, el mensaje puede enviarse inmediatamente. Sin internet, o mientras se sincroniza el cierre, la **intención de envío** (destinatarios, mensaje, certificados seleccionados y UUID de solicitud) se guarda de forma duradera en IndexedDB, aislada por usuario y servicio. El envío **solo** sale después de que la API confirma la finalización.
- En la aplicación abierta, el reintento se ejecuta al recuperar conexión, al reabrir una vista o al volver a ella. Si el navegador está cerrado, no se garantiza envío en segundo plano: el proceso se reanuda cuando la aplicación vuelva a abrirse con el usuario autenticado y conexión.
- Los intentos usan **el mismo UUID** para evitar correos duplicados ante reintentos o cierres inesperados. Fallos transitorios conservan la cola con retraso progresivo; fallos de permisos/validación y entregas con resultado **incierto** se marcan **Necesita revisión** y no se reenvían automáticamente.
- Los certificados PDF siguen siendo opcionales **solo si ya están generados y disponibles al seleccionar el correo con internet**. Cuando el técnico trabaja offline o el cierre no está confirmado todavía, puede guardar el envío del informe **sin certificado**; no se promete adjuntar certificados que todavía no existen.
- El correo mantiene el botón HTML **Abrir aquí**, QR local, evidencias y firmas originales del informe y vínculo de lectura de 90 días. El mensaje editable nunca permite omitir el enlace seguro.

**No hay migraciones SQL nuevas**. Solo aumenta la versión de almacenamiento IndexedDB para incluir la nueva cola local de correos. Los correos nunca se envían automáticamente por el mero hecho de finalizar; el Técnico confirma expresamente su envío.

## Entrega posterior

Reutilizar el editor de correo en la acción de contacto de Clientes y en la finalización del técnico, tras definir los permisos y la confirmación del envío. El QR ya se genera y se envía en el propio correo; incorporarlo en las plantillas PDF de certificados requerirá definir dónde se imprime, por lo que queda separado de este cambio.

## Verificación

1. Pruebas unitarias: generación de token, SHA-256, anonimización de referencias, ausencia de filtraciones de rutas.
2. E2E: entrada desde Historial, selección de correos registrados y extras, edición opcional del asunto y el mensaje en un desplegable compacto, adjuntos opcionales, envío simulado y enlace público sin sesión.
3. Unitarias MIME HTML: multipart/alternative, imágenes CID embebidas y archivos PDF, escapes HTML, texto alternativo y PNG QR válido.
3. Aplicar migración 20261009_002_service_report_shares.sql y desplegar nueva API únicamente en Neon desarrollo.
4. Smoke controlado en desarrollo con cuenta de prueba, validación de datos reales, R2, revocación y Gmail. Nunca enviar correos reales a clientes durante pruebas sin revisar los destinatarios.

Relacionado: [conservación de evidencias](file-retention.md).

## Fichas técnicas de los productos

Se conserva el campo productos.ficha_tecnica_storage_path y la carga original de archivos maestros en R2, sin duplicar documentos.

- La ficha se ofrece solo cuando existe; puede ser PDF, JPG, PNG o WebP (máximo 10 MB). El formulario ya soporta PDF; se explicita el MIME para que Android también muestre documentos PDF.
- En «Productos a aplicar» del técnico y la tabla «Productos aplicados» del informe administrativo/público aparece «Ver ficha técnica». Al pulsar solicita una URL temporal firmada.
- La API valida la asignación del técnico y la pertenencia del producto al servicio. El informe exige un servicio finalizado/firmado y el enlace del cliente exige token válido, no vencido ni revocado. El público no recibe rutas privadas de R2 ni IDs de producto.
- En el informe público se usa un índice de producto vinculado al servicio. El PDF A4 oculta el botón de consulta (la URL firmada es temporal). La ficha se almacena y edita únicamente en el catálogo.


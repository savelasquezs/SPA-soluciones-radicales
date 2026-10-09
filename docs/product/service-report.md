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

## Tendencias en el informe y el PDF

La sección **Evolución histórica de la sede** utiliza únicamente **dos gráficos SVG vectoriales**, sin Chart.js ni dependencias adicionales:

- **Cumplimiento MIP:** línea cronológica con valores de 0 a 100 %. C=100 %, CP=50 %, NC=0 %; no se inventa 0 % cuando faltan evaluaciones. La línea se interrumpe si una visita no tiene cumplimiento registrado.
- **Capturas totales:** columnas con la suma de los individuos capturados de **todas las especies de plagas**, en todos los puestos revisados durante cada visita. El backend ya agrega todas las entradas de las capturas de los dispositivos revisados para ese servicio. No se crean gráficos independientes por plaga.

Ambos muestran hasta las seis últimas visitas finalizadas de tipo Principal de la misma sede, fechas reales, valores visibles y variaciones numéricas frente a la visita inmediatamente anterior. Son interactivos en la web: al mover el mouse aparece un detalle con fecha, solicitud, valor y variación; admiten pulsación táctil y foco del teclado. La impresión A4 conserva ejes, fechas, puntos, barras y valores **sin depender del tooltip**. Si existe una sola visita, se muestra el valor sin afirmar ninguna tendencia.

**Interpretación:** la reducción de capturas no demuestra por sí sola menor presencia de plagas si cambia la cantidad o ubicación de los puestos monitoreados. No se inventan proyecciones.

## Entrega posterior

Reutilizar el editor de correo en la acción de contacto de Clientes y en la finalización del técnico, tras definir los permisos y la confirmación del envío. El QR ya se genera y se envía en el propio correo; incorporarlo en las plantillas PDF de certificados requerirá definir dónde se imprime, por lo que queda separado de este cambio.

## Verificación

1. Pruebas unitarias: generación de token, SHA-256, anonimización de referencias, ausencia de filtraciones de rutas.
2. E2E: entrada desde Historial, selección de correos registrados y extras, edición opcional del asunto y el mensaje en un desplegable compacto, adjuntos opcionales, envío simulado y enlace público sin sesión.
3. Unitarias MIME HTML: multipart/alternative, imágenes CID embebidas y archivos PDF, escapes HTML, texto alternativo y PNG QR válido.
3. Aplicar migración 20261009_002_service_report_shares.sql y desplegar nueva API únicamente en Neon desarrollo.
4. Smoke controlado en desarrollo con cuenta de prueba, validación de datos reales, R2, revocación y Gmail. Nunca enviar correos reales a clientes durante pruebas sin revisar los destinatarios.

Relacionado: [conservación de evidencias](file-retention.md).

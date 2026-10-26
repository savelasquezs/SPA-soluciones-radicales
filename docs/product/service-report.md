# Informe técnico MIP — envío y consulta

## Desde Historial

El Administrador abre **Servicios → Historial → Informe** en un servicio Principal finalizado y firmado y selecciona **Enviar informe**.

- Puede marcar cualquier combinación de los correos registrados en cliente y sede (incluido contacto principal), añadir otros correos con validación y enviar a un máximo de 20 destinatarios únicos.
- El envío incluye siempre los certificados correspondientes al servicio: establecimiento y vehículos atendidos habilitados. Se preparan automáticamente los PDF faltantes o eliminados por retención y se reutilizan los disponibles, hasta 15 MiB de adjuntos. No se envía el informe solo si falla algún certificado.
- La aplicación envía un correo mediante Gmail empresarial con un enlace al informe y los certificados seleccionados. El envío es idempotente, auditable y usa loading/toast/errores. Los destinatarios adicionales no modifican el catálogo del cliente.
- En el mismo diálogo se indica cuántos enlaces siguen vigentes y pueden revocarse con confirmación.
- La edición del **asunto y mensaje** está dentro de una sección **desplegable cerrada inicialmente** para que el modal no crezca innecesariamente en móvil ni escritorio. Se pueden usar los textos predefinidos o editarlos antes de enviar. El editor `EmailComposerFields` se reutiliza en el envío administrativo y técnico.
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

## Vehículos atendidos

Los informes de Servicios Principales con gestión vehicular presentan una sección compacta
de **Vehículos atendidos**, con cantidad y placas de la visita; se obtiene del campo
`servicios.vehiculos_atendidos_ids_json` y del catálogo de la Sede. Se conserva en
la consulta pública y en el PDF impreso. No expone la flota completa ni IDs internos.
Se diferencia claramente la confirmación de cero vehículos de un servicio histórico
sin registro (`NULL`). Los certificados siguen emitiéndose únicamente para los vehículos
atendidos. La generación automática prepara establecimiento y todos los vehículos habilitados en un solo conjunto atómico; el límite de diez por lote permanece únicamente en la generación manual administrativa.

## Hallazgos acumulados y seguimiento

El informe describe la situación **al finalizar el servicio consultado**, no el estado actual de la sede: muestra hallazgos abiertos en ese momento (aunque provengan de visitas anteriores), nuevas aperturas y hallazgos cerrados durante esa visita. Un informe anterior no incorpora seguimientos posteriores ni cambia de estado por cierres futuros.

- Los pendientes de visitas anteriores se priorizan y se identifican como **Pendiente anterior**, con fecha y servicio de apertura, responsable, recomendación, número de visitas desde su detección e historial cronológico de las revisiones registradas hasta esa visita.
- Cada revisión de `hallazgo_seguimientos` conserva su resultado (`SIN_CAMBIOS`, `EN_PROCESO`, `CERRADO`), observación y fotografías, sin copiar hallazgos ni crear estados nuevos. Los cierres legados conservan la información histórica disponible.
- Se presentan por separado las evidencias de apertura y las de cada seguimiento. La ausencia de una fotografía, incluido su vencimiento por retención, no oculta la descripción ni el historial estructurado.
- Los datos se obtienen de `hallazgos`, `hallazgo_seguimientos` y `servicios` existentes. Sin nuevas migraciones ni escrituras en la ejecución técnica.
- Las fotos de servicios anteriores se autorizan solo si el informe autorizado incluye la referencia en un hallazgo de la sede. El backend comprueba la referencia contra el informe y firma la ruta con el ID del **servicio propietario del archivo**; en el enlace público se utiliza exclusivamente un identificador opaco, nunca la ruta privada de R2.
- Los encabezados del resumen reflejan la cantidad **pendiente al finalizar** y no confunden hallazgos heredados con nuevos del servicio.

## Gráficos de evolución: lectura sencilla e interacción

El informe explica los resultados de **hasta seis servicios Principales finalizados de la misma sede**, anteriores o iguales a la visita consultada. Se ordenan por fecha real, sin agrupar por mes para no confundir varias visitas con una sola.

La sección **¿Cómo han cambiado los resultados?** presenta cuatro gráficos SVG sin bibliotecas nuevas:

1. **Cumplimiento de las medidas de prevención.** Línea de porcentaje (0 a 100 %) que valora criterios C (100 %), CP (50 %) y NC (0 %); excluye NA y áreas sin acceso. Un porcentaje mayor indica más medidas cumplidas, no una predicción de futuras plagas.
2. **Capturas registradas en las trampas.** Dos líneas, **voladores (azul)** y **rastreros (naranja)**, para comparar los totales capturados por clasificación durante cada visita. Reemplaza la antigua barra de capturas totales sin duplicar indicadores.
3. **Insectos que vuelan · Lámparas UV.** Barras agrupadas por especie de insectos voladores en cada fecha.
4. **Plagas rastreras · Trampas y cebaderos.** Barras agrupadas por especie de plaga rastrera en cada fecha.

Los gráficos presentan **solo el título, indicadores, leyendas, ejes y valores**, sin párrafos descriptivos ni explicaciones repetitivas al ampliarlos. Las etiquetas S/M y 0 conservan su aclaración corta para evitar confusiones. No se presenta el identificador de solicitud al cliente en los ejes ni en los tooltips. Las etiquetas temporales muestran **mes y año** cuando las visitas están distribuidas; si hay varias visitas en un mes, muestran día y mes; y si se repiten fechas en un día, muestran hora. Al consultar un dato, el tooltip incluye la fecha completa.

### Interacción y ubicación

- La misma **guía vertical** sigue el cursor o el dedo al recorrer una gráfica. También se puede navegar con tabulador, Enter y barra espaciadora.
- Cada gráfica tiene un botón **Ampliar**, que abre el componente BaseDialog: visor ancho en escritorio y casi pantalla completa en móvil. El visor usa los mismos colores del informe (claro u oscuro) para fondo, encabezado, ejes, leyendas, tooltip y tablas; el PDF impreso conserva la paleta clara. Se puede cerrar con Escape y volver al informe.
- Las dos gráficas de especies muestran la especie, cantidad y hasta tres **áreas / puestos / ubicaciones** directamente en el tooltip. En el visor ampliado se ve toda la tabla de capturas por ubicación y especie de la fecha seleccionada.
- Las ubicaciones se recuperan de los snapshots históricos de áreas, puestos, ubicaciones y capturas de dispositivos, **solo de esas seis visitas**. No se exponen ID internos ni rutas privadas de fotografías. No se necesita una solicitud al servidor por movimiento del dedo.
- Los colores de cada especie dependen de su código, no del orden de llegada; permanecen iguales al aparecer otras especies en visitas posteriores.
- La **ausencia de monitoreo (S/M)** no se dibuja como cero. Un **0** solo significa que hubo puestos revisados, pero no capturas.

### Interpretación, límites e impresión

Sobre las gráficas de tendencias aparece el cambio numérico de cumplimiento o capturas entre las **dos últimas visitas comparables**; el detalle por fecha permanece accesible con ratón, teclado o toque. Si falta una medición, la comparación no se inventa. Las capturas por sí solas no prueban aumento o reducción de infestación; por eso no se generan proyecciones ni recomendaciones automáticas basadas únicamente en cantidades capturadas. Para comparar periodos con distinta cantidad de puestos, conviene revisar también el número de puestos monitoreados.

La vista web del informe, tanto administrativa como pública, adopta los modos **Claro, Oscuro y Sistema** de la aplicación. El cliente dispone de un selector compacto en el encabezado público, sin necesidad de iniciar sesión; la elección se conserva en el navegador. Los fondos, bordes, textos, cuadrículas, líneas y tooltips usan variables de tema. Los colores por especie mantienen su identidad, con un ajuste de luminosidad en oscuro.

En móviles, el diálogo de ampliación de gráficos presenta una superficie de lectura clara y un contenido compacto, independientemente del tema elegido para el informe. Las series y barras se ajustan al ancho disponible sin alturas mínimas, manteniendo la leyenda y el detalle en orden vertical y el desplazamiento dentro del diálogo. El informe de fondo conserva sus tres modos de apariencia.

Al **imprimir o guardar PDF A4**, se utiliza siempre el tema claro, incluso si la pantalla está en oscuro. Se mantienen los ejes, fechas, puntos, barras, leyendas y valores visibles sin depender del tooltip. Los botones Ampliar, tooltips y modales no aparecen impresos. El informe público y el administrativo comparten exactamente los mismos componentes.

No se agregan migraciones SQL, librerías externas de gráficos ni cambios a la operación del Técnico. La nueva información se adjunta a la respuesta histórica existente del backend.

## Detalle de capturas de la visita actual

En **Puestos de monitoreo y capturas** se muestra una tabla HTML real de tres columnas (**Área**, **Puesto / Trampa / Ubicación** y **Capturas registradas**) solo si hay al menos un puesto con cantidades positivas por especie. Cada especie se presenta en una línea dentro de la última celda, con la cifra correspondiente. Las tres columnas y sus encabezados permanecen visibles en móvil y en A4: la conversión a tarjetas móviles aplica exclusivamente a la tabla de Productos, nunca a la de capturas. La cabecera indica el total de individuos, puestos revisados, puestos con capturas, revisados sin capturas y los que no registraron revisión. Las Áreas sin acceso no se contabilizan como puestos revisados.

La lista repetitiva de todos los puestos sin capturas se elimina del informe, pero se mantienen en un bloque corto separado las observaciones, los cambios de estado relevantes y las evidencias fotográficas vinculadas a los puestos, incluso cuando no tuvieron capturas. El historial completo sigue disponible en la Sede. El informe administrativo y el público comparten la misma vista; se imprime en A4 sin tooltips ni URLs privadas de R2.

Implementación: ampliar `functions/api/service-results/data.ts` (consulta agrupada de las mismas seis visitas), utilizar `ServiceSpeciesCharts.vue` y `serviceSpecies.ts` y actualizar la vista del informe. No requiere tablas, migraciones, cambios en el Técnico ni bibliotecas adicionales.

## Envío opcional al finalizar el servicio técnico

El Técnico asignado abre **Trabajo de campo → Revisión y cierre**, completa las evaluaciones y las **dos firmas** y finaliza. A continuación aparece **Enviar informe**, tanto si el cierre ya se confirmó como si está guardado localmente por ausencia de red. El envío **no es obligatorio** ni bloquea el cierre.

- Reutiliza el modal compacto con correos registrados en la sede y en el negocio, posibilidad de agregar destinatarios y personalización desplegable de asunto/mensaje. Las direcciones se preparan dentro del paquete offline. El backend valida que sea un Técnico activo **asignado al servicio**, de tipo Principal y realmente finalizado. El Administrador conserva su flujo y la revocación de enlaces; el Técnico no obtiene el permiso de revocación.
- Con conexión y cierre confirmado, el mensaje puede enviarse inmediatamente. Sin internet, o mientras se sincroniza el cierre, la **intención de envío** (destinatarios, mensaje y UUID de solicitud) se guarda de forma duradera en IndexedDB, aislada por usuario y servicio. El envío **solo** sale después de que la API confirma la finalización.
- En la aplicación abierta, el reintento se ejecuta al recuperar conexión, al reabrir una vista o al volver a ella. Si el navegador está cerrado, no se garantiza envío en segundo plano: el proceso se reanuda cuando la aplicación vuelva a abrirse con el usuario autenticado y conexión.
- Los intentos usan **el mismo UUID** para evitar correos duplicados ante reintentos o cierres inesperados. Fallos transitorios conservan la cola con retraso progresivo; fallos de permisos/validación y entregas con resultado **incierto** se marcan **Necesita revisión** y no se reenvían automáticamente.
- Los certificados se generan automáticamente al confirmar el cierre. El envío siempre incluye el certificado de establecimiento y todos los vehículos atendidos con certificado habilitado. El backend prepara o recupera el conjunto completo antes de Gmail; nunca envía únicamente el informe si falla la generación. Un envío guardado offline espera al cierre y a los documentos. Se reutilizan los PDF disponibles y se regeneran los que vencieron por retención, sin ampliar la vigencia. El total de adjuntos se limita a 15 MiB; no se omiten vehículos para cumplir el límite.
- Las direcciones añadidas aparecen en la lista superior, seleccionadas y con indicador visual. Añadir se destaca al escribir una dirección válida; Enter la incorpora y Enviar también incluye una dirección válida que todavía esté escrita. El estado finalizado presenta una cabecera de éxito e iconos, con acciones diferenciadas para documentos y cobro.
- El correo mantiene el botón HTML **Abrir aquí**, QR local, evidencias y firmas originales del informe y vínculo de lectura de 90 días. El mensaje editable nunca permite omitir el enlace seguro.

**No hay migraciones SQL nuevas**. Solo aumenta la versión de almacenamiento IndexedDB para incluir la nueva cola local de correos. Los correos nunca se envían automáticamente por el mero hecho de finalizar; el Técnico confirma expresamente su envío.

## Entrega posterior

Reutilizar el editor de correo en la acción de contacto de Clientes y en la finalización del técnico, tras definir los permisos y la confirmación del envío. El QR ya se genera y se envía en el propio correo; incorporarlo en las plantillas PDF de certificados requerirá definir dónde se imprime, por lo que queda separado de este cambio.

## Verificación

1. Pruebas unitarias: generación de token, SHA-256, anonimización de referencias, ausencia de filtraciones de rutas.
2. E2E: entrada desde Historial, selección de correos registrados y extras, edición opcional del asunto y el mensaje en un desplegable compacto, certificados automáticos, envío simulado y enlace público sin sesión.
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


## Firmas e informes históricos

- Las imágenes de firma del cliente y del técnico se conservan durante un año desde la finalización del servicio. Los nombres y fechas permanecen registrados en PostgreSQL.
- Cuando la imagen se ha eliminado y auditado, el informe muestra «Firma de [nombre] (vencida)» tanto en el área administrativa como en el enlace público. Sigue siendo imprimible.
- Los certificados PDF se conservan un mes desde su generación o última regeneración. Se vuelven a generar mediante el motor existente y la plantilla vigente; enviar el informe reutiliza los PDF disponibles y prepara los que falten, sin duplicar certificados.

## Hallazgos relacionados con criterios

El histórico se reconstruye al cierre exacto de la visita consultada, incluyendo sus propios seguimientos y excluyendo cambios de visitas posteriores. El mismo corte limita el acceso del técnico a las fotos del histórico de esa visita. Una evidencia compartida usa el mayor plazo de conservación entre sus referencias al informar si está vencida.

Las consultas y el informe identifican el criterio de apertura por su snapshot. La observación de cada visita y la descripción histórica del hallazgo mantienen su significado. Los archivos compartidos se descargan una sola vez y se presentan una vez en el informe; las otras referencias enlazan a esa evidencia. El informe público conserva referencias opacas para fotos y criterios, sin exponer rutas R2 ni IDs internos nuevos. La vista de resultados reutiliza el visor de evidencias en lugar de abrir una pestaña de navegador por foto.

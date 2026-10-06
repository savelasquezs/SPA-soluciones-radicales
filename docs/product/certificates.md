# Certificados: configuración y operación manual

## Alcance

`Configuración → Certificados` (`/configuracion/certificados`) pertenece al Administrador activo.
Tiene dos superficies: **Plantillas** y **Generar y enviar**. No se agregan entradas globales
por cada entidad ni tablas nuevas. Finalizar un Servicio **no** genera ni envía certificados
con este cambio; su automatización permanece pendiente en `tasks.md`.

## Plantillas Word

Se guarda una plantilla general por tipo, `ESTABLECIMIENTO` y `VEHICULO`, en las filas
`configuracion` / `SISTEMA` con claves `CERTIFICADO_PLANTILLA_<TIPO>`. El valor contiene
`storagePath`, `fileName` y una revisión opaca para evitar sobrescribir cambios concurrentes.
Los bytes permanecen en `sr-master-files`, con los prefijos existentes por tipo.

Las plantillas son exclusivamente globales: todos los Negocios usan la plantilla general de
establecimiento y todas las Sedes con certificado vehicular usan la plantilla general de vehículo.
Solo la vigencia varía por entidad: establecimiento en el Cliente Negocio y vehículo en la Sede.
No existe carga, reemplazo ni selección de plantillas por Cliente o Sede.

Crear/reemplazar usa Word `.docx`, máximo 10 MiB. No se convierten PDF ni `.doc` en plantillas.
Los archivos antiguos de esos tipos no se borran ni se migran automáticamente: hay que reemplazarlos
por un DOCX preparado antes de generar. El backend valida también el contenido real, no solo la extensión.
No admite macros, objetos incrustados activos, DDE, recursos externos salvo hipervínculos normales,
expansión ZIP excesiva, expresiones ejecutables ni variables ajenas al catálogo.

### Variables y bloques

La interfaz muestra y permite copiar el mismo catálogo tipado que valida el backend:

| Variable | Dato |
|---|---|
| `{{negocio_nombre}}` | Nombre del negocio |
| `{{nit}}` | NIT |
| `{{sede_nombre}}` | Sede |
| `{{sede_direccion}}` | Dirección |
| `{{solicitud}}` | Consecutivo del servicio |
| `{{fecha_expedicion}}` | Fecha `dd/mm/aaaa` |
| `{{fecha_vencimiento}}` | Fecha `dd/mm/aaaa` |
| `{{tecnico_nombre}}` | Técnico responsable |
| `{{vehiculo_placa}}` | Placa, únicamente en plantilla vehicular |

Obligatorias en ambos tipos: solicitud y las dos fechas. También `negocio_nombre` para
establecimientos o `vehiculo_placa` para vehículos. No se exige una posición fija: se conserva
el diseño del Word, incluidos encabezados/pies y formato de los textos reemplazados.

Bloque de productos, con las etiquetas de apertura/cierre en párrafos separados:

```text
{{#productos}}
{{nombre}} — {{principio_activo}}
Registro: {{registro_sanitario}} · Lote: {{lote}} · Método: {{metodo}}
{{/productos}}
```

Bloque de métodos sin repeticiones:

```text
{{#metodos}}
{{nombre}}
{{/metodos}}
```

Los productos provienen únicamente de filas marcadas como aplicadas. Un bloque sin datos se
omite. No se admiten bloques anidados, inversos, HTML, evaluación de expresiones ni acceso a
propiedades fuera de los campos publicados. El usuario mantiene logos, bordes, textos fijos,
tipografía y distribución desde Word. Textos extensos pueden alterar saltos de línea/página:
se debe probar cada plantilla representativa antes de usarla.

### Prueba PDF

**Probar PDF** usa el mismo renderizador y conversor que la generación real, con datos ficticios
y la marca `PRUEBA - SIN VALIDEZ` en cada página. Puede probarse un archivo seleccionado antes
de guardar. No crea certificados, trabajos de generación oficiales, archivos PDF persistidos ni
correos. El DOCX seleccionado se carga como maestro temporal; el navegador conserva su referencia
para reintentar, y solicita limpiar el borrador al descartarlo cuando es seguro.

Las fases mostradas son reales: `Subiendo…`, validación/guardado o generación de prueba. Un Word
no muestra `Comprimiendo…` si esa fase no ocurrió. La compresión de imágenes/PDF de los formularios
anteriores permanece en su motor compartido.

## Generar y regenerar

Selección contextual **Negocio → Sede → Servicio principal finalizado → Tipo → Vehículos**.
Se incluyen negocios inactivos para consultar su histórico. No se ofrecen residencias, refuerzos,
servicios incompletos ni vehículos que no estén en `vehiculos_atendidos_ids_json` de ese Servicio
y además pertenezcan a su Sede. Lotes de hasta 10 vehículos; servicios paginados de 25 en 25.

La primera fecha de expedición procede de la finalización real, convertida a `America/Bogota`.
El vencimiento suma la vigencia en meses calendario, ajustando al último día del mes cuando
corresponda. Regenerar exige confirmación, conserva ID y fechas originales, y usa la plantilla
global vigente del tipo. No amplía la vigencia ni envía correos automáticamente.

Cada primera generación conserva los valores renderizados en el snapshot del trabajo `DOCUMENT`.
Las siguientes reutilizan ese snapshot histórico (incluidos productos y nombres). Un certificado
anterior a esta implementación que carezca de snapshot conserva fechas, pero solo puede usar los
datos relacionados disponibles al regenerarlo. No es posible reconstruir retroactivamente valores
que nunca se persistieron. El PDF anterior y la referencia de plantilla quedan en auditoría.

La operación lleva una clave idempotente persistente, un token de intento, un lease y comparación
del PDF previo por destino. La versión del Servicio se revalida antes del commit; las restricciones
únicas siguen impidiendo certificados duplicados. Un fallo conserva los PDFs anteriores y los
valores visibles. La respuesta definitiva actualiza el listado sin un GET redundante.

## Descarga y correo

La descarga autoriza el certificado y firma su URL privada por cinco minutos. El envío es una
acción separada con confirmación: muestra cuántos PDF se enviarán y los destinatarios concretos.
Se pueden seleccionar los correos ya registrados en el Negocio, Sede o contacto principal;
se normalizan y deduplican. Asunto y mensaje predeterminados son editables. No permite direcciones
arbitrarias ni adjuntos de otra selección/Servicio. Límites: 10 PDF, 20 correos y 15 MiB de adjuntos
por envío. Todos los destinatarios seleccionados son visibles entre sí en `To`.

Gmail se ejecuta desde backend con la conexión empresarial existente. Los trabajos EMAIL están
separados de DOCUMENT: fallar el envío no revierte la generación. Repetir el mismo intento no
reenvía un trabajo completado. Un timeout después de iniciar Gmail **no se reintenta a ciegas**:
se registra entrega incierta y se exige revisar Enviados antes de habilitar un nuevo intento.
Esto reduce duplicados, pero no promete exactamente una entrega: Gmail y PostgreSQL no comparten
una transacción. Tras una recarga con resultado incierto también hay que verificar Gmail.

## Estados y permisos

Carga/contenido/vacío/error/reintento, toasts, confirmaciones y componentes compartidos. El guardado
bloquea acciones incompatibles y navegación; conserva borradores ante errores. Las respuestas
obsoletas no reemplazan la selección actual. El catálogo local se reutiliza. Ningún secreto usa
`VITE_`. Todos los endpoints exigen Administrador en backend; las políticas y privilegios Data API
existentes no se amplían.

Configuración técnica, límites del conversor y validación real pendiente:
[`../architecture/certificates.md`](../architecture/certificates.md).

# UX Guidelines

## Objetivo

La interfaz sigue las tareas reales de Administradores y Técnicos. Una tabla o entidad no justifica por sí sola una página, ruta o entrada en el sidebar.

## Principios

- Mantener el contexto y evitar que el usuario vuelva a seleccionar información conocida.
- Resolver tareas pequeñas inline, en quick add, diálogo o drawer cuando sea más eficiente.
- Usar páginas para tareas largas, profundas o que necesiten navegación propia.
- Mostrar feedback inmediato y cerca de la acción.
- Preservar datos ante errores.
- Usar patrones compartidos antes que soluciones visuales locales.
- Reducir llamadas y trabajo real antes de ocultarlos con loading.

## Densidad administrativa

En desktop administrativo se prioriza la información operativa por encima de metadatos y decoración.

- Encabezados, resúmenes y acciones secundarias deben consumir solo el espacio necesario para identificar el contexto.
- Listas, Sedes, Áreas, Puestos de monitoreo e historiales deben dominar el viewport cuando sean la tarea principal.
- Evitar varias cards grandes para datos breves que pueden convivir en una franja compacta.
- En desktop se permiten controles visualmente compactos cuando preservan foco, legibilidad y semántica; en mobile las zonas táctiles continúan siendo de al menos 44 px.
- Cuando una lista operativa se consulta repetidamente por periodos conocidos, ofrecer accesos rápidos inmediatamente asociados al selector de fechas. Los presets cambian el rango; no duplican ni alteran la lógica interna del datepicker.
- La densidad no elimina estados, labels necesarios ni feedback; elimina espacio y superficies redundantes.

## Enlaces de entidades y celulares

- Los nombres de entidades navegables usan el color normal de texto. La interacción se comunica mediante cursor, foco visible y subrayado en hover/focus, no mediante color de acento permanente.
- Todo celular accionable se muestra con el componente compartido de WhatsApp: icono de WhatsApp inline + número en formato humano.
- No renderizar un celular como texto plano junto a un botón de WhatsApp separado.
- El enlace abre `wa.me` con el número normalizado y conserva un nombre accesible explícito.

## Navegación

La navegación principal representa áreas de trabajo globales y frecuentes, no cada CRUD.

La jerarquía operativa para clientes tipo Negocio es:

```text
Cliente Negocio
  └─ Sede
      ├─ Áreas
      ├─ Puestos de monitoreo
      ├─ Vehículos
      └─ Servicios
```

- Sedes se administran dentro del contexto de Negocio.
- Un Cliente Casa oculta la Sede residencial interna y no expone Áreas, formularios MIP, certificados ni vehículos.
- Áreas, Puestos de monitoreo y Vehículos conservan el contexto de Sede.
- Una ruta puede existir sin aparecer en el sidebar.
- Usar breadcrumbs cuando la ruta tenga más de un nivel de contexto. Los niveles anteriores deben ser enlaces navegables; el nivel actual se muestra como texto.

## Estados obligatorios

Toda superficie que carga datos contempla:

1. carga inicial;
2. contenido;
3. estado vacío;
4. error accionable;
5. reintento.

Una actualización no debe borrar innecesariamente el contenido visible. Mostrar progreso sobre el contexto existente cuando sea seguro.

## Operaciones asíncronas

- Deshabilitar la acción incompatible mientras se ejecuta.
- Mostrar progreso en el botón, fila o sección que inició la operación.
- Evitar overlays globales para acciones locales.
- Ignorar respuestas obsoletas después de navegar o cambiar filtros.
- No usar loading artificial ni retrasos decorativos.
- Operaciones largas deben explicar qué ocurre y permitir continuar cuando sea seguro.

### Guardado de formularios con archivos

- Cuando el archivo forma parte de un formulario, el progreso vive en la acción primaria del formulario; no usar un overlay o pantalla completa para una operación local.
- La secuencia visible estándar es `Comprimiendo…` → `Subiendo…` → `Guardando…`. Si no existe archivo nuevo, comenzar directamente en `Guardando…`.
- Mostrar solo fases reales. No inventar porcentajes ni barras determinadas si la capa técnica no puede medir ese progreso.
- Mientras una fase está activa, bloquear doble envío y las interacciones que puedan invalidar el formulario, incluido cerrar el diálogo. Mantener los datos visibles y conservarlos si falla la operación.
- Si un formulario procesa varios archivos, reutilizar las mismas fases sin añadir contadores o detalle por archivo salvo que el volumen haga esa información necesaria.
- Para futuras evidencias, fotografías o firmas operativas que se carguen durante un Servicio, el progreso debe pertenecer a cada evidencia y permitir continuar trabajando cuando sea seguro; no acumular todas las cargas detrás de `Finalizar servicio`.

## Toasts y errores

Existe un único sistema global de toasts.

- `success`: una operación terminó correctamente.
- `warning`: terminó con una condición relevante.
- `error`: la operación falló y el usuario debe saberlo.
- `info`: información global no asociada a un campo.

El significado incluye icono, texto y semántica accesible; no depende solo del color.

Los errores de validación se muestran junto al campo. Un toast no reemplaza el contexto necesario para corregir. Nunca exponer tablas, columnas, políticas, índices, trazas ni errores técnicos.

## Formularios

- No pedir datos que el sistema ya conoce.
- Indicar campos obligatorios antes del envío.
- Mantener una acción primaria clara.
- Bloquear doble envío.
- Conservar valores y archivos seleccionados cuando falle el guardado.
- Confirmar navegación, cambio de rol o cierre si hay cambios sin guardar.
- Los formularios largos usan página o sección; no modal.
- Los formularios pequeños y repetitivos evalúan primero quick add, modal o drawer.

## Confirmaciones

Usar el diálogo compartido de la aplicación, nunca `window.confirm`.

Una confirmación destructiva identifica el objeto, explica la consecuencia y usa etiquetas de acción concretas. El foco entra al diálogo, queda contenido, Escape cancela cuando sea seguro y al cerrar regresa al origen.

## Listas

- Mantener filtros, búsqueda y página al crear o editar cuando siga siendo válido.
- Actualizar con la respuesta definitiva de la mutación en lugar de recargar todo.
- En desktop usar tabla si se comparan columnas.
- En agenda semanal, representar el tiempo como una cuadrícula horaria: 08:00–21:00 por defecto, ampliable cuando existan Servicios fuera del rango. Las tarjetas muestran solo Cliente/Sede y revelan detalle en hover/focus.
- En Semana móvil, priorizar una lista cronológica del día con tira de siete días e indicadores completos; la cuadrícula de una sola columna se activa mediante Horario. Evitar instrucciones de arrastrar con mouse en táctil, recortes de servicios cortos y dobles desplazamientos. Mantener la fecha seleccionada en la URL y reutilizar el editor existente.
- En mobile transformar a cards o filas apiladas cuando la tabla no sea legible.
- En Servicios (Agenda/Historial), mostrar las filas como tarjetas de lectura rápida, no como ocho campos de formulario apilados: encabezado fecha/hora y estado; cliente/sede y consecutivo/tipo; equipo y pago; contacto y accesos. La persona que recibió el efectivo, el equipo completo y la auditoría permanecen disponibles en el detalle.
- En las tarjetas móviles, las acciones frecuentes conservan acceso directo o un menú compacto que muestra solo opciones válidas por estado; nunca eliminar acciones administrativas existentes. Mantener el celular con WhatsApp inline, la semántica independiente del estado del servicio y el estado del pago, y objetivos táctiles de al menos 44 px.
- Mantener densidad móvil en Agenda, Historial y Próximos por confirmar: minimizar márgenes y paddings de tarjetas, agrupar datos de seguimiento en cuatro filas cuando quepan, sin ocultar contacto, programación, cobros ni acciones y sin reducir los objetivos táctiles por debajo de 44 px.
- En la vista móvil de Servicios, mostrar búsqueda y el contador de filtros activos, con Estado, Tipo y Técnico detrás de un control desplegable. Fecha y rango se ajustan con navegación compacta; los rangos rápidos siguen accesibles sin desplegarlos permanentemente. Preservar los filtros y la posición en la URL. El patrón existente de filtros de Sede es la referencia para minimizar código duplicado.
- Las acciones por fila deben ser identificables por teclado y lector de pantalla.
- En listados administrativos, no renderizar un formulario de edición persistente debajo de la tabla si su contenido depende de la fila seleccionada; ese patrón alarga la página y pierde previsibilidad a medida que crece la lista.
- Para CRUD compacto, preferir una acción explícita por fila que abra un diálogo o drawer de edición. Crear y editar deben reutilizar el mismo contrato de formulario cuando los campos y validaciones sean equivalentes.

## Mobile y trabajo de campo

Las pantallas del Técnico se diseñan primero para teléfono.

- Controles táctiles de al menos 44 px.
- Una columna para formularios en pantallas estrechas.
- Sin scroll horizontal de página.
- CTA principal alcanzable sin cubrir contenido.
- Toasts, drawers y diálogos no compiten con teclado ni navegación.
- Fotografía y firma conservan el borrador si la red falla.
- Mostrar claramente estado offline, guardado local y sincronización pendiente.

## Accesibilidad

- HTML semántico y labels asociados.
- Navegación completa por teclado.
- Foco visible y orden lógico.
- Loading anunciado cuando modifica el contexto.
- Errores relacionados mediante atributos accesibles.
- Contraste suficiente en ambos temas.
- Estados no comunicados únicamente mediante color.
- Respetar preferencias de reducción de movimiento.

## Rendimiento percibido

- Cargar módulos por ruta.
- Evitar recargar catálogos ya disponibles y vigentes.
- Paginar historiales.
- Aplicar filtros locales cuando ya se tienen todos los datos necesarios.
- Usar skeleton solo cuando represente razonablemente el contenido.
- No bloquear toda la aplicación por una integración externa.

## Criterio de terminado UX

- [ ] La ubicación de la funcionalidad corresponde a la tarea y contexto.
- [ ] Usa primitivas compartidas.
- [ ] Contempla carga, vacío, error, reintento y éxito.
- [ ] Previene doble acción y pérdida de datos.
- [ ] Funciona con teclado y foco correcto.
- [ ] Funciona en viewport móvil sin overflow.
- [ ] Usa feedback global y local correctamente.
- [ ] No agrega navegación innecesaria.
- [ ] No genera llamadas remotas redundantes.

## Edición desde listados

- Crear y Editar comparten el mismo formulario cuando sus campos y reglas son equivalentes.
- Editar usa el snapshot ya cargado si contiene todos los campos ligeros necesarios.
- Después de una mutación se actualiza el registro con la respuesta definitiva, sin recargar la colección.
- Solo se vuelve a consultar la entidad por deep link, recarga sin caché, datos pesados, historial, archivos, información omitida o conflicto de versión.

## Certificados y efectos externos

La configuración de plantillas, la prueba sintética, la generación oficial y el envío son acciones distintas. Un PDF de prueba siempre se identifica como no válido. Regenerar o enviar requiere confirmación contextual; nunca se envía un correo por probar/guardar/generar. Una entrega incierta no habilita reintentos automáticos: primero se revisa Gmail. La vista conserva selección, Word y mensaje ante fallos, y aplica feedback local sin overlays globales.


## Puestos de monitoreo en campo

- El Técnico trabaja sobre el **Puesto de monitoreo**; Trampa y Producto de cebo son componentes del puesto, no sinónimos de la entidad.
- En móvil, mantener un solo puesto expandido a la vez para evitar formularios largos apilados.
- Las plagas se presentan como acciones compactas. No seleccionar una plaga equivale a cero/no evidenciada; al seleccionarla se edita su cantidad.
- No crear un input permanente por cada plaga cuando la mayoría quedará en cero.
- Producto químico y antídoto nunca se piden como texto libre durante la visita. Si el puesto tiene un Producto asociado, la interfaz usa su snapshot y muestra solo los datos operativos que el Técnico deba registrar.
- La evidencia fotográfica del puesto ofrece Cámara y Galería. Puede adjuntarse en una revisión normal y es obligatoria cuando una regla funcional lo exija.
- Observaciones opcionales permanecen plegadas hasta que hagan falta o ya contengan información.

## Espacio de trabajo móvil del Técnico

- El encabezado del trabajo muestra solo el selector de Área (con estado textual e icono), un acceso a su orden y la navegación Servicio / Áreas / Cierre. El código y el estado de red permanecen en el detalle global; no se repiten sobre los criterios.
- Las pestañas **Criterios**, **Puestos** y **Hallazgos** distribuyen una sola responsabilidad visual por superficie. Cada pestaña tiene su propio indicador: criterios sin evaluar, puestos sin revisar o hallazgos abiertos, respectivamente. Un hallazgo abierto **no** cuenta como bloqueo de la inspección.
- Cambiar de pestaña o Área debe conservar los borradores. La pestaña activa viaja en la URL, y el selector permite regresar a un Área incompleta sin flujos circulares ni botón global “Siguiente pendiente”.
- «No fue posible acceder» es una acción de peligro **secundaria** que abre un diálogo, no una tarjeta roja ocupando toda el área. El botón **Habilitar Área** aparece inmediatamente en el diálogo, aunque no se hayan ingresado motivo ni fotografías. Cuando la excepción se guarda, se ocultan criterios, puestos y hallazgos de esa Área.
- La excepción exige un motivo y entre una y cinco fotografías; después de guardar ofrece continuar a otra Área incompleta o ir al cierre. No inicia firmas automáticamente ni da por completo el servicio.
- Las evidencias nuevas se ven como miniaturas con visor antes de guardar. La cámara integrada permite capturar, repetir, usar foto y «Usar y tomar otra»; cuando el permiso/cámara no está disponible, utiliza el selector nativo.
- La persistencia de fotografías funciona mediante cola local e identificadores de medio; la sincronización por archivo no debe perder los restantes ni reiniciar un envío ya confirmado.

- Al abrir un Hallazgo, el formulario técnico pide solamente descripción, recomendación/acción y evidencias; la responsabilidad la determina el backend desde el contacto principal de la Sede. Se muestra en el detalle, no se edita en campo.

## Ejecución móvil del Técnico (navegación guiada)

- Compactar encabezados, tarjetas y pies de sección; preservar controles táctiles de 44 px y la identidad de ambos temas mediante tokens existentes.
- Navegación manual de Área, Servicio, Cierre y pestañas Criterios/Puestos/Hallazgos siempre disponible, sin exigir completitud.
- Los botones Anterior/Siguiente al pie de cada sección guían el recorrido. Anterior no valida. Siguiente valida exclusivamente el paso que intenta dejar; en Hallazgos valida el Área completa.
- El primer pendiente se desplaza a la vista, abre su tarjeta y muestra error inline, sin toasts duplicados ni diálogos grandes para validaciones.
- Los borradores parciales se conservan antes de cambiar de sección, incluso si aún no existe una calificación.
- Los indicadores distinguen Hallazgos abiertos de Hallazgos sin evaluación durante la visita. «Sigue igual» registra una revisión sin cerrar el Hallazgo.

- Los avisos de cierre de trabajo de campo usan variantes compactas de `StatusPanel`, sin bloques de nueve rem de alto.
- Al confirmar la finalización online, abrir el diálogo opcional de envío sin enviar correo automáticamente.
- El visor de evidencias nuevas permite dibujo y recorte táctil antes de guardar la fotografía. La edición no reescribe fotografías históricas.
- El aviso de evidencia opcional del hallazgo usa el tono de warning discreto (`--warning-subtle`), en una línea compacta.

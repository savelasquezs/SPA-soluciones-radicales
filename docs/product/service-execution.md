# Ejecución de Servicio MIP

Decisión funcional aprobada el 6 de octubre de 2026. Este documento reemplaza el enfoque anterior de formularios dinámicos para la operación del Técnico.

## Principio

La ejecución de un Servicio MIP no usa un constructor de formularios, plantillas editables, secciones dinámicas ni versiones de formulario.

La interfaz del Técnico tiene una estructura estable definida por el producto y se construye con datos del dominio. Lo dinámico son los catálogos, las Áreas, los Puestos de monitoreo, los Productos, las Plagas y los registros propios de cada Servicio.

Los formatos históricos FO-PS-02, FO-PS-10 y FO-PS-09 siguen siendo referencia funcional para los datos que deben capturarse y para la generación documental, pero no se almacenan ni administran como formularios.

## Composición del Servicio Principal

La operación se organiza así:

```text
Servicio
├─ Contexto del cliente y la Sede
├─ Productos previstos/aplicados
├─ Recorrido por Áreas
│  ├─ Criterios MIP, hallazgos relacionados y evidencias compartidas
│  └─ Monitoreo: puestos permanentes + revisión del Servicio
├─ Vehículos atendidos (solo Sede de Negocio con maneja_vehiculos)
├─ Resumen de la ejecución
├─ Firma del Técnico
└─ Firma del responsable del cliente
```

El Técnico puede desplazarse entre Áreas en cualquier orden y volver a una anterior. No existe un orden obligatorio de inspección.

El orden del recorrido es editable dentro del Servicio. Lista, selector y navegación secuencial comparten la misma secuencia. El Técnico puede abrir libremente cualquier Área o pestaña sin evaluar para cambiar de sección. Los botones de avance guiado (Criterios y hallazgos → Puestos → Siguiente Área/Cierre) comprueban la sección correspondiente y envían al primer elemento pendiente con mensaje contextual; «Anterior» nunca exige completitud. Al llegar a Cierre se ofrece la revisión global con enlaces a los pendientes, y la finalización permanece bloqueada hasta completar la matriz requerida. Reorganizar no modifica la Sede ni los datos de evaluación. Véase [service-area-route.md](service-area-route.md).

## Vehículos atendidos

Una Sede de Negocio puede tener muchos Vehículos registrados, pero una visita puede atender solo algunos.
Si la Sede tiene `maneja_vehiculos` habilitado, el Servicio Principal incluye una etapa
independiente `Servicio → Áreas → Vehículos → Cierre`. Se usa la navegación superior existente,
extraída en un componente reutilizable. Los criterios, puestos y hallazgos continúan siendo
subpestañas **del Área**, nunca del Vehículo.

El paquete offline del Técnico incluye las placas activas de la Sede, las inactivas que
fueron seleccionadas en ese servicio y el arreglo de IDs atendidos. El Técnico busca,
marca y desmarca placas sin generar solicitudes por cada toque. La selección se conserva
como borrador durable en IndexedDB. La acción **Confirmar N atendidos** guarda el conjunto
completo en la cola idempotente y luego permite ir al cierre; puede confirmar **cero**.
La llegada de conexión sincroniza primero vehículos nuevos, después el conjunto
seleccionado y finalmente la firma/cierre. No se crea una tabla de atenciones.

El campo existente `servicios.vehiculos_atendidos_ids_json` distingue:
- `NULL`: sin confirmar, impide finalizar si la etapa aplica;
- `[]`: confirmado, ningún vehículo atendido;
- `[IDs]`: vehículos atendidos confirmados.

La creación rápida del Técnico solicita solamente placa, normalizada y validada en el servidor,
y crea un registro permanente de Sede solo durante un servicio Principal activo asignado
y con bloqueo de edición válido. No concede CRUD administrativo. Placas duplicadas convergen
en el registro ya existente, sin duplicar fichas. La pantalla lista solo registros de su Sede.
No es obligatorio marcar todos los vehículos registrados. El informe y el generador de
certificados solo usan vehículos atendidos. Un servicio anterior finalizado sin registro
se reconoce como histórico sin confirmación, no como cero atendidos.

En el cierre, la interfaz muestra la cantidad y permite volver al listado. El backend
revalida `NULL` para impedir el cierre incluso si se manipula el frontend.
Las Sedes no pueden cambiar la opción `maneja_vehiculos` vía API administrativa
mientras tengan Servicios Principales en proceso.

Los Servicios de Refuerzo y los Servicios residenciales conservan sus reglas simplificadas y no ejecutan este recorrido MIP completo.

La ejecución móvil admite Servicios `PRINCIPAL` tanto de Negocio como de Casa. Las visitas residenciales usan el mismo control de acceso por Técnico, la ventana de inicio de una hora, el bloqueo de dispositivo, los Productos y ambas firmas, pero no congelan Áreas ni exigen criterios, puestos de monitoreo o hallazgos. Se abre directamente **Revisión y cierre** y no se ofrece informe MIP completo. Los Refuerzos utilizan el mismo flujo simplificado que un Servicio residencial: preparación, inicio autoritativo, Productos previstos y cierre con ambas firmas, sin recorrido MIP por Áreas ni informe MIP completo. Solo se habilitan a los técnicos responsables o colaboradores asignados.

El resumen de cierre residencial confirma el cierre y las firmas y permite reportar el cobro, sin anunciar certificados automáticos ni envío de documentos. En los Refuerzos confirma únicamente el cierre y las firmas. Los mensajes y distintivos de documentos solo aparecen cuando el envío está disponible para ese Servicio.

## Preparación e inicio

El Servicio sigue visible antes de la visita, pero la ejecución solo puede iniciarse desde una hora antes de `inicio_programado`. La SPA presenta `Disponible desde [hora]`; el servidor calcula la ventana con su reloj y rechaza cualquier inicio anticipado.

Iniciar requiere conexión. La preparación previa permite consultar y almacenar el paquete, pero no habilita edición técnica ni sustituye el inicio confirmado por el servidor. Una vez iniciado y congelado el paquete, el Técnico puede continuar sin conexión y sincronizar posteriormente las mutaciones idempotentes.

La preparación se conserva en IndexedDB por usuario y Servicio. El paquete local incluye la copia recibida del servidor, la fecha de guardado, la identidad estable del celular, el bloqueo de ejecución cuando exista y cualquier identificador de inicio cuya respuesta esté pendiente. Una recarga conserva el paquete; otra cuenta no lo reutiliza. Sin conexión, la lista y el detalle muestran únicamente Servicios preparados en ese celular e identifican que se está leyendo una copia local.

La superficie inicial del Técnico es mobile-first y compacta: lista sus Servicios Principales y Refuerzos asignados con los que están en proceso primero, seguidos por los programados en orden ascendente y el historial al final. El servidor indica cuándo un Servicio es elegible para preparación; desde una hora antes del inicio programado la SPA descarga en segundo plano los paquetes faltantes, sin duplicar solicitudes. Solo se muestra el estado de conexión cuando no hay red y la copia local se representa con un check accesible. Iniciar y recuperar un Servicio continúan siendo operaciones online; ante una respuesta incierta se reutiliza el mismo identificador idempotente.

Un Servicio `PROGRAMADO` no muestra sus Áreas. Presenta únicamente el contexto esencial, la disponibilidad autoritativa y la acción explícita para iniciar. Tras el inicio, o al reingresar a un Servicio `EN_PROCESO` bloqueado por el mismo celular, la SPA reemplaza la ruta por la primera Área pendiente; si no quedan Áreas pendientes entra al cierre. El contexto general y los Productos permanecen disponibles como resumen plegable dentro del recorrido.

Al iniciar, el servidor vuelve a cargar la configuración vigente, congela Áreas, criterios aplicables, identidad/estado de Puestos de monitoreo y Productos previstos, registra `inicio_real` y cambia el Servicio a `EN_PROCESO` en una sola transacción. No se mezclan datos de una preparación antigua con catálogos nuevos.

Solo un celular puede editar un Servicio `EN_PROCESO`. El bloqueo dura toda la ejecución y se identifica por usuario, Servicio y dispositivo físico; cerrar el navegador no lo libera. En el detalle administrativo del Servicio se muestra quién conserva el acceso cuando existe un bloqueo y el Administrador puede liberarlo de forma auditada para permitir recuperación en otro celular. La confirmación advierte que los cambios que existan únicamente en el celular anterior no se transfieren automáticamente. La primera versión no admite edición técnica simultánea ni mezcla automática de dos dispositivos físicos.

Al regresar a la pestaña, la SPA conserva el acceso de edición guardado sin reclamar un nuevo bloqueo. Si falta la identidad del navegador en `localStorage` pero existe el paquete durable del mismo Técnico en IndexedDB, recupera el identificador original en lugar de crear otro. Si el servicio estaba en ejecución y se perdió solamente la confirmación local del bloqueo, intenta restaurarlo con la identidad persistida; el servidor exige que coincidan tanto el Técnico como el identificador del dispositivo. Nunca sustituye un bloqueo ajeno automáticamente. Si se eliminaron los datos del sitio o se cambió de navegador/origen, el Administrador debe liberar el bloqueo antes de usar ese nuevo contexto, y se advierte sobre posibles cambios sin sincronizar en el contexto anterior.

## Criterios MIP

Los criterios son un catálogo administrable independiente.

Cada criterio conserva:

- identidad UUID;
- nombre visible;
- estado activo/inactivo;
- indicador de si aplica únicamente a Áreas externas/perimetrales.

El catálogo no administra clave, orden ni versión. Los Criterios se presentan alfabéticamente.

Los criterios generales aplican a todas las Áreas activas. Un Área con `es_externa = true` recibe además los criterios exclusivos de exterior.

Criterios iniciales derivados de FO-PS-02:

1. Instalación de barreras físicas.
2. Disposición adecuada de residuos sólidos y líquidos.
3. Mantenimiento higiénico.
4. Mantenimiento locativo interno y externo.
5. Mantenimiento de zonas verdes, solo para Áreas externas/perimetrales.

Los estados de evaluación son fijos:

- `C`: Cumple.
- `CP`: Cumple parcialmente.
- `NC`: No cumple.
- `NA`: No aplica.

No existe CRUD para estos cuatro estados. La regla de cálculo también es fija: `CP` vale la mitad de `C`, `NC` vale cero y `NA` se excluye del cálculo.

## Snapshot histórico al iniciar

Un Servicio Programado usa la configuración vigente cuando realmente inicia. Desde ese momento el histórico no debe depender de catálogos vivos.

Para cada criterio evaluado debe conservarse suficiente información para reconstruir exactamente lo observado, como mínimo:

- referencia al criterio original cuando continúe existiendo;
- nombre del criterio observado al iniciar;
- condición de aplicabilidad relevante;
- evaluación `C/CP/NC/NA`;
- observación cuando exista;
- referencias a evidencia cuando correspondan.

Renombrar, desactivar o crear criterios después de iniciado un Servicio no modifica ese Servicio ni sus informes.

El histórico se conserva en filas propias de Servicio y Área. La regla funcional es que sea autosuficiente y no requiera reconstruir una versión de formulario.

## Áreas

Las Áreas pertenecen a la Sede y conservan `es_externa`.

La pantalla del Técnico debe derivar automáticamente los criterios aplicables según el Área, sin que un Administrador tenga que configurar un formulario por Sede.

El estado de avance del Área se deriva de sus datos reales: criterios evaluados, revisiones de puestos de monitoreo y hallazgos. La UI puede resumir este avance, pero no almacena una estructura de formulario separada.

### Creación de Áreas desde el trabajo de campo

El Técnico puede registrar una nueva Área **de la Sede** mientras ejecuta un Servicio Principal no residencial y conserva el bloqueo de edición en su celular. Se reutilizan el nombre y la clasificación interior/exterior de la gestión administrativa de Áreas. La Sede es la única fuente de verdad de esta identidad; no existe una entidad de Área exclusiva del Servicio.

Para poder evaluarla durante esa misma visita, se genera de manera automática y transaccional el snapshot técnico en `servicio_areas` y sus criterios MIP aplicables. Esa fila es únicamente evidencia histórica de la visita, no una segunda Área administrable. La nueva Área se incorpora al final del recorrido, sin alterar el orden de las anteriores ni modificar los snapshots de Servicios ya iniciados/finalizados. Las visitas futuras la tomarán de la Sede con sus criterios vigentes.

Al trabajar sin conexión, la nueva Área y sus respuestas se conservan en el paquete y la outbox idempotente de ese celular. Primero se sincroniza el alta permanente en la Sede y su snapshot de la visita, luego los cambios relacionados. El usuario ve claramente si está pendiente de sincronizar; no se promete guardado remoto antes de su confirmación. No se permiten duplicados de nombre en la Sede (tampoco si el Área está inactiva); el servidor valida la asignación del Técnico, el bloqueo del celular, el estado del Servicio y los criterios aplicables. Los errores se resuelven sin perder silenciosamente los datos locales.

## Monitoreo y puestos de monitoreo

Un Puesto de monitoreo es una identidad permanente de una Sede y un Área. El modelo funcional aprobado separa el puesto de sus componentes: puede contener una Trampa, un Producto de cebo o ambos. La creación/asignación del Producto al puesto se implementará en la siguiente entrega de este mismo flujo; no se vuelve a capturar como texto libre durante la revisión.

En la revisión actual, la Trampa concentra estado observado y evidencias de plagas. Una plaga no seleccionada equivale a cero/no evidenciada; solo se persisten cantidades positivas. La fotografía del puesto está siempre disponible y sigue siendo obligatoria cuando una Trampa cambia desde su estado congelado a Dañada o Fuera de uso.

Cuando el puesto tenga un Producto de cebo asociado desde el catálogo, su revisión mostrará únicamente la información operativa que corresponda, principalmente el consumo. Producto y antídoto proceden del catálogo/snapshot y no se solicitan manualmente al Técnico.

Cada Servicio Principal crea una revisión del Puesto de monitoreo. La revisión conserva, según aplique:

- estado observado de la Trampa;
- plagas evidenciadas y cantidades positivas;
- consumo del cebo cuando exista Producto asociado;
- observaciones;
- evidencia fotográfica.

Todos los Puestos de monitoreo congelados del Servicio deben quedar revisados. La primera versión no contempla una excepción de «Puesto de monitoreo inaccesible». La fotografía es obligatoria únicamente cuando el estado observado cambia desde el estado congelado a `DANADO` o `FUERA_DE_USO`; permanecer en uno de esos estados no exige una fotografía nueva por sí solo.

El Técnico puede crear un nuevo Puesto de monitoreo desde el Área durante la ejecución cuando corresponda. El nuevo registro queda disponible como punto permanente para Servicios posteriores.

Las Plagas disponibles para una revisión se derivan de la clasificación de monitoreo del tipo de Puesto de monitoreo:

- RASTREROS;
- VOLADORES.

La lista aplicable debe quedar congelada o representada de forma históricamente estable al iniciar/revisar el Servicio para que cambios futuros del catálogo no reinterpreten capturas anteriores.

## Productos aplicados

Productos no forman parte de la evaluación de un Área.

El Administrador selecciona los Productos y edita únicamente el lote y la fecha de vencimiento de cada producto previsto. No selecciona dosis, método de aplicación ni fecha de fabricación por visita. La dosis y todos los métodos asociados se consultan directamente desde el catálogo MIP antes de iniciar. El inicio exige lote y vencimiento por producto, y que el catálogo tenga dosis y al menos un método activo; si falta configuración en el catálogo, el mensaje lo indica explícitamente, sin pedir al Administrador rellenarla en el Servicio.

El Técnico ve los Productos en solo lectura. La dosis y los métodos visibles antes del inicio reflejan el catálogo vigente; lote y vencimiento provienen del Servicio. Al iniciar, el servidor marca el conjunto previsto como aplicado y congela nombre, principio activo, registro sanitario, dosis del catálogo y nombres de todos los métodos asociados para que cambios posteriores del catálogo no reinterpreten el histórico. Los Servicios antiguos con dosis o método por visita vacíos también pueden iniciar si lote y catálogo están completos. No se sobrescribe la fabricación histórica almacenada.

## Hallazgos integrados en los criterios

Decisión aprobada el 26 de octubre de 2026. Cada Área tiene dos pestañas: **Criterios y hallazgos** y **Puestos**. La navegación libre conserva borradores; el avance guiado comprueba primero evaluaciones y seguimientos y, al salir de Puestos, el Área completa.

Un criterio puede tener varios hallazgos. El Técnico captura observación y fotos una sola vez y elige explícitamente **Registrar hallazgo** dentro del criterio. La descripción se precarga con lo observado y se completa la recomendación/acción. Puede usar las fotos ya capturadas o añadir otras, sin duplicar archivos. CP y NC hacen visible la observación, pero no crean hallazgos automáticamente. C y NA nunca cierran ni ocultan un hallazgo por sí solos.

El backend vincula el hallazgo con la identidad del criterio, la evaluación de apertura y su nombre congelado; comprueba Servicio, Área y pertenencia de cada evidencia. Renombrar o desactivar el catálogo no cambia el histórico. No se clasifican los hallazgos anteriores por similitud textual: permanecen en **Otros hallazgos del Área**, junto a los generales y a los que corresponden a criterios que ya no aplican. No desaparecen por un cambio de catálogo.

La apertura conserva descripción, recomendación y el responsable histórico obtenido por el backend desde el contacto principal de la Sede. Las fotos de apertura son opcionales. Un hallazgo nuevo permanece abierto durante su Servicio de origen. En una visita posterior se registra **Sigue igual**, **En proceso** o **Cerrado**, con la observación y las fotos de esa visita; Cierre exige al menos una fotografía. Sigue igual conserva el estado anterior. La revisión puede corregirse durante el mismo Servicio en proceso y no reescribe revisiones finalizadas.

Las evidencias compartidas conservan un único objeto privado. Quitar su asociación con un criterio no autoriza borrar el archivo si respalda un hallazgo o seguimiento. La conservación se determina por el plazo más largo de todas sus referencias vigentes. Se conservan los límites actuales de cinco fotos por criterio y diez por apertura/revisión de hallazgo.

La consulta de una visita finalizada conserva el estado y las revisiones existentes a su cierre; no incorpora cierres ni fotografías de visitas posteriores. La revisión de la visita consultada muestra su observación y fotografías también en solo lectura. Un nombre de criterio distinto al vigente se identifica como criterio de apertura.

Las fotos locales pueden abrirse desde el criterio y desde el hallazgo sin copiarlas. Si falla el guardado de una foto del criterio, permanece seleccionada y ofrece reintento; una confirmación recibida en segundo plano no borra fotos o notas nuevas. Las asociaciones que necesita un hallazgo pendiente se conservan hasta sincronizarlo.

Los borradores parciales de descripción, acción, resultado, observación y fotos permanecen en IndexedDB por usuario/Servicio/Área/registro. Una fotografía local compartida utiliza el mismo identificador; se sincroniza primero el criterio, se propaga su ruta definitiva a los hallazgos pendientes y no se repite la subida. Los conflictos no descartan las evidencias compartidas. El cierre del Servicio sigue exigiendo sincronización confirmada, ambas firmas y la matriz completa. Un hallazgo abierto revisado no bloquea la inspección; un seguimiento sin revisar sí.

## Firmas y finalización

La firma del Técnico y la firma del responsable del cliente pertenecen al Servicio, no a un formulario. Ambas son obligatorias en cada Servicio: siempre hay una persona presente que firma por el cliente y no se implementa una excepción de ausencia.

Al pulsar Firmar, el lienzo ocupa la pantalla completa para facilitar el trazo en celular. Incluye acciones visibles para borrar, cancelar y aceptar; aceptar conserva la firma durablemente antes de salir.

Un Servicio Principal está completo cuando:

- cada Área quedó evaluada con todos sus criterios y Puestos de monitoreo, o se resolvió como Área sin acceso con descripción y fotografía;
- cada Puesto de monitoreo congelado tiene una revisión válida;
- cualquier fotografía obligatoria fue capturada;
- las dos firmas fueron aceptadas;
- las mutaciones y archivos obligatorios quedaron sincronizados antes de que el servidor confirme la finalización.

Los Hallazgos nuevos son opcionales y no se inventa uno para completar el Servicio. Los Hallazgos anteriores abiertos o en proceso, que corresponden a Áreas accesibles, deben evaluarse en cada visita. «Sigue igual» cuenta como revisión sin cambiar el estado histórico. Abrir una pantalla no marca una sección como resuelta.

Frontend y servidor validan la misma matriz de completitud. Offline puede guardarse una intención de cierre, pero la UI no muestra `FINALIZADO` hasta recibir confirmación del servidor.

## Offline y autosave

El recorrido debe respetar las reglas generales de operación offline:

- autosave durante el diligenciamiento;
- persistencia local de cambios pendientes;
- navegación entre Áreas sin perder datos;
- sincronización idempotente;
- conservación de fotografías y firmas pendientes;
- resolución explícita de conflictos sobre el mismo dato.

El inicio no se encola offline. Requiere confirmación online para fijar la hora, adquirir el bloqueo del dispositivo físico y congelar el paquete autoritativo.

La unidad de trabajo offline debe seguir entidades reales del dominio, no una definición de formulario.

## Limpieza del modelo anterior

La migración `20261006_011_remove_legacy_mip_forms.sql` retira:

- `formularios`;
- `respuestas_formulario`;
- `sedes.formularios_aplicables_json`;
- `servicios.formularios_versiones_json`.

API y frontend también dejan de exponer selección, conteo o validación de formularios por Sede. Las migraciones anteriores permanecen inmutables.

## Entrega incremental

La fundación de ejecución implementa el inicio online autoritativo, snapshots de Áreas/Criterios/Puestos de monitoreo/Productos, bloqueo persistente por dispositivo físico, liberación administrativa e idempotencia. La segunda entrega incorpora la superficie móvil y la preparación durable por usuario/Servicio. La tercera implementa el recorrido editable, navegación a la siguiente Área y la base durable de mutaciones offline por usuario/Servicio. La cuarta incorpora evaluaciones `C/CP/NC/NA` y observaciones por criterio sobre esa misma cola, con autosave local, sincronización idempotente y resolución explícita de versiones en conflicto. La quinta incorpora la excepción de Área sin acceso con descripción y fotografía obligatorias, archivo local durable antes de sincronizar y carga autorizada al bucket privado de medios del Servicio. La sexta incorpora revisiones de Puestos de monitoreo con tipo, clasificación y Plagas congelados, capturas por Plaga, actualización del estado permanente, fotografía condicional, persistencia offline y resolución explícita de conflictos. La séptima congela los tipos de Trampa disponibles al iniciar y permite crear desde el Área un punto permanente activo, incluso offline, incorporándolo al Servicio actual para su revisión y conservando corrección explícita ante conflictos de número. La octava incorpora apertura de Hallazgos con múltiples evidencias, responsable, seguimiento de pendientes de Servicios anteriores y cierre posterior con evidencia obligatoria, usando la misma persistencia offline e idempotencia. La novena completa el módulo con ambas firmas a pantalla completa, conservación local durable, sincronización privada y finalización autoritativa contra la matriz de completitud; ninguna etapa reintroduce formularios legacy.

Cada criterio admite hasta cinco fotografías privadas, conservadas localmente hasta sincronizar. Una actualización confirma primero PostgreSQL y solo después elimina de R2 los objetos retirados. Criterios, Áreas sin acceso, Puestos de monitoreo y Hallazgos ofrecen acciones separadas para cámara trasera y galería.

Al cancelar un Servicio se libera su bloqueo de ejecución y se desactivan, sin borrar el historial, los Puestos de monitoreo permanentes creados durante ese Servicio. Sus snapshots, revisiones y auditoría se conservan; al estar inactivos no forman parte de paquetes futuros.

## Navegación de trabajo del Técnico (revisión UX de octubre 2026)

La ejecución móvil presenta el Área actual mediante un selector y distribuye el contenido en **Criterios / Puestos de monitoreo / Hallazgos**. Cada pestaña indica su propio conteo de pendientes (o abiertos, para Hallazgos), sin contador global. El Técnico puede ir libremente al detalle global del Servicio, otras Áreas o Cierre; el cierre valida la completitud real sin ocultar el acceso a esa pantalla.

La excepción «No fue posible acceder» se diligencia en un diálogo. «Habilitar Área» está disponible inmediatamente, incluso antes de completar datos; mientras el Área está guardada como sin acceso, no se muestran criterios, puestos ni hallazgos editables. Se exige descripción y entre 1 y 5 evidencias privadas, con fotografía local durable y sincronización individual. La columna histórica `sin_acceso_foto_storage_path` sigue reflejando la primera evidencia por compatibilidad; `sin_acceso_evidencias_storage_paths` guarda el conjunto en una nueva migración. Tras guardar, la acción de continuar abre otra Área que aún requiera trabajo o la pantalla de revisión/cierre, no firma sin validar.

No se incluyen en esta entrega los cambios estructurales del Puesto de monitoreo (numeración automática, Trampa/Cebo opcionales y edición del alta). Se implementarán con migración y validaciones backend separadas para no alterar los snapshots históricos del servicio.

## Navegación compacta del Técnico, criterios y firmas

- Criterios: «Marcar pendientes como C» evalúa exclusivamente criterios sin calificación y conserva CP/NC/NA. El guardado reutiliza la cola idempotente offline existente; cada criterio puede corregirse individualmente.
- CP y NC muestran una sugerencia de observación/foto, nunca una obligatoriedad añadida.
- Las revisiones de hallazgos conservan fotos y observación por visita; el resultado se puede corregir en la misma visita, incluso después de marcarlo cerrado, sin modificar visitas anteriores. El cierre requiere al menos una evidencia fotográfica.
- Las fotos históricas se consultan mediante enlaces privados autorizados desde el técnico o administrador. Si R2 ya no conserva el archivo, el visor muestra «Sin fotos disponibles» sin borrar su referencia.
- El visor de fotos nuevas incluye anotación táctil y recorte antes de guardarlas; los originales históricos permanecen inmutables.
- La revisión y cierre usa mensajes compactos; una finalización confirmada abre opcionalmente el diálogo de enviar el informe. Un cierre offline no dispara envío prematuro.
- Marcar criterios pendientes como C desplaza al pie de navegación para continuar.
- Observaciones sin evaluación se guardan como borradores locales asociados al Técnico, Servicio y Área. No bloquean pestañas ni selector.
- Al pulsar Siguiente en Criterios o Puestos, se identifica el primer pendiente, se abre el puesto/hallazgo si aplica, se desplaza hasta el control y aparece validación contextual. Las pestañas continúan libres.
- En Hallazgos, Siguiente Área/Cierre valida Criterios, Puestos y seguimientos previos, no la existencia obligatoria de hallazgos nuevos.
- Cierre: nombre de firma del cliente precargado del contacto principal de la Sede, siempre editable sin modificar el contacto de origen. La validación final del servidor incluye seguimientos previos.
- Disposición móvil compacta, zonas táctiles de 44 px y temas claro/oscuro mediante tokens de diseño existentes.

## Fichas técnicas para técnicos

En Productos a aplicar cada producto que tenga ficha técnica puede abrirla mediante URL firmada de R2 generada solo cuando se pulsa. El backend verifica la asignación del técnico y la pertenencia del producto al servicio. Si no existe ficha, no se muestra enlace. El trabajo offline no intenta descargar PDFs completos.

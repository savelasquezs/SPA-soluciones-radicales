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
│  ├─ Condiciones del Área
│  │  └─ Criterios MIP aplicables
│  ├─ Monitoreo
│  │  └─ Puestos de monitoreo permanentes + revisión del Servicio
│  └─ Hallazgos y evidencias
├─ Resumen de la ejecución
├─ Firma del Técnico
└─ Firma del responsable del cliente
```

El Técnico puede desplazarse entre Áreas en cualquier orden y volver a una anterior. No existe un orden obligatorio de inspección.

El orden del recorrido es editable dentro del Servicio. Lista, selector y navegación secuencial comparten la misma secuencia. El Técnico puede abrir libremente cualquier Área o pestaña sin evaluar para cambiar de sección. Los botones de avance guiado (Criterios → Puestos → Hallazgos → Siguiente Área/Cierre) comprueban la sección correspondiente y envían al primer elemento pendiente con mensaje contextual; «Anterior» nunca exige completitud. Al llegar a Cierre se ofrece la revisión global con enlaces a los pendientes, y la finalización permanece bloqueada hasta completar la matriz requerida. Reorganizar no modifica la Sede ni los datos de evaluación. Véase [service-area-route.md](service-area-route.md).

Los Servicios de Refuerzo y los Servicios residenciales conservan sus reglas simplificadas y no ejecutan este recorrido MIP completo.

La primera versión de trabajo de campo implementa únicamente Servicios `PRINCIPAL` de Sedes tipo Negocio. Refuerzos y Servicios residenciales no se habilitan por inferencia en esta superficie.

## Preparación e inicio

El Servicio sigue visible antes de la visita, pero la ejecución solo puede iniciarse desde una hora antes de `inicio_programado`. La SPA presenta `Disponible desde [hora]`; el servidor calcula la ventana con su reloj y rechaza cualquier inicio anticipado.

Iniciar requiere conexión. La preparación previa permite consultar y almacenar el paquete, pero no habilita edición técnica ni sustituye el inicio confirmado por el servidor. Una vez iniciado y congelado el paquete, el Técnico puede continuar sin conexión y sincronizar posteriormente las mutaciones idempotentes.

La preparación se conserva en IndexedDB por usuario y Servicio. El paquete local incluye la copia recibida del servidor, la fecha de guardado, la identidad estable del celular, el bloqueo de ejecución cuando exista y cualquier identificador de inicio cuya respuesta esté pendiente. Una recarga conserva el paquete; otra cuenta no lo reutiliza. Sin conexión, la lista y el detalle muestran únicamente Servicios preparados en ese celular e identifican que se está leyendo una copia local.

La superficie inicial del Técnico es mobile-first y compacta: lista sus Servicios Principales asignados con los que están en proceso primero, seguidos por los programados en orden ascendente y el historial al final. El servidor indica cuándo un Servicio es elegible para preparación; desde una hora antes del inicio programado la SPA descarga en segundo plano los paquetes faltantes, sin duplicar solicitudes. Solo se muestra el estado de conexión cuando no hay red y la copia local se representa con un check accesible. Iniciar y recuperar un Servicio continúan siendo operaciones online; ante una respuesta incierta se reutiliza el mismo identificador idempotente.

Un Servicio `PROGRAMADO` no muestra sus Áreas. Presenta únicamente el contexto esencial, la disponibilidad autoritativa y la acción explícita para iniciar. Tras el inicio, o al reingresar a un Servicio `EN_PROCESO` bloqueado por el mismo celular, la SPA reemplaza la ruta por la primera Área pendiente; si no quedan Áreas pendientes entra al cierre. El contexto general y los Productos permanecen disponibles como resumen plegable dentro del recorrido.

Al iniciar, el servidor vuelve a cargar la configuración vigente, congela Áreas, criterios aplicables, identidad/estado de Puestos de monitoreo y Productos previstos, registra `inicio_real` y cambia el Servicio a `EN_PROCESO` en una sola transacción. No se mezclan datos de una preparación antigua con catálogos nuevos.

Solo un celular puede editar un Servicio `EN_PROCESO`. El bloqueo dura toda la ejecución y se identifica por usuario, Servicio y dispositivo físico; cerrar el navegador no lo libera. En el detalle administrativo del Servicio se muestra quién conserva el acceso cuando existe un bloqueo y el Administrador puede liberarlo de forma auditada para permitir recuperación en otro celular. La confirmación advierte que los cambios que existan únicamente en el celular anterior no se transfieren automáticamente. La primera versión no admite edición técnica simultánea ni mezcla automática de dos dispositivos físicos.

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

## Hallazgos

Los Hallazgos pertenecen al Servicio, Sede y Área correspondientes.

Desde el Área el Técnico puede registrar descripción, recomendación/acción correctiva, evidencia y demás datos definidos por el dominio. Los Hallazgos anteriores pendientes deben seguir disponibles para verificación y eventual cierre según las reglas ya aprobadas.

Al abrir un Hallazgo, el backend toma el nombre y correo del contacto principal vigente de la Sede y los guarda como responsable histórico; el Técnico no los escribe ni puede sustituirlos mediante la API. En registros offline se usa el contacto del paquete solo para la vista provisional: el snapshot definitivo se obtiene al sincronizar. Si falta una configuración válida del contacto, se indica que debe completarse desde la administración. Modificar el contacto de la Sede no altera los hallazgos históricos. La apertura puede incluir varias fotografías. Un Hallazgo nuevo permanece `ABIERTO` y no puede verificarse ni cerrarse dentro del mismo Servicio. En un Servicio posterior de la misma Sede, el Técnico evalúa el hallazgo como «Sigue igual» (conserva su estado previo), `EN_PROCESO` o cerrado; la evaluación puede corregirse mientras el Servicio continúe en proceso y se registra en `hallazgo_seguimientos` con servicio, técnico, fecha, observación y fotografías; el cierre exige al menos una fotografía de evidencia y conserva el Servicio, la fecha y la observación de cierre. Las fotografías se guardan primero en el dispositivo local y se sincronizan individualmente con el almacenamiento privado cuando existe conexión.

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

# Ejecución de Servicio MIP

Decisión funcional aprobada el 6 de octubre de 2026. Este documento reemplaza el enfoque anterior de formularios dinámicos para la operación del Técnico.

## Principio

La ejecución de un Servicio MIP no usa un constructor de formularios, plantillas editables, secciones dinámicas ni versiones de formulario.

La interfaz del Técnico tiene una estructura estable definida por el producto y se construye con datos del dominio. Lo dinámico son los catálogos, las Áreas, los Dispositivos, los Productos, las Plagas y los registros propios de cada Servicio.

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
│  │  └─ Dispositivos permanentes + revisión del Servicio
│  └─ Hallazgos y evidencias
├─ Resumen de la ejecución
├─ Firma del Técnico
└─ Firma del responsable del cliente
```

El Técnico puede desplazarse entre Áreas en cualquier orden y volver a una anterior. No existe un orden obligatorio de inspección.

El orden del recorrido es editable dentro del Servicio. Lista, selector y «Siguiente: [Área]» usan la misma secuencia; la navegación omite Áreas resueltas, vuelve al inicio cuando hay pendientes anteriores y ofrece revisar el cierre solo cuando no quedan Áreas pendientes. Reorganizar no modifica la Sede ni los datos de evaluación. El detalle de interacción, persistencia offline, excepciones, concurrencia y criterios de aceptación está en [service-area-route.md](service-area-route.md).

Los Servicios de Refuerzo y los Servicios residenciales conservan sus reglas simplificadas y no ejecutan este recorrido MIP completo.

La primera versión de trabajo de campo implementa únicamente Servicios `PRINCIPAL` de Sedes tipo Negocio. Refuerzos y Servicios residenciales no se habilitan por inferencia en esta superficie.

## Preparación e inicio

El Servicio sigue visible antes de la visita, pero la ejecución solo puede iniciarse desde una hora antes de `inicio_programado`. La SPA presenta `Disponible desde [hora]`; el servidor calcula la ventana con su reloj y rechaza cualquier inicio anticipado.

Iniciar requiere conexión. La preparación previa permite consultar y almacenar el paquete, pero no habilita edición técnica ni sustituye el inicio confirmado por el servidor. Una vez iniciado y congelado el paquete, el Técnico puede continuar sin conexión y sincronizar posteriormente las mutaciones idempotentes.

La preparación se conserva en IndexedDB por usuario y Servicio. El paquete local incluye la copia recibida del servidor, la fecha de guardado, la identidad estable del celular, el bloqueo de ejecución cuando exista y cualquier identificador de inicio cuya respuesta esté pendiente. Una recarga conserva el paquete; otra cuenta no lo reutiliza. Sin conexión, la lista y el detalle muestran únicamente Servicios preparados en ese celular e identifican que se está leyendo una copia local.

La superficie inicial del Técnico es mobile-first y compacta: lista sus Servicios Principales asignados con los que están en proceso primero, seguidos por los programados en orden ascendente y el historial al final. El servidor indica cuándo un Servicio es elegible para preparación; desde una hora antes del inicio programado la SPA descarga en segundo plano los paquetes faltantes, sin duplicar solicitudes. Solo se muestra el estado de conexión cuando no hay red y la copia local se representa con un check accesible. Iniciar y recuperar un Servicio continúan siendo operaciones online; ante una respuesta incierta se reutiliza el mismo identificador idempotente.

Un Servicio `PROGRAMADO` no muestra sus Áreas. Presenta únicamente el contexto esencial, la disponibilidad autoritativa y la acción explícita para iniciar. Tras el inicio, o al reingresar a un Servicio `EN_PROCESO` bloqueado por el mismo celular, la SPA reemplaza la ruta por la primera Área pendiente; si no quedan Áreas pendientes entra al cierre. El contexto general y los Productos permanecen disponibles como resumen plegable dentro del recorrido.

Al iniciar, el servidor vuelve a cargar la configuración vigente, congela Áreas, criterios aplicables, identidad/estado de Dispositivos y Productos previstos, registra `inicio_real` y cambia el Servicio a `EN_PROCESO` en una sola transacción. No se mezclan datos de una preparación antigua con catálogos nuevos.

Solo un celular puede editar un Servicio `EN_PROCESO`. El bloqueo dura toda la ejecución y se identifica por usuario, Servicio y dispositivo; cerrar el navegador no lo libera. En el detalle administrativo del Servicio se muestra quién conserva el acceso cuando existe un bloqueo y el Administrador puede liberarlo de forma auditada para permitir recuperación en otro celular. La confirmación advierte que los cambios que existan únicamente en el celular anterior no se transfieren automáticamente. La primera versión no admite edición técnica simultánea ni mezcla automática de dos dispositivos.

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

El estado de avance del Área se deriva de sus datos reales: criterios evaluados, revisiones de dispositivos y hallazgos. La UI puede resumir este avance, pero no almacena una estructura de formulario separada.

## Monitoreo y dispositivos

Un Dispositivo es una identidad permanente de una Sede y un Área. Conserva número, tipo, ubicación y estado.

Cada Servicio Principal crea una revisión del Dispositivo. La revisión puede registrar, según aplique:

- estado observado;
- plagas/evidencias;
- cantidades capturadas;
- consumo;
- producto químico;
- antídoto;
- observaciones;
- fotografía.

Todos los Dispositivos congelados del Servicio deben quedar revisados. La primera versión no contempla una excepción de «Dispositivo inaccesible». La fotografía es obligatoria únicamente cuando el estado observado cambia desde el estado congelado a `DANADO` o `FUERA_DE_USO`; permanecer en uno de esos estados no exige una fotografía nueva por sí solo.

El Técnico puede crear un nuevo Dispositivo desde el Área durante la ejecución cuando corresponda. El nuevo registro queda disponible como punto permanente para Servicios posteriores.

Las Plagas disponibles para una revisión se derivan de la clasificación de monitoreo del tipo de Dispositivo:

- RASTREROS;
- VOLADORES.

La lista aplicable debe quedar congelada o representada de forma históricamente estable al iniciar/revisar el Servicio para que cambios futuros del catálogo no reinterpreten capturas anteriores.

## Productos aplicados

Productos no forman parte de la evaluación de un Área.

El Administrador selecciona los Productos y completa lote, dosis y método de aplicación al crear o editar el Servicio; fabricación y vencimiento se conservan cuando se informan. El Servicio no puede iniciar con un Producto previsto incompleto.

El Técnico ve esos Productos en la pantalla principal del Servicio, en modo de solo lectura. No existe una pantalla técnica separada para seleccionarlos ni modificarlos. Al iniciar, el servidor marca el conjunto previsto como aplicado y congela nombre, principio activo, registro sanitario, dosis de referencia y nombre del método para que el histórico no dependa del catálogo vivo.

## Hallazgos

Los Hallazgos pertenecen al Servicio, Sede y Área correspondientes.

Desde el Área el Técnico puede registrar descripción, recomendación/acción correctiva, evidencia y demás datos definidos por el dominio. Los Hallazgos anteriores pendientes deben seguir disponibles para verificación y eventual cierre según las reglas ya aprobadas.

La apertura registra responsable y puede incluir varias fotografías. Un Hallazgo nuevo permanece `ABIERTO` y no puede verificarse ni cerrarse dentro del mismo Servicio. En un Servicio posterior de la misma Sede, el Técnico puede marcarlo `EN_PROCESO` o cerrarlo; el cierre exige al menos una fotografía de evidencia y conserva el Servicio, la fecha y la observación de cierre. Las fotografías se guardan primero en el dispositivo y se sincronizan individualmente con el almacenamiento privado cuando existe conexión.

## Firmas y finalización

La firma del Técnico y la firma del responsable del cliente pertenecen al Servicio, no a un formulario. Ambas son obligatorias en cada Servicio: siempre hay una persona presente que firma por el cliente y no se implementa una excepción de ausencia.

Al pulsar Firmar, el lienzo ocupa la pantalla completa para facilitar el trazo en celular. Incluye acciones visibles para borrar, cancelar y aceptar; aceptar conserva la firma durablemente antes de salir.

Un Servicio Principal está completo cuando:

- cada Área quedó evaluada con todos sus criterios y Dispositivos, o se resolvió como Área sin acceso con descripción y fotografía;
- cada Dispositivo congelado tiene una revisión válida;
- cualquier fotografía obligatoria fue capturada;
- las dos firmas fueron aceptadas;
- las mutaciones y archivos obligatorios quedaron sincronizados antes de que el servidor confirme la finalización.

Los Hallazgos son opcionales y no se inventa uno para completar el Servicio. Abrir una pantalla no marca una sección como resuelta.

Frontend y servidor validan la misma matriz de completitud. Offline puede guardarse una intención de cierre, pero la UI no muestra `FINALIZADO` hasta recibir confirmación del servidor.

## Offline y autosave

El recorrido debe respetar las reglas generales de operación offline:

- autosave durante el diligenciamiento;
- persistencia local de cambios pendientes;
- navegación entre Áreas sin perder datos;
- sincronización idempotente;
- conservación de fotografías y firmas pendientes;
- resolución explícita de conflictos sobre el mismo dato.

El inicio no se encola offline. Requiere confirmación online para fijar la hora, adquirir el bloqueo del dispositivo y congelar el paquete autoritativo.

La unidad de trabajo offline debe seguir entidades reales del dominio, no una definición de formulario.

## Limpieza del modelo anterior

La migración `20261006_011_remove_legacy_mip_forms.sql` retira:

- `formularios`;
- `respuestas_formulario`;
- `sedes.formularios_aplicables_json`;
- `servicios.formularios_versiones_json`.

API y frontend también dejan de exponer selección, conteo o validación de formularios por Sede. Las migraciones anteriores permanecen inmutables.

## Entrega incremental

La fundación de ejecución implementa el inicio online autoritativo, snapshots de Áreas/Criterios/Dispositivos/Productos, bloqueo persistente por dispositivo, liberación administrativa e idempotencia. La segunda entrega incorpora la superficie móvil y la preparación durable por usuario/Servicio. La tercera implementa el recorrido editable, navegación a la siguiente Área y la base durable de mutaciones offline por usuario/Servicio. La cuarta incorpora evaluaciones `C/CP/NC/NA` y observaciones por criterio sobre esa misma cola, con autosave local, sincronización idempotente y resolución explícita de versiones en conflicto. La quinta incorpora la excepción de Área sin acceso con descripción y fotografía obligatorias, archivo local durable antes de sincronizar y carga autorizada al bucket privado de medios del Servicio. La sexta incorpora revisiones de Dispositivos con tipo, clasificación y Plagas congelados, capturas por Plaga, actualización del estado permanente, fotografía condicional, persistencia offline y resolución explícita de conflictos. La séptima congela los tipos de Dispositivo disponibles al iniciar y permite crear desde el Área un punto permanente activo, incluso offline, incorporándolo al Servicio actual para su revisión y conservando corrección explícita ante conflictos de número. La octava incorpora apertura de Hallazgos con múltiples evidencias, responsable, seguimiento de pendientes de Servicios anteriores y cierre posterior con evidencia obligatoria, usando la misma persistencia offline e idempotencia. La novena completa el módulo con ambas firmas a pantalla completa, conservación local durable, sincronización privada y finalización autoritativa contra la matriz de completitud; ninguna etapa reintroduce formularios legacy.

Cada criterio admite hasta cinco fotografías privadas, conservadas localmente hasta sincronizar. Una actualización confirma primero PostgreSQL y solo después elimina de R2 los objetos retirados. Criterios, Áreas sin acceso, Dispositivos y Hallazgos ofrecen acciones separadas para cámara trasera y galería.

Al cancelar un Servicio se libera su bloqueo de ejecución y se desactivan, sin borrar el historial, los Dispositivos permanentes creados durante ese Servicio. Sus snapshots, revisiones y auditoría se conservan; al estar inactivos no forman parte de paquetes futuros.

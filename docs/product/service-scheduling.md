# Programación de Servicios

Decisión funcional aprobada el 6 de octubre de 2026.

Este documento define la programación administrativa de Servicios Principales y Refuerzos, su reprogramación y el seguimiento de próximas visitas pendientes de confirmación.

## Principios

- La Agenda contiene Servicios ya confirmados y programados.
- Una próxima visita sugerida por periodicidad no es todavía un Servicio y no debe reservar Técnico, bloquear horario ni crear evento de Calendar.
- El Administrador puede adaptar fechas y horarios a la disponibilidad real del cliente.
- Las automatizaciones proponen y precargan; no sustituyen la confirmación del cliente ni la decisión final del Administrador.

## Tabla de Servicios en móvil

La tabla administrativa de Agenda e Historial se presenta como tarjetas compactas en teléfono, manteniendo la tabla de columnas en escritorio. Cada tarjeta prioriza fecha/hora, estado de la visita, Cliente y Sede, solicitud/tipo, Técnico responsable y valor/estado de pago; el contacto con WhatsApp inline y las acciones de detalle se conservan. La información extensa (colaboradores, receptor del pago e histórico) permanece consultable desde el detalle del Servicio.

En teléfono, la barra de filtros deja visibles la búsqueda, la fecha/rango y el número de filtros activos. Estado, Tipo y Técnico se despliegan a petición; la navegación por días desplaza el intervalo sin cambiar su duración y el selector permite rangos rápidos. Se mantienen las reglas existentes de filtros, URL, edición, confirmación de pagos y reprogramación, sin llamadas adicionales a la API al abrir el panel de filtros.

## Semana responsive en móvil

La vista Semana ofrece una lista cronológica de un solo día como presentación predeterminada en teléfonos (680 px o menos). El Administrador elige un día mediante una franja de siete fechas con indicadores de actividad, sin volver a consultar el servidor al cambiar entre días. La fecha explícitamente seleccionada se conserva en el parámetro URL `day`.

Al ingresar en una semana, se selecciona hoy si pertenece a ella; si no, el primer día con servicios y, si tampoco existe, el lunes. La opción Horario (`mobileView=hours`) presenta una cuadrícula de una sola columna para consultar cruces y crear pulsando en una hora libre. Regresar a Lista conserva la misma fecha. Los servicios cortos usan una etiqueta de una línea y sus detalles permanecen accesibles en Lista.

- Los días e indicadores cuentan los servicios por fecha de inicio programado en Bogotá, sin duplicar servicios nocturnos; la lista indica la fecha de finalización si cruza medianoche.
- Pulsar un servicio Programado abre la reprogramación rápida existente. Pulsar uno Finalizado o Cancelado abre su detalle. No se anuncia arrastrar con el dedo; el drag-and-drop con mouse permanece en escritorio y exige confirmación.
- Crear desde la fecha elegida precarga el formulario existente y el enlace de regreso conserva el día elegido. Si la fecha no permite programar una visita futura, se usa el formulario normal.
- Para garantizar indicadores completos, Semana descarga las páginas adicionales cuando el total supera los 100 servicios de la primera página; las lecturas siguen siendo cancelables cuando cambian fecha, filtros o sesión.
- En 320 px, la franja de días puede desplazarse horizontalmente de forma independiente, nunca la página completa. El calendario de escritorio conserva sus siete columnas originales.

## Agenda semanal interactiva

- La vista **Semana** permite crear un Servicio pulsando el espacio del día/hora o el signo + del encabezado. Se abre el formulario existente con hora de Bogotá precargada; no hay reserva hasta confirmar el formulario. Un borrador local anterior tiene prioridad y se identifica al recuperarse.
- Cada bloque muestra hora, Cliente y Sede. Pulsarlo abre **Reprogramar**, incluyendo equipo, duración y, para un Principal con Refuerzo Programado, la fecha del Refuerzo. El acceso a detalle permite la edición completa. Los servicios que ya no están Programados son de consulta y no admiten arrastre.
- En escritorio, los bloques **Programados** se arrastran de una columna/hora a otra de la misma semana, ajustando a intervalos de **15 minutos**. Soltar muestra una confirmación con fecha y hora anterior y propuesta; **Cancelar** no envía ninguna mutación y conserva el registro original.
- Confirmar reutiliza la reprogramación autoritativa con versión e idempotencia, conserva duración, técnicos, cobro y productos. Arrastrar un Principal no mueve silenciosamente su Refuerzo; se informa y la edición rápida permite modificar ambos en una transacción cuando así se requiera.
- Cruces de horarios y conflictos de versión siguen las validaciones y confirmaciones existentes. Ante un fallo no se altera la posición guardada; el usuario puede reintentar o revisar la versión actual. Google Calendar se actualiza desde la outbox tras el guardado, nunca desde el navegador.
- La alternativa accesible por teclado o teléfono son los controles de crear y reprogramar del calendario; el arrastre no es la única manera de modificar una fecha.

## Cruces de técnicos (regla obligatoria)

- No se admite que un mismo técnico sea responsable o colaborador de dos Servicios con intervalos simultáneos. Se consideran los Servicios Programados y En proceso; las visitas Finalizadas y Canceladas no bloquean disponibilidad.
- El aviso de cruce **no** ofrece guardar de todos modos: abre una resolución que informa las visitas afectadas, los técnicos coincidentes y permite cambiar el equipo del Servicio que se está guardando o el de un Servicio afectado todavía Programado.
- Los selects son reactivos: excluyen al técnico en conflicto, integrantes ya asignados al mismo equipo, técnicos no activos, certificados vencidos y técnicos ocupados en otros Servicios que coinciden con el intervalo. Al cambiar el tipo de resolución o una selección se recalculan las opciones.
- Si un técnico coincide con varios Servicios, su reemplazo en el Servicio nuevo puede resolver varios cruces automáticamente. Solo se habilita guardar cuando se han resuelto todos.
- La confirmación aplica las programaciones y reasignaciones de los Servicios afectados dentro de **una única transacción**, comprobando sus versiones y revalidando disponibilidad en el servidor. Se guarda todo o nada; cambios simultáneos vuelven a exigir resolución.
- Un Servicio En proceso no puede reasignarse desde este diálogo. La reprogramación mediante arrastre de la agenda respeta la misma regla.
- Se conserva el rol del técnico reemplazado (responsable o colaborador), las fechas y duración de las visitas existentes y se registra auditoría individual. La outbox de Google Calendar actualiza todos los eventos cambiados después de confirmar.

## Servicio Principal

El Administrador crea el Servicio Principal y el servidor genera su consecutivo.

Para clientes **Negocio**, el valor del Servicio Principal se deriva de la tarifa de su Sede al crearlo. Para clientes **Casa**, el formulario de cliente permite configurar una tarifa predeterminada que se guarda en `sedes.valor_servicio` de su Sede residencial interna; no se crea un segundo campo en la base de datos.

La tarifa residencial es opcional para permitir clientes ya existentes sin valor configurado. Al programar una visita se precarga el valor de la Sede cuando exista, pero el Administrador puede modificarlo para esa visita concreta. Si la tarifa está vacía, debe introducir el importe al programar. El valor definitivo se guarda en `servicios.valor_servicio` y **no cambia** si luego se edita la tarifa de la Sede. Los valores se validan como enteros no negativos en COP.

El formulario de programación permite definir fecha, hora, Técnico responsable y colaboradores de acuerdo con las reglas generales de asignación.

## Refuerzo

Una Sede con `maneja_refuerzo = true` genera un Refuerzo asociado cuando se confirma un nuevo Servicio Principal.

El Refuerzo:

- pertenece al Principal de la misma Sede;
- existe máximo uno por Principal;
- tiene valor `0`;
- no ejecuta la evaluación MIP completa por Áreas ni genera el informe MIP completo;
- toma inicialmente el mismo Técnico responsable y colaboradores del Principal;
- toma inicialmente la misma duración programada del Principal.

### Fecha sugerida del Refuerzo

La fecha y hora iniciales del Refuerzo se proponen exactamente **21 días después** del Principal.

El objetivo de los 21 días es conservar tres semanas completas: mismo día de la semana y misma hora.

Ejemplo:

```text
Principal: lunes 5 de octubre · 10:00
Refuerzo sugerido: lunes 26 de octubre · 10:00
```

Los 21 días son únicamente el valor predeterminado inicial. **No son una restricción permanente de integridad.**

La disponibilidad del cliente tiene prioridad. El Administrador puede cambiar libremente la fecha y hora del Refuerzo antes o después de su creación mientras el Servicio continúe siendo reprogramable.

## Productos previstos

Al programar o editar un Servicio, el Administrador selecciona productos y solo informa lote y vencimiento por cada uno. La dosis y los métodos de aplicación son datos del catálogo MIP; se muestran como referencia, no se vuelven a capturar ni se validan como campos de la visita. Reprogramar una cita no elimina ni recalcula el lote y el vencimiento ya guardados. Al inicio de la ejecución se congelan los datos del catálogo; ver [Ejecución](./service-execution.md).

## Reprogramación

### Reprogramar un Principal

Cuando un Principal tiene un Refuerzo programado, la acción de reprogramación debe presentar ambos Servicios dentro del mismo flujo.

Deben mostrarse y poder editarse:

- fecha y hora del Principal;
- Técnico responsable y colaboradores del Principal;
- fecha y hora del Refuerzo;
- Técnico responsable y colaboradores del Refuerzo.

La fecha del Refuerzo no queda bloqueada a `Principal + 21 días`. El Administrador puede conservar la propuesta, ajustarla o elegir otra fecha según lo acordado con el cliente.

El guardado interno de Principal y Refuerzo se realiza como una sola operación transaccional: o se guardan todos los cambios válidos o no se guarda ninguno.

La sincronización posterior con Google Calendar sigue las reglas generales de integraciones: es asíncrona, idempotente y reintentable. Un fallo de Calendar no revierte el cambio ya confirmado en la base de datos.

**Acceso directo desde Calendar.** La descripción de la invitación conserva solicitud, responsable, colaboradores y tipo de servicio, y añade un enlace HTTPS a la SPA:
- En **Servicio Principal**, «Abrir servicio en Soluciones Radicales» lleva a la pantalla de trabajo del técnico, usando el UUID de ese servicio.
- En **Refuerzo**, «Ver mis servicios» lleva al listado mientras la ejecución de refuerzos no esté habilitada en la app técnica; evita enlazar una ruta no compatible.
- El técnico debe iniciar sesión con Google y mantener el rol Técnico activo. La SPA conserva la dirección original al autenticarse y al seleccionar el rol, sin exponer datos privados por el enlace.
- Google Calendar reconoce el enlace como clicable en la descripción. El evento conserva fecha, ubicación y asistentes, sin generar eventos duplicados.
- El servidor usa CALENDAR_APP_ORIGIN cuando se configuró, validado contra ALLOWED_ORIGINS. Sin variable explícita, solo admite una única URL estable de Cloudflare (desarrollo o producción) presente en ALLOWED_ORIGINS; nunca utiliza un preview con identificador temporal. Cuando no puede resolver un origen seguro, conserva la invitación sin enlace y registra una advertencia, para no interrumpir la programación.
- El nuevo enlace aparece en los eventos que se **crean, reprograman o sincronizan de nuevo**. No se reenvían masivamente invitaciones existentes, para evitar notificaciones innecesarias. Para actualizar una existente, el administrador puede solicitar el reintento de Calendar.



### Reprogramar un Refuerzo

El Refuerzo también puede reprogramarse directamente.

El Administrador puede modificar su fecha, hora, Técnico responsable y colaboradores sin modificar el Principal.

La relación con el Principal y la Sede permanece intacta.

## Cancelación

Si se cancela un Principal y su Refuerzo asociado continúa en estado `PROGRAMADO`, el flujo de cancelación debe incluir ambos Servicios.

Cancelar únicamente el Refuerzo no cancela ni modifica el Principal.

Un Refuerzo que ya esté en ejecución o finalizado conserva su histórico y no se modifica mediante una cancelación posterior del Principal.

## Próximos por confirmar

La periodicidad configurada en la Sede no crea automáticamente Servicios futuros en la Agenda.

Al finalizar un Servicio Principal, el sistema calcula la próxima visita sugerida según `periodicidad_meses` de la Sede y crea un registro de seguimiento en **Próximos por confirmar**.

Este registro representa una intención de contacto y programación futura, no un Servicio confirmado.

No debe:

- crear una fila en `servicios`;
- generar consecutivo de Servicio;
- reservar Técnico;
- crear evento de Calendar;
- generar Refuerzo.

### Ubicación en la interfaz

La sección administrativa de Servicios se organiza conceptualmente como:

```text
Servicios
├─ Agenda
├─ Próximos por confirmar
└─ Historial
```

`Próximos por confirmar` reutiliza el patrón visual de tabla compacta de Servicios, pero trabaja con registros de preagenda.

### Información mínima

Cada registro de Próximos por confirmar debe permitir identificar como mínimo:

- Cliente;
- Sede;
- Servicio Principal anterior que originó la propuesta;
- próxima fecha sugerida;
- teléfono de contacto;
- correo de contacto;
- estado de seguimiento;
- último contacto registrado;
- canal del último contacto;
- fecha para volver a contactar cuando aplique.

## Estados de seguimiento

Los estados funcionales son:

- `PENDIENTE`: todavía no se ha contactado al cliente;
- `CONTACTADO`: ya hubo una gestión de contacto y se espera respuesta;
- `CONFIRMADO`: el cliente aceptó realizar la próxima visita, pero el Servicio todavía no ha sido creado;
- `POSPUESTO`: el cliente pidió retomar la confirmación posteriormente;
- `NO_DESEA`: el cliente indicó que no desea programar esa próxima visita.

El registro permanece en la preagenda hasta que se crea efectivamente el nuevo Servicio Principal o queda resuelto mediante una salida que no requiera programación.

## Acciones de contacto

### WhatsApp

Todo celular visible y accionable conserva la regla global del producto: icono de WhatsApp inline con el número.

Desde Próximos por confirmar el Administrador puede abrir la conversación de WhatsApp del contacto correspondiente.

Abrir WhatsApp es una acción de contacto; no debe interpretarse técnicamente como confirmación de que el mensaje fue enviado, recibido o leído.

### Correo

La tabla ofrece una acción para enviar un correo de confirmación utilizando un mensaje predefinido del producto.

El correo se envía mediante la integración empresarial de Gmail y conserva las reglas generales de auditoría, idempotencia y reintento de efectos externos.

## Agendar una visita confirmada

Cuando el cliente confirma, el Administrador utiliza la acción **Agendar**.

La acción abre el formulario normal de Programar servicio precargado con la información disponible, como mínimo:

- Cliente;
- Sede;
- tipo Principal;
- fecha sugerida.

El Administrador puede modificar los datos antes de confirmar, incluida la fecha, hora y asignación técnica.

El registro de Próximos por confirmar **no desaparece al abrir el formulario**. Solo sale de la lista cuando el nuevo Servicio Principal se crea correctamente.

Si la Sede maneja Refuerzo, al confirmar ese nuevo Principal se aplica nuevamente la regla normal: se crea su Refuerzo asociado con propuesta inicial de **+21 días**, misma hora y misma duración, editable posteriormente.

## Indicadores de atención

La pestaña **Próximos por confirmar** muestra un marcador numérico para los registros que requieren atención próxima.

El marcador principal representa los registros todavía pendientes de confirmación cuya fecha sugerida se encuentra dentro de los próximos siete días.

Su función es señalar trabajo operativo pendiente, no mostrar el total histórico de registros de preagenda.

La tabla puede permitir filtros por estado y horizonte temporal sin alterar el significado del marcador principal.

## Separación de dominio

Agenda y Próximos por confirmar pueden compartir componentes visuales, pero representan conceptos diferentes:

- **Servicio:** compromiso confirmado, con consecutivo, asignación técnica y ciclo de ejecución.
- **Próximo por confirmar:** propuesta derivada de periodicidad pendiente de contacto o confirmación.

La implementación debe conservar esta separación y evitar crear Servicios ficticios únicamente para representar seguimientos comerciales u operativos.


## Registro de pago en efectivo

El Técnico previsto para recaudar durante la visita y la persona que finalmente recibe el efectivo son conceptos distintos.

- `tecnico_recaudo_previsto_id` continúa representando únicamente al Técnico que se espera que cobre durante la visita.
- El receptor real del efectivo se registra como Usuario y puede ser el Técnico o el Administrador que está registrando el pago.
- Si el Administrador recibe directamente el efectivo, el pago no debe quedar atribuido al Técnico.
- Registrar quién recibió el efectivo no equivale a registrar una entrega de caja entre Técnico y Administrador; esa operación pertenece al módulo de caja.

## Programación compacta y cobro confirmado desde el alta

- **Cliente** usa búsqueda normalizada (incluye nombres con acentos) sobre las sedes ya cargadas en el espacio de trabajo; **Sede** sigue siendo el selector nativo, filtrado por el cliente. Al cambiar de cliente se borra la sede previa y se recalculan duración y refuerzo; se conserva la selección al editar o reabrir el borrador.
- **Fecha/hora** utiliza BaseDateTimePicker con mínimo de la hora actual en Bogotá para un servicio **nuevo**. El validador y el backend comprueban nuevamente que las visitas principal y de refuerzo estén en el futuro en el momento del guardado. La edición de registros históricos no se bloquea por su fecha anterior.
- **Productos a utilizar** reutiliza BaseMultiSelect con búsqueda activada y botón «Aceptar» para cerrar. ServiceProductsFields sigue mostrando los seleccionados con su X, lote y vencimiento. La búsqueda y confirmación son opcionales y no alteran los otros formularios.
- **Pago** permite indicar durante el alta si el cliente ya pagó. Si no pagó, se conserva el cobro previsto. Si pagó, se exige método; para efectivo es obligatorio indicar el receptor, que puede ser el administrador que está programando o un técnico activo. Transferencia confirmada no exige receptor de efectivo. La confirmación se registra en la misma transacción que crea el servicio con fecha, actor y receptor. Las correcciones posteriores siguen desde «Registrar pago».
- No se crean tablas ni migraciones adicionales.



## Visitas residenciales (Clientes Casa)

- El buscador de Cliente incluye Negocio y Casa activos. Casa conserva su Sede interna `RESIDENCIAL`, creada junto con el Cliente, pero el Administrador no ve ni selecciona esa Sede: ve directamente la dirección registrada.
- El importe en pesos colombianos se introduce manualmente en cada Servicio Principal residencial, como un entero no negativo. No se guarda en la configuración de la Casa. El valor de visitas anteriores es inmutable; una visita nueva puede tener otro precio.
- La duración se propone en 90 minutos y puede cambiarse por visita. Responsable, colaboradores, Productos, cobro y Calendar siguen el contrato del Servicio Principal.
- Casa no crea Refuerzos ni propuestas periódicas. El backend y la base de datos impiden agendar sin precio o con Refuerzo residencial. Para Negocio el servidor sigue calculando el importe desde la Sede e ignora un precio manipulado por el navegador.
- El Técnico puede ejecutar la visita sin Áreas, firmar y cerrar. Las superficies de certificados e informe MIP completo no se ofrecen para Casa.

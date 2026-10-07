# Programación de Servicios

Decisión funcional aprobada el 6 de octubre de 2026.

Este documento define la programación administrativa de Servicios Principales y Refuerzos, su reprogramación y el seguimiento de próximas visitas pendientes de confirmación.

## Principios

- La Agenda contiene Servicios ya confirmados y programados.
- Una próxima visita sugerida por periodicidad no es todavía un Servicio y no debe reservar Técnico, bloquear horario ni crear evento de Calendar.
- El Administrador puede adaptar fechas y horarios a la disponibilidad real del cliente.
- Las automatizaciones proponen y precargan; no sustituyen la confirmación del cliente ni la decisión final del Administrador.

## Servicio Principal

El Administrador crea el Servicio Principal y el servidor genera su consecutivo.

El valor del Principal se deriva de la Sede al momento de crearlo. Cambios posteriores en el valor configurado de la Sede no modifican Servicios existentes.

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

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
- Listas, Sedes, Áreas, Dispositivos e historiales deben dominar el viewport cuando sean la tarea principal.
- Evitar varias cards grandes para datos breves que pueden convivir en una franja compacta.
- En desktop se permiten controles visualmente compactos cuando preservan foco, legibilidad y semántica; en mobile las zonas táctiles continúan siendo de al menos 44 px.
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
      ├─ Dispositivos
      ├─ Vehículos
      └─ Servicios
```

- Sedes se administran dentro del contexto de Negocio.
- Un Cliente Casa oculta la Sede residencial interna y no expone Áreas, formularios MIP, certificados ni vehículos.
- Áreas, Dispositivos y Vehículos conservan el contexto de Sede.
- Una ruta puede existir sin aparecer en el sidebar.
- Usar breadcrumbs cuando la ruta tenga más de un nivel de contexto.

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
- En mobile transformar a cards o filas apiladas cuando la tabla no sea legible.
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

# Reutilización frontend

## Objetivo

La interfaz debe crecer mediante piezas compartidas y contratos claros. Reutilizar no significa crear una abstracción para cada línea: significa que un comportamiento, estado o patrón visual tiene un único dueño y no se vuelve a implementar en cada módulo.

## Regla principal

Antes de crear código, buscar una pieza existente que resuelva el caso. Si aparece por segunda vez el mismo patrón, se extrae o amplía la pieza compartida antes de duplicarlo.

Las primitivas transversales conocidas se crean como fundación antes de desarrollar múltiples pantallas. Las abstracciones específicas de negocio se crean cuando exista un uso real y un contrato estable.

## Capas y responsabilidades

| Capa | Responsabilidad | No debe hacer |
|---|---|---|
| `components/base` | Primitivas visuales y accesibles | Consultar proveedores o conocer entidades |
| `components/layout` | Shell, navegación y distribución | Contener reglas de negocio |
| `components/domain` | Bloques visuales reutilizables de negocio | Ser dueño de datos globales o consultar directamente |
| `views` | Componer una ruta y coordinar su caso de uso | Duplicar services, helpers o componentes |
| `composables` | Comportamiento reactivo reutilizable | Convertirse en almacén global implícito |
| `stores` | Estado compartido entre rutas o procesos | Guardar estado visual local de cada componente |
| `services` | I/O remoto y mapeo de contratos | Manejar DOM o feedback visual |
| `helpers` | Funciones puras | Leer stores, router o variables reactivas |
| `types` | Contratos de dominio, DTO y utilidades | Ejecutar lógica o efectos secundarios |

## Dependencias permitidas

- Las vistas pueden usar componentes, composables, stores, services, helpers y tipos.
- Los componentes de dominio pueden usar componentes base, composables, helpers y tipos.
- Los componentes base solo usan otros componentes base, helpers y tipos neutrales.
- Los stores pueden usar services, helpers y tipos.
- Los composables pueden usar stores, services, helpers y tipos cuando su contrato lo necesite.
- Los services pueden usar los clientes compartidos de Neon Auth/Data API/Functions, helpers y tipos.
- Los helpers y tipos no dependen de Vue, Pinia, router o proveedores remotos.

No se permiten ciclos entre stores y composables. Si dos stores se necesitan mutuamente, extraer la coordinación a un service o composable de nivel superior.

## Fundación compartida inicial

Crear estas capacidades cuando comience la implementación de UI, antes de replicarlas en módulos:

### Componentes base

- botón con variantes, loading y prevención de doble acción;
- campo, textarea, select, checkbox y radio con label, ayuda y error;
- diálogo y confirmación con gestión de foco;
- toast global accesible;
- spinner, skeleton y panel de carga;
- empty state y error state con reintento;
- badge de estado;
- paginación;
- contenedor responsive para tabla/cards;
- selector de archivos con progreso y error.
- selector reutilizable de fecha, hora y fecha-hora sin depender de los controles nativos del navegador.

Un componente base expone una API pequeña, tipada y consistente. No incorpora nombres ni reglas de una entidad.

### Composables

- sesión y rol activo;
- operación asíncrona con estado `idle/loading/success/error`;
- formulario modificado y confirmación de descarte;
- formulario con errores de servidor normalizados;
- filtros y paginación sincronizables con la URL cuando corresponda;
- conectividad y recuperación online;
- autosave y borrador local;
- cola de sincronización offline;
- carga y optimización de archivos;
- breakpoints solo cuando CSS no pueda resolver el comportamiento.

Un composable devuelve estado y acciones con tipos explícitos. Debe limpiar listeners, timers y suscripciones al desmontarse.

### Stores Pinia

- `auth`: sesión, usuario autorizado, roles disponibles y rol activo;
- `notifications`: cola global de toasts;
- `connectivity`: estado online y sincronización pendiente;
- `catalogs`: catálogos reutilizados con carga, invalidación y caducidad explícitas;
- `app`: preferencias globales estrictamente necesarias, como tema y estado del shell.

No crear un store por pantalla. Un módulo con datos usados en una sola ruta puede vivir en un composable de esa ruta.

## Propiedad del estado

Antes de crear estado responder:

1. ¿Solo afecta a este componente? Mantener local.
2. ¿El mismo comportamiento se reutiliza en varios componentes? Composable.
3. ¿Debe sobrevivir navegación o compartirse entre rutas? Store.
4. ¿Debe sobrevivir recarga o pérdida de conexión? IndexedDB mediante una capa compartida.
5. ¿Es la fuente de verdad del negocio? PostgreSQL.

No persistir automáticamente todo Pinia en `localStorage`. Identidad, roles, tokens y permisos provienen de Neon Auth y del registro de aplicación, y se revalidan.

## Datos remotos

Los services encapsulan:

- consultas permitidas por RLS mediante Neon Data API;
- serialización entre `snake_case` remoto y contratos frontend cuando se decida mapearlos;
- errores técnicos convertidos en errores de aplicación seguros;
- cancelación o descarte de respuestas obsoletas;
- paginación y límites;
- invocación de Neon Functions para operaciones privilegiadas o con secretos;
- URLs firmadas y cargas autorizadas a Cloudflare R2 mediante backend.

Una consulta usada por más de un módulo tiene una sola implementación. Los nombres de tablas, endpoints, buckets y Functions no se dispersan en componentes.

## Caché e invalidación

- Cachear únicamente datos con beneficio comprobable.
- Cada caché declara alcance, caducidad e invalidación.
- Una mutación actualiza o invalida solo los datos afectados.
- No ocultar permisos revocados detrás de una caché local.
- Sesión, rol activo y autorización siempre se revalidan.
- Evitar recargar una lista completa cuando la mutación ya devuelve el registro definitivo.
- Evitar solicitudes por fila; solicitar datos relacionados en una consulta o caso de uso agregado.

## Formularios

- Los esquemas, normalizadores y mensajes reutilizables tienen una única implementación.
- Cuando alta y edición comparten campos y reglas, reutilizar un único formulario con modo `create | edit` en lugar de mantener dos árboles de controles que puedan divergir.
- En modo edición, cargar el registro definitivo antes de habilitar cambios y conservar bloqueados los campos inmutables por reglas de identidad o negocio.
- Los errores de campo permanecen junto al campo.
- Los errores globales pasan por el sistema común de feedback.
- El submit se bloquea mientras está en curso.
- Un fallo conserva los valores ingresados.
- La navegación con cambios sin guardar exige confirmación.
- El servidor repite todas las validaciones de integridad y autorización.

### Regla Create/Edit

Cuando Crear y Editar usan los mismos campos y reglas deben compartir un único Form Component y un único esquema de validación. El modo, valores iniciales, estado de guardado y errores son entradas del mismo componente; no se mantienen árboles de controles paralelos.

### Regla de reutilización de datos

Si una lista o detalle ya contiene el snapshot editable de un registro, la acción Editar usa ese objeto. No se consulta nuevamente `GET /entidad/:id` solo para abrir el formulario.

El DTO de listado de un CRUD pequeño incluye los campos ligeros necesarios para renderizar y editar, aunque algunos no aparezcan como columnas. Un fetch adicional sí corresponde cuando hay un deep link o recarga sin caché, datos pesados, historiales paginados, archivos, información deliberadamente omitida o un conflicto de versión.

### Regla de actualización

Crear y actualizar devuelven el registro definitivo. El store o listado hace upsert por ID y mueve el registro entre subconjuntos activos/inactivos cuando corresponda. No se recarga automáticamente toda la colección ni se pierden búsqueda, filtros, tab, scroll o página.

### Caso aplicado: Usuarios

El módulo `/usuarios` usa la tabla únicamente como superficie de consulta y acciones. Cada fila expone **Editar** y abre el mismo diálogo utilizado para el alta, precargado con el registro ya devuelto por `GET /api/users`.

- Crear y editar comparten campos, validaciones y feedback.
- El formulario de edición no se renderiza debajo de la tabla.
- El correo queda bloqueado cuando `auth_user_id` ya está vinculado a Google.
- Roles, estado y datos del certificado se editan dentro del mismo flujo.
- La desactivación conserva confirmación destructiva y el historial del usuario.
- En móvil, las cards conservan una acción explícita **Editar usuario**.
- La carga o reemplazo del archivo del certificado continúa bloqueada hasta disponer del backend autorizado de R2.

## Errores y feedback

Los services no muestran toasts. Devuelven datos o errores normalizados. La vista o composable decide el feedback según el contexto.

La carga de archivos requiere un backend autorizado. Mientras no exista el endpoint que entregue una operación segura sobre R2, la SPA conserva el contrato en `services`, informa el bloqueo y nunca intenta usar credenciales R2 ni persistir archivos como base64.

Usar una forma común de error con:

- código estable de aplicación;
- mensaje seguro para el usuario;
- campos afectados cuando aplique;
- indicador de reintento posible;
- causa técnica disponible solo para observabilidad segura.

Nunca mostrar nombres internos de tablas, políticas, columnas, trazas o consultas al usuario.

## Reutilización de dominio

Un componente de dominio se justifica cuando representa una unidad reconocible y repetida, por ejemplo:

- resumen de Servicio;
- selector contextual Negocio/Sede;
- estado de pago;
- tarjeta de Hallazgo;
- asignación de Técnicos;
- captura de evidencias;
- firma;
- revisión de Dispositivo.

Debe recibir datos tipados y emitir intenciones. La vista o composable ejecuta la operación.

## Rendimiento

- Cargar cada módulo bajo demanda por ruta.
- Dividir dependencias pesadas solo cuando exista beneficio medible.
- No usar polling si invalidación, eventos del backend o una actualización explícita resuelven el caso.
- Cancelar o ignorar respuestas de navegación anterior.
- Debounce únicamente entradas que disparan trabajo real, como búsquedas remotas.
- Optimizar imágenes antes de subirlas.
- Paginar historiales y no traer columnas que la pantalla no usa.

## Pruebas

- Helpers: pruebas unitarias de entradas, límites y normalización.
- Composables: estado, limpieza, concurrencia, error y reintento.
- Stores: transiciones, invalidación y aislamiento entre sesiones.
- Componentes base: accesibilidad, variantes, teclado y eventos.
- Services: contratos, mapeo de errores y respuestas.
- Vistas: integración del flujo sin volver a probar internamente cada primitiva.

## Lista de revisión

- [ ] Se buscó una solución compartida existente.
- [ ] La vista no consulta Neon ni otros proveedores directamente.
- [ ] El estado está en la capa correcta.
- [ ] No existe una segunda implementación del mismo patrón.
- [ ] Los contratos están tipados y no usan `any`.
- [ ] Los listeners y suscripciones se limpian.
- [ ] La mutación invalida o actualiza la caché correcta.
- [ ] Los estados loading, vacío, error y éxito usan primitivas comunes.
- [ ] La autorización sigue siendo responsabilidad del servidor.

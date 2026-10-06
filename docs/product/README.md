# Producto

## Propósito

Soluciones Radicales MIP gestiona clientes, programación, ejecución técnica, evidencias, informes, certificados, pagos y seguimiento de servicios de Manejo Integrado de Plagas.

El comportamiento funcional aprobado del proyecto anterior se conserva. La reimplementación cambia la plataforma técnica, no las reglas del negocio.

## Actores

### Administrador

- administra usuarios, clientes, sedes, áreas, catálogos y maestros;
- programa, asigna, reprograma y cancela servicios;
- confirma pagos y movimientos de efectivo;
- consulta operación, auditoría e indicadores;
- publica o revoca resultados para clientes.

### Técnico

- consulta únicamente servicios asignados;
- inicia y ejecuta servicios dentro de las reglas permitidas;
- diligencia formularios, productos, dispositivos, hallazgos, evidencias y firmas;
- trabaja offline cuando la aplicación fue cargada y autenticada previamente;
- no administra catálogos ni datos globales.

### Cliente externo

No tiene cuenta. Solo consulta el resultado limitado de un Servicio mediante un token público vigente.

## Entidades

| Entidad | Responsabilidad |
|---|---|
| `usuarios` | Identidad autorizada, roles y certificado del Técnico |
| `negocios` | Cliente tipo Negocio o Casa; conserva identidad, estado y configuración compartida |
| `sedes` | Lugar de servicio, contacto, precio y configuración operativa |
| `areas` | Espacios de una Sede utilizados en formularios y monitoreo |
| `plantillas_areas` | Conjuntos reutilizables de Áreas globales o privadas |
| `servicios` | Programación, ejecución, pago, firmas, informe y publicación |
| `formularios` | Definición versionada de secciones y campos |
| `respuestas_formulario` | Respuestas históricas agrupadas por Servicio, formulario, versión y Área |
| `productos` | Catálogo de productos utilizados |
| `productos_aplicados` | Planeación y aplicación de productos por Servicio |
| `configuracion` | Métodos, plagas, tipos de dispositivo y parámetros globales |
| `dispositivos` | Identidad permanente de trampas y dispositivos por Sede y Área |
| `revisiones_dispositivos` | Estado, capturas y evidencia observada durante un Servicio |
| `hallazgos` | No conformidades, seguimiento y cierre posterior |
| `vehiculos` | Vehículos asociados a Sedes habilitadas |
| `certificados` | Certificados de establecimiento o vehículo |
| `movimientos_efectivo` | Entregas de efectivo por Técnico |
| `auditoria` | Eventos sensibles append-only |

## Reglas principales

### Identidad y autorización

- El acceso interno requiere Google, un registro activo en `usuarios` y al menos un rol.
- Un usuario con dos roles opera con uno activo por sesión.
- El correo puede corregirse antes del primer acceso; después de vincular `auth_user_id` permanece inmutable para no romper la identidad Google.
- El servidor valida autorización en cada operación protegida.
- Los clientes y contactos no son usuarios del sistema.

### Certificado del Técnico

- Un Técnico puede no tener certificado.
- Si se registra un certificado, fecha de emisión y fecha de vencimiento son obligatorias.
- Si el certificado registrado está vencido, el Técnico no puede ser asignado como responsable.
- El certificado es una credencial opcional del usuario; no existe una bandera de certificación obligatoria.

### Clientes y contexto

- El concepto visible es Cliente. Un Cliente puede ser Negocio o Casa.
- Un Cliente Negocio puede tener varias Sedes y su configuración de certificado de establecimiento aplica a todas ellas.
- Un Cliente Casa conserva una única Sede residencial interna, invisible en la interfaz, sin Áreas, formularios MIP, certificados ni vehículos.
- Áreas, Dispositivos y Vehículos pertenecen a una Sede.
- El nombre de Área es único dentro de su Sede.
- El número de Dispositivo y la placa de Vehículo son únicos de forma normalizada dentro de su Sede.
- Una plantilla privada pertenece a un Negocio; una global no pertenece a ninguno.

### Servicios

- Estados: `PROGRAMADO`, `EN_PROCESO`, `FINALIZADO` y `CANCELADO`.
- Transiciones normales: `PROGRAMADO → EN_PROCESO → FINALIZADO`.
- Cada intento de sincronización con Calendar registra su resultado en la auditoría append-only.
- La cancelación solo parte de un estado no terminal, requiere Administrador y motivo.
- El Administrador crea el Servicio y el servidor genera el consecutivo.
- El responsable debe ser Técnico activo y cumplir vigencia de certificado cuando tenga uno registrado.
- Colaboradores activos, únicos y diferentes del responsable.
- Un Técnico solo accede a Servicios donde está asignado.
- La edición técnica usa un lease exclusivo renovable.
- El valor del Servicio Principal se deriva de la Sede.
- El Refuerzo pertenece a un Principal de la misma Sede, es gratuito, existe máximo uno y se programa exactamente 20 días después.
- El Refuerzo no usa formularios ni genera informe MIP completo.
- Una Sede residencial no exige formularios MIP ni informe completo.
- Finalizar exige tiempos reales, datos técnicos requeridos y firmas aplicables.

### Formularios

- Los formularios son dinámicos y versionados.
- Solo un borrador es editable.
- Publicar una versión no altera versiones ni respuestas históricas.
- Un Servicio Programado usa la configuración vigente de la Sede al iniciar.
- Al iniciar, el Servicio conserva el snapshot exacto de versiones.
- Formularios iniciales: FO-PS-02 v03, FO-PS-10 v01 y FO-PS-09 v01.
- Las respuestas pueden pertenecer a un Área y conservar evidencias.
- La persistencia agrupa una fila por Servicio + Formulario + Versión + Área; los campos respondidos viven en `respuestas_jsonb`.
- Cada entrada de `respuestas_jsonb` puede conservar valor, evaluación (`C`, `CP`, `NC`, `NA`), observación y referencias de evidencias.
- No se crea una fila PostgreSQL por cada campo respondido.

### Productos

- V1 no implementa inventario ni consumo de stock.
- Los productos pueden desactivarse sin romper referencias históricas.
- Un Producto aplicado requiere lote, dosis y método de aplicación.
- La fecha de vencimiento no puede ser anterior a fabricación.
- Existe máximo una fila por Servicio y Producto.

### Monitoreo

- Catálogo inicial de plagas: Polilla, Mosca doméstica, Mosca de fruta, Zancudo, Cucarrones, Cucaracha, Roedor y Otros.
- Los tipos de dispositivo son administrables.
- Cada revisión conserva snapshots de número, ubicación y tipo.
- Capturas puede registrar varias plagas y cantidades.
- Dispositivos dañados o fuera de uso pueden exigir fotografía según el flujo aprobado.

### Hallazgos

- Un Hallazgo pertenece a una Sede, Área y Servicio de apertura.
- Estados: `ABIERTO`, `EN_PROCESO` y `CERRADO`.
- El cierre pertenece a un Servicio posterior de la misma Sede.
- Cerrar exige fecha y evidencia de cierre.
- La historia no se elimina al cerrar.

### Certificados

- Pueden ser de establecimiento o vehículo.
- Un certificado de vehículo exige un Vehículo de la Sede atendida.
- La vigencia y plantilla del certificado de establecimiento se derivan del Cliente Negocio.
- La vigencia y plantilla de certificados vehiculares se derivan de la Sede.
- La fecha de vencimiento se calcula desde expedición y vigencia.
- Generación y envío son efectos reintentables.

### Pagos y efectivo

- Todos los montos son enteros en COP.
- Métodos iniciales: Transferencia y Efectivo.
- Un pago en efectivo confirmado identifica al Técnico que recauda.
- Los movimientos de efectivo son registrados por un Administrador.
- Venta, pago, recaudo y entrega de efectivo conservan identidades separadas.

### Informes y acceso público

- Los documentos se generan desde el histórico persistido.
- Regenerar no duplica el resultado ni rompe el enlace público.
- El token público es aleatorio, se almacena como hash, puede revocarse y vence un año después de finalizar.
- Un token inválido, vencido o revocado no revela datos internos.
- El acceso a archivos utiliza autorización o URL firmada.

### Offline

- La aplicación debe abrirse y autenticarse antes de quedar sin conexión.
- Borradores, fotografías, firmas y cambios pendientes se guardan localmente.
- Los reintentos no duplican registros ni efectos.
- El servidor revalida permisos, versión e integridad.
- Los conflictos sobre el mismo campo se conservan para resolución explícita.

### Retención

- Datos estructurados: conservación indefinida.
- Fotografías y firmas operativas: siete días después de validar el documento final.
- Informes y certificados PDF: un año.
- Archivos maestros: mientras estén activos.

## Exclusiones vigentes

- Multiempresa o cuentas para clientes.
- Inventario y control de stock.
- Migración automática de datos reales desde Spreadsheets.
- Dependencia de Docker o de una instancia PostgreSQL local como requisito de desarrollo.
- Acceso directo de la SPA a secretos de Google o privilegios de servicio.

## Cambios funcionales

Una issue que cambie estas reglas debe actualizar este documento o agregar un documento específico en `docs/product/` dentro del mismo PR. No se modifica una regla únicamente para simplificar el código.

### Operación manual de certificados

El flujo vigente de plantillas, pruebas, generación manual y correo está definido en [certificates.md](certificates.md). La plantilla particular es opcional: hereda la general del tipo. La generación automática al finalizar sigue fuera de alcance.

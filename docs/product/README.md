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
- diligencia la evaluación MIP por Áreas, puestos de monitoreo, hallazgos, evidencias y firmas, y consulta los Productos definidos por el Administrador;
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
| `areas` | Espacios de una Sede utilizados en evaluación MIP y monitoreo |
| `plantillas_areas` | Conjuntos reutilizables de Áreas globales o privadas |
| `servicios` | Programación, ejecución, pago, firmas, informe y publicación |
| Próximos por confirmar | Preagenda derivada de periodicidad para contacto y confirmación antes de crear un Servicio |
| `criterios_mip` | Catálogo administrable de criterios de inspección aplicables a Áreas |
| `servicio_areas` | Snapshot, recorrido y excepción de acceso de cada Área dentro del Servicio |
| `evaluaciones_mip_area` | Histórico de criterios evaluados por Servicio y Área, independiente del catálogo vivo |
| `productos` | Catálogo de productos utilizados |
| `productos_aplicados` | Planeación y aplicación de productos por Servicio |
| `configuracion` | Métodos, plagas y parámetros globales |
| `trampas` | Catálogo administrable de tipos de Dispositivo y su clasificación de monitoreo |
| `dispositivos` | Persistencia técnica de los Puestos de monitoreo por Sede y Área |
| `servicio_dispositivos` | Snapshot técnico de los Puestos de monitoreo al iniciar el Servicio |
| `servicio_tipos_dispositivo` | Tipos, clasificación y Plagas disponibles congelados para altas técnicas durante el Servicio |
| `revisiones_dispositivos` | Revisión histórica de los Puestos de monitoreo durante un Servicio |
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
- Un Cliente Negocio puede tener varias Sedes y su vigencia de certificado de establecimiento aplica a todas ellas.
- Un Cliente Casa conserva una única Sede residencial interna, invisible en la interfaz, sin Áreas, recorrido MIP completo, certificados ni vehículos.
- Áreas, Puestos de monitoreo y Vehículos pertenecen a una Sede.
- El nombre de Área es único dentro de su Sede.
- El número de Puesto de monitoreo y la placa de Vehículo son únicos de forma normalizada dentro de su Sede.
- Las plantillas de certificados son globales por tipo y se administran únicamente desde Configuración → Certificados.

### Servicios

- Estados: `PROGRAMADO`, `EN_PROCESO`, `FINALIZADO` y `CANCELADO`.
- Transiciones normales: `PROGRAMADO → EN_PROCESO → FINALIZADO`.
- Cada intento de sincronización con Calendar registra su resultado en la auditoría append-only.
- La cancelación solo parte de un estado no terminal, requiere Administrador y motivo.
- El Administrador crea el Servicio y el servidor genera el consecutivo.
- El responsable debe ser Técnico activo y cumplir vigencia de certificado cuando tenga uno registrado.
- Colaboradores activos, únicos y diferentes del responsable.
- Un Técnico solo accede a Servicios donde está asignado.
- Iniciar requiere conexión y solo se permite desde una hora antes de `inicio_programado`; preparar no equivale a iniciar.
- Un bloqueo persistente permite un solo celular editor durante todo `EN_PROCESO`; un Administrador puede liberarlo con auditoría.
- El valor del Servicio Principal se deriva de la Sede.
- Si la Sede maneja Refuerzo, al confirmar un Principal se crea máximo un Refuerzo asociado, gratuito y de la misma Sede.
- La fecha inicial del Refuerzo se propone 21 días después del Principal para conservar el mismo día de la semana y la misma hora; es un valor predeterminado editable, no una restricción permanente.
- Principal y Refuerzo pueden reprogramarse. Al reprogramar conjuntamente un Principal y su Refuerzo, los cambios internos se guardan de forma transaccional y ambas fechas permanecen editables.
- El Refuerzo no ejecuta la evaluación MIP por Áreas ni genera informe MIP completo.
- La periodicidad de la Sede genera seguimiento en Próximos por confirmar, no Servicios futuros automáticos en la Agenda.
- Un próximo por confirmar pasa a Servicio únicamente cuando el cliente confirma y el Administrador completa la acción Agendar.
- Una Sede residencial no exige evaluación MIP por Áreas ni informe completo.
- Finalizar exige tiempos reales, completitud técnica, sincronización de archivos obligatorios y las firmas del Técnico y del responsable del cliente en cada Servicio.
- El flujo completo de programación, Refuerzos y Próximos por confirmar está definido en [service-scheduling.md](service-scheduling.md).

### Ejecución MIP

- No existe un constructor ni un CRUD de formularios dinámicos para la operación MIP.
- La interfaz del Técnico tiene una estructura funcional fija y se compone con los datos del dominio: Servicio, Sede, Áreas, criterios, productos, puestos de monitoreo, plagas, hallazgos, evidencias y firmas.
- FO-PS-02 v03, FO-PS-10 y FO-PS-09 se conservan como referencias funcionales de los datos y del informe, no como plantillas editables almacenadas en un motor de formularios.
- Los criterios de inspección son un catálogo administrable. Cada criterio conserva identidad estable, nombre, estado y si aplica únicamente a Áreas externas/perimetrales; se presentan alfabéticamente y no administran orden propio.
- Los estados de evaluación `C`, `CP`, `NC` y `NA` son reglas fijas del sistema, no registros administrables.
- Un Área externa recibe los criterios generales más los criterios exclusivos de Áreas externas.
- Un Servicio Programado toma la configuración vigente al iniciar. Desde ese momento conserva snapshots suficientes para que cambios posteriores en catálogos no reinterpreten el histórico.
- La evaluación histórica debe conservar, como mínimo, la identidad del criterio, nombre y aplicabilidad observados al iniciar, evaluación, observación y referencias de evidencia cuando apliquen.
- El Técnico puede recorrer las Áreas en cualquier orden y volver a una anterior sin perder el borrador.
- Los puestos de monitoreo son entidades permanentes de Sede/Área; cada Servicio crea revisiones históricas y puede registrar nuevos puestos de monitoreo para visitas futuras.
- El flujo detallado y las reglas de composición están en [service-execution.md](service-execution.md).

### Productos

- V1 no implementa inventario ni consumo de stock.
- Los productos pueden desactivarse sin romper referencias históricas.
- Un Producto aplicado requiere lote, dosis y método de aplicación.
- El Administrador completa esos datos antes del inicio; el Técnico consulta los Productos destinados al Servicio en modo de solo lectura.
- La fecha de vencimiento no puede ser anterior a fabricación.
- Existe máximo una fila por Servicio y Producto.

### Monitoreo

- Catálogo inicial de plagas: Polilla, Mosca doméstica, Mosca de fruta, Zancudo, Cucarrones, Cucaracha, Roedor y Otros.
- Los tipos de dispositivo son administrables.
- Cada revisión conserva snapshots de número, ubicación y tipo.
- Capturas puede registrar varias plagas y cantidades.
- Una revisión exige fotografía únicamente cuando el estado cambia a `DANADO` o `FUERA_DE_USO`.

### Hallazgos

- Un Hallazgo pertenece a una Sede, Área y Servicio de apertura.
- Estados: `ABIERTO`, `EN_PROCESO` y `CERRADO`.
- El cierre pertenece a un Servicio posterior de la misma Sede.
- Cerrar exige fecha y evidencia de cierre.
- La historia no se elimina al cerrar.

### Certificados

- Pueden ser de establecimiento o vehículo.
- Un certificado de vehículo exige un Vehículo de la Sede atendida.
- La vigencia del certificado de establecimiento se deriva del Cliente Negocio; su plantilla es la global de establecimiento.
- La vigencia de certificados vehiculares se deriva de la Sede; su plantilla es la global de vehículo.
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
- Constructor genérico, versionado administrativo o CRUD de formularios MIP.

## Cambios funcionales

Una issue que cambie estas reglas debe actualizar este documento o agregar un documento específico en `docs/product/` dentro del mismo PR. No se modifica una regla únicamente para simplificar el código.

### Operación manual de certificados

El flujo vigente de plantillas, pruebas, generación manual y correo está definido en [certificates.md](certificates.md). Existe una única plantilla global por tipo; Clientes y Sedes solo definen la vigencia correspondiente. La generación automática al finalizar sigue fuera de alcance.

# Configuración → Catálogos MIP

Decisiones aprobadas con Santiago el 6 de octubre de 2026. Este documento especifica el modelo funcional de Productos, Trampas, Plagas y Criterios MIP y prevalece sobre las descripciones anteriores del catálogo genérico. La incorporación documental de Criterios no implementa todavía la ejecución del Servicio.

## Alcance

- Configuración es la entrada. Productos, Trampas, Plagas y Criterios son secciones hermanas; Métodos de aplicación es administración auxiliar de Productos.
- La portada de Configuración usa filas compactas agrupadas. Certificados e Integraciones conservan sus rutas reales. No se crean pantallas ficticias de Parámetros.
- `/catalogos` redirige a `/configuracion/catalogos`; no aparece como entrada principal del sidebar.
- Solo el rol activo Administrador administra los catálogos. No basta con tener el rol asignado si se está operando como Técnico.

## Productos

El maestro sigue PRODUCTOS A APLICAR: nombre comercial, principio activo/composición, dosis de aplicación (texto con su unidad), registro sanitario, grado toxicológico, laboratorio/fabricante, antídoto y ficha técnica opcional.

Nombre, principio activo, dosis, al menos un método y al menos una categoría o plaga son obligatorios. Lote y vencimiento no son atributos del catálogo: son los únicos datos del producto que el Administrador edita en cada Servicio. La dosis y todos los métodos asociados se consultan del catálogo durante la programación y se congelan al iniciar el Servicio; no se registran nuevamente por visita. La dosis del catálogo es referencia para la aplicación, no evidencia de la cantidad efectivamente utilizada. No hay inventario.

Cada producto admite múltiples métodos y una cobertura compuesta por categorías completas y/o plagas específicas. La cobertura de productos no usa directamente la clasificación de monitoreo. Sus categorías son INSECTOS_RASTREROS, INSECTOS_VOLADORES y ROEDORES. Esta separación refleja PRODUCTOS A APLICAR: varios productos combaten «INSECTOS RASTREROS Y VOLADORES», mientras RATUNET PALET/KLERT combaten «ROEDORES» y GELFIPRON GW especifica «CUCARACHAS Y HORMIGAS».

Seleccionar una categoría conserva una referencia simbólica a esa categoría de producto, no una copia de las plagas actuales. Las nuevas plagas que pertenezcan a esa categoría se incluyen en la cobertura futura. No se persisten relaciones específicas redundantes con una categoría completa seleccionada. Así, seleccionar INSECTOS_RASTREROS no incluye Roedor aunque Roedor se monitoree dentro de RASTREROS.

## Trampas y Plagas

Trampas mantienen nombre, exactamente una clasificación de monitoreo RASTREROS o VOLADORES y estado. Trampas iniciales: Trampa adhesiva / RASTREROS y Lámpara UV / VOLADORES. No se mezclan con productos químicos.

Cada Plaga tiene dos dimensiones distintas:
- clasificación de monitoreo: RASTREROS o VOLADORES;
- categoría para cobertura de productos: INSECTOS_RASTREROS, INSECTOS_VOLADORES o ROEDORES.

En la interfaz de administración de Plagas, estas dos dimensiones deben explicarse con lenguaje operativo:
- **Monitoreo con trampas**: “Define si esta plaga se monitorea con trampas para rastreros o para voladores.”
- **Categoría para productos** conserva un icono de ayuda con el texto: “Define qué tipo de producto se usa para controlar esta plaga. Los voladores se agrupan como insectos voladores; en rastreros se diferencian insectos rastreros y roedores.”
- La validación vacía de la segunda dimensión usa el mensaje breve “Selecciona la categoría de producto.”

La combinación válida es intencionalmente restringida: una plaga VOLADORES pertenece a INSECTOS_VOLADORES; una plaga RASTREROS pertenece a INSECTOS_RASTREROS o ROEDORES. Por ejemplo, Cucaracha = RASTREROS + INSECTOS_RASTREROS; Roedor = RASTREROS + ROEDORES; Mosca doméstica = VOLADORES + INSECTOS_VOLADORES. La trampa adhesiva puede seguir aplicando al grupo completo RASTREROS, incluido Roedor, porque esa relación pertenece al monitoreo y no a la cobertura química.

Otros rastreros y Otros voladores siguen siendo registros diferentes, no una tercera clasificación de monitoreo. Las claves internas son estables y no se editan. Desactivar impide nuevas selecciones, pero permite conservar referencias existentes al editar un producto. El servidor rechaza asignaciones nuevas a opciones inactivas. Una plaga con relaciones o historia no cambia de identidad semántica ni se elimina; puede desactivarse.

## Criterios MIP

Los criterios definen qué evalúa el Técnico dentro de cada Área durante un Servicio Principal. No son campos de un formulario genérico.

Cada criterio conserva únicamente:

- identidad UUID;
- nombre visible;
- estado activo/inactivo;
- indicador de si aplica únicamente a Áreas externas/perimetrales.

No se administran clave, orden ni versión para Criterios. El listado se presenta alfabéticamente y la edición administrativa no usa control de concurrencia optimista.

Los criterios generales aplican a cualquier Área. Los criterios marcados como exclusivos de exterior se agregan únicamente cuando `Area.es_externa = true`. La V1 no introduce un catálogo adicional de tipos de Área.

Los estados `C` (Cumple), `CP` (Cumple parcialmente), `NC` (No cumple) y `NA` (No aplica) son valores fijos del sistema y no se administran desde Catálogos. El cálculo también permanece fijo: `CP` equivale a la mitad de `C`, `NC` vale cero y `NA` se excluye del denominador.

Los criterios iniciales derivados de FO-PS-02 son:

- Instalación de barreras físicas.
- Disposición adecuada de residuos sólidos y líquidos.
- Mantenimiento higiénico.
- Mantenimiento locativo interno y externo.
- Mantenimiento de zonas verdes, exclusivo de Áreas externas/perimetrales.

Desactivar o renombrar un criterio solo afecta Servicios que todavía no hayan iniciado. Al iniciar un Servicio se conserva un snapshot suficiente de los criterios aplicables para que el histórico y los informes no cambien al modificar posteriormente el catálogo.

La migración `20261006_012_mip_criteria.sql` crea `criterios_mip` como catálogo independiente, sin reutilizar el motor de formularios eliminado por la migración 011. `database/bootstrap/003_mip_criteria.sql` carga los cinco criterios iniciales aprobados de forma idempotente.

## Persistencia e historial

La migración 009 reutiliza `configuracion` para métodos y plagas porque Servicios y revisiones ya referencian sus claves. Añade la clasificación de monitoreo, timestamps/version, `trampas` y las relaciones `producto_metodos`, `producto_categorias_plaga` y `producto_plagas`. La migración 010, creada después de detectar la diferencia en PRODUCTOS A APLICAR, añade `configuracion.categoria_producto` y cambia `producto_categorias_plaga` para almacenar INSECTOS_RASTREROS / INSECTOS_VOLADORES / ROEDORES sin modificar la migración 009 ya aplicada. No crea un catálogo paralelo de métodos/plagas ni migra los puestos físicos.

Los listados incluyen el snapshot ligero editable. Crear/Editar comparte exactamente el mismo modal y formulario. Editar nunca consulta por ID cuando ya dispone del snapshot. El backend devuelve la entidad definitiva; la UI hace upsert y mueve entre Activos/Inactivos sin recargar la colección. El caché es de memoria, con caducidad de cinco minutos e invalidación por sesión/rol. Una lectura en vuelo se concilia por registro: conserva cambios y eliminaciones posteriores sin perder el resto de la respuesta. Un cambio en otro catálogo no descarta las opciones. La respuesta de opciones también alimenta los listados de Métodos/Plagas, evitando descargarlos de nuevo mientras sean vigentes. Los catálogos que usan versión conservan el borrador ante conflicto; Criterios no tiene versión ni flujo de conflicto.

Los productos, métodos y plagas referenciados no se borran. Las eliminaciones seguras solo retiran maestros sin uso y sus propias asociaciones, nunca servicios. La auditoría es append-only.

## Archivos

La ficha técnica usa el flujo autorizado existente de R2 (`PRODUCT_TECHNICAL_SHEET`), compresión y las fases reales Comprimiendo/Subiendo/Guardando. El archivo anterior no se quita antes de confirmar el nuevo registro. La protección de limpieza incluye fichas referenciadas. No se escribe base64 ni credenciales en la SPA.

`BaseFileUpload` mantiene sus valores predeterminados para módulos existentes y ofrece una variante compacta de 72 px, icono de documento y texto de acción independiente del label. Productos la utiliza para no repetir «Ficha técnica» ni presentar una cámara como acción principal de documento.

## Datos previos y preparación

No importar productos/dosis del Excel automáticamente. `database/bootstrap/002_mip_catalogs.sql` incluye solo catálogos de referencia aprobados y es idempotente, sin reactivar ni sobrescribir cambios del administrador.

Los nombres duplicados previos deben resolverse antes de aplicar índices únicos: la migración falla en vez de fusionarlos silenciosamente. La dosis anterior no se inventa a partir de la unidad. El registro PLAGA/OTROS u otras claves sin clasificación inequívoca se conserva sin reclasificación automática. Puede completarse explícitamente si no tiene referencias protegidas; si tiene historia, requiere una decisión de migración supervisada, nunca reinterpretar capturas silenciosamente. Las restricciones NOT VALID permiten la transición sin admitir registros nuevos incompletos. Al retirar los datos de prueba se deben validar en una migración posterior tanto `configuracion_plaga_clasificacion_check` como `configuracion_plaga_categoria_producto_check`.

La migración 010 asigna únicamente equivalencias conocidas: Cucaracha/Hormiga/Otros rastreros → INSECTOS_RASTREROS; Roedor → ROEDORES; las plagas voladoras conocidas → INSECTOS_VOLADORES. Las coberturas existentes RASTREROS/VOLADORES de productos se convierten en INSECTOS_RASTREROS/INSECTOS_VOLADORES; no se añade ROEDORES de forma implícita porque esa era precisamente la ambigüedad corregida.

La migración 010 ya está aplicada en Neon `desarrollo`. Para Criterios, aplicar la migración 012 y ejecutar el bootstrap 003 en la rama autorizada. Los tests SQL de Actions usan exclusivamente PostgreSQL efímero en CI y no aplican cambios a Neon. Verificar aparte subida, visualización, reemplazo y limpieza de una ficha en R2 real. Un PR con tests aprobados no sustituye estas comprobaciones de infraestructura.

## Fuera de esta entrega

Quedan para la implementación del primer Servicio: snapshots de evaluación por Área, puestos permanentes por Sede/Área, composición con trampas/productos, revisiones y operación técnica. La futura revisión conserva las plagas y criterios aplicables al iniciar el Servicio; no se reinterpretan contra catálogos vivos.

## Referencia visual y pruebas

Figma `AWHeFImzH9BHPjEydCKJZT`: Productos 9:14 / 9:15; formulario 20:1164 / 177:16416; Configuración 13:931 / 13:2264. Reutilizar los tokens y el estilo compacto del `develop` actual. Formularios reales, no variables internas del prototipo.

La suite `e2e/mip-catalogs.spec.ts` utiliza datos sintéticos y simula únicamente la frontera HTTP. Comprueba formularios reales, categorías y plagas, edición sin GET redundante, activos/inactivos, conflictos, métodos auxiliares, rol, reintento y responsive. Sus capturas quedan en el artefacto `mip-catalogs-qa`. Las pruebas de API y SQL se ejecutan por separado; no presentar estos E2E como una prueba de conexión a Neon/R2 real.

## Formatos de ficha técnica

BaseFileUpload permite documentos PDF e imágenes JPG, PNG o WebP. Se agrega el tipo MIME explícito application/pdf para ofrecer el selector de documentos de Android, conservando la validación y compresión de archivos existente. No hay nuevas entidades ni duplicación de documentos.

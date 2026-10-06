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

Los Servicios de Refuerzo y los Servicios residenciales conservan sus reglas simplificadas y no ejecutan este recorrido MIP completo.

## Criterios MIP

Los criterios son un catálogo administrable independiente.

Cada criterio requiere conceptualmente:

- identidad estable;
- nombre visible;
- orden;
- estado activo/inactivo;
- indicador de si aplica únicamente a Áreas externas/perimetrales.

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
- orden observado;
- condición de aplicabilidad relevante;
- evaluación `C/CP/NC/NA`;
- observación cuando exista;
- referencias a evidencia cuando correspondan.

Renombrar, reordenar, desactivar o crear criterios después de iniciado un Servicio no modifica ese Servicio ni sus informes.

La representación física puede resolverse con filas o JSONB durante la implementación. La regla funcional es que el histórico sea autosuficiente y no requiera reconstruir una versión de formulario.

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

El Técnico puede crear un nuevo Dispositivo desde el Área durante la ejecución cuando corresponda. El nuevo registro queda disponible como punto permanente para Servicios posteriores.

Las Plagas disponibles para una revisión se derivan de la clasificación de monitoreo del tipo de Dispositivo:

- RASTREROS;
- VOLADORES.

La lista aplicable debe quedar congelada o representada de forma históricamente estable al iniciar/revisar el Servicio para que cambios futuros del catálogo no reinterpreten capturas anteriores.

## Productos aplicados

Productos no forman parte de la evaluación de un Área.

El Administrador prepara los Productos previstos para el Servicio y el Técnico trabaja con ese conjunto. La aplicación real conserva los datos variables del Servicio, incluidos lote, fabricación, vencimiento, dosis y método de aplicación según las reglas vigentes de Producto.

## Hallazgos

Los Hallazgos pertenecen al Servicio, Sede y Área correspondientes.

Desde el Área el Técnico puede registrar descripción, recomendación/acción correctiva, evidencia y demás datos definidos por el dominio. Los Hallazgos anteriores pendientes deben seguir disponibles para verificación y eventual cierre según las reglas ya aprobadas.

## Firmas y finalización

La firma del Técnico y la firma del responsable del cliente pertenecen al Servicio, no a un formulario.

La finalización debe validar los datos técnicos obligatorios del Servicio y las firmas aplicables. El detalle exacto de validaciones de completitud se definirá al implementar el primer Servicio para no introducir requisitos no aprobados por adelantado.

## Offline y autosave

El recorrido debe respetar las reglas generales de operación offline:

- autosave durante el diligenciamiento;
- persistencia local de cambios pendientes;
- navegación entre Áreas sin perder datos;
- sincronización idempotente;
- conservación de fotografías y firmas pendientes;
- resolución explícita de conflictos sobre el mismo dato.

La unidad de trabajo offline debe seguir entidades reales del dominio, no una definición de formulario.

## Transición desde el baseline actual

El esquema actual todavía contiene elementos creados para el enfoque anterior:

- `formularios`;
- `respuestas_formulario`;
- `sedes.formularios_aplicables_json`;
- `servicios.formularios_versiones_json`.

Quedan declarados como transitorios. No deben utilizarse como base de nuevas funcionalidades.

Cuando se implemente el primer Servicio se diseñará una migración nueva para sustituir o retirar estas estructuras y crear únicamente los datos que requiera la ejecución definida aquí. Las migraciones aplicadas permanecen inmutables.

## Pendiente para la siguiente etapa

Este cambio es documental. Antes de escribir código del primer Servicio se debe revisar el estado real de base de datos, API y frontend y definir el cambio mínimo para soportar:

- catálogo de Criterios MIP;
- snapshot/evaluación por Servicio y Área;
- recorrido móvil por Áreas;
- revisiones de Dispositivos;
- Productos aplicados;
- Hallazgos y evidencias;
- firmas y finalización.

No se implementa nada de esa lista como parte de esta decisión documental.

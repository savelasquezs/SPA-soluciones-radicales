# Datos operativos que deben alimentar el informe MIP

Documento de trabajo para definir qué información debe poder producir el informe del cliente a partir de la ejecución técnica. Se actualiza junto con `technician-mip-execution.md`.

El informe no debe depender de texto armado manualmente cuando la información pueda derivarse de registros estructurados.

## 1. Identificación del Servicio

Debe poder incluir:

- Cliente/Negocio.
- Sede.
- Dirección.
- Fecha del Servicio.
- Solicitud/consecutivo.
- Técnico responsable.
- Técnicos colaboradores cuando corresponda.
- Productos principales aplicados globalmente y productos adicionales de Puestos de monitoreo, diferenciando su origen.
- Firmas.
- Plano cuando aplique.

### 1.1 Productos principales y adicionales

Aclaración aprobada durante la revisión del prototipo del 6 de octubre de 2026:

**Productos principales.** El Administrador los selecciona al agendar el Servicio y registra para cada uno el lote y la fecha de vencimiento. Esos datos se conservan en el contexto histórico del Servicio, no en el catálogo maestro. La vista técnica los muestra preparados y distingue producto previsto de aplicación efectivamente registrada.

**Productos adicionales de Puestos.** El Técnico puede elegir productos del catálogo activo al instalar o cambiar un producto de un Puesto, aunque no estén en la selección principal. El informe debe incluirlos con Área, número de Puesto, producto, observaciones, evidencias, consumo observado y operaciones realizadas cuando correspondan.

La fuente del informe debe contemplar ambos orígenes: no consultar únicamente la selección administrativa. Si un mismo producto participa como principal y en uno o varios Puestos, se puede agrupar visualmente, pero deben conservarse los usos y las referencias de cada origen, sin duplicar aplicaciones ni perder el detalle por Puesto.

No convertir el consumo observado de un cebo anterior en una aplicación nueva de hoy. Diferenciar producto encontrado, producto revisado y producto dejado después de una instalación/cambio.

Decisión confirmada con Santiago: los productos adicionales de los Puestos no requieren lote ni fecha de vencimiento y el flujo técnico no solicita esos campos. El informe los incluye sin exigir ni inventar esos datos, conservando producto, Área/Puesto, consumo cuando aplique, observaciones, evidencias y cambios. No mostrar su ausencia como dato pendiente o error ni bloquear la generación del informe. Nunca heredar lote o vencimiento de otra aplicación por compartir el mismo producto maestro. Para los productos principales se mantienen los datos preparados por Administración.

## 2. Resultado por Área

Por cada Área del Servicio debe quedar disponible:

- nombre del Área;
- si fue Evaluada o No evaluada;
- criterios C/CP/NC/N/A y resultado de cumplimiento cuando aplique;
- comentario general del Técnico;
- hasta 5 fotografías generales;
- Hallazgos relacionados;
- Puestos de monitoreo revisados o justificados.

La acción técnica “Marcar todo C” genera respuestas normales por criterio. El informe usa los valores finales, incluidas correcciones o Deshacer posteriores; no deduce que el Área está completamente revisada ni cierra Hallazgos a partir del uso del atajo.

### Área no evaluada

Debe imprimirse/representarse expresamente:

- Área;
- estado “No evaluada”;
- motivo/descripción;
- fotografía de evidencia.

Ejemplo conceptual:

> Bodega de materias primas — No evaluada. No fue posible ingresar porque el área permaneció cerrada durante la visita. Evidencia fotográfica adjunta.

No debe presentarse como incumplimiento ni simular respuestas NC.

## 3. Puestos de monitoreo

Para cada Puesto debe poder reconstruirse el estado encontrado durante la visita mediante snapshots históricos.

Datos relevantes:

- número del Puesto;
- Área;
- ubicación al momento de la revisión;
- Trampa encontrada, si existía;
- Producto encontrado, si existía;
- condición observada de la Trampa;
- capturas por Plaga;
- porcentaje de Producto consumido;
- observaciones;
- evidencias;
- si no pudo revisarse, razón y foto;
- cambios efectuados después de la revisión.

## 4. Capturas de Plagas

Las capturas corresponden al intervalo desde la visita anterior; no son acumuladas.

Para Lámparas UV el adhesivo se renueva después de cada revisión, por lo que la siguiente visita comienza conceptualmente en cero.

El informe debe poder expresar tanto valores cero como positivos.

Ejemplo conceptual:

> PM-04 · Lámpara UV · Producción  
> Polilla: 2 · Mosca doméstica: 5 · Mosca de fruta: 0 · Zancudo: 1 · Cucarrones: 0 · Otros voladores: 0.

Las Plagas mostradas provienen del snapshot de la categoría de la Trampa aplicable al Servicio.

## 5. “Otros” rastreros/voladores

Cuando “Otros rastreros” u “Otros voladores” sea mayor que cero, el informe debe disponer de:

- cantidad;
- descripción obligatoria;
- fotografía opcional.

Ejemplo:

> Otros voladores: 2. El Técnico reporta insectos pequeños no identificados alrededor de la luminaria.

## 6. Estado físico de la Trampa

Debe poder indicar, al menos:

- Operativa;
- Dañada.

Cuando esté Dañada se pueden adjuntar una o varias fotografías y observación.

Ejemplo:

> PM-07 · Trampa adhesiva — Dañada. Cubierta deteriorada y adhesivo expuesto. Fotografías adjuntas.

## 7. Producto instalado en un Puesto

Cuando exista Producto en el Puesto:

- producto;
- porcentaje de consumo;
- observación;
- evidencia cuando corresponda.

Ejemplo:

> PM-12 · Brodifacoum — consumo observado 50%.

El consumo del Puesto no debe confundirse con la aplicación global de Producto realizada durante el Servicio. Los productos añadidos por el Técnico también deben figurar en el informe, aunque no fueran seleccionados al agendar.

## 8. Puesto no revisado

Debe poder aparecer explícitamente:

- Puesto;
- Área;
- “No revisado”;
- motivo/descripción;
- fotografía obligatoria.

Ejemplo:

> PM-09 · Patio — No revisado. El acceso quedó bloqueado por material almacenado. Evidencia adjunta.

No debe convertirse en una revisión con capturas cero.

## 9. Instalación de Puestos nuevos

Cuando se cree un Puesto durante el Servicio debe poder informarse:

- número;
- Área;
- ubicación;
- Trampa nueva, Producto nuevo o ambos;
- observación/motivo cuando corresponda.

No se genera una revisión de capturas artificial en el mismo Servicio de instalación.

Ejemplo:

> Se instala PM-18 en Bodega, ubicación junto a acceso occidental, con Trampa adhesiva para Rastreros.

## 10. Cambios realizados después de la revisión

El informe debe diferenciar claramente entre lo encontrado y la configuración dejada para la próxima visita.

Puede registrar:

- cambio de Trampa;
- retiro de Trampa;
- instalación de Trampa;
- cambio de Producto;
- retiro de Producto;
- instalación de Producto;
- traslado del Puesto.

Todo cambio/retiro lleva motivo.

Ejemplo:

> PM-04 fue revisado con Lámpara UV. Después de la revisión se reemplaza por Trampa adhesiva. Motivo: cambio de estrategia de monitoreo.

## 11. Traslado de Puestos

Debe conservar:

- Área/ubicación encontrada y revisada;
- nueva Área/ubicación;
- motivo del traslado.

Ejemplo:

> PM-05 revisado en Producción / acceso norte. Se traslada a Empaque / costado occidental para la próxima visita.

## 12. Comentarios y fotografías generales del Área

El informe debe poder incluir:

- comentario general del Área;
- hasta 5 fotografías generales.

Estas fotografías no limitan las evidencias de Hallazgos, Trampas dañadas, falta de acceso u otros registros específicos.

Ejemplo:

> Producción: se observa mejora general en limpieza; persiste acumulación puntual de material junto al acceso posterior.

## 13. Hallazgos

Cada Hallazgo mantiene su propia estructura e historial.

El informe debe poder incluir:

- Área;
- descripción;
- recomendación/acción correctiva;
- estado;
- responsable;
- evidencia fotográfica;
- seguimiento cuando corresponda.

El comentario general del Área no reemplaza un Hallazgo.

## 14. Datos útiles para gráficas e históricos

El almacenamiento debe permitir reconstruir por fecha:

- cumplimiento por Área/Sede;
- Áreas no evaluadas;
- capturas por Plaga;
- capturas por Puesto;
- evolución por tipo de Trampa;
- consumo de Producto por Puesto;
- Trampas dañadas;
- Puestos no revisados;
- cambios de configuración;
- instalaciones/retiros;
- Hallazgos.

No usar acumulados manuales como fuente de verdad si pueden derivarse de revisiones históricas.

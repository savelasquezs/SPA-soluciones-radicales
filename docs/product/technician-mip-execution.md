# Ejecución técnica MIP por Áreas y Puestos de monitoreo

Decisiones funcionales aprobadas con Santiago el 6 de octubre de 2026. Este documento define el comportamiento esperado del futuro módulo móvil del Técnico y prevalece sobre referencias anteriores a “Dispositivos” cuando describan esta operación.

No implementa todavía el módulo ni modifica el esquema. Su propósito es fijar dominio, UX y datos históricos antes del diseño final y del desarrollo.

## 1. Modelo mental de la operación

La ejecución técnica se organiza así:

```text
Servicio Principal
  └─ Áreas de la Sede
      ├─ Evaluación locativa del Área
      ├─ Puestos de monitoreo del Área
      │   └─ Revisión del puesto en la visita
      ├─ Hallazgos
      ├─ Comentario general del Área
      └─ Fotografías generales del Área
```

El Técnico trabaja recorriendo físicamente las Áreas y puede moverse libremente entre ellas. La UI no debe obligarlo a completar un wizard lineal.

El formulario principal FO-PS-02 sigue siendo la base documental de condiciones locativas, pero en la interfaz móvil la unidad operativa visible es el Área, no el archivo/formato Excel.

## 2. Terminología

### Trampa

Es un maestro administrable de Catálogos MIP.

Ejemplos iniciales:

- Trampa adhesiva → RASTREROS.
- Lámpara UV → VOLADORES.

Cada Trampa tiene exactamente una clasificación: `RASTREROS` o `VOLADORES`.

La clasificación de la Trampa determina qué Plagas se muestran dinámicamente para conteo durante una revisión.

### Plaga

Es un maestro administrable y pertenece exactamente a una clasificación `RASTREROS` o `VOLADORES`.

Las categorías son dinámicas como conjunto: si en el futuro se crea “Luciérnaga” como VOLADORES, las revisiones futuras de Trampas VOLADORES deberán incluirla automáticamente.

“Otros rastreros” y “Otros voladores” son Plagas diferentes.

### Producto

Es el producto químico del catálogo MIP. Su definición permanece separada de Trampas.

### Puesto de monitoreo

Es un punto físico permanente y numerado dentro de una Sede y un Área.

Un Puesto puede tener, como máximo:

- una Trampa;
- un Producto;
- ambos;
- nunca más de una Trampa ni más de un Producto simultáneamente.

La existencia del Puesto es independiente de las revisiones de cada visita.

### Revisión de puesto

Es el registro histórico realizado durante un Servicio Principal sobre un Puesto ya existente.

Cada Servicio genera como máximo una revisión aplicable por Puesto. Las revisiones anteriores no se reemplazan.

## 3. Capturas y renovación de Trampas

Las capturas registradas corresponden únicamente al período transcurrido desde la revisión anterior.

En las Lámparas UV los adhesivos se renuevan en cada revisión. Después de registrar la revisión se considera que el adhesivo nuevo queda en cero para el siguiente período.

Por lo tanto:

- las capturas no se acumulan entre visitas;
- el histórico conserva el conteo independiente de cada revisión;
- las gráficas pueden sumar o comparar revisiones, pero el valor capturado en cada visita representa únicamente ese intervalo.

“Cambiar Trampa” no significa reemplazar el adhesivo consumible de una Lámpara UV. Significa modificar el tipo de Trampa instalado en el Puesto, por ejemplo pasar de Lámpara UV a Trampa adhesiva.

## 4. Revisión de una Trampa

Cuando un Puesto tenga una Trampa, antes de cambiarla, retirarla o mover el Puesto debe registrarse la revisión de lo que estaba instalado al llegar.

La revisión muestra automáticamente todas las Plagas activas de la clasificación de la Trampa según el snapshot aplicable al Servicio.

Ejemplo para una Lámpara UV / VOLADORES:

- Polilla: cantidad.
- Mosca doméstica: cantidad.
- Mosca de fruta: cantidad.
- Zancudo: cantidad.
- Cucarrones: cantidad.
- Otros voladores: cantidad.

Los conteos aceptan cero.

Si “Otros rastreros” u “Otros voladores” tiene una cantidad mayor que cero:

- comentario descriptivo obligatorio;
- fotografía opcional.

La revisión debe guardar suficiente snapshot de Trampa, clasificación y Plagas para que cambios futuros del catálogo no reinterpreten históricos.

## 5. Condición de la Trampa

La condición observada de una Trampa es distinta al estado de vigencia del Puesto.

Por defecto una Trampa se considera:

- Operativa.

También puede registrarse, como mínimo:

- Dañada.

Si está Dañada:

- se permite adjuntar una o varias fotografías;
- las fotografías quedan asociadas a esa revisión;
- debe conservarse una observación cuando sea necesaria para explicar el daño.

La UI no debe utilizar “Retirado” como condición física de la Trampa. Retirar corresponde a una modificación de la configuración del Puesto.

## 6. Producto en un Puesto

Un Puesto puede tener un Producto aunque no tenga Trampa.

Para el Producto instalado en el Puesto se registra el porcentaje de consumo observado.

La entrada móvil debe ofrecer valores rápidos:

- 0%;
- 25%;
- 50%;
- 75%;
- 100%;

y permitir un porcentaje exacto cuando sea necesario.

El porcentaje pertenece a la revisión del Puesto y no al catálogo maestro del Producto.

Si el Puesto tiene solo Producto y no Trampa:

- no se muestran conteos de Plagas;
- se registra consumo, observaciones y evidencia cuando corresponda.

Si tiene Trampa + Producto:

- la Trampa determina los conteos dinámicos de Plagas;
- el Producto aporta su registro de consumo;
- ambos forman parte de la misma revisión del Puesto.

Esto es independiente de la sección global de Productos aplicados al Servicio. Un Producto aplicado por aspersión/punteo y un Producto instalado en un Puesto son hechos operativos diferentes aunque referencien el mismo maestro.

### 6.1 Productos principales preparados por Administración

Aclaración aprobada durante la revisión del prototipo:

- Al agendar el Servicio, el Administrador selecciona los productos principales y registra el lote y la fecha de vencimiento de cada uno.
- Lote y vencimiento pertenecen al registro del producto en ese Servicio, no al catálogo maestro, porque varían entre aplicaciones y lotes.
- La ejecución técnica muestra esos productos con lote y vencimiento ya preparados; el Técnico no vuelve a seleccionar los principales ni a diligenciar esos dos datos.
- En la vista del Técnico, producto principal, lote y vencimiento se presentan como información de consulta. Una corrección de la preparación corresponde a Administración.
- Esto no convierte automáticamente un producto previsto en aplicado. Se conserva el registro de la aplicación real y los demás datos operativos que correspondan, sin deducir consumo ni cantidades desde el catálogo.
- El futuro desarrollo de Agenda/Programación debe incluir estos datos por producto; no basta con incluir un selector de nombres de producto.

### 6.2 Productos adicionales elegidos en Puestos

El Técnico sí puede seleccionar productos adicionales del catálogo activo dentro de un Puesto de monitoreo, aunque no estén entre los productos principales preparados por Administración.

La restricción de preselección de los productos principales NO se aplica al selector de productos de los Puestos. Este permiso es contextual al Servicio y Puesto asignados; no concede administración del catálogo.

Los productos adicionales se conservan relacionados con Servicio, Área, Puesto, revisión o instalación/cambio, según corresponda, y se incluyen en el informe del cliente. El resumen técnico distingue “Principales · Administración” de “Adicionales de puestos”.

El informe no se puede construir consultando únicamente la lista de productos principales. Debe recoger ambos orígenes y conservar su trazabilidad sin duplicar artificialmente aplicaciones ni confundir producto encontrado, consumo observado y producto dejado después de la intervención.

Decisión confirmada con Santiago: los productos adicionales de los Puestos no requieren lote ni fecha de vencimiento. El flujo técnico no solicita esos campos al instalar, cambiar o revisar el producto de un Puesto. Su ausencia no impide guardar, completar la revisión, finalizar el Servicio ni incluir el producto adicional en el informe. No copiar ni inferir esos valores desde el catálogo o desde un producto principal. Se conservan producto, consumo cuando aplique, observaciones y evidencias según las reglas de la operación. Esta excepción no cambia la preparación de lote y vencimiento de los productos principales por Administración.

## 7. Crear un Puesto durante una visita

El Técnico puede crear un Puesto nuevo mientras ejecuta un Servicio.

Debe indicar al menos:

- número;
- Área;
- ubicación;
- Trampa, Producto o ambos.

Un Puesto nuevo normalmente queda instalado con Trampa nueva/vacía o Producto recién dispuesto.

No se crea una revisión artificial con valores en cero en el mismo Servicio de creación.

Su primera revisión corresponde al siguiente Servicio Principal en el que el Puesto ya exista al inicio de la visita.

El informe del Servicio en que se creó sí debe poder indicar la instalación del nuevo Puesto y su configuración inicial.

## 8. Cambiar o retirar Trampa/Producto

El Técnico puede modificar la configuración física de un Puesto.

Puede:

- cambiar la Trampa por otra;
- retirar la Trampa;
- cambiar el Producto;
- retirar el Producto;
- instalar uno de ellos cuando antes no existía.

Regla de orden:

1. registrar la revisión de la configuración encontrada al llegar;
2. completar capturas/consumo y evidencia aplicable;
3. registrar la modificación;
4. la nueva configuración queda vigente para la siguiente visita.

Todo cambio o retiro exige motivo obligatorio.

Ejemplo: “Se retira la Trampa por ausencia sostenida de actividad”.

El informe debe distinguir claramente:

- lo encontrado/revisado;
- el cambio realizado al finalizar la revisión.

## 9. Mover un Puesto

El Técnico puede trasladar un Puesto a otra Área o cambiar su ubicación física.

La revisión actual se registra contra el Área y ubicación donde estaba al llegar.

Después se registra el movimiento:

- nueva Área;
- nueva ubicación;
- motivo.

La nueva ubicación queda vigente para la siguiente visita.

El histórico conserva el snapshot del Área/ubicación anterior.

## 10. Puesto no revisado por imposibilidad de acceso

Aunque el Área haya sido evaluada, un Puesto individual puede quedar sin revisión cuando físicamente no sea posible acceder a él.

En ese caso:

- motivo obligatorio;
- descripción obligatoria;
- fotografía obligatoria;
- el resto del Área puede continuar normalmente;
- el Puesto queda explícitamente identificado como no revisado, no como revisado con ceros.

## 11. Evaluación del Área

Cada Área del Servicio debe terminar en uno de dos resultados:

### Área evaluada

Debe completar todos los criterios aplicables del FO-PS-02 usando:

- C = Cumple.
- CP = Cumple parcialmente.
- NC = No cumple.
- N/A = No aplica.

Además debe resolver todos los Puestos que debían revisarse:

- revisados normalmente; o
- justificados como no accesibles según la regla anterior.

El Área puede contener Hallazgos, comentario general y fotografías.

### Área no evaluada

Puede ocurrir que el Técnico no tenga acceso a un Área durante una visita.

No debe simularse la evaluación ni marcarse todo como NC.

Debe registrarse:

- estado “No evaluada”;
- razón/descripción obligatoria;
- al menos una fotografía obligatoria.

El informe debe indicar expresamente que el Área no se evaluó y mostrar la razón y evidencia.

La regla de cálculo de cumplimiento deberá definir al implementar cómo excluir un Área no evaluada sin convertirla en incumplimiento. No se debe asumir silenciosamente que equivale a NC.

### 11.1 Marcado rápido “Marcar todo C”

La inspección de un Área incluye un botón compacto “Marcar todo C” que marca como Cumple todos los criterios aplicables de esa Área. La estructura proviene de la versión de formulario del Servicio, no de una lista fija de cuatro criterios.

Comportamiento diseñado:

- Si solo hay respuestas vacías o C, se aplica directamente.
- Si existen respuestas CP, NC o N/A, se pide confirmación antes de reemplazarlas. Cancelar conserva exactamente las respuestas anteriores.
- Después del marcado se ofrece Deshacer para restaurar el estado inmediatamente anterior. La edición individual posterior sigue disponible y termina esa oportunidad de deshacer en bloque, para no eliminar una modificación posterior.
- Se actualizan progreso de criterios y cálculo de cumplimiento mediante las mismas reglas que una respuesta individual; se conserva autosave online/offline y validación del servidor.
- No se modifican Puestos, capturas, consumo, comentarios, fotografías ni Hallazgos; tampoco se cierran Hallazgos abiertos.
- No se marca automáticamente el Área como completa si aún tiene Puestos o evidencias pendientes.
- Un Área declarada No evaluada no dispone de este atajo hasta volver explícitamente a su evaluación. Nunca sustituye la justificación de falta de acceso.
- Los criterios excluidos por configuración, incluidos los exclusivos de exterior en un Área interior, no se muestran ni se modifican.

La confirmación y Deshacer son salvaguardas del diseño para evitar sobrescribir respuestas accidentalmente; no alteran la escala C/CP/NC/N/A.

## 12. Comentarios y fotografías por Área

Cada Área evaluada permite:

- un comentario general de la revisión;
- hasta 5 fotografías generales del Área.

Estas 5 fotografías son independientes de evidencias específicas.

No consumen ese límite las fotografías asociadas a:

- Hallazgos;
- Trampas dañadas;
- Puestos no accesibles;
- Área no evaluada;
- otras evidencias obligatorias de registros específicos.

El Técnico debe poder:

- tomar una fotografía directamente con la cámara;
- seleccionar/subir una fotografía existente.

Las fotografías deben seguir el flujo compartido de optimización, persistencia local/offline y subida autorizada definido por el proyecto.

## 13. Hallazgos

Los Hallazgos siguen siendo registros propios relacionados con Servicio, Sede y Área.

No deben sustituirse por el comentario general del Área.

Un Área puede tener:

- comentario general;
- hasta 5 fotos generales;
- cero o varios Hallazgos;
- cada Hallazgo con sus propias evidencias.

## 14. Cuándo se considera completa un Área

Un Área evaluada se considera completa cuando:

- todos sus criterios aplicables están respondidos;
- todos los Puestos que debían revisarse tienen revisión completa o justificación válida de no acceso;
- todas las evidencias obligatorias están presentes.

Un Área marcada “No evaluada” se considera resuelta para permitir continuar el Servicio únicamente cuando tenga:

- razón/descripción;
- fotografía obligatoria.

“Resuelta” no significa “evaluada”; el informe y los indicadores deben conservar esa diferencia.

## 15. Navegación móvil esperada

La operación debe priorizar:

```text
Servicio
  → Áreas
      → Área
          → Condiciones locativas
          → Puestos de monitoreo
              → Revisión
          → Hallazgos
          → Comentario y fotos
  → Productos aplicados
  → Firmas / revisión final
```

El Técnico puede cambiar de Área en cualquier momento.

No debe existir una obligación UX de terminar un Área antes de abrir otra.

La pantalla general del Servicio puede mostrar progreso agregado, por ejemplo:

- Áreas resueltas / total.
- Puestos revisados / esperados.
- Evidencias pendientes.
- Productos aplicados.
- Firmas pendientes.

## 16. Autosave, offline y evidencias

Todo dato operativo debe preservar el comportamiento offline ya aprobado:

- autosave durante el diligenciamiento;
- persistencia local;
- fotografías pendientes conservadas localmente;
- sincronización posterior;
- reintentos idempotentes;
- estado visible “Sincronizado / Guardado en este dispositivo / Pendiente de sincronizar”.

Las fotografías se cargan a medida que se producen cuando sea seguro; no se acumulan todas detrás de “Finalizar Servicio”.

## 17. Impacto esperado sobre el dominio existente

El repo todavía utiliza terminología y tablas históricas `dispositivos` / `revisiones_dispositivos`.

La implementación futura debe revisar este modelo para representar explícitamente:

- Puesto de monitoreo permanente;
- referencia opcional a una Trampa;
- referencia opcional a un Producto;
- revisión por Servicio;
- capturas dinámicas por Plaga;
- porcentaje de consumo;
- condición de la Trampa;
- múltiples evidencias;
- cambios/retiros/movimientos posteriores a la revisión;
- excepción de Puesto no accesible;
- evaluación/no evaluación del Área;
- comentario y fotografías generales del Área.

No modificar la migración de Catálogos MIP para absorber esta lógica. El módulo operativo debe introducir su propia migración posterior.

## 18. Relación con Catálogos MIP

Esta especificación asume las decisiones de `docs/product/mip-catalogs.md`:

- Trampas separadas de Productos;
- Trampas clasificadas RASTREROS/VOLADORES;
- Plagas clasificadas RASTREROS/VOLADORES;
- categorías completas dinámicas;
- Productos con cobertura por categorías/plagas.

La edición de un catálogo nunca modifica la interpretación de una revisión histórica.

## 19. Criterios mínimos para el diseño en Figma

El diseño debe contemplar al menos:

- lista/progreso de Áreas;
- Área evaluada;
- Área no evaluada;
- detalle del Área con comentario y fotos;
- lista de Puestos;
- Puesto con Trampa;
- Puesto con Producto;
- Puesto con Trampa + Producto;
- revisión de capturas dinámicas;
- consumo porcentual;
- Trampa operativa;
- Trampa dañada con evidencias;
- Puesto no accesible;
- creación de Puesto;
- cambio/retiro de Trampa;
- cambio/retiro de Producto;
- movimiento de Puesto;
- “Otros” con comentario obligatorio;
- estados de guardado/offline;
- resumen de pendientes antes de finalizar;
- productos principales con lote/vencimiento preparados por Administración y de consulta para el Técnico;
- productos adicionales del catálogo seleccionables dentro del Puesto e incluidos en el informe, sin solicitar lote ni vencimiento;
- Marcar todo C por Área, confirmación de reemplazo y Deshacer.

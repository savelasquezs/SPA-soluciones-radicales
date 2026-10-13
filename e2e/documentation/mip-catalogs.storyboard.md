# Storyboard y especificación — Gestión de productos V4

**Módulo:** Configuración → Catálogos MIP → Productos  
**Título de portada:** Gestión de productos  
**Subtítulo:** Crear, consultar y administrar el catálogo MIP  
**Duración objetivo:** 2:15–2:45  
**Formato:** 1920 × 1080, 30 fps  
**Estado:** especificación lista para implementación y revisión.

---

## 1. Resultado de aprendizaje

Al terminar el video, el usuario podrá crear un producto, consultar su detalle y su ficha técnica, reconocer las acciones disponibles y localizar un producto desactivado.

---

## 2. Alcance

### Incluye

- acceso a Productos desde Configuración;
- búsqueda y pestañas Activos/Inactivos;
- creación de un producto;
- campos obligatorios y complementarios;
- categorías completas y plagas individuales;
- varios métodos de aplicación;
- carga de ficha técnica;
- confirmación del producto creado;
- apertura del detalle;
- visualización de la ficha técnica;
- identificación de Editar, Desactivar y Eliminar;
- desactivación y consulta en Inactivos.

### No incluye

- edición completa del producto;
- eliminación efectiva;
- reactivación;
- administración de Métodos de aplicación;
- tratamiento de errores;
- conflictos de versión;
- conexión real con Neon o R2.

Estos temas se documentan por escrito o en otro video cuando formen un flujo suficientemente amplio.

---

## 3. Datos de demostración

```text
Nombre comercial: Producto demostración
Principio activo / composición: Cipermetrina 40%
Dosis de aplicación: 10 ml / L
Registro sanitario: RGSP-DEMO-001
Grado toxicológico: III
Laboratorio / fabricante: Laboratorio de demostración
Antídoto: Según ficha de seguridad

Cobertura:
- Categoría completa: Insectos rastreros
- Plaga individual: Mosca doméstica

Métodos:
- Aspersión
- Termonebulización

Ficha técnica:
- ficha-tecnica-demo.pdf
```

La ficha debe mostrar un contenido ficticio y claramente legible durante la demostración.

---

## 4. Portada

### Diseño

- fondo plano `#0B0F14`;
- sin gradientes radiales ni desenfoques;
- logo completo en alta resolución;
- acento lineal azul `#0877B9` y verde `#5B8F18`;
- título centrado;
- entrada por opacidad y desplazamiento vertical de 8 px;
- duración aproximada de 3.5 segundos.

### Contenido

```text
SOLUCIONES RADICALES
MANUAL DE USUARIO

Gestión de productos
Crear, consultar y administrar el catálogo MIP
```

---

## 5. Guion técnico por escenas

El texto de la columna **Narración y subtítulo** debe utilizarse literalmente para ambos.

| # | ID | Estado y acción en pantalla | Narración y subtítulo literal | Resultado visible |
|---:|---|---|---|---|
| 1 | `intro` | Portada moderna, estática y nítida. | En esta guía aprenderás a gestionar los productos del catálogo MIP. | El título permanece visible hasta terminar la frase. |
| 2 | `open-catalogs` | Mostrar Configuración. Mover el cursor y abrir **Catálogos MIP** al decir “abre”. | Desde Configuración, abre Catálogos MIP. La sección Productos aparece seleccionada. | Listado de Productos visible. |
| 3 | `catalog-overview` | Recorrer visualmente buscador y pestañas sin cambiar de estado. | Aquí puedes buscar productos y alternar entre los registros activos e inactivos. | Buscador, Activos e Inactivos visibles. |
| 4 | `new-product` | Clic en **Nuevo producto**. | Para registrar un producto, selecciona Nuevo producto. | Modal abierto. |
| 5 | `required-fields` | Mantener el modal sin escribir; resaltar discretamente los asteriscos. | Los campos marcados con asterisco son obligatorios. | Formulario completo visible. |
| 6 | `product-identity` | Escribir nombre y principio activo. | Ingresa el nombre comercial y el principio activo o la composición. | Ambos campos completos. |
| 7 | `product-dose` | Escribir dosis. | Registra la dosis con su unidad de aplicación. | Dosis completa. |
| 8 | `optional-details` | Escribir registro sanitario, grado toxicológico y fabricante a ritmo legible. | También puedes guardar el registro sanitario, el grado toxicológico y el fabricante. | Tres campos completos. |
| 9 | `antidote` | Escribir el antídoto. | En Antídoto, registra la indicación definida en la ficha de seguridad. | Campo Antídoto completo. |
| 10 | `coverage-open` | Clic en **Plagas que controla**. | Abre Plagas que controla para definir la cobertura del producto. | Selector abierto. |
| 11 | `coverage-category` | Seleccionar **Todos los insectos rastreros** durante la frase. | Puedes seleccionar una categoría completa, como Insectos rastreros. | Categoría marcada; selector sigue abierto. |
| 12 | `coverage-included` | Señalar “Incluida por categoría”; no cerrar el selector. | Las plagas de esa categoría quedan incluidas automáticamente. | Inclusión automática visible. |
| 13 | `coverage-individual` | Seleccionar **Mosca doméstica** al pronunciar su nombre. | También puedes añadir una plaga individual de otra categoría, como Mosca doméstica. | Mosca doméstica marcada; selector sigue abierto. |
| 14 | `coverage-done` | Clic en **Listo** cerca del final de la frase. | Cuando la selección esté lista, presiona Listo. | Selector cerrado y resumen visible. |
| 15 | `methods-open` | Abrir **Métodos de aplicación**; mantener abierto. | En Métodos de aplicación, selecciona una o varias opciones. | Opciones visibles. |
| 16 | `methods-example` | Seleccionar **Aspersión** y **Termonebulización** mientras se nombran. Cerrar después de terminar el audio. | En este ejemplo agregaremos Aspersión y Termonebulización. | Ambos métodos visibles en el campo. |
| 17 | `technical-sheet-intro` | Enfocar el área de ficha sin hacer clic. | La ficha técnica es opcional y admite archivos PDF o imágenes. | Área de carga visible. |
| 18 | `technical-sheet-attach` | Clic en **Adjuntar archivo** y cargar el archivo de demostración. | Selecciona Adjuntar archivo y verifica que el nombre aparezca en el formulario. | `ficha-tecnica-demo.pdf` visible. |
| 19 | `save-product` | Clic en **Crear producto** al nombrar el control. | Revisa la información y selecciona Crear producto. | Estado de carga visible. |
| 20 | `saving-product` | Mantener el modal y sus estados de progreso; no cerrarlo antes de terminar la frase. | Espera hasta que finalicen la carga y el guardado. | Progreso comprensible y estable. |
| 21 | `created-product` | Cerrar automáticamente y señalar la nueva fila y el toast. | Al finalizar, el producto aparece en la lista de activos. | Producto demostración visible en Activos. |
| 22 | `open-detail` | Clic en el nombre del producto. | Selecciona su nombre para consultar el detalle. | Diálogo de detalle abierto. |
| 23 | `product-detail` | Recorrer dosis, métodos, cobertura y campos complementarios. | Aquí encontrarás la dosis, los métodos, la cobertura y los demás datos registrados. | Detalle completo visible. |
| 24 | `open-technical-sheet` | Clic en **Ver ficha técnica**. Mostrar la vista documental de la nueva pestaña. | Selecciona Ver ficha técnica para abrir el archivo guardado en una nueva pestaña. | Ficha ficticia visible y legible. |
| 25 | `row-actions` | Volver al catálogo. Señalar, en orden, Editar, Desactivar y Eliminar con etiquetas localizadas. | Regresa al catálogo. En la fila encontrarás las acciones Editar, Desactivar y Eliminar. | Los tres controles identificados. |
| 26 | `deactivate-product` | Clic en **Desactivar Producto demostración**. | Usa Desactivar para impedir nuevas selecciones sin perder el historial del producto. | Diálogo de confirmación visible. |
| 27 | `confirm-deactivation` | Clic en **Desactivar**. | Confirma la desactivación. | Producto retirado de Activos y toast visible. |
| 28 | `inactive-product` | Clic en **Inactivos** y esperar la carga. | El registro sale de Activos y queda disponible en la pestaña Inactivos. | Producto demostración visible en Inactivos. |
| 29 | `outro` | Cierre con logo nítido y transición corta. | Con esto puedes crear, consultar y administrar los productos del catálogo MIP. | Logo hasta terminar el audio y salida musical. |

---

## 6. Reglas de sincronización específicas

1. El selector **Plagas que controla** permanece abierto desde `coverage-open` hasta el clic final de `coverage-done`.
2. No se pulsa **Listo** durante `coverage-individual`.
3. El selector de métodos permanece abierto mientras se nombran Aspersión y Termonebulización.
4. El archivo aparece en pantalla antes de terminar `technical-sheet-attach`.
5. El modal no se cierra antes de terminar `saving-product`.
6. El detalle permanece abierto durante todo `product-detail`.
7. La ficha técnica debe ser visible durante al menos 2.5 segundos.
8. El diálogo de confirmación permanece visible hasta comenzar `confirm-deactivation`.
9. La pestaña Inactivos se abre dentro de `inactive-product`, no antes.
10. Cada subtítulo se lee directamente desde `segment.text`.

---

## 7. Cambios técnicos necesarios

### `e2e/documentation/mip-catalogs.narration.json`

- reemplazar el alcance anterior;
- usar el título **Gestión de productos**;
- adoptar los 29 segmentos de esta especificación;
- no crear una propiedad independiente para el subtítulo de cada segmento.

### `e2e/documentation/mip-catalogs.docs.spec.ts`

1. Eliminar el objeto `CAPTIONS`.
2. Usar `segmentText(id)` al mostrar subtítulos.
3. Actualizar el test a “video: gestionar productos en Catálogos MIP”.
4. Actualizar el mock de listado para respetar `?active=true|false`.
5. Añadir el mock de lectura de ficha técnica.
6. Añadir el mock de `PATCH /api/mip/products/:id/state`.
7. Añadir las escenas de detalle, ficha, acciones, desactivación e Inactivos.
8. Mantener datos deterministas.
9. Crear una vista documental controlada para representar la nueva pestaña.
10. Añadir pausas después de toasts y cambios de pestaña.
11. Sustituir la portada actual por una composición plana.
12. Usar el logo completo; no ampliar `favicon.png`.

### `playwright.docs.config.ts`

```ts
video: {
  mode: 'on',
  size: { width: 1920, height: 1080 },
},
viewport: { width: 1920, height: 1080 },
```

El proyecto Chromium debe usar la misma resolución.

### `scripts/documentation/render-video.mjs`

Cambiar:

```text
Salida: mip-gestion-productos-v4.mp4
Preset: medium
CRF: 18 o 19
Audio AAC: 192k
```

Mantener `yuv420p`, 30 fps y `faststart`.

### `.github/workflows/documentation-video.yml`

Cambiar el artefacto a:

```text
documentation-video-mip-gestion-productos-v4
```

Debe publicar:

- MP4 final;
- segmentos de audio;
- `timings.json`;
- `timeline.json`;
- video bruto de Playwright.

---

## 8. Requisitos de la vista de ficha técnica

La ficha de demostración debe mostrar, como mínimo:

```text
FICHA TÉCNICA
Producto demostración
Principio activo: Cipermetrina 40%
Registro sanitario: RGSP-DEMO-001
Fabricante: Laboratorio de demostración
```

La vista debe incluir una indicación discreta:

```text
Archivo abierto en una nueva pestaña
```

No se modifica el comportamiento real de producción. La adaptación existe únicamente dentro del entorno documental para mantener una grabación continua.

---

## 9. Pruebas automáticas recomendadas

Antes de renderizar, validar:

- todos los IDs de narración existen en el timeline;
- ningún ID se repite;
- no faltan archivos de audio;
- los subtítulos se obtienen del texto de narración;
- el audio de cada segmento termina antes de pasar al siguiente estado;
- la duración final está entre 2:15 y 2:45;
- la resolución del MP4 es 1920 × 1080;
- el archivo tiene video H.264 y audio AAC.

---

## 10. Lista de aprobación específica

### Flujo

- [ ] Se llega a Productos desde Configuración.
- [ ] Se crea el producto con todos los datos previstos.
- [ ] El selector de plagas permanece abierto durante la explicación.
- [ ] Se selecciona una categoría y una plaga individual.
- [ ] Se seleccionan dos métodos.
- [ ] Se adjunta la ficha.
- [ ] El producto aparece en Activos.
- [ ] El nombre abre el detalle.
- [ ] Ver ficha técnica muestra el archivo.
- [ ] Se identifican Editar, Desactivar y Eliminar.
- [ ] Se confirma la desactivación.
- [ ] El producto aparece en Inactivos.

### Calidad

- [ ] Voz y subtítulos coinciden palabra por palabra.
- [ ] No hay acciones adelantadas respecto al audio.
- [ ] La portada no presenta bandas ni pixelación.
- [ ] El logo es nítido.
- [ ] El texto es legible a pantalla completa.
- [ ] La música no compite con la voz.
- [ ] No hay datos reales.
- [ ] No hay silencios o esperas innecesarias.
- [ ] La salida es 1080p real.

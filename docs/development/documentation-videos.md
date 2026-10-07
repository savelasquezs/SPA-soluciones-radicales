# Estándar para videos del manual de usuario

Este documento define el proceso oficial para producir tutoriales de Soluciones Radicales MIP. El video de referencia es **Gestión de productos** y debe utilizarse como patrón para los siguientes módulos.

El objetivo no es grabar cada botón por separado. Cada video debe enseñar una **unidad funcional completa**: el flujo principal, la consulta del resultado y las acciones de administración relacionadas.

## Principios obligatorios

1. **Un video por funcionalidad completa.** Un CRUD puede incluir creación, detalle, edición, cambio de estado y eliminación, siempre que el resultado siga siendo claro y breve.
2. **Una sola fuente para audio y subtítulos.** El texto de `*.narration.json` alimenta Google Text-to-Speech y se muestra literalmente como subtítulo. No se mantiene un resumen alternativo.
3. **Coherencia temporal exacta.** La interfaz que se menciona debe estar visible durante toda la explicación correspondiente.
4. **Demostración realista y determinista.** Los datos se simulan desde Playwright, pero el flujo debe utilizar la interfaz real y sus validaciones reales.
5. **Diseño sobrio y actual.** Se utilizan activos nítidos, composición limpia, tipografía Inter y la identidad visual del producto. No se usan fondos rasterizados, texturas envejecidas ni imágenes ampliadas por encima de su resolución.
6. **Acciones destructivas seguras.** Cuando el objetivo es explicar una acción sin perder el registro de demostración, se muestra la confirmación y se cancela. Solo se confirma cuando forma parte del flujo que se quiere enseñar, como la desactivación.
7. **El video complementa el manual escrito.** El video presenta el flujo conjunto; Mintlify puede enlazarlo desde varias guías específicas como crear, editar o desactivar un producto.

## Arquitectura de archivos

```text
e2e/documentation/
├── video-harness.ts                 # Comportamiento audiovisual reutilizable
├── mip-catalogs.docs.spec.ts        # Flujo automatizado del video de referencia
└── mip-catalogs.narration.json      # Guion canónico: audio y subtítulos

scripts/documentation/
├── synthesize-tts.mjs               # Genera un WAV por segmento
└── render-video.mjs                 # Mezcla grabación, voz y música

docs/development/
├── documentation-videos.md          # Estándar general
└── product-management-video-storyboard.md

.github/workflows/
└── documentation-video.yml          # Ejecución manual en GitHub Actions
```

`video-harness.ts` concentra portada, cierre, cursor, efecto de clic, resaltado, zoom, subtítulos, temporización y escritura de `timeline.json`. Los videos siguientes deben reutilizarlo; no deben copiar estos recursos dentro de cada prueba.

## Contrato de sincronización

Cada segmento debe cumplir tres estados:

| Momento | Regla |
|---|---|
| Antes del audio | La pantalla ya permite reconocer el contexto que se va a explicar. |
| Durante el audio | La acción ocurre cuando la narración la menciona y el control relevante permanece visible. |
| Al terminar | La pantalla muestra el resultado de la acción y no adelanta una escena que todavía no se ha explicado. |

Reglas concretas:

- No cerrar un selector mientras el audio todavía describe sus opciones.
- No hablar de un modal, pestaña, archivo o resultado que aún no se ve.
- No mantener en pantalla un subtítulo distinto de las palabras pronunciadas.
- Un segmento debe expresar una sola idea principal.
- Las pausas se colocan en la prueba Playwright; nunca se agregan silencios manuales al texto.
- Las acciones obvias pueden ejecutarse de inmediato. Las decisiones importantes deben permanecer visibles al menos entre 500 y 900 ms antes de continuar.
- El último estado de una escena debe ser el primer estado lógico de la siguiente.

La función `narrate(id, action)` aplica el texto exacto del segmento como subtítulo, registra su inicio en la línea de tiempo y garantiza que la escena dure como mínimo lo que dura el audio sintetizado.

## Guion canónico

El archivo de narración utiliza esta estructura:

```json
{
  "title": "Gestión de productos",
  "subtitle": "Crear, consultar y administrar productos MIP",
  "segments": [
    {
      "id": "open-catalogs",
      "text": "En Configuración, abre Catálogos MIP y entra en Productos."
    }
  ]
}
```

### Reglas editoriales

- Voz directa, profesional y en segunda persona implícita.
- Frases breves, naturales y sin tecnicismos innecesarios.
- Nombrar los controles exactamente como aparecen en la interfaz.
- Evitar expresiones dependientes del tiempo, como “ahora mismo” o “en la versión nueva”.
- Evitar narrar movimientos del cursor que no aportan conocimiento.
- No prometer comportamientos que no estén implementados y verificados.
- Mantener cada segmento, cuando sea posible, por debajo de 24 palabras. Si una explicación contiene dos decisiones distintas, dividirla.

## Diseño visual

### Formato

- Resolución: `1280 × 720`.
- Relación: `16:9`.
- Fotogramas: `30 fps`.
- Video final: H.264, `yuv420p`, `faststart`.
- Audio final: AAC a `160 kb/s`.
- Duración recomendada por CRUD: entre 2 y 4 minutos.

### Portada y cierre

- Fondo sólido oscuro `#07131d`.
- Logo horizontal desde `public/logo-light.png`.
- Azul de marca `#0877B9` y verde `#5B8F18` solo como acentos.
- Sin fotografías de fondo, degradados difusos, texturas ni ampliación del favicon.
- Título orientado a la funcionalidad, no a una sola operación. Ejemplo: **Gestión de productos**, no **Cómo crear un producto**.
- Subtítulo que delimite el alcance. Ejemplo: **Crear, consultar y administrar productos MIP**.

### Grabación de interfaz

- Cursor visible y suficientemente contrastado.
- Efecto breve de clic en las acciones importantes.
- Zoom local discreto, entre `1.03` y `1.05`; nunca ocultar contexto esencial.
- Subtítulos centrados en la zona segura inferior, con fondo oscuro semitransparente.
- No tapar botones o mensajes que se estén explicando.
- Utilizar datos de demostración coherentes en todo el flujo.
- La interfaz se graba en su estado real; no se recrean formularios o tablas fuera de la aplicación.

## Estructura recomendada para un CRUD

1. Portada y alcance.
2. Acceso al módulo.
3. Vista general del listado, búsqueda y estados.
4. Creación del registro.
5. Explicación de campos o selectores que requieran criterio.
6. Guardado y comprobación del resultado.
7. Consulta del detalle.
8. Apertura de documentos o recursos asociados.
9. Edición de un dato visible y comprobación del cambio.
10. Explicación de eliminación, mostrando la confirmación cuando corresponda.
11. Cambio de estado y comprobación en la pestaña opuesta.
12. Cierre breve.

No todos los módulos necesitan las doce escenas, pero el video debe concluir con el resultado comprobado, no inmediatamente después de pulsar Guardar.

## Video de referencia: Gestión de productos

El alcance aprobado incluye:

- abrir Catálogos MIP;
- distinguir activos e inactivos;
- crear un producto con campos obligatorios y opcionales;
- combinar una categoría completa con una plaga individual;
- seleccionar varios métodos de aplicación;
- adjuntar una ficha técnica;
- abrir el detalle del producto;
- visualizar la ficha técnica guardada;
- editar la dosis de aplicación;
- mostrar la confirmación de eliminación y cancelarla;
- desactivar el producto;
- verificarlo en Inactivos y mostrar la opción de reactivación.

El storyboard verificable está en [`product-management-video-storyboard.md`](product-management-video-storyboard.md).

## Procedimiento para crear el siguiente video

1. Definir el alcance funcional completo y eliminar escenas redundantes.
2. Crear el storyboard con estado inicial, acción y estado final de cada segmento.
3. Crear el archivo `*.narration.json`.
4. Implementar el escenario Playwright reutilizando `video-harness.ts`.
5. Preparar mocks deterministas para autenticación, API y archivos.
6. Generar el audio y medir la duración real de cada segmento.
7. Grabar la interfaz con la misma narración cargada.
8. Renderizar el MP4 final.
9. Revisar el video completo a velocidad normal y con audio.
10. Publicar únicamente después de aprobar la lista de control.

## Lista de control de calidad

### Contenido

- [ ] El título representa todo el alcance del video.
- [ ] El video enseña un flujo completo y termina con una comprobación visible.
- [ ] Los nombres de campos, botones y pestañas coinciden con la interfaz.
- [ ] No se explican comportamientos inexistentes o pendientes.
- [ ] Los datos de demostración son consistentes.

### Audio y subtítulos

- [ ] Cada subtítulo coincide palabra por palabra con el audio.
- [ ] La voz no empieza antes de que exista contexto visual.
- [ ] Ningún selector o diálogo se cierra antes de terminar su explicación.
- [ ] No hay silencios largos, frases cortadas ni dos audios superpuestos.
- [ ] La música queda claramente por debajo de la voz.

### Imagen

- [ ] Logo y texto se ven nítidos a pantalla completa.
- [ ] La portada no contiene pixelación, banding ni elementos envejecidos.
- [ ] El cursor no tapa el dato principal.
- [ ] Los zooms son sutiles y vuelven al tamaño normal.
- [ ] Los subtítulos no cubren botones, toasts o confirmaciones relevantes.
- [ ] El archivo asociado se abre y se entiende dentro de la demostración.

### Comportamiento

- [ ] La prueba es repetible sin depender de datos reales.
- [ ] Crear, consultar, editar y cambiar estado dejan un resultado visible.
- [ ] La eliminación no destruye el registro usado por las escenas posteriores.
- [ ] La pestaña de inactivos muestra el registro desactivado.
- [ ] La ejecución termina sin solicitudes mock no preparadas.

### Entrega

- [ ] El MP4 tiene video H.264 y audio AAC.
- [ ] El archivo reproduce correctamente desde el inicio hasta el cierre.
- [ ] La duración está dentro del rango previsto.
- [ ] El storyboard y este estándar están actualizados.
- [ ] El artefacto de GitHub Actions conserva grabación, audio y línea de tiempo para auditoría.

## Comandos locales

```bash
npm run docs:tts
npm run docs:record
npm run docs:render
```

Orden obligatorio:

1. `docs:tts` genera los WAV y `docs-media/audio/timings.json`.
2. `docs:record` graba la interfaz y genera `docs-media/timeline.json`.
3. `docs:render` mezcla la grabación, la voz y la música.

Los archivos dentro de `docs-media/` son generados y no se versionan.

## Ejecución en GitHub Actions

El workflow `.github/workflows/documentation-video.yml` es manual para evitar consumo innecesario de Text-to-Speech y minutos de Actions.

La voz predeterminada es:

```text
es-US-Chirp3-HD-Kore
```

Puede reemplazarse desde el input del workflow o mediante la variable de repositorio `GOOGLE_TTS_VOICE`.

### Autenticación de Google Cloud

No guardar claves JSON de cuentas de servicio en el repositorio. El workflow utiliza Workload Identity Federation.

Variables requeridas:

```text
GCP_PROJECT_ID
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_SERVICE_ACCOUNT
```

Variable opcional:

```text
GOOGLE_TTS_VOICE
```

El job solicita únicamente `contents: read` e `id-token: write`.

### Configuración inicial de Google Cloud

Ejecutar una sola vez desde Cloud Shell o una terminal autenticada con `gcloud`:

```bash
PROJECT_ID="TU_PROJECT_ID"
REPO="savelasquezs/SPA-soluciones-radicales"
SA_NAME="github-docs-tts"
POOL_ID="github"
PROVIDER_ID="spa-soluciones-radicales"

gcloud config set project "$PROJECT_ID"

gcloud services enable \
  texttospeech.googleapis.com \
  iamcredentials.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SERVICE_ACCOUNT="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub documentation TTS"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/serviceusage.serviceUsageConsumer"

gcloud iam workload-identity-pools create "$POOL_ID" \
  --location="global" \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --display-name="SPA Soluciones Radicales" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'"

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}"

PROVIDER_NAME="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --format="value(name)")"

printf 'GCP_PROJECT_ID=%s\n' "$PROJECT_ID"
printf 'GCP_WORKLOAD_IDENTITY_PROVIDER=%s\n' "$PROVIDER_NAME"
printf 'GCP_SERVICE_ACCOUNT=%s\n' "$SERVICE_ACCOUNT"
```

## Salidas actuales

Artefacto de Actions:

```text
documentation-video-gestion-productos
```

MP4 final:

```text
docs-media/final/catalogos-mip-gestion-productos.mp4
```

El artefacto también conserva los segmentos de voz, `timings.json`, `timeline.json` y la grabación original de Playwright para diagnosticar cualquier desincronización.

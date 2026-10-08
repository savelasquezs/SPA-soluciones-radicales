# Videos del manual de usuario

Este repositorio genera tutoriales de usuario a partir de flujos Playwright y produce un MP4 final con navegación automatizada, cursor visible, subtítulos, narración, música ambiental, portada y cierre.

La referencia editorial obligatoria es [Estándar de producción de videos del manual de usuario](user-manual-video-standard.md). El video piloto se documenta en [`e2e/documentation/mip-catalogs.storyboard.md`](../../e2e/documentation/mip-catalogs.storyboard.md).

## Arquitectura del proceso

Cada video conserva tres fuentes versionadas:

```text
e2e/documentation/<slug>.storyboard.md
e2e/documentation/<slug>.narration.json
e2e/documentation/<slug>.docs.spec.ts
```

La narración JSON es la única fuente de verdad para voz y subtítulos. El test registra en `timeline.json` el inicio exacto de cada segmento y el sintetizador guarda en `timings.json` su duración real.

La generación y la publicación son procesos separados. La referencia de publicación es [Publicación aprobada de videos del manual](documentation-video-publication.md).

El proceso de generación es:

```text
storyboard
  → narración JSON
  → Google Cloud Text-to-Speech
  → grabación Playwright
  → mezcla y codificación FFmpeg
  → validación técnica del MP4
```

## Comandos

```bash
npm run docs:tts
npm run docs:record
npm run docs:render
```

Orden obligatorio:

1. `docs:tts` sintetiza la narración y genera `docs-media/audio/timings.json`.
2. `docs:record` usa esas duraciones para mantener cada estado visual durante el audio correspondiente y genera `docs-media/timeline.json`.
3. `docs:render` mezcla voz y música, codifica el MP4 y valida resolución, códecs, duración e integridad del timeline.

La ejecución normal se realiza con el workflow manual `.github/workflows/documentation-video.yml`.

## Contrato de sincronización

- El subtítulo se muestra con `segmentText(id)`, exactamente igual al texto enviado a TTS.
- No se mantiene un mapa paralelo de subtítulos resumidos.
- Cada segmento representa una sola idea visual.
- Un menú, selector o diálogo permanece abierto mientras se habla de su contenido.
- La interfaz no avanza al siguiente estado antes de terminar la narración.
- Cualquier cambio de texto obliga a regenerar TTS, grabación y render.

## Voz

La voz predeterminada es:

```text
es-US-Chirp3-HD-Kore
```

Puede reemplazarse desde el input del workflow o mediante la variable de repositorio `GOOGLE_TTS_VOICE`.

## Autenticación de Google Cloud

No guardar claves JSON de cuentas de servicio en el repositorio. El workflow usa Workload Identity Federation de GitHub Actions hacia Google Cloud.

Variables de repositorio requeridas:

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

## Configuración inicial de Google Cloud

Ejecutar una sola vez desde Cloud Shell o una terminal autenticada con `gcloud`.

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

Los tres últimos valores se copian a las variables de Actions del repositorio.

## Video piloto: Gestión de productos V4

El flujo cubre:

```text
Configuración
→ Catálogos MIP
→ crear producto
→ seleccionar cobertura y métodos
→ adjuntar ficha técnica
→ consultar detalle y archivo
→ reconocer acciones
→ desactivar
→ localizar en Inactivos
```

Salida final:

```text
docs-media/final/mip-gestion-productos-v4.mp4
```

Artefacto de GitHub Actions:

```text
documentation-video-mip-gestion-productos-v4
```

El artefacto incluye:

- MP4 final;
- segmentos de audio;
- `timings.json`;
- `timeline.json`;
- video bruto y resultados de Playwright.

Los archivos dentro de `docs-media/` son generados y no se versionan.

El artefacto generado se revisa antes de cualquier publicación. Solo después de una aprobación explícita se publica el MP4 en Cloudflare R2 y se actualiza Mintlify.

## Validación obligatoria

Antes de aprobar un video:

- revisar el MP4 completo a velocidad normal;
- revisar cambios de escena a 0.5×;
- verificar que audio y subtítulos coinciden palabra por palabra;
- confirmar que cada control explicado permanece visible;
- comprobar la portada y el logo a pantalla completa;
- revisar el video sin audio para validar los subtítulos;
- confirmar salida 1920 × 1080, H.264 y AAC;
- conservar el storyboard actualizado junto con el test.

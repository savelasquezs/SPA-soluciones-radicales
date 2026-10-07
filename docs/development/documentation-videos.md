# Videos del manual de usuario

El repositorio puede generar tutoriales en video a partir de flujos Playwright y producir un MP4 final con:

- navegación automatizada;
- cursor visible y efecto de clic;
- zoom suave en acciones importantes;
- subtítulos sincronizados con la narración;
- voz femenina Google Cloud Text-to-Speech Chirp 3 HD;
- música ambiental original generada localmente;
- portada de entrada;
- cierre con transición al logo.

## Comandos

```bash
npm run docs:tts
npm run docs:record
npm run docs:render
```

La ejecución normal se realiza con el workflow `.github/workflows/documentation-video.yml`.

## Voz

La voz por defecto es:

```text
es-US-Chirp3-HD-Kore
```

Es una voz femenina Chirp 3 HD. Puede reemplazarse desde el input del workflow o mediante la variable de repositorio `GOOGLE_TTS_VOICE`.

## Autenticación de Google Cloud

No guardar claves JSON de cuentas de servicio en el repositorio. El workflow está preparado para Workload Identity Federation de GitHub Actions hacia Google Cloud.

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

Los tres últimos valores son los que deben copiarse a las variables de Actions del repositorio.

## Salidas

El workflow publica un artefacto llamado:

```text
documentation-video-mip-catalogs-v2
```

El archivo final es:

```text
docs-media/final/mip-catalogos-crear-producto-v2.mp4
```

Los archivos de trabajo dentro de `docs-media/` se consideran generados y no se versionan.

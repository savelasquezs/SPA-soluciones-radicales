# Runbook: despliegue de Neon Functions (API)

**Fuente de verdad operativa para desplegar la Function api de Soluciones Radicales MIP.** Leer antes de cada despliegue de backend. El frontend Cloudflare y las migraciones PostgreSQL son operaciones independientes.

**Última comprobación real:** 2026-10-10, despliegue Neon **#46** sobre la rama **desarrollo**, después del merge Git **ee76cb1**. El método directo con el conector Neon funcionó incluso cuando el CLI y una transferencia anterior del ZIP fallaron.

## 1. Identidades del entorno (verificar, no asumir)

| Recurso | Desarrollo |
| --- | --- |
| Git | rama **develop**; trabajar con su HEAD actualizado |
| Neon project_id | **patient-pine-80293508** |
| Neon branch | **desarrollo** |
| Neon branch_id | **br-nameless-violet-b7y48a5v** |
| Function slug | **api** |
| Runtime | **nodejs24** |
| Entrada del código | **functions/api/index.ts** |
| Health | https://br-nameless-violet-b7y48a5v-api.compute.c-13.us-east-1.aws.neon.tech/health |

**No desplegar sobre la rama Neon production ni fusionar main sin autorización específica.** El checkout Git no cambia la rama Neon por sí mismo. Si el HEAD de develop cambió mientras se preparaba el paquete, reconstruirlo.

## 2. Reglas obligatorias para evitar incidentes

1. Inspeccionar la versión actual con Neon get_function / CLI functions get y anotar su deployment activo.
2. Publicar **solo código de la Function api**, salvo que haya autorización para reconciliar toda la infraestructura. No aplicar migraciones ni triggers con este procedimiento.
3. En un despliegue puntual, **omitir el campo environment**: Neon hereda todas las variables existentes del deployment anterior. No extraer, imprimir, alterar ni reemplazar secretos.
4. No usar valores vacíos como sustituto de ALLOWED_ORIGINS, GOOGLE_CLIENT_SECRET, credenciales R2 o variables ausentes.
5. No afirmar éxito solo porque el upload respondió pending: comprobar **current_deployment y active_deployment**, ambos con el nuevo id y estado **completed**, y luego ejecutar GET /health.
6. No commitear ZIP, Base64, secretos ni credenciales en Git; usar únicamente artefactos temporales ignorados. No reutilizar un ZIP de otro commit.
7. No mantener Neon despierto con polling o heartbeats. Conservar la suspensión automática y el plan actual.

## 3. Camino A: CLI autenticado (más sencillo)

Desde la raíz del repositorio y con una sesión Neon CLI ya autorizada:

~~~bash
git fetch origin
git switch develop
git pull --ff-only origin develop
git rev-parse HEAD

npx -y neon@6.2.4 checkout desarrollo --no-env-pull
npx -y neon@6.2.4 functions get api

# Actualiza solo el código de api; no reenvía las variables privadas.
npx -y neon@6.2.4 functions deploy api --src functions/api/index.ts

npx -y neon@6.2.4 functions get api
~~~

Si el checkout local no está vinculado todavía:

~~~bash
npx -y neon@6.2.4 link --project-id patient-pine-80293508 --branch desarrollo -y --no-env-pull
~~~

Si la versión instalada de CLI no acepta una bandera o no hay sesión autenticada, **no forzar un despliegue completo ni modificar secretos**; utilizar el Camino B.

### Por qué no ejecutar ciegamente neon deploy

El despliegue completo evalúa **neon.ts**, que declara Auth, Data API, triggers y variables **process.env** de Google, R2 y CORS. Si estas variables no están definidas localmente, falla con **Invalid Neon config**; si se cargan vacías, podrían reemplazar secretos válidos. Solo ejecutar un deploy completo con archivo --env cuando se verificaron **todas** las variables requeridas y se desea aplicar también la configuración de infraestructura. Para actualizar únicamente api, preferir **functions deploy** o el conector Neon.

## 4. Camino B: ZIP compilado + conector Neon (verificado en el despliegue #46)

Este es el **fallback operativo que realmente funcionó el 2026-10-10** sin Neon CLI autenticado en el entorno del agente. La conexión Neon ya autorizada permite usar **deploy_function** con el ZIP codificado en Base64 y conservar el environment anterior.

### 4.1. Construir un paquete que contenga index.mjs en la raíz

Partir **del commit exacto** de develop que se quiere publicar, con Node y dependencias instaladas. El directorio temporal **.neon-bundle/** ya figura en .gitignore.

~~~bash
git fetch origin
git switch develop
git pull --ff-only origin develop
git rev-parse HEAD
npm ci

npx --no-install esbuild functions/api/index.ts --bundle --platform=node --format=esm --target=node24 --minify --legal-comments=end-of-file --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile=.neon-bundle/index.mjs

node --check .neon-bundle/index.mjs

python -c "from zipfile import ZipFile, ZIP_DEFLATED; z=ZipFile('.neon-bundle/api.zip','w',ZIP_DEFLATED); z.write('.neon-bundle/index.mjs','index.mjs'); z.close()"

python -c "import zipfile; z=zipfile.ZipFile('.neon-bundle/api.zip'); assert z.namelist()==['index.mjs']; assert z.testzip() is None; print('ZIP válido:', z.namelist())"
python -c "from pathlib import Path; import hashlib; p=Path('.neon-bundle/api.zip'); print('bytes:',p.stat().st_size,'sha256:',hashlib.sha256(p.read_bytes()).hexdigest())"
~~~

En Windows puede usarse **py -3** en lugar de python. El ZIP **no debe** incluir node_modules, una carpeta contenedora, sourcemaps, el archivo de Base64 ni secrets. Si en el futuro se introducen módulos nativos o archivos de ejecución no embebibles, revisar el empaquetado; no asumir que un index.mjs único sigue siendo suficiente.

**Nota importante:** este comando reproduce el formato comprobado para la API actual. Si la configuración del bundler/dependencias evoluciona, usar el empaquetador nativo del CLI Neon y comprobar el ZIP resultante antes de aplicar el fallback.

### 4.2. Preparar el envío al conector

El argumento **zip** de Neon deploy_function es una cadena Base64 con los bytes de **api.zip**, no una ruta, un ZIP que contenga otro ZIP ni el contenido de index.mjs sin comprimir.

Si el agente tiene acceso al ZIP desde su entorno de trabajo, codificarlo en Base64 y enviarlo directamente. Si la conexión de herramientas no comparte el sistema de archivos con el runtime, usar el **puente temporal comprobado**:

1. Generar un archivo de texto con el Base64 dividido en líneas cortas (por ejemplo, 2.048 caracteres), para que su lectura no exceda los límites de salida.
2. Subir temporalmente ese archivo de texto mediante **files.manage_library (upload)**, solo como puente de bytes. La subida **no despliega** nada.
3. Recuperarlo con **files.list / files.read** en bloques, concatenar las líneas **sin espacios ni saltos**, y validar la longitud, el formato Base64, el tamaño del ZIP y el **SHA-256** contra el ZIP original. No usar el paquete si alguna comprobación no coincide.
4. Llamar **mcp__Neon__deploy_function** para el proyecto y rama exactos de la tabla anterior, con slug **api** y el campo **zip** del Base64 validado. **Omitir environment y runtime** para conservar la configuración activa. No reemplazar los valores existentes por cadenas vacías.
5. Eliminar el archivo puente de la Library y los archivos temporales después de comprobar el despliegue. No incluir Base64 ni binarios en PR, comentarios o logs.

Para crear el texto temporal desde el ZIP ya preparado, sin imprimir miles de caracteres por la consola:

~~~bash
python -c "import base64,textwrap; from pathlib import Path; p=Path('.neon-bundle/api.zip'); b=base64.b64encode(p.read_bytes()).decode('ascii'); Path('.neon-bundle/api.base64.txt').write_text(chr(10).join(textwrap.wrap(b,2048)),encoding='ascii')"
~~~

**Ejemplo conceptual de parámetros del conector (no copiar un paquete viejo):**

~~~json
{
  "project_id": "patient-pine-80293508",
  "branch_id": "br-nameless-violet-b7y48a5v",
  "slug": "api",
  "zip": "<Base64 del api.zip del commit actual>"
}
~~~

Si el conector rechaza el envío por tamaño, **no se debe declarar publicado**: usar el puente temporal por partes con comprobación de integridad o el Camino A.

### 4.3. Comprobación obligatoria

1. Leer **Neon get_function** en el mismo project_id/branch_id y comprobar que **current_deployment.id = active_deployment.id = id nuevo**, ambos con **status completed**. Un resultado **pending** no significa que ya esté activo.
2. Confirmar que los **nombres de variables** privados presentes antes y después se conservan (sin mostrar sus valores).
3. Consultar el endpoint HTTPS **GET /health**, sin autenticación: debe devolver algo equivalente a:

~~~json
{"ok":true,"branch":"desarrollo"}
~~~

4. Consultar logs recientes de **neon-function/api** y comprobar que no haya errores de arranque. Si el health falla, investigar antes de repetir el despliegue.
5. Registrar en el PR o historial: commit, rama Git, proyecto/rama Neon, deployment id, timestamp, hash SHA-256 del ZIP, resultado de health y si se preservaron variables. Nunca incluir valores secretos.
6. Si hubo frontend, verificar por separado Cloudflare. Si hubo migraciones, aplicar y verificar por separado, exclusivamente bajo autorización.

## 5. Evidencia real reproducible: 10 de octubre de 2026

- Commit desplegado desde **develop**: **ee76cb13949659857c062746f740510b86cebc62** (merge del PR #68).
- Artefacto **api.zip**: **436.507 bytes**, exactamente un archivo **index.mjs** en la raíz.
- SHA-256 del ZIP: **23fccc8074ed61391910181acfd7223e807a69e0ecf6022f4bd93e8b3c299565**.
- Transferencia realizada como Base64 troceado en archivo temporal; verificación previa de integridad; llamada al conector **deploy_function** con **zip** y sin **environment**.
- Neon creó **deployment #46** (primero pending, luego **completed** y **active**); mantuvo runtime nodejs24 y los diez nombres de variables existentes.
- El health público respondió **HTTP correcto**, cuerpo **{"ok":true,"branch":"desarrollo"}**.
- El archivo temporal de transferencia se eliminó de la Library; no se alteraron producción, migraciones, configuración de suspensión ni secretos.
- Evidencia de cambios y despliegue: https://github.com/savelasquezs/SPA-soluciones-radicales/pull/68

**Estos números prueban el despliegue histórico; no deben reutilizarse como señal de que una publicación posterior ya ocurrió.**

## 6. Fallos habituales y decisión segura

| Síntoma | Qué comprobar / cómo proceder |
| --- | --- |
| Invalid Neon config: ALLOWED_ORIGINS / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET undefined | Se intentó evaluar neon.ts sin las variables locales. Para solo código, usar Camino A o B; no enviar vacíos ni borrar configuración. |
| El ZIP es muy grande o excede el límite del conector | No adjuntar node_modules. Compilar con bundle/minify y empaquetar solo index.mjs. En el flujo del agente, usar puente Base64 en líneas + verificación, no pegarlo en una respuesta. |
| Neon devuelve pending o el deployment nuevo no aparece como active | Seguir consultando get_function; no afirmar éxito ni generar despliegues duplicados sin inspección. |
| El CLI está sin auth o la rama vinculada no es desarrollo | No iniciar sesión en silencio, no crear otra rama y no usar production. Usar el conector autenticado o solicitar la autorización necesaria. |
| Health retorna 500/404, o no responde | Confirmar URL y GET /health, revisar logs de arranque y dependencias; comprobar que el ZIP tiene index.mjs directamente en raíz. |
| Aparece error SQL / calendario / permisos luego del deploy | Diagnosticar la ruta afectada. No ejecutar migraciones ni recrear secretos como medida genérica. |
| El frontend aún falla | Confirmar despliegue Cloudflare independiente y revisar error de red/JS y JWT. Un backend sano no prueba que la interfaz haya sido actualizada. |

## 7. Checklist final para cualquier agente

- [ ] develop actualizado y commit registrado
- [ ] proyecto Neon y rama **desarrollo** confirmados
- [ ] versión anterior de api conocida
- [ ] ZIP construido desde ese commit (o CLI empaquetó la Function)
- [ ] sin cambios de secretos, triggers o migraciones
- [ ] nuevo deployment **completed** y **active**
- [ ] GET /health devuelve **ok:true** y **branch:desarrollo**
- [ ] logs de arranque revisados
- [ ] evidencia registrada y temporales eliminados

**Relacionado:** [Configuración Neon](neon-setup.md), [Recuperación tras inactividad](idle-recovery.md), [Flujo de desarrollo](workflow.md).

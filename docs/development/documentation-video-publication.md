# Publicación aprobada de videos del manual

Generar un video no significa publicarlo.

## Flujo

```text
storyboard + narración
        ↓
GitHub Actions
        ↓
MP4 + timeline + audios
        ↓
artefacto temporal
        ↓
REVISIÓN MANUAL
        ↓
aprobación explícita
        ↓
Cloudflare R2
        ↓
rama de documentación Mintlify
        ↓
preview
        ↓
merge a main
```

El workflow de generación termina en un artefacto temporal. No publica automáticamente en Cloudflare ni modifica el manual.

## Cloudflare R2

Bucket dedicado:

```text
sr-documentation-media
```

Dominio administrado actual:

```text
https://pub-2559f81105d04a23a042fba8f4f13697.r2.dev
```

El dominio `r2.dev` se usa como origen inicial. Cuando exista una zona DNS propia en la cuenta, se debe preferir un dominio dedicado como `media.docs.<dominio>`.

## Convención de objetos

```text
manual/<slug>/<version>/<archivo>.mp4
```

Ejemplo:

```text
manual/mip-gestion-productos/v4/mip-gestion-productos-v4.mp4
```

Una versión aprobada se considera inmutable. Si se corrige el contenido, se publica una versión nueva.

## CORS

El bucket público permite únicamente lectura mediante `GET` y `HEAD`. La escritura sigue requiriendo una sesión autenticada de Cloudflare.

## Publicación después de la aprobación

El operador autenticado publica el MP4 aprobado en la ruta R2 correspondiente. Antes de subirlo se valida:

- H.264;
- 1920 × 1080;
- duración válida;
- revisión manual aprobada;
- nombre y versión correctos.

Después de subirlo:

1. se verifica la URL pública;
2. se sustituye en Mintlify el origen temporal por la URL R2;
3. se prueba el reproductor;
4. se validan todos los enlaces de tiempo;
5. se revisa el preview de Mintlify;
6. se hace merge a `main`.

## Integración con Mintlify

El manual usa un componente reutilizable:

```text
snippets/manual-video.jsx
```

Ejemplo:

```mdx
<ManualVideo
  id="video-productos"
  src="URL_PUBLICA_R2"
  title="Gestión de productos · 2:11"
/>

<VideoTimestamp target="video-productos" seconds={42.561}>
  Ver en el video · 0:43
</VideoTimestamp>
```

Al seleccionar un enlace de tiempo:

- el usuario permanece en la misma página;
- el reproductor vuelve al centro de la pantalla;
- el video queda posicionado en el segundo exacto;
- permanece pausado hasta que el usuario decida reproducir;
- la URL conserva el tiempo para que el punto pueda compartirse.

## Puerta de aprobación

Antes de publicar:

- [ ] video visto completo a 1×;
- [ ] cambios importantes revisados a 0.5×;
- [ ] voz y subtítulos coinciden;
- [ ] portada y cierre aprobados;
- [ ] acciones sincronizadas;
- [ ] datos de demostración correctos;
- [ ] aprobación explícita del usuario.

Después de publicar:

- [ ] URL R2 responde;
- [ ] reproducción funciona en móvil y escritorio;
- [ ] enlaces de tiempo llegan al punto correcto;
- [ ] preview de Mintlify aprobado;
- [ ] documentación fusionada a `main`.

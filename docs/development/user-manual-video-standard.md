# Estándar de producción de videos del manual de usuario — V4

**Proyecto:** SPA Soluciones Radicales  
**Documento canónico:** este archivo define cómo producir, revisar y aprobar todos los videos del manual.  
**Video piloto:** Gestión de productos — Catálogos MIP.

---

## 1. Objetivo

Cada video debe enseñar una tarea completa y coherente dentro del sistema. No se crean videos aislados para cada botón cuando varias acciones pertenecen al mismo flujo de trabajo.

Ejemplos:

- **Correcto:** “Gestión de productos”: crear, consultar el detalle, abrir la ficha técnica, reconocer las acciones y desactivar.
- **Incorrecto:** cinco videos independientes para crear, abrir el detalle, ver la ficha, desactivar y consultar inactivos.

El usuario debe terminar el video sabiendo:

1. dónde se encuentra la funcionalidad;
2. qué información debe registrar;
3. cómo completar la tarea principal;
4. qué resultado produce;
5. qué acciones relacionadas están disponibles.

---

## 2. Entregables obligatorios por video

### Registro de videos

Todo video producido por la tubería automática debe tener una entrada en `e2e/documentation/videos.json`. El identificador es estable e incluye versión, por ejemplo `mip-gestion-trampas-v1`.

La rama de producción del candidato usa el formato:

```text
video/<video-id>
```

Un push sobre esa rama inicia automáticamente TTS, grabación, render y validación técnica. La publicación permanece bloqueada hasta la aprobación manual.



Cada video debe conservar estos tres archivos fuente:

```text
e2e/documentation/<slug>.storyboard.md
e2e/documentation/<slug>.narration.json
e2e/documentation/<slug>.docs.spec.ts
```

Y debe producir:

```text
docs-media/final/<slug>.mp4
docs-media/audio/timings.json
docs-media/timeline.json
```

### Responsabilidad de cada archivo

| Archivo | Responsabilidad |
|---|---|
| `storyboard.md` | Objetivo, alcance, escenas, acciones, narración, datos de demostración y criterios de aprobación. |
| `narration.json` | Fuente única de verdad para voz y subtítulos. |
| `docs.spec.ts` | Automatización visual exacta del storyboard. |
| `timings.json` | Duración real de cada segmento de voz. |
| `timeline.json` | Momento exacto en que empieza cada segmento dentro del video. |

El guion no se considera completo si solo existe dentro del test de Playwright.

---

## 3. Regla principal de sincronización

> En cada momento, la pantalla, la narración y el subtítulo deben comunicar exactamente la misma idea.

### Contrato obligatorio

1. El subtítulo se obtiene del mismo `segment.text` usado para sintetizar la voz.
2. No se mantiene un mapa independiente de subtítulos resumidos.
3. Cada segmento representa una sola idea visual.
4. Un panel, menú o diálogo permanece abierto mientras se habla de su contenido.
5. La interfaz no avanza al siguiente estado antes de terminar la frase correspondiente.
6. La acción importante ocurre cerca de la palabra que la describe.
7. Después de cada cambio de estado se conserva una pausa visual de 400 a 900 ms.

Implementación esperada:

```ts
await showCaption(page, segmentText(id))
```

No se permite:

```ts
await showCaption(page, CAPTIONS[id])
```

porque dos fuentes de texto terminan divergiendo.

### Segmentos largos

Si una narración necesita mostrar dos estados diferentes, se divide en dos segmentos. No se intenta resolver cerrando un selector a mitad de una frase extensa.

Ejemplo correcto:

```text
1. “También puedes añadir una plaga individual de otra categoría.”
   Estado visible: selector abierto.

2. “Cuando la selección esté lista, presiona Listo.”
   Acción visible: clic en Listo y cierre del selector.
```

---

## 4. Proceso de producción

### Paso 1. Verificar la funcionalidad real

Antes de escribir el guion:

- revisar la rama objetivo;
- confirmar nombres exactos de botones, pestañas y campos;
- confirmar validaciones y mensajes;
- identificar qué acciones modifican datos;
- verificar qué resultado debe aparecer;
- evitar documentar prototipos o comportamientos que todavía no existen.

### Paso 2. Definir el resultado de aprendizaje

Escribir una frase:

> Al terminar este video, el usuario podrá…

La frase limita el alcance y evita explicaciones innecesarias.

### Paso 3. Preparar datos estables

La demostración debe usar datos sintéticos y deterministas:

- nombres fáciles de leer;
- archivos de ejemplo sin información privada;
- respuestas HTTP controladas;
- tiempos de carga suficientemente largos para que el usuario comprenda el estado;
- ningún dato dependiente de producción, Neon o R2 real.

### Paso 4. Crear el storyboard

Cada escena debe documentar:

| Campo | Contenido |
|---|---|
| ID | Identificador estable y descriptivo. |
| Pantalla inicial | Estado exacto antes de comenzar la escena. |
| Acción | Movimiento, clic, escritura o pausa. |
| Narración/subtítulo | Texto literal y único. |
| Estado final | Resultado que debe permanecer visible. |
| Duración objetivo | Rango orientativo; la duración final la define el TTS. |

### Paso 5. Bloquear el guion

No se graba hasta aprobar:

- alcance;
- orden de escenas;
- texto exacto;
- datos de demostración;
- portada;
- cierre.

Después del bloqueo, cualquier cambio en la narración obliga a regenerar TTS, grabación y render final.

### Paso 6. Generar la voz

La voz se genera antes de grabar la interfaz. Su duración real define cuánto debe permanecer visible cada escena.

Reglas:

- español natural;
- nombres de controles pronunciados como aparecen;
- frases cortas;
- tono instructivo y neutral;
- evitar muletillas;
- evitar “como puedes ver” cuando la imagen ya lo demuestra;
- no leer datos irrelevantes carácter por carácter.

### Paso 7. Grabar la interfaz

La automatización debe:

- usar cursor visible;
- moverlo de forma natural durante 280–420 ms;
- señalar clics con un efecto breve;
- escribir a velocidad legible;
- mantener 400–900 ms después de cambios importantes;
- evitar movimientos sin propósito;
- evitar zoom global del modal;
- usar zoom local máximo de `1.04` solo cuando un control lo necesite;
- mantener el elemento explicado dentro del encuadre.

### Paso 8. Renderizar

Configuración objetivo:

```text
Resolución: 1920 × 1080
Fotogramas: 30 fps
Video: H.264, yuv420p
Preset: medium
CRF: 18–19
Audio: AAC, 192 kbps
Fast start: activado
```

No se debe ampliar un video de 720p para presentarlo como 1080p.

### Paso 9. Control de calidad

El video se revisa completo:

1. a velocidad normal;
2. a 0.5× en los cambios de escena;
3. a pantalla completa;
4. con audífonos;
5. sin audio, para comprobar que los subtítulos permiten seguir el flujo.

---

## 5. Estándar visual

### Portada

Duración objetivo: **3–4 segundos**.

Debe contener:

- logo de Soluciones Radicales en alta resolución o formato vectorial;
- etiqueta “Manual de usuario”;
- título del flujo;
- subtítulo breve.

Reglas:

- fondo plano y limpio;
- sin gradientes amplios, desenfoques o ruido que generen bandas de compresión;
- no usar el favicon ampliado como logo principal;
- animación breve de opacidad y desplazamiento de 6–10 px;
- tipografía Inter;
- composición centrada y con espacio suficiente;
- máximo dos colores de acento de la marca.

### Interfaz

- mostrar la aplicación real;
- conservar el tema elegido durante todo el video;
- no alternar entre modo claro y oscuro;
- evitar datos parcialmente cortados;
- mantener el cursor fuera del texto importante cuando no esté señalando algo;
- usar llamadas localizadas solo para controles de icono cuya función no sea evidente.

### Cierre

Duración objetivo: **2–3 segundos**.

Contenido:

- logo nítido;
- frase corta opcional;
- sin repetir todo el título;
- música con salida progresiva.

---

## 6. Subtítulos

Los subtítulos son literales, no resúmenes.

Reglas:

- mismo texto y puntuación que la voz;
- máximo dos líneas;
- hasta 42–46 caracteres aproximados por línea;
- contraste mínimo suficiente;
- fondo oscuro semitransparente uniforme;
- margen inferior seguro;
- tamaño recomendado en 1080p: 28–32 px;
- sin cubrir botones o mensajes relevantes;
- entrada y salida coincidentes con el audio, con tolerancia máxima de 100 ms.

Cuando una frase sea demasiado larga, se divide el segmento; no se reduce el tamaño de fuente.

---

## 7. Audio

### Narración

Objetivo de mezcla:

```text
Sonoridad integrada: aproximadamente -16 LUFS
Pico máximo: -1 dBTP
Canal: mono o estéreo centrado
```

### Música

- ambiental y discreta;
- sin melodía dominante;
- entre 8 y 12 dB por debajo de la voz;
- atenuación automática mientras hay narración;
- entrada y salida progresivas;
- nunca debe competir con consonantes o nombres de controles.

---

## 8. Datos y seguridad

No deben aparecer:

- nombres, teléfonos o correos reales;
- credenciales;
- tokens;
- URLs firmadas;
- información de clientes;
- identificadores de producción;
- errores de consola;
- notificaciones ajenas al flujo.

Los archivos adjuntos de demostración deben ser claramente ficticios.

---

## 9. Reglas para funcionalidades con ventanas nuevas

Cuando una acción real abre una pestaña nueva, la demostración debe conservar la continuidad visual.

Opciones permitidas:

1. capturar y concatenar correctamente la pestaña nueva; o
2. usar, solo en el entorno documental, una vista controlada que represente la pestaña y muestre el contenido de demostración.

La vista documental debe indicar que el archivo se abre en una nueva pestaña. No se cambia el comportamiento de producción.

---

## 10. Revisión y publicación

El MP4 generado es un **candidato**, no un video publicado.

1. GitHub Actions genera el MP4 y lo conserva como artefacto temporal.
2. El usuario revisa el video completo.
3. Si requiere cambios, se genera una nueva versión candidata.
4. Solo una aprobación explícita habilita la publicación en Cloudflare R2.
5. Mintlify se actualiza después de publicar el MP4 y siempre pasa por preview antes de llegar a `main`.

La publicación se documenta en [Publicación aprobada de videos del manual](documentation-video-publication.md).

## 11. Criterios de aprobación

Un video queda aprobado únicamente si cumple todos los puntos:

### Contenido

- [ ] Enseña un objetivo completo.
- [ ] Usa nombres reales de la interfaz.
- [ ] No describe funciones inexistentes.
- [ ] No omite el resultado final.
- [ ] No incluye explicaciones redundantes.

### Sincronización

- [ ] Voz y subtítulos son idénticos.
- [ ] Cada acción ocurre durante la frase correcta.
- [ ] Los selectores permanecen abiertos mientras se explican.
- [ ] Ninguna escena avanza antes de terminar su audio.
- [ ] La diferencia de inicio voz/subtítulo es menor de 100 ms.

### Imagen

- [ ] Portada nítida y sin pixelación.
- [ ] Resolución final real de 1080p.
- [ ] Texto legible a pantalla completa.
- [ ] Cursor y clics visibles, pero discretos.
- [ ] No hay saltos, parpadeos ni esperas vacías.
- [ ] El tema visual es consistente.

### Audio

- [ ] Voz clara y natural.
- [ ] Música suficientemente baja.
- [ ] No hay cortes al principio o al final de las frases.
- [ ] No hay silencios accidentales.

### Técnica

- [ ] El flujo se genera de forma determinista.
- [ ] El workflow publica el MP4, el timeline y los audios.
- [ ] El nombre del artefacto y del archivo incluye el slug y la versión.
- [ ] El video fue revisado a 1× y 0.5×.

---

## 12. Convención de nombres

Ejemplo para el video piloto:

```text
Slug: mip-gestion-productos
Storyboard: e2e/documentation/mip-gestion-productos.storyboard.md
Narración: e2e/documentation/mip-gestion-productos.narration.json
Automatización: e2e/documentation/mip-gestion-productos.docs.spec.ts
Salida: docs-media/final/mip-gestion-productos-v4.mp4
Artefacto: documentation-video-mip-gestion-productos-v4
```

---

## 13. Cambios obligatorios respecto al video anterior

1. Cambiar el título de **Cómo crear un producto** a **Gestión de productos**.
2. Reemplazar la portada con gradientes amplios por una composición plana y nítida.
3. Grabar y renderizar a 1920 × 1080.
4. Usar el texto de narración como subtítulo literal.
5. Dividir la explicación de cobertura en escenas pequeñas.
6. Mantener abierto el selector de plagas durante toda su explicación.
7. Mostrar el producto creado en la lista.
8. Abrir el detalle desde el nombre.
9. Mostrar la ficha técnica guardada.
10. Identificar Editar, Desactivar y Eliminar.
11. Ejecutar la desactivación.
12. Mostrar el producto en la pestaña Inactivos.
13. Renombrar archivo, artefacto y workflow con el nuevo alcance y versión.

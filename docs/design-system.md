# Sistema de diseño

## Principios

- Jerarquía clara y alta densidad sin ruido.
- Superficies discretas, bordes finos e iconografía lineal.
- Mobile-first para trabajo de campo.
- Consistencia mediante componentes base.
- Estados comprensibles sin depender únicamente del color.
- Tema claro y oscuro mediante los mismos tokens semánticos.

## Tokens

Los componentes no escriben colores, radios, sombras o espaciado repetidos directamente. Utilizan variables semánticas.

### Marca

| Token | Claro | Uso |
|---|---|---|
| `--accent` | `#0877B9` | Acción primaria y foco |
| `--accent-hover` | `#0B5F91` | Hover de acción primaria |
| `--accent-subtle` | `#EAF5FB` | Selección y fondo sutil |
| `--brand-secondary` | `#5B8F18` | Acento secundario de marca |
| `--brand-secondary-hover` | `#4B7814` | Hover secundario |
| `--brand-secondary-subtle` | `#F1F8EA` | Fondo secundario sutil |

### Tema claro

| Token | Valor |
|---|---|
| `--bg` | `#F7FAFB` |
| `--sidebar` | `#F3F6F7` |
| `--surface` | `#FFFFFF` |
| `--surface-raised` | `#FFFFFF` |
| `--hover` | `#EEF6FA` |
| `--border` | `#D9E3E8` |
| `--border-strong` | `#B9C8D1` |
| `--text` | `#17324D` |
| `--text-secondary` | `#65727B` |
| `--text-muted` | `#84919A` |
| `--success` | `#238636` |
| `--warning` | `#A66B00` |
| `--danger` | `#D73A49` |
| `--info` | `#0969DA` |

### Tema oscuro

| Token | Valor |
|---|---|
| `--bg` | `#0B0C0E` |
| `--sidebar` | `#111318` |
| `--surface` | `#17191D` |
| `--surface-raised` | `#1D2025` |
| `--hover` | `#22262C` |
| `--border` | `#30343B` |
| `--border-strong` | `#454B55` |
| `--text` | `#F5F6F8` |
| `--text-secondary` | `#B3B8C2` |
| `--text-muted` | `#858C98` |
| `--accent` | `#8B83FF` |
| `--accent-hover` | `#9A93FF` |
| `--accent-subtle` | `#282451` |
| `--success` | `#3FB950` |
| `--warning` | `#D9A441` |
| `--danger` | `#F05D5E` |
| `--info` | `#579DFF` |

### Forma y tipografía

- Fuente: `Inter`, con fallback del sistema.
- `--radius-sm`: `4px`.
- `--radius`: `8px`.
- `--radius-lg`: `12px`.
- Escala de espaciado basada en múltiplos de 4 px.
- Texto base de al menos 16 px en formularios móviles para evitar zoom involuntario.

## Componentes base

La implementación visual se concentra en componentes reutilizables:

- botones y enlaces de acción;
- campos y grupos de formulario;
- diálogo, drawer y confirmación;
- toast;
- spinner, skeleton y paneles de estado;
- badges;
- tabla responsive y cards de lista;
- paginación;
- tabs y breadcrumbs;
- selector y progreso de archivos.

Las variantes se expresan con props tipadas. No duplicar clases completas en componentes de dominio.

## Controles

- Altura táctil mínima: 44 px en mobile y superficies de campo.
- `BaseButton` ofrece `size="compact"` para acciones administrativas de desktop; visualmente puede bajar a 36 px, pero recupera 44 px en viewport móvil.
- `BaseIconButton size="small"` es la variante compacta para acciones por fila en desktop.
- Foco visible en todos los controles interactivos.
- Disabled y loading son estados diferentes y perceptibles.
- Botones con solo icono requieren nombre accesible y tooltip cuando aporte contexto.
- El botón primario aparece una vez por región de acción.
- Acciones destructivas usan `--danger` y confirmación cuando la consecuencia sea difícil de revertir.

## Formularios

- Label visible sobre el control salvo patrón accesible equivalente.
- Usar labels breves y descriptivos; el contexto adicional pertenece al texto de ayuda, no al label.
- Evitar repetir el mismo concepto en título de sección, label y control. Si una sección ya identifica claramente una carga de archivo, el label puede quedar visualmente oculto manteniendo su asociación accesible.
- Ayuda antes del error; error inmediatamente después del control.
- Dividir formularios medianos en secciones por intención, con título y descripción breve, en lugar de una lista continua de campos.
- Usar dos columnas solo para controles relacionados cuando ambos puedan encogerse sin overflow; volver a una columna en mobile.
- Ancho limitado para campos cortos y fechas.
- Formularios a una columna en mobile.
- Agrupar por significado, no por columnas de base de datos.

Estas reglas siguen patrones consolidados de formularios de GitHub Primer y Atlassian: labels permanentes y concisos, captions para contexto, validación junto al campo y agrupación visual que reduce carga cognitiva.

### Fechas y rangos

- Las fechas editables usan una entrada segmentada `DD / MM / AAAA`: los separadores son parte del control, los segmentos pendientes permanecen como ayuda visual tenue y el foco avanza al completar día o mes. También se admite pegar una fecha completa.
- En escritorio el calendario muestra un solo mes en un diálogo compacto; en móvil conserva objetivos táctiles de al menos 44 px.
- Los rangos usan un único control `Desde – Hasta` y el mismo calendario en modo rango, con inicio y fin acentuados y los días intermedios en un tono sutil.
- La navegación por teclado del calendario cubre flechas, `PageUp`/`PageDown`, `Home`/`End` y cierre por `Escape`.

## Enlaces de entidad y WhatsApp

- Un nombre de Cliente, Sede, Área o Servicio navegable usa `--text` por defecto, no `--accent`.
- Hover/focus puede subrayar el texto y cambiar el cursor; el foco visible sigue siendo obligatorio.
- El acento de marca se reserva para CTA, foco, selección y navegación activa.
- `WhatsAppPhoneLink` es la única representación interactiva aprobada para celulares visibles: icono de WhatsApp inline, número legible y destino `wa.me`.
- El icono de WhatsApp no convierte toda la fila en un bloque verde; permanece discreto y puede enfatizarse solo en interacción.

## Responsive

- No usar anchos fijos que excedan el viewport.
- Tablas se convierten en cards o filas apiladas cuando pierdan legibilidad.
- Diálogos respetan `max-width: 100vw` y dejan margen seguro.
- Drawers ocupan el ancho disponible en mobile.
- El contenido principal nunca depende de hover.

## Accesibilidad visual

- Contraste WCAG AA para texto y controles.
- Icono y texto acompañan estados semánticos.
- No usar tamaño o color como único indicador de jerarquía.
- Respetar `prefers-reduced-motion`.
- Animaciones breves y funcionales; no retrasan interacción.

## Regla de implementación

Si una pantalla necesita una variante visual no contemplada, primero se evalúa extender el componente base. Solo se crea un componente aislado cuando el comportamiento o semántica realmente difieren.

## Densidad de la interfaz administrativa

- `AdminLayout` usa un sidebar de 220 px en escritorio: grupos en color `--accent` y separadores con `--border`, sin añadir tonos rígidos.
- En escritorio los enlaces laterales tienen 38 px de altura. En el drawer móvil recuperan al menos 44 px.
- Las vistas administrativas principales utilizan `content--compact`: menor margen superior y más espacio horizontal para tablas e historiales. No se aplica a edición ni trabajo de campo.
- Usar `admin-page-header` y `admin-page-heading` para un título de 24 px con descripción en línea, pequeña y en `--text-secondary` (p. ej., «Clientes — Negocios y casas atendidos»). La descripción puede pasar a otra línea en móvil.
- Usar `admin-compact-filters` en barras de búsqueda y filtros administrativos: controles de 36 px y labels cercanos en escritorio, sin cambiar `BaseInput`/`BaseSelect` dentro de formularios; conservar 44 px o más en móvil.
- No repetir el breadcrumb simple si ya existe el título de la vista; conservar breadcrumbs navegables en las vistas de detalle.
- Documentos y certificados pertenecen a Configuración, no a una entrada vacía del sidebar. El enlace de Ayuda lleva a [Mintlify](https://soluciones-radicales.mintlify.app).

## Criterios y hallazgos en campo

El criterio agrupa evaluación, observación, fotografías y hallazgos relacionados en una única superficie. Los detalles y el historial son plegables. El selector de Área y Orden comparten fila en móvil, conservando controles táctiles de 44 px. Otros hallazgos del Área se diferencia mediante un encabezado y borde discreto, sin una pestaña adicional. Se reutilizan tokens y visor existentes en ambos temas.

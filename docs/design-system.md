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

- Altura táctil mínima: 44 px.
- Foco visible en todos los controles interactivos.
- Disabled y loading son estados diferentes y perceptibles.
- Botones con solo icono requieren nombre accesible y tooltip cuando aporte contexto.
- El botón primario aparece una vez por región de acción.
- Acciones destructivas usan `--danger` y confirmación cuando la consecuencia sea difícil de revertir.

## Formularios

- Label visible sobre el control salvo patrón accesible equivalente.
- Ayuda antes del error; error inmediatamente después del control.
- Ancho limitado para campos cortos y fechas.
- Formularios a una columna en mobile.
- Agrupar por significado, no por columnas de base de datos.

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

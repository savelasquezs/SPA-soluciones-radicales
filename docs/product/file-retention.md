# Conservación de evidencias MIP

**Estado:** política de evidencias vigente; Worker Cron de desarrollo activo. Las pruebas de eliminación sintética siguen pendientes. Los informes PDF fueron retirados del alcance el 2026-10-09.

## Objetivo

Conservar evidencias durante plazos predecibles, mantener el historial estructurado y operar preferentemente dentro del nivel gratuito de Cloudflare R2. La eliminación es automática: el cliente no necesita intervenir cada pocos meses.

## Plazos aprobados

| Categoría | Plazo | Inicio del plazo |
| --- | --- | --- |
| Fotografías de revisiones de puestos de monitoreo | 3 meses calendario | `servicios.fin_real`, tras finalizar el Servicio |
| Fotografías de áreas sin acceso y criterios MIP | 3 meses calendario | `servicios.fin_real`, tras finalizar el Servicio |
| Fotografías de apertura de Hallazgo `ABIERTO`/`EN_PROCESO` | Máximo 1 año calendario | `hallazgos.fecha_apertura`, aunque siga pendiente |
| Fotografías de Hallazgo `CERRADO` (apertura **y** cierre) | 3 meses calendario | `hallazgos.fecha_cierre` |
| Fotografías de revisión de Hallazgo `ABIERTO`/`EN_PROCESO` | 1 año calendario | Fecha de cada revisión |
| Fotografías de revisiones de Hallazgo `CERRADO` | 3 meses calendario | `hallazgos.fecha_cierre` |
| Datos estructurados de servicios, revisiones y hallazgos | Sin vencimiento automático | No se borran durante estas limpiezas |

Los plazos se calculan a partir de eventos del dominio registrados en PostgreSQL, no desde el último acceso, una reprogramación, el nombre del archivo o la fecha de ejecución del cron. «Mes» y «año» significan meses/años calendario, no 30/365 días fijos. El cron diario ejecuta la limpieza **a partir** del vencimiento, no antes; puede haber retrasos si fallan proveedor o job.

### Regla especial: Hallazgos

- Mientras el hallazgo permanezca `ABIERTO` o `EN_PROCESO`, las fotografías de apertura están protegidas **hasta cumplir un año** desde `fecha_apertura`. Llegado el año, se eliminan aunque no se haya corregido; el hallazgo y su estado siguen disponibles.
- Si se cierra **antes** de ese vencimiento, las fotografías originales y las fotografías de la corrección/cierre permanecen juntas **tres meses desde `fecha_cierre`**. Ese cierre sustituye el vencimiento originalmente previsto para las fotos de apertura.
- Si se cierra **después** de que las fotos originales ya hayan vencido y sido eliminadas, **no se recuperan**: las nuevas fotos de cierre se conservan tres meses desde `fecha_cierre`. No se debe volver a cargar o recrear evidencia histórica.
- Un hallazgo no se marca automáticamente `CERRADO` por cumplir un año. Conservar descripción, área, responsable, fechas, estado, recomendaciones, servicio de apertura y, cuando exista, cierre.
- Las evidencias asociadas a servicios distintos (apertura/cierre) se rigen por la **identidad del hallazgo**, no por el plazo ordinario de tres meses del servicio.

**Ejemplos:**
- Apertura 2027-01-15; sigue pendiente 2028-01-15: vencen las fotos de apertura.
- Apertura 2027-01-15; cierre 2027-11-10: fotos iniciales y de cierre vencen 2028-02-10.
- Apertura 2027-01-15; fotos eliminadas 2028-01-15; cierre 2028-03-05: las fotos nuevas vencen 2028-06-05; las originales siguen ausentes.

## Documentos y futura página de informes

- El informe MIP será HTML consultable, no un PDF almacenado. Al imprimirlo, el navegador genera una copia local a petición del usuario, sin subirla a R2.
- Los datos estructurados se conservan aunque las fotografías de evidencia caduquen. En el informe web se deberá señalar que una imagen venció; no regenerarla.
- **Fuera del alcance de esta política:** certificados PDF, plantillas, fichas técnicas, planos, archivos maestros, comprobantes, firmas y documentos con plazos legales especiales. Nunca eliminarlos por una regla global del bucket.
- Conservaciones contractuales, sanitarias o legales deben respetarse con bloqueos explícitos.

## Comportamiento de interfaz

- Listas compactas: no cargar miniaturas de todas las fotos. Solo indicar cantidad/disponibilidad; abrir las imágenes bajo demanda en el detalle del dispositivo, revisión o hallazgo.
- Distinguir `SIN_FOTO`, `PENDIENTE_SINCRONIZACION`, `DISPONIBLE` y `VENCIDA` / `ELIMINADA`. Una evidencia histórica expirada no significa que nunca existió.
- Un hallazgo abierto con fotos vencidas sigue abierto y consultable, con fechas y trazabilidad. Al corregirlo se pueden consultar las nuevas fotos mientras estén vigentes.
- No ofrecer al administrador acciones para eliminar o modificar hallazgos ni revisiones originadas en servicios.
- Los enlaces firmados y permisos de descarga deben validarse en el backend y no seguir funcionando tras la eliminación. Evitar verificaciones HEAD por cada fila durante el renderizado.
- El registro de eliminación debe permitir informar fecha/motivo de expiración sin mantener enlaces rotos ni borrar referencias históricas necesarias.

## Límites de almacenamiento y estimaciones

R2 Standard incluye 10 GB-mes de almacenamiento gratuito; **presupuesto operativo**: 8 GB, con alertas antes de alcanzarlo (70 % y 85 % del presupuesto). Se evalúa el espacio **total de los buckets de R2** usados por el proyecto, no solamente `sr-service-media`. Las fotos se comprimen antes de subir; los certificados y demás archivos maestros siguen sus políticas separadas.

Con 7 servicios/día, 6 días/semana (aprox. 182 servicios/mes) y 15–20 fotos de 200 kB, las fotos ordinarias de los últimos 3 meses pueden ocupar aproximadamente 1,64–2,18 GB, más hallazgos pendientes, evidencias de cierre, certificados y archivos maestros. Es una proyección, no una garantía.

## Diseño obligatorio de automatización

- **Cloudflare Workers Cron Triggers** debe ejecutar el disparador diario. **No usar Neon scheduled triggers, GitHub Actions, el navegador ni un usuario administrador** como programador de esta limpieza.
- Crear un Worker **independiente del Worker de Static Assets de la SPA**; este último sigue sin `main` ni ejecución dinámica de assets. Cron de referencia: `0 7 * * *` UTC (02:00 Colombia).
- PostgreSQL/Neon determina la elegibilidad mediante estado, fechas y referencias **vigentes**. Cloudflare Worker inicia la limpieza en lotes acotados llamando a una ruta privada de Neon Functions; la Function vuelve a comprobar elegibilidad y elimina las **claves individuales** de R2 bajo bloqueo transaccional. **La programación automática se origina únicamente en Cloudflare**.
- Reutilizar las credenciales privadas R2 existentes en Neon Functions: el Worker de Cron no recibe credenciales S3, solo un secreto de autenticación propio. No utilizar `VITE_*` ni rutas administrativas públicas para la eliminación.
- Registrar por objeto `bucket`, `storage_path`, estado (`ACTIVE`, `DELETE_PENDING`, `DELETED`), motivo, fecha de vencimiento, marca de eliminación y último error; admitir backfill de rutas ya almacenadas en JSONB/columnas.
- La tarea debe ser idempotente, con bloqueo/lease para no duplicar trabajos, validación de estado justo antes de borrar y reintentos ante fallos. Revalidar especialmente la transición concurrente de `ABIERTO` a `CERRADO`, que amplía el plazo de la fotografía inicial.
- No aplicar una regla global de expiración R2 por edad de objeto o por `services/`: mezclaría firmas, fotos corrientes, criterios y hallazgos con vencimientos distintos.
- Primero habilitar **dry-run**, registrar candidatos y comprobar recuentos/fechas. Activar `delete` solo con pruebas de integración, migración aplicada y smoke test controlado. No borrar de manera preventiva archivos cuyo estado sea ambiguo ni archivos de servicios inconclusos.
- Gestionar huérfanos de cargas fallidas/reemplazadas mediante una política separada que verifique que no existe referencia vigente; no aplicarles ciegamente el plazo de las fotos finales.

## Casos mínimos de prueba

1. Una foto normal no vence antes de tres meses del fin real; vence después.
2. Un hallazgo pendiente conserva fotos hasta un año y no se cierra cuando estas vencen.
3. Hallazgo cerrado a los 11 meses retiene las fotos iniciales y de cierre hasta tres meses después del cierre.
4. Hallazgo cerrado tras vencimiento: fotos antiguas eliminadas no reaparecen; fotos nuevas vencen tres meses después.
5. Cierre concurrente con la limpieza: revalidación impide borrar fotos iniciales cuyo plazo se amplió.
6. El informe web conserva resultados históricos aunque las fotografías individuales hayan vencido; nunca elimina certificados ni plantillas.
7. Archivo que falta en R2 se trata idempotentemente; fallo parcial se reintenta sin duplicar log.
8. Dos runs del cron simultáneos no eliminan dos veces ni alteran registros vigentes.
9. La interfaz diferencia foto nunca capturada de evidencia expirada.
10. La ejecución diaria solo se dispara desde Cloudflare Cron y el Worker de la SPA no cambia.

Referencia técnica del despliegue: [automatización de retención en Cloudflare](../development/cloudflare-retention.md).

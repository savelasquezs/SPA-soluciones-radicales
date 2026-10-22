# Resúmenes por rol

## Resumen administrativo (V1)

Acceso: `/` con rol activo **ADMINISTRADOR**.

## Contenido

- Seis tarjetas: servicios de hoy (programados, en proceso y finalizados), retrasados, próximos por confirmar, valor de servicios realizados, cobros pendientes y hallazgos pendientes.
- Tres gráficas: servicios según estado, **únicamente valor de servicios realizados** y cumplimiento MIP promedio.
- Alertas accionables: retrasados, visitas por confirmar, cobros pendientes, hallazgos sin resolver, certificados próximos a vencer y errores de Calendar.
- Tres tablas de cinco registros cada una: próximos servicios, últimas visitas finalizadas y últimos hallazgos. Los nombres enlazan a la vista de detalle.
- Filtros por 7/30/90/365/730/1826 días, rango personalizado de hasta diez años, Cliente y Sede. El filtro temporal afecta las gráficas y el valor realizado; el alcance Cliente/Sede afecta los indicadores y tablas salvo la alerta de certificados, que es global.
- Los rangos predeterminados incluyen **hoy en el calendario de Bogotá** (por ejemplo, el 22 de octubre: 7 días = 16–22 de octubre; 30 días = 23 de septiembre–22 de octubre). El subtítulo muestra las fechas exactas. En las gráficas semanales, las etiquetas indican el intervalo real, recortando las semanas parciales al inicio y al final; «19–22 oct» incluye el día 22, aunque el grupo empiece el lunes 19. La API usa un límite superior exclusivo del día siguiente en Bogotá.

## Definiciones, sin duplicar información

1. **Hoy:** se determina en `America/Bogota` usando `inicio_programado`; solo estados operativos, no cancelados.
2. **Retrasado:** `PROGRAMADO` cuyo inicio programado pasó hace al menos 15 minutos. Se cuenta aunque no pertenezca al período seleccionado.
3. **Por confirmar:** propuestas sin nuevo servicio agendado, estados `PENDIENTE`, `CONTACTADO`, `CONFIRMADO` o `POSPUESTO`; fecha sugerida anterior al final de los próximos siete días y sin recontacto futuro. Incluye vencidas. No se convierten propuestas en servicios automáticamente.
4. **Valor realizado:** suma de `valor_servicio` en servicios `FINALIZADO` por `fin_real`, dentro del período elegido; **no** equivale a ingresos bancarios o facturación electrónica. Compara con igual número de días anteriores; si el período anterior es cero, no hay porcentaje comparable.
5. **Por cobrar:** saldo pendiente de servicios `FINALIZADO` (valor del servicio menos abonos confirmados en el libro de pagos). Los reportes pendientes de confirmación no disminuyen la deuda. Acumulado histórico, no filtrado por período.
6. **Hallazgos pendientes:** estados `ABIERTO` y `EN_PROCESO`. No se inventa una severidad/criticidad porque el dominio no la almacena.
7. **Cumplimiento:** visitas principales finalizadas de Sedes tipo Negocio; criterios `C`=1, `CP`=0.5, `NC`=0, se excluyen `NA` y Áreas sin acceso. Se promedia el porcentaje por visita y luego entre visitas del intervalo. Los intervalos sin evaluación aparecen sin dato, nunca como 0 %.
8. **Certificados próximos a vencer:** certificados de técnicos activos con documento adjunto y certificados expedidos de toda la empresa (indicador global); desde hoy hasta los próximos 30 días.
9. **Últimos hallazgos:** se muestra descripción, Área, estado y antigüedad reales. No se muestran especies o prioridades que no se registraron en `hallazgos`.

## Tecnología y comportamiento

`GET /api/admin/dashboard` exige autorización administrativa en servidor. Recibe `period` (`7d`, `30d`, `90d`, `12m`, `24m`, `5y` o `custom`), `from`/`to` para rango personalizado, `clientId` y `siteId`. Valida fechas (hasta diez años), UUID y pertenencia Sede–Cliente. Las agregaciones usan condiciones selectivas de estado y fecha; no se descarga el historial al navegador. La consulta se cancela si cambian filtros o se abandona la página; una respuesta obsoleta no reemplaza el resultado actual.

Gráficas: ECharts 6 + Vue ECharts 8 con SVG modular y carga diferida del componente. Colores tomados de los tokens semánticos del sistema; reactivos al selector Claro/Oscuro/Sistema mediante `useAppStore().resolvedTheme`, también al cambiar la apariencia del dispositivo. Tooltips y cifras accesibles, `es-CO`, COP y fechas Bogotá. Respeta `prefers-reduced-motion`.

Los informes históricos de servicio conservan sus gráficas SVG existentes; no se duplican sus cálculos en la SPA. En móvil los registros se convierten en tarjetas compactas y las gráficas quedan apiladas. Los vínculos hacia hallazgos permiten abrir la pestaña correcta en la Sede.

## Navegación exacta desde indicadores

Todas las tarjetas y alertas llevan el identificador del criterio aplicado; no basta con navegar a una pestaña sin filtros.

- `today`: programación del día en Bogotá, estados operativos; excluye cancelados.
- `delayed`: solo programados cuyo inicio fue hace más de 15 minutos, sin corte histórico arbitrario. El enlace no limita al último año.
- `performed`: finalizados cuya fecha real `fin_real` está dentro del período escogido, con filtros de Cliente/Sede; no utiliza `inicio_programado`.
- `unpaid`: finalizados con valor positivo y pago sin confirmar, sin límite histórico.
- `calendarError`: servicios cuyo estado de integración con Calendar es ERROR, sin excluir finalizados.
- `next` / `recent`: tablas de próximas visitas y de últimos finalizados con criterios y orden específicos.
- `actionable`: preagenda sin agendar, pendiente de gestionar hasta dentro de siete días e incluye vencidas, sin límite inferior de fecha.
- `/resumen/detalles?kind=findings`: paginación de todos los hallazgos abiertos o en proceso. `recentFindings`: historial de hallazgos. `certificates`: credenciales técnicas y certificados emitidos en toda la empresa; los técnicos no se atribuyen artificialmente a una sede.

La vista de Servicios presenta una indicación de filtro activo y permite limpiarlo. Los enlaces conservan Cliente/Sede cuando corresponde. Cambiar manualmente de pestaña o rango elimina el criterio anterior; los filtros no quedan ocultos. Los rangos personalizados quedan reflejados en URL para volver al resumen con el mismo contexto.

## Rendimiento

- Se reemplazó el agregado `FILTER` global sobre servicios por subconsultas indexables para inicio del día, retrasos, servicios finalizados, pendientes de cobro y errores de Calendar.
- Se mantienen los índices existentes de `servicios` por estado/inicio, `fin_real`, `calendar_sync_estado`, preagenda y hallazgos por sede/estado.
- La migración `20261019_001_dashboard_read_indexes.sql` añade índices selectivos para hallazgos globales ordenados por fecha y servicios finalizados con cobro sin confirmar; no crea tablas.
- Los listados detallados usan paginación de 20 o 25 registros en backend. Las gráficas limitan los puntos mediante agregación temporal adaptativa: diaria, semanal, mensual o trimestral (hasta diez años).
- Validar planes con `EXPLAIN` y volúmenes representativos antes de introducir cachés o nuevas tablas agregadas. La rama de desarrollo actual tiene pocas filas, de modo que sus tiempos absolutos no predicen la carga de producción.


## Resumen personal del Técnico

Acceso: `/` con rol activo **TECNICO**. Reemplaza la tarjeta única de «Ver mis servicios» sin exponer cifras administrativas. Consulta `GET /api/technician/dashboard`, que exige `requireTechnician` y deriva el UUID del usuario autenticado; no recibe IDs de otros técnicos. La respuesta es privada y sin caché HTTP.

### Contenido y atribución

- Cuatro KPI: principales finalizados en el rango, programados pendientes totales (más cantidad en proceso), sedes y clientes atendidos y puntualidad de inicio.
- Gráfica **de línea** para el histórico de servicios **PRINCIPALES FINALIZADOS** por fecha de cierre real (`fin_real`), no programada. Intervalos sin servicios valen cero. Reutiliza `DashboardChart`, ECharts y adaptación de tema.
- Actividad: hallazgos abiertos en servicios donde estuvo asignado, seguimientos **atribuidos** mediante `hallazgo_seguimientos.tecnico_id`, cierres de esos seguimientos, revisiones y creación de puestos y productos marcados aplicados en visitas principales finalizadas.
- Dos listados de cinco: pendientes (en curso primero y programados aunque estén retrasados) y últimas visitas finalizadas en el rango; enlazan al trabajo del servicio.
- Análisis complementario: cumplimiento MIP promedio **observado en sedes** (C=1, CP=.5, NC=0, excluye NA y áreas sin acceso, media por visita y luego período) y duración transcurrida promedio (`fin_real - inicio_real`). Ninguno califica el desempeño personal.

La asignación incluye `tecnico_responsable_id` y `tecnicos_colaboradores_ids_json`, reutilizando exactamente el predicado del servicio técnico. Una visita compartida aparece una vez por participante; sus registros técnicos se describen como **«en mis visitas»** porque no existe autor por operación. Los seguimientos sí tienen autor explícito. Se excluyen los Refuerzos (aún no ejecutables por el Técnico) de las métricas de visitas.

Puntualidad: inicios reales en el rango en servicios en proceso o finalizados, máximo 15 minutos después de la hora programada. Sin inicios registrados muestra «—». La duración representa tiempo transcurrido, no tiempo efectivo de trabajo.

### Filtros, seguridad y pruebas

`resolveDashboardRange` da 7/30/90/365/730/1826 días o rango personalizado de máximo diez años. Calendario `America/Bogota`; la gráfica se agrupa por día (hasta 14), semana (hasta 120), mes (hasta 1460) o trimestre. El período afecta visitas finalizadas, sedes, clientes, puntualidad y actividad, pero **no** los pendientes de agenda, que incluyen toda la asignación. Filtros en la URL; solicitudes anteriores abortadas en cambios.

El backend agrega en PostgreSQL y devuelve a lo sumo cinco registros por tabla. Un administrador que tenga ambos roles debe activar Técnico para usar este endpoint, y no se exponen montos, cobros ni certificados empresariales. Sin tablas ni permisos nuevos.

Pruebas: unitarias para fechas faltantes/ceros, confidencialidad de parametrización, E2E de roles, línea, filtros, tema y móvil. Las consultas se ejecutaron de solo lectura en `desarrollo`.

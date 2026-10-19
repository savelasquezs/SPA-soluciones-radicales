# Resumen administrativo (dashboard V1)

Acceso: `/` para el rol **ADMINISTRADOR**. El rol Técnico mantiene un acceso simple a sus servicios.

## Contenido

- Seis tarjetas: servicios de hoy (programados, en proceso y finalizados), retrasados, próximos por confirmar, valor de servicios realizados, cobros pendientes y hallazgos pendientes.
- Tres gráficas: servicios según estado, **únicamente valor de servicios realizados** y cumplimiento MIP promedio.
- Alertas accionables: retrasados, visitas por confirmar, cobros pendientes, hallazgos sin resolver, certificados próximos a vencer y errores de Calendar.
- Tres tablas de cinco registros cada una: próximos servicios, últimas visitas finalizadas y últimos hallazgos. Los nombres enlazan a la vista de detalle.
- Filtros por 7/30/90/365 días, Cliente y Sede. El filtro temporal afecta las gráficas y el valor realizado; el alcance Cliente/Sede afecta todos los indicadores y tablas, salvo que los certificados de técnicos son una alerta global.

## Definiciones, sin duplicar información

1. **Hoy:** se determina en `America/Bogota` usando `inicio_programado`; solo estados operativos, no cancelados.
2. **Retrasado:** `PROGRAMADO` cuyo inicio programado pasó hace al menos 15 minutos. Se cuenta aunque no pertenezca al período seleccionado.
3. **Por confirmar:** propuestas sin nuevo servicio agendado, estados `PENDIENTE`, `CONTACTADO`, `CONFIRMADO` o `POSPUESTO`; fecha sugerida anterior al final de los próximos siete días y sin recontacto futuro. Incluye vencidas. No se convierten propuestas en servicios automáticamente.
4. **Valor realizado:** suma de `valor_servicio` en servicios `FINALIZADO` por `fin_real`, dentro del período elegido; **no** equivale a ingresos bancarios o facturación electrónica. Compara con igual número de días anteriores; si el período anterior es cero, no hay porcentaje comparable.
5. **Por cobrar:** valor de servicios ya `FINALIZADO` con valor mayor que cero y pago diferente de `CONFIRMADO`; acumulado histórico, no filtrado por período.
6. **Hallazgos pendientes:** estados `ABIERTO` y `EN_PROCESO`. No se inventa una severidad/criticidad porque el dominio no la almacena.
7. **Cumplimiento:** visitas principales finalizadas de Sedes tipo Negocio; criterios `C`=1, `CP`=0.5, `NC`=0, se excluyen `NA` y Áreas sin acceso. Se promedia el porcentaje por visita y luego entre visitas del intervalo. Los intervalos sin evaluación aparecen sin dato, nunca como 0 %.
8. **Certificados próximos a vencer:** certificados de técnicos activos (globales) y certificados expedidos vinculados a servicios del alcance Cliente/Sede; desde hoy hasta los próximos 30 días.
9. **Últimos hallazgos:** se muestra descripción, Área, estado y antigüedad reales. No se muestran especies o prioridades que no se registraron en `hallazgos`.

## Tecnología y comportamiento

`GET /api/admin/dashboard` exige autorización administrativa en servidor. Recibe `period` (`7d`, `30d`, `90d`, `12m`), `clientId` y `siteId`, valida UUID y pertenencia Sede–Cliente. Consultas agregadas acotadas, sin nuevas tablas ni migraciones y sin descargar todo el historial al navegador. La consulta se cancela si cambian filtros o se abandona la página; una respuesta obsoleta no reemplaza el resultado actual.

Gráficas: ECharts 6 + Vue ECharts 8 con SVG modular y carga diferida del componente. Colores tomados de los tokens semánticos del sistema; reactivos al selector Claro/Oscuro/Sistema mediante `useAppStore().resolvedTheme`, también al cambiar la apariencia del dispositivo. Tooltips y cifras accesibles, `es-CO`, COP y fechas Bogotá. Respeta `prefers-reduced-motion`.

Los informes históricos de servicio conservan sus gráficas SVG existentes; no se duplican sus cálculos en la SPA. En móvil los registros se convierten en tarjetas compactas y las gráficas quedan apiladas. Los vínculos hacia hallazgos permiten abrir la pestaña correcta en la Sede.

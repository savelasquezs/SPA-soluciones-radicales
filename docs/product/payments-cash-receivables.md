# Pagos, cartera y caja — V1

## Alcance aprobado
Una sola cuenta por Cliente (Negocio o Casa) suma servicios principales de todas sus Sedes.
El Administrador configura **Por servicio** o **Crédito**, con plazo de 0–365 días.
Crédito significa que el servicio realizado queda por cobrar y puede pagarse después,
incluso junto con otros servicios en un único pago. **No** se cobran automáticamente
mensualidades fijas: el cliente aún debe confirmar si utiliza contratos de cuota fija.

## Cuatro magnitudes distintas
1. **Venta/servicio realizado:** `FINALIZADO`, valor histórico de la visita. Los
   `PROGRAMADO`/`EN_PROCESO` no son venta. Refuerzos cuestan cero.
2. **Cartera:** valor de Principales finalizados menos abonos confirmados asociados a ellos.
   La cartera se consolida por Cliente, sin multiplicar el pago por número de Sedes.
3. **Recaudo:** un registro en `pagos` por recepción real, con `pago_aplicaciones`
   a uno o varios servicios. Cada abono es entero positivo en COP, menor o igual al
   disponible tras descontar confirmados **y reportes pendientes**.
4. **Caja:** pagos en efectivo confirmados atribuidos a Técnicos, menos entregas
   no anuladas; un cobro capturado directamente por Administrador entra en caja central.
   Las transferencias nunca aumentan el efectivo.

Un pago por transferencia o efectivo reportado por Técnico queda `PENDIENTE` hasta
validación administrativa. Para transferencia del Técnico se exige fotografía de comprobante;
el sistema no interpreta la imagen como recepción bancaria confirmada. La falta de
confirmación no aumenta la caja. Un pago anticipado de una visita programada puede
existir; aparece como anticipo y solo se convierte en recaudo aplicado a venta cuando
el servicio pasa a Finalizado. No se genera cargo duplicado.

## Recorridos
- Administración → Pagos y caja → Cartera: consultar Cliente y todos sus servicios,
  cambiar modalidad/plazo, registrar un pago y distribuirlo entre varias visitas.
- Administración → Movimientos: revisar cobros técnicos pendientes, consultar
  comprobantes privados, confirmar o rechazar. Para anular un pago confirmado
  se exige motivo y saldo técnico disponible si era efectivo recibido por él.
- Administración → Caja por técnico: ver efectivo acumulado de cualquier fecha,
  recibir entrega total o parcial, dejar observación y anular con motivo.
- Técnico → trabajo de campo / cierre: reportar efectivo o transferencia de una
  visita asignada Principal iniciada o finalizada; solo reporta, no confirma.
- Técnico → Mi caja: ve el efectivo confirmado, entregas, saldo y sus reportes,
  con reintento de subida de comprobante si se interrumpió el primer intento.
- Cliente/Sede → Historial del servicio → Ver pagos y abonos: acceso contextual
  sin crear un sistema contable separado.

## Integridad, seguridad y reintentos
- PostgreSQL es la fuente de verdad; no guardar saldos mutables ni un segundo valor
  de "deuda" en el Cliente. Los saldos se calculan desde visitas y aplicaciones.
- En cada pago: validar Cliente–Sede–Servicio, rechazar Refuerzos y cancelados,
  montos excesivos y duplicación de aplicación, bloquear filas para concurrencia.
- Una operación tiene `requestId` estable; reintentar no debe volver a cobrar.
- Las entregas se almacenan en la tabla histórica `movimientos_efectivo`;
  la caja es acumulada y no se pone en cero al cambiar el día.
- Las anulaciones conservan movimientos originales, actor, fecha y motivo;
  no se eliminan pagos ni entregas físicamente.
- La autorización se decide en API, en PostgreSQL/RLS y por rol activo.
  La cuenta pública del Cliente no obtiene acceso a la cartera. Comprobantes en
  Cloudflare R2 se devuelven solo con URLs privadas autorizadas de corta vida.
- Las mutaciones de dinero exigen conexión y confirmación de servidor;
  no se duplican dentro de la outbox de visitas MIP. Un cierre técnico offline
  no debe tomarse como un pago recibido ni cerrar caja anticipadamente.
- El editor anterior de pago del Servicio no puede cambiar silenciosamente un
  pago con movimiento en el ledger; correcciones siempre desde Pagos y caja.
- Pagos originales anteriores a la migración se incorporan una única vez por
  Servicio para mantener el acumulado y evitar cobro repetido.

## Límites acordados
- No hay facturación electrónica, contrato de cuota fija, impuestos, inventario,
  conciliación bancaria automática, intereses, notas crédito ni egresos de caja central.
- No hay pagos mixtos dentro de un *único* registro: efectivo y transferencia se
  registran como dos abonos separados, cada uno con su medio y receptor.
- El indicador **Recibido en caja central** representa entradas acumuladas de
  efectivo; no es un saldo bancario ni una caja física arqueada tras egresos.
- La fecha de vencimiento de una visita se calcula desde su fin real y el plazo
  configurado actualmente; las condiciones históricas contractuales aún no están
  versionadas. No emite avisos de cobro automáticos.
- No crear saldos arbitrarios/manuales, salvo una eventual migración de cartera
  inicial sustentada y aprobada antes del uso productivo.

## Pruebas antes de desplegar
- Migración en BD efímera, respaldo y reconciliación de servicios pagados.
- Cliente multi-sede, pago por varias visitas, abono parcial y pago anticipado.
- Confirmación/rechazo/anulación y foto R2 con destinatario autorizado.
- Cobro simultáneo de dos técnicos sin exceder el precio.
- Efectivo recibido por Administrador frente a Técnico con dos roles.
- Entrega parcial e intento duplicado y anulación auditada.
- Historial previo y posteriores cambios de estado de servicio.
- Pantalla responsive, accesibilidad, roles, JWT renovado y pruebas E2E.
- No ejecutar cobros reales ni aplicar migración a producción por este PR.

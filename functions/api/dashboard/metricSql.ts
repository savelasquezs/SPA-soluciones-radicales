/** Shared SQL predicates keep metric counts and destinations consistent. */
export const bogotaToday = "(now() at time zone 'America/Bogota')::date"
export const todayStart = '('+bogotaToday+"::timestamp at time zone 'America/Bogota')"
export const tomorrowStart = '(('+bogotaToday+"+1)::timestamp at time zone 'America/Bogota')"
export const serviceMetricSql = {
  today: "s.estado in ('PROGRAMADO','EN_PROCESO','FINALIZADO') and s.inicio_programado>="+todayStart+' and s.inicio_programado<'+tomorrowStart,
  delayed: "s.estado='PROGRAMADO' and s.inicio_programado<now()-interval '15 minutes'",
  performed: "s.estado='FINALIZADO'",
  unpaid: "s.estado='FINALIZADO' and s.valor_servicio>0 and s.estado_pago<>'CONFIRMADO'",
  calendarError: "s.calendar_sync_estado='ERROR'",
  next: "s.estado in ('PROGRAMADO','EN_PROCESO') and (s.estado='EN_PROCESO' or s.inicio_programado>=now()-interval '12 hours')",
  recent: "s.estado='FINALIZADO'",
} as const
export type ServiceDashboardMetric = keyof typeof serviceMetricSql
export const serviceMetricsWithoutDates = ['delayed','unpaid','calendarError','next','recent'] as const

export const actionableUpcomingSql = [
  'se.activo and n.activo and p.servicio_agendado_id is null',
  "p.estado in ('PENDIENTE','CONTACTADO','CONFIRMADO','POSPUESTO')",
  "p.fecha_sugerida < (("+bogotaToday+"+7)::timestamp at time zone 'America/Bogota')",
  '(p.fecha_recontacto is null or p.fecha_recontacto<='+bogotaToday+')',
].join(' and ')

export const unresolvedFindingsSql = "h.estado in ('ABIERTO','EN_PROCESO')"

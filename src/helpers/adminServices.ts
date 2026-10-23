import type { AdminService, ServiceEditorDraft, ServiceErrors, ServiceFilter, ServiceInput, ServiceLink, ServiceSchedule, ServiceScheduleDraft, ServiceSite } from '../types/adminServices'

export const SERVICE_TIMEZONE = 'America/Bogota'
export const REINFORCEMENT_DAYS = 21
export const SERVICE_STATE_LABELS = { PROGRAMADO: 'Programado', EN_PROCESO: 'En proceso', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado' } as const
export const FOLLOW_UP_LABELS = { PENDIENTE: 'Pendiente', CONTACTADO: 'Contactado', CONFIRMADO: 'Confirmado', POSPUESTO: 'Pospuesto', NO_DESEA: 'No desea' } as const
export const PAYMENT_LABELS = { SIN_REGISTRAR: 'Sin registrar', PENDIENTE: 'Por cobrar', CONFIRMADO: 'Confirmado', RECHAZADO: 'Rechazado' } as const
export const MAIL_LABELS = { SIN_ENVIAR: 'Sin enviar', PENDIENTE: 'En cola', ENVIADO: 'Enviado', ERROR: 'No enviado', INCIERTO: 'Revisar en Gmail' } as const

export function isServiceId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function isZonedInstant(value: unknown): value is string {
  return typeof value === 'string' && isDateOnly(value.slice(0, 10))
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && Number.isFinite(new Date(value).getTime())
}
export function todayBogota(now = new Date()): string {
  return new Date(now.getTime() - 5 * 60 * 60_000).toISOString().slice(0, 10)
}
export function addDateDays(date: string, days: number): string {
  if (!isDateOnly(date) || !Number.isInteger(days)) return ''
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}
export function toBogotaInput(instant: string): string {
  if (!isZonedInstant(instant)) return ''
  return new Date(new Date(instant).getTime() - 5 * 60 * 60_000).toISOString().slice(0, 16)
}
export function fromBogotaInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) || !isDateOnly(value.slice(0, 10))) return ''
  return new Date(`${value}:00-05:00`).toISOString()
}
export function addInstantDays(instant: string, days: number): string {
  return isZonedInstant(instant) ? new Date(new Date(instant).getTime() + days * 86_400_000).toISOString() : ''
}
export function scheduleEnd(schedule: Pick<ServiceSchedule, 'inicioProgramado' | 'duracionMinutos'>): string {
  return isZonedInstant(schedule.inicioProgramado) && Number.isSafeInteger(schedule.duracionMinutos) && schedule.duracionMinutos > 0
    ? new Date(new Date(schedule.inicioProgramado).getTime() + schedule.duracionMinutos * 60_000).toISOString() : ''
}
export function suggestReinforcement(schedule: ServiceSchedule): ServiceSchedule {
  return { ...schedule, inicioProgramado: addInstantDays(schedule.inicioProgramado, REINFORCEMENT_DAYS), tecnicosColaboradoresIds: [...schedule.tecnicosColaboradoresIds] }
}
export function scheduleFromRecord(record: ServiceLink): ServiceSchedule {
  return {
    inicioProgramado: record.inicioProgramado,
    duracionMinutos: Math.round((new Date(record.finProgramado).getTime() - new Date(record.inicioProgramado).getTime()) / 60_000),
    tecnicoResponsableId: record.tecnicoResponsableId,
    tecnicosColaboradoresIds: [...record.tecnicosColaboradoresIds],
  }
}
export function scheduleToDraft(schedule: ServiceSchedule): ServiceScheduleDraft {
  return { ...schedule, inicioProgramado: toBogotaInput(schedule.inicioProgramado), duracionMinutos: String(schedule.duracionMinutos), tecnicosColaboradoresIds: [...schedule.tecnicosColaboradoresIds] }
}
export function scheduleFromDraft(draft: ServiceScheduleDraft): ServiceSchedule {
  return { ...draft, inicioProgramado: fromBogotaInput(draft.inicioProgramado), duracionMinutos: Number(draft.duracionMinutos), tecnicosColaboradoresIds: [...draft.tecnicosColaboradoresIds] }
}
export function emptyServiceDraft(site?: ServiceSite, now = new Date()): ServiceEditorDraft {
  const schedule: ServiceSchedule = {
    inicioProgramado: fromBogotaInput(`${addDateDays(todayBogota(now), 1)}T09:00`),
    duracionMinutos: site?.duracionServicioMinutos ?? 90, tecnicoResponsableId: '', tecnicosColaboradoresIds: [],
  }
  return { sedeId: site?.id ?? '', valorServicio:site?.tipoSede==='RESIDENCIAL' && site.valorServicio != null ? String(site.valorServicio) : '', programacion: scheduleToDraft(schedule), refuerzo: site?.manejaRefuerzo ? scheduleToDraft(suggestReinforcement(schedule)) : null, productos: [], cobro: { metodoPago: null, tecnicoRecaudoPrevistoId: null, pagado:false,recaudadoPorId:null }, observaciones: '' }
}
export function serviceToDraft(record: AdminService): ServiceEditorDraft {
  return {
    sedeId: record.sedeId, valorServicio:String(record.valorServicio), programacion: scheduleToDraft(scheduleFromRecord(record)),
    refuerzo: record.refuerzo?.estado === 'PROGRAMADO' ? scheduleToDraft(scheduleFromRecord(record.refuerzo)) : null,
    productos: record.productos.map(({ productoId, lote, fechaVencimiento }) => ({ productoId, lote, fechaVencimiento })),
    cobro: { metodoPago: record.pago.metodoPago, tecnicoRecaudoPrevistoId: record.pago.tecnicoRecaudoPrevistoId, pagado:record.pago.estadoPago==='CONFIRMADO',recaudadoPorId:record.pago.recaudadoPorId }, observaciones: record.observaciones,
  }
}
export function draftToServiceInput(draft: ServiceEditorDraft): ServiceInput {
  return { ...draft, valorServicio: draft.valorServicio?.trim() ? Number(draft.valorServicio) : null, programacion: scheduleFromDraft(draft.programacion), refuerzo: draft.refuerzo ? scheduleFromDraft(draft.refuerzo) : null, productos: draft.productos.map(product => ({ productoId:product.productoId, lote:product.lote, fechaVencimiento:product.fechaVencimiento || null })) }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export function validateSchedule(value: unknown, prefix = 'programacion'): { value: ServiceSchedule; errors: ServiceErrors } {
  const input = object(value), errors: ServiceErrors = {}
  const start = typeof input.inicioProgramado === 'string' ? input.inicioProgramado : ''
  const duration = typeof input.duracionMinutos === 'number' ? input.duracionMinutos : NaN
  const responsible = typeof input.tecnicoResponsableId === 'string' ? input.tecnicoResponsableId : ''
  const collaborators = Array.isArray(input.tecnicosColaboradoresIds) ? input.tecnicosColaboradoresIds : []
  if (!isZonedInstant(start)) errors[`${prefix}.inicioProgramado`] = 'Ingresa una fecha y hora válidas.'
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 10_080) errors[`${prefix}.duracionMinutos`] = 'Usa una duración entre 1 y 10.080 minutos.'
  if (!isServiceId(responsible)) errors[`${prefix}.tecnicoResponsableId`] = 'Selecciona un responsable.'
  if (!Array.isArray(input.tecnicosColaboradoresIds) || collaborators.length > 100 || collaborators.some(id => !isServiceId(id))) errors[`${prefix}.tecnicosColaboradoresIds`] = 'Revisa los colaboradores seleccionados.'
  else if (new Set(collaborators).size !== collaborators.length || collaborators.includes(responsible)) errors[`${prefix}.tecnicosColaboradoresIds`] = 'El responsable no se repite como colaborador; cada técnico se selecciona una sola vez.'
  return { value: { inicioProgramado: isZonedInstant(start) ? new Date(start).toISOString() : '', duracionMinutos: duration, tecnicoResponsableId: responsible, tecnicosColaboradoresIds: collaborators.filter(isServiceId) }, errors }
}
export function validateServiceInput(value: unknown, requireFuture = false, now = new Date(), requireResidentialPrice = false): { value: ServiceInput; errors: ServiceErrors } {
  const input = object(value), parsed = validateSchedule(input.programacion), errors: ServiceErrors = { ...parsed.errors }
  const refuerzo = input.refuerzo == null ? null : validateSchedule(input.refuerzo, 'refuerzo')
  if (refuerzo) Object.assign(errors, refuerzo.errors)
  if (requireFuture) {
    for (const [prefix,schedule] of [['programacion',parsed.value],['refuerzo',refuerzo?.value]] as const) {
      if (schedule?.inicioProgramado && new Date(schedule.inicioProgramado).getTime() <= now.getTime()) {
        errors[prefix+'.inicioProgramado'] = 'Selecciona una fecha y hora posteriores al momento actual.'
      }
    }
  }
  const sedeId = typeof input.sedeId === 'string' ? input.sedeId : ''
  if (!isServiceId(sedeId)) errors.sedeId = 'Selecciona una sede.'
  const valorServicio = input.valorServicio == null ? null : input.valorServicio
  if (valorServicio !== null && (typeof valorServicio !== 'number' || !Number.isSafeInteger(valorServicio) || valorServicio < 0)) {
    errors.valorServicio = 'Ingresa un valor en pesos válido, sin decimales.'
  }
  if (requireResidentialPrice && valorServicio === null) errors.valorServicio = 'Ingresa el valor del servicio residencial.'
  const products = Array.isArray(input.productos) ? input.productos : []
  if (!Array.isArray(input.productos) || products.length > 100) errors.productos = 'Revisa los productos previstos.'
  const seen = new Set<string>()
  const productos = products.slice(0, 100).map((raw, index) => {
    const product = object(raw), productoId = typeof product.productoId === 'string' ? product.productoId : ''
    const lote = typeof product.lote === 'string' ? product.lote.trim() : ''
    const fechaVencimiento = product.fechaVencimiento === '' || product.fechaVencimiento == null ? null : String(product.fechaVencimiento)
    if (!isServiceId(productoId) || seen.has(productoId)) errors.productos = 'Selecciona productos válidos sin duplicarlos.'
    seen.add(productoId)
    if (!lote || lote.length > 120) errors[`productos.${index}.lote`] = lote ? 'El lote no puede superar 120 caracteres.' : 'Ingresa el lote previsto.'
    if (!fechaVencimiento || !isDateOnly(fechaVencimiento)) errors[`productos.${index}.fechaVencimiento`] = 'Ingresa una fecha de vencimiento válida.'
    return { productoId, lote, fechaVencimiento }
  })
  const cobro = object(input.cobro)
  const metodoPago = cobro.metodoPago === 'EFECTIVO' || cobro.metodoPago === 'TRANSFERENCIA' ? cobro.metodoPago : null
  if (cobro.metodoPago != null && !metodoPago) errors['cobro.metodoPago'] = 'Selecciona un método válido.'
  const tecnicoRecaudoPrevistoId = typeof cobro.tecnicoRecaudoPrevistoId === 'string' && cobro.tecnicoRecaudoPrevistoId ? cobro.tecnicoRecaudoPrevistoId : null
  if (tecnicoRecaudoPrevistoId && !isServiceId(tecnicoRecaudoPrevistoId)) errors['cobro.tecnicoRecaudoPrevistoId'] = 'Selecciona quién recaudará.'
  if (metodoPago !== 'EFECTIVO' && tecnicoRecaudoPrevistoId) errors['cobro.tecnicoRecaudoPrevistoId'] = 'El recaudo técnico solo aplica a efectivo.'
  if (cobro.pagado !== undefined && typeof cobro.pagado !== 'boolean') errors['cobro.pagado'] = 'Confirma si el cliente ya pagó.'
  const pagado = cobro.pagado === true
  const recaudadoPorId = typeof cobro.recaudadoPorId === 'string' && cobro.recaudadoPorId ? cobro.recaudadoPorId : null
  if (pagado && !metodoPago) errors['cobro.metodoPago'] = 'Selecciona cómo pagó el cliente.'
  if (pagado && metodoPago === 'EFECTIVO' && !recaudadoPorId) errors['cobro.recaudadoPorId'] = 'Selecciona quién recibió el efectivo.'
  if (recaudadoPorId && !isServiceId(recaudadoPorId)) errors['cobro.recaudadoPorId'] = 'Selecciona quién recibió el efectivo.'
  if ((metodoPago !== 'EFECTIVO' || !pagado) && recaudadoPorId) errors['cobro.recaudadoPorId'] = 'El receptor solo se registra para efectivo pagado.'
  if (pagado && tecnicoRecaudoPrevistoId) errors['cobro.tecnicoRecaudoPrevistoId'] = 'Un pago confirmado no necesita recaudador previsto.'
  const observaciones = typeof input.observaciones === 'string' ? input.observaciones.trim() : ''
  if (observaciones.length > 5_000) errors.observaciones = 'Usa máximo 5.000 caracteres.'
  return { value: { sedeId, valorServicio: typeof valorServicio === 'number' ? valorServicio : null, programacion: parsed.value, refuerzo: refuerzo?.value ?? null, productos, cobro: { metodoPago, tecnicoRecaudoPrevistoId, pagado, recaudadoPorId }, observaciones }, errors }
}
export function normalizeServiceSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es')
}
export function matchesServiceFilter(service: AdminService, filter: ServiceFilter): boolean {
  const day = toBogotaInput(filter.tab === 'history' ? serviceHistoryDate(service) : service.inicioProgramado).slice(0, 10)
  return (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to)
    && (!filter.clientId || service.clientId === filter.clientId)
    && (!filter.siteId || service.sedeId === filter.siteId)
    && (filter.tab !== 'history' || ['FINALIZADO', 'CANCELADO'].includes(service.estado))
    && (!filter.estado || service.estado === filter.estado) && (!filter.tipo || service.tipoServicio === filter.tipo)
    && (!filter.tecnicoId || service.tecnicoResponsableId === filter.tecnicoId || service.tecnicosColaboradoresIds.includes(filter.tecnicoId))
    && (!filter.query || normalizeServiceSearch(`${service.clienteNombre} ${service.sedeNombre} ${service.solicitud} ${service.direccion}`).includes(normalizeServiceSearch(filter.query)))
}
type HistoricalService = Pick<AdminService, 'id' | 'inicioProgramado'> & Partial<Pick<AdminService, 'finReal' | 'canceladoAt'>>
export function serviceHistoryDate(service: HistoricalService): string {
  return service.finReal ?? service.canceladoAt ?? service.inicioProgramado
}
export function compareServiceHistory(a: HistoricalService, b: HistoricalService): number {
  return Date.parse(serviceHistoryDate(b)) - Date.parse(serviceHistoryDate(a)) || b.id.localeCompare(a.id)
}
export function compareServices(a: AdminService, b: AdminService, history = false): number {
  if (history) return compareServiceHistory(a, b)
  const order = { EN_PROCESO: 0, PROGRAMADO: 1, FINALIZADO: 2, CANCELADO: 3 }
  return new Date(a.inicioProgramado).getTime() - new Date(b.inicioProgramado).getTime() || order[a.estado] - order[b.estado] || a.id.localeCompare(b.id)
}
export function formatServiceDate(value: string, timeOnly = false): string {
  if (!isZonedInstant(value)) return '—'
  return new Intl.DateTimeFormat('es-CO', { timeZone: SERVICE_TIMEZONE, ...(timeOnly ? { hour: '2-digit', minute: '2-digit' } as const : { day: '2-digit', month: 'short', year: 'numeric' } as const) }).format(new Date(value))
}
export function formatServiceMoney(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
}

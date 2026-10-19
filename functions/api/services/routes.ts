import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { PoolClient } from 'pg'
import type { FollowUpState, ServiceFilter, ServiceMutation, ServicePaymentInput, ServiceReassignment, UpcomingFilter, UpcomingPatch } from '../../../src/types/adminServices'
import { addDateDays, isDateOnly, isServiceId, todayBogota, validateSchedule, validateServiceInput } from '../../../src/helpers/adminServices'
import { ApiError, requireAdmin, type DomainProfile, type Identity } from '../auth'
import { transaction } from '../db'
import { cancelService, command, confirmationEmail, createService, editService, queueConfirmationEmail, rescheduleService, retryCalendar, savePayment, updateUpcoming } from './commands'
import { kickServiceJobs } from './jobs'
import { getService, getUpcoming, listServices, listUpcoming, pendingCount, workspace } from './queries'
import { releaseTechnicianServiceLock } from '../technician-services/commands'

type Environment = { Variables: { identity: Identity } }
export const adminServiceRoutes = new Hono<Environment>()
adminServiceRoutes.use('*',bodyLimit({ maxSize:200_000,onError:context=>context.json({ error:'La información enviada supera el tamaño permitido.',code:'VALIDATION' },413) }))
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400,'La información enviada no es válida.','VALIDATION')
  return value as Record<string,unknown>
}
async function body(request: Request): Promise<Record<string,unknown>> {
  try { return object(await request.json()) }
  catch { throw new ApiError(400,'La información enviada no es válida.','VALIDATION') }
}
function id(value: unknown): string {
  if (!isServiceId(value)) throw new ApiError(422,'El identificador no es válido.','VALIDATION')
  return value
}
function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new ApiError(422,'Carga la versión actual del registro antes de modificarlo.','VALIDATION')
  return value
}
function text(value: unknown, max = 5_000, required = false): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (result.length > max || (required && !result)) throw new ApiError(422,'Revisa el texto y los campos obligatorios.','VALIDATION')
  return result
}
function choice<const T extends string>(value: unknown, values: readonly T[], fallback?: T): T {
  if (typeof value === 'string' && values.includes(value as T)) return value as T
  if ((value == null || value === '') && fallback !== undefined) return fallback
  throw new ApiError(422,'El filtro o estado seleccionado no es válido.','VALIDATION')
}
function pageNumber(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new ApiError(422,'La paginación no es válida.','VALIDATION')
  return parsed
}
function dates(query: Record<string,string>, fallbackFrom: string): { from: string; to: string } {
  const from = query.from || fallbackFrom, to = query.to || addDateDays(todayBogota(),30)
  if (!isDateOnly(from) || !isDateOnly(to) || from > to || (new Date(to).getTime()-new Date(from).getTime())/86_400_000 > 3660) throw new ApiError(422,'Selecciona un rango válido de hasta diez años.','VALIDATION',{ fields:{ range:'La fecha final debe ser posterior a la inicial y el rango no debe superar diez años.' } })
  return { from,to }
}
function listFilter(query: Record<string,string>): ServiceFilter {
  return { ...dates(query,todayBogota()),tab:choice(query.tab,['agenda','history'],'agenda'),
    estado:choice(query.estado,['','PROGRAMADO','EN_PROCESO','FINALIZADO','CANCELADO'],''),tipo:choice(query.tipo,['','PRINCIPAL','REFUERZO'],''),
    tecnicoId:query.tecnicoId ? id(query.tecnicoId) : '',query:text(query.query,160),
    clientId:query.clientId ? id(query.clientId) : undefined,
    siteId:query.siteId ? id(query.siteId) : undefined,
    metric:choice(query.metric,['','today','delayed','performed','unpaid','calendarError','next','recent'],'') || undefined,
    page:pageNumber(query.page,1,100_000),pageSize:pageNumber(query.pageSize,25,100) }
}
/** Contextual history includes all service states and has no implicit date cutoff. */
function contextFilter(query: Record<string,string>): ServiceFilter {
  if (Boolean(query.clientId) === Boolean(query.siteId)) throw new ApiError(422,'Selecciona un Cliente o una Sede.','VALIDATION')
  const bounded=Boolean(query.from || query.to)
  if (bounded && (!query.from || !query.to)) throw new ApiError(422,'Completa ambas fechas del filtro.','VALIDATION')
  const base=listFilter({ ...query,tab:'agenda',from:query.from || todayBogota(),to:query.to || todayBogota() })
  return { ...base,from:bounded ? base.from : '',to:bounded ? base.to : '',
    clientId:query.clientId ? id(query.clientId) : undefined,
    siteId:query.siteId ? id(query.siteId) : undefined }
}
function upcomingFilter(query: Record<string,string>): UpcomingFilter {
  return { ...dates(query,addDateDays(todayBogota(),-30)),
    estado:choice(query.estado,['','PENDIENTE','CONTACTADO','CONFIRMADO','POSPUESTO','NO_DESEA'],''),
    query:text(query.query,160),clientId:query.clientId ? id(query.clientId) : undefined,
    siteId:query.siteId ? id(query.siteId) : undefined,
    metric:choice(query.metric,['','actionable'],'') || undefined,
    page:pageNumber(query.page,1,100_000),pageSize:pageNumber(query.pageSize,25,100) }
}
async function read<T>(context: Context<Environment>, work: (client: PoolClient, admin: DomainProfile) => Promise<T>): Promise<T> {
  return transaction(async client => work(client,await requireAdmin(client,context.get('identity'))))
}
async function write<T>(context: Context<Environment>, payload: Record<string,unknown>, operation: string, work: (client: PoolClient, admin: DomainProfile) => Promise<T>): Promise<T> {
  const result = await transaction(async client => {
    const admin = await requireAdmin(client,context.get('identity'))
    return command(client,admin.id,id(payload.requestId),operation,payload,()=>work(client,admin))
  })
  kickServiceJobs()
  return result
}
function serviceInput(value: unknown, requireFuture = false) {
  const parsed = validateServiceInput(value,requireFuture)
  if (Object.keys(parsed.errors).length) throw new ApiError(422,'Revisa los campos marcados.','VALIDATION',{ fields:parsed.errors })
  return parsed.value
}
function scheduleInput(value: unknown, prefix = 'programacion') {
  const parsed = validateSchedule(value,prefix)
  if (Object.keys(parsed.errors).length) throw new ApiError(422,'Revisa las fechas y el equipo.','VALIDATION',{ fields:parsed.errors })
  return parsed.value
}

function reassignmentsInput(value:unknown):ServiceReassignment[] {
  if(value==null)return []
  if(!Array.isArray(value) || value.length>20)throw new ApiError(422,'La reasignación de servicios no es válida.','VALIDATION')
  return value.map(entry=>{
    const item=object(entry)
    return {id:id(item.id),version:version(item.version),programacion:scheduleInput(item.programacion)}
  })
}
adminServiceRoutes.get('/workspace',async context => context.json(await read(context,workspace)))
adminServiceRoutes.get('/pending-count',async context => context.json({ count:await read(context,pendingCount) }))
adminServiceRoutes.get('/commands/:id',async context => {
  const requestId=id(context.req.param('id'))
  return context.json(await read(context,async (client,admin)=>{
    const { rows }=await client.query<{ result: ServiceMutation }>("select result from private.service_admin_commands where request_id=$1 and actor_id=$2 and operation='service:create'",[requestId,admin.id])
    return { result:rows[0]?.result ?? null }
  }))
})
adminServiceRoutes.get('/upcoming',async context => context.json(await read(context,client=>listUpcoming(client,upcomingFilter(context.req.query())))))
adminServiceRoutes.get('/upcoming/:id',async context => context.json(await read(context,client=>getUpcoming(client,id(context.req.param('id'))))))
adminServiceRoutes.get('/upcoming/:id/email-preview',async context => {
  const record = await read(context,client=>getUpcoming(client,id(context.req.param('id'))))
  return context.json({ upcoming:record,email:confirmationEmail(record) })
})
adminServiceRoutes.patch('/upcoming/:id',async context => {
  const payload=await body(context.req.raw), recordId=id(context.req.param('id'))
  const state: FollowUpState=choice(payload.estado,['PENDIENTE','CONTACTADO','CONFIRMADO','POSPUESTO','NO_DESEA'])
  const recontact=payload.fechaRecontacto === '' || payload.fechaRecontacto == null ? null : String(payload.fechaRecontacto)
  if ((state==='POSPUESTO' && !recontact) || (recontact && !isDateOnly(recontact))) throw new ApiError(422,'Indica cuándo volver a contactar.','VALIDATION',{ fields:{ fechaRecontacto:'Selecciona una fecha de recontacto válida.' } })
  const input: UpcomingPatch={ estado:state,fechaRecontacto:recontact,nota:text(payload.nota),contactoRealizado:payload.contactoRealizado == null ? null : choice(payload.contactoRealizado,['WHATSAPP','CORREO']) }
  return context.json(await write(context,payload,`upcoming:update:${recordId}`,(client,admin)=>updateUpcoming(client,admin.id,recordId,version(payload.version),input)))
})
adminServiceRoutes.post('/upcoming/:id/email',async context => {
  const payload=await body(context.req.raw), recordId=id(context.req.param('id'))
  return context.json(await write(context,payload,`upcoming:email:${recordId}`,(client,admin)=>queueConfirmationEmail(client,admin.id,recordId,version(payload.version),id(payload.requestId),text(payload.recipient,254,true),payload.reviewedUnknown === true,payload.resend === true)),202)
})
adminServiceRoutes.get('/',async context => context.json(await read(context,client=>listServices(client,listFilter(context.req.query())))))
adminServiceRoutes.get('/context',async context => context.json(await read(context,client=>listServices(client,contextFilter(context.req.query())))))
adminServiceRoutes.get('/:id',async context => context.json(await read(context,client=>getService(client,id(context.req.param('id'))))))
adminServiceRoutes.get('/:id/audit',async context => {
  const recordId=id(context.req.param('id')), page=pageNumber(context.req.query('page'),1,100_000)
  const result=await read(context,async client=>{
    await getService(client,recordId)
    const count=(await client.query<{ total: number }>("select count(*)::integer as total from public.auditoria where entidad='Servicios' and registro_id=$1",[recordId])).rows[0]?.total ?? 0
    const { rows }=await client.query(`select a.id,a.fecha_hora as "fechaHora",u.nombre_completo as "usuarioNombre",a.accion,a.detalle_json as detalle
      from public.auditoria a join public.usuarios u on u.id=a.usuario_id where a.entidad='Servicios' and a.registro_id=$1
      order by a.fecha_hora desc,a.id desc limit 20 offset $2`,[recordId,(page-1)*20])
    return { items:rows,total:count,page,pageSize:20 }
  })
  return context.json(result)
})
adminServiceRoutes.post('/',async context => {
  const payload=await body(context.req.raw), input=serviceInput(payload.input,true)
  const proposal=payload.upcoming == null ? null : object(payload.upcoming)
  return context.json(await write(context,payload,'service:create',(client,admin)=>createService(client,admin.id,input,reassignmentsInput(payload.reassignments),proposal ? { id:id(proposal.id),version:version(proposal.version),confirmed:proposal.confirmed === true } : undefined)),201)
})
adminServiceRoutes.put('/:id',async context => {
  const payload=await body(context.req.raw), recordId=id(context.req.param('id')), input=serviceInput(payload.input)
  return context.json(await write(context,payload,`service:edit:${recordId}`,(client,admin)=>editService(client,admin.id,recordId,version(payload.version),input,reassignmentsInput(payload.reassignments),input.refuerzo ? version(payload.reinforcementVersion) : undefined)))
})
adminServiceRoutes.post('/:id/reschedule',async context => {
  const payload=await body(context.req.raw), recordId=id(context.req.param('id')), schedule=scheduleInput(payload.programacion)
  const child=payload.refuerzo == null ? null : object(payload.refuerzo)
  return context.json(await write(context,payload,`service:reschedule:${recordId}`,(client,admin)=>rescheduleService(client,admin.id,recordId,version(payload.version),schedule,reassignmentsInput(payload.reassignments),
    child ? { version:version(child.version),schedule:scheduleInput(child.programacion,'refuerzo') } : undefined)))
})
adminServiceRoutes.post('/:id/cancel',async context => {
  const payload=await body(context.req.raw), recordId=id(context.req.param('id'))
  if (!text(payload.reason)) throw new ApiError(422,'Indica el motivo de cancelación.','VALIDATION',{ fields:{ reason:'El motivo es obligatorio.' } })
  return context.json(await write(context,payload,`service:cancel:${recordId}`,(client,admin)=>cancelService(client,admin.id,recordId,version(payload.version),text(payload.reason,5_000,true))))
})
adminServiceRoutes.post('/:id/payment',async context => {
  const payload=await body(context.req.raw), recordId=id(context.req.param('id')), value=object(payload.input)
  const input: ServicePaymentInput={ metodoPago:choice(value.metodoPago,['EFECTIVO','TRANSFERENCIA']),estadoPago:choice(value.estadoPago,['PENDIENTE','CONFIRMADO','RECHAZADO']),recaudadoPorId:value.recaudadoPorId ? id(value.recaudadoPorId) : null,motivo:text(value.motivo) }
  return context.json(await write(context,payload,`service:payment:${recordId}`,(client,admin)=>savePayment(client,admin.id,recordId,version(payload.version),input)))
})
adminServiceRoutes.post('/:id/calendar/retry',async context => {
  const payload=await body(context.req.raw), recordId=id(context.req.param('id'))
  return context.json(await write(context,payload,`service:calendar:${recordId}`,(client,admin)=>retryCalendar(client,admin.id,recordId)),202)
})
adminServiceRoutes.post('/:id/execution-lock/release',async context => {
  const payload=await body(context.req.raw), recordId=id(context.req.param('id')), reason=text(payload.reason,5_000,true)
  return context.json(await write(context,payload,`service:execution-lock:release:${recordId}`,(client,admin)=>releaseTechnicianServiceLock(client,admin.id,recordId,reason)))
})
adminServiceRoutes.onError((error,context)=>{
  if (error instanceof ApiError) return context.json({ error:error.message,code:error.code,details:error.details },error.status as ContentfulStatusCode)
  const code=(error as Error & { code?: string }).code
  if (code==='23505') return context.json({ error:'La operación ya existe o la próxima visita ya fue agendada. Actualiza el registro.',code:'DUPLICATE' },409)
  if (code==='40001' || code==='40P01') return context.json({ error:'Hubo un cambio simultáneo. Tus datos se conservan; vuelve a intentar.',code:'CONCURRENT_WRITE' },409)
  if (['23503','23514','23502','22P02','22007','22008','P0001'].includes(code ?? '')) return context.json({ error:'No se pudo guardar con los datos actuales. Revisa la programación, el equipo y los registros relacionados.',code:'VALIDATION' },422)
  console.error('ADMIN_SERVICES_ERROR',{ code:code ?? 'UNEXPECTED' })
  return context.json({ error:'No fue posible completar la operación. Tus datos se conservan; intenta nuevamente.',code:'UNEXPECTED' },500)
})

import { waitUntil } from '@neon/functions'
import type { PoolClient } from 'pg'
import type { ConfirmationEmail } from '../../../src/types/adminServices'
import { isServiceId } from '../../../src/helpers/adminServices'
import { ApiError } from '../auth'
import { transaction } from '../db'
import { sendGmailMessage, upsertCalendarEvent } from '../google'
import { audit } from './commands'
import { getCalendarSnapshot } from './queries'
import { generateReportForService } from '../reports/pipeline'

interface JobPayload {
  scope: 'ADMIN_SERVICES' | 'SERVICE_REPORT'
  actorId: string
  serviceId?: string
  revision?: number
  upcomingId?: string
  email?: ConfirmationEmail
  dispatched?: boolean
}
interface ServiceJob { id: string; job_type: 'CALENDAR' | 'EMAIL' | 'DOCUMENT'; attempts: number; payload: JobPayload }

/** Durable queue: callers invoke this only after the business transaction commits. */
export function kickServiceJobs(): void {
  try { waitUntil(drainServiceJobs().catch(() => { console.error('ADMIN_SERVICE_OUTBOX_UNAVAILABLE') })) }
  catch { console.error('ADMIN_SERVICE_BACKGROUND_UNAVAILABLE') }
}
async function claimJob(): Promise<ServiceJob | null> {
  return transaction(async client => {
    const { rows } = await client.query<ServiceJob>(`select id,job_type,attempts,payload from private.integration_jobs
      where ((payload ->> 'scope' = 'ADMIN_SERVICES' and job_type in ('CALENDAR','EMAIL'))
       or (payload ->> 'scope' = 'SERVICE_REPORT' and job_type = 'DOCUMENT'))
        and ((status in ('PENDING','FAILED') and attempts < 5 and run_after <= now())
          or (status='RUNNING' and lease_until < now()))
      order by run_after,created_at,id for update skip locked limit 1`)
    const job = rows[0]
    if (!job) return null
    await client.query("update private.integration_jobs set status='RUNNING',attempts=attempts+1,lease_until=now()+interval '5 minutes',last_error=null where id=$1",[job.id])
    return { ...job,attempts:job.attempts+1 }
  })
}
async function complete(client: PoolClient, job: ServiceJob, outcome: string): Promise<void> {
  await client.query("update private.integration_jobs set status='COMPLETED',lease_until=null,last_error=null,payload=payload || jsonb_build_object('outcome',$2::text) where id=$1",[job.id,outcome])
}
async function processCalendar(job: ServiceJob): Promise<void> {
  const serviceId = job.payload.serviceId
  if (!isServiceId(serviceId) || !isServiceId(job.payload.actorId)) throw new Error('Invalid durable Calendar job')
  let revision: number | null = null
  try {
    await transaction(async client => {
      // Transaction-level locks are compatible with Neon transaction pooling.
      // Only other Calendar deliveries take this lock, not administrator edits.
      const locked = Boolean((await client.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock(hashtextextended($1,0)) as locked',
        [`admin-service-calendar:${serviceId}`],
      )).rows[0]?.locked)
      if (!locked) {
        await client.query("update private.integration_jobs set status='PENDING',attempts=greatest(attempts-1,0),run_after=now()+interval '15 seconds',lease_until=null where id=$1", [job.id])
        return
      }
      const metadata = await getCalendarSnapshot(client, serviceId)
      const service = metadata.record
      revision = Number(metadata.calendar_revision)
      if (service.calendar.estado === 'SINCRONIZADO' && Number(job.payload.revision) <= revision) {
        await complete(client, job, 'ALREADY_SYNCHRONIZED')
        return
      }
      const eventId = await upsertCalendarEvent({
        serviceId, eventId:metadata.calendar_event_id,
        summary:`${service.tipoServicio === 'REFUERZO' ? 'Refuerzo' : 'MIP'} · ${service.clienteNombre} · ${service.sedeNombre}`,
        description:`${service.solicitud}\nResponsable: ${service.responsable.nombreCompleto}\nColaboradores: ${service.colaboradores.map(person=>person.nombreCompleto).join(', ') || 'Sin colaboradores'}\nTipo: ${service.tipoServicio}`,
        location:service.direccion, start:service.inicioProgramado, end:service.finProgramado,
        attendees:[service.responsable.correoGoogle, ...service.colaboradores.map(person=>person.correoGoogle)],
        cancelled:service.estado === 'CANCELADO',
      })
      // No row lock is held during the bounded provider call. A concurrent
      // schedule edit remains pending and is delivered by its own revision.
      const saved = await client.query(`update public.servicios set calendar_event_id=$2,calendar_sync_estado='SINCRONIZADO',calendar_ultima_sync_at=now(),calendar_sync_error=null
        where id=$1 and calendar_revision=$3 returning id`, [serviceId, eventId, revision])
      await complete(client, job, saved.rowCount ? 'SYNCHRONIZED' : 'SUPERSEDED')
      await audit(client, job.payload.actorId, 'SERVICIO_CALENDAR_INTENTO', serviceId, {
        jobId:job.id, revision, resultado:saved.rowCount ? 'SINCRONIZADO' : 'VERSION_SUPERADA', cancelado:service.estado==='CANCELADO',
      })
    })
  } catch (error) {
    const code = error instanceof ApiError ? error.code ?? 'CALENDAR_UNAVAILABLE' : 'CALENDAR_UNAVAILABLE'
    await transaction(async client => {
      await client.query(`update public.servicios set calendar_sync_estado='ERROR',calendar_sync_error='No fue posible sincronizar Calendar.'
        where id=$1 and calendar_revision=$2 and calendar_sync_estado<>'SINCRONIZADO'`, [serviceId, revision])
      await client.query(`update private.integration_jobs set status='FAILED',lease_until=null,last_error=$2,
        run_after=now()+make_interval(secs => least(3600,60*power(2,least(attempts,6)))::integer) where id=$1`, [job.id, code])
      await audit(client, job.payload.actorId, 'SERVICIO_CALENDAR_INTENTO', serviceId, { jobId:job.id, revision, resultado:'ERROR', code })
    })
  }
}

export function mailFailureState(dispatched: boolean, error: unknown): 'ERROR' | 'INCIERTO' {
  return dispatched && !(error instanceof ApiError && error.code === 'EMAIL_REJECTED') ? 'INCIERTO' : 'ERROR'
}
async function recordEmailOutcome(job: ServiceJob, state: 'ENVIADO' | 'ERROR' | 'INCIERTO' | 'SIN_ENVIAR', messageId?: string): Promise<void> {
  await transaction(async client => {
    await client.query(`update public.proximos_servicios set correo_estado=$2,correo_error=case when $2 in ('ERROR','INCIERTO') then $2::text else null end,
      estado=case when $2='ENVIADO' and estado='PENDIENTE' then 'CONTACTADO' else estado end,
      ultimo_contacto_at=case when $2='ENVIADO' then now() else ultimo_contacto_at end,
      canal_ultimo_contacto=case when $2='ENVIADO' then 'CORREO' else canal_ultimo_contacto end where id=$1`,[job.payload.upcomingId,state])
    await complete(client,job,state)
    await audit(client,job.payload.actorId,'PROXIMO_CORREO_RESULTADO',job.payload.upcomingId!,{ jobId:job.id,estado:state,messageId:messageId ?? null },'Próximos servicios')
  })
}
async function processEmail(job: ServiceJob): Promise<void> {
  if (!isServiceId(job.payload.upcomingId) || !isServiceId(job.payload.actorId) || !job.payload.email) throw new Error('Invalid durable email job')
  // A crashed invocation after dispatch cannot distinguish delivery from timeout.
  if (job.payload.dispatched) { await recordEmailOutcome(job,'INCIERTO'); return }
  let dispatched = false
  try {
    const messageId = await sendGmailMessage({
      ...job.payload.email,messageId:`${job.id}@servicios.solucionesradicales.invalid`,
      onDispatch:async () => {
        await transaction(async client => {
          const eligible = await client.query(`select p.id from public.proximos_servicios p join public.sedes se on se.id=p.sede_id
            join public.negocios n on n.id=se.negocio_id where p.id=$1 and p.servicio_agendado_id is null and p.estado<>'NO_DESEA'
            and se.activo and n.activo for update of p`,[job.payload.upcomingId])
          if (!eligible.rowCount) throw new ApiError(409,'La propuesta ya no requiere contacto.','FOLLOW_UP_RESOLVED')
          await client.query("update private.integration_jobs set payload=payload || '{\"dispatched\":true}'::jsonb where id=$1",[job.id])
        })
        dispatched = true
      },
    })
    await recordEmailOutcome(job,'ENVIADO',messageId)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'FOLLOW_UP_RESOLVED') { await recordEmailOutcome(job,'SIN_ENVIAR'); return }
    // Email retry is an explicit admin action. Leaving this job runnable would
    // race that action and could send the same confirmation twice.
    await recordEmailOutcome(job,mailFailureState(dispatched,error))
  }
}
async function processReport(job: ServiceJob): Promise<void> {
  const serviceId = job.payload.serviceId
  if (!isServiceId(serviceId)) throw new Error('Invalid durable report job')
  try {
    const outcome = await generateReportForService(serviceId, job.id)
    await transaction(client => complete(client, job, outcome))
  } catch (error) {
    const code = error instanceof ApiError ? error.code ?? 'REPORT_GENERATION_ERROR' : 'REPORT_GENERATION_ERROR'
    await transaction(async client => {
      await client.query(`update private.integration_jobs set status='FAILED',lease_until=null,last_error=$2,
        run_after=now()+make_interval(secs => least(3600,60*power(2,least(attempts,6)))::integer)
        where id=$1`,[job.id,code])
    })
    console.error('SERVICE_REPORT_JOB_FAILED',{jobId:job.id,code})
  }
}
export async function drainServiceJobs(limit = 6): Promise<{ processed: number }> {
  let processed = 0
  const boundedLimit = Math.max(1,Math.min(10,Math.trunc(limit)))
  for (let index=0;index<boundedLimit;index++) {
    const job = await claimJob()
    if (!job) break
    try {
      if (job.job_type === 'CALENDAR') await processCalendar(job)
      else if (job.job_type === 'EMAIL') await processEmail(job)
      else await processReport(job)
    } catch {
      // Leave the lease for recovery. In particular, never blindly retry an email
      // whose outcome could not be persisted after dispatch.
      console.error('ADMIN_SERVICE_JOB_RECOVERY_REQUIRED',{ jobId:job.id,type:job.job_type })
    }
    processed++
  }
  return { processed }
}

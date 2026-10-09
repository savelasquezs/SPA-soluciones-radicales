import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { ApiError, requireAdmin, type Identity } from '../auth'
import { transaction } from '../db'
import { createReportReadUrl } from '../r2'
import { kickServiceJobs } from '../services/jobs'
import { loadReportData } from './data'
import { isServiceId } from '../../../src/helpers/adminServices'

type Environment={Variables:{identity:Identity}}
export const reportRoutes=new Hono<Environment>()
function id(raw:unknown):string{
  if(!isServiceId(raw))throw new ApiError(422,'Servicio no válido.','VALIDATION')
  return raw
}
async function reportStatus(serviceId:string){
  return transaction(async client=>{
    const service=(await client.query<{path:string|null;generadoAt:Date|null;estado:string}>(`
      select informe_pdf_storage_path as path,informe_generado_at as "generadoAt",estado
      from public.servicios where id=$1`,[serviceId])).rows[0]
    if(!service)throw new ApiError(404,'El servicio no existe.','SERVICE_NOT_FOUND')
    const job=(await client.query<{status:string;last_error:string|null}>(`
      select status,last_error from private.integration_jobs
      where job_type='DOCUMENT' and idempotency_key=$1 order by created_at desc limit 1`,
      ['mip-report:'+serviceId])).rows[0]
    const estado=service.path?'DISPONIBLE':job?.status==='RUNNING'?'GENERANDO':
      job?.status==='PENDING'?'PENDIENTE':job?.status==='FAILED'?'ERROR':'NO_GENERADO'
    return {estado,generadoAt:service.generadoAt,
      url:service.path?createReportReadUrl(service.path,serviceId):null,
      error:estado==='ERROR'?'No fue posible generar el informe. Puedes reintentarlo.':null}
  })
}
reportRoutes.use('*',async(context,next)=>{
  await transaction(client=>requireAdmin(client,context.get('identity')))
  context.header('Cache-Control','no-store')
  await next()
})
reportRoutes.get('/:id/results',async context=>{
  const serviceId=id(context.req.param('id'))
  const [data,report]=await Promise.all([
    transaction(client=>loadReportData(client,serviceId)),
    reportStatus(serviceId),
  ])
  return context.json({data,report})
})
reportRoutes.get('/:id/report',async context=>context.json(await reportStatus(id(context.req.param('id')))))
reportRoutes.post('/:id/report/queue',async context=>{
  const serviceId=id(context.req.param('id'))
  await transaction(async client=>{
    const admin=await requireAdmin(client,context.get('identity'))
    const current=(await client.query<{estado:string;tipo_servicio:string;path:string|null}>(`
      select estado,tipo_servicio,informe_pdf_storage_path as path
      from public.servicios where id=$1 for update`,[serviceId])).rows[0]
    if(!current||current.estado!=='FINALIZADO'||current.tipo_servicio!=='PRINCIPAL')
      throw new ApiError(422,'El informe requiere un servicio Principal finalizado.','REPORT_NOT_READY')
    if(current.path)return
    const payload=JSON.stringify({scope:'SERVICE_REPORT',serviceId,actorId:admin.id,requestId:randomUUID()})
    await client.query(`insert into private.integration_jobs (job_type,idempotency_key,payload)
      values ('DOCUMENT',$1,$2::jsonb)
      on conflict (job_type,idempotency_key) do update set
        status=case when private.integration_jobs.status='FAILED' then 'PENDING' else private.integration_jobs.status end,
        attempts=case when private.integration_jobs.status='FAILED' then 0 else private.integration_jobs.attempts end,
        run_after=case when private.integration_jobs.status='FAILED' then now() else private.integration_jobs.run_after end,
        last_error=case when private.integration_jobs.status='FAILED' then null else private.integration_jobs.last_error end`,
      ['mip-report:'+serviceId,payload])
  })
  kickServiceJobs()
  return context.json(await reportStatus(serviceId))
})
reportRoutes.onError((error,context)=>{
  if(error instanceof ApiError)return context.json({error:error.message,code:error.code},error.status as 400|401|403|404|409|422|500)
  console.error('ADMIN_REPORTS_ERROR')
  return context.json({error:'No fue posible consultar el informe.'},500)
})

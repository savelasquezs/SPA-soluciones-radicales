import { randomUUID } from 'node:crypto'
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest'
import type { PoolClient } from 'pg'
import type { MailInput } from '../../functions/api/mailMessage'
import type { ServiceInput,ServiceMutation } from '../../src/types/adminServices'
import { addInstantDays,scheduleFromRecord,serviceToDraft,draftToServiceInput,toBogotaInput,todayBogota } from '../../src/helpers/adminServices'

vi.mock('@neon/functions',()=>({ attachDatabasePool:vi.fn<() => void>(),waitUntil:vi.fn<() => void>() }))
const external=vi.hoisted(()=>({ mail:vi.fn<(input: MailInput) => Promise<string>>(),calendar:vi.fn<(input: import('../../functions/api/calendarClient').CalendarEventInput) => Promise<string>>() }))
vi.mock('../../functions/api/google',()=>({ sendGmailMessage:external.mail,upsertCalendarEvent:external.calendar }))
import { pool,transaction } from '../../functions/api/db'
import { ApiError } from '../../functions/api/auth'
import { cancelService,command,createService,editService,queueConfirmationEmail,rescheduleService,savePayment,updateUpcoming } from '../../functions/api/services/commands'
import { getService,getUpcoming,listServices,listUpcoming,pendingCount,workspace } from '../../functions/api/services/queries'
import { drainServiceJobs } from '../../functions/api/services/jobs'

const target=new URL(process.env.TEST_DATABASE_URL ?? '')
if(process.env.CI!=='true' || !['localhost','127.0.0.1'].includes(target.hostname) || target.pathname!=='/sr_certificates_test') throw new Error('Ephemeral CI database required')
interface Fixture { admin: string; responsible: string; collaborator: string; business: string; site: string; product: string }
async function fixture(reinforcement=true): Promise<Fixture> {
  const f: Fixture={ admin:randomUUID(),responsible:randomUUID(),collaborator:randomUUID(),business:randomUUID(),site:randomUUID(),product:randomUUID() }
  await transaction(async client=>{
    for(const [role,user] of Object.entries({ admin:f.admin,responsible:f.responsible,collaborator:f.collaborator })) {
      await client.query('insert into public.usuarios(id,auth_user_id,nombre_completo,correo_google,es_admin,es_tecnico) values($1,$2,$3,$4,$5,$6)',[user,`services-ci:${user}`,`Services CI ${role}`,`${user}@example.invalid`,role==='admin',role!=='admin'])
    }
    await client.query("insert into public.negocios(id,nombre,nit,correos_json,vigencia_cert_establecimiento_meses) values($1,$2,$3,'[\"cliente@example.invalid\"]',12)",[f.business,`Services CI ${f.business}`,f.business])
    await client.query(`insert into public.sedes(id,negocio_id,nombre,direccion,correos_json,hereda_correos_negocio,contacto_principal_nombre,
      contacto_principal_celular,contacto_principal_correo,valor_servicio,periodicidad_meses,maneja_refuerzo,tipo_sede,duracion_servicio_minutos)
      values($1,$2,'Sede de prueba','Dirección sintética','[]',true,'Contacto de prueba','+573000000001','contacto@example.invalid',300000,1,$3,'NEGOCIO',90)`,[f.site,f.business,reinforcement])
    await client.query('insert into public.productos(id,nombre,principio_activo_composicion,dosis_aplicacion) values($1,$2,$3,$4)',[f.product,`Services CI product ${f.product}`,'Composición de prueba','5 mL/L'])
  })
  return f
}
function input(f: Fixture,start='2030-10-06T09:00:00-05:00'): ServiceInput {
  return { sedeId:f.site,programacion:{ inicioProgramado:start,duracionMinutos:90,tecnicoResponsableId:f.responsible,tecnicosColaboradoresIds:[f.collaborator] },refuerzo:null,
    productos:[{ productoId:f.product,lote:'CI-1',fechaFabricacion:'2026-01-01',fechaVencimiento:'2032-01-01' }],cobro:{ metodoPago:'EFECTIVO',tecnicoRecaudoPrevistoId:f.responsible },observaciones:'Solo datos sintéticos' }
}
async function create(f: Fixture,value=input(f),requestId=randomUUID()): Promise<ServiceMutation> {
  return transaction(client=>command(client,f.admin,requestId,'service:create',{ input:value },()=>createService(client,f.admin,value,false)))
}
const principal=(result: ServiceMutation)=>result.services.find(row=>row.tipoServicio==='PRINCIPAL')!
const child=(result: ServiceMutation)=>result.services.find(row=>row.tipoServicio==='REFUERZO')!
async function finish(f: Fixture,serviceId: string,actual='2030-01-31T09:00:00-05:00'): Promise<string> {
  await transaction(async client=>{
    await client.query("select set_config('app.admin_actor',$1,true)",[f.admin])
    await client.query("update public.servicios set estado='EN_PROCESO',inicio_real=$2 where id=$1",[serviceId,actual])
    await client.query(`update public.servicios set estado='FINALIZADO',fin_real=$2::timestamptz+interval '90 minutes',
      firma_tecnico_storage_path='ci/tech.png',firma_tecnico_usuario_id=$3,firma_cliente_storage_path='ci/client.png',
      firma_cliente_nombre='Cliente de prueba',firma_cliente_at=$2 where id=$1`,[serviceId,actual,f.responsible])
  })
  return (await pool.query<{ id: string }>('select id from public.proximos_servicios where principal_anterior_id=$1',[serviceId])).rows[0]!.id
}
beforeAll(async()=>{
  await pool.query(`create or replace function auth.session() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('test.auth_session',true),''),'{}')::jsonb $$`)
})
beforeEach(async()=>{
  // Earlier suites share this disposable database, never their pending effects.
  await pool.query("update private.integration_jobs set status='COMPLETED',lease_until=null where payload->>'scope'='ADMIN_SERVICES'")
  external.calendar.mockReset().mockImplementation(async (value:{ serviceId: string })=>`sr${value.serviceId.replaceAll('-','')}`)
  external.mail.mockReset().mockImplementation(async(value: MailInput)=>{ await value.onDispatch?.(); return 'ci-message' })
})
afterAll(async()=>{ await pool.end() })

describe('administrator services · real PostgreSQL',()=>{
  it('creates one Principal and one +21-day Refuerzo, preserves price and never confirms planned cash',async()=>{
    const f=await fixture(), result=await create(f), p=principal(result), r=child(result)
    expect(result.services).toHaveLength(2)
    expect(toBogotaInput(r.inicioProgramado)).toBe('2030-10-27T09:00')
    expect(r.servicioPrincipalId).toBe(p.id);expect(r.valorServicio).toBe(0)
    expect(p.valorServicio).toBe(300000);expect(p.pago.estadoPago).toBe('PENDIENTE')
    expect(p.pago.recaudadoPorId).toBeNull();expect(p.pago.tecnicoRecaudoPrevistoId).toBe(f.responsible)
    expect(p.productos[0]?.lote).toBe('CI-1')
    await pool.query('update public.sedes set valor_servicio=400000 where id=$1',[f.site])
    expect((await readService(p.id)).valorServicio).toBe(300000)
    expect(external.calendar).not.toHaveBeenCalled();expect(external.mail).not.toHaveBeenCalled()
    expect(Number((await pool.query("select count(*) from private.integration_jobs where payload->>'serviceId'=any($1::text[])",[[p.id,r.id]])).rows[0].count)).toBe(2)
  })
  it('replays simultaneous retries exactly once and rejects request-id reuse with another payload',async()=>{
    const f=await fixture(), request=randomUUID(), value=input(f)
    const [a,b]=await Promise.all([create(f,value,request),create(f,value,request)])
    expect(a.services.map(row=>row.id)).toEqual(b.services.map(row=>row.id))
    expect(Number((await pool.query('select count(*) from public.servicios where sede_id=$1',[f.site])).rows[0].count)).toBe(2)
    await expect(create(f,{ ...value,observaciones:'Changed payload' },request)).rejects.toMatchObject({ code:'REQUEST_REUSED' })
  })
  it('accepts a custom Refuerzo date at creation and reprograms it independently',async()=>{
    const f=await fixture(), value=input(f)
    value.refuerzo={ ...value.programacion,inicioProgramado:'2030-11-04T14:00:00-05:00',tecnicosColaboradoresIds:[] }
    const result=await create(f,value), p=principal(result), r=child(result)
    expect(toBogotaInput(r.inicioProgramado)).toBe('2030-11-04T14:00')
    await transaction(client=>rescheduleService(client,f.admin,r.id,r.version,{ ...scheduleFromRecord(r),inicioProgramado:'2030-11-08T11:00:00-05:00' },false))
    expect((await readService(p.id)).inicioProgramado).toBe(p.inicioProgramado)
    expect(toBogotaInput((await readService(r.id)).inicioProgramado)).toBe('2030-11-08T11:00')
  })
  it('rolls back joint changes when the Refuerzo version is stale or a product is invalid',async()=>{
    const f=await fixture(), result=await create(f), p=principal(result), r=child(result)
    await expect(transaction(client=>rescheduleService(client,f.admin,p.id,p.version,{ ...scheduleFromRecord(p),inicioProgramado:addInstantDays(p.inicioProgramado,2) },false,
      { version:r.version+1,schedule:{ ...scheduleFromRecord(r),inicioProgramado:addInstantDays(r.inicioProgramado,4) } }))).rejects.toMatchObject({ code:'VERSION_CONFLICT' })
    expect((await readService(p.id)).inicioProgramado).toBe(p.inicioProgramado)
    const edit=draftToServiceInput(serviceToDraft(p));edit.programacion.inicioProgramado=addInstantDays(p.inicioProgramado,2)
    edit.productos=[{ productoId:randomUUID(),lote:'',fechaFabricacion:null,fechaVencimiento:null }]
    await expect(transaction(client=>editService(client,f.admin,p.id,p.version,edit,true,r.version))).rejects.toMatchObject({ code:'VALIDATION' })
    expect((await readService(p.id)).version).toBe(p.version)
    expect((await readService(r.id)).version).toBe(r.version)
  })
  it('warns about a sibling appointment without silently dropping the assigned team',async()=>{
    const f=await fixture(), result=await create(f), p=principal(result), r=child(result)
    const change={ ...scheduleFromRecord(r),inicioProgramado:p.inicioProgramado }
    await expect(transaction(client=>rescheduleService(client,f.admin,r.id,r.version,change,false))).rejects.toMatchObject({ code:'SCHEDULE_CONFLICT' })
    const accepted=await transaction(client=>rescheduleService(client,f.admin,r.id,r.version,change,true))
    expect(accepted.services.find(row=>row.id===r.id)?.tecnicosColaboradoresIds).toEqual([f.collaborator])
  })
  it('cancels a programmed Refuerzo with its Principal and preserves finalized siblings',async()=>{
    const f=await fixture(), result=await create(f), p=principal(result)
    const cancelled=await transaction(client=>cancelService(client,f.admin,p.id,p.version,'El cliente solicitó cancelar'))
    expect(cancelled.services.every(row=>row.estado==='CANCELADO')).toBe(true)
    expect(cancelled.services.every(row=>row.motivoCancelacion==='El cliente solicitó cancelar')).toBe(true)
    await expect(transaction(client=>cancelService(client,f.admin,p.id,principal(cancelled).version,'Repetido'))).rejects.toMatchObject({ code:'SERVICE_TERMINAL' })
    const g=await fixture(), second=await create(g), parent=principal(second), reinforcement=child(second)
    await pool.query("update public.servicios set estado='EN_PROCESO',inicio_real=inicio_programado where id=$1",[reinforcement.id])
    await transaction(client=>cancelService(client,g.admin,parent.id,parent.version,'Solo Principal'))
    expect((await readService(reinforcement.id)).estado).toBe('EN_PROCESO')
  })
  it('requires actual cash collection, rejects paid Refuerzos, and allows audited payment correction',async()=>{
    const f=await fixture(), result=await create(f), p=principal(result), r=child(result)
    await expect(transaction(client=>savePayment(client,f.admin,p.id,p.version,{ metodoPago:'EFECTIVO',estadoPago:'CONFIRMADO',recaudadoPorId:null,motivo:'' }))).rejects.toMatchObject({ code:'VALIDATION' })
    const confirmed=await transaction(client=>savePayment(client,f.admin,p.id,p.version,{ metodoPago:'EFECTIVO',estadoPago:'CONFIRMADO',recaudadoPorId:f.admin,motivo:'' }))
    const fresh=principal(confirmed)
    expect(fresh.pago.recaudadoPorId).toBe(f.admin);expect(fresh.pago.recaudadoPorNombre).toContain('admin');expect(fresh.pago.confirmadoPor).toBeTruthy()
    await expect(transaction(client=>savePayment(client,f.admin,r.id,r.version,{ metodoPago:'EFECTIVO',estadoPago:'CONFIRMADO',recaudadoPorId:f.responsible,motivo:'' }))).rejects.toMatchObject({ code:'VALIDATION' })
    await expect(transaction(client=>savePayment(client,f.admin,p.id,fresh.version,{ metodoPago:'TRANSFERENCIA',estadoPago:'CONFIRMADO',recaudadoPorId:null,motivo:'' }))).rejects.toMatchObject({ code:'VALIDATION' })
    const corrected=await transaction(client=>savePayment(client,f.admin,p.id,fresh.version,{ metodoPago:'TRANSFERENCIA',estadoPago:'CONFIRMADO',recaudadoPorId:null,motivo:'Corrección comprobada' }))
    expect(principal(corrected).pago.recaudadoPorId).toBeNull()
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_PAGO_ACTUALIZADO'",[p.id])).rows[0].count)).toBe(2)
  })
  it('creates preagenda from actual completion, clamps calendar months and does not reserve staff or create Calendar events',async()=>{
    const f=await fixture(false), result=await create(f), p=principal(result), nextId=await finish(f,p.id)
    const next=await transaction(client=>getUpcoming(client,nextId))
    expect(toBogotaInput(next.fechaSugerida)).toBe('2030-02-28T09:00')
    expect(next.estado).toBe('PENDIENTE');expect(next.servicioAgendadoId).toBeNull()
    await pool.query('update public.servicios set observaciones=observaciones where id=$1',[p.id])
    expect(Number((await pool.query('select count(*) from public.proximos_servicios where principal_anterior_id=$1',[p.id])).rows[0].count)).toBe(1)
    expect(Number((await pool.query('select count(*) from public.servicios where sede_id=$1',[f.site])).rows[0].count)).toBe(1)
    expect(external.calendar).not.toHaveBeenCalled()
  })
  it('agendas a proposal atomically only with explicit client confirmation and keeps its history',async()=>{
    const f=await fixture(false), previous=principal(await create(f)), nextId=await finish(f,previous.id)
    const next=await transaction(client=>getUpcoming(client,nextId)), value=input(f,'2030-02-28T09:00:00-05:00')
    await expect(transaction(client=>createService(client,f.admin,value,false,{ id:next.id,version:next.version,confirmed:false }))).rejects.toMatchObject({ code:'FOLLOW_UP_NOT_READY' })
    expect((await transaction(client=>getUpcoming(client,next.id))).servicioAgendadoId).toBeNull()
    const result=await transaction(client=>createService(client,f.admin,value,false,{ id:next.id,version:next.version,confirmed:true }))
    expect(result.upcoming?.servicioAgendadoId).toBe(principal(result).id)
    expect(result.upcoming?.principalAnteriorId).toBe(previous.id)
    const listed=await transaction(client=>listUpcoming(client,{ from:'2030-01-01',to:'2030-12-31',estado:'',query:`Services CI ${f.business}`,page:1,pageSize:25 }))
    expect(listed.items).toHaveLength(0)
  })
  it('records contact only explicitly and applies the rolling-seven-day badge to actionable unconfirmed proposals',async()=>{
    const f=await fixture(false), p=principal(await create(f)), nextId=await finish(f,p.id)
    await pool.query("update public.proximos_servicios set fecha_sugerida=(($2::date+2)::timestamp at time zone 'America/Bogota') where id=$1",[nextId,todayBogota()])
    const start=await transaction(pendingCount), next=await transaction(client=>getUpcoming(client,nextId))
    await transaction(client=>updateUpcoming(client,f.admin,next.id,next.version,{ estado:'CONTACTADO',fechaRecontacto:null,nota:'Seguimiento sin envío confirmado',contactoRealizado:null }))
    const contacted=await transaction(client=>getUpcoming(client,nextId));expect(contacted.ultimoContactoAt).toBeNull()
    const deferred=await transaction(client=>updateUpcoming(client,f.admin,next.id,contacted.version,{ estado:'POSPUESTO',fechaRecontacto:'2099-01-01',nota:'Solicitó retomar después',contactoRealizado:'WHATSAPP' }))
    expect(deferred.pendingCount).toBe(start-1);expect(deferred.upcoming.canalUltimoContacto).toBe('WHATSAPP')
    const confirmed=await transaction(client=>updateUpcoming(client,f.admin,next.id,deferred.upcoming.version,{ estado:'CONFIRMADO',fechaRecontacto:null,nota:'Aceptó',contactoRealizado:null }))
    expect(confirmed.pendingCount).toBe(start-1)
  })
  it('persists Calendar failures without rolling back the appointment and does not bump its edit version',async()=>{
    const f=await fixture(false), p=principal(await create(f))
    external.calendar.mockRejectedValueOnce(new ApiError(502,'Provider unavailable','CALENDAR_UNAVAILABLE'))
    await drainServiceJobs(1)
    const fresh=await readService(p.id)
    expect(fresh.estado).toBe('PROGRAMADO');expect(fresh.calendar.estado).toBe('ERROR');expect(fresh.version).toBe(p.version)
    expect((await pool.query("select detalle_json->>'resultado' as result from public.auditoria where registro_id=$1 and accion='SERVICIO_CALENDAR_INTENTO' order by fecha_hora desc limit 1",[p.id])).rows[0].result).toBe('ERROR')
  })
  it('does not mark a newer schedule as synchronized when an earlier Calendar call finishes',async()=>{
    const f=await fixture(false), p=principal(await create(f))
    external.calendar.mockImplementationOnce(async()=>{
      await transaction(client=>rescheduleService(client,f.admin,p.id,p.version,{ ...scheduleFromRecord(p),inicioProgramado:addInstantDays(p.inicioProgramado,1) },false))
      return `sr${p.id.replaceAll('-','')}`
    })
    await drainServiceJobs(1)
    expect((await readService(p.id)).calendar.estado).toBe('PENDIENTE')
    await drainServiceJobs(1)
    expect((await readService(p.id)).calendar.estado).toBe('SINCRONIZADO')
    expect(external.calendar.mock.calls[1]?.[0].start).toBe((await readService(p.id)).inicioProgramado)
  })
  it('serializes simultaneous Calendar deliveries without blocking administrator reprogramming',async()=>{
    const f=await fixture(false), p=principal(await create(f))
    external.calendar.mockImplementationOnce(async()=>{
      await transaction(client=>rescheduleService(client,f.admin,p.id,p.version,{ ...scheduleFromRecord(p),inicioProgramado:addInstantDays(p.inicioProgramado,1) },false))
      await drainServiceJobs(1)
      expect(external.calendar).toHaveBeenCalledTimes(1)
      return `sr${p.id.replaceAll('-','')}`
    })
    await drainServiceJobs(1)
    expect((await readService(p.id)).calendar.estado).toBe('PENDIENTE')
    await pool.query("update private.integration_jobs set run_after=now() where payload->>'serviceId'=$1 and status='PENDING'",[p.id])
    await drainServiceJobs(1)
    expect(external.calendar).toHaveBeenCalledTimes(2)
    expect((await readService(p.id)).calendar.estado).toBe('SINCRONIZADO')
  })
  it('does not resend a confirmation email after uncertain delivery',async()=>{
    const f=await fixture(false), p=principal(await create(f)), nextId=await finish(f,p.id)
    await pool.query("update private.integration_jobs set status='COMPLETED' where payload->>'scope'='ADMIN_SERVICES'")
    const next=await transaction(client=>getUpcoming(client,nextId))
    await transaction(client=>queueConfirmationEmail(client,f.admin,nextId,next.version,randomUUID(),'cliente@example.invalid',false,false))
    external.mail.mockImplementationOnce(async(value: MailInput)=>{ await value.onDispatch?.(); throw new ApiError(502,'Unknown delivery','EMAIL_DELIVERY_UNKNOWN') })
    await drainServiceJobs(2);await drainServiceJobs(2)
    const fresh=await transaction(client=>getUpcoming(client,nextId))
    expect(fresh.correoEstado).toBe('INCIERTO');expect(fresh.estado).toBe('PENDIENTE');expect(external.mail).toHaveBeenCalledTimes(1)
    await expect(transaction(client=>queueConfirmationEmail(client,f.admin,nextId,fresh.version,randomUUID(),'cliente@example.invalid',false,false))).rejects.toMatchObject({ code:'EMAIL_DELIVERY_UNKNOWN' })
    await transaction(client=>queueConfirmationEmail(client,f.admin,nextId,fresh.version,randomUUID(),'cliente@example.invalid',true,false))
    await drainServiceJobs(1)
    expect((await transaction(client=>getUpcoming(client,nextId))).correoEstado).toBe('ENVIADO')
    expect(external.mail).toHaveBeenCalledTimes(2)
  })
  it('keeps table filtering, complete contacts and site-owned price data consistent',async()=>{
    const f=await fixture(false), p=principal(await create(f))
    const list=await transaction(client=>listServices(client,{ from:'2030-10-01',to:'2030-10-31',tab:'agenda',estado:'PROGRAMADO',tipo:'PRINCIPAL',tecnicoId:f.collaborator,query:`Services CI ${f.business}`,page:1,pageSize:25 }))
    expect(list.total).toBe(1);expect(list.items[0]?.id).toBe(p.id)
    expect(list.items[0]?.contacto.correos).toEqual(['cliente@example.invalid','contacto@example.invalid'])
    const options=await transaction(workspace)
    expect(options.sedes.find(site=>site.id===f.site)?.valorServicio).toBe(300000)
  })
  it('enforces real RLS: admin reads proposals, technicians and anonymous users cannot mutate or enumerate them',async()=>{
    const f=await fixture(false), p=principal(await create(f)), nextId=await finish(f,p.id)
    const session={ iat:1700000000,exp:4102444800 }
    await pool.query(`insert into private.user_sessions(session_id,auth_user_id,active_role,expires_at)
      values(private.session_key($1,$2::jsonb),$1,'ADMINISTRADOR',to_timestamp(4102444800))`,[`services-ci:${f.admin}`,JSON.stringify(session)])
    async function asUser(user: string,work: (client: PoolClient)=>Promise<unknown>): Promise<unknown> {
      return transaction(async client=>{
        await client.query("select set_config('test.user_id',$1,true),set_config('test.auth_session',$2,true)",[`services-ci:${user}`,JSON.stringify(session)])
        await client.query('set local role authenticated')
        return work(client)
      })
    }
    const adminResult=await asUser(f.admin,async client=>(await client.query('select id from public.proximos_servicios where id=$1',[nextId])).rows)
    expect(adminResult).toEqual([{ id:nextId }])
    expect(await asUser(f.responsible,async client=>(await client.query('select id from public.proximos_servicios where id=$1',[nextId])).rows)).toEqual([])
    await expect(asUser(f.admin,client=>client.query("update public.proximos_servicios set estado='CONFIRMADO' where id=$1",[nextId]))).rejects.toMatchObject({ code:'42501' })
    await expect(transaction(async client=>{ await client.query('set local role anonymous'); await client.query('select * from public.proximos_servicios') })).rejects.toMatchObject({ code:'42501' })
  })
})

// Queries under test use a transaction-owned PoolClient, just like the API.
async function readService(id: string) { return transaction(client=>getService(client,id)) }


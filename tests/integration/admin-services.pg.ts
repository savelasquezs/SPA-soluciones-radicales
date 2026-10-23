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
import { account, cashBalance, deliverCash, registerPayment, reviewPayment, voidDelivery } from '../../functions/api/finance/ledger'
import { dashboardSnapshot } from '../../functions/api/dashboard/queries'
import { ApiError } from '../../functions/api/auth'
import { cancelService,command,createService,editService,queueConfirmationEmail,rescheduleService,savePayment,updateUpcoming } from '../../functions/api/services/commands'
import { getService,getUpcoming,listServices,listUpcoming,pendingCount,workspace } from '../../functions/api/services/queries'
import { listTechnicianHistory } from '../../functions/api/technician-services/queries'
import { drainServiceJobs } from '../../functions/api/services/jobs'

const target=new URL(process.env.TEST_DATABASE_URL ?? '')
if(process.env.CI!=='true' || !['localhost','127.0.0.1'].includes(target.hostname) || target.pathname!=='/sr_certificates_test') throw new Error('Ephemeral CI database required')
interface Fixture { admin: string; responsible: string; collaborator: string; business: string; site: string; product: string; method: string; methodCode: string }
async function fixture(reinforcement=true): Promise<Fixture> {
  const f: Fixture={ admin:randomUUID(),responsible:randomUUID(),collaborator:randomUUID(),business:randomUUID(),site:randomUUID(),product:randomUUID(),method:randomUUID(),methodCode:`METHOD_${randomUUID().replaceAll('-','')}` }
  await transaction(async client=>{
    for(const [role,user] of Object.entries({ admin:f.admin,responsible:f.responsible,collaborator:f.collaborator })) {
      await client.query('insert into public.usuarios(id,auth_user_id,nombre_completo,correo_google,es_admin,es_tecnico) values($1,$2,$3,$4,$5,$6)',[user,`services-ci:${user}`,`Services CI ${role}`,`${user}@example.invalid`,role==='admin',role!=='admin'])
    }
    await client.query("insert into public.negocios(id,nombre,nit,correos_json,vigencia_cert_establecimiento_meses) values($1,$2,$3,'[\"cliente@example.invalid\"]',12)",[f.business,`Services CI ${f.business}`,f.business])
    await client.query(`insert into public.sedes(id,negocio_id,nombre,direccion,correos_json,hereda_correos_negocio,contacto_principal_nombre,
      contacto_principal_celular,contacto_principal_correo,valor_servicio,periodicidad_meses,maneja_refuerzo,tipo_sede,duracion_servicio_minutos)
      values($1,$2,'Sede de prueba','Dirección sintética','[]',true,'Contacto de prueba','+573000000001','contacto@example.invalid',300000,1,$3,'NEGOCIO',90)`,[f.site,f.business,reinforcement])
    await client.query('insert into public.productos(id,nombre,principio_activo_composicion,dosis_aplicacion) values($1,$2,$3,$4)',[f.product,`Services CI product ${f.product}`,'Composición de prueba','5 mL/L'])
    await client.query("insert into public.configuracion(id,categoria,clave,nombre) values($1,'METODO_APLICACION',$2,$3)",[f.method,f.methodCode,`Aspersión ${f.methodCode}`])
    await client.query('insert into public.producto_metodos(producto_id,metodo_id) values($1,$2)',[f.product,f.method])
  })
  return f
}
function input(f: Fixture,start='2030-10-06T09:00:00-05:00'): ServiceInput {
  return { sedeId:f.site,programacion:{ inicioProgramado:start,duracionMinutos:90,tecnicoResponsableId:f.responsible,tecnicosColaboradoresIds:[f.collaborator] },refuerzo:null,
    productos:[{ productoId:f.product,lote:'CI-1',fechaVencimiento:'2032-01-01' }],cobro:{ metodoPago:'EFECTIVO',tecnicoRecaudoPrevistoId:f.responsible },observaciones:'Solo datos sintéticos' }
}
async function create(f: Fixture,value=input(f),requestId=randomUUID()): Promise<ServiceMutation> {
  return transaction(client=>command(client,f.admin,requestId,'service:create',{ input:value },()=>createService(client,f.admin,value,[],undefined,requestId)))
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
  it('orders every history page by actual completion even when scheduled dates disagree',async()=>{
    const f=await fixture(false)
    const older=principal(await create(f,input(f,'2030-10-20T09:00:00-05:00')))
    const latest=principal(await create(f,input(f,'2030-10-01T09:00:00-05:00')))
    const tied=principal(await create(f,input(f,'2030-10-02T09:00:00-05:00')))
    await finish(f,older.id,'2030-10-22T09:00:00-05:00')
    await finish(f,latest.id,'2030-10-23T09:00:00-05:00')
    await finish(f,tied.id,'2030-10-23T09:00:00-05:00')
    const expected=[latest.id,tied.id].sort().reverse().concat(older.id)
    const filter={from:'2030-10-22',to:'2030-10-23',tab:'history' as const,estado:'' as const,tipo:'' as const,tecnicoId:'',query:'',page:1,pageSize:1,siteId:f.site}
    const pages:string[]=[]
    for(const page of [1,2,3]){
      const result=await transaction(client=>listServices(client,{...filter,page}))
      expect(result.total).toBe(3)
      pages.push(...result.items.map(row=>row.id))
    }
    expect(pages).toEqual(expected)
    for(const scope of [{clientId:f.business,siteId:undefined},{siteId:f.site}]){
      const result=await transaction(client=>listServices(client,{...filter,...scope,from:'',to:'',tab:'agenda',pageSize:20},true))
      expect(result.items.map(row=>row.id)).toEqual(expected)
    }
    const technician=await transaction(client=>listTechnicianHistory(client,f.responsible,1,'','2030-10-22','2030-10-24'))
    expect(technician.items.map(row=>row.id)).toEqual(expected)
  })
  it('schedules residential visits with individual prices and no reinforcement, preserving business pricing',async()=>{
    const f=await fixture(false), homeClient=randomUUID(), homeSite=randomUUID()
    await transaction(async client=>{
      await client.query(`insert into public.negocios(id,tipo_cliente,nombre,nit,correos_json)
        values($1,'RESIDENCIAL','Casa de prueba',null,'[]'::jsonb)`,[homeClient])
      await client.query(`insert into public.sedes(id,negocio_id,nombre,direccion,correos_json,hereda_correos_negocio,
        contacto_principal_nombre,contacto_principal_celular,valor_servicio,periodicidad_meses,maneja_refuerzo,tipo_sede,
        maneja_vehiculos,genera_certificado_vehiculo,duracion_servicio_minutos)
        values($1,$2,'Casa de prueba','Calle 123','[]'::jsonb,false,'Casa de prueba','+573001234567',
          null,null,false,'RESIDENCIAL',false,false,null)`,[homeSite,homeClient])
    })
    const options=await transaction(client=>workspace(client))
    expect(options.sedes.find(site=>site.id===homeSite)).toMatchObject({tipoSede:'RESIDENCIAL',clientId:homeClient,valorServicio:null})
    const firstInput={...input(f),sedeId:homeSite,valorServicio:75000,refuerzo:null}
    const first=principal(await create(f,firstInput))
    expect(first).toMatchObject({clientId:homeClient,tipoSede:'RESIDENCIAL',valorServicio:75000,refuerzo:null})
    expect(first.contacto.celular).toBe('+573001234567')
    const second=principal(await create(f,{...firstInput,valorServicio:90000,programacion:{...firstInput.programacion,inicioProgramado:'2030-10-07T09:00:00-05:00'}}))
    expect(second.valorServicio).toBe(90000)
    expect((await transaction(client=>getService(client,first.id))).valorServicio).toBe(75000)
    await expect(create(f,{...firstInput,valorServicio:null})).rejects.toMatchObject({code:'VALIDATION'})
    await expect(create(f,{...firstInput,refuerzo:{...firstInput.programacion,inicioProgramado:'2030-10-27T09:00:00-05:00'}})).rejects.toMatchObject({code:'VALIDATION'})
    const businessInput=input(f)
    businessInput.valorServicio=1
    businessInput.programacion.inicioProgramado='2030-10-08T09:00:00-05:00'
    const business=principal(await create(f,businessInput))
    expect(business.valorServicio).toBe(300000)
    const reprogrammed=principal(await transaction(client=>editService(client,f.admin,first.id,first.version,
      {...firstInput,programacion:{...firstInput.programacion,inicioProgramado:'2030-10-09T09:00:00-05:00'}},[])))
    expect(reprogrammed.valorServicio).toBe(75000)
  })


  it('confirma efectivo recibido por administrador durante el alta, de forma atómica',async()=>{
    const f=await fixture()
    const value=input(f)
    value.cobro={metodoPago:'EFECTIVO',tecnicoRecaudoPrevistoId:null,pagado:true,recaudadoPorId:f.admin}
    const created=principal(await create(f,value))
    expect(created.pago).toMatchObject({metodoPago:'EFECTIVO',estadoPago:'CONFIRMADO',recaudadoPorId:f.admin})
    const row=(await pool.query<{pago_fecha:Date|null;pago_confirmado_por_id:string|null;pago_registrado_por_id:string|null}>(
      'select pago_fecha,pago_confirmado_por_id,pago_registrado_por_id from public.servicios where id=$1',[created.id])).rows[0]!
    expect(row.pago_fecha).toBeTruthy()
    expect(row.pago_confirmado_por_id).toBe(f.admin)
    expect(row.pago_registrado_por_id).toBe(f.admin)
    expect(created.refuerzo?.tipoServicio).toBe('REFUERZO')
  })
  it('confirma transferencia al crear sin exigir un receptor de efectivo',async()=>{
    const f=await fixture(false)
    const value=input(f)
    value.cobro={metodoPago:'TRANSFERENCIA',tecnicoRecaudoPrevistoId:null,pagado:true,recaudadoPorId:null}
    const created=principal(await create(f,value))
    expect(created.pago).toMatchObject({metodoPago:'TRANSFERENCIA',estadoPago:'CONFIRMADO',recaudadoPorId:null})
  })
  it('rechaza crear servicios en el pasado incluso cuando el cliente modifica la petición',async()=>{
    const f=await fixture(false)
    await expect(create(f,input(f,'2024-01-01T09:00:00-05:00'))).rejects.toMatchObject({code:'VALIDATION'})
    expect((await pool.query('select count(*)::integer as total from public.servicios where sede_id=$1',[f.site])).rows[0].total).toBe(0)
  })

  it('creates one Principal and one +21-day Refuerzo, preserves price and never confirms planned cash',async()=>{
    const f=await fixture(), result=await create(f), p=principal(result), r=child(result)
    expect(result.services).toHaveLength(2)
    expect(toBogotaInput(r.inicioProgramado)).toBe('2030-10-27T09:00')
    expect(r.servicioPrincipalId).toBe(p.id);expect(r.valorServicio).toBe(0)
    expect(p.valorServicio).toBe(300000);expect(p.pago.estadoPago).toBe('PENDIENTE')
    expect(p.pago.recaudadoPorId).toBeNull();expect(p.pago.tecnicoRecaudoPrevistoId).toBe(f.responsible)
    expect(p.productos[0]).toMatchObject({ lote:'CI-1',fechaVencimiento:'2032-01-01',dosis:'5 mL/L',metodoAplicacionNombre:`Aspersión ${f.methodCode}` })
    await pool.query('update public.sedes set valor_servicio=400000 where id=$1',[f.site])
    expect((await readService(p.id)).valorServicio).toBe(300000)
    expect(external.calendar).not.toHaveBeenCalled();expect(external.mail).not.toHaveBeenCalled()
    expect(Number((await pool.query("select count(*) from private.integration_jobs where payload->>'serviceId'=any($1::text[])",[[p.id,r.id]])).rows[0].count)).toBe(2)
  })
  it('returns full client and site histories scoped by UUID before pagination, including future visits',async()=>{
    const f=await fixture(), other=await fixture(false)
    const created=await create(f), primary=principal(created), reinforcement=child(created)
    const anotherSite=randomUUID()
    await pool.query(`insert into public.sedes(id,negocio_id,nombre,direccion,correos_json,hereda_correos_negocio,contacto_principal_nombre,
      contacto_principal_celular,contacto_principal_correo,valor_servicio,periodicidad_meses,maneja_refuerzo,tipo_sede,duracion_servicio_minutos)
      values($1,$2,'Sede adicional','Dirección de prueba','[]',true,'Contacto de prueba','+573000000002','contacto@example.invalid',300000,1,false,'NEGOCIO',90)`,[anotherSite,f.business])
    const extra=principal(await create({...f,site:anotherSite},input({...f,site:anotherSite},'2030-10-11T09:00:00-05:00')))
    const unrelated=principal(await create(other,input(other,'2030-10-08T09:00:00-05:00')))
    const base={from:'',to:'',tab:'agenda' as const,estado:'' as const,tipo:'' as const,tecnicoId:'',query:'',page:1,pageSize:20}
    const forClient=await transaction(client=>listServices(client,{...base,clientId:f.business}))
    expect(forClient.total).toBe(3)
    expect(forClient.pendingCount).toBe(0)
    expect(forClient.items.map(row=>row.id)).toEqual([reinforcement.id,extra.id,primary.id])
    expect(forClient.items.every(row=>row.clientId===f.business)).toBe(true)
    expect(forClient.items.every(row=>row.contacto && row.pago && row.calendar && row.responsable)).toBe(true)
    expect(forClient.items.some(row=>row.id===unrelated.id)).toBe(false)
    const forSite=await transaction(client=>listServices(client,{...base,siteId:f.site,pageSize:1,page:2}))
    expect(forSite.total).toBe(2)
    expect(forSite.items.map(row=>row.id)).toEqual([primary.id])
    const filtered=await transaction(client=>listServices(client,{...base,siteId:f.site,tipo:'REFUERZO'}))
    expect(filtered.total).toBe(1)
    expect(filtered.items[0]?.id).toBe(reinforcement.id)
    const bounded=await transaction(client=>listServices(client,{...base,clientId:f.business,from:'2030-10-07',to:'2030-10-12'}))
    expect(bounded.items.map(row=>row.id)).toEqual([extra.id])
    await expect(transaction(client=>listServices(client,base))).rejects.toMatchObject({code:'VALIDATION'})
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
    await transaction(client=>rescheduleService(client,f.admin,r.id,r.version,{ ...scheduleFromRecord(r),inicioProgramado:'2030-11-08T11:00:00-05:00' },[]))
    expect((await readService(p.id)).inicioProgramado).toBe(p.inicioProgramado)
    expect(toBogotaInput((await readService(r.id)).inicioProgramado)).toBe('2030-11-08T11:00')
  })
  it('rolls back joint changes when the Refuerzo version is stale or a product is invalid',async()=>{
    const f=await fixture(), result=await create(f), p=principal(result), r=child(result)
    await expect(transaction(client=>rescheduleService(client,f.admin,p.id,p.version,{ ...scheduleFromRecord(p),inicioProgramado:addInstantDays(p.inicioProgramado,2) },[],
      { version:r.version+1,schedule:{ ...scheduleFromRecord(r),inicioProgramado:addInstantDays(r.inicioProgramado,4) } }))).rejects.toMatchObject({ code:'VERSION_CONFLICT' })
    expect((await readService(p.id)).inicioProgramado).toBe(p.inicioProgramado)
    const edit=draftToServiceInput(serviceToDraft(p));edit.programacion.inicioProgramado=addInstantDays(p.inicioProgramado,2)
    edit.productos=[{ productoId:randomUUID(),lote:'x',fechaVencimiento:null }]
    await expect(transaction(client=>editService(client,f.admin,p.id,p.version,edit,[],r.version))).rejects.toMatchObject({ code:'VALIDATION' })
    expect((await readService(p.id)).version).toBe(p.version)
    expect((await readService(r.id)).version).toBe(r.version)
  })
  it('blocks overlaps and allows a simultaneous visit only after assigning a different team',async()=>{
    const f=await fixture(), result=await create(f), p=principal(result), r=child(result)
    const change={ ...scheduleFromRecord(r),inicioProgramado:p.inicioProgramado }
    await expect(transaction(client=>rescheduleService(client,f.admin,r.id,r.version,change,[]))).rejects.toMatchObject({ code:'SCHEDULE_CONFLICT' })
    const other=await fixture(false)
    const accepted=await transaction(client=>rescheduleService(client,f.admin,r.id,r.version,{
      ...change,tecnicoResponsableId:other.responsible,tecnicosColaboradoresIds:[other.collaborator],
    },[]))
    expect(accepted.services.find(row=>row.id===r.id)?.tecnicoResponsableId).toBe(other.responsible)
    expect((await readService(p.id)).tecnicoResponsableId).toBe(f.responsible)
  })
  it('atomically reassigns the other visit, retains both times and audits the replacement',async()=>{
    const f=await fixture(false),other=await fixture(false),p=principal(await create(f))
    const candidate=input(f)
    await expect(create(f,candidate)).rejects.toMatchObject({code:'SCHEDULE_CONFLICT'})
    const changed=await transaction(client=>createService(client,f.admin,candidate,[{
      id:p.id,version:p.version,programacion:{
        ...scheduleFromRecord(p),tecnicoResponsableId:other.responsible,tecnicosColaboradoresIds:[other.collaborator],
      },
    }]))
    const now=await readService(p.id),newVisit=changed.services.find(row=>row.id!==p.id && row.tipoServicio==='PRINCIPAL')!
    expect(now.tecnicoResponsableId).toBe(other.responsible)
    expect(newVisit.tecnicoResponsableId).toBe(f.responsible)
    expect(now.inicioProgramado).toBe(newVisit.inicioProgramado)
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_EQUIPO_REASIGNADO'",[p.id])).rows[0].count)).toBe(1)
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_CREADO'",[p.id])).rows[0].count)).toBe(1)
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_CREADO'",[newVisit.id])).rows[0].count)).toBe(1)
  })
  it('reschedules the existing appointment atomically and preserves its assigned team and Calendar outbox',async()=>{
    const f=await fixture(false), existing=principal(await create(f))
    const candidate=input(f), before=scheduleFromRecord(existing)
    const newSchedule={...before,inicioProgramado:addInstantDays(existing.inicioProgramado,2)}
    const result=await transaction(client=>createService(client,f.admin,candidate,[{
      id:existing.id,version:existing.version,programacion:newSchedule,
    }]))
    const moved=result.services.find(row=>row.id===existing.id)!
    const created=result.services.find(row=>row.id!==existing.id)!
    expect(new Date(moved.inicioProgramado).getTime()).toBe(new Date(newSchedule.inicioProgramado).getTime())
    expect(moved.tecnicoResponsableId).toBe(existing.tecnicoResponsableId)
    expect(moved.tecnicosColaboradoresIds).toEqual(existing.tecnicosColaboradoresIds)
    expect(created.inicioProgramado).toBe(existing.inicioProgramado)
    expect(created.tecnicoResponsableId).toBe(existing.tecnicoResponsableId)
    expect(moved.calendar.estado).toBe('PENDIENTE')
    expect((await pool.query("select count(*)::integer as count from public.auditoria where registro_id=$1 and accion='SERVICIO_REPROGRAMADO_POR_CRUCE'",[existing.id])).rows[0].count).toBe(1)
  })
  it('returns the rescheduled existing service as part of an atomic rescheduling operation',async()=>{
    const f=await fixture(false)
    const first=principal(await create(f)), second=principal(await create(f,input(f,'2030-10-08T09:00:00-05:00')))
    const result=await transaction(client=>rescheduleService(client,f.admin,second.id,second.version,
      {...scheduleFromRecord(second),inicioProgramado:first.inicioProgramado},
      [{id:first.id,version:first.version,programacion:{
        ...scheduleFromRecord(first),inicioProgramado:addInstantDays(first.inicioProgramado,1),
      }}]))
    expect(result.services.map(row=>row.id)).toContain(first.id)
    expect(result.services.map(row=>row.id)).toContain(second.id)
    expect(new Date(result.services.find(row=>row.id===first.id)!.inicioProgramado).getTime()).toBe(new Date(addInstantDays(first.inicioProgramado,1)).getTime())
    expect(result.services.find(row=>row.id===second.id)?.inicioProgramado).toBe(first.inicioProgramado)
  })
  it('rejects a newly introduced clash and rolls back every proposed schedule change',async()=>{
    const f=await fixture(false)
    const first=principal(await create(f))
    await create(f,input(f,'2030-10-09T09:00:00-05:00'))
    const proposed=input(f)
    await expect(transaction(client=>createService(client,f.admin,proposed,[{
      id:first.id,version:first.version,programacion:{
        ...scheduleFromRecord(first),inicioProgramado:'2030-10-09T09:00:00-05:00',
      },
    }]))).rejects.toMatchObject({code:'SCHEDULE_CONFLICT'})
    const fresh=await readService(first.id)
    expect(fresh.version).toBe(first.version)
    expect(fresh.inicioProgramado).toBe(first.inicioProgramado)
    expect((await pool.query('select count(*)::integer as count from public.servicios where sede_id=$1',[f.site])).rows[0].count).toBe(2)
  })
  it('rejects rescheduling affected visits in the past or tampering with duration and team simultaneously',async()=>{
    const f=await fixture(false), first=principal(await create(f))
    const initial=scheduleFromRecord(first)
    const base=input(f)
    for(const schedule of [
      {...initial,inicioProgramado:'2020-10-09T09:00:00-05:00'},
      {...initial,duracionMinutos:120},
      {...initial,inicioProgramado:addInstantDays(first.inicioProgramado,2),tecnicosColaboradoresIds:[]},
    ]) {
      await expect(transaction(client=>createService(client,f.admin,base,[{
        id:first.id,version:first.version,programacion:schedule,
      }]))).rejects.toMatchObject({code:'VALIDATION'})
      expect((await readService(first.id)).version).toBe(first.version)
    }
  })
  it('serializes concurrent reservations of the same technician and commits only one',async()=>{
    const f=await fixture(false), candidate=input(f)
    const attempts=await Promise.allSettled([create(f,candidate),create(f,candidate)])
    expect(attempts.filter(item=>item.status==='fulfilled')).toHaveLength(1)
    expect(attempts.filter(item=>item.status==='rejected')).toHaveLength(1)
    const failure=attempts.find(item=>item.status==='rejected')
    expect(failure && failure.status==='rejected' ? failure.reason : null).toMatchObject({code:'SCHEDULE_CONFLICT'})
    const count=await pool.query<{total:number}>('select count(*)::integer as total from public.servicios where sede_id=$1',[f.site])
    expect(count.rows[0]?.total).toBe(1)
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
    await expect(transaction(client=>savePayment(client,f.admin,p.id,p.version,{ metodoPago:'EFECTIVO',estadoPago:'CONFIRMADO',recaudadoPorId:null,motivo:'' },randomUUID()))).rejects.toMatchObject({ code:'VALIDATION' })
    const confirmed=await transaction(client=>savePayment(client,f.admin,p.id,p.version,{ metodoPago:'EFECTIVO',estadoPago:'CONFIRMADO',recaudadoPorId:f.admin,motivo:'' },randomUUID()))
    const fresh=principal(confirmed)
    expect(fresh.pago.recaudadoPorId).toBe(f.admin);expect(fresh.pago.recaudadoPorNombre).toContain('admin');expect(fresh.pago.confirmadoPor).toBeTruthy()
    await expect(transaction(client=>savePayment(client,f.admin,r.id,r.version,{ metodoPago:'EFECTIVO',estadoPago:'CONFIRMADO',recaudadoPorId:f.responsible,motivo:'' },randomUUID()))).rejects.toMatchObject({ code:'VALIDATION' })
    await expect(transaction(client=>savePayment(client,f.admin,p.id,fresh.version,{ metodoPago:'TRANSFERENCIA',estadoPago:'CONFIRMADO',recaudadoPorId:null,motivo:'' },randomUUID()))).rejects.toMatchObject({ code:'VALIDATION' })
    await expect(transaction(client=>savePayment(client,f.admin,p.id,fresh.version,{ metodoPago:'TRANSFERENCIA',estadoPago:'CONFIRMADO',recaudadoPorId:null,motivo:'Corrección comprobada' },randomUUID())))
      .rejects.toMatchObject({code:'FINANCE_CONFLICT'})
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_PAGO_ACTUALIZADO'",[p.id])).rows[0].count)).toBe(1)
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
    await expect(transaction(client=>createService(client,f.admin,value,[],{ id:next.id,version:next.version,confirmed:false }))).rejects.toMatchObject({ code:'FOLLOW_UP_NOT_READY' })
    expect((await transaction(client=>getUpcoming(client,next.id))).servicioAgendadoId).toBeNull()
    const result=await transaction(client=>createService(client,f.admin,value,[],{ id:next.id,version:next.version,confirmed:true }))
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
      await transaction(client=>rescheduleService(client,f.admin,p.id,p.version,{ ...scheduleFromRecord(p),inicioProgramado:addInstantDays(p.inicioProgramado,1) },[]))
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
      await transaction(client=>rescheduleService(client,f.admin,p.id,p.version,{ ...scheduleFromRecord(p),inicioProgramado:addInstantDays(p.inicioProgramado,1) },[]))
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
  it('consolidates credit for multiple visits and applies abonos without duplication',async()=>{
    const f=await fixture(false)
    const one=principal(await create(f)), two=principal(await create(f,input(f,'2030-10-07T09:00:00-05:00')))
    await finish(f,one.id);await finish(f,two.id)
    const prior=await transaction(client=>account(client,f.business))
    expect(prior.cliente.realizado).toBe(600000)
    expect(prior.cliente.saldo).toBe(600000)
    const requestId=randomUUID()
    const paid=await transaction(client=>registerPayment(client,f.admin,{requestId,clienteId:f.business,metodo:'TRANSFERENCIA',
      recaudadoPorId:null,observacion:'Abono mensual sintético',
      aplicaciones:[{servicioId:one.id,monto:100000},{servicioId:two.id,monto:100000}],confirmed:true}))
    expect(paid.monto).toBe(200000)
    const replay=await transaction(client=>registerPayment(client,f.admin,{requestId,clienteId:f.business,metodo:'TRANSFERENCIA',
      recaudadoPorId:null,observacion:'Abono mensual sintético',
      aplicaciones:[{servicioId:one.id,monto:100000},{servicioId:two.id,monto:100000}],confirmed:true}))
    expect(replay.id).toBe(paid.id)
    const partial=await transaction(client=>account(client,f.business))
    expect(partial.cliente.saldo).toBe(400000)
    expect((await transaction(client=>dashboardSnapshot(client,'30d',f.business,null))).kpis.outstandingValue).toBe(400000)
    expect(partial.servicios.filter(s=>[one.id,two.id].includes(s.id)).map(s=>s.abonado)).toEqual([100000,100000])
    await expect(transaction(client=>registerPayment(client,f.admin,{requestId:randomUUID(),clienteId:f.business,metodo:'TRANSFERENCIA',
      recaudadoPorId:null,observacion:'Excedente',aplicaciones:[{servicioId:one.id,monto:300000}],confirmed:true})))
      .rejects.toMatchObject({code:'FINANCE_CONFLICT'})
    const cash=await transaction(client=>registerPayment(client,f.admin,{requestId:randomUUID(),clienteId:f.business,metodo:'EFECTIVO',
      recaudadoPorId:f.responsible,observacion:'Pagado al técnico',
      aplicaciones:[{servicioId:one.id,monto:200000},{servicioId:two.id,monto:200000}],confirmed:true}))
    expect(cash.estado).toBe('CONFIRMADO')
    const balances=await transaction(client=>cashBalance(client))
    expect(balances.find(x=>x.id===f.responsible)?.saldo).toBe(400000)
    expect((await transaction(client=>account(client,f.business))).cliente.saldo).toBe(0)
    const deliveryRequest=randomUUID()
    const delivered=await transaction(client=>deliverCash(client,f.admin,f.responsible,250000,deliveryRequest,'Corte parcial'))
    expect(delivered.monto).toBe(250000)
    const duplicate=await transaction(client=>deliverCash(client,f.admin,f.responsible,250000,deliveryRequest,'Corte parcial'))
    expect(duplicate.id).toBe(delivered.id)
    expect((await transaction(client=>cashBalance(client))).find(x=>x.id===f.responsible)?.saldo).toBe(150000)
    await expect(transaction(client=>reviewPayment(client,f.admin,cash.id,'ANULADO','Devolución de pago')))
      .rejects.toMatchObject({code:'FINANCE_CONFLICT'})
    await transaction(client=>voidDelivery(client,f.admin,delivered.id,'Anulación de prueba'))
    expect((await transaction(client=>cashBalance(client))).find(x=>x.id===f.responsible)?.saldo).toBe(400000)
    await transaction(client=>reviewPayment(client,f.admin,cash.id,'ANULADO','Devolución de pago'))
    expect((await transaction(client=>account(client,f.business))).cliente.saldo).toBe(400000)
  })
  it('requires administrative confirmation and receipt proof for a transfer reported by a technician',async()=>{
    const f=await fixture(false),p=principal(await create(f))
    await finish(f,p.id)
    const requestId=randomUUID()
    const reported=await transaction(client=>registerPayment(client,f.responsible,{
      requestId,clienteId:f.business,metodo:'TRANSFERENCIA',recaudadoPorId:null,
      observacion:'Captura del cliente',aplicaciones:[{servicioId:p.id,monto:150000}],
      confirmed:false,technicianId:f.responsible,
    }))
    expect(reported.estado).toBe('PENDIENTE')
    expect((await transaction(client=>account(client,f.business))).cliente.saldo).toBe(300000)
    await expect(transaction(client=>registerPayment(client,f.admin,{
      requestId:randomUUID(),clienteId:f.business,metodo:'TRANSFERENCIA',recaudadoPorId:null,
      observacion:'Duplicado',aplicaciones:[{servicioId:p.id,monto:200000}],confirmed:true,
    }))).rejects.toMatchObject({code:'FINANCE_CONFLICT'})
    await expect(transaction(client=>reviewPayment(client,f.admin,reported.id,'CONFIRMADO','')))
      .rejects.toMatchObject({code:'VALIDATION'})
    await transaction(client=>client.query('update public.pagos set comprobante_storage_path=$2 where id=$1',
      [reported.id,`payments/${reported.id}/proof/fake-ci.png`]))
    await transaction(client=>reviewPayment(client,f.admin,reported.id,'CONFIRMADO','Validado contra banco'))
    expect((await transaction(client=>account(client,f.business))).cliente.saldo).toBe(150000)
    expect((await transaction(client=>cashBalance(client))).find(x=>x.id===f.responsible)?.saldo).toBe(0)
    await expect(transaction(client=>reviewPayment(client,f.admin,reported.id,'ANULADO','Corrección aprobada'))).resolves.toBeTruthy()
    expect((await transaction(client=>account(client,f.business))).cliente.saldo).toBe(300000)
  })
})

// Queries under test use a transaction-owned PoolClient, just like the API.
async function readService(id: string) { return transaction(client=>getService(client,id)) }


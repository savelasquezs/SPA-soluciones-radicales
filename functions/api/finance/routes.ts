import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ApiError, requireAdmin, requireTechnician, type Identity } from '../auth'
import { transaction } from '../db'
import { assertPaymentProofStoragePath, createPaymentProofReadUrl, createPaymentProofUploadUrl, paymentProofObjectExists } from '../r2'
import { account, amount, auditFinance, cashBalance, changeTerms, deliverCash, getPayment, isId, overview, registerPayment, reviewPayment, voidDelivery } from './ledger'
import type { PaymentDraft } from './ledger'
import type { MetodoPago, RegistrarPago } from '../../../src/types/finance'

type Environment = { Variables: { identity: Identity } }
export const financeRoutes = new Hono<Environment>()
financeRoutes.use('*',bodyLimit({maxSize:100_000,onError:c=>c.json({error:'La solicitud supera el tamaño permitido.'},413)}))
const uuid=(v:unknown):string=>{if(!isId(v))throw new ApiError(422,'El registro seleccionado no es válido.');return v}
const note=(v:unknown,max=1_000):string=>{if(v!=null&&typeof v!=='string')throw new ApiError(422,'Revisa la observación.'); const s=(v??'').toString().trim();if(s.length>max)throw new ApiError(422,'La observación es demasiado larga.');return s}
const json=async(req:Request):Promise<Record<string,unknown>>=>{try {const p:unknown=await req.json();if(!p||typeof p!=='object'||Array.isArray(p))throw new Error();return p as Record<string,unknown>}catch{throw new ApiError(400,'Revisa los datos enviados.')}}
const method=(v:unknown):MetodoPago=>{if(v!=='EFECTIVO'&&v!=='TRANSFERENCIA')throw new ApiError(422,'Selecciona un método de pago.');return v}
const allocations=(v:unknown):RegistrarPago['aplicaciones']=>{
  if(!Array.isArray(v)||v.length>30||!v.length)throw new ApiError(422,'Selecciona al menos un servicio.')
  return v.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item))throw new ApiError(422,'Revisa los servicios.');const row=item as Record<string,unknown>;return {servicioId:uuid(row.servicioId),monto:amount(row.monto)}})
}
const admin=async <T>(c:Context<Environment>,fn:(client:import('pg').PoolClient,userId:string)=>Promise<T>):Promise<T>=>
  transaction(async client=>fn(client,(await requireAdmin(client,c.get('identity'))).id))

financeRoutes.get('/overview',async c=>{c.header('Cache-Control','private, no-store');return c.json(await admin(c,client=>overview(client)))})
financeRoutes.get('/clients/:id',async c=>{c.header('Cache-Control','private, no-store');return c.json(await admin(c,client=>account(client,uuid(c.req.param('id')))))})
financeRoutes.post('/clients/:id/terms',async c=>{
  const payload=await json(c.req.raw),clientId=uuid(c.req.param('id'))
  const mode=payload.modalidadCobro
  const days=payload.plazoPagoDias
  await admin(c,(client,userId)=>changeTerms(client,clientId,userId,String(mode),Number(days)))
  return c.json({ok:true})
})
financeRoutes.post('/payments',async c=>{
  const value=await json(c.req.raw)
  const payload:PaymentDraft={requestId:uuid(value.requestId),clienteId:uuid(value.clienteId),
    metodo:method(value.metodo),recaudadoPorId:value.recaudadoPorId==null?null:uuid(value.recaudadoPorId),
    observacion:note(value.observacion),aplicaciones:allocations(value.aplicaciones),confirmed:true}
  return c.json(await admin(c,(client,userId)=>registerPayment(client,userId,payload)),201)
})
financeRoutes.get('/payments/request/:id',async c=>{
  const requestId=uuid(c.req.param('id'))
  return c.json(await transaction(async client=>{
    const profile=await requireAdmin(client,c.get('identity'))
    const r=(await client.query<{id:string}>(
      'select id from public.pagos where request_id=$1 and registrado_por_id=$2',[requestId,profile.id])).rows[0]
    return {payment:r?await getPayment(client,r.id):null}
  }))
})
financeRoutes.post('/payments/:id/decision',async c=>{
  const value=await json(c.req.raw),status=value.estado
  if(status!=='CONFIRMADO'&&status!=='RECHAZADO'&&status!=='ANULADO')throw new ApiError(422,'Selecciona la decisión.')
  return c.json(await admin(c,(client,userId)=>reviewPayment(client,userId,uuid(c.req.param('id')),status,note(value.motivo))))
})
financeRoutes.post('/deliveries',async c=>{
  const value=await json(c.req.raw),technicianId=uuid(value.tecnicoId),requestId=uuid(value.requestId)
  return c.json(await admin(c,(client,userId)=>deliverCash(client,userId,technicianId,amount(value.monto),requestId,note(value.observacion))),201)
})
financeRoutes.post('/deliveries/:id/void',async c=>{
  const value=await json(c.req.raw)
  await admin(c,(client,userId)=>voidDelivery(client,userId,uuid(c.req.param('id')),note(value.motivo)))
  return c.json({ok:true})
})

// El técnico reporta únicamente sus servicios; la confirmación es siempre administrativa.
financeRoutes.get('/me',async c=>{c.header('Cache-Control','private, no-store');return c.json(await transaction(async client=>{
  const technician=await requireTechnician(client,c.get('identity'))
  const balance=(await cashBalance(client)).find(r=>r.id===technician.id)
  const rows=await client.query(`select id from public.pagos where registrado_por_id=$1
    order by creado_at desc limit 20`,[technician.id])
  const myPayments=await Promise.all(rows.rows.map((r:{id:string})=>getPayment(client,r.id)))
  return {balance:balance??{id:technician.id,nombre:technician.nombreCompleto,recaudado:0,entregado:0,saldo:0},pagos:myPayments}
}) )})
financeRoutes.get('/technician/services/:id/balance',async c=>{
  const serviceId=uuid(c.req.param('id'))
  return c.json(await transaction(async client=>{
    const tech=await requireTechnician(client,c.get('identity'))
    const row=(await client.query<{estado:string;disponible:string}>(`
      select s.estado,(s.valor_servicio-coalesce((select sum(a.monto)
        from public.pago_aplicaciones a join public.pagos p on p.id=a.pago_id
        where a.servicio_id=s.id and p.estado in ('PENDIENTE','CONFIRMADO')),0))::text as disponible
      from public.servicios s where s.id=$1::uuid and s.tipo_servicio='PRINCIPAL'
        and (s.tecnico_responsable_id=$2::uuid or coalesce(s.tecnicos_colaboradores_ids_json,'[]'::jsonb) ? $2::text)`,[serviceId,tech.id])).rows[0]
    if(!row)throw new ApiError(404,'El servicio no está disponible.')
    return {estado:row.estado,disponible:Math.max(0,Number(row.disponible))}
  }))
})
financeRoutes.post('/technician/services/:id/payments',async c=>{
  const value=await json(c.req.raw),serviceId=uuid(c.req.param('id')),requestId=uuid(value.requestId)
  const result=await transaction(async client=>{
    const tech=await requireTechnician(client,c.get('identity'))
    const row=(await client.query<{clienteId:string}>(`select se.negocio_id as "clienteId" from public.servicios s
      join public.sedes se on se.id=s.sede_id where s.id=$1::uuid`,[serviceId])).rows[0]
    if(!row)throw new ApiError(404,'El servicio no está disponible.')
    const metodo=method(value.metodo)
    return registerPayment(client,tech.id,{requestId,clienteId:row.clienteId,metodo,
      recaudadoPorId:metodo==='EFECTIVO'?tech.id:null,
      observacion:note(value.observacion),aplicaciones:[{servicioId,monto:amount(value.monto)}],
      confirmed:false,technicianId:tech.id})
  })
  return c.json(result,201)
})
async function accessiblePayment(c:Context<Environment>,paymentId:string):Promise<{id:string;estado:string;metodo:string;registrado_por_id:string}> {
  return transaction(async client=>{
    const identity=c.get('identity')
    const user=await requireTechnician(client,identity).catch(()=>requireAdmin(client,identity))
    const row=(await client.query<{id:string;estado:string;metodo:string;registrado_por_id:string}>(`
      select id,estado,metodo,registrado_por_id from public.pagos where id=$1`,[paymentId])).rows[0]
    if(!row)throw new ApiError(404,'El comprobante no está disponible.')
    if(user.rolActivo!=='ADMINISTRADOR' && row.registrado_por_id!==user.id)throw new ApiError(404,'El comprobante no está disponible.')
    return row
  })
}
financeRoutes.post('/payments/:id/proof/upload-url',async c=>{
  const paymentId=uuid(c.req.param('id')),value=await json(c.req.raw)
  const row=await accessiblePayment(c,paymentId)
  if(row.estado!=='PENDIENTE'||row.metodo!=='TRANSFERENCIA')throw new ApiError(409,'Este comprobante no admite cambios.')
  const fileName=note(value.fileName,255),contentType=note(value.contentType,100)
  const size=amount(value.size)
  return c.json(createPaymentProofUploadUrl({paymentId,fileName,contentType,size}))
})
financeRoutes.post('/payments/:id/proof',async c=>{
  const paymentId=uuid(c.req.param('id')),value=await json(c.req.raw)
  const storagePath=note(value.storagePath,1000)
  await accessiblePayment(c,paymentId)
  assertPaymentProofStoragePath(storagePath,paymentId)
  if(!await paymentProofObjectExists(storagePath,paymentId))throw new ApiError(422,'Carga el archivo antes de guardarlo.')
  await transaction(async client=>{
    const identity=c.get('identity')
    const user=await requireTechnician(client,identity).catch(()=>requireAdmin(client,identity))
    const r=await client.query(`update public.pagos set comprobante_storage_path=$2
      where id=$1 and estado='PENDIENTE' and metodo='TRANSFERENCIA' and
      ($3::boolean or registrado_por_id=$4::uuid) returning id`,
      [paymentId,storagePath,user.rolActivo==='ADMINISTRADOR',user.id])
    if(!r.rowCount)throw new ApiError(409,'El pago cambió de estado. Actualiza la pantalla.')
    await auditFinance(client,user.id,'PAGO_COMPROBANTE',paymentId,{adjuntado:true})
  })
  return c.json({ok:true})
})
financeRoutes.get('/payments/:id/proof',async c=>{
  const paymentId=uuid(c.req.param('id'))
  await accessiblePayment(c,paymentId)
  const path=await transaction(async client=>{
    const r=(await client.query<{comprobante_storage_path:string|null}>('select comprobante_storage_path from public.pagos where id=$1',[paymentId])).rows[0]
    return r?.comprobante_storage_path
  })
  if(!path)throw new ApiError(404,'No hay comprobante adjunto.')
  return c.json({url:createPaymentProofReadUrl(path,paymentId)})
})
financeRoutes.onError((error,c)=>{
  if(error instanceof ApiError)return c.json({error:error.message},error.status as ContentfulStatusCode)
  const code=(error as {code?:string}).code
  if(['23505','40001','40P01'].includes(code??''))return c.json({error:'El registro cambió. Actualiza y vuelve a intentar.'},409)
  if(['23503','23514','23502','22P02','P0001'].includes(code??''))return c.json({error:'Revisa los datos y su relación con los servicios.'},422)
  console.error('FINANCE_ERROR',{code:code??'UNEXPECTED'})
  return c.json({error:'No fue posible completar la operación.'},500)
})

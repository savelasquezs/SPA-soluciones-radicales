import type { PoolClient } from 'pg'
import type { ClienteCartera, DetalleCartera, EntregaEfectivo, Pago, RegistrarPago, ResumenFinanzas, ServicioCartera, TecnicoCaja } from '../../../src/types/finance'
import { ApiError } from '../auth'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const limit = 1_000_000_000_000
const n = (value: unknown) => Number(value ?? 0)
const invalid = (message = 'Revisa los datos del movimiento.') => new ApiError(422, message, 'VALIDATION')
const conflict = (message: string) => new ApiError(409, message, 'FINANCE_CONFLICT')
export function isId(value: unknown): value is string { return typeof value === 'string' && uuid.test(value) }
export function amount(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value <= 0 || value > limit) throw invalid('Ingresa un monto válido en pesos.')
  return value
}

export async function auditFinance(client: PoolClient, actor: string, action: string, id: string, detail: unknown): Promise<void> {
  await client.query('insert into public.auditoria(usuario_id,accion,entidad,registro_id,detalle_json) values ($1,$2,$3,$4,$5::jsonb)',
    [actor,action,'Pagos y caja',id,JSON.stringify(detail)])
}
const PAYMENTS_SQL = `select p.id,p.cliente_id as "clienteId",n.nombre as "clienteNombre",
  p.metodo,p.estado,p.monto,p.recaudado_por_id as "recaudadoPorId",
  r.nombre_completo as "recaudadoPorNombre",u.nombre_completo as "registradoPorNombre",
  p.observacion,p.motivo_revision as "motivoRevision",p.fecha_pago as "fechaPago",
  (p.comprobante_storage_path is not null) as "comprobanteDisponible",
  coalesce((select jsonb_agg(jsonb_build_object('servicioId',a.servicio_id,'solicitud',s.solicitud,'monto',a.monto)
    order by s.solicitud) from public.pago_aplicaciones a join public.servicios s on s.id=a.servicio_id
    where a.pago_id=p.id),'[]'::jsonb) as aplicaciones
  from public.pagos p join public.negocios n on n.id=p.cliente_id
  join public.usuarios u on u.id=p.registrado_por_id
  left join public.usuarios r on r.id=p.recaudado_por_id`
const payments = async (client: PoolClient, clause: string, values: unknown[] = []): Promise<Pago[]> =>
  (await client.query<Pago>(PAYMENTS_SQL+' '+clause, values)).rows.map(p=>({...p,monto:n(p.monto),
    aplicaciones:p.aplicaciones.map(a=>({...a,monto:n(a.monto)}))}))

export async function getPayment(client: PoolClient, paymentId: string): Promise<Pago> {
  const row=(await payments(client,'where p.id=$1::uuid',[paymentId]))[0]
  if (!row) throw new ApiError(404,'El pago no está disponible.')
  return row
}

const CLIENTS_SQL = `with billed as (
  select se.negocio_id as id,coalesce(sum(s.valor_servicio),0) as realizado
  from public.servicios s join public.sedes se on se.id=s.sede_id
  where s.tipo_servicio='PRINCIPAL' and s.estado='FINALIZADO' group by se.negocio_id
), receipts as (
  select p.cliente_id as id,
    coalesce(sum(a.monto) filter(where s.estado='FINALIZADO'),0) as pagado,
    coalesce(sum(a.monto) filter(where s.estado<>'FINALIZADO'),0) as anticipos
  from public.pagos p join public.pago_aplicaciones a on a.pago_id=p.id
  join public.servicios s on s.id=a.servicio_id
  where p.estado='CONFIRMADO' group by p.cliente_id
)
select n.id,n.nombre,n.modalidad_cobro as "modalidadCobro",n.plazo_pago_dias as "plazoPagoDias",
  coalesce(b.realizado,0) as realizado,coalesce(r.pagado,0) as pagado,
  greatest(0,coalesce(b.realizado,0)-coalesce(r.pagado,0)) as saldo,
  coalesce(r.anticipos,0) as anticipos
from public.negocios n left join billed b on b.id=n.id left join receipts r on r.id=n.id`

export async function clientsBalance(client: PoolClient): Promise<ClienteCartera[]> {
  return (await client.query<ClienteCartera>(CLIENTS_SQL+' order by saldo desc,n.nombre,n.id')).rows
    .map(row=>({...row,realizado:n(row.realizado),pagado:n(row.pagado),saldo:n(row.saldo),anticipos:n(row.anticipos)}))
}
export async function cashBalance(client: PoolClient): Promise<TecnicoCaja[]> {
  const rows=await client.query<TecnicoCaja>(`with collected as (
    select p.recaudado_por_id as id,sum(p.monto) as recaudado,
      sum(p.monto) filter(where (p.fecha_pago at time zone 'America/Bogota')::date = (now() at time zone 'America/Bogota')::date) as "recaudadoHoy"
    from public.pagos p where p.metodo='EFECTIVO' and p.estado='CONFIRMADO' and p.destino_efectivo='TECNICO'
    group by p.recaudado_por_id
  ),delivered as (
    select tecnico_id as id,sum(monto) as entregado,
      sum(monto) filter(where (fecha_hora at time zone 'America/Bogota')::date=(now() at time zone 'America/Bogota')::date) as "entregadoHoy"
    from public.movimientos_efectivo
    where anulado_at is null group by tecnico_id
  )
  select u.id,u.nombre_completo as nombre,coalesce(c.recaudado,0) as recaudado,
    coalesce(c."recaudadoHoy",0) as "recaudadoHoy",coalesce(d.entregado,0) as entregado,
    coalesce(d."entregadoHoy",0) as "entregadoHoy",
    coalesce(c.recaudado,0)-coalesce(d.entregado,0) as saldo
  from public.usuarios u left join collected c on c.id=u.id left join delivered d on d.id=u.id
  where u.es_tecnico order by saldo desc,u.nombre_completo`)
  return rows.rows.map(row=>({...row,recaudado:n(row.recaudado),recaudadoHoy:n(row.recaudadoHoy),entregado:n(row.entregado),entregadoHoy:n(row.entregadoHoy),saldo:n(row.saldo)}))
}
export async function deliveries(client: PoolClient, technicianId?: string): Promise<EntregaEfectivo[]> {
  const rows=await client.query<EntregaEfectivo>(`select m.id,m.tecnico_id as "tecnicoId",m.monto,
    m.fecha_hora as "fechaHora",u.nombre_completo as "registradoPorNombre",
    coalesce(m.observacion,'') as observacion,m.anulado_at as "anuladoAt"
    from public.movimientos_efectivo m join public.usuarios u on u.id=m.registrado_por_id
    where ($1::uuid is null or m.tecnico_id=$1::uuid)
    order by m.fecha_hora desc,m.id desc limit 100`,[technicianId??null])
  return rows.rows.map(row=>({...row,monto:n(row.monto)}))
}
export async function overview(client: PoolClient): Promise<ResumenFinanzas> {
  const [clientes,tecnicos,pagosRevision,movimientos,entregas,central]=await Promise.all([
    clientsBalance(client),cashBalance(client),
    payments(client,"where p.estado='PENDIENTE' order by p.creado_at desc limit 80"),
    payments(client,'order by p.creado_at desc limit 50'),deliveries(client),
    client.query<{total:string}>(`select (
      coalesce((select sum(monto) from public.pagos
        where metodo='EFECTIVO' and estado='CONFIRMADO' and destino_efectivo='CAJA'),0)
      +coalesce((select sum(monto) from public.movimientos_efectivo
        where anulado_at is null),0))::text as total`),
  ])
  return {clientes,tecnicos,pagosRevision,movimientos,entregas,cajaCentral:n(central.rows[0]?.total)}
}
export async function account(client: PoolClient, clientId: string): Promise<DetalleCartera> {
  const cliente=(await clientsBalance(client)).find(item=>item.id===clientId)
  if (!cliente) throw new ApiError(404,'El cliente no está disponible.')
  const rows=await client.query<ServicioCartera>(`select s.id,s.solicitud,se.nombre as "sedeNombre",
    coalesce(s.fin_real,s.inicio_programado) as fecha,s.estado,s.valor_servicio as valor,
    coalesce((select sum(a.monto) from public.pago_aplicaciones a join public.pagos p on p.id=a.pago_id
      where a.servicio_id=s.id and p.estado='CONFIRMADO'),0) as abonado,
    coalesce((select sum(a.monto) from public.pago_aplicaciones a join public.pagos p on p.id=a.pago_id
      where a.servicio_id=s.id and p.estado='PENDIENTE'),0) as "porConfirmar",
    greatest(0,s.valor_servicio-coalesce((select sum(a.monto) from public.pago_aplicaciones a
      join public.pagos p on p.id=a.pago_id where a.servicio_id=s.id and p.estado='CONFIRMADO'),0)) as saldo,
    greatest(0,s.valor_servicio-coalesce((select sum(a.monto) from public.pago_aplicaciones a
      join public.pagos p on p.id=a.pago_id where a.servicio_id=s.id and p.estado in ('CONFIRMADO','PENDIENTE')),0)) as disponible,
    case when s.estado='FINALIZADO'
      then (s.fin_real at time zone 'America/Bogota')::date+n.plazo_pago_dias
      else null end as vencimiento
    from public.servicios s join public.sedes se on se.id=s.sede_id
    join public.negocios n on n.id=se.negocio_id
    where n.id=$1::uuid and s.tipo_servicio='PRINCIPAL' and s.estado<>'CANCELADO'
    order by (s.estado='FINALIZADO') desc,s.inicio_programado desc limit 250`,[clientId])
  return {cliente,servicios:rows.rows.map(row=>({...row,valor:n(row.valor),abonado:n(row.abonado),porConfirmar:n(row.porConfirmar),saldo:n(row.saldo),disponible:n(row.disponible)})),
    pagos:await payments(client,'where p.cliente_id=$1::uuid order by p.creado_at desc limit 100',[clientId])}
}

export async function changeTerms(client: PoolClient, clientId: string, actor: string, mode: string, days: number): Promise<void> {
  if (!['POR_SERVICIO','CREDITO'].includes(mode) || !Number.isInteger(days) || days<0 || days>365) throw invalid('Revisa las condiciones de pago.')
  const original=(await client.query('select modalidad_cobro,plazo_pago_dias from public.negocios where id=$1::uuid for update',[clientId])).rows[0]
  if (!original) throw new ApiError(404,'El cliente no está disponible.')
  await client.query('update public.negocios set modalidad_cobro=$2,plazo_pago_dias=$3 where id=$1::uuid',[clientId,mode,days])
  await auditFinance(client,actor,'CLIENTE_CONDICIONES_COBRO',clientId,{antes:original,despues:{mode,days}})
}

export async function syncLegacyStatus(client: PoolClient, serviceIds: string[]): Promise<void> {
  for (const serviceId of serviceIds) {
    const totals=await client.query<{total: string; metodo: string|null; receptor: string|null; fecha: Date|null; admin: string|null}>(`
      select coalesce(sum(a.monto),0)::text as total,
        (array_agg(p.metodo order by p.confirmado_at desc) filter (where p.id is not null))[1] as metodo,
        (array_agg(p.recaudado_por_id order by p.confirmado_at desc) filter (where p.id is not null))[1] as receptor,
        max(p.fecha_pago) as fecha,
        (array_agg(p.confirmado_por_id order by p.confirmado_at desc) filter (where p.id is not null))[1] as admin
      from public.pago_aplicaciones a join public.pagos p on p.id=a.pago_id and p.estado='CONFIRMADO'
      where a.servicio_id=$1::uuid`,[serviceId])
    const data=totals.rows[0]!, paid=n(data.total)
    const row=(await client.query<{valor_servicio:string;estado_pago:string}>('select valor_servicio,estado_pago from public.servicios where id=$1::uuid',[serviceId])).rows[0]
    if (!row) throw invalid('El servicio ya no está disponible.')
    await client.query(`update public.servicios set
      estado_pago=case when $2::bigint >= valor_servicio then 'CONFIRMADO'
        when $2::bigint>0 then 'PENDIENTE' else 'SIN_REGISTRAR' end,
      metodo_pago=coalesce($3,metodo_pago),
      recaudado_por_id=case when $3='EFECTIVO' then $4::uuid else null end,
      tecnico_que_recauda_id=case when $3='EFECTIVO' then $4::uuid else null end,
      pago_fecha=$5,pago_confirmado_por_id=case when $2::bigint>=valor_servicio then $6::uuid else null end,
      pago_confirmado_at=case when $2::bigint>=valor_servicio then now() else null end
      where id=$1::uuid`,
      [serviceId,paid,data.metodo,data.receptor,data.fecha,data.admin])
  }
}

export interface PaymentDraft extends RegistrarPago { confirmed: boolean; technicianId?: string }
export async function registerPayment(client: PoolClient, actor: string, draft: PaymentDraft): Promise<Pago> {
  if (!isId(draft.requestId) || !isId(draft.clienteId) || !Array.isArray(draft.aplicaciones)
    || !draft.aplicaciones.length || draft.aplicaciones.length>30) throw invalid()
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`finance:payment:${draft.requestId}`])
  if (draft.metodo!=='EFECTIVO' && draft.metodo!=='TRANSFERENCIA') throw invalid()
  const observation=(draft.observacion??'').trim()
  if (observation.length>1000) throw invalid('La observación es demasiado larga.')
  const amounts=new Map<string,number>()
  for(const a of draft.aplicaciones) {
    if (!isId(a.servicioId) || amounts.has(a.servicioId)) throw invalid('Selecciona servicios diferentes.')
    amounts.set(a.servicioId,amount(a.monto))
  }
  const total=[...amounts.values()].reduce((sum,m)=>sum+m,0)
  if (!Number.isSafeInteger(total) || total>limit) throw invalid('El total del pago no es válido.')
  const receiver=draft.metodo==='EFECTIVO' ? draft.recaudadoPorId : null
  const destination=receiver ? (draft.technicianId || receiver!==actor ? 'TECNICO' : 'CAJA') : null
  if (draft.metodo==='EFECTIVO' && (!isId(receiver) || (draft.technicianId && receiver!==actor))) throw invalid('Selecciona quién recibió el efectivo.')
  const existing=(await client.query<{id:string;cliente_id:string;metodo:string;monto:string;recaudado_por_id:string|null}>(
    'select id,cliente_id,metodo,monto,recaudado_por_id from public.pagos where request_id=$1',[draft.requestId])).rows[0]
  if (existing) {
    const saved=await getPayment(client,existing.id)
    if (existing.cliente_id!==draft.clienteId || existing.metodo!==draft.metodo || n(existing.monto)!==total
      || existing.recaudado_por_id!==receiver || saved.aplicaciones.length!==amounts.size
      || saved.aplicaciones.some(a=>amounts.get(a.servicioId)!==a.monto)) throw conflict('Este intento ya corresponde a otro pago.')
    return saved
  }
  if (receiver) {
    const user=(await client.query<{es_tecnico:boolean;es_admin:boolean;activo:boolean}>(
      'select es_tecnico,es_admin,activo from public.usuarios where id=$1::uuid for update',[receiver])).rows[0]
    if (!user?.activo || (!user.es_tecnico && !(user.es_admin && receiver===actor))) throw invalid('El receptor de efectivo no está autorizado.')
  }
  // Deterministic service lock order: two concurrent receipts cannot exceed a visit's value.
  const ids=[...amounts.keys()].sort()
  const rows=(await client.query<{id:string;cliente_id:string;estado:string;tipo_servicio:string;valor_servicio:string;tecnico_responsable_id:string;tecnicos_colaboradores_ids_json:string[]}>(
    `select s.id,se.negocio_id as cliente_id,s.estado,s.tipo_servicio,s.valor_servicio,
      s.tecnico_responsable_id,s.tecnicos_colaboradores_ids_json
      from public.servicios s join public.sedes se on se.id=s.sede_id
      where s.id=any($1::uuid[]) order by s.id for update of s`,[ids])).rows
  if (rows.length!==ids.length) throw invalid('Algún servicio no está disponible.')
  for(const s of rows) {
    if (s.cliente_id!==draft.clienteId || s.tipo_servicio!=='PRINCIPAL' || s.estado==='CANCELADO') throw invalid('El servicio no pertenece al cliente o no admite cobros.')
    if (draft.technicianId && (
      !['EN_PROCESO','FINALIZADO'].includes(s.estado)
      || (s.tecnico_responsable_id!==actor && !(s.tecnicos_colaboradores_ids_json??[]).includes(actor)))) {
      throw new ApiError(403,'No puedes registrar pagos en ese servicio.')
    }
  }
  const used=(await client.query<{servicio_id:string;total:string}>(`select a.servicio_id,
    coalesce(sum(a.monto),0)::text as total
    from public.pago_aplicaciones a join public.pagos p on p.id=a.pago_id
    where a.servicio_id=any($1::uuid[]) and p.estado in ('PENDIENTE','CONFIRMADO')
    group by a.servicio_id`,[ids])).rows
  const allocated=new Map(used.map(v=>[v.servicio_id,n(v.total)]))
  for(const row of rows) if ((allocated.get(row.id)??0)+amounts.get(row.id)!>n(row.valor_servicio))
    throw conflict('El servicio tiene un cobro pendiente o no admite más abonos. Actualiza la cartera.')
  const inserted=(await client.query<{id:string}>(`insert into public.pagos
    (request_id,cliente_id,monto,metodo,estado,recaudado_por_id,destino_efectivo,registrado_por_id,
     confirmado_por_id,confirmado_at,observacion)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,case when $10::boolean then now() else null end,$11)
    returning id`,
    [draft.requestId,draft.clienteId,total,draft.metodo,draft.confirmed?'CONFIRMADO':'PENDIENTE',
      receiver,destination,actor,draft.confirmed?actor:null,draft.confirmed,observation])).rows[0]!
  for (const serviceId of ids) await client.query(
    'insert into public.pago_aplicaciones(pago_id,servicio_id,monto) values ($1,$2,$3)',
    [inserted.id,serviceId,amounts.get(serviceId)])
  if (draft.confirmed) await syncLegacyStatus(client,ids)
  await auditFinance(client,actor,draft.confirmed?'PAGO_CONFIRMADO':'PAGO_REPORTADO',inserted.id,
    {clienteId:draft.clienteId,metodo:draft.metodo,total,servicios:ids,receiver})
  return getPayment(client,inserted.id)
}

export async function reviewPayment(client: PoolClient, actor: string, paymentId: string, action: 'CONFIRMADO'|'RECHAZADO'|'ANULADO', reason: string): Promise<Pago> {
  const row=(await client.query<{id:string;estado:string;metodo:string;monto:string;recaudado_por_id:string|null;destino_efectivo:string|null;registrado_por_id:string;comprobante_storage_path:string|null}>(
    'select id,estado,metodo,monto,recaudado_por_id,destino_efectivo,registrado_por_id,comprobante_storage_path from public.pagos where id=$1::uuid for update',[paymentId])).rows[0]
  if (!row) throw new ApiError(404,'El pago no está disponible.')
  if (row.estado===action) return getPayment(client,paymentId)
  if (action==='ANULADO' ? row.estado!=='CONFIRMADO' : row.estado!=='PENDIENTE') throw conflict('El pago cambió de estado. Actualiza la pantalla.')
  if (action!=='CONFIRMADO' && !reason.trim()) throw invalid('Indica el motivo de la corrección.')
  if (action==='CONFIRMADO' && row.metodo==='TRANSFERENCIA' && row.registrado_por_id!==actor && !row.comprobante_storage_path)
    throw invalid('El técnico debe adjuntar el comprobante de la transferencia.')
  if (row.recaudado_por_id) await client.query('select id from public.usuarios where id=$1 for update',[row.recaudado_por_id])
  const ids=(await client.query<{servicio_id:string}>('select servicio_id from public.pago_aplicaciones where pago_id=$1 order by servicio_id',[paymentId]))
    .rows.map(r=>r.servicio_id)
  await client.query('select id from public.servicios where id=any($1::uuid[]) order by id for update',[ids])
  if (action==='ANULADO' && row.recaudado_por_id && row.destino_efectivo==='TECNICO') {
    const balance=(await cashBalance(client)).find(x=>x.id===row.recaudado_por_id)?.saldo ?? 0
    if (balance<n(row.monto)) throw conflict('El efectivo ya fue entregado. Primero debe corregirse esa entrega.')
  }
  if (action==='CONFIRMADO') {
    const current=(await client.query<{servicio_id:string;remaining:string}>(`select a.servicio_id,
      s.valor_servicio-coalesce((select sum(x.monto) from public.pago_aplicaciones x
        join public.pagos p on p.id=x.pago_id and p.estado='CONFIRMADO'
        where x.servicio_id=a.servicio_id),0) as remaining
      from public.pago_aplicaciones a join public.servicios s on s.id=a.servicio_id
      where a.pago_id=$1`,[paymentId])).rows
    const mine=(await client.query<{servicio_id:string;monto:string}>(
      'select servicio_id,monto from public.pago_aplicaciones where pago_id=$1',[paymentId])).rows
    if(mine.some(v=>n(current.find(x=>x.servicio_id===v.servicio_id)?.remaining)<n(v.monto)))
      throw conflict('Otro cobro cubrió este servicio. Revisa la cartera antes de confirmar.')
  }
  await client.query(`update public.pagos set estado=$2,confirmado_por_id=case when $2='CONFIRMADO' then $3::uuid else null end,
    confirmado_at=case when $2='CONFIRMADO' then now() else null end,
    motivo_revision=case when $2='CONFIRMADO' then null else $4 end where id=$1`,
    [paymentId,action,actor,reason.trim()])
  if (action!=='RECHAZADO') await syncLegacyStatus(client,ids)
  await auditFinance(client,actor,'PAGO_'+action,paymentId,{motivo:reason.trim(),servicios:ids})
  return getPayment(client,paymentId)
}

export async function deliverCash(client: PoolClient, actor: string, technicianId: string, value: number, requestId: string, note: string): Promise<EntregaEfectivo> {
  if(!isId(technicianId)||!isId(requestId)||note.length>1000) throw invalid()
  amount(value)
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`finance:delivery:${requestId}`])
  const previous=(await client.query<{id:string;monto:string;tecnico_id:string}>(
    'select id,monto,tecnico_id from public.movimientos_efectivo where request_id=$1',[requestId])).rows[0]
  if(previous) {
    if (n(previous.monto)!==value || previous.tecnico_id!==technicianId) throw conflict('Este intento ya corresponde a otra entrega.')
  } else {
    const tech=(await client.query<{es_tecnico:boolean}>(
      'select es_tecnico from public.usuarios where id=$1::uuid for update',[technicianId])).rows[0]
    if(!tech?.es_tecnico)throw invalid('Selecciona un técnico.')
    const available=(await cashBalance(client)).find(x=>x.id===technicianId)?.saldo??0
    if(value>available)throw conflict('El monto supera el efectivo pendiente del técnico.')
    await client.query(`insert into public.movimientos_efectivo
      (tecnico_id,monto,fecha_hora,registrado_por_id,observacion,request_id)
      values ($1,$2,now(),$3,$4,$5)`,[technicianId,value,actor,note.trim(),requestId])
  }
  const id=previous?.id??(await client.query<{id:string}>(
    'select id from public.movimientos_efectivo where request_id=$1',[requestId])).rows[0]!.id
  if(!previous)await auditFinance(client,actor,'CAJA_ENTREGA',id,{tecnicoId:technicianId,monto:value})
  const rows=await deliveries(client,technicianId)
  return rows.find(r=>r.id===id)!
}
export async function voidDelivery(client: PoolClient, actor: string, id: string, reason: string): Promise<void> {
  if (!reason.trim()) throw invalid('Indica el motivo de la corrección.')
  const move=(await client.query<{id:string;anulado_at:Date|null}>(
    'select id,anulado_at from public.movimientos_efectivo where id=$1::uuid for update',[id])).rows[0]
  if(!move)throw new ApiError(404,'La entrega no existe.')
  if(move.anulado_at)return
  await client.query(`update public.movimientos_efectivo
    set anulado_at=now(),anulado_por_id=$2,motivo_anulacion=$3 where id=$1`,
    [id,actor,reason.trim()])
  await auditFinance(client,actor,'CAJA_ENTREGA_ANULADA',id,{motivo:reason.trim()})
}

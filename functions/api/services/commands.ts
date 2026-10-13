import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { AdminService, ConfirmationEmail, ScheduleConflict, ServiceInput, ServiceMutation, ServicePaymentInput, ServiceSchedule, ServiceReassignment, UpcomingPatch, UpcomingService } from '../../../src/types/adminServices'
import { formatServiceDate, isServiceId, scheduleEnd, scheduleFromRecord, suggestReinforcement, toBogotaInput } from '../../../src/helpers/adminServices'
import { ApiError } from '../auth'
import { getService, getServices, getUpcoming, pendingCount } from './queries'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
export async function command<T>(client: PoolClient, actorId: string, requestId: string, operation: string, input: unknown, work: () => Promise<T>): Promise<T> {
  if (!isServiceId(requestId)) throw new ApiError(422, 'Falta el identificador de la operación.', 'VALIDATION')
  const hash = createHash('sha256').update(canonical(input)).digest('hex')
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`admin-service-command:${requestId}`])
  const previous = (await client.query<{ actor_id: string; operation: string; payload_hash: string; result: T }>('select actor_id,operation,payload_hash,result from private.service_admin_commands where request_id=$1', [requestId])).rows[0]
  if (previous) {
    if (previous.actor_id !== actorId || previous.operation !== operation || previous.payload_hash !== hash) throw new ApiError(409, 'Esta operación ya se guardó con otros datos. Actualiza el registro antes de continuar.', 'REQUEST_REUSED')
    return previous.result
  }
  await client.query("select set_config('app.admin_actor',$1,true)", [actorId])
  const result = await work()
  await client.query('insert into private.service_admin_commands(request_id,actor_id,operation,payload_hash,result) values($1,$2,$3,$4,$5::jsonb)', [requestId,actorId,operation,hash,JSON.stringify(result)])
  return result
}
export async function audit(client: PoolClient, actorId: string, action: string, id: string, detail: unknown, entity = 'Servicios'): Promise<void> {
  await client.query('insert into public.auditoria(usuario_id,accion,entidad,registro_id,detalle_json) values($1,$2,$3,$4,$5::jsonb)', [actorId,action,entity,id,JSON.stringify(detail)])
}
export function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) throw new ApiError(409, 'Otra persona modificó el registro. Tus cambios se conservan; carga la versión actual para revisarlos.', 'VERSION_CONFLICT')
}
async function lockFamily(client: PoolClient, id: string): Promise<string[]> {
  const row = (await client.query<{ root: string }>('select coalesce(servicio_principal_id,id) as root from public.servicios where id=$1', [id])).rows[0]
  if (!row) throw new ApiError(404, 'El servicio no está disponible.')
  return (await client.query<{ id: string }>('select id from public.servicios where id=$1 or servicio_principal_id=$1 order by id for update', [row.root])).rows.map(value => value.id)
}
function mutable(record: AdminService): void {
  if (record.estado !== 'PROGRAMADO') throw new ApiError(409, 'Solo puedes editar la programación de un servicio Programado.', 'SERVICE_NOT_PROGRAMMED')
}
async function siteForScheduling(client: PoolClient, id: string): Promise<{ maneja_refuerzo: boolean; tipo_sede: 'NEGOCIO' | 'RESIDENCIAL' }> {
  const site = (await client.query<{ maneja_refuerzo: boolean; tipo_sede: 'NEGOCIO' | 'RESIDENCIAL' }>(`select s.maneja_refuerzo,s.tipo_sede from public.sedes s join public.negocios n on n.id=s.negocio_id
    where s.id=$1 and s.activo and n.activo and s.tipo_sede=n.tipo_cliente
      and ((s.tipo_sede='NEGOCIO' and s.valor_servicio is not null and s.periodicidad_meses > 0 and s.duracion_servicio_minutos > 0)
        or s.tipo_sede='RESIDENCIAL')`, [id])).rows[0]
  if (!site) throw new ApiError(422, 'Selecciona una sede activa con su configuración de servicio completa.', 'VALIDATION', { fields: { sedeId: 'Esta sede no está disponible para programación.' } })
  return site
}
async function validateTeam(client: PoolClient, schedule: ServiceSchedule, prefix: string): Promise<void> {
  const ids = [schedule.tecnicoResponsableId,...schedule.tecnicosColaboradoresIds]
  const { rows } = await client.query<{ id: string; valid: boolean }>(`select id,(certificado_storage_path is null or certificado_fecha_vencimiento >= $2::date) as valid
    from public.usuarios where id=any($1::uuid[]) and activo and es_tecnico`, [ids,toBogotaInput(schedule.inicioProgramado).slice(0,10)])
  const fields: Record<string,string> = {}
  const responsible = rows.find(row => row.id === schedule.tecnicoResponsableId)
  if (!responsible || !responsible.valid) fields[`${prefix}.tecnicoResponsableId`] = 'El responsable debe estar activo y su certificado registrado debe estar vigente en la fecha de la visita.'
  if (schedule.tecnicosColaboradoresIds.some(id => !rows.some(row => row.id === id))) fields[`${prefix}.tecnicosColaboradoresIds`] = 'Todos los colaboradores deben ser técnicos activos.'
  if (Object.keys(fields).length) throw new ApiError(422, 'Revisa el equipo asignado.', 'VALIDATION', { fields })
}
async function validatePlannedCollector(client: PoolClient, id: string | null): Promise<void> {
  if (!id) return
  if (!(await client.query('select id from public.usuarios where id=$1 and es_tecnico and activo', [id])).rowCount) throw new ApiError(422, 'Selecciona un técnico válido para el recaudo previsto.', 'VALIDATION', { fields: { 'cobro.tecnicoRecaudoPrevistoId': 'El técnico seleccionado no está disponible.' } })
}
async function validatePaymentReceiver(client: PoolClient, id: string | null, actorId: string, previousId: string | null, field = 'recaudadoPorId'): Promise<void> {
  if (!id) return
  const receiver=(await client.query<{ id: string; es_tecnico: boolean; es_admin: boolean; activo: boolean }>(
    'select id,es_tecnico,es_admin,activo from public.usuarios where id=$1',
    [id],
  )).rows[0]
  const currentAdmin=receiver?.id===actorId && receiver.es_admin && receiver.activo
  const technician=Boolean(receiver?.es_tecnico && receiver.activo)
  const historicalAdmin=receiver?.id===previousId && receiver.es_admin
  if (!receiver || (!currentAdmin && !technician && !historicalAdmin)) throw new ApiError(
    422,
    'Selecciona quién recibió realmente el efectivo.',
    'VALIDATION',
    { fields: { [field]: 'Selecciona un técnico o el administrador que está registrando el pago.' } },
  )
}
type ScheduledCandidate = { id: string | null; schedule: ServiceSchedule; version?: number }
type OccupiedService = {
  id: string; solicitud: string; clienteNombre: string; sedeNombre: string
  version: number; inicioProgramado: string; finProgramado: string
  tecnicoResponsableId: string; tecnicosColaboradoresIds: string[]
}
const teamIds = (schedule: ServiceSchedule) => [schedule.tecnicoResponsableId, ...schedule.tecnicosColaboradoresIds]
const overlapsTime = (a: ServiceSchedule,b: ServiceSchedule) =>
  new Date(a.inicioProgramado).getTime() < new Date(scheduleEnd(b)).getTime()
  && new Date(b.inicioProgramado).getTime() < new Date(scheduleEnd(a)).getTime()
const busyIds = (item: OccupiedService) => [item.tecnicoResponsableId,...item.tecnicosColaboradoresIds]
const storedSchedule = (item: OccupiedService): ServiceSchedule => ({
  inicioProgramado:item.inicioProgramado,
  duracionMinutos:Math.round((new Date(item.finProgramado).getTime()-new Date(item.inicioProgramado).getTime())/60_000),
  tecnicoResponsableId:item.tecnicoResponsableId,
  tecnicosColaboradoresIds:item.tecnicosColaboradoresIds,
})
async function occupiedServices(client:PoolClient, schedule:ServiceSchedule, ignored:string[]):Promise<OccupiedService[]> {
  const {rows}=await client.query<{record:OccupiedService}>(`select jsonb_build_object(
    'id',s.id,'solicitud',s.solicitud,'clienteNombre',n.nombre,'sedeNombre',se.nombre,
    'version',s.version,'inicioProgramado',s.inicio_programado,'finProgramado',s.fin_programado,
    'tecnicoResponsableId',s.tecnico_responsable_id,
    'tecnicosColaboradoresIds',coalesce(s.tecnicos_colaboradores_ids_json,'[]'::jsonb)) as record
    from public.servicios s join public.sedes se on se.id=s.sede_id join public.negocios n on n.id=se.negocio_id
    where s.estado in ('PROGRAMADO','EN_PROCESO') and s.inicio_programado < $2::timestamptz
      and s.fin_programado > $1::timestamptz and not(s.id=any($3::uuid[]))
    order by s.inicio_programado,s.id`,[schedule.inicioProgramado,scheduleEnd(schedule),ignored])
  return rows.map(row=>row.record)
}
async function lockTechnicianSchedules(client:PoolClient, schedules:ServiceSchedule[]):Promise<void> {
  for(const id of [...new Set(schedules.flatMap(teamIds))].sort()) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`service-technician:${id}`])
  }
}
export async function checkSchedules(client: PoolClient, candidates: ScheduledCandidate[], ignored: string[], previousTeams: ServiceSchedule[] = []): Promise<void> {
  for(const [index,candidate] of candidates.entries()) await validateTeam(client,candidate.schedule,index===1 ? 'refuerzo' : 'programacion')
  // Lock all old and new assignments. Every administrative scheduling write must use
  // this lock so a second transaction cannot book the same technician concurrently.
  await lockTechnicianSchedules(client,[...candidates.map(row=>row.schedule),...previousTeams])
  const conflicts: ScheduleConflict[]=[]
  for(const [index,candidate] of candidates.entries()) {
    const schedule=candidate.schedule
    const occupied=await occupiedServices(client,schedule,ignored)
    const unavailableProposedTechnicianIds=[...new Set([
      ...occupied.flatMap(busyIds),
      ...candidates.filter((other,i)=>i!==index && overlapsTime(schedule,other.schedule)).flatMap(other=>teamIds(other.schedule)),
    ])]
    for(const existing of occupied) {
      const duplicate=teamIds(schedule).filter(id=>busyIds(existing).includes(id))
      if(!duplicate.length)continue
      const existingSchedule=storedSchedule(existing)
      const elsewhere=await occupiedServices(client,existingSchedule,[existing.id,...ignored])
      const unavailableTechnicianIds=[...new Set([
        ...elsewhere.flatMap(busyIds),
        ...candidates.filter(other=>overlapsTime(other.schedule,existingSchedule)).flatMap(other=>teamIds(other.schedule)),
      ])]
      const names=(await client.query<{nombre_completo:string}>(
        'select nombre_completo from public.usuarios where id=any($1::uuid[]) order by nombre_completo',[duplicate],
      )).rows.map(row=>row.nombre_completo)
      conflicts.push({
        id:existing.id,solicitud:existing.solicitud,clienteNombre:existing.clienteNombre,
        sedeNombre:existing.sedeNombre,inicioProgramado:existing.inicioProgramado,
        finProgramado:existing.finProgramado,tecnicos:names,version:existing.version,
        programacion:existingSchedule,conflictingTechnicianIds:duplicate,proposedIndex:index,
        unavailableProposedTechnicianIds,unavailableTechnicianIds,
      })
    }
    // Other records changed in this transaction are excluded from occupiedServices;
    // compare their final schedules explicitly, including Principal/Refuerzo.
    for(let j=0;j<index;j++) {
      const other=candidates[j]!
      if(!overlapsTime(schedule,other.schedule))continue
      const duplicate=teamIds(schedule).filter(id=>teamIds(other.schedule).includes(id))
      if(!duplicate.length)continue
      conflicts.push({
        id:`internal:${j}:${index}`,solicitud:'Servicios de esta operación',clienteNombre:'',
        sedeNombre:'',inicioProgramado:other.schedule.inicioProgramado,
        finProgramado:scheduleEnd(other.schedule),tecnicos:['Comparten técnicos en el mismo horario'],
        proposedIndex:index,conflictingTechnicianIds:duplicate,internal:true,
        unavailableProposedTechnicianIds:[...new Set([...unavailableProposedTechnicianIds,...teamIds(other.schedule)])],
        unavailableTechnicianIds:[],programacion:other.schedule,version:0,
      })
    }
  }
  if(conflicts.length)throw new ApiError(409,
    'Hay técnicos asignados a servicios simultáneos. Reasigna los equipos antes de guardar.',
    'SCHEDULE_CONFLICT',{conflicts})
}
type ReassignmentRecord = { before: AdminService; input: ServiceReassignment }
async function loadReassignments(client:PoolClient, input:ServiceReassignment[], protectedIds:string[]):Promise<ReassignmentRecord[]> {
  const seen=new Set<string>(),result:ReassignmentRecord[]=[]
  for(const item of [...input].sort((a,b)=>a.id.localeCompare(b.id))) {
    if(seen.has(item.id) || protectedIds.includes(item.id))throw new ApiError(422,'No se puede modificar dos veces el mismo servicio.','VALIDATION')
    seen.add(item.id)
    await lockFamily(client,item.id)
    const before=await getService(client,item.id)
    assertVersion(before.version,item.version);mutable(before)
    if(before.inicioProgramado!==item.programacion.inicioProgramado || before.finProgramado!==scheduleEnd(item.programacion))
      throw new ApiError(422,'La solución del cruce solo puede modificar el equipo del servicio afectado.','VALIDATION')
    result.push({before,input:item})
  }
  return result
}
async function saveReassignments(client:PoolClient,actorId:string,records:ReassignmentRecord[],source:string):Promise<void> {
  for(const {before,input} of records) {
    await saveSchedule(client,input.id,input.programacion,input.version)
    await audit(client,actorId,'SERVICIO_EQUIPO_REASIGNADO',input.id,{
      causa:source,antes:scheduleFromRecord(before),despues:input.programacion,
    })
  }
}
async function saveProducts(client: PoolClient, service: AdminService | null, serviceId: string, input: ServiceInput['productos']): Promise<void> {
  const ids = input.map(product => product.productoId)
  const products = (await client.query<{ id: string; activo: boolean }>(
    'select id,activo from public.productos where id=any($1::uuid[]) for share', [ids])).rows
  const existing = service?.productos ?? []
  if (input.some(product => !products.some(row => row.id===product.productoId && (row.activo || existing.some(old => old.productoId===row.id))))) {
    throw new ApiError(422, 'Hay productos que ya no están disponibles.', 'VALIDATION', { fields: { productos: 'Actualiza el catálogo y revisa los productos previstos.' } })
  }
  for (const old of existing.filter(product => product.aplicado)) {
    const next = input.find(product => product.productoId===old.productoId)
    if (!next || next.lote!==old.lote || next.fechaVencimiento!==old.fechaVencimiento) {
      throw new ApiError(409, 'No se modifica un producto que el técnico ya aplicó.', 'PRODUCT_ALREADY_APPLIED')
    }
  }
  await client.query('delete from public.productos_aplicados where servicio_id=$1 and not aplicado and not(producto_id=any($2::uuid[]))', [serviceId,ids])
  for (const product of input) {
    await client.query(`insert into public.productos_aplicados(servicio_id,producto_id,lote,fecha_vencimiento)
      values($1,$2,$3,$4::date) on conflict(servicio_id,producto_id) do update set lote=excluded.lote,
      fecha_vencimiento=excluded.fecha_vencimiento where not productos_aplicados.aplicado`,
    [serviceId,product.productoId,product.lote,product.fechaVencimiento])
  }
}
async function saveSchedule(client: PoolClient, id: string, schedule: ServiceSchedule, expected: number): Promise<void> {
  const result = await client.query(`update public.servicios set inicio_programado=$2,fin_programado=$3,tecnico_responsable_id=$4,
    tecnicos_colaboradores_ids_json=$5::jsonb,version=version+1 where id=$1 and version=$6 and estado='PROGRAMADO' returning id`,
  [id,schedule.inicioProgramado,scheduleEnd(schedule),schedule.tecnicoResponsableId,JSON.stringify(schedule.tecnicosColaboradoresIds),expected])
  if (!result.rowCount) throw new ApiError(409, 'La programación cambió. Revisa la versión actual.', 'VERSION_CONFLICT')
}
async function mutation(client: PoolClient, ids: string[], upcomingId?: string): Promise<ServiceMutation> {
  return { services: await getServices(client,ids), upcoming: upcomingId ? await getUpcoming(client,upcomingId) : null, pendingCount: await pendingCount(client) }
}

export async function createService(client: PoolClient, actorId: string, input: ServiceInput, reassignments: ServiceReassignment[], upcoming?: { id: string; version: number; confirmed: boolean }): Promise<ServiceMutation> {
  const site = await siteForScheduling(client,input.sedeId)
  let proposal: UpcomingService | null = null
  if (upcoming) {
    await client.query('select id from public.proximos_servicios where id=$1 for update',[upcoming.id])
    proposal = await getUpcoming(client,upcoming.id)
    assertVersion(proposal.version,upcoming.version)
    if (proposal.servicioAgendadoId || proposal.estado==='NO_DESEA' || proposal.sedeId!==input.sedeId || !upcoming.confirmed) throw new ApiError(409, 'Confirma con el cliente esta visita de la misma sede antes de agendar.', 'FOLLOW_UP_NOT_READY')
  }
  if (site.tipo_sede==='RESIDENCIAL' && (input.valorServicio == null || !Number.isSafeInteger(input.valorServicio) || input.valorServicio < 0)) throw new ApiError(422, 'Ingresa el valor del servicio residencial.', 'VALIDATION', { fields:{ valorServicio:'Ingresa el valor del servicio residencial.' } })
  if (!site.maneja_refuerzo && input.refuerzo) throw new ApiError(422, 'Esta sede no maneja Refuerzo.', 'VALIDATION')
  const reinforcement = site.maneja_refuerzo ? input.refuerzo ?? suggestReinforcement(input.programacion) : null
  for (const [prefix,schedule] of [['programacion',input.programacion],['refuerzo',reinforcement]] as const) {
    if (schedule && new Date(schedule.inicioProgramado).getTime() <= Date.now()) throw new ApiError(
      422,'La visita debe programarse para una fecha y hora futuras.','VALIDATION',
      {fields:{[prefix+'.inicioProgramado']:'Selecciona una fecha y hora posteriores al momento actual.'}},
    )
  }
  if(input.cobro.pagado && !input.cobro.metodoPago)throw new ApiError(422,'Selecciona cómo pagó el cliente.','VALIDATION',{fields:{'cobro.metodoPago':'Selecciona un método de pago.'}})
  if(input.cobro.pagado && input.cobro.metodoPago==='EFECTIVO') {
    if(!input.cobro.recaudadoPorId)throw new ApiError(422,'Indica quién recibió el efectivo.','VALIDATION',{fields:{'cobro.recaudadoPorId':'Selecciona quién recibió el efectivo.'}})
    await validatePaymentReceiver(client,input.cobro.recaudadoPorId,actorId,null,'cobro.recaudadoPorId')
  }
  const reassigned=await loadReassignments(client,reassignments,[])
  await checkSchedules(client,[
    {id:null,schedule:input.programacion},
    ...reinforcement ? [{id:null,schedule:reinforcement}] : [],
    ...reassigned.map(row=>({id:row.input.id,schedule:row.input.programacion})),
  ],reassigned.map(row=>row.input.id),reassigned.map(row=>scheduleFromRecord(row.before)))
  await validatePlannedCollector(client,input.cobro.tecnicoRecaudoPrevistoId)
  const id = randomUUID(), ids = [id]
  const schedule = input.programacion
  const wasPaid=input.cobro.pagado===true
  const cashRecipient=wasPaid && input.cobro.metodoPago==='EFECTIVO' ? input.cobro.recaudadoPorId ?? null : null
  await client.query(`insert into public.servicios(id,sede_id,tipo_servicio,inicio_programado,fin_programado,creado_por_id,
    tecnico_responsable_id,tecnicos_colaboradores_ids_json,valor_servicio,observaciones,metodo_pago,estado_pago,tecnico_recaudo_previsto_id,
    recaudado_por_id,tecnico_que_recauda_id,pago_fecha,pago_registrado_por_id,pago_confirmado_por_id,pago_confirmado_at)
    values($1,$2,'PRINCIPAL',$3,$4,$5,$6,$7::jsonb,$14,$8,$9,$10,$11,$12,$12,
      case when $13::boolean then now() else null end,
      case when $13::boolean then $5::uuid else null end,
      case when $13::boolean then $5::uuid else null end,
      case when $13::boolean then now() else null end)`,
  [id,input.sedeId,schedule.inicioProgramado,scheduleEnd(schedule),actorId,schedule.tecnicoResponsableId,JSON.stringify(schedule.tecnicosColaboradoresIds),
    input.observaciones,input.cobro.metodoPago,wasPaid ? 'CONFIRMADO' : input.cobro.metodoPago ? 'PENDIENTE' : 'SIN_REGISTRAR',
    input.cobro.tecnicoRecaudoPrevistoId,cashRecipient,wasPaid,site.tipo_sede==='RESIDENCIAL' ? input.valorServicio : 0])
  if (reinforcement) {
    const reinforcementId=randomUUID(); ids.push(reinforcementId)
    await client.query(`insert into public.servicios(id,sede_id,tipo_servicio,servicio_principal_id,inicio_programado,fin_programado,
      creado_por_id,tecnico_responsable_id,tecnicos_colaboradores_ids_json,valor_servicio)
      values($1,$2,'REFUERZO',$3,$4,$5,$6,$7,$8::jsonb,0)`,
    [reinforcementId,input.sedeId,id,reinforcement.inicioProgramado,scheduleEnd(reinforcement),actorId,reinforcement.tecnicoResponsableId,JSON.stringify(reinforcement.tecnicosColaboradoresIds)])
  }
  await saveReassignments(client,actorId,reassigned,'SERVICIO_NUEVO')
  await saveProducts(client,null,id,input.productos)
  if (proposal) {
    await client.query(`update public.proximos_servicios set servicio_agendado_id=$2,estado='CONFIRMADO',confirmado_at=coalesce(confirmado_at,now()),
      confirmado_por_id=coalesce(confirmado_por_id,$3) where id=$1`,[proposal.id,id,actorId])
    await audit(client,actorId,'PROXIMO_AGENDADO',proposal.id,{ servicioId:id },'Próximos servicios')
  }
  const result=await mutation(client,[...ids,...reassigned.map(row=>row.input.id)],proposal?.id)
  for (const service of result.services) await audit(client,actorId,'SERVICIO_CREADO',service.id,{ service })
  return result
}
export async function editService(client: PoolClient, actorId: string, id: string, expected: number, input: ServiceInput, reassignments: ServiceReassignment[], reinforcementVersion?: number): Promise<ServiceMutation> {
  const ids=await lockFamily(client,id), before=await getService(client,id)
  assertVersion(before.version,expected); mutable(before)
  if (input.sedeId!==before.sedeId) throw new ApiError(422, 'La sede de un servicio existente no se cambia.', 'VALIDATION', { fields: { sedeId: 'Cancela y programa otro servicio para cambiar de sede.' } })
  await siteForScheduling(client,before.sedeId)
  if (before.tipoServicio==='REFUERZO' && (input.refuerzo || input.cobro.metodoPago || input.cobro.tecnicoRecaudoPrevistoId)) throw new ApiError(422,'Un Refuerzo es gratuito y no genera otro Refuerzo.','VALIDATION')
  let child: AdminService | null=null
  if (input.refuerzo) {
    if (!before.refuerzo || reinforcementVersion===undefined) throw new ApiError(422,'Falta la versión del Refuerzo asociado.','VALIDATION')
    child=await getService(client,before.refuerzo.id); assertVersion(child.version,reinforcementVersion); mutable(child)
  }
  const reassigned=await loadReassignments(client,reassignments,ids)
  await checkSchedules(client,[
    {id,schedule:input.programacion},
    ...input.refuerzo ? [{id:child!.id,schedule:input.refuerzo}] : [],
    ...reassigned.map(row=>({id:row.input.id,schedule:row.input.programacion})),
  ],[id,...(child ? [child.id] : []),...reassigned.map(row=>row.input.id)],[
    scheduleFromRecord(before),...child ? [scheduleFromRecord(child)] : [],
    ...reassigned.map(row=>scheduleFromRecord(row.before)),
  ])
  const planChanged=input.cobro.metodoPago!==before.pago.metodoPago || input.cobro.tecnicoRecaudoPrevistoId!==before.pago.tecnicoRecaudoPrevistoId
  if (planChanged && before.pago.estadoPago==='CONFIRMADO') throw new ApiError(409,'El pago ya está confirmado. No se modifica desde la programación.','PAYMENT_CONFIRMED')
  if (planChanged) await validatePlannedCollector(client,input.cobro.tecnicoRecaudoPrevistoId)
  await saveSchedule(client,id,input.programacion,expected)
  await client.query(`update public.servicios set observaciones=$2,metodo_pago=$3,tecnico_recaudo_previsto_id=$4,
    estado_pago=case when estado_pago in ('SIN_REGISTRAR','PENDIENTE') and pago_fecha is null then case when $3::text is null then 'SIN_REGISTRAR' else 'PENDIENTE' end else estado_pago end where id=$1`,
  [id,input.observaciones,input.cobro.metodoPago,input.cobro.tecnicoRecaudoPrevistoId])
  await saveProducts(client,before,id,input.productos)
  if (child && input.refuerzo) await saveSchedule(client,child.id,input.refuerzo,child.version)
  await saveReassignments(client,actorId,reassigned,id)
  const result=await mutation(client,[...ids,...reassigned.map(row=>row.input.id)])
  await audit(client,actorId,'SERVICIO_EDITADO',id,{ before, after:result.services.find(row=>row.id===id), refuerzoAnterior:child })
  return result
}
export async function rescheduleService(client: PoolClient, actorId: string, id: string, expected: number, schedule: ServiceSchedule, reassignments: ServiceReassignment[], reinforcement?: { version: number; schedule: ServiceSchedule }): Promise<ServiceMutation> {
  const ids=await lockFamily(client,id), before=await getService(client,id)
  assertVersion(before.version,expected); mutable(before); await siteForScheduling(client,before.sedeId)
  let child: AdminService | null=null
  if (reinforcement) {
    if (!before.refuerzo) throw new ApiError(422,'No hay Refuerzo asociado.','VALIDATION')
    child=await getService(client,before.refuerzo.id); assertVersion(child.version,reinforcement.version); mutable(child)
  }
  const reassigned=await loadReassignments(client,reassignments,ids)
  await checkSchedules(client,[
    {id,schedule},
    ...reinforcement ? [{id:child!.id,schedule:reinforcement.schedule}] : [],
    ...reassigned.map(row=>({id:row.input.id,schedule:row.input.programacion})),
  ],[id,...(child ? [child.id] : []),...reassigned.map(row=>row.input.id)],[
    scheduleFromRecord(before),...child ? [scheduleFromRecord(child)] : [],
    ...reassigned.map(row=>scheduleFromRecord(row.before)),
  ])
  await saveSchedule(client,id,schedule,expected)
  if (child && reinforcement) await saveSchedule(client,child.id,reinforcement.schedule,child.version)
  await saveReassignments(client,actorId,reassigned,id)
  const result=await mutation(client,ids)
  await audit(client,actorId,'SERVICIO_REPROGRAMADO',id,{ before:scheduleFromRecord(before), after:schedule, refuerzoAnterior:child ? scheduleFromRecord(child) : null, refuerzoNuevo:reinforcement?.schedule ?? null })
  return result
}
export async function cancelService(client: PoolClient, actorId: string, id: string, expected: number, reason: string): Promise<ServiceMutation> {
  const ids=await lockFamily(client,id), before=await getService(client,id)
  assertVersion(before.version,expected)
  if (!['PROGRAMADO','EN_PROCESO'].includes(before.estado)) throw new ApiError(409,'El servicio ya terminó o fue cancelado.','SERVICE_TERMINAL')
  const deactivatedDevices=(await client.query<{ id: string }>(`select distinct device.id
    from public.dispositivos device
    join public.servicio_dispositivos snapshot on snapshot.dispositivo_id=device.id
    where snapshot.servicio_id=any($1::uuid[]) and snapshot.creado_durante_servicio and device.activo
    order by device.id`,[ids])).rows.map(row=>row.id)
  await client.query("update public.servicios set estado='CANCELADO',motivo_cancelacion=$2,cancelado_at=now() where id=$1",[id,reason])
  const result=await mutation(client,ids)
  await audit(client,actorId,'SERVICIO_CANCELADO',id,{ motivo:reason, before, afectados:result.services.filter(row=>row.estado==='CANCELADO').map(row=>row.id), dispositivosDesactivados:deactivatedDevices })
  return result
}
export async function savePayment(client: PoolClient, actorId: string, id: string, expected: number, input: ServicePaymentInput): Promise<ServiceMutation> {
  const ids=await lockFamily(client,id), before=await getService(client,id)
  assertVersion(before.version,expected)
  if (before.tipoServicio==='REFUERZO') throw new ApiError(422,'El Refuerzo es gratuito y no registra pagos.','VALIDATION')
  if (before.estado==='CANCELADO' && input.estadoPago!=='RECHAZADO') throw new ApiError(409,'No se registra un nuevo pago en un servicio cancelado.','SERVICE_TERMINAL')
  if ((before.pago.estadoPago==='CONFIRMADO' || input.estadoPago==='RECHAZADO') && !input.motivo.trim()) throw new ApiError(422,'Indica el motivo de la corrección o rechazo.','VALIDATION',{ fields:{ motivo:'El motivo es obligatorio.' } })
  if (input.metodoPago==='EFECTIVO' && input.estadoPago==='CONFIRMADO' && !input.recaudadoPorId) throw new ApiError(422,'Identifica quién recibió el efectivo.','VALIDATION',{ fields:{ recaudadoPorId:'Selecciona quién recibió el efectivo.' } })
  await validatePaymentReceiver(client,input.recaudadoPorId,actorId,before.pago.recaudadoPorId)
  const confirmed=input.estadoPago==='CONFIRMADO'
  await client.query(`update public.servicios set metodo_pago=$2,estado_pago=$3,recaudado_por_id=$4,tecnico_que_recauda_id=$4,
    pago_fecha=coalesce(pago_fecha,now()),pago_registrado_por_id=coalesce(pago_registrado_por_id,$5),
    pago_confirmado_por_id=case when $6 then $5::uuid else null end,pago_confirmado_at=case when $6 then now() else null end,
    tecnico_recaudo_previsto_id=case when $2='EFECTIVO' then tecnico_recaudo_previsto_id else null end where id=$1`,
  [id,input.metodoPago,input.estadoPago,confirmed && input.metodoPago==='EFECTIVO' ? input.recaudadoPorId : null,actorId,confirmed])
  const result=await mutation(client,ids)
  await audit(client,actorId,'SERVICIO_PAGO_ACTUALIZADO',id,{ before:before.pago, after:result.services.find(row=>row.id===id)?.pago, valorServicio:before.valorServicio, motivo:input.motivo })
  return result
}
export async function updateUpcoming(client: PoolClient, actorId: string, id: string, expected: number, input: UpcomingPatch): Promise<{ upcoming: UpcomingService; pendingCount: number }> {
  await client.query('select id from public.proximos_servicios where id=$1 for update',[id])
  const before=await getUpcoming(client,id); assertVersion(before.version,expected)
  if (before.servicioAgendadoId) throw new ApiError(409,'Esta visita ya fue agendada.','FOLLOW_UP_RESOLVED')
  await client.query(`update public.proximos_servicios set estado=$2,fecha_recontacto=$3::date,nota=$4,
    ultimo_contacto_at=case when $5::text is not null then now() else ultimo_contacto_at end,
    canal_ultimo_contacto=coalesce($5,canal_ultimo_contacto),
    confirmado_at=case when $2='CONFIRMADO' then coalesce(confirmado_at,now()) else null end,
    confirmado_por_id=case when $2='CONFIRMADO' then coalesce(confirmado_por_id,$6) else null end where id=$1`,
  [id,input.estado,input.estado==='POSPUESTO' ? input.fechaRecontacto : null,input.nota,input.contactoRealizado,actorId])
  const upcoming=await getUpcoming(client,id)
  await audit(client,actorId,'PROXIMO_SEGUIMIENTO_ACTUALIZADO',id,{ before,after:upcoming },'Próximos servicios')
  return { upcoming,pendingCount:await pendingCount(client) }
}
export function confirmationEmail(upcoming: UpcomingService): ConfirmationEmail {
  const name=(upcoming.contacto.nombre || upcoming.clienteNombre).replace(/[\r\n]+/g,' ')
  return {
    to:upcoming.contacto.correos[0] ?? '',
    subject:`Confirmación de próxima visita · ${upcoming.clienteNombre} · ${upcoming.sedeNombre}`.replace(/[\r\n]+/g,' '),
    text:`Hola, ${name}.\n\nTenemos sugerida su próxima visita de manejo integrado de plagas para el ${formatServiceDate(upcoming.fechaSugerida)} a las ${formatServiceDate(upcoming.fechaSugerida,true)}, en ${upcoming.sedeNombre}.\n\n¿Nos confirman su disponibilidad o nos indican otra fecha y hora? Esta es una propuesta; la visita se agenda cuando acordemos el horario con ustedes.\n\nGracias,\nSoluciones Radicales\nManejo Integrado de Plagas`,
  }
}
export async function queueConfirmationEmail(client: PoolClient, actorId: string, id: string, expected: number, requestId: string, recipient: string, reviewedUnknown: boolean, resend: boolean): Promise<{ upcoming: UpcomingService; pendingCount: number }> {
  await client.query('select id from public.proximos_servicios where id=$1 for update',[id])
  const before=await getUpcoming(client,id); assertVersion(before.version,expected)
  if (before.servicioAgendadoId || before.estado==='NO_DESEA') throw new ApiError(409,'Esta propuesta ya no requiere un correo de confirmación.','FOLLOW_UP_RESOLVED')
  if (before.correoEstado==='PENDIENTE') throw new ApiError(409,'Ya hay un correo pendiente para esta visita.','EMAIL_PENDING')
  if (before.correoEstado==='INCIERTO' && !reviewedUnknown) throw new ApiError(409,'Revisa Enviados en Gmail antes de solicitar otro envío.','EMAIL_DELIVERY_UNKNOWN')
  if (before.correoEstado==='ENVIADO' && !resend) throw new ApiError(409,'Ya se envió un correo. Confirma expresamente un nuevo contacto.','EMAIL_ALREADY_SENT')
  if (!before.contacto.correos.includes(recipient.toLowerCase().trim())) throw new ApiError(422,'Selecciona un correo registrado para esta sede.','VALIDATION')
  const email={ ...confirmationEmail(before),to:recipient.toLowerCase().trim() }
  await client.query(`insert into private.integration_jobs(job_type,idempotency_key,payload) values('EMAIL',$1,$2::jsonb)
    on conflict(job_type,idempotency_key) do nothing`,[`admin-service:email:${requestId}`,JSON.stringify({ scope:'ADMIN_SERVICES',upcomingId:id,actorId,email,dispatched:false })])
  await client.query("update public.proximos_servicios set correo_estado='PENDIENTE',correo_error=null where id=$1",[id])
  await audit(client,actorId,'PROXIMO_CORREO_SOLICITADO',id,{ to:email.to,requestId,entregaInciertaRevisada:reviewedUnknown,reenvio:resend },'Próximos servicios')
  return { upcoming:await getUpcoming(client,id),pendingCount:await pendingCount(client) }
}
export async function retryCalendar(client: PoolClient, actorId: string, id: string): Promise<ServiceMutation> {
  const record=await getService(client,id)
  const row=(await client.query<{ calendar_revision: string }>(`update public.servicios set calendar_sync_estado='PENDIENTE',calendar_sync_error=null
    where id=$1 returning calendar_revision`,[id])).rows[0]!
  await client.query(`insert into private.integration_jobs(job_type,idempotency_key,payload) values('CALENDAR',$1,$2::jsonb)
    on conflict(job_type,idempotency_key) do update set status=case when integration_jobs.status='RUNNING' then 'RUNNING' else 'PENDING' end,
    run_after=now(),attempts=case when integration_jobs.status='RUNNING' then integration_jobs.attempts else 0 end`,
  [`admin-service:calendar:${id}:${row.calendar_revision}`,JSON.stringify({ scope:'ADMIN_SERVICES',serviceId:id,revision:Number(row.calendar_revision),actorId })])
  await audit(client,actorId,'SERVICIO_CALENDAR_REINTENTO_SOLICITADO',id,{ estado:record.estado })
  return mutation(client,[id])
}

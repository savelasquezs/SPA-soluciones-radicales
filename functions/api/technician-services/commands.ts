import type { PoolClient } from 'pg'
import type { TechnicianAreaOrderResult, TechnicianAreaOrderVersion, TechnicianExecutionLock, TechnicianExecutionSession } from '../../../src/types/technicianServices'
import { ApiError } from '../auth'
import { assertVersion, audit } from '../services/commands'
import { assignedServiceState, getTechnicianPackage } from './queries'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export async function technicianCommand<T>(client: PoolClient, userId: string, requestId: string, entity: string, serviceId: string, version: number | null, payload: unknown, work: () => Promise<T>): Promise<T> {
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`technician-service-command:${requestId}`])
  const previous = (await client.query<{ user_id: string; entity: string; record_id: string; base_version: string | null; payload: unknown; status: string; result_json: T | null }>(
    'select user_id,entity,record_id,base_version,payload,status,result_json from private.sync_operations where id=$1', [requestId])).rows[0]
  if (previous) {
    const same = previous.user_id === userId && previous.entity === entity && previous.record_id === serviceId
      && (previous.base_version == null ? version == null : Number(previous.base_version) === version) && canonical(previous.payload) === canonical(payload)
    if (!same) throw new ApiError(409, 'Esta operación ya fue usada con otros datos.', 'REQUEST_REUSED')
    if (previous.status === 'APPLIED' && previous.result_json) return previous.result_json
    throw new ApiError(409, 'La operación anterior no quedó disponible para reintento.', 'REQUEST_NOT_APPLIED')
  }
  await client.query(`insert into private.sync_operations(id,user_id,entity,record_id,base_version,payload)
    values($1,$2,$3,$4,$5,$6::jsonb)`, [requestId, userId, entity, serviceId, version, JSON.stringify(payload)])
  const result = await work()
  await client.query("update private.sync_operations set status='APPLIED',result_json=$2::jsonb,updated_at=now() where id=$1", [requestId, JSON.stringify(result)])
  return result
}

async function acquireLock(client: PoolClient, userId: string, serviceId: string, deviceId: string): Promise<TechnicianExecutionLock> {
  const current = (await client.query<{ user_id: string; device_id: string; lock_token: string; acquired_at: Date }>(
    'select user_id,device_id,lock_token,acquired_at from private.service_execution_locks where service_id=$1 for update', [serviceId])).rows[0]
  if (current) {
    if (current.user_id !== userId || current.device_id !== deviceId) throw new ApiError(409, 'Este servicio está abierto en otro celular. Solicita al Administrador liberar el acceso.', 'SERVICE_LOCKED')
    return { token: current.lock_token, deviceId: current.device_id, acquiredAt: current.acquired_at.toISOString() }
  }
  const { rows } = await client.query<{ lock_token: string; device_id: string; acquired_at: Date }>(`insert into private.service_execution_locks(service_id,user_id,device_id)
    values($1,$2,$3) returning lock_token,device_id,acquired_at`, [serviceId, userId, deviceId])
  return { token: rows[0]!.lock_token, deviceId: rows[0]!.device_id, acquiredAt: rows[0]!.acquired_at.toISOString() }
}

async function assertExecutionLock(client: PoolClient, userId: string, serviceId: string, deviceId: string, lockToken: string): Promise<void> {
  const current = (await client.query<{ user_id: string; device_id: string; lock_token: string }>(
    'select user_id,device_id,lock_token from private.service_execution_locks where service_id=$1 for update', [serviceId])).rows[0]
  if (!current || current.user_id !== userId || current.device_id !== deviceId || current.lock_token !== lockToken) {
    throw new ApiError(409, 'Este celular ya no tiene permiso para editar el servicio. Solicita al Administrador liberar el acceso.', 'SERVICE_LOCKED')
  }
}

export async function saveTechnicianAreaOrder(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  areaIds: string[],
  versions: TechnicianAreaOrderVersion[],
): Promise<TechnicianAreaOrderResult> {
  const service = await assignedServiceState(client, userId, serviceId, true)
  if (service.tipo_servicio !== 'PRINCIPAL' || service.estado !== 'EN_PROCESO') {
    throw new ApiError(409, 'El recorrido solo se modifica durante un servicio Principal En proceso.', 'SERVICE_NOT_IN_PROGRESS')
  }
  await assertExecutionLock(client, userId, serviceId, deviceId, lockToken)
  const current = (await client.query<{ id: string; version: string; posicion_recorrido: number }>(
    'select id,version,posicion_recorrido from public.servicio_areas where servicio_id=$1 order by posicion_recorrido,id for update', [serviceId])).rows
  const currentIds = current.map(area => area.id)
  if (areaIds.length !== currentIds.length || new Set(areaIds).size !== areaIds.length || currentIds.some(id => !areaIds.includes(id))) {
    throw new ApiError(409, 'La composición del recorrido cambió. Conservamos tu propuesta para que revises el orden vigente.', 'AREA_COMPOSITION_CONFLICT', {
      remote: {
        areaIds: currentIds,
        versions: current.map(area => ({ id: area.id, version: Number(area.version) })),
      },
    })
  }
  const expected = new Map(versions.map(item => [item.id, item.version]))
  const versionConflict = expected.size !== current.length || current.some(area => expected.get(area.id) !== Number(area.version))
  if (versionConflict) {
    throw new ApiError(409, 'El recorrido cambió. Conservamos tu propuesta para que decidas cómo continuar.', 'VERSION_CONFLICT', {
      remote: {
        areaIds: currentIds,
        versions: current.map(area => ({ id: area.id, version: Number(area.version) })),
      },
    })
  }
  await client.query('set constraints all deferred')
  const updated = (await client.query<{ id: string; version: string; posicion_recorrido: number }>(`update public.servicio_areas area
    set posicion_recorrido=(ordered.position-1)::integer
    from unnest($2::uuid[]) with ordinality as ordered(id,position)
    where area.servicio_id=$1 and area.id=ordered.id
    returning area.id,area.version,area.posicion_recorrido`, [serviceId, areaIds])).rows
  if (updated.length !== areaIds.length) throw new ApiError(409, 'El recorrido cambió durante el guardado.', 'VERSION_CONFLICT')
  const positions = new Map(updated.map(area => [area.id, area]))
  const result: TechnicianAreaOrderResult = {
    areas: areaIds.map(id => ({ id, version: Number(positions.get(id)!.version), posicionRecorrido: positions.get(id)!.posicion_recorrido })),
  }
  await audit(client, userId, 'SERVICIO_RECORRIDO_REORDENADO', serviceId, { areaIds })
  return result
}

async function lockSnapshotSources(client: PoolClient, serviceId: string): Promise<{ areaIds: string[]; criterionIds: string[]; deviceIds: string[] }> {
  const areaIds = (await client.query<{ id: string }>(`select a.id from public.servicios s join public.areas a on a.sede_id=s.sede_id
    where s.id=$1 and a.activo order by a.id for share of a`, [serviceId])).rows.map(row => row.id)
  const criterionIds = (await client.query<{ id: string }>('select id from public.criterios_mip where activo order by id for share', [])).rows.map(row => row.id)
  const deviceIds = areaIds.length ? (await client.query<{ id: string }>(`select id from public.dispositivos
    where area_id=any($1::uuid[]) and activo order by id for share`, [areaIds])).rows.map(row => row.id) : []
  await client.query(`select p.id from public.productos_aplicados pa join public.productos p on p.id=pa.producto_id
    where pa.servicio_id=$1 order by p.id for share of pa,p`, [serviceId])
  await client.query(`select c.id from public.productos_aplicados pa join public.configuracion c
    on c.categoria='METODO_APLICACION' and c.clave=pa.metodo_aplicacion_codigo
    where pa.servicio_id=$1 order by c.id for share of c`, [serviceId])
  return { areaIds, criterionIds, deviceIds }
}

export async function startTechnicianService(client: PoolClient, userId: string, serviceId: string, expectedVersion: number, deviceId: string): Promise<TechnicianExecutionSession> {
  const service = await assignedServiceState(client, userId, serviceId, true)
  assertVersion(Number(service.version), expectedVersion)
  if (service.tipo_servicio !== 'PRINCIPAL') throw new ApiError(422, 'La ejecución móvil inicial solo admite servicios Principales.', 'SERVICE_KIND_UNSUPPORTED')
  if (service.estado !== 'PROGRAMADO') throw new ApiError(409, 'El servicio ya no está Programado.', 'SERVICE_NOT_PROGRAMMED')
  if (!service.eligible) throw new ApiError(409, 'Puedes iniciar el servicio desde una hora antes de la programación.', 'SERVICE_TOO_EARLY')
  const incomplete = (await client.query<{ count: number }>(`select count(*)::integer as count from public.productos_aplicados
    where servicio_id=$1 and (nullif(btrim(lote),'') is null or dosis is null or dosis='null'::jsonb
      or (jsonb_typeof(dosis)='string' and nullif(btrim(dosis #>> '{}'),'') is null)
      or nullif(btrim(metodo_aplicacion_codigo),'') is null)`, [serviceId])).rows[0]?.count ?? 0
  if (incomplete) throw new ApiError(422, 'El Administrador debe completar lote, dosis y método de cada producto antes de iniciar.', 'PRODUCTS_INCOMPLETE')
  const sources = await lockSnapshotSources(client, serviceId)
  const executionLock = await acquireLock(client, userId, serviceId, deviceId)
  await client.query(`insert into public.servicio_areas(servicio_id,area_id,nombre_snapshot,es_externa_snapshot,posicion_inicial,posicion_recorrido)
    select $1,a.id,a.nombre,a.es_externa,(row_number() over(order by lower(btrim(a.nombre)),a.id)-1)::integer,
      (row_number() over(order by lower(btrim(a.nombre)),a.id)-1)::integer
    from public.servicios s join public.areas a on a.sede_id=s.sede_id where s.id=$1 and a.id=any($2::uuid[])
    order by lower(btrim(a.nombre)),a.id`, [serviceId, sources.areaIds])
  await client.query(`insert into public.evaluaciones_mip_area(servicio_id,servicio_area_id,area_id,criterio_id,criterio_nombre_snapshot,solo_area_externa_snapshot)
    select $1,sa.id,sa.area_id,c.id,c.nombre,c.solo_area_externa from public.servicio_areas sa
    cross join public.criterios_mip c where sa.servicio_id=$1 and c.id=any($2::uuid[]) and (not c.solo_area_externa or sa.es_externa_snapshot)
    order by sa.posicion_inicial,lower(btrim(c.nombre)),c.id`, [serviceId, sources.criterionIds])
  await client.query(`insert into public.servicio_dispositivos(servicio_id,servicio_area_id,dispositivo_id,numero_snapshot,ubicacion_snapshot,tipo_dispositivo_codigo_snapshot,estado_anterior_snapshot)
    select $1,sa.id,d.id,d.numero,d.ubicacion,d.tipo_dispositivo_codigo,d.estado_actual
    from public.servicio_areas sa join public.dispositivos d on d.area_id=sa.area_id
    where sa.servicio_id=$1 and d.id=any($2::uuid[]) order by sa.posicion_inicial,lower(btrim(d.numero)),d.id`, [serviceId, sources.deviceIds])
  await client.query(`update public.productos_aplicados pa set aplicado=true,producto_nombre_snapshot=p.nombre,
    principio_activo_snapshot=p.principio_activo_composicion,registro_sanitario_snapshot=p.registro_sanitario,
    dosis_referencia_snapshot=p.dosis_aplicacion,metodo_aplicacion_nombre_snapshot=(select c.nombre from public.configuracion c
      where c.categoria='METODO_APLICACION' and c.clave=pa.metodo_aplicacion_codigo)
    from public.productos p
    where pa.servicio_id=$1 and p.id=pa.producto_id`, [serviceId])
  await client.query("update public.servicios set estado='EN_PROCESO',inicio_real=now() where id=$1", [serviceId])
  await audit(client, userId, 'SERVICIO_INICIADO', serviceId, { deviceId, productosSoloLectura: true, snapshotsCongelados: true })
  return { package: await getTechnicianPackage(client, userId, serviceId), lock: executionLock }
}

export async function claimTechnicianService(client: PoolClient, userId: string, serviceId: string, deviceId: string): Promise<TechnicianExecutionSession> {
  const service = await assignedServiceState(client, userId, serviceId, true)
  if (service.tipo_servicio !== 'PRINCIPAL' || service.estado !== 'EN_PROCESO') throw new ApiError(409, 'Solo se recupera un servicio Principal En proceso.', 'SERVICE_NOT_IN_PROGRESS')
  const executionLock = await acquireLock(client, userId, serviceId, deviceId)
  return { package: await getTechnicianPackage(client, userId, serviceId), lock: executionLock }
}

export async function releaseTechnicianServiceLock(client: PoolClient, adminId: string, serviceId: string, reason: string): Promise<{ serviceId: string; released: boolean }> {
  const service = (await client.query<{ estado: string }>('select estado from public.servicios where id=$1 for update', [serviceId])).rows[0]
  if (!service) throw new ApiError(404, 'El servicio no está disponible.', 'SERVICE_NOT_FOUND')
  const result = await client.query('delete from private.service_execution_locks where service_id=$1', [serviceId])
  await audit(client, adminId, 'SERVICIO_BLOQUEO_LIBERADO', serviceId, { reason, released: Boolean(result.rowCount) })
  return { serviceId, released: Boolean(result.rowCount) }
}

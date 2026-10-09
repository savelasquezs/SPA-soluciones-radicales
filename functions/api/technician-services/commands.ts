import type { PoolClient } from 'pg'
import type { MipEvaluation, TechnicianAreaAccessResult, TechnicianAreaAccessState, TechnicianAreaOrderResult, TechnicianAreaOrderVersion, TechnicianCriterion, TechnicianCriterionEvaluationResult, TechnicianDevice, TechnicianDeviceCapture, TechnicianDeviceCreationInput, TechnicianDeviceCreationResult, TechnicianDeviceReview, TechnicianDeviceReviewInput, TechnicianDeviceReviewResult, TechnicianExecutionLock, TechnicianExecutionSession, TechnicianFinding, TechnicianFindingCreateInput, TechnicianFindingResult, TechnicianFindingStatusInput, TechnicianPestSnapshot, TechnicianServicePackage } from '../../../src/types/technicianServices'
import { technicianDevicePhotoRequired } from '../../../src/helpers/technicianServices'
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

export async function authorizeTechnicianServiceChange(client: PoolClient, userId: string, serviceId: string, deviceId: string, lockToken: string): Promise<void> {
  const service = await assignedServiceState(client, userId, serviceId, true)
  if (service.tipo_servicio !== 'PRINCIPAL' || service.estado !== 'EN_PROCESO') {
    throw new ApiError(409, 'El servicio no está disponible para edición técnica.', 'SERVICE_NOT_IN_PROGRESS')
  }
  await assertExecutionLock(client, userId, serviceId, deviceId, lockToken)
}

export async function authorizeTechnicianAreaChange(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  areaId: string,
  lockArea = false,
): Promise<TechnicianAreaAccessState> {
  const service = await assignedServiceState(client, userId, serviceId, true)
  if (service.tipo_servicio !== 'PRINCIPAL' || service.estado !== 'EN_PROCESO') {
    throw new ApiError(409, 'Las excepciones de acceso solo se registran durante un servicio Principal En proceso.', 'SERVICE_NOT_IN_PROGRESS')
  }
  await assertExecutionLock(client, userId, serviceId, deviceId, lockToken)
  const area = (await client.query<TechnicianAreaAccessState>(`select id,sin_acceso as "sinAcceso",
    sin_acceso_descripcion as "sinAccesoDescripcion",sin_acceso_foto_storage_path as "sinAccesoFotoStoragePath",
    sin_acceso_evidencias_storage_paths as "sinAccesoEvidenciasStoragePaths",version::integer from public.servicio_areas where id=$2 and servicio_id=$1${lockArea ? ' for update' : ''}`,
  [serviceId, areaId])).rows[0]
  if (!area) throw new ApiError(404, 'El Área no pertenece a este servicio.', 'AREA_NOT_FOUND')
  return area
}

export async function saveTechnicianAreaAccess(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  areaId: string,
  expectedVersion: number,
  withoutAccess: boolean,
  description: string,
  photoStoragePath: string | null,
  photoStoragePaths: string[] = photoStoragePath ? [photoStoragePath] : [],
): Promise<TechnicianAreaAccessResult & { removedPhotoPaths: string[] }> {
  const current = await authorizeTechnicianAreaChange(client, userId, serviceId, deviceId, lockToken, areaId, true)
  if (current.version !== expectedVersion) {
    throw new ApiError(409, 'El estado de acceso del Área cambió. Conservamos tu respuesta para que decidas cómo continuar.', 'VERSION_CONFLICT', { remote: current })
  }
  const normalizedDescription = description.trim()
  if (withoutAccess && (!normalizedDescription || !photoStoragePaths.length || photoStoragePaths.length > 5)) {
    throw new ApiError(422, 'Describe la novedad y adjunta una fotografía para registrar el Área sin acceso.', 'VALIDATION')
  }
  if (normalizedDescription.length > 2_000) throw new ApiError(422, 'La descripción no puede superar 2000 caracteres.', 'VALIDATION')
  const { rows } = await client.query<TechnicianAreaAccessState>(`update public.servicio_areas
    set sin_acceso=$3,sin_acceso_descripcion=$4,sin_acceso_foto_storage_path=$5,
      sin_acceso_evidencias_storage_paths=$6::jsonb
    where servicio_id=$1 and id=$2
    returning id,sin_acceso as "sinAcceso",sin_acceso_descripcion as "sinAccesoDescripcion",
      sin_acceso_foto_storage_path as "sinAccesoFotoStoragePath",
      sin_acceso_evidencias_storage_paths as "sinAccesoEvidenciasStoragePaths",version::integer`,
  [serviceId, areaId, withoutAccess, withoutAccess ? normalizedDescription : null,
    withoutAccess ? photoStoragePaths[0] : null, JSON.stringify(withoutAccess ? photoStoragePaths : [])])
  const area = rows[0]!
  await audit(client, userId, withoutAccess ? 'SERVICIO_AREA_SIN_ACCESO_REGISTRADA' : 'SERVICIO_AREA_ACCESO_HABILITADO', serviceId, {
    areaId,
    photoCount: area.sinAccesoEvidenciasStoragePaths?.length ?? 0,
  })
  return {
    area,
    removedPhotoPaths: (current.sinAccesoEvidenciasStoragePaths ?? (current.sinAccesoFotoStoragePath ? [current.sinAccesoFotoStoragePath] : []))
      .filter(path => !(area.sinAccesoEvidenciasStoragePaths ?? []).includes(path)),
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

export async function saveTechnicianCriterionEvaluation(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  criterionId: string,
  expectedVersion: number,
  evaluation: MipEvaluation,
  observation: string,
  evidenceStoragePaths: string[] = [],
): Promise<TechnicianCriterionEvaluationResult> {
  const service = await assignedServiceState(client, userId, serviceId, true)
  if (service.tipo_servicio !== 'PRINCIPAL' || service.estado !== 'EN_PROCESO') {
    throw new ApiError(409, 'Los criterios solo se evalúan durante un servicio Principal En proceso.', 'SERVICE_NOT_IN_PROGRESS')
  }
  await assertExecutionLock(client, userId, serviceId, deviceId, lockToken)
  const current = (await client.query<(TechnicianCriterion & { sinAcceso: boolean; areaId: string })>(`select evaluation.id,
    evaluation.criterio_id as "criterioId",evaluation.criterio_nombre_snapshot as nombre,
    evaluation.solo_area_externa_snapshot as "soloAreaExterna",evaluation.evaluacion,
    evaluation.observacion,evaluation.evidencias_storage_paths as "evidenciasStoragePaths",
    evaluation.version::integer,area.sin_acceso as "sinAcceso",area.id as "areaId"
    from public.evaluaciones_mip_area evaluation
    join public.servicio_areas area on area.id=evaluation.servicio_area_id
    where evaluation.id=$2 and evaluation.servicio_id=$1 and area.servicio_id=$1
    for update of evaluation`, [serviceId, criterionId])).rows[0]
  if (!current) throw new ApiError(404, 'El criterio no pertenece a este servicio.', 'CRITERION_NOT_FOUND')
  if (current.sinAcceso) throw new ApiError(409, 'El Área está registrada sin acceso. Habilita la evaluación antes de cambiar sus criterios.', 'AREA_WITHOUT_ACCESS')
  if (current.version !== expectedVersion) {
    throw new ApiError(409, 'El criterio cambió. Conservamos tu respuesta para que decidas cómo continuar.', 'VERSION_CONFLICT', { remote: current })
  }
  const normalizedObservation = observation.trim()
  const removedEvidenceStoragePaths = current.evidenciasStoragePaths.filter(path => !evidenceStoragePaths.includes(path))
  const { rows } = await client.query<TechnicianCriterion>(`update public.evaluaciones_mip_area set evaluacion=$3,observacion=$4
    ,evidencias_storage_paths=$5::jsonb
    where id=$2 and servicio_id=$1 returning id,criterio_id as "criterioId",criterio_nombre_snapshot as nombre,
    solo_area_externa_snapshot as "soloAreaExterna",evaluacion,observacion,
    evidencias_storage_paths as "evidenciasStoragePaths",version::integer`,
  [serviceId, criterionId, evaluation, normalizedObservation || null, JSON.stringify(evidenceStoragePaths)])
  await audit(client, userId, 'SERVICIO_CRITERIO_EVALUADO', serviceId, {
    areaId: current.areaId,
    criterionId,
    evaluation,
    hasObservation: Boolean(normalizedObservation),
    evidenceCount: evidenceStoragePaths.length,
  })
  return { criterion: rows[0]!, removedEvidenceStoragePaths }
}

type TechnicianDeviceReviewContext = Pick<TechnicianDevice, 'id' | 'dispositivoId' | 'numero' | 'ubicacion' | 'tipoCodigo' | 'estadoAnterior' | 'plagas'> & {
  areaId: string
  sourceAreaId: string
  areaWithoutAccess: boolean
  revision: TechnicianDeviceReview | null
}

export async function createTechnicianDevice(
  client: PoolClient,
  userId: string,
  serviceId: string,
  phoneId: string,
  lockToken: string,
  areaId: string,
  permanentDeviceId: string,
  serviceDeviceId: string,
  input: TechnicianDeviceCreationInput,
): Promise<TechnicianDeviceCreationResult> {
  const service = await assignedServiceState(client, userId, serviceId, true)
  if (service.tipo_servicio !== 'PRINCIPAL' || service.estado !== 'EN_PROCESO') {
    throw new ApiError(409, 'Los dispositivos solo se crean durante un servicio Principal En proceso.', 'SERVICE_NOT_IN_PROGRESS')
  }
  await assertExecutionLock(client, userId, serviceId, phoneId, lockToken)
  const numero = input.numero.trim()
  const ubicacion = input.ubicacion.trim()
  const tipoCodigo = input.tipoCodigo.trim()
  if (!numero || numero.length > 100) throw new ApiError(422, 'El número del dispositivo es obligatorio y no puede superar 100 caracteres.', 'VALIDATION')
  if (!ubicacion || ubicacion.length > 500) throw new ApiError(422, 'La ubicación es obligatoria y no puede superar 500 caracteres.', 'VALIDATION')
  if (!tipoCodigo || tipoCodigo.length > 160) throw new ApiError(422, 'Selecciona un tipo de dispositivo válido.', 'VALIDATION')
  const context = (await client.query<{
    source_area_id: string
    site_id: string
    area_without_access: boolean
    type_name: string
    classification: 'RASTREROS' | 'VOLADORES'
    pests: TechnicianPestSnapshot[]
  }>(`select sa.area_id as source_area_id,s.sede_id as site_id,sa.sin_acceso as area_without_access,
    st.tipo_dispositivo_nombre_snapshot as type_name,st.clasificacion_snapshot as classification,
    st.plagas_snapshot_json as pests
    from public.servicio_areas sa join public.servicios s on s.id=sa.servicio_id
    join public.servicio_tipos_dispositivo st on st.servicio_id=s.id and st.tipo_dispositivo_codigo_snapshot=$3
    where sa.id=$2 and sa.servicio_id=$1 for update of sa`, [serviceId, areaId, tipoCodigo])).rows[0]
  if (!context) throw new ApiError(422, 'El Área o el tipo de dispositivo no pertenece al paquete congelado del servicio.', 'DEVICE_TYPE_INVALID')
  if (context.area_without_access) throw new ApiError(409, 'Habilita el acceso al Área antes de agregar un dispositivo.', 'AREA_WITHOUT_ACCESS')
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`technician-device-number:${context.site_id}:${numero.toLocaleLowerCase('es')}`])
  if ((await client.query('select 1 from public.dispositivos where sede_id=$1 and lower(btrim(numero))=lower(btrim($2)) limit 1',
    [context.site_id, numero])).rowCount) {
    throw new ApiError(409, 'Ya existe un dispositivo con ese número en la Sede.', 'DEVICE_NUMBER_CONFLICT')
  }
  await client.query(`insert into public.dispositivos(id,sede_id,area_id,numero,tipo_dispositivo_codigo,ubicacion,estado_actual)
    values($1,$2,$3,$4,$5,$6,'ACTIVO')`, [permanentDeviceId, context.site_id, context.source_area_id, numero, tipoCodigo, ubicacion])
  await client.query(`insert into public.servicio_dispositivos(id,servicio_id,servicio_area_id,dispositivo_id,numero_snapshot,
    ubicacion_snapshot,tipo_dispositivo_codigo_snapshot,tipo_dispositivo_nombre_snapshot,clasificacion_snapshot,
    plagas_snapshot_json,estado_anterior_snapshot,creado_durante_servicio)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'ACTIVO',true)`,
  [serviceDeviceId, serviceId, areaId, permanentDeviceId, numero, ubicacion, tipoCodigo, context.type_name,
    context.classification, JSON.stringify(context.pests)])
  const device: TechnicianDevice = {
    id: serviceDeviceId,
    dispositivoId: permanentDeviceId,
    numero,
    ubicacion,
    tipoCodigo,
    tipoNombre: context.type_name,
    clasificacion: context.classification,
    plagas: context.pests,
    estadoAnterior: 'ACTIVO',
    creadoDuranteServicio: true,
    revisado: false,
    revision: null,
  }
  await audit(client, userId, 'SERVICIO_DISPOSITIVO_CREADO', serviceId, {
    areaId,
    permanentDeviceId,
    serviceDeviceId,
    numero,
    tipoCodigo,
  })
  return { device }
}

type TechnicianFindingContext = {
  sourceAreaId: string
  siteId: string
  finding: TechnicianFinding
}

async function getFinding(client: PoolClient, findingId: string): Promise<TechnicianFinding | null> {
  const row = (await client.query<{ record: TechnicianFinding }>(`select jsonb_build_object(
    'id',h.id,'servicioAperturaId',h.servicio_apertura_id,'fechaApertura',h.fecha_apertura,
    'descripcion',h.descripcion,'recomendacionAccion',h.recomendacion_accion,
    'evidenciasAperturaStoragePaths',coalesce(h.evidencias_apertura_storage_paths,'[]'::jsonb),
    'estado',h.estado,'responsableNombre',h.responsable_nombre,'responsableCorreo',h.responsable_correo,
    'servicioCierreId',h.servicio_cierre_id,'fechaCierre',h.fecha_cierre,
    'evidenciasCierreStoragePaths',coalesce(h.evidencias_cierre_storage_paths,'[]'::jsonb),
    'observacionCierre',h.observacion_cierre,'version',h.version
  ) as record from public.hallazgos h where h.id=$1`, [findingId])).rows[0]
  return row?.record ?? null
}

async function editableFindingArea(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  areaId: string,
): Promise<{ sourceAreaId: string; siteId: string }> {
  const area = await authorizeTechnicianAreaChange(client, userId, serviceId, deviceId, lockToken, areaId, true)
  if (area.sinAcceso) throw new ApiError(409, 'Habilita el acceso al Área antes de registrar Hallazgos.', 'AREA_WITHOUT_ACCESS')
  const context = (await client.query<{ sourceAreaId: string; siteId: string }>(`select sa.area_id as "sourceAreaId",s.sede_id as "siteId"
    from public.servicio_areas sa join public.servicios s on s.id=sa.servicio_id
    where sa.id=$2 and sa.servicio_id=$1`, [serviceId, areaId])).rows[0]
  if (!context) throw new ApiError(404, 'El Área no pertenece a este servicio.', 'AREA_NOT_FOUND')
  return context
}

export async function authorizeTechnicianFindingChange(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  areaId: string,
  findingId: string,
): Promise<TechnicianFindingContext> {
  const context = await editableFindingArea(client, userId, serviceId, deviceId, lockToken, areaId)
  const finding = await getFinding(client, findingId)
  if (!finding || !(await client.query(`select 1 from public.hallazgos h where h.id=$1 and h.sede_id=$2 and h.area_id=$3
    and (h.servicio_apertura_id=$4 or exists(select 1 from public.servicios opening_service,public.servicios current_service
      where opening_service.id=h.servicio_apertura_id and current_service.id=$4
      and opening_service.inicio_programado<current_service.inicio_programado)) limit 1`,
  [findingId, context.siteId, context.sourceAreaId, serviceId])).rowCount) {
    throw new ApiError(404, 'El Hallazgo no pertenece a esta Área o no está disponible para seguimiento.', 'FINDING_NOT_FOUND')
  }
  return { ...context, finding }
}

export async function createTechnicianFinding(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  areaId: string,
  findingId: string,
  input: TechnicianFindingCreateInput,
  evidenceStoragePaths: string[],
): Promise<TechnicianFindingResult> {
  const context = await editableFindingArea(client, userId, serviceId, deviceId, lockToken, areaId)
  const descripcion = input.descripcion.trim(), recomendacion = input.recomendacionAccion.trim()
  if (!descripcion || descripcion.length > 2_000 || !recomendacion || recomendacion.length > 2_000) {
    throw new ApiError(422, 'Completa la descripción y la acción recomendada del Hallazgo.', 'VALIDATION')
  }
  // La responsabilidad la determina el contacto de la Sede, nunca un valor enviado por el Técnico.
  const contact = (await client.query<{ nombre: string; correo: string | null }>(
    `select contacto_principal_nombre as nombre, contacto_principal_correo as correo
      from public.sedes where id=$1`, [context.siteId]
  )).rows[0]
  const responsableNombre = contact?.nombre.trim() ?? ''
  const responsableCorreo = contact?.correo?.trim().toLowerCase() || null
  if (!responsableNombre || responsableNombre.length > 200 || (responsableCorreo &&
    (responsableCorreo.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(responsableCorreo)))) {
    throw new ApiError(409, 'Configura el contacto principal de la Sede antes de registrar Hallazgos.', 'SITE_CONTACT_INVALID')
  }
  if (evidenceStoragePaths.length > 10 || new Set(evidenceStoragePaths).size !== evidenceStoragePaths.length) {
    throw new ApiError(422, 'Las evidencias del Hallazgo no son válidas.', 'VALIDATION')
  }
  await client.query(`insert into public.hallazgos(id,sede_id,area_id,servicio_apertura_id,fecha_apertura,descripcion,
    recomendacion_accion,evidencias_apertura_storage_paths,estado,responsable_nombre,responsable_correo)
    values($1,$2,$3,$4,now(),$5,$6,$7::jsonb,'ABIERTO',$8,$9)`,
  [findingId, context.siteId, context.sourceAreaId, serviceId, descripcion, recomendacion,
    JSON.stringify(evidenceStoragePaths), responsableNombre, responsableCorreo])
  const finding = await getFinding(client, findingId)
  if (!finding) throw new ApiError(500, 'No fue posible recuperar el Hallazgo creado.', 'UNEXPECTED')
  await audit(client, userId, 'SERVICIO_HALLAZGO_CREADO', serviceId, { areaId, findingId, evidenceCount: evidenceStoragePaths.length })
  return { finding }
}

export async function saveTechnicianFindingStatus(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  areaId: string,
  findingId: string,
  expectedVersion: number,
  input: TechnicianFindingStatusInput,
  evidenceStoragePaths: string[],
): Promise<TechnicianFindingResult> {
  const context = await authorizeTechnicianFindingChange(client, userId, serviceId, deviceId, lockToken, areaId, findingId)
  await client.query('select id from public.hallazgos where id=$1 for update', [findingId])
  const current = await getFinding(client, findingId)
  if (!current) throw new ApiError(404, 'El Hallazgo ya no está disponible.', 'FINDING_NOT_FOUND')
  if (current.version !== expectedVersion) {
    throw new ApiError(409, 'El Hallazgo cambió. Conservamos tu actualización para que decidas cómo continuar.', 'VERSION_CONFLICT', { remote: current })
  }
  if (current.servicioAperturaId === serviceId) {
    throw new ApiError(409, 'Un Hallazgo se verifica o cierra en un Servicio posterior.', 'FINDING_SAME_SERVICE')
  }
  if (current.estado === 'CERRADO') throw new ApiError(409, 'El Hallazgo ya fue cerrado.', 'FINDING_CLOSED', { remote: current })
  if (input.observacionCierre.length > 2_000 || evidenceStoragePaths.length > 10 || new Set(evidenceStoragePaths).size !== evidenceStoragePaths.length) {
    throw new ApiError(422, 'La actualización del Hallazgo no es válida.', 'VALIDATION')
  }
  if (input.estado === 'CERRADO' && !evidenceStoragePaths.length) {
    throw new ApiError(422, 'Adjunta al menos una evidencia para cerrar el Hallazgo.', 'VALIDATION')
  }
  if (input.estado === 'EN_PROCESO') {
    if (current.estado !== 'ABIERTO') throw new ApiError(409, 'El Hallazgo ya está en seguimiento.', 'FINDING_ALREADY_IN_PROGRESS', { remote: current })
    await client.query("update public.hallazgos set estado='EN_PROCESO' where id=$1", [findingId])
  } else {
    await client.query(`update public.hallazgos set estado='CERRADO',servicio_cierre_id=$2,fecha_cierre=now(),
      evidencias_cierre_storage_paths=$3::jsonb,observacion_cierre=$4 where id=$1`,
    [findingId, serviceId, JSON.stringify(evidenceStoragePaths), input.observacionCierre.trim() || null])
  }
  const finding = await getFinding(client, findingId)
  if (!finding) throw new ApiError(500, 'No fue posible recuperar el Hallazgo actualizado.', 'UNEXPECTED')
  await audit(client, userId, input.estado === 'CERRADO' ? 'SERVICIO_HALLAZGO_CERRADO' : 'SERVICIO_HALLAZGO_EN_PROCESO', serviceId, {
    areaId,
    findingId,
    evidenceCount: evidenceStoragePaths.length,
    previousState: context.finding.estado,
  })
  return { finding }
}

export async function authorizeTechnicianDeviceChange(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  serviceDeviceId: string,
  lockReview = false,
): Promise<TechnicianDeviceReviewContext> {
  const service = await assignedServiceState(client, userId, serviceId, true)
  if (service.tipo_servicio !== 'PRINCIPAL' || service.estado !== 'EN_PROCESO') {
    throw new ApiError(409, 'Los dispositivos solo se revisan durante un servicio Principal En proceso.', 'SERVICE_NOT_IN_PROGRESS')
  }
  await assertExecutionLock(client, userId, serviceId, deviceId, lockToken)
  if (lockReview) await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`technician-device-review:${serviceDeviceId}`])
  const context = (await client.query<TechnicianDeviceReviewContext>(`select sd.id,sd.dispositivo_id as "dispositivoId",
    sd.numero_snapshot as numero,sd.ubicacion_snapshot as ubicacion,sd.tipo_dispositivo_codigo_snapshot as "tipoCodigo",
    sd.estado_anterior_snapshot as "estadoAnterior",sd.plagas_snapshot_json as plagas,sa.id as "areaId",sa.area_id as "sourceAreaId",
    sa.sin_acceso as "areaWithoutAccess",case when r.id is null then null else jsonb_build_object(
      'id',r.id,'estadoObservado',r.estado_observado,'capturas',r.capturas_json,
      'consumo',case when r.consumo is null then '' when jsonb_typeof(r.consumo)='string' then r.consumo #>> '{}' else r.consumo::text end,
      'productoQuimico',coalesce(r.producto_quimico,''),'antidoto',coalesce(r.antidoto,''),
      'observaciones',coalesce(r.observaciones,''),'fotoStoragePath',r.foto_storage_path,'version',r.version::integer
    ) end as revision
    from public.servicio_dispositivos sd
    join public.servicio_areas sa on sa.id=sd.servicio_area_id
    left join public.revisiones_dispositivos r on r.servicio_dispositivo_id=sd.id
    where sd.id=$2 and sd.servicio_id=$1`, [serviceId, serviceDeviceId])).rows[0]
  if (!context) throw new ApiError(404, 'El dispositivo no pertenece a este servicio.', 'DEVICE_NOT_FOUND')
  if (context.areaWithoutAccess) throw new ApiError(409, 'El Área está registrada sin acceso. Habilita el ingreso antes de revisar sus dispositivos.', 'AREA_WITHOUT_ACCESS')
  return context
}

export async function saveTechnicianDeviceReview(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  serviceDeviceId: string,
  reviewId: string,
  expectedVersion: number,
  input: TechnicianDeviceReviewInput,
  photoStoragePath: string | null,
): Promise<TechnicianDeviceReviewResult & { replacedPhotoPath: string | null }> {
  const context = await authorizeTechnicianDeviceChange(client, userId, serviceId, deviceId, lockToken, serviceDeviceId, true)
  const currentVersion = context.revision?.version ?? 0
  if (currentVersion !== expectedVersion) {
    throw new ApiError(409, 'La revisión del dispositivo cambió. Conservamos tus datos para que decidas cómo continuar.', 'VERSION_CONFLICT', { remote: context.revision })
  }
  if (context.revision && context.revision.id !== reviewId) throw new ApiError(409, 'La revisión del dispositivo cambió.', 'VERSION_CONFLICT', { remote: context.revision })
  if (!['ACTIVO', 'DANADO', 'FUERA_DE_USO'].includes(input.estadoObservado)) throw new ApiError(422, 'Selecciona un estado válido para el dispositivo.', 'VALIDATION')
  if (!Array.isArray(input.capturas) || input.capturas.length > 200) throw new ApiError(422, 'Las capturas registradas no son válidas.', 'VALIDATION')
  const pestNames = new Map(context.plagas.map(pest => [pest.codigo, pest.nombre]))
  const seen = new Set<string>()
  const captures: TechnicianDeviceCapture[] = input.capturas.map(capture => {
    const name = pestNames.get(capture.plagaCodigo)
    if (!name || seen.has(capture.plagaCodigo) || !Number.isSafeInteger(capture.cantidad) || capture.cantidad < 1 || capture.cantidad > 1_000_000) {
      throw new ApiError(422, 'Las capturas registradas no son válidas.', 'VALIDATION')
    }
    seen.add(capture.plagaCodigo)
    return { plagaCodigo: capture.plagaCodigo, plagaNombreSnapshot: name, cantidad: capture.cantidad }
  })
  const consumo = input.consumo.trim()
  const productoQuimico = input.productoQuimico.trim()
  const antidoto = input.antidoto.trim()
  const observaciones = input.observaciones.trim()
  if (consumo.length > 500 || productoQuimico.length > 500 || antidoto.length > 500 || observaciones.length > 2_000) {
    throw new ApiError(422, 'La información de la revisión supera el tamaño permitido.', 'VALIDATION')
  }
  if (technicianDevicePhotoRequired(context.estadoAnterior, input.estadoObservado) && !photoStoragePath) {
    throw new ApiError(422, 'Adjunta una fotografía del cambio de estado del dispositivo.', 'VALIDATION')
  }
  const values = [
    serviceId, serviceDeviceId, context.dispositivoId, context.sourceAreaId, context.numero, context.ubicacion, context.tipoCodigo,
    input.estadoObservado, JSON.stringify(captures), consumo || null, productoQuimico || null, antidoto || null,
    observaciones || null, photoStoragePath,
  ]
  const query = context.revision
    ? `update public.revisiones_dispositivos set estado_observado=$8,capturas_json=$9::jsonb,
        consumo=case when $10::text is null then null else to_jsonb($10::text) end,producto_quimico=$11,antidoto=$12,
        observaciones=$13,foto_storage_path=$14 where id=$15 and servicio_dispositivo_id=$2
      returning id,estado_observado as "estadoObservado",capturas_json as capturas,
        case when consumo is null then '' when jsonb_typeof(consumo)='string' then consumo #>> '{}' else consumo::text end as consumo,
        coalesce(producto_quimico,'') as "productoQuimico",coalesce(antidoto,'') as antidoto,
        coalesce(observaciones,'') as observaciones,foto_storage_path as "fotoStoragePath",version::integer`
    : `insert into public.revisiones_dispositivos(id,servicio_id,servicio_dispositivo_id,dispositivo_id,area_id,
        numero_snapshot,ubicacion_snapshot,tipo_dispositivo_codigo,estado_observado,capturas_json,consumo,
        producto_quimico,antidoto,observaciones,foto_storage_path)
      values($15,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,case when $10::text is null then null else to_jsonb($10::text) end,$11,$12,$13,$14)
      returning id,estado_observado as "estadoObservado",capturas_json as capturas,
        case when consumo is null then '' when jsonb_typeof(consumo)='string' then consumo #>> '{}' else consumo::text end as consumo,
        coalesce(producto_quimico,'') as "productoQuimico",coalesce(antidoto,'') as antidoto,
        coalesce(observaciones,'') as observaciones,foto_storage_path as "fotoStoragePath",version::integer`
  const review = (await client.query<TechnicianDeviceReview>(query, [...values, context.revision?.id ?? reviewId])).rows[0]!
  await client.query('update public.dispositivos set estado_actual=$2 where id=$1 and estado_actual<>$2', [context.dispositivoId, input.estadoObservado])
  await audit(client, userId, 'SERVICIO_DISPOSITIVO_REVISADO', serviceId, {
    serviceDeviceId,
    deviceId: context.dispositivoId,
    previousState: context.estadoAnterior,
    observedState: input.estadoObservado,
    captures: captures.length,
    hasPhoto: Boolean(photoStoragePath),
  })
  return {
    review,
    replacedPhotoPath: context.revision?.fotoStoragePath && context.revision.fotoStoragePath !== review.fotoStoragePath
      ? context.revision.fotoStoragePath
      : null,
  }
}

async function lockSnapshotSources(client: PoolClient, serviceId: string): Promise<{ areaIds: string[]; criterionIds: string[]; deviceIds: string[] }> {
  const areaIds = (await client.query<{ id: string }>(`select a.id from public.servicios s join public.areas a on a.sede_id=s.sede_id
    where s.id=$1 and a.activo order by a.id for share of a`, [serviceId])).rows.map(row => row.id)
  const criterionIds = (await client.query<{ id: string }>('select id from public.criterios_mip where activo order by id for share', [])).rows.map(row => row.id)
  const deviceIds = areaIds.length ? (await client.query<{ id: string }>(`select id from public.dispositivos
    where area_id=any($1::uuid[]) and activo order by id for share`, [areaIds])).rows.map(row => row.id) : []
  const invalidDevice = deviceIds.length ? (await client.query<{ numero: string }>(`select d.numero from public.dispositivos d
    left join public.trampas t on t.clave=d.tipo_dispositivo_codigo
    where d.id=any($1::uuid[]) and t.id is null order by lower(btrim(d.numero)),d.id limit 1`, [deviceIds])).rows[0] : undefined
  if (invalidDevice) throw new ApiError(422, `El dispositivo ${invalidDevice.numero} no tiene un tipo vigente en el catálogo MIP.`, 'DEVICE_TYPE_INVALID')
  if (deviceIds.length) {
    await client.query(`select t.id from public.dispositivos d join public.trampas t on t.clave=d.tipo_dispositivo_codigo
      where d.id=any($1::uuid[]) order by t.id for share of t`, [deviceIds])
    await client.query(`select c.id from public.dispositivos d join public.trampas t on t.clave=d.tipo_dispositivo_codigo
      join public.configuracion c on c.categoria='PLAGA' and c.activo and c.clasificacion_mip=t.clasificacion
      where d.id=any($1::uuid[]) order by c.id for share of c`, [deviceIds])
  }
  await client.query(`select p.id from public.productos_aplicados pa join public.productos p on p.id=pa.producto_id
    where pa.servicio_id=$1 order by p.id for share of pa,p`, [serviceId])
  await client.query(`select c.id from public.productos_aplicados pa
    join public.producto_metodos pm on pm.producto_id=pa.producto_id
    join public.configuracion c on c.id=pm.metodo_id and c.categoria='METODO_APLICACION' and c.activo
    where pa.servicio_id=$1 order by c.id for share of pm,c`, [serviceId])
  return { areaIds, criterionIds, deviceIds }
}

export async function startTechnicianService(client: PoolClient, userId: string, serviceId: string, expectedVersion: number, deviceId: string): Promise<TechnicianExecutionSession> {
  const service = await assignedServiceState(client, userId, serviceId, true)
  assertVersion(Number(service.version), expectedVersion)
  if (service.tipo_servicio !== 'PRINCIPAL') throw new ApiError(422, 'La ejecución móvil inicial solo admite servicios Principales.', 'SERVICE_KIND_UNSUPPORTED')
  if (service.estado !== 'PROGRAMADO') throw new ApiError(409, 'El servicio ya no está Programado.', 'SERVICE_NOT_PROGRAMMED')
  if (!service.eligible) throw new ApiError(409, 'Puedes iniciar el servicio desde una hora antes de la programación.', 'SERVICE_TOO_EARLY')
  const incomplete = (await client.query<{ count: number }>(`select count(*)::integer as count from public.productos_aplicados
    where servicio_id=$1 and (nullif(btrim(lote),'') is null or fecha_vencimiento is null)`, [serviceId])).rows[0]?.count ?? 0
  if (incomplete) throw new ApiError(422, 'El Administrador debe completar lote y vencimiento de cada producto antes de iniciar.', 'PRODUCTS_INCOMPLETE')
  const sources = await lockSnapshotSources(client, serviceId)
  const missingCatalog = (await client.query<{ nombre: string }>(`select p.nombre from public.productos_aplicados pa
    join public.productos p on p.id=pa.producto_id where pa.servicio_id=$1 and (
      nullif(btrim(p.dosis_aplicacion),'') is null or not exists (
        select 1 from public.producto_metodos pm join public.configuracion c on c.id=pm.metodo_id
        where pm.producto_id=p.id and c.categoria='METODO_APLICACION' and c.activo
          and nullif(btrim(coalesce(c.nombre,'')),'') is not null))
    order by p.nombre limit 1`, [serviceId])).rows[0]
  if (missingCatalog) throw new ApiError(422, `El producto ${missingCatalog.nombre} necesita dosis y método configurados en el catálogo MIP.`, 'PRODUCT_CATALOG_INCOMPLETE')
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
  await client.query(`insert into public.servicio_tipos_dispositivo(servicio_id,tipo_dispositivo_codigo_snapshot,
    tipo_dispositivo_nombre_snapshot,clasificacion_snapshot,plagas_snapshot_json)
    select $1,t.clave,t.nombre,t.clasificacion,
      coalesce((select jsonb_agg(jsonb_build_object('codigo',c.clave,'nombre',c.nombre)
        order by lower(btrim(c.nombre)),c.clave) from public.configuracion c
        where c.categoria='PLAGA' and c.activo and c.clasificacion_mip=t.clasificacion),'[]'::jsonb)
    from public.trampas t where t.activo order by lower(btrim(t.nombre)),t.clave`, [serviceId])
  await client.query(`insert into public.servicio_dispositivos(servicio_id,servicio_area_id,dispositivo_id,numero_snapshot,ubicacion_snapshot,
    tipo_dispositivo_codigo_snapshot,tipo_dispositivo_nombre_snapshot,clasificacion_snapshot,plagas_snapshot_json,estado_anterior_snapshot)
    select $1,sa.id,d.id,d.numero,d.ubicacion,d.tipo_dispositivo_codigo,t.nombre,t.clasificacion,
      coalesce((select jsonb_agg(jsonb_build_object('codigo',c.clave,'nombre',c.nombre)
        order by lower(btrim(c.nombre)),c.clave) from public.configuracion c
        where c.categoria='PLAGA' and c.activo and c.clasificacion_mip=t.clasificacion),'[]'::jsonb),d.estado_actual
    from public.servicio_areas sa join public.dispositivos d on d.area_id=sa.area_id
    join public.trampas t on t.clave=d.tipo_dispositivo_codigo
    where sa.servicio_id=$1 and d.id=any($2::uuid[]) order by sa.posicion_inicial,lower(btrim(d.numero)),d.id`, [serviceId, sources.deviceIds])
  await client.query(`update public.productos_aplicados pa set aplicado=true,producto_nombre_snapshot=p.nombre,
    principio_activo_snapshot=p.principio_activo_composicion,registro_sanitario_snapshot=p.registro_sanitario,
    dosis_referencia_snapshot=p.dosis_aplicacion,dosis=to_jsonb(p.dosis_aplicacion),
    metodo_aplicacion_codigo=null,metodo_aplicacion_nombre_snapshot=(
      select string_agg(c.nombre,', ' order by coalesce(c.orden,2147483647),c.nombre,c.id)
      from public.producto_metodos pm join public.configuracion c on c.id=pm.metodo_id
      where pm.producto_id=p.id and c.categoria='METODO_APLICACION' and c.activo)
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

export async function finalizeTechnicianService(
  client: PoolClient,
  userId: string,
  serviceId: string,
  deviceId: string,
  lockToken: string,
  technicianStoragePath: string,
  clientStoragePath: string,
  clientName: string,
): Promise<{ package: TechnicianServicePackage }> {
  const service = await assignedServiceState(client, userId, serviceId, true)
  if (service.tipo_servicio !== 'PRINCIPAL' || service.estado !== 'EN_PROCESO') {
    throw new ApiError(409, 'Solo se finaliza un servicio Principal En proceso.', 'SERVICE_NOT_IN_PROGRESS')
  }
  await assertExecutionLock(client, userId, serviceId, deviceId, lockToken)
  const incomplete = (await client.query<{ count: number }>(`select count(*)::integer as count
    from public.servicio_areas sa where sa.servicio_id=$1 and not (
      (sa.sin_acceso and nullif(btrim(sa.sin_acceso_descripcion),'') is not null and sa.sin_acceso_foto_storage_path is not null)
      or (not sa.sin_acceso
        and not exists(select 1 from public.evaluaciones_mip_area e where e.servicio_area_id=sa.id and e.evaluacion is null)
        and not exists(select 1 from public.servicio_dispositivos sd left join public.revisiones_dispositivos r
          on r.servicio_dispositivo_id=sd.id where sd.servicio_area_id=sa.id and (r.id is null
            or (r.estado_observado<>sd.estado_anterior_snapshot and r.estado_observado in ('DANADO','FUERA_DE_USO') and r.foto_storage_path is null))))
    )`, [serviceId])).rows[0]?.count ?? 0
  if (incomplete) throw new ApiError(422, 'Completa todas las Áreas y dispositivos antes de finalizar.', 'SERVICE_INCOMPLETE')
  const normalizedClientName = clientName.trim()
  if (!normalizedClientName || normalizedClientName.length > 200) throw new ApiError(422, 'Indica el nombre de quien firma por el cliente.', 'VALIDATION')
  await client.query(`update public.servicios set estado='FINALIZADO',fin_real=now(),
    firma_tecnico_storage_path=$2,firma_tecnico_usuario_id=$3,
    firma_cliente_storage_path=$4,firma_cliente_nombre=$5,firma_cliente_at=now()
    where id=$1`, [serviceId, technicianStoragePath, userId, clientStoragePath, normalizedClientName])
  await client.query('delete from private.service_execution_locks where service_id=$1', [serviceId])
  await audit(client, userId, 'SERVICIO_FINALIZADO', serviceId, { deviceId, clientSigner: normalizedClientName })
  return { package: await getTechnicianPackage(client, userId, serviceId) }
}

export async function releaseTechnicianServiceLock(client: PoolClient, adminId: string, serviceId: string, reason: string): Promise<{ serviceId: string; released: boolean }> {
  const service = (await client.query<{ estado: string }>('select estado from public.servicios where id=$1 for update', [serviceId])).rows[0]
  if (!service) throw new ApiError(404, 'El servicio no está disponible.', 'SERVICE_NOT_FOUND')
  const result = await client.query('delete from private.service_execution_locks where service_id=$1', [serviceId])
  await audit(client, adminId, 'SERVICIO_BLOQUEO_LIBERADO', serviceId, { reason, released: Boolean(result.rowCount) })
  return { serviceId, released: Boolean(result.rowCount) }
}

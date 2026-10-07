import type { PoolClient } from 'pg'
import type {
  TechnicianArea,
  TechnicianCriterion,
  TechnicianDevice,
  TechnicianProduct,
  TechnicianServicePackage,
  TechnicianServiceSummary,
} from '../../../src/types/technicianServices'
import { ApiError } from '../auth'

type ServiceStateRow = {
  id: string
  estado: TechnicianServiceSummary['estado']
  tipo_servicio: TechnicianServiceSummary['tipoServicio']
  version: string
  inicio_programado: Date
  eligible: boolean
}

const assignment = `(s.tecnico_responsable_id=$1::uuid or coalesce(s.tecnicos_colaboradores_ids_json,'[]'::jsonb) ? $1::text)`
const summaryJson = `jsonb_build_object('id',s.id,'solicitud',s.solicitud,'tipoServicio',s.tipo_servicio,'estado',s.estado,
  'version',s.version,'inicioProgramado',s.inicio_programado,'finProgramado',s.fin_programado,'inicioReal',s.inicio_real,
  'clienteNombre',n.nombre,'sedeNombre',se.nombre,'direccion',se.direccion)`

export async function listTechnicianServices(client: PoolClient, userId: string): Promise<TechnicianServiceSummary[]> {
  const { rows } = await client.query<{ record: TechnicianServiceSummary }>(`select ${summaryJson} as record
    from public.servicios s join public.sedes se on se.id=s.sede_id join public.negocios n on n.id=se.negocio_id
    where ${assignment} and s.tipo_servicio='PRINCIPAL' and s.estado<>'CANCELADO'
    order by case s.estado when 'EN_PROCESO' then 0 when 'PROGRAMADO' then 1 else 2 end,
      case when s.estado='FINALIZADO' then s.inicio_programado end desc,
      case when s.estado<>'FINALIZADO' then s.inicio_programado end,s.id limit 200`, [userId])
  return rows.map(row => row.record)
}

export async function assignedServiceState(client: PoolClient, userId: string, serviceId: string, lock = false): Promise<ServiceStateRow> {
  const { rows } = await client.query<ServiceStateRow>(`select s.id,s.estado,s.tipo_servicio,s.version,s.inicio_programado,
    (se.tipo_sede='NEGOCIO' and s.tipo_servicio='PRINCIPAL' and now() >= s.inicio_programado-interval '1 hour') as eligible
    from public.servicios s join public.sedes se on se.id=s.sede_id
    where s.id=$2::uuid and ${assignment}${lock ? ' for update of s' : ''}`, [userId, serviceId])
  if (!rows[0]) throw new ApiError(404, 'El servicio no está disponible.', 'SERVICE_NOT_FOUND')
  return rows[0]
}

async function serviceHeader(client: PoolClient, userId: string, serviceId: string): Promise<{
  service: TechnicianServiceSummary
  serverNow: string
  canStart: boolean
  startAvailableAt: string
}> {
  const { rows } = await client.query<{ service: TechnicianServiceSummary; serverNow: string; canStart: boolean; startAvailableAt: string }>(`select
    ${summaryJson} as service,to_jsonb(now()) #>> '{}' as "serverNow",
    (s.estado='PROGRAMADO' and s.tipo_servicio='PRINCIPAL' and se.tipo_sede='NEGOCIO' and now() >= s.inicio_programado-interval '1 hour') as "canStart",
    to_jsonb(s.inicio_programado-interval '1 hour') #>> '{}' as "startAvailableAt"
    from public.servicios s join public.sedes se on se.id=s.sede_id join public.negocios n on n.id=se.negocio_id
    where s.id=$2::uuid and ${assignment}`, [userId, serviceId])
  if (!rows[0]) throw new ApiError(404, 'El servicio no está disponible.', 'SERVICE_NOT_FOUND')
  return rows[0]
}

async function products(client: PoolClient, serviceId: string, frozen: boolean): Promise<TechnicianProduct[]> {
  const { rows } = await client.query<{ record: TechnicianProduct }>(`select jsonb_build_object('id',pa.id,
    'nombre',${frozen ? 'coalesce(pa.producto_nombre_snapshot,p.nombre)' : 'p.nombre'},
    'principioActivo',${frozen ? 'coalesce(pa.principio_activo_snapshot,p.principio_activo_composicion)' : 'p.principio_activo_composicion'},
    'registroSanitario',${frozen ? "coalesce(pa.registro_sanitario_snapshot,'')" : "coalesce(p.registro_sanitario,'')"},
    'dosisReferencia',${frozen ? "coalesce(pa.dosis_referencia_snapshot,'')" : "coalesce(p.dosis_aplicacion,'')"},
    'lote',coalesce(pa.lote,''),'fechaFabricacion',pa.fecha_fabricacion,'fechaVencimiento',pa.fecha_vencimiento,
    'dosis',case when jsonb_typeof(pa.dosis)='string' then pa.dosis #>> '{}' else coalesce(pa.dosis::text,'') end,
    'metodoAplicacion',${frozen ? 'coalesce(pa.metodo_aplicacion_nombre_snapshot,c.nombre)' : 'c.nombre'}) as record
    from public.productos_aplicados pa join public.productos p on p.id=pa.producto_id
    left join public.configuracion c on c.categoria='METODO_APLICACION' and c.clave=pa.metodo_aplicacion_codigo
    where pa.servicio_id=$1 order by ${frozen ? 'coalesce(pa.producto_nombre_snapshot,p.nombre)' : 'p.nombre'},pa.id`, [serviceId])
  return rows.map(row => row.record)
}

async function frozenAreas(client: PoolClient, serviceId: string): Promise<TechnicianArea[]> {
  const areas = (await client.query<Omit<TechnicianArea, 'criterios' | 'dispositivos'>>(`select id,area_id as "areaId",nombre_snapshot as nombre,
    es_externa_snapshot as "esExterna",posicion_inicial as "posicionInicial",posicion_recorrido as "posicionRecorrido",
    sin_acceso as "sinAcceso",sin_acceso_descripcion as "sinAccesoDescripcion",sin_acceso_foto_storage_path as "sinAccesoFotoStoragePath",version::integer
    from public.servicio_areas where servicio_id=$1 order by posicion_recorrido,id`, [serviceId])).rows
  const criteria = (await client.query<(TechnicianCriterion & { servicioAreaId: string })>(`select id,servicio_area_id as "servicioAreaId",criterio_id as "criterioId",
    criterio_nombre_snapshot as nombre,solo_area_externa_snapshot as "soloAreaExterna",evaluacion,observacion,
    evidencias_storage_paths as "evidenciasStoragePaths",version::integer from public.evaluaciones_mip_area
    where servicio_id=$1 order by servicio_area_id,lower(criterio_nombre_snapshot),id`, [serviceId])).rows
  const devices = (await client.query<(TechnicianDevice & { servicioAreaId: string })>(`select id,servicio_area_id as "servicioAreaId",dispositivo_id as "dispositivoId",
    numero_snapshot as numero,ubicacion_snapshot as ubicacion,tipo_dispositivo_codigo_snapshot as "tipoCodigo",
    estado_anterior_snapshot as "estadoAnterior" from public.servicio_dispositivos
    where servicio_id=$1 order by servicio_area_id,lower(numero_snapshot),id`, [serviceId])).rows
  return areas.map(area => ({ ...area,
    criterios: criteria.filter(item => item.servicioAreaId === area.id).map(item => ({ id:item.id,criterioId:item.criterioId,nombre:item.nombre,soloAreaExterna:item.soloAreaExterna,evaluacion:item.evaluacion,observacion:item.observacion,evidenciasStoragePaths:item.evidenciasStoragePaths,version:item.version })),
    dispositivos: devices.filter(item => item.servicioAreaId === area.id).map(item => ({ id:item.id,dispositivoId:item.dispositivoId,numero:item.numero,ubicacion:item.ubicacion,tipoCodigo:item.tipoCodigo,estadoAnterior:item.estadoAnterior })) }))
}

async function liveAreas(client: PoolClient, serviceId: string): Promise<TechnicianArea[]> {
  const areas = (await client.query<Omit<TechnicianArea, 'criterios' | 'dispositivos'>>(`select a.id,a.id as "areaId",a.nombre,a.es_externa as "esExterna",
    (row_number() over(order by lower(btrim(a.nombre)),a.id)-1)::integer as "posicionInicial",
    (row_number() over(order by lower(btrim(a.nombre)),a.id)-1)::integer as "posicionRecorrido",false as "sinAcceso",
    null::text as "sinAccesoDescripcion",null::text as "sinAccesoFotoStoragePath",1::integer as version
    from public.servicios s join public.areas a on a.sede_id=s.sede_id and a.activo where s.id=$1 order by lower(btrim(a.nombre)),a.id`, [serviceId])).rows
  const criteria = (await client.query<(TechnicianCriterion & { areaId: string })>(`select c.id,c.id as "criterioId",a.id as "areaId",c.nombre,
    c.solo_area_externa as "soloAreaExterna",null::text as evaluacion,null::text as observacion,'[]'::jsonb as "evidenciasStoragePaths",1::integer as version
    from public.servicios s join public.areas a on a.sede_id=s.sede_id and a.activo
    cross join public.criterios_mip c where s.id=$1 and c.activo and (not c.solo_area_externa or a.es_externa)
    order by a.id,lower(btrim(c.nombre)),c.id`, [serviceId])).rows
  const devices = (await client.query<(TechnicianDevice & { areaId: string })>(`select d.id,d.id as "dispositivoId",d.area_id as "areaId",d.numero,
    d.ubicacion,d.tipo_dispositivo_codigo as "tipoCodigo",d.estado_actual as "estadoAnterior"
    from public.servicios s join public.dispositivos d on d.sede_id=s.sede_id and d.activo
    join public.areas a on a.id=d.area_id and a.activo where s.id=$1 order by d.area_id,lower(btrim(d.numero)),d.id`, [serviceId])).rows
  return areas.map(area => ({ ...area,
    criterios: criteria.filter(item => item.areaId === area.areaId).map(item => ({ id:item.id,criterioId:item.criterioId,nombre:item.nombre,soloAreaExterna:item.soloAreaExterna,evaluacion:item.evaluacion,observacion:item.observacion,evidenciasStoragePaths:item.evidenciasStoragePaths,version:item.version })),
    dispositivos: devices.filter(item => item.areaId === area.areaId).map(item => ({ id:item.id,dispositivoId:item.dispositivoId,numero:item.numero,ubicacion:item.ubicacion,tipoCodigo:item.tipoCodigo,estadoAnterior:item.estadoAnterior })) }))
}

export async function getTechnicianPackage(client: PoolClient, userId: string, serviceId: string): Promise<TechnicianServicePackage> {
  const header = await serviceHeader(client, userId, serviceId)
  const frozen = header.service.estado === 'EN_PROCESO' || header.service.estado === 'FINALIZADO'
  return { ...header, frozen, products: await products(client, serviceId, frozen), areas: frozen ? await frozenAreas(client, serviceId) : await liveAreas(client, serviceId) }
}

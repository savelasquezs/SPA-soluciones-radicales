import type { PoolClient } from 'pg'
import type {
  TechnicianArea,
  TechnicianCriterion,
  TechnicianDevice,
  TechnicianDeviceTypeSnapshot,
  TechnicianFinding,
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
  'clienteNombre',n.nombre,'sedeNombre',se.nombre,'direccion',se.direccion,
  'contactoPrincipalNombre',se.contacto_principal_nombre,'contactoPrincipalCorreo',se.contacto_principal_correo,
  'contactEmails',coalesce(n.correos_json,'[]'::jsonb) || coalesce(se.correos_json,'[]'::jsonb)
    || case when se.contacto_principal_correo is not null then jsonb_build_array(se.contacto_principal_correo) else '[]'::jsonb end,
  'autoPrepareEligible',(s.estado='EN_PROCESO' or (s.estado='PROGRAMADO' and s.tipo_servicio='PRINCIPAL' and se.tipo_sede='NEGOCIO' and now() >= s.inicio_programado-interval '1 hour')))`

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
    'dosis',${frozen ? "coalesce(pa.dosis_referencia_snapshot,p.dosis_aplicacion,'')" : "coalesce(p.dosis_aplicacion,'')"},
    'fichaTecnicaDisponible',p.ficha_tecnica_storage_path like 'products/technical-sheets/%',
    'metodoAplicacion',${frozen
      ? "coalesce(pa.metodo_aplicacion_nombre_snapshot,'')"
      : "(select coalesce(string_agg(c.nombre,', ' order by coalesce(c.orden,2147483647),c.nombre,c.id),'') from public.producto_metodos pm join public.configuracion c on c.id=pm.metodo_id where pm.producto_id=p.id and c.categoria='METODO_APLICACION' and c.activo)"}) as record
    from public.productos_aplicados pa join public.productos p on p.id=pa.producto_id
    where pa.servicio_id=$1 order by ${frozen ? 'coalesce(pa.producto_nombre_snapshot,p.nombre)' : 'p.nombre'},pa.id`, [serviceId])
  return rows.map(row => row.record)
}

async function findings(client: PoolClient, serviceId: string): Promise<Array<TechnicianFinding & { areaId: string }>> {
  const { rows } = await client.query<{ areaId: string; record: TechnicianFinding }>(`select h.area_id as "areaId",jsonb_build_object(
    'id',h.id,'servicioAperturaId',h.servicio_apertura_id,'fechaApertura',h.fecha_apertura,
    'descripcion',h.descripcion,'recomendacionAccion',h.recomendacion_accion,
    'evidenciasAperturaStoragePaths',coalesce(h.evidencias_apertura_storage_paths,'[]'::jsonb),
    'estado',h.estado,
    'resultadoSeguimiento',(select seg.resultado from public.hallazgo_seguimientos seg
      where seg.hallazgo_id=h.id and seg.servicio_id=$1),
    'estadoAnteriorSeguimiento',(select seg.estado_anterior from public.hallazgo_seguimientos seg
      where seg.hallazgo_id=h.id and seg.servicio_id=$1),
    'observacionSeguimiento',(select seg.observacion from public.hallazgo_seguimientos seg
      where seg.hallazgo_id=h.id and seg.servicio_id=$1),
    'evidenciasSeguimientoStoragePaths',(select coalesce(seg.evidencias_storage_paths,'[]'::jsonb) from public.hallazgo_seguimientos seg
      where seg.hallazgo_id=h.id and seg.servicio_id=$1),
    'historialSeguimientos',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',seg.id,'servicioId',visit.id,'solicitud',visit.solicitud,'fecha',seg.registrado_at,
      'resultado',seg.resultado,'observacion',seg.observacion,
      'evidenciasStoragePaths',seg.evidencias_storage_paths) order by seg.registrado_at desc),'[]'::jsonb)
      from public.hallazgo_seguimientos seg join public.servicios visit on visit.id=seg.servicio_id
      where seg.hallazgo_id=h.id),
    'responsableNombre',h.responsable_nombre,'responsableCorreo',h.responsable_correo,
    'servicioCierreId',h.servicio_cierre_id,'fechaCierre',h.fecha_cierre,
    'evidenciasCierreStoragePaths',coalesce(h.evidencias_cierre_storage_paths,'[]'::jsonb),
    'observacionCierre',h.observacion_cierre,'version',h.version
  ) as record
  from public.hallazgos h join public.servicios current_service on current_service.id=$1
  join public.servicios opening_service on opening_service.id=h.servicio_apertura_id
  where h.sede_id=current_service.sede_id and (
    h.servicio_apertura_id=current_service.id or h.servicio_cierre_id=current_service.id
    or (h.estado in ('ABIERTO','EN_PROCESO') and opening_service.inicio_programado<current_service.inicio_programado)
  ) order by h.area_id,case h.estado when 'ABIERTO' then 0 when 'EN_PROCESO' then 1 else 2 end,h.fecha_apertura,h.id`, [serviceId])
  return rows.map(row => ({ ...row.record, areaId: row.areaId }))
}

async function frozenAreas(client: PoolClient, serviceId: string): Promise<TechnicianArea[]> {
  const areas = (await client.query<Omit<TechnicianArea, 'criterios' | 'dispositivos' | 'hallazgos'>>(`select id,area_id as "areaId",nombre_snapshot as nombre,
    es_externa_snapshot as "esExterna",posicion_inicial as "posicionInicial",posicion_recorrido as "posicionRecorrido",
    sin_acceso as "sinAcceso",sin_acceso_descripcion as "sinAccesoDescripcion",sin_acceso_foto_storage_path as "sinAccesoFotoStoragePath",
    sin_acceso_evidencias_storage_paths as "sinAccesoEvidenciasStoragePaths",version::integer
    from public.servicio_areas where servicio_id=$1 order by posicion_recorrido,id`, [serviceId])).rows
  const criteria = (await client.query<(TechnicianCriterion & { servicioAreaId: string })>(`select id,servicio_area_id as "servicioAreaId",criterio_id as "criterioId",
    criterio_nombre_snapshot as nombre,solo_area_externa_snapshot as "soloAreaExterna",evaluacion,observacion,
    evidencias_storage_paths as "evidenciasStoragePaths",version::integer from public.evaluaciones_mip_area
    where servicio_id=$1 order by servicio_area_id,lower(criterio_nombre_snapshot),id`, [serviceId])).rows
  const devices = (await client.query<(TechnicianDevice & { servicioAreaId: string })>(`select sd.id,sd.servicio_area_id as "servicioAreaId",sd.dispositivo_id as "dispositivoId",
    sd.numero_snapshot as numero,sd.ubicacion_snapshot as ubicacion,sd.tipo_dispositivo_codigo_snapshot as "tipoCodigo",
    sd.tipo_dispositivo_nombre_snapshot as "tipoNombre",sd.clasificacion_snapshot as clasificacion,
    sd.plagas_snapshot_json as plagas,sd.estado_anterior_snapshot as "estadoAnterior",
    sd.creado_durante_servicio as "creadoDuranteServicio",r.id is not null as revisado,
    case when r.id is null then null else jsonb_build_object(
      'id',r.id,'estadoObservado',r.estado_observado,'capturas',r.capturas_json,
      'consumo',case when r.consumo is null then '' when jsonb_typeof(r.consumo)='string' then r.consumo #>> '{}' else r.consumo::text end,
      'productoQuimico',coalesce(r.producto_quimico,''),'antidoto',coalesce(r.antidoto,''),
      'observaciones',coalesce(r.observaciones,''),'fotoStoragePath',r.foto_storage_path,'version',r.version::integer
    ) end as revision
    from public.servicio_dispositivos sd
    left join public.revisiones_dispositivos r on r.servicio_dispositivo_id=sd.id
    where sd.servicio_id=$1 order by sd.servicio_area_id,lower(sd.numero_snapshot),sd.id`, [serviceId])).rows
  const findingRows = await findings(client, serviceId)
  return areas.map(area => ({ ...area,
    criterios: criteria.filter(item => item.servicioAreaId === area.id).map(item => ({ id:item.id,criterioId:item.criterioId,nombre:item.nombre,soloAreaExterna:item.soloAreaExterna,evaluacion:item.evaluacion,observacion:item.observacion,evidenciasStoragePaths:item.evidenciasStoragePaths,version:item.version })),
    dispositivos: devices.filter(item => item.servicioAreaId === area.id).map(item => ({ id:item.id,dispositivoId:item.dispositivoId,numero:item.numero,ubicacion:item.ubicacion,tipoCodigo:item.tipoCodigo,tipoNombre:item.tipoNombre,clasificacion:item.clasificacion,plagas:item.plagas,estadoAnterior:item.estadoAnterior,creadoDuranteServicio:item.creadoDuranteServicio,revisado:item.revisado,revision:item.revision })),
    hallazgos: findingRows.filter(item => item.areaId === area.areaId).map(({ areaId: _areaId, ...item }) => item) }))
}

async function liveAreas(client: PoolClient, serviceId: string): Promise<TechnicianArea[]> {
  const areas = (await client.query<Omit<TechnicianArea, 'criterios' | 'dispositivos' | 'hallazgos'>>(`select a.id,a.id as "areaId",a.nombre,a.es_externa as "esExterna",
    (row_number() over(order by lower(btrim(a.nombre)),a.id)-1)::integer as "posicionInicial",
    (row_number() over(order by lower(btrim(a.nombre)),a.id)-1)::integer as "posicionRecorrido",false as "sinAcceso",
    null::text as "sinAccesoDescripcion",null::text as "sinAccesoFotoStoragePath",'[]'::jsonb as "sinAccesoEvidenciasStoragePaths",1::integer as version
    from public.servicios s join public.areas a on a.sede_id=s.sede_id and a.activo where s.id=$1 order by lower(btrim(a.nombre)),a.id`, [serviceId])).rows
  const criteria = (await client.query<(TechnicianCriterion & { areaId: string })>(`select c.id,c.id as "criterioId",a.id as "areaId",c.nombre,
    c.solo_area_externa as "soloAreaExterna",null::text as evaluacion,null::text as observacion,'[]'::jsonb as "evidenciasStoragePaths",1::integer as version
    from public.servicios s join public.areas a on a.sede_id=s.sede_id and a.activo
    cross join public.criterios_mip c where s.id=$1 and c.activo and (not c.solo_area_externa or a.es_externa)
    order by a.id,lower(btrim(c.nombre)),c.id`, [serviceId])).rows
  const devices = (await client.query<(TechnicianDevice & { areaId: string })>(`select d.id,d.id as "dispositivoId",d.area_id as "areaId",d.numero,
    d.ubicacion,d.tipo_dispositivo_codigo as "tipoCodigo",coalesce(t.nombre,d.tipo_dispositivo_codigo) as "tipoNombre",
    t.clasificacion,coalesce(pests.items,'[]'::jsonb) as plagas,d.estado_actual as "estadoAnterior",false as "creadoDuranteServicio",false as revisado,null::jsonb as revision
    from public.servicios s join public.dispositivos d on d.sede_id=s.sede_id and d.activo
    join public.areas a on a.id=d.area_id and a.activo left join public.trampas t on t.clave=d.tipo_dispositivo_codigo
    left join lateral (select jsonb_agg(jsonb_build_object('codigo',c.clave,'nombre',c.nombre)
      order by lower(btrim(c.nombre)),c.clave) as items from public.configuracion c
      where c.categoria='PLAGA' and c.activo and c.clasificacion_mip=t.clasificacion) pests on true
    where s.id=$1 order by d.area_id,lower(btrim(d.numero)),d.id`, [serviceId])).rows
  const findingRows = await findings(client, serviceId)
  return areas.map(area => ({ ...area,
    criterios: criteria.filter(item => item.areaId === area.areaId).map(item => ({ id:item.id,criterioId:item.criterioId,nombre:item.nombre,soloAreaExterna:item.soloAreaExterna,evaluacion:item.evaluacion,observacion:item.observacion,evidenciasStoragePaths:item.evidenciasStoragePaths,version:item.version })),
    dispositivos: devices.filter(item => item.areaId === area.areaId).map(item => ({ id:item.id,dispositivoId:item.dispositivoId,numero:item.numero,ubicacion:item.ubicacion,tipoCodigo:item.tipoCodigo,tipoNombre:item.tipoNombre,clasificacion:item.clasificacion,plagas:item.plagas,estadoAnterior:item.estadoAnterior,creadoDuranteServicio:item.creadoDuranteServicio,revisado:item.revisado,revision:item.revision })),
    hallazgos: findingRows.filter(item => item.areaId === area.areaId).map(({ areaId: _areaId, ...item }) => item) }))
}

async function deviceTypes(client: PoolClient, serviceId: string, frozen: boolean): Promise<TechnicianDeviceTypeSnapshot[]> {
  if (frozen) {
    return (await client.query<TechnicianDeviceTypeSnapshot>(`select tipo_dispositivo_codigo_snapshot as codigo,
      tipo_dispositivo_nombre_snapshot as nombre,clasificacion_snapshot as clasificacion,plagas_snapshot_json as plagas
      from public.servicio_tipos_dispositivo where servicio_id=$1
      order by lower(btrim(tipo_dispositivo_nombre_snapshot)),tipo_dispositivo_codigo_snapshot`, [serviceId])).rows
  }
  return (await client.query<TechnicianDeviceTypeSnapshot>(`select t.clave as codigo,t.nombre,t.clasificacion,
    coalesce((select jsonb_agg(jsonb_build_object('codigo',c.clave,'nombre',c.nombre)
      order by lower(btrim(c.nombre)),c.clave) from public.configuracion c
      where c.categoria='PLAGA' and c.activo and c.clasificacion_mip=t.clasificacion),'[]'::jsonb) as plagas
    from public.trampas t where t.activo order by lower(btrim(t.nombre)),t.clave`)).rows
}

export async function getTechnicianPackage(client: PoolClient, userId: string, serviceId: string): Promise<TechnicianServicePackage> {
  const header = await serviceHeader(client, userId, serviceId)
  const frozen = header.service.estado === 'EN_PROCESO' || header.service.estado === 'FINALIZADO'
  const signatures = (await client.query<{ technicianStoragePath: string | null; technicianUserId: string | null; clientStoragePath: string | null; clientName: string | null; clientSignedAt: string | null }>(`select
    firma_tecnico_storage_path as "technicianStoragePath",firma_tecnico_usuario_id as "technicianUserId",
    firma_cliente_storage_path as "clientStoragePath",firma_cliente_nombre as "clientName",firma_cliente_at as "clientSignedAt"
    from public.servicios where id=$1`, [serviceId])).rows[0]!
  return { ...header, frozen, products: await products(client, serviceId, frozen), deviceTypes: await deviceTypes(client, serviceId, frozen),
    areas: frozen ? await frozenAreas(client, serviceId) : await liveAreas(client, serviceId), signatures }
}

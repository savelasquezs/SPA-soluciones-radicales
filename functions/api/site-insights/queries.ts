import type { PoolClient } from 'pg'
import { ApiError } from '../auth'
import type { EvidenceKind, InsightPage, InsightQuery, MonitoringPoint, MonitoringReview, SiteCollection, SiteFinding } from '../../../src/types/siteInsights'

export const INSIGHTS_PAGE_SIZE = 20

async function assertSite(client: PoolClient, siteId: string): Promise<void> {
  if (!(await client.query("select 1 from public.sedes where id=$1 and tipo_sede='NEGOCIO'", [siteId])).rowCount) {
    throw new ApiError(404, 'La Sede no está disponible.', 'SITE_NOT_FOUND')
  }
}
const areaOptions = `(select coalesce(jsonb_agg(jsonb_build_object('value',a.id,'label',a.nombre) order by lower(a.nombre),a.id),'[]'::jsonb)
  from public.areas a where a.sede_id=$1)`

export async function listMonitoringPoints(client: PoolClient, siteId: string, query: InsightQuery): Promise<SiteCollection<MonitoringPoint>> {
  await assertSite(client, siteId)
  const { rows } = await client.query<{ items: MonitoringPoint[]; total: number; areas: SiteCollection<MonitoringPoint>['areas']; traps: SiteCollection<MonitoringPoint>['traps'] }>(`
    with filtered as (
      select d.*,a.nombre as area_name,a.activo as area_active,t.nombre as trap_name,t.clasificacion
      from public.dispositivos d join public.areas a on a.id=d.area_id and a.sede_id=d.sede_id
      left join public.trampas t on t.clave=d.tipo_dispositivo_codigo
      where d.sede_id=$1
        and ($2::text='' or position(lower($2) in lower(concat_ws(' ',d.numero,d.ubicacion,a.nombre,t.nombre)))>0)
        and ($3::uuid is null or d.area_id=$3)
        and ($4::text='' or d.estado_actual=$4)
        and ($5::boolean is null or d.activo=$5)
        and ($6::text='' or d.tipo_dispositivo_codigo=$6)
    ), paged as (
      select * from filtered order by activo desc,length(numero),lower(numero),id limit $7 offset $8
    )
    select (select count(*)::integer from filtered) as total,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id',d.id,'number',d.numero,'areaId',d.area_id,'areaName',d.area_name,'areaActive',d.area_active,
        'location',d.ubicacion,'trapCode',d.tipo_dispositivo_codigo,'trapName',coalesce(d.trap_name,d.tipo_dispositivo_codigo),
        'classification',d.clasificacion,'condition',d.estado_actual,'enabled',d.activo,'createdAt',d.created_at,
        'lastReview',last_review.record,'inProgress',exists(
          select 1 from public.revisiones_dispositivos r join public.servicios s on s.id=r.servicio_id
          where r.dispositivo_id=d.id and s.sede_id=$1 and s.estado='EN_PROCESO'
        )) order by d.activo desc,length(d.numero),lower(d.numero),d.id)
        from paged d left join lateral (
          select jsonb_build_object('id',s.id,'number',s.solicitud,'state',s.estado,
            'date',coalesce(s.fin_real,s.inicio_real,s.inicio_programado),'technician',u.nombre_completo) as record
          from public.revisiones_dispositivos r join public.servicios s on s.id=r.servicio_id
          join public.usuarios u on u.id=s.tecnico_responsable_id
          where r.dispositivo_id=d.id and s.sede_id=$1 and s.estado='FINALIZADO'
          order by s.fin_real desc nulls last,s.inicio_real desc nulls last,s.inicio_programado desc,r.id desc limit 1
        ) last_review on true),'[]'::jsonb) as items,
      ${areaOptions} as areas,
      (select coalesce(jsonb_agg(jsonb_build_object('value',t.clave,'label',t.nombre) order by lower(t.nombre),t.clave),'[]'::jsonb)
       from public.trampas t where exists(select 1 from public.dispositivos d where d.sede_id=$1 and d.tipo_dispositivo_codigo=t.clave)) as traps`,
  [siteId,query.search,query.area || null,query.state,query.active === '' ? null : query.active === 'true',query.trap,INSIGHTS_PAGE_SIZE,(query.page-1)*INSIGHTS_PAGE_SIZE])
  return { ...rows[0]!, page: query.page, pageSize: INSIGHTS_PAGE_SIZE }
}

export async function listMonitoringReviews(client: PoolClient, siteId: string, pointId: string, query: InsightQuery): Promise<InsightPage<MonitoringReview>> {
  await assertSite(client, siteId)
  if (!(await client.query('select 1 from public.dispositivos where id=$1 and sede_id=$2', [pointId,siteId])).rowCount) {
    throw new ApiError(404, 'El puesto de monitoreo no está disponible.', 'POINT_NOT_FOUND')
  }
  const { rows } = await client.query<{ items: MonitoringReview[]; total: number }>(`
    with filtered as (
      select r.id,coalesce(s.fin_real,s.inicio_real,s.inicio_programado) as service_date
      from public.revisiones_dispositivos r join public.servicios s on s.id=r.servicio_id
      where r.dispositivo_id=$2 and s.sede_id=$1 and s.estado in ('EN_PROCESO','FINALIZADO')
        and ($3::text='' or s.estado=$3)
        and ($4::date is null or coalesce(s.fin_real,s.inicio_real,s.inicio_programado)>=($4::date::timestamp at time zone 'America/Bogota'))
        and ($5::date is null or coalesce(s.fin_real,s.inicio_real,s.inicio_programado)<(($5::date+1)::timestamp at time zone 'America/Bogota'))
    ), paged as (select * from filtered order by service_date desc,id desc limit $6 offset $7)
    select (select count(*)::integer from filtered) as total,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id',r.id,'service',jsonb_build_object('id',s.id,'number',s.solicitud,'state',s.estado,'date',p.service_date,'technician',u.nombre_completo),
        'number',r.numero_snapshot,'areaName',coalesce(sa.nombre_snapshot,a.nombre),'location',r.ubicacion_snapshot,
        'trapName',coalesce(sd.tipo_dispositivo_nombre_snapshot,r.tipo_dispositivo_codigo),
        'previousCondition',sd.estado_anterior_snapshot,'condition',r.estado_observado,'captures',r.capturas_json,
        'consumption',case when r.consumo is null then null when jsonb_typeof(r.consumo)='string' then r.consumo #>> '{}' else r.consumo::text end,
        'chemical',r.producto_quimico,'antidote',r.antidoto,'notes',r.observaciones,
        'photos',case when nullif(btrim(r.foto_storage_path),'') is null then '[]'::jsonb else
          jsonb_build_array(jsonb_build_object('kind','REVIEW','recordId',r.id,'index',0,'label','Puesto '||r.numero_snapshot||' · '||s.solicitud,'date',p.service_date)) end,
        'serviceProducts',(select coalesce(jsonb_agg(jsonb_build_object(
          'name',coalesce(pa.producto_nombre_snapshot,pr.nombre),'ingredient',pa.principio_activo_snapshot,
          'method',pa.metodo_aplicacion_nombre_snapshot,'dose',case when jsonb_typeof(pa.dosis)='string' then pa.dosis #>> '{}' else pa.dosis::text end,
          'batch',pa.lote,'expiry',pa.fecha_vencimiento) order by coalesce(pa.producto_nombre_snapshot,pr.nombre),pa.id),'[]'::jsonb)
          from public.productos_aplicados pa join public.productos pr on pr.id=pa.producto_id where pa.servicio_id=s.id and pa.aplicado)
      ) order by p.service_date desc,r.id desc)
      from paged p join public.revisiones_dispositivos r on r.id=p.id
      join public.servicios s on s.id=r.servicio_id join public.usuarios u on u.id=s.tecnico_responsable_id
      join public.servicio_dispositivos sd on sd.id=r.servicio_dispositivo_id
      join public.servicio_areas sa on sa.id=sd.servicio_area_id join public.areas a on a.id=r.area_id),'[]'::jsonb) as items`,
  [siteId,pointId,query.state,query.from || null,query.to || null,INSIGHTS_PAGE_SIZE,(query.page-1)*INSIGHTS_PAGE_SIZE])
  return { ...rows[0]!, page: query.page, pageSize: INSIGHTS_PAGE_SIZE }
}

export async function listSiteFindings(client: PoolClient, siteId: string, query: InsightQuery): Promise<SiteCollection<SiteFinding>> {
  await assertSite(client, siteId)
  const { rows } = await client.query<{ items: SiteFinding[]; total: number; areas: SiteCollection<SiteFinding>['areas'] }>(`
    with filtered as (
      select h.id,h.estado,h.fecha_apertura
      from public.hallazgos h join public.servicios s on s.id=h.servicio_apertura_id
      where h.sede_id=$1 and s.sede_id=$1 and s.estado in ('EN_PROCESO','FINALIZADO')
        and ($2::text='' or position(lower($2) in lower(concat_ws(' ',h.descripcion,h.recomendacion_accion,h.responsable_nombre)))>0)
        and ($3::uuid is null or h.area_id=$3)
        and ($4::text='' or ($4='PENDING' and h.estado in ('ABIERTO','EN_PROCESO')) or h.estado=$4)
        and ($5::date is null or h.fecha_apertura>=($5::date::timestamp at time zone 'America/Bogota'))
        and ($6::date is null or h.fecha_apertura<(($6::date+1)::timestamp at time zone 'America/Bogota'))
    ), paged as (
      select * from filtered order by case estado when 'ABIERTO' then 0 when 'EN_PROCESO' then 1 else 2 end,fecha_apertura desc,id desc limit $7 offset $8
    )
    select (select count(*)::integer from filtered) as total, ${areaOptions} as areas,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id',h.id,'areaId',h.area_id,'areaName',coalesce(sa.nombre_snapshot,a.nombre),'state',h.estado,
        'description',h.descripcion,'recommendation',h.recomendacion_accion,
        'responsibleName',h.responsable_nombre,'responsibleEmail',h.responsable_correo,
        'openedAt',h.fecha_apertura,'closedAt',h.fecha_cierre,'closingNotes',h.observacion_cierre,
        'followups',(select coalesce(jsonb_agg(jsonb_build_object(
          'result',seg.resultado,'reviewedAt',seg.registrado_at,
          'service',jsonb_build_object('id',visit.id,'number',visit.solicitud,'state',visit.estado,
            'date',seg.registrado_at,'technician',author.nombre_completo)) order by seg.registrado_at desc),'[]'::jsonb)
          from public.hallazgo_seguimientos seg
          join public.servicios visit on visit.id=seg.servicio_id and visit.sede_id=$1
          join public.usuarios author on author.id=seg.tecnico_id
          where seg.hallazgo_id=h.id),
        'openingService',jsonb_build_object('id',s.id,'number',s.solicitud,'state',s.estado,'date',h.fecha_apertura,'technician',u.nombre_completo),
        'closingService',case when cs.id is null then null else jsonb_build_object('id',cs.id,'number',cs.solicitud,'state',cs.estado,'date',h.fecha_cierre,'technician',cu.nombre_completo) end,
        'photos',(
          select coalesce(jsonb_agg(photo order by phase,idx),'[]'::jsonb) from (
            select 0 as phase,e.ordinality as idx,jsonb_build_object('kind','OPENING','recordId',h.id,'index',e.ordinality-1,'label','Apertura · '||s.solicitud,'date',h.fecha_apertura) as photo
            from jsonb_array_elements_text(coalesce(h.evidencias_apertura_storage_paths,'[]'::jsonb)) with ordinality e(path,ordinality) where nullif(btrim(e.path),'') is not null
            union all
            select 1,e.ordinality,jsonb_build_object('kind','CLOSURE','recordId',h.id,'index',e.ordinality-1,'label','Cierre · '||coalesce(cs.solicitud,''),'date',h.fecha_cierre)
            from jsonb_array_elements_text(coalesce(h.evidencias_cierre_storage_paths,'[]'::jsonb)) with ordinality e(path,ordinality) where nullif(btrim(e.path),'') is not null
          ) photos
        )
      ) order by case h.estado when 'ABIERTO' then 0 when 'EN_PROCESO' then 1 else 2 end,h.fecha_apertura desc,h.id desc)
      from paged p join public.hallazgos h on h.id=p.id join public.areas a on a.id=h.area_id
      join public.servicios s on s.id=h.servicio_apertura_id join public.usuarios u on u.id=s.tecnico_responsable_id
      left join public.servicio_areas sa on sa.servicio_id=s.id and sa.area_id=h.area_id
      left join public.servicios cs on cs.id=h.servicio_cierre_id and cs.sede_id=$1
      left join public.usuarios cu on cu.id=cs.tecnico_responsable_id),'[]'::jsonb) as items`,
  [siteId,query.search,query.area || null,query.state,query.from || null,query.to || null,INSIGHTS_PAGE_SIZE,(query.page-1)*INSIGHTS_PAGE_SIZE])
  return { ...rows[0]!, traps: [], page: query.page, pageSize: INSIGHTS_PAGE_SIZE }
}

export interface EvidenceSource { path: string; serviceId: string; ownerId: string; retentionAt: string | null }
/** Resolve a persisted reference, never a caller-supplied storage path. */
export async function findSiteEvidence(client: PoolClient, siteId: string, kind: EvidenceKind, recordId: string, index: number): Promise<EvidenceSource> {
  let source: EvidenceSource | undefined
  if (kind === 'REVIEW') {
    source = (await client.query<EvidenceSource>(`select r.foto_storage_path as path,s.id as "serviceId",r.servicio_dispositivo_id as "ownerId",
      case when s.estado='FINALIZADO' then (((s.fin_real at time zone 'America/Bogota')+interval '3 months') at time zone 'America/Bogota')::text end as "retentionAt"
      from public.revisiones_dispositivos r join public.servicios s on s.id=r.servicio_id
      join public.dispositivos d on d.id=r.dispositivo_id
      where r.id=$2 and s.sede_id=$1 and d.sede_id=$1 and $3::integer=0`, [siteId,recordId,index])).rows[0]
  } else {
    source = (await client.query<EvidenceSource>(`select
      case when $4='OPENING' then h.evidencias_apertura_storage_paths ->> $3::integer else h.evidencias_cierre_storage_paths ->> $3::integer end as path,
      case when $4='OPENING' then h.servicio_apertura_id else h.servicio_cierre_id end as "serviceId",h.id as "ownerId",
      (case
        when h.estado='CERRADO' and h.fecha_cierre is not null and ($4='CLOSURE' or h.fecha_cierre < (((h.fecha_apertura at time zone 'America/Bogota')+interval '1 year') at time zone 'America/Bogota'))
          then (((h.fecha_cierre at time zone 'America/Bogota')+interval '3 months') at time zone 'America/Bogota')
        else (((h.fecha_apertura at time zone 'America/Bogota')+interval '1 year') at time zone 'America/Bogota')
      end)::text as "retentionAt"
      from public.hallazgos h
      join public.servicios s on s.id=case when $4='OPENING' then h.servicio_apertura_id else h.servicio_cierre_id end and s.sede_id=$1
      where h.sede_id=$1 and h.id=$2`, [siteId,recordId,index,kind])).rows[0]
  }
  if (!source?.path?.trim()) throw new ApiError(404, 'La evidencia no está registrada.', 'EVIDENCE_NOT_FOUND')
  return source
}

import type { PoolClient } from 'pg'
import { ApiError } from '../auth'

export interface ServiceCriterion { nombre: string; evaluacion: 'C'|'CP'|'NC'|'NA'|null; observacion: string|null; fotos: string[] }
export interface ServicePoint { numero: string; ubicacion: string; tipo: string; estado: string|null; capturas: Array<{plagaNombreSnapshot:string; cantidad:number}>; observaciones:string|null; foto:string|null }
export interface ServiceFindingFollowup { solicitud:string;fecha:string;resultado:'SIN_CAMBIOS'|'EN_PROCESO'|'CERRADO';observacion:string|null;fotos:string[] }
export interface ServiceFinding { descripcion:string; recomendacion:string; estado:'ABIERTO'|'EN_PROCESO'|'CERRADO'; responsable:string; fotos:string[]; fechaApertura:string; solicitudApertura:string; anterior:boolean; visitasDesdeApertura:number; seguimientos:ServiceFindingFollowup[] }
export interface ServiceArea { id:string; nombre:string; sinAcceso:boolean; motivo:string|null; fotos:string[]; criterios:ServiceCriterion[]; puntos:ServicePoint[]; hallazgos:ServiceFinding[] }
export interface ServiceResultsData {
  id:string; solicitud:string; cliente:string; nit:string; sede:string; direccion:string; tecnico:string
  firmanteCliente:string; firmaTecnico:string; firmaCliente:string
  inicioProgramado:string; inicioReal:string; finReal:string
  productos:Array<{nombre:string;principio:string;registro:string;lote:string;dosis:string;metodos:string;fichaTecnicaDisponible:boolean}>
  areas:ServiceArea[]
  historico:Array<{solicitud:string;fecha:string;cumplimiento:number|null;capturas:number}>
}
const arr=(v:unknown):string[]=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&x.length>0):[]

export async function loadServiceResultsData(client:PoolClient,serviceId:string):Promise<ServiceResultsData>{
  const sv=(await client.query<{
    id:string;solicitud:string;estado:string;tipo:string;sedeTipo:string;sedeId:string;cliente:string;nit:string;sede:string;direccion:string;tecnico:string
    firmanteCliente:string|null;firmaTecnico:string|null;firmaCliente:string|null;inicioProgramado:Date;inicioReal:Date|null;finReal:Date|null
  }>(`select s.id,s.solicitud,s.estado,s.tipo_servicio as tipo,se.tipo_sede as "sedeTipo",se.id as "sedeId",
        n.nombre as cliente,n.nit,se.nombre as sede,se.direccion,u.nombre_completo as tecnico,
        s.firma_cliente_nombre as "firmanteCliente",s.firma_tecnico_storage_path as "firmaTecnico",
        s.firma_cliente_storage_path as "firmaCliente",s.inicio_programado as "inicioProgramado",
        s.inicio_real as "inicioReal",s.fin_real as "finReal"
        from public.servicios s join public.sedes se on se.id=s.sede_id
        join public.negocios n on n.id=se.negocio_id join public.usuarios u on u.id=s.tecnico_responsable_id
        where s.id=$1`, [serviceId])).rows[0]
  if(!sv)throw new ApiError(404,'Servicio no encontrado','SERVICE_NOT_FOUND')
  if(sv.estado!=='FINALIZADO'||sv.tipo!=='PRINCIPAL'||sv.sedeTipo!=='NEGOCIO'||!sv.inicioReal||!sv.finReal||!sv.firmaTecnico||!sv.firmaCliente)
    throw new ApiError(422,'El informe requiere un servicio Principal de negocio finalizado y firmado.','REPORT_NOT_READY')
  const areas=(await client.query<{id:string;nombre:string;sinAcceso:boolean;motivo:string|null;fotos:unknown}>(`
    select id,nombre_snapshot as nombre,sin_acceso as "sinAcceso",sin_acceso_descripcion as motivo,
      case when jsonb_array_length(coalesce(to_jsonb(sa)->'sin_acceso_evidencias_storage_paths','[]'::jsonb))>0 then to_jsonb(sa)->'sin_acceso_evidencias_storage_paths'
        when sin_acceso_foto_storage_path is not null then jsonb_build_array(sin_acceso_foto_storage_path)
        else '[]'::jsonb end as fotos
    from public.servicio_areas sa where servicio_id=$1 order by posicion_recorrido,id`,[serviceId])).rows
    .map((a):ServiceArea=>({id:a.id,nombre:a.nombre,sinAcceso:a.sinAcceso,motivo:a.motivo,fotos:arr(a.fotos),criterios:[],puntos:[],hallazgos:[]}))
  const byId=new Map(areas.map(a=>[a.id,a]))
  const criteria=(await client.query<{areaId:string;nombre:string;evaluacion:ServiceCriterion['evaluacion'];observacion:string|null;fotos:unknown}>(`
    select servicio_area_id as "areaId",criterio_nombre_snapshot as nombre,evaluacion,observacion,
      coalesce(evidencias_storage_paths,'[]'::jsonb) as fotos
    from public.evaluaciones_mip_area where servicio_id=$1
    order by servicio_area_id,lower(criterio_nombre_snapshot),id`,[serviceId])).rows
  for(const c of criteria)byId.get(c.areaId)?.criterios.push({nombre:c.nombre,evaluacion:c.evaluacion,observacion:c.observacion,fotos:arr(c.fotos)})
  const points=(await client.query<{areaId:string;numero:string;ubicacion:string;tipo:string;estado:string|null;capturas:ServicePoint['capturas']|null;observaciones:string|null;foto:string|null}>(`
    select sd.servicio_area_id as "areaId",sd.numero_snapshot as numero,sd.ubicacion_snapshot as ubicacion,
      sd.tipo_dispositivo_nombre_snapshot as tipo,r.estado_observado as estado,
      coalesce(r.capturas_json,'[]'::jsonb) as capturas,r.observaciones,r.foto_storage_path as foto
    from public.servicio_dispositivos sd left join public.revisiones_dispositivos r on r.servicio_dispositivo_id=sd.id
    where sd.servicio_id=$1 order by sd.servicio_area_id,lower(sd.numero_snapshot),sd.id`,[serviceId])).rows
  for(const p of points)byId.get(p.areaId)?.puntos.push({numero:p.numero,ubicacion:p.ubicacion,tipo:p.tipo,estado:p.estado,
    capturas:(Array.isArray(p.capturas)?p.capturas:[]).map(c=>({plagaNombreSnapshot:String(c.plagaNombreSnapshot||'Plaga'),cantidad:Number(c.cantidad)||0})),
    observaciones:p.observaciones,foto:p.foto})
  // A report describes the findings that were active (or closed) during THIS visit,
  // regardless of their current status. Follow-ups and evidence are limited to its cutoff.
  const findings=(await client.query<{
    areaId:string;descripcion:string;recomendacion:string;estado:ServiceFinding['estado'];responsable:string
    fotos:unknown;fechaApertura:Date;solicitudApertura:string;anterior:boolean
    visitasDesdeApertura:number;seguimientos:unknown;fechaCierre:Date|null
    observacionCierre:string|null;fotosCierre:unknown;servicioCierreId:string|null
  }>(`
    select sa.id as "areaId",h.descripcion,h.recomendacion_accion as recomendacion,
      case when h.servicio_cierre_id=$1 then 'CERRADO'
        else coalesce(last_review.estado,'ABIERTO') end as estado,
      h.responsable_nombre as responsable,
      coalesce(h.evidencias_apertura_storage_paths,'[]'::jsonb) as fotos,
      h.fecha_apertura as "fechaApertura",opening.solicitud as "solicitudApertura",
      (h.servicio_apertura_id<>$1) as anterior,
      (select count(*)::int from public.servicios v where v.sede_id=h.sede_id
        and v.estado='FINALIZADO' and v.tipo_servicio='PRINCIPAL'
        and v.fin_real>=opening.fin_real and v.fin_real<=$2::timestamptz) as "visitasDesdeApertura",
      coalesce(history.items,'[]'::jsonb) as seguimientos,
      h.fecha_cierre as "fechaCierre",h.observacion_cierre as "observacionCierre",
      coalesce(h.evidencias_cierre_storage_paths,'[]'::jsonb) as "fotosCierre",
      h.servicio_cierre_id as "servicioCierreId"
    from public.hallazgos h
    join public.servicios opening on opening.id=h.servicio_apertura_id
    join public.servicio_areas sa on sa.area_id=h.area_id and sa.servicio_id=$1
    left join lateral (
      select case when seg.resultado='SIN_CAMBIOS' then seg.estado_anterior
                  else seg.resultado end as estado
      from public.hallazgo_seguimientos seg
      join public.servicios visit on visit.id=seg.servicio_id
      where seg.hallazgo_id=h.id and visit.estado='FINALIZADO'
        and visit.fin_real<=$2::timestamptz
      order by visit.fin_real desc,seg.registrado_at desc,seg.id desc limit 1
    ) last_review on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'solicitud',visit.solicitud,'fecha',seg.registrado_at,
        'resultado',seg.resultado,'observacion',seg.observacion,
        'fotos',coalesce(seg.evidencias_storage_paths,'[]'::jsonb)
      ) order by visit.fin_real,seg.registrado_at,seg.id) as items
      from public.hallazgo_seguimientos seg
      join public.servicios visit on visit.id=seg.servicio_id
      where seg.hallazgo_id=h.id and visit.estado='FINALIZADO'
        and visit.fin_real<=$2::timestamptz
    ) history on true
    where h.sede_id=$3 and opening.estado='FINALIZADO'
      and opening.fin_real<=$2::timestamptz
      and (h.servicio_cierre_id=$1 or h.fecha_cierre is null or h.fecha_cierre>$2::timestamptz)
    order by case when (case when h.servicio_cierre_id=$1 then 'CERRADO'
                          else coalesce(last_review.estado,'ABIERTO') end)='CERRADO' then 1 else 0 end,
      sa.posicion_recorrido,h.fecha_apertura,h.id`,[serviceId,sv.finReal,sv.sedeId])).rows
  for(const h of findings){
    const followups:ServiceFindingFollowup[]=Array.isArray(h.seguimientos)
      ?h.seguimientos.map((item:Record<string,unknown>)=>({
        solicitud:String(item.solicitud||''),fecha:String(item.fecha||''),
        resultado:item.resultado==='CERRADO'?'CERRADO':item.resultado==='EN_PROCESO'?'EN_PROCESO':'SIN_CAMBIOS',
        observacion:typeof item.observacion==='string'?item.observacion:null,fotos:arr(item.fotos),
      })):[]
    // Legacy closures without a per-visit follow-up still retain their original evidence.
    if(h.servicioCierreId===serviceId && !followups.some(item=>item.resultado==='CERRADO')){
      followups.push({solicitud:sv.solicitud,fecha:h.fechaCierre?.toISOString()??sv.finReal.toISOString(),
        resultado:'CERRADO',observacion:h.observacionCierre,fotos:arr(h.fotosCierre)})
    }
    byId.get(h.areaId)?.hallazgos.push({
      descripcion:h.descripcion,recomendacion:h.recomendacion,estado:h.estado,responsable:h.responsable,
      fotos:arr(h.fotos),fechaApertura:h.fechaApertura.toISOString(),solicitudApertura:h.solicitudApertura,
      anterior:h.anterior,visitasDesdeApertura:h.visitasDesdeApertura,seguimientos:followups,
    })
  }
  const productos=(await client.query<ServiceResultsData['productos'][number]>(`
    select coalesce(pa.producto_nombre_snapshot,p.nombre) as nombre,
      coalesce(pa.principio_activo_snapshot,p.principio_activo_composicion,'') as principio,
      coalesce(pa.registro_sanitario_snapshot,'') as registro,coalesce(pa.lote,'') as lote,
      coalesce(pa.dosis_referencia_snapshot,'') as dosis,coalesce(pa.metodo_aplicacion_nombre_snapshot,'') as metodos,
      (p.ficha_tecnica_storage_path like 'products/technical-sheets/%') as "fichaTecnicaDisponible"
    from public.productos_aplicados pa join public.productos p on p.id=pa.producto_id
    where pa.servicio_id=$1 and pa.aplicado
    order by coalesce(pa.producto_nombre_snapshot,p.nombre),pa.id`,[serviceId])).rows
  const historico=(await client.query<{solicitud:string;fecha:Date;cumplimiento:number|null;capturas:string}>(`
    with visitas as (
      select id,solicitud,fin_real from public.servicios
      where sede_id=$1 and estado='FINALIZADO' and tipo_servicio='PRINCIPAL' and fin_real <= (select fin_real from public.servicios where id=$2)
      order by fin_real desc,id desc limit 6
    ), area_scores as (
      select v.id,sa.id as area_id,
        case when sa.sin_acceso then null
          else 100*sum(case e.evaluacion when 'C' then 1 when 'CP' then 0.5 else 0 end)
               /nullif(count(*) filter(where e.evaluacion in ('C','CP','NC')),0) end as porcentaje
      from visitas v join public.servicio_areas sa on sa.servicio_id=v.id
      left join public.evaluaciones_mip_area e on e.servicio_area_id=sa.id
      group by v.id,sa.id,sa.sin_acceso
    )
    select v.solicitud,v.fin_real as fecha,round(avg(a.porcentaje)::numeric,1)::float8 as cumplimiento,
       (select coalesce(sum((c.item->>'cantidad')::integer),0)::text from public.revisiones_dispositivos r
         cross join lateral jsonb_array_elements(coalesce(r.capturas_json,'[]'::jsonb)) c(item)
         where r.servicio_id=v.id) as capturas
    from visitas v left join area_scores a on a.id=v.id
    group by v.id,v.solicitud,v.fin_real order by v.fin_real,v.id`,[sv.sedeId,sv.id])).rows
  return {id:sv.id,solicitud:sv.solicitud,cliente:sv.cliente,nit:sv.nit,sede:sv.sede,direccion:sv.direccion,tecnico:sv.tecnico,
    firmanteCliente:sv.firmanteCliente||'',firmaTecnico:sv.firmaTecnico,firmaCliente:sv.firmaCliente,
    inicioProgramado:sv.inicioProgramado.toISOString(),inicioReal:sv.inicioReal.toISOString(),finReal:sv.finReal.toISOString(),
    productos,areas,historico:historico.map(h=>({solicitud:h.solicitud,fecha:new Date(h.fecha).toISOString(),
      cumplimiento:h.cumplimiento==null?null:Number(h.cumplimiento),capturas:Number(h.capturas)||0}))}
}

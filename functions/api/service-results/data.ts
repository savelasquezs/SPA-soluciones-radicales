import type { PoolClient } from 'pg'
import { ApiError } from '../auth'

export interface ServiceCriterion { nombre: string; evaluacion: 'C'|'CP'|'NC'|'NA'|null; observacion: string|null; fotos: string[] }
export interface ServicePoint { numero: string; ubicacion: string; tipo: string; estado: string|null; capturas: Array<{plagaNombreSnapshot:string; cantidad:number}>; observaciones:string|null; foto:string|null }
export interface ServiceFinding { descripcion:string; recomendacion:string; estado:string; responsable:string; fotos:string[] }
export interface ServiceArea { id:string; nombre:string; sinAcceso:boolean; motivo:string|null; fotos:string[]; criterios:ServiceCriterion[]; puntos:ServicePoint[]; hallazgos:ServiceFinding[] }
export interface ServiceResultsData {
  id:string; solicitud:string; cliente:string; nit:string; sede:string; direccion:string; tecnico:string
  firmanteCliente:string; firmaTecnico:string; firmaCliente:string
  inicioProgramado:string; inicioReal:string; finReal:string
  productos:Array<{nombre:string;principio:string;registro:string;lote:string;dosis:string;metodos:string}>
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
  const findings=(await client.query<{areaId:string;descripcion:string;recomendacion:string;estado:string;responsable:string;fotos:unknown}>(`
    select sa.id as "areaId",h.descripcion,h.recomendacion_accion as recomendacion,
      case when h.servicio_cierre_id=$1 then 'CERRADO' else h.estado end as estado,
      h.responsable_nombre as responsable,
      case when h.servicio_cierre_id=$1 then coalesce(h.evidencias_cierre_storage_paths,'[]'::jsonb)
        else coalesce(h.evidencias_apertura_storage_paths,'[]'::jsonb) end as fotos
    from public.hallazgos h join public.servicio_areas sa on sa.area_id=h.area_id and sa.servicio_id=$1
    where h.servicio_apertura_id=$1 or h.servicio_cierre_id=$1 order by sa.posicion_recorrido,h.fecha_apertura,h.id`,[serviceId])).rows
  for(const h of findings)byId.get(h.areaId)?.hallazgos.push({descripcion:h.descripcion,recomendacion:h.recomendacion,estado:h.estado,responsable:h.responsable,fotos:arr(h.fotos)})
  const productos=(await client.query<ServiceResultsData['productos'][number]>(`
    select coalesce(pa.producto_nombre_snapshot,p.nombre) as nombre,
      coalesce(pa.principio_activo_snapshot,p.principio_activo_composicion,'') as principio,
      coalesce(pa.registro_sanitario_snapshot,'') as registro,coalesce(pa.lote,'') as lote,
      coalesce(pa.dosis_referencia_snapshot,'') as dosis,coalesce(pa.metodo_aplicacion_nombre_snapshot,'') as metodos
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

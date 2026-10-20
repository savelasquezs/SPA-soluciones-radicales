import type { PoolClient } from 'pg'
import type { DashboardDetailKind, DashboardDetailPage, DashboardDetailRecord } from '../../../src/types/dashboard'
import { unresolvedFindingsSql } from './metricSql'

const scope='($1::uuid is null or se.negocio_id=$1::uuid) and ($2::uuid is null or se.id=$2::uuid)'
const findingFrom='from public.hallazgos h join public.sedes se on se.id=h.sede_id '+
  'join public.negocios n on n.id=se.negocio_id join public.areas a on a.id=h.area_id'

/** All drilldowns are page-limited; WHERE predicates match dashboard counters. */
export async function dashboardDetailPage(
  client:PoolClient,kind:DashboardDetailKind,page:number,clientId:string|null,siteId:string|null,
):Promise<DashboardDetailPage>{
  const pageSize=20,offset=(page-1)*pageSize
  if(kind==='certificates'){
    // Technician credentials are company-wide and explicitly shown as global.
    const dateSql="between (now() at time zone 'America/Bogota')::date and ((now() at time zone 'America/Bogota')::date+30)"
    const technicians="u.activo and u.es_tecnico and u.certificado_storage_path is not null and u.certificado_fecha_vencimiento "+dateSql
    const documents='c.fecha_vencimiento '+dateSql
    const counts=await client.query<{total:number}>('select ('+
      '(select count(*) from public.usuarios u where '+technicians+')+'+
      '(select count(*) from public.certificados c where '+documents+')'+
      ')::integer as total')
    const result=await client.query<DashboardDetailRecord>(
      "select * from ("+
      "select u.id::text as id,'technician'::text as kind,u.nombre_completo as title,"+
        "'Certificado técnico'::text as description,u.certificado_fecha_vencimiento::text as date,"+
        "'TÉCNICO'::text as state,null::text as \"clientName\",null::text as \"siteName\","+
        "null::uuid as \"clientId\",null::uuid as \"siteId\",null::uuid as \"serviceId\" "+
      'from public.usuarios u where '+technicians+
      ' union all '+
      "select c.id::text,'certificate',n.nombre,'Certificado '||initcap(lower(c.tipo_certificado)),"+
        'c.fecha_vencimiento::text,c.estado_generacion,n.nombre,se.nombre,n.id,se.id,s.id '+
      'from public.certificados c join public.servicios s on s.id=c.servicio_id '+
      'join public.sedes se on se.id=s.sede_id join public.negocios n on n.id=se.negocio_id '+
      'where '+documents+
      ') records order by date,id limit $1 offset $2',[pageSize,offset])
    return {items:result.rows,total:counts.rows[0]?.total??0,page,pageSize}
  }
  const where='where '+scope+(kind==='findings'?' and '+unresolvedFindingsSql:'')
  const params:unknown[]=[clientId,siteId]
  const counts=await client.query<{total:number}>('select count(*)::integer as total '+findingFrom+' '+where,params)
  const result=await client.query<DashboardDetailRecord>(
    "select h.id::text as id,'finding'::text as kind,h.descripcion as title,"+
    "coalesce(a.nombre,'') as description,h.fecha_apertura as date,h.estado as state,"+
    'n.nombre as "clientName",se.nombre as "siteName",n.id as "clientId",'+
    'se.id as "siteId",h.servicio_apertura_id as "serviceId" '+
    findingFrom+' '+where+' order by h.fecha_apertura desc,h.id desc limit $3 offset $4',
    [...params,pageSize,offset])
  return {items:result.rows,total:counts.rows[0]?.total??0,page,pageSize}
}

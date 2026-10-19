import type { PoolClient } from 'pg'
import type { DashboardSnapshot, DashboardPeriod, DashboardServiceRow, DashboardFindingRow } from '../../../src/types/dashboard'
import { addDateDays, todayBogota } from '../../../src/helpers/adminServices'
import { DASHBOARD_DAYS, resolveDashboardRange, type DashboardBucket } from '../../../src/helpers/dashboardRanges'
import { actionableUpcomingSql, serviceMetricSql, unresolvedFindingsSql } from './metricSql'
export { DASHBOARD_DAYS }

type Bucket = DashboardBucket
type Params = [string | null, string | null, string, string, Bucket, string]

const scope = '($1::uuid is null or se.negocio_id=$1::uuid) and ($2::uuid is null or se.id=$2::uuid)'
const serviceFrom = 'from public.servicios s join public.sedes se on se.id=s.sede_id join public.negocios n on n.id=se.negocio_id'
const bogotaStart = "(($3::date)::timestamp at time zone 'America/Bogota')"
const bogotaEnd = "(($4::date)::timestamp at time zone 'America/Bogota')"

async function rows<T>(client: PoolClient, sql: string, params: unknown[]): Promise<T[]> {
  return (await client.query(sql,params)).rows as T[]
}
function number(value: unknown): number { return Number(value ?? 0) }
function bucketFor(date: string, kind: Bucket): string {
  const instant = new Date(date+'T00:00:00Z')
  if (kind==='week') instant.setUTCDate(instant.getUTCDate()-((instant.getUTCDay()+6)%7))
  if (kind==='month' || kind==='quarter') { instant.setUTCDate(1); if(kind==='quarter')instant.setUTCMonth(Math.floor(instant.getUTCMonth()/3)*3) }
  return instant.toISOString().slice(0,10)
}
export function dashboardKeys(from: string, toExclusive: string, kind: Bucket): string[] {
  const dates: string[]=[]
  let current=bucketFor(from,kind)
  while (current<toExclusive && dates.length<60) {
    dates.push(current)
    const next=new Date(current+'T00:00:00Z')
    if(kind==='month'||kind==='quarter')next.setUTCMonth(next.getUTCMonth()+(kind==='quarter'?3:1))
    else next.setUTCDate(next.getUTCDate()+(kind==='week'?7:1))
    current=next.toISOString().slice(0,10)
  }
  return dates
}
interface Summary {
  todayScheduled: number; todayOngoing: number; todayCompleted: number
  delayed: number; performedValue: string; previousValue: string
  outstandingValue: string; outstandingPayments: number; calendarErrors: number
}
interface UpcomingCounts { total: number; overdue: number }
interface FindingCounts { open: number; ongoing: number }
interface ServicesChart { date: string; scheduled: number; ongoing: number; completed: number; cancelled: number }
interface ValueChart { date: string; value: string }
interface ComplianceChart { date: string; percentage: number; visits: number }

export async function dashboardSnapshot(client: PoolClient, period: DashboardPeriod, clientId: string | null, siteId: string | null, custom: {from:string;to:string}|null = null): Promise<DashboardSnapshot> {
  const range=resolveDashboardRange(period,custom)
  const {from,bucket,days}=range, to=addDateDays(range.to,1),today=todayBogota()
  const previousFrom=addDateDays(from,-days)
  const params: Params=[clientId,siteId,from,to,bucket,today]

  // Separate scalar subqueries let PostgreSQL use the state/start and completion
  // indexes. The original multi-FILTER aggregate scanned every historical service.
  const base = serviceFrom+' where '+scope+' and '
  const sub = (expression:string, condition:string) => '(select '+expression+' '+base+condition+')'
  const count = (condition:string) => sub('count(*)::integer',condition)
  const money = (condition:string) => sub('coalesce(sum(s.valor_servicio),0)::text',condition)
  const summaryRows=await rows<Summary>(client, 'select '+
    count(serviceMetricSql.today+" and s.estado='PROGRAMADO'")+' as "todayScheduled",'+
    count(serviceMetricSql.today+" and s.estado='EN_PROCESO'")+' as "todayOngoing",'+
    count(serviceMetricSql.today+" and s.estado='FINALIZADO'")+' as "todayCompleted",'+
    count(serviceMetricSql.delayed)+' as delayed,'+
    money(serviceMetricSql.performed+' and s.fin_real>='+bogotaStart+' and s.fin_real<'+bogotaEnd)+' as "performedValue",'+
    money(serviceMetricSql.performed+" and s.fin_real>=($5::date::timestamp at time zone 'America/Bogota') and s.fin_real<"+bogotaStart)+' as "previousValue",'+
    money(serviceMetricSql.unpaid)+' as "outstandingValue",'+
    count(serviceMetricSql.unpaid)+' as "outstandingPayments",'+
    count(serviceMetricSql.calendarError)+' as "calendarErrors"'
    ,[clientId,siteId,from,to,previousFrom])
  const summary=summaryRows[0]!
  const clients=await rows<{id:string;name:string}>(client,
    "select id,nombre as name from public.negocios where activo order by nombre,id",[])
  const sites=await rows<{id:string;clientId:string;name:string}>(client,
    'select id,negocio_id as "clientId",nombre as name from public.sedes where activo order by nombre,id',[])

  const contacts=await rows<UpcomingCounts>(client,
    "select count(*)::int as total,"+
    "count(*) filter (where p.fecha_sugerida<((now() at time zone 'America/Bogota')::date::timestamp at time zone 'America/Bogota'))::int as overdue "+
    'from public.proximos_servicios p join public.sedes se on se.id=p.sede_id join public.negocios n on n.id=se.negocio_id '+
    'where '+scope+' and '+actionableUpcomingSql,[clientId,siteId])

  const findings=await rows<FindingCounts>(client,
    "select count(*) filter (where h.estado=\'ABIERTO\')::int as open,"+
    "count(*) filter (where h.estado='EN_PROCESO')::int as ongoing "+
    'from public.hallazgos h join public.sedes se on se.id=h.sede_id where '+scope+' and '+unresolvedFindingsSql,params.slice(0,2))
  
  // Both issued documents and employee credentials are global administrative alerts.
  const certificates=await rows<{total:number}>(client,
    "select ("+
    "select count(*) from public.usuarios u where u.activo and u.es_tecnico and u.certificado_storage_path is not null and u.certificado_fecha_vencimiento between $1::date and ($1::date+30)"+
    ") + (select count(*) from public.certificados c where c.fecha_vencimiento between $1::date and ($1::date+30)) as total",[today])

  const serviceSeries=await rows<ServicesChart>(client,
    "select date_trunc($5::text,s.inicio_programado at time zone 'America/Bogota')::date::text as date,"+
    "count(*) filter (where s.estado='PROGRAMADO')::int as scheduled,"+
    "count(*) filter (where s.estado='EN_PROCESO')::int as ongoing,"+
    "count(*) filter (where s.estado='FINALIZADO')::int as completed,"+
    "count(*) filter (where s.estado='CANCELADO')::int as cancelled "+
    serviceFrom+' where '+scope+' and s.inicio_programado>='+bogotaStart+
    ' and s.inicio_programado<'+bogotaEnd+' group by 1 order by 1',params.slice(0,5))

  const valueSeries=await rows<ValueChart>(client,
    "select date_trunc($5::text,s.fin_real at time zone 'America/Bogota')::date::text as date,"+
    "coalesce(sum(s.valor_servicio),0)::text as value "+
    serviceFrom+" where "+scope+" and s.estado='FINALIZADO'"+
    ' and s.fin_real>='+bogotaStart+' and s.fin_real<'+bogotaEnd+' group by 1 order by 1',params.slice(0,5))

  // Each visited service contributes one MIP percentage. Missing/NA criteria and
  // inaccessible areas are excluded; missing evaluations never count as zero.
  const complianceSeries=await rows<ComplianceChart>(client,
    "with per_visit as (select s.id,date_trunc($5::text,s.fin_real at time zone 'America/Bogota')::date::text as date,"+
    "100.0*avg(case e.evaluacion when 'C' then 1.0 when 'CP' then 0.5 when 'NC' then 0.0 end) as percentage "+
    'from public.servicios s join public.sedes se on se.id=s.sede_id '+
    'join public.evaluaciones_mip_area e on e.servicio_id=s.id '+
    'join public.servicio_areas sa on sa.id=e.servicio_area_id and sa.servicio_id=s.id '+
    "where "+scope+" and se.tipo_sede='NEGOCIO' and s.tipo_servicio='PRINCIPAL' and s.estado='FINALIZADO' "+
    'and s.fin_real>='+bogotaStart+' and s.fin_real<'+bogotaEnd+
    " and e.evaluacion in ('C','CP','NC') and not sa.sin_acceso group by s.id) "+
    'select date,round(avg(percentage)::numeric,1)::float8 as percentage,count(*)::int as visits '+
    'from per_visit group by date order by date',params.slice(0,5))

  const serviceColumns = "s.id,s.solicitud as reference,n.nombre as \"clientName\",se.nombre as \"siteName\","+
    "n.id as \"clientId\",se.id as \"siteId\",s.inicio_programado as date,"+
    "u.nombre_completo as technician,s.estado as status,s.valor_servicio::bigint::text as value,s.estado_pago as payment "
  const upcoming=await rows<DashboardServiceRow & {value:string}>(client,
    'select '+serviceColumns+serviceFrom+' join public.usuarios u on u.id=s.tecnico_responsable_id '+
    'where '+scope+' and '+serviceMetricSql.next+' '+
    "order by case when s.estado='EN_PROCESO' then 0 else 1 end,s.inicio_programado,s.id limit 5",params.slice(0,2))
  const latest=await rows<DashboardServiceRow & {value:string}>(client,
    'select '+serviceColumns.replace('s.inicio_programado as date,','s.fin_real as date,')+serviceFrom+' join public.usuarios u on u.id=s.tecnico_responsable_id '+
    'where '+scope+' and '+serviceMetricSql.recent+' '+
    'order by s.fin_real desc nulls last,s.id desc limit 5',params.slice(0,2))

  const recentFindings=await rows<DashboardFindingRow>(client,
    'select h.id,n.id as "clientId",se.id as "siteId",n.nombre as "clientName",se.nombre as "siteName",'+
    'a.nombre as area,h.descripcion as description,h.fecha_apertura as "openedAt",h.estado as status '+
    'from public.hallazgos h join public.sedes se on se.id=h.sede_id join public.negocios n on n.id=se.negocio_id '+
    'join public.areas a on a.id=h.area_id where '+scope+
    ' order by h.fecha_apertura desc,h.id desc limit 5',params.slice(0,2))

  const counts=contacts[0]??{total:0,overdue:0}
  const f=findings[0]??{open:0,ongoing:0}
  const values=dashValues(summary)
  const keys=dashboardKeys(from,to,bucket)
  const servicesByDate=new Map(serviceSeries.map(x=>[x.date,x]))
  const valuesByDate=new Map(valueSeries.map(x=>[x.date,x]))
  const complianceByDate=new Map(complianceSeries.map(x=>[x.date,x]))
  return {
    generatedAt:new Date().toISOString(),
    period:{id:period,from,to:range.to},
    filters:{clients,sites},
    kpis:{
      today:{scheduled:number(summary.todayScheduled),ongoing:number(summary.todayOngoing),completed:number(summary.todayCompleted)},
      delayed:number(summary.delayed),upcoming:number(counts.total),upcomingOverdue:number(counts.overdue),
      performedValue:values.current,performedDelta:values.change,
      outstandingValue:number(summary.outstandingValue),outstandingPayments:number(summary.outstandingPayments),
      findings:{open:number(f.open),ongoing:number(f.ongoing)}
    },
    alerts:{expiringCertificates:number(certificates[0]?.total),calendarErrors:number(summary.calendarErrors)},
    charts:{
      services:keys.map(date=>({date,scheduled:number(servicesByDate.get(date)?.scheduled),
        ongoing:number(servicesByDate.get(date)?.ongoing),completed:number(servicesByDate.get(date)?.completed),
        cancelled:number(servicesByDate.get(date)?.cancelled)})),
      value:keys.map(date=>({date,value:number(valuesByDate.get(date)?.value)})),
      compliance:keys.map(date=>({date,percentage:complianceByDate.get(date)?.percentage??null,
        visits:number(complianceByDate.get(date)?.visits)}))
    },
    tables:{upcoming:upcoming.map(s=>({...s,value:number(s.value)})),
      latest:latest.map(s=>({...s,value:number(s.value)})),findings:recentFindings}
  }
}
export function dashValues(summary: Pick<Summary,'performedValue'|'previousValue'>): { current: number; change: number | null } {
  const current=number(summary.performedValue),previous=number(summary.previousValue)
  return {current,change:previous>0?Math.round((current-previous)/previous*1000)/10:null}
}

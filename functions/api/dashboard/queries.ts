import type { PoolClient } from 'pg'
import type { DashboardSnapshot, DashboardPeriod, DashboardServiceRow, DashboardFindingRow } from '../../../src/types/dashboard'
import { addDateDays, todayBogota } from '../../../src/helpers/adminServices'

export const DASHBOARD_DAYS: Record<DashboardPeriod, number> = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 }
type Bucket = 'day' | 'week' | 'month'
type Params = [string | null, string | null, string, string, Bucket, string]

const scope = '($1::uuid is null or se.negocio_id=$1::uuid) and ($2::uuid is null or se.id=$2::uuid)'
const serviceFrom = 'from public.servicios s join public.sedes se on se.id=s.sede_id join public.negocios n on n.id=se.negocio_id'
const bogotaStart = "(($3::date)::timestamp at time zone 'America/Bogota')"
const bogotaEnd = "(($4::date)::timestamp at time zone 'America/Bogota')"
const todayStart = "(($6::date)::timestamp at time zone 'America/Bogota')"
const tomorrowStart = "((($6::date+1)::timestamp) at time zone 'America/Bogota')"

async function rows<T>(client: PoolClient, sql: string, params: unknown[]): Promise<T[]> {
  return (await client.query(sql,params)).rows as T[]
}
function number(value: unknown): number { return Number(value ?? 0) }
function bucketFor(date: string, kind: Bucket): string {
  const instant = new Date(date+'T00:00:00Z')
  if (kind==='week') instant.setUTCDate(instant.getUTCDate()-((instant.getUTCDay()+6)%7))
  if (kind==='month') instant.setUTCDate(1)
  return instant.toISOString().slice(0,10)
}
export function dashboardKeys(from: string, toExclusive: string, kind: Bucket): string[] {
  const dates: string[]=[]
  let current=bucketFor(from,kind)
  while (current<toExclusive && dates.length<54) {
    dates.push(current)
    const next=new Date(current+'T00:00:00Z')
    if(kind==='month')next.setUTCMonth(next.getUTCMonth()+1)
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

export async function dashboardSnapshot(client: PoolClient, period: DashboardPeriod, clientId: string | null, siteId: string | null): Promise<DashboardSnapshot> {
  const days=DASHBOARD_DAYS[period],today=todayBogota(),from=addDateDays(today,1-days),to=addDateDays(today,1)
  const previousFrom=addDateDays(from,-days)
  const bucket: Bucket=days<=7?'day':days<=90?'week':'month'
  const params: Params=[clientId,siteId,from,to,bucket,today]

  const [{ clients, sites }, summary] = await Promise.all([
    (async () => {
      const clients=await rows<{id:string;name:string}>(client,
        "select id,nombre as name from public.negocios where activo order by nombre,id",[])
      const sites=await rows<{id:string;clientId:string;name:string}>(client,
        'select id,negocio_id as "clientId",nombre as name from public.sedes where activo order by nombre,id',[])
      return {clients,sites}
    })(),
    // This SELECT intentionally uses period boundaries only for the realized value. Today,
    // overdue work and receivables are live operating snapshots regardless of period.
    rows<Summary>(client,
      'select '+
      'count(*) filter (where s.estado=\'PROGRAMADO\' and s.inicio_programado>='+todayStart+' and s.inicio_programado<'+tomorrowStart+')::int as "todayScheduled",'+
      'count(*) filter (where s.estado=\'EN_PROCESO\' and s.inicio_programado>='+todayStart+' and s.inicio_programado<'+tomorrowStart+')::int as "todayOngoing",'+
      'count(*) filter (where s.estado=\'FINALIZADO\' and s.inicio_programado>='+todayStart+' and s.inicio_programado<'+tomorrowStart+')::int as "todayCompleted",'+
      'count(*) filter (where s.estado=\'PROGRAMADO\' and s.inicio_programado<now()-interval \'15 minutes\')::int as delayed,'+
      'coalesce(sum(s.valor_servicio) filter (where s.estado=\'FINALIZADO\' and s.fin_real>='+bogotaStart+' and s.fin_real<'+bogotaEnd+'),0)::text as "performedValue",'+
      "coalesce(sum(s.valor_servicio) filter (where s.estado='FINALIZADO' and s.fin_real >= ($7::date::timestamp at time zone 'America/Bogota') and s.fin_real <"+bogotaStart+'),0)::text as "previousValue",'+
      "coalesce(sum(s.valor_servicio) filter (where s.estado='FINALIZADO' and s.valor_servicio>0 and s.estado_pago<>'CONFIRMADO'),0)::text as \"outstandingValue\","+
      "count(*) filter (where s.estado='FINALIZADO' and s.valor_servicio>0 and s.estado_pago<>'CONFIRMADO')::int as \"outstandingPayments\","+
      "count(*) filter (where s.calendar_sync_estado='ERROR')::int as \"calendarErrors\" "+
      serviceFrom+' where '+scope,[...params,previousFrom]).then(result=>result[0]!)
  ])

  const contacts=await rows<UpcomingCounts>(client,
    "select count(*)::int as total,"+
    "count(*) filter (where p.fecha_sugerida<"+todayStart+")::int as overdue "+
    'from public.proximos_servicios p join public.sedes se on se.id=p.sede_id '+
    "where "+scope+
    " and p.servicio_agendado_id is null and p.estado in ('PENDIENTE','CONTACTADO','CONFIRMADO','POSPUESTO')"+
    " and p.fecha_sugerida < (($6::date+7)::timestamp at time zone 'America/Bogota')"+
    " and (p.fecha_recontacto is null or p.fecha_recontacto<=$6::date)",params)

  const findings=await rows<FindingCounts>(client,
    "select count(*) filter (where h.estado='ABIERTO')::int as open,"+
    "count(*) filter (where h.estado='EN_PROCESO')::int as ongoing "+
    'from public.hallazgos h join public.sedes se on se.id=h.sede_id where '+scope,params.slice(0,2))
  
  const certificates=await rows<{total:number}>(client,
    "select ("+
    "select count(*) from public.usuarios u where u.activo and u.es_tecnico and u.certificado_fecha_vencimiento between $6::date and ($6::date+30)"+
    ") + (select count(*) from public.certificados c join public.servicios s on s.id=c.servicio_id "+
    "join public.sedes se on se.id=s.sede_id where "+scope+" and c.fecha_vencimiento between $6::date and ($6::date+30)) as total",params)

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
    'where '+scope+" and s.estado in ('EN_PROCESO','PROGRAMADO')"+
    " and (s.estado='EN_PROCESO' or s.inicio_programado>=now()-interval '12 hours') "+
    "order by case when s.estado='EN_PROCESO' then 0 else 1 end,s.inicio_programado,s.id limit 5",params.slice(0,2))
  const latest=await rows<DashboardServiceRow & {value:string}>(client,
    'select '+serviceColumns+serviceFrom+' join public.usuarios u on u.id=s.tecnico_responsable_id '+
    'where '+scope+" and s.estado='FINALIZADO' "+
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
    period:{id:period,from,to:addDateDays(to,-1)},
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

import type { PoolClient } from 'pg'
import type { DashboardPeriod } from '../../../src/types/dashboard'
import type { TechnicianDashboardSnapshot, TechnicianDashboardService } from '../../../src/types/technicianDashboard'
import { addDateDays } from '../../../src/helpers/adminServices'
import { resolveDashboardRange } from '../../../src/helpers/dashboardRanges'
import { dashboardKeys } from '../dashboard/queries'
import { technicianServiceAssignmentSql } from '../technician-services/queries'

const begin = "(($2::date)::timestamp at time zone 'America/Bogota')"
const end = "(($3::date)::timestamp at time zone 'America/Bogota')"
const serviceFrom = 'from public.servicios s join public.sedes se on se.id=s.sede_id join public.negocios n on n.id=se.negocio_id'
const serviceScope = "where s.tipo_servicio='PRINCIPAL' and " + technicianServiceAssignmentSql
const finishedInRange = "s.estado='FINALIZADO' and s.fin_real>=" + begin + ' and s.fin_real<' + end

type SummaryRow = {
  completed: number; scheduled: number; ongoing: number; overdue: number
  sites: number; clients: number; started: number; onTime: number; avgMinutes: number | null
}
type ActivityRow = {
  findings: number; followUps: number; findingsClosed: number
  reviewedDevices: number; installedDevices: number; appliedProducts: number
  mipCompliance: number | null
}

export async function technicianDashboardSnapshot(
  client: PoolClient,
  technicianId: string,
  period: DashboardPeriod,
  custom: { from: string; to: string } | null = null,
): Promise<TechnicianDashboardSnapshot> {
  const range = resolveDashboardRange(period, custom)
  const toExclusive = addDateDays(range.to, 1)
  const dates = [technicianId, range.from, toExclusive]
  const { rows: summaries } = await client.query<SummaryRow>(`select
    count(*) filter (where ${finishedInRange})::int as completed,
    count(*) filter (where s.estado='PROGRAMADO')::int as scheduled,
    count(*) filter (where s.estado='EN_PROCESO')::int as ongoing,
    count(*) filter (where s.estado='PROGRAMADO' and s.inicio_programado<now()-interval '15 minutes')::int as overdue,
    count(distinct s.sede_id) filter (where ${finishedInRange})::int as sites,
    count(distinct se.negocio_id) filter (where ${finishedInRange})::int as clients,
    count(*) filter (where s.estado in ('EN_PROCESO','FINALIZADO')
      and s.inicio_real>=${begin} and s.inicio_real<${end})::int as started,
    count(*) filter (where s.estado in ('EN_PROCESO','FINALIZADO')
      and s.inicio_real>=${begin} and s.inicio_real<${end}
      and s.inicio_real<=s.inicio_programado+interval '15 minutes')::int as "onTime",
    round(avg(extract(epoch from (s.fin_real-s.inicio_real))/60)
      filter (where ${finishedInRange} and s.inicio_real is not null and s.fin_real>=s.inicio_real))::int as "avgMinutes"
    ${serviceFrom} ${serviceScope}`, dates)
  const summary = summaries[0]!

  // Group by the actual completion date; rescheduling cannot move historical completions.
  const { rows: completedRows } = await client.query<{ date: string; count: number }>(`select
    date_trunc($4::text,s.fin_real at time zone 'America/Bogota')::date::text as date,
    count(*)::int as count ${serviceFrom} ${serviceScope}
    and ${finishedInRange} group by 1 order by 1`, [...dates, range.bucket])
  const byDate = new Map(completedRows.map(row => [row.date, Number(row.count)]))

  // Only facts attributable to the active technician or their assigned visits.
  // Service-level actions shared with collaborators are labelled "en mis visitas".
  const { rows: activities } = await client.query<ActivityRow>(`select
    (select count(*)::int from public.hallazgos h
      join public.servicios s on s.id=h.servicio_apertura_id
      where s.tipo_servicio='PRINCIPAL' and ${technicianServiceAssignmentSql}
        and s.estado<>'CANCELADO' and h.fecha_apertura>=${begin} and h.fecha_apertura<${end}) as findings,
    (select count(*)::int from public.hallazgo_seguimientos hs
      where hs.tecnico_id=$1::uuid and hs.registrado_at>=${begin} and hs.registrado_at<${end}) as "followUps",
    (select count(*)::int from public.hallazgo_seguimientos hs
      where hs.tecnico_id=$1::uuid and hs.resultado='CERRADO'
        and hs.registrado_at>=${begin} and hs.registrado_at<${end}) as "findingsClosed",
    (select count(*)::int from public.revisiones_dispositivos r
      join public.servicios s on s.id=r.servicio_id
      where s.tipo_servicio='PRINCIPAL' and ${technicianServiceAssignmentSql}
        and ${finishedInRange}) as "reviewedDevices",
    (select count(*)::int from public.servicio_dispositivos sd
      join public.servicios s on s.id=sd.servicio_id
      where s.tipo_servicio='PRINCIPAL' and ${technicianServiceAssignmentSql}
        and sd.creado_durante_servicio and ${finishedInRange}) as "installedDevices",
    (select count(*)::int from public.productos_aplicados pa
      join public.servicios s on s.id=pa.servicio_id
      where s.tipo_servicio='PRINCIPAL' and ${technicianServiceAssignmentSql}
        and pa.aplicado and ${finishedInRange}) as "appliedProducts",
    (select round(avg(visit.score)::numeric,1)::float8 from (
      select s.id,100.0*avg(case e.evaluacion
        when 'C' then 1.0 when 'CP' then 0.5 when 'NC' then 0.0 end) as score
      from public.servicios s join public.sedes se on se.id=s.sede_id
      join public.evaluaciones_mip_area e on e.servicio_id=s.id
      join public.servicio_areas sa on sa.id=e.servicio_area_id and sa.servicio_id=s.id
      where s.tipo_servicio='PRINCIPAL' and ${technicianServiceAssignmentSql}
        and se.tipo_sede='NEGOCIO' and ${finishedInRange}
        and e.evaluacion in ('C','CP','NC') and not sa.sin_acceso
      group by s.id
    ) visit) as "mipCompliance"`, dates)
  const activity = activities[0]!

  const columns = `s.id,s.solicitud as reference,n.nombre as "clientName",se.nombre as "siteName",
    s.inicio_programado as "scheduledAt",s.fin_real as "completedAt",s.estado as status,
    case when s.tecnico_responsable_id=$1::uuid then 'RESPONSABLE' else 'COLABORADOR' end as role`
  const { rows: upcoming } = await client.query<TechnicianDashboardService>(`select ${columns}
    ${serviceFrom} ${serviceScope} and s.estado in ('EN_PROCESO','PROGRAMADO')
    order by case when s.estado='EN_PROCESO' then 0 else 1 end,s.inicio_programado,s.id limit 5`, [technicianId])
  const { rows: recent } = await client.query<TechnicianDashboardService>(`select ${columns}
    ${serviceFrom} ${serviceScope} and ${finishedInRange}
    order by s.fin_real desc nulls last,s.id desc limit 5`, dates)

  const completed = dashboardKeys(range.from, toExclusive, range.bucket)
    .map(date => ({ date, count: byDate.get(date) ?? 0 }))
  const started = Number(summary.started)
  return {
    generatedAt: new Date().toISOString(),
    period: { id: period, from: range.from, to: range.to },
    kpis: {
      completed: Number(summary.completed),
      scheduled: Number(summary.scheduled),
      ongoing: Number(summary.ongoing),
      overdue: Number(summary.overdue),
      sites: Number(summary.sites),
      clients: Number(summary.clients),
      onTime: Number(summary.onTime),
      started,
      punctuality: started ? Math.round(100 * Number(summary.onTime) / started) : null,
      avgMinutes: summary.avgMinutes === null ? null : Number(summary.avgMinutes),
    },
    charts: { completed },
    activity: {
      findings: Number(activity.findings),
      followUps: Number(activity.followUps),
      findingsClosed: Number(activity.findingsClosed),
      reviewedDevices: Number(activity.reviewedDevices),
      installedDevices: Number(activity.installedDevices),
      appliedProducts: Number(activity.appliedProducts),
      mipCompliance: activity.mipCompliance === null ? null : Number(activity.mipCompliance),
    },
    tables: { upcoming, recent },
  }
}

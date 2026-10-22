import { addDateDays, isDateOnly, todayBogota } from './adminServices'
import type { DashboardPeriod } from '../types/dashboard'

/** The backend and frontend use the same bounded, Bogotá-calendar reporting periods. */
export const DASHBOARD_DAYS = { '7d':7, '30d':30, '90d':90, '12m':365, '24m':730, '5y':1826 } as const
export const MAX_DASHBOARD_RANGE_DAYS = 3660
export type DashboardBucket = 'day' | 'week' | 'month' | 'quarter'

export function resolveDashboardRange(
  period: DashboardPeriod,
  custom: { from: string; to: string } | null = null,
  today = todayBogota(),
): { from: string; to: string; days: number; bucket: DashboardBucket } {
  const days = period === 'custom' ? null : DASHBOARD_DAYS[period]
  if (days === undefined) throw new Error('Período no reconocido')
  const from = days === null ? (custom?.from ?? '') : addDateDays(today, 1-days)
  const to = days === null ? (custom?.to ?? '') : today
  if (!isDateOnly(from) || !isDateOnly(to) || from > to) throw new Error('Selecciona dos fechas válidas')
  const span = Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86_400_000)+1
  if (span < 1 || span > MAX_DASHBOARD_RANGE_DAYS) throw new Error('El rango no puede superar diez años')
  const bucket: DashboardBucket = span<=14 ? 'day' : span<=120 ? 'week' : span<=1460 ? 'month' : 'quarter'
  return {from,to,days:span,bucket}
}

const dashboardMonth = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' })

function dashboardShortDate(value: string, year = false): string {
  const day = Number(value.slice(8, 10))
  const month = dashboardMonth.format(new Date(value + 'T12:00:00Z'))
  return `${day} ${month}${year ? ' ' + value.slice(0, 4) : ''}`
}

/** Report windows include both boundary dates in the Bogotá calendar. */
export function dashboardPeriodLabel(period: { from: string; to: string }): string {
  const includeYear = period.from.slice(0, 4) !== period.to.slice(0, 4)
  return `${dashboardShortDate(period.from, includeYear)} – ${dashboardShortDate(period.to, includeYear)}`
}

/** A weekly point represents its actual visible interval, not only its Monday. */
export function dashboardWeekLabel(bucketStart: string, period: { from: string; to: string }): string {
  const from = bucketStart < period.from ? period.from : bucketStart
  const weekEnd = addDateDays(bucketStart, 6)
  const to = weekEnd > period.to ? period.to : weekEnd
  if (from > to || from === to) return dashboardShortDate(from > to ? bucketStart : from)
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${Number(from.slice(8, 10))}–${dashboardShortDate(to)}`
  }
  return `${dashboardShortDate(from)}–${dashboardShortDate(to)}`
}

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

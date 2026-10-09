import type { ServiceResultsData } from '@/types/serviceResults'

export type ReportHistoricalVisit = ServiceResultsData['historico'][number]

export const REPORT_TREND_GEOMETRY = {
  left: 34, right: 346, top: 34, bottom: 144, width: 380, height: 194,
} as const

export type TrendVisit = ReportHistoricalVisit & {
  x: number
  complianceY: number | null
  capturesY: number
  dateLabel: string
  captures: number
  complianceDelta: number | null
  capturesDelta: number | null
}
export type TrendSegment = { x1: number; y1: number; x2: number; y2: number }
export type ReportTrends = {
  visits: TrendVisit[]
  complianceSegments: TrendSegment[]
  maxCaptures: number
  complianceChange: number | null
  captureChange: number | null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const roundOne = (value: number) => Math.round(value * 10) / 10
export const safeCaptures = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0

export function visitDateLabel(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('es-CO', {
    timeZone:'America/Bogota',day:'numeric',month:'short',
  }).formatToParts(date)
  const day = (parts.find(part => part.type === 'day')?.value ?? '').padStart(2, '0')
  const month = (parts.find(part => part.type === 'month')?.value ?? '').replace('.', '').toLowerCase()
  return day + ' ' + month
}

export function chartX(index: number, length: number): number {
  const { left, right } = REPORT_TREND_GEOMETRY
  return length <= 1 ? (left + right) / 2 : left + index * (right - left) / (length - 1)
}

export function chartY(value: number, maximum: number): number {
  const { top, bottom } = REPORT_TREND_GEOMETRY
  return bottom - clamp(maximum > 0 ? value / maximum : 0, 0, 1) * (bottom - top)
}

/** A null evaluation is missing data, not 0%; never connect a line across missing visits. */
export function buildReportTrends(history: ReportHistoricalVisit[]): ReportTrends {
  const visits = history
    .map((visit, index) => ({ visit, index }))
    .sort((a, b) => {
      const ta = Date.parse(a.visit.fecha)
      const tb = Date.parse(b.visit.fecha)
      const diff = (Number.isFinite(ta) ? ta : Infinity) - (Number.isFinite(tb) ? tb : Infinity)
      return diff || a.index - b.index
    })
    .slice(-6)
    .map(({ visit }) => ({
      ...visit,
      cumplimiento: visit.cumplimiento !== null && Number.isFinite(visit.cumplimiento)
        ? clamp(visit.cumplimiento, 0, 100) : null,
      captures: safeCaptures(visit.capturas),
    }))
  const maxCaptures = Math.max(1, ...visits.map(visit => visit.captures))
  const plotted: TrendVisit[] = visits.map((visit, index) => {
    const previous = visits[index - 1]
    return {
      ...visit,
      x: chartX(index, visits.length),
      complianceY: visit.cumplimiento === null ? null : chartY(visit.cumplimiento, 100),
      capturesY: chartY(visit.captures, maxCaptures),
      dateLabel: visitDateLabel(visit.fecha),
      complianceDelta: previous && previous.cumplimiento !== null && visit.cumplimiento !== null
        ? roundOne(visit.cumplimiento - previous.cumplimiento) : null,
      capturesDelta: previous ? visit.captures - previous.captures : null,
    }
  })
  const complianceSegments: TrendSegment[] = []
  for (let i = 1; i < plotted.length; i++) {
    const before = plotted[i - 1]!
    const after = plotted[i]!
    if (before.complianceY !== null && after.complianceY !== null) {
      complianceSegments.push({
        x1: before.x, y1: before.complianceY, x2: after.x, y2: after.complianceY,
      })
    }
  }
  const last = plotted[plotted.length - 1]
  return {
    visits:plotted, complianceSegments, maxCaptures,
    complianceChange:last?.complianceDelta ?? null,
    captureChange:last?.capturesDelta ?? null,
  }
}
export function signedTrend(value: number | null, unit: 'pp' | 'capturas'): string {
  if (value === null) return 'Sin comparación anterior'
  const formatted = (value > 0 ? '+' : '') + value.toLocaleString('es-CO', { maximumFractionDigits:1 })
  return unit === 'pp' ? formatted + ' pp' : formatted + (Math.abs(value) === 1 ? ' captura' : ' capturas')
}

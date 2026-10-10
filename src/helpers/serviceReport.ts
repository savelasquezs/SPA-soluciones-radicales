import type { ServiceAreaResult, ServiceResultsData } from '@/types/serviceResults'

export type ReportEvidenceState = 'IDLE' | 'LOADING' | 'AVAILABLE' | 'MISSING' | 'ERROR'
export type ReportEvidence = { path: string; caption: string }

const weights: Record<'C' | 'CP' | 'NC', number> = { C: 100, CP: 50, NC: 0 }

export function areaCompliance(area: ServiceAreaResult): number | null {
  if (area.sinAcceso) return null
  const applicable = area.criterios.filter(
    (item): item is typeof item & { evaluacion: 'C' | 'CP' | 'NC' } =>
      item.evaluacion === 'C' || item.evaluacion === 'CP' || item.evaluacion === 'NC',
  )
  if (!applicable.length) return null
  return applicable.reduce((sum, criterion) => sum + weights[criterion.evaluacion], 0) / applicable.length
}

export function reportCompliance(areas: ServiceAreaResult[]): number | null {
  const values = areas.map(areaCompliance).filter((value): value is number => value !== null)
  if (!values.length) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10
}

export function reportMetrics(data: ServiceResultsData) {
  const criteria = data.areas.flatMap(area => area.sinAcceso ? [] : area.criterios)
  const points = data.areas.flatMap(area => area.sinAcceso ? [] : area.puntos)
  return {
    compliance: reportCompliance(data.areas),
    areasReviewed: data.areas.filter(area => !area.sinAcceso).length,
    areasWithoutAccess: data.areas.filter(area => area.sinAcceso).length,
    criteriaReviewed: criteria.filter(item => item.evaluacion != null).length,
    monitoringPoints: points.length,
    captures: points.reduce((sum, point) => sum + point.capturas.reduce((part, c) => part + Math.max(0, c.cantidad), 0), 0),
    findings: data.areas.reduce((sum, area) => sum + area.hallazgos.length, 0),
    unresolvedFindings: data.areas.reduce((sum, area) => sum + area.hallazgos.filter(finding=>finding.estado!=='CERRADO').length, 0),
  }
}

/** Keep evidence next to its technical record, and signatures in the final section. */
export function reportEvidence(data: ServiceResultsData): ReportEvidence[] {
  const unique = new Map<string, string>()
  const historicFinding = /^services\/[0-9a-f-]{36}\/findings\/[0-9a-f-]{36}\/(?:opening|closure|followup)\/[^/]+\.(?:png|jpe?g|webp)$/i
  function add(path: string | null | undefined, caption: string, finding = false): void {
    if (path && (path.startsWith('services/' + data.id + '/') || /^e:(0|[1-9]\d{0,3})$/.test(path)
      || (finding && historicFinding.test(path))) && !unique.has(path)) unique.set(path, caption)
  }
  for (const area of data.areas) {
    area.fotos.forEach((path, i) => add(path, 'Área sin acceso · ' + area.nombre + ' · Foto ' + (i + 1)))
    for (const criterion of area.criterios) criterion.fotos.forEach((path, i) => add(path, area.nombre + ' · ' + criterion.nombre + ' · Foto ' + (i + 1)))
    for (const point of area.puntos) add(point.foto, 'Puesto ' + point.numero + ' · ' + area.nombre)
    for (const finding of area.hallazgos) {
      finding.fotos.forEach((path, i) => add(path, 'Hallazgo · ' + area.nombre + ' · Apertura · Foto ' + (i + 1), true))
      for (const review of finding.seguimientos)
        review.fotos.forEach((path, i) => add(path, 'Hallazgo · ' + area.nombre + ' · ' + review.solicitud + ' · Foto ' + (i + 1), true))
    }
  }
  add(data.firmaTecnico, 'Firma del técnico')
  add(data.firmaCliente, 'Firma de conformidad del cliente')
  return [...unique].map(([path, caption]) => ({ path, caption }))
}

export function bogotaDate(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function bogotaTime(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
}

export function elapsedMinutes(start: string, end: string): number {
  const minutes = (Date.parse(end) - Date.parse(start)) / 60000
  return Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0
}

export function scoreText(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' %'
}

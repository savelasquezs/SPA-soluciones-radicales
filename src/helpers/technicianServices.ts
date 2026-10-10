import type { DeviceState, TechnicianArea, TechnicianPackageCache, TechnicianServiceSummary } from '../types/technicianServices'

export function technicianServiceStateLabel(state: TechnicianServiceSummary['estado']): string {
  return ({ PROGRAMADO: 'Programado', EN_PROCESO: 'En proceso', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado' } as const)[state] ?? state
}

export function technicianServiceStateTone(state: TechnicianServiceSummary['estado']): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (state === 'EN_PROCESO') return 'warning'
  if (state === 'FINALIZADO') return 'success'
  if (state === 'CANCELADO') return 'danger'
  return 'info'
}

export function formatTechnicianDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(date)
}

export function sortTechnicianServices(records: TechnicianServiceSummary[]): TechnicianServiceSummary[] {
  const priority = { EN_PROCESO: 0, PROGRAMADO: 1, FINALIZADO: 2, CANCELADO: 3 }
  return [...records].sort((left, right) => {
    const state = priority[left.estado] - priority[right.estado]
    if (state) return state
    const direction = left.estado === 'FINALIZADO' ? -1 : 1
    return direction * (new Date(left.inicioProgramado).getTime() - new Date(right.inicioProgramado).getTime())
  })
}

export function technicianServicesToAutoPrepare(
  records: TechnicianServiceSummary[],
  caches: Record<string, TechnicianPackageCache>,
  preparingIds: string[],
): TechnicianServiceSummary[] {
  const preparing = new Set(preparingIds)
  return records.filter(record => record.autoPrepareEligible && !caches[record.id] && !preparing.has(record.id))
}

export function orderedTechnicianAreas(areas: TechnicianArea[]): TechnicianArea[] {
  return [...areas].sort((left, right) => left.posicionRecorrido - right.posicionRecorrido || left.id.localeCompare(right.id))
}

export function technicianFindingPending(finding: TechnicianArea['hallazgos'][number], serviceId: string): boolean {
  return finding.servicioAperturaId !== serviceId && finding.estado !== 'CERRADO'
    && finding.servicioCierreId !== serviceId && !finding.resultadoSeguimiento
}

export type TechnicianAreaIssue = { tab: 'criteria' | 'points' | 'findings'; id: string; message: string }
export function technicianAreaIssues(area: TechnicianArea, serviceId: string): TechnicianAreaIssue[] {
  if (area.sinAcceso) return []
  return [
    ...area.criterios.filter(criterion => !criterion.evaluacion)
      .map(criterion => ({ tab: 'criteria' as const, id: criterion.id, message: 'Debes evaluar este criterio para continuar.' })),
    ...area.dispositivos.filter(device => !device.revisado)
      .map(device => ({ tab: 'points' as const, id: device.id, message: 'Revisa este puesto antes de continuar.' })),
    ...area.hallazgos.filter(finding => technicianFindingPending(finding, serviceId))
      .map(finding => ({ tab: 'findings' as const, id: finding.id, message: 'Indica si este hallazgo sigue igual, está en proceso o se cerró.' })),
  ]
}

export function technicianAreaResolved(area: TechnicianArea, serviceId?: string): boolean {
  if (area.sinAcceso) return Boolean(area.sinAccesoDescripcion?.trim() && (area.sinAccesoFotoStoragePath || area.sinAccesoFotoLocalId))
  return area.criterios.length > 0
    && area.criterios.every(criterion => criterion.evaluacion)
    && area.dispositivos.every(device => device.revisado)
    && (!serviceId || area.hallazgos.every(finding => !technicianFindingPending(finding, serviceId)))
}

export function technicianDevicePhotoRequired(previous: DeviceState, observed: DeviceState): boolean {
  return previous !== observed && (observed === 'DANADO' || observed === 'FUERA_DE_USO')
}

export function moveTechnicianArea(areaIds: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction
  if (index < 0 || index >= areaIds.length || target < 0 || target >= areaIds.length) return [...areaIds]
  const moved = [...areaIds]
  ;[moved[index], moved[target]] = [moved[target]!, moved[index]!]
  return moved
}

export function isExactAreaPermutation(currentIds: string[], proposedIds: string[]): boolean {
  return currentIds.length === proposedIds.length
    && new Set(proposedIds).size === proposedIds.length
    && currentIds.every(id => proposedIds.includes(id))
}

export type TechnicianNextArea =
  | { kind: 'AREA'; area: TechnicianArea }
  | { kind: 'PENDING' }
  | { kind: 'CLOSURE' }

export function nextTechnicianArea(areas: TechnicianArea[], currentId: string): TechnicianNextArea {
  const ordered = orderedTechnicianAreas(areas)
  const currentIndex = ordered.findIndex(area => area.id === currentId)
  if (currentIndex < 0) return ordered.some(area => !technicianAreaResolved(area)) ? { kind: 'PENDING' } : { kind: 'CLOSURE' }
  for (let offset = 1; offset < ordered.length; offset += 1) {
    const area = ordered[(currentIndex + offset) % ordered.length]!
    if (!technicianAreaResolved(area)) return { kind: 'AREA', area }
  }
  return technicianAreaResolved(ordered[currentIndex]!) ? { kind: 'CLOSURE' } : { kind: 'PENDING' }
}

export type TechnicianRouteStep =
  | { kind: 'AREA'; area: TechnicianArea }
  | { kind: 'REVIEW' }

export function nextTechnicianRouteStep(areas: TechnicianArea[], currentId: string): TechnicianRouteStep {
  const ordered = orderedTechnicianAreas(areas)
  const currentIndex = ordered.findIndex(area => area.id === currentId)
  if (currentIndex < 0) return ordered[0] ? { kind: 'AREA', area: ordered[0] } : { kind: 'REVIEW' }
  const nextArea = ordered[currentIndex + 1]
  return nextArea ? { kind: 'AREA', area: nextArea } : { kind: 'REVIEW' }
}

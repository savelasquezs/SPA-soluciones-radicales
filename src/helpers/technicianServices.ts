import type { TechnicianArea, TechnicianServiceSummary } from '@/types/technicianServices'

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

export function orderedTechnicianAreas(areas: TechnicianArea[]): TechnicianArea[] {
  return [...areas].sort((left, right) => left.posicionRecorrido - right.posicionRecorrido || left.id.localeCompare(right.id))
}

export function technicianAreaResolved(area: TechnicianArea): boolean {
  if (area.sinAcceso) return Boolean(area.sinAccesoDescripcion?.trim() && area.sinAccesoFotoStoragePath)
  return area.criterios.length > 0
    && area.criterios.every(criterion => criterion.evaluacion)
    && area.dispositivos.every(device => device.revisado)
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

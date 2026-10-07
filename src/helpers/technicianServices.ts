import type { TechnicianServiceSummary } from '@/types/technicianServices'

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

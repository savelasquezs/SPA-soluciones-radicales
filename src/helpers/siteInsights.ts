import type { DeviceState, FindingState } from '@/types/technicianServices'
import type { EvidenceReference, InsightFilters } from '@/types/siteInsights'

export function blankInsightFilters(): InsightFilters {
  return { search: '', area: '', state: '', active: '', trap: '', from: '', to: '' }
}
export function evidenceKey(photo: EvidenceReference): string {
  return `${photo.kind}:${photo.recordId}:${photo.index}`
}
export function conditionLabel(state: DeviceState): string {
  return { ACTIVO: 'Operativo', DANADO: 'Dañado', FUERA_DE_USO: 'Fuera de uso' }[state]
}
export function conditionTone(state: DeviceState): 'success' | 'danger' | 'neutral' {
  return state === 'DANADO' ? 'danger' : state === 'ACTIVO' ? 'success' : 'neutral'
}
export function findingLabel(state: FindingState): string {
  return { ABIERTO: 'Abierto', EN_PROCESO: 'En proceso', CERRADO: 'Cerrado' }[state]
}
export function findingTone(state: FindingState): 'warning' | 'info' | 'success' {
  return state === 'CERRADO' ? 'success' : state === 'EN_PROCESO' ? 'info' : 'warning'
}
const dateFormat = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })
export function insightDate(value: string | null, withTime = false): string {
  if (!value) return 'Sin registrar'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Sin registrar' : (withTime ? dateTimeFormat : dateFormat).format(date)
}

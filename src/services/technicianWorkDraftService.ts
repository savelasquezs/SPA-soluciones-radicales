import { isServiceId } from '@/helpers/adminServices'
import { offlineDatabase } from '@/services/offlineDatabase'

// Borradores que todavía no admiten una operación remota (p. ej., una observación sin C/CP/NC/NA).
function key(actorId: string, serviceId: string, areaId: string, kind: string, itemId: string): string {
  if (![actorId, serviceId, areaId, itemId].every(isServiceId)) throw new Error('El contexto del borrador no es válido.')
  return `technician-work:${actorId}:${serviceId}:${areaId}:${kind}:${itemId}`
}

export async function loadCriterionNotes(actorId: string, serviceId: string, areaId: string, ids: string[]): Promise<Record<string, string>> {
  const db = await offlineDatabase
  const values = await Promise.all(ids.map(async id => {
    const value = await db.get('drafts', key(actorId, serviceId, areaId, 'criterion', id)) as { note?: string } | undefined
    return [id, typeof value?.note === 'string' ? value.note : ''] as const
  }))
  return Object.fromEntries(values.filter(([, note]) => note))
}

export async function saveCriterionNote(actorId: string, serviceId: string, areaId: string, id: string, note: string): Promise<void> {
  const db = await offlineDatabase
  const storageKey = key(actorId, serviceId, areaId, 'criterion', id)
  if (!note) await db.delete('drafts', storageKey)
  else await db.put('drafts', { note: note.slice(0, 2_000) }, storageKey)
}

export interface AreaAccessDraft { description: string; photos: File[] }
export async function loadAreaAccessDraft(actorId: string, serviceId: string, areaId: string): Promise<AreaAccessDraft | null> {
  const value = await (await offlineDatabase).get('drafts', key(actorId, serviceId, areaId, 'access', areaId)) as AreaAccessDraft | undefined
  if (!value || typeof value.description !== 'string' || !Array.isArray(value.photos)) return null
  return value
}
export async function saveAreaAccessDraft(actorId: string, serviceId: string, areaId: string, draft: AreaAccessDraft): Promise<void> {
  await (await offlineDatabase).put('drafts', { description: draft.description.slice(0, 2_000), photos: draft.photos.slice(0, 5) },
    key(actorId, serviceId, areaId, 'access', areaId))
}
export async function clearAreaAccessDraft(actorId: string, serviceId: string, areaId: string): Promise<void> {
  await (await offlineDatabase).delete('drafts', key(actorId, serviceId, areaId, 'access', areaId))
}

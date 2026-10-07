import { isServiceId } from '@/helpers/adminServices'
import { offlineDatabase } from '@/services/offlineDatabase'
import type { TechnicianAreaOrderMutation } from '@/types/technicianServices'

function mutationKey(value: Pick<TechnicianAreaOrderMutation, 'actorId' | 'serviceId' | 'requestId'>): string {
  if (![value.actorId, value.serviceId, value.requestId].every(isServiceId)) throw new Error('La operación local no es válida.')
  return `technician-mutation:${value.actorId}:${value.serviceId}:${value.requestId}`
}

function validVersions(value: unknown): boolean {
  return Array.isArray(value)
    && value.length <= 500
    && new Set(value.map(item => item?.id)).size === value.length
    && value.every(item => item && typeof item === 'object' && isServiceId(item.id) && Number.isSafeInteger(item.version) && item.version > 0)
}

function validMutation(value: unknown, actorId?: string, serviceId?: string): value is TechnicianAreaOrderMutation {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<TechnicianAreaOrderMutation>
  return record.schemaVersion === 1
    && record.kind === 'AREA_ORDER'
    && isServiceId(record.requestId)
    && isServiceId(record.actorId)
    && isServiceId(record.serviceId)
    && isServiceId(record.deviceId)
    && isServiceId(record.lockToken)
    && (!actorId || record.actorId === actorId)
    && (!serviceId || record.serviceId === serviceId)
    && Array.isArray(record.areaIds)
    && record.areaIds.length <= 500
    && new Set(record.areaIds).size === record.areaIds.length
    && record.areaIds.every(isServiceId)
    && validVersions(record.versions)
    && ['PENDING', 'SENDING', 'CONFLICT'].includes(record.status ?? '')
    && (record.conflict === null || (
      record.conflict !== undefined
      && Array.isArray(record.conflict.areaIds)
      && record.conflict.areaIds.length <= 500
      && new Set(record.conflict.areaIds).size === record.conflict.areaIds.length
      && record.conflict.areaIds.every(isServiceId)
      && validVersions(record.conflict.versions)
    ))
}

export async function listTechnicianMutations(actorId: string, serviceId?: string): Promise<TechnicianAreaOrderMutation[]> {
  if (!isServiceId(actorId) || (serviceId && !isServiceId(serviceId))) return []
  const values = await (await offlineDatabase).getAll('technicianMutations')
  return values
    .filter(value => validMutation(value, actorId, serviceId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function saveTechnicianMutation(value: TechnicianAreaOrderMutation): Promise<void> {
  if (!validMutation(value)) throw new Error('La operación local no es válida.')
  const plain = JSON.parse(JSON.stringify(value)) as TechnicianAreaOrderMutation
  if (JSON.stringify(plain).length > 100_000) throw new Error('La operación local supera el tamaño permitido.')
  await (await offlineDatabase).put('technicianMutations', plain, mutationKey(plain))
}

export async function deleteTechnicianMutation(value: Pick<TechnicianAreaOrderMutation, 'actorId' | 'serviceId' | 'requestId'>): Promise<void> {
  await (await offlineDatabase).delete('technicianMutations', mutationKey(value))
}

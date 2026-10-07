import { isServiceId } from '@/helpers/adminServices'
import { offlineDatabase } from '@/services/offlineDatabase'
import type { TechnicianMutation } from '@/types/technicianServices'

function mutationKey(value: Pick<TechnicianMutation, 'actorId' | 'serviceId' | 'requestId'>): string {
  if (![value.actorId, value.serviceId, value.requestId].every(isServiceId)) throw new Error('La operación local no es válida.')
  return `technician-mutation:${value.actorId}:${value.serviceId}:${value.requestId}`
}

function validVersions(value: unknown): boolean {
  return Array.isArray(value)
    && value.length <= 500
    && new Set(value.map(item => item?.id)).size === value.length
    && value.every(item => item && typeof item === 'object' && isServiceId(item.id) && Number.isSafeInteger(item.version) && item.version > 0)
}

function validMutation(value: unknown, actorId?: string, serviceId?: string): value is TechnicianMutation {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<TechnicianMutation>
  const common = record.schemaVersion === 1
    && isServiceId(record.requestId)
    && isServiceId(record.actorId)
    && isServiceId(record.serviceId)
    && isServiceId(record.deviceId)
    && isServiceId(record.lockToken)
    && (!actorId || record.actorId === actorId)
    && (!serviceId || record.serviceId === serviceId)
    && ['PENDING', 'SENDING', 'CONFLICT'].includes(record.status ?? '')
    && typeof record.error !== 'undefined'
  if (!common) return false
  if (record.kind === 'AREA_ORDER') return Array.isArray(record.areaIds)
    && record.areaIds.length <= 500
    && new Set(record.areaIds).size === record.areaIds.length
    && record.areaIds.every(isServiceId)
    && validVersions(record.versions)
    && (record.conflict === null || (
      Boolean(record.conflict)
      && Array.isArray(record.conflict?.areaIds)
      && record.conflict.areaIds.length <= 500
      && new Set(record.conflict.areaIds).size === record.conflict.areaIds.length
      && record.conflict.areaIds.every(isServiceId)
      && validVersions(record.conflict.versions)
    ))
  if (record.kind === 'CRITERION_EVALUATION') return isServiceId(record.areaId)
    && isServiceId(record.criterionId)
    && ['C', 'CP', 'NC', 'NA'].includes(record.evaluation ?? '')
    && typeof record.observation === 'string'
    && record.observation.length <= 2_000
    && Number.isSafeInteger(record.version)
    && Number(record.version) > 0
    && (record.conflict === null || (
      Boolean(record.conflict)
      && isServiceId(record.conflict?.id)
      && typeof record.conflict?.version === 'number'
    ))
  if (record.kind === 'AREA_ACCESS') return isServiceId(record.areaId)
    && typeof record.withoutAccess === 'boolean'
    && typeof record.description === 'string'
    && record.description.length <= 2_000
    && (record.photoMediaId === null || isServiceId(record.photoMediaId))
    && (record.photoStoragePath === null || typeof record.photoStoragePath === 'string')
    && Number.isSafeInteger(record.version)
    && Number(record.version) > 0
    && (record.conflict === null || (
      Boolean(record.conflict)
      && isServiceId(record.conflict?.id)
      && typeof record.conflict?.sinAcceso === 'boolean'
      && typeof record.conflict?.version === 'number'
    ))
  return false
}

export async function listTechnicianMutations(actorId: string, serviceId?: string): Promise<TechnicianMutation[]> {
  if (!isServiceId(actorId) || (serviceId && !isServiceId(serviceId))) return []
  const values = await (await offlineDatabase).getAll('technicianMutations')
  return values
    .filter(value => validMutation(value, actorId, serviceId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function saveTechnicianMutation(value: TechnicianMutation): Promise<void> {
  if (!validMutation(value)) throw new Error('La operación local no es válida.')
  const plain = JSON.parse(JSON.stringify(value)) as TechnicianMutation
  if (JSON.stringify(plain).length > 100_000) throw new Error('La operación local supera el tamaño permitido.')
  await (await offlineDatabase).put('technicianMutations', plain, mutationKey(plain))
}

export async function deleteTechnicianMutation(value: Pick<TechnicianMutation, 'actorId' | 'serviceId' | 'requestId'>): Promise<void> {
  await (await offlineDatabase).delete('technicianMutations', mutationKey(value))
}

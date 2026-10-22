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

function validFindingEvidences(value: unknown): boolean {
  return Array.isArray(value)
    && value.length <= 10
    && new Set(value.map(item => item?.mediaId)).size === value.length
    && value.every(item => item && typeof item === 'object' && isServiceId(item.mediaId)
      && (item.storagePath === null || typeof item.storagePath === 'string'))
}

function validCriterionEvidences(value: unknown): boolean {
  return Array.isArray(value)
    && value.length <= 5
    && new Set(value.map(item => item?.mediaId)).size === value.length
    && value.every(item => item && typeof item === 'object' && isServiceId(item.mediaId)
      && (item.storagePath === null || typeof item.storagePath === 'string'))
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
  if (record.kind === 'AREA_CREATE') return isServiceId(record.areaId)
    && isServiceId(record.serviceAreaId)
    && typeof record.nombre === 'string'
    && record.nombre.trim().length > 0 && record.nombre.length <= 150
    && typeof record.esExterna === 'boolean'
    && Array.isArray(record.criteria)
    && record.criteria.length > 0 && record.criteria.length <= 500
    && new Set(record.criteria.map(item => item.id)).size === record.criteria.length
    && new Set(record.criteria.map(item => item.criterioId)).size === record.criteria.length
    && record.criteria.every(item => isServiceId(item.id) && isServiceId(item.criterioId))
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
    && Array.isArray(record.evidences)
    && validCriterionEvidences(record.evidences)
    && Array.isArray(record.retainedEvidenceStoragePaths)
    && record.retainedEvidenceStoragePaths.length <= 5
    && record.retainedEvidenceStoragePaths.length + record.evidences.length <= 5
    && new Set(record.retainedEvidenceStoragePaths).size === record.retainedEvidenceStoragePaths.length
    && record.retainedEvidenceStoragePaths.every(path => typeof path === 'string')
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
  if (record.kind === 'DEVICE_CREATE') return isServiceId(record.areaId)
    && isServiceId(record.permanentDeviceId)
    && isServiceId(record.serviceDeviceId)
    && typeof record.numero === 'string' && record.numero.trim().length > 0 && record.numero.length <= 100
    && typeof record.tipoCodigo === 'string' && record.tipoCodigo.trim().length > 0 && record.tipoCodigo.length <= 160
    && typeof record.ubicacion === 'string' && record.ubicacion.trim().length > 0 && record.ubicacion.length <= 500
  if (record.kind === 'FINDING_CREATE') return isServiceId(record.areaId)
    && isServiceId(record.findingId)
    && typeof record.descripcion === 'string' && record.descripcion.trim().length > 0 && record.descripcion.length <= 2_000
    && typeof record.recomendacionAccion === 'string' && record.recomendacionAccion.trim().length > 0 && record.recomendacionAccion.length <= 2_000
    && validFindingEvidences(record.evidences)
  if (record.kind === 'FINDING_STATUS') return isServiceId(record.areaId)
    && isServiceId(record.findingId)
    && ['SIN_CAMBIOS', 'EN_PROCESO', 'CERRADO'].includes(record.estado ?? '')
    && typeof record.observacionCierre === 'string' && record.observacionCierre.length <= 2_000
    && Number.isSafeInteger(record.version) && Number(record.version) > 0
    && validFindingEvidences(record.evidences)
    && (record.conflict === null || (Boolean(record.conflict) && isServiceId(record.conflict?.id)
      && typeof record.conflict?.version === 'number'))
  if (record.kind === 'VEHICLE_CREATE') return isServiceId(record.vehicleId)
    && typeof record.placa === 'string' && /^[A-Z0-9-]{3,12}$/.test(record.placa)
  if (record.kind === 'VEHICLE_SELECTION') return Array.isArray(record.selectedIds)
    && record.selectedIds.length <= 2000
    && new Set(record.selectedIds).size === record.selectedIds.length
    && record.selectedIds.every(isServiceId)
  if (record.kind === 'SERVICE_FINALIZE') return isServiceId(record.technicianMediaId)
    && isServiceId(record.clientMediaId)
    && (record.technicianStoragePath === null || typeof record.technicianStoragePath === 'string')
    && (record.clientStoragePath === null || typeof record.clientStoragePath === 'string')
    && typeof record.clientName === 'string' && record.clientName.trim().length > 0 && record.clientName.length <= 200
  if (record.kind === 'DEVICE_REVIEW') return isServiceId(record.areaId)
    && isServiceId(record.serviceDeviceId)
    && isServiceId(record.reviewId)
    && ['ACTIVO', 'DANADO', 'FUERA_DE_USO'].includes(record.estadoObservado ?? '')
    && Array.isArray(record.capturas)
    && record.capturas.length <= 200
    && new Set(record.capturas.map(capture => capture.plagaCodigo)).size === record.capturas.length
    && record.capturas.every(capture => typeof capture.plagaCodigo === 'string' && capture.plagaCodigo.length > 0
      && capture.plagaCodigo.length <= 160 && Number.isSafeInteger(capture.cantidad) && capture.cantidad > 0 && capture.cantidad <= 1_000_000)
    && typeof record.consumo === 'string' && record.consumo.length <= 500
    && typeof record.productoQuimico === 'string' && record.productoQuimico.length <= 500
    && typeof record.antidoto === 'string' && record.antidoto.length <= 500
    && typeof record.observaciones === 'string' && record.observaciones.length <= 2_000
    && (record.photoMediaId === null || isServiceId(record.photoMediaId))
    && (record.photoStoragePath === null || typeof record.photoStoragePath === 'string')
    && Number.isSafeInteger(record.version)
    && Number(record.version) >= 0
    && (record.conflict === null || (
      Boolean(record.conflict)
      && isServiceId(record.conflict?.id)
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

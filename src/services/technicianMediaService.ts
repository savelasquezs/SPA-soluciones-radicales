import { isServiceId } from '@/helpers/adminServices'
import { offlineDatabase } from '@/services/offlineDatabase'
import type { TechnicianMediaDraft } from '@/types/technicianServices'
import { MAX_OPTIMIZATION_SOURCE_BYTES } from '@/types/fileOptimization'

type TechnicianMediaInput = Omit<TechnicianMediaDraft, 'fileName' | 'contentType' | 'size' | 'lastModified' | 'bytes'> & { file: File }
type TechnicianMediaFile = Omit<TechnicianMediaDraft, 'bytes'> & { file: File }

function mediaKey(actorId: string, mediaId: string): string {
  if (!isServiceId(actorId) || !isServiceId(mediaId)) throw new Error('La fotografía local no es válida.')
  return `technician-media:${actorId}:${mediaId}`
}

function validMedia(value: unknown, actorId?: string, mediaId?: string): value is TechnicianMediaDraft {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<TechnicianMediaDraft>
  return record.schemaVersion === 1
    && isServiceId(record.id)
    && isServiceId(record.actorId)
    && isServiceId(record.serviceId)
    && isServiceId(record.areaId)
    && (record.serviceDeviceId === undefined || isServiceId(record.serviceDeviceId))
    && (!actorId || record.actorId === actorId)
    && (!mediaId || record.id === mediaId)
    && typeof record.fileName === 'string'
    && typeof record.contentType === 'string'
    && typeof record.size === 'number'
    && record.size > 0
    && record.size <= MAX_OPTIMIZATION_SOURCE_BYTES
    && typeof record.lastModified === 'number'
    && record.bytes instanceof ArrayBuffer
    && record.bytes.byteLength === record.size
    && typeof record.savedAt === 'string'
}

export async function saveTechnicianMedia(value: TechnicianMediaInput): Promise<void> {
  if (!(value.file instanceof File) || value.file.size <= 0 || value.file.size > MAX_OPTIMIZATION_SOURCE_BYTES) throw new Error('La fotografía local no es válida.')
  const stored: TechnicianMediaDraft = {
    schemaVersion: value.schemaVersion,
    id: value.id,
    actorId: value.actorId,
    serviceId: value.serviceId,
    areaId: value.areaId,
    ...(value.serviceDeviceId ? { serviceDeviceId: value.serviceDeviceId } : {}),
    fileName: value.file.name,
    contentType: value.file.type,
    size: value.file.size,
    lastModified: value.file.lastModified,
    bytes: await value.file.arrayBuffer(),
    savedAt: value.savedAt,
  }
  if (!validMedia(stored)) throw new Error('La fotografía local no es válida.')
  await (await offlineDatabase).put('technicianMedia', stored, mediaKey(stored.actorId, stored.id))
}

export async function loadTechnicianMedia(actorId: string, mediaId: string): Promise<TechnicianMediaFile | null> {
  const value = await (await offlineDatabase).get('technicianMedia', mediaKey(actorId, mediaId))
  if (!validMedia(value, actorId, mediaId)) return null
  const { bytes, ...metadata } = value
  return { ...metadata, file: new File([bytes], value.fileName, { type: value.contentType, lastModified: value.lastModified }) }
}

export async function deleteTechnicianMedia(actorId: string, mediaId: string): Promise<void> {
  await (await offlineDatabase).delete('technicianMedia', mediaKey(actorId, mediaId))
}

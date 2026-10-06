import { apiRequest } from '@/services/apiService'
import type { MipCatalogKind, MipItemInput, MipOptions, MipProductInput, MipRecordByKind } from '@/types/mipCatalogs'

const root = 'api/mip'
export function listMipCatalog<K extends MipCatalogKind>(kind: K, active: boolean): Promise<MipRecordByKind[K][]> {
  return apiRequest(`${root}/${kind}?active=${active}`)
}
export function getMipOptions(): Promise<MipOptions> { return apiRequest(`${root}/options`) }
/** Only for direct entry or explicit conflict recovery, never to open Edit from a loaded list. */
export function getMipRecord<K extends MipCatalogKind>(kind: K, id: string): Promise<MipRecordByKind[K]> {
  return apiRequest(`${root}/${kind}/${encodeURIComponent(id)}`)
}
export function saveMipRecord<K extends MipCatalogKind>(kind: K, input: MipProductInput | MipItemInput, record?: { id: string; version: number }): Promise<MipRecordByKind[K]> {
  return apiRequest(`${root}/${kind}${record ? `/${encodeURIComponent(record.id)}` : ''}`, {
    method: record ? 'PATCH' : 'POST',
    body: JSON.stringify({ ...input, ...(record ? { version: record.version } : {}) }),
  })
}
export function setMipRecordActive<K extends MipCatalogKind>(kind: K, record: { id: string; version: number }, active: boolean): Promise<MipRecordByKind[K]> {
  return apiRequest(`${root}/${kind}/${encodeURIComponent(record.id)}/state`, {
    method: 'PATCH', body: JSON.stringify({ activo: active, version: record.version }),
  })
}
export function deleteMipRecord(kind: MipCatalogKind, record: { id: string; version: number }): Promise<void> {
  return apiRequest(`${root}/${kind}/${encodeURIComponent(record.id)}`, { method: 'DELETE', body: JSON.stringify({ version: record.version }) })
}

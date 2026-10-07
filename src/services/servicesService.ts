import { apiRequest } from '@/services/apiService'
import type { TechnicianAreaOrderResult, TechnicianAreaOrderVersion, TechnicianExecutionSession, TechnicianServicePackage, TechnicianServiceSummary } from '@/types/technicianServices'

const base = 'api/technician/services'
const json = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) })

export const fetchTechnicianServices = (signal?: AbortSignal) => apiRequest<TechnicianServiceSummary[]>(base, { signal })
export const fetchTechnicianPackage = (serviceId: string) => apiRequest<TechnicianServicePackage>(`${base}/${serviceId}/package`)
export const startTechnicianService = (serviceId: string, requestId: string, deviceId: string, version: number) =>
  apiRequest<TechnicianExecutionSession>(`${base}/${serviceId}/start`, json({ requestId, deviceId, version }))
export const claimTechnicianService = (serviceId: string, requestId: string, deviceId: string) =>
  apiRequest<TechnicianExecutionSession>(`${base}/${serviceId}/claim`, json({ requestId, deviceId }))
export const saveTechnicianAreaOrder = (serviceId: string, requestId: string, deviceId: string, lockToken: string, areaIds: string[], versions: TechnicianAreaOrderVersion[]) =>
  apiRequest<TechnicianAreaOrderResult>(`${base}/${serviceId}/areas/order`, json({ requestId, deviceId, lockToken, areaIds, versions }))

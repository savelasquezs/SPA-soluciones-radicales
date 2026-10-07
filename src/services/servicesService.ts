import { apiRequest } from '@/services/apiService'
import type { MipEvaluation, TechnicianAreaAccessResult, TechnicianAreaOrderResult, TechnicianAreaOrderVersion, TechnicianCriterionEvaluationResult, TechnicianDeviceReviewInput, TechnicianDeviceReviewResult, TechnicianExecutionSession, TechnicianServicePackage, TechnicianServiceSummary } from '@/types/technicianServices'

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
export const saveTechnicianCriterionEvaluation = (serviceId: string, requestId: string, deviceId: string, lockToken: string, criterionId: string, version: number, evaluation: MipEvaluation, observation: string) =>
  apiRequest<TechnicianCriterionEvaluationResult>(`${base}/${serviceId}/criteria/${criterionId}`, json({ requestId, deviceId, lockToken, version, evaluation, observation }))
export const saveTechnicianAreaAccess = (serviceId: string, areaId: string, requestId: string, deviceId: string, lockToken: string, version: number, withoutAccess: boolean, description: string, photoStoragePath: string | null) =>
  apiRequest<TechnicianAreaAccessResult>(`${base}/${serviceId}/areas/${areaId}/access`, json({ requestId, deviceId, lockToken, version, withoutAccess, description, photoStoragePath }))
export const saveTechnicianDeviceReview = (serviceId: string, serviceDeviceId: string, requestId: string, deviceId: string, lockToken: string, reviewId: string, version: number, input: TechnicianDeviceReviewInput, photoStoragePath: string | null) =>
  apiRequest<TechnicianDeviceReviewResult>(`${base}/${serviceId}/devices/${serviceDeviceId}/review`, json({ requestId, deviceId, lockToken, reviewId, version, ...input, photoStoragePath }))

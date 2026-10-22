import { apiRequest } from '@/services/apiService'
import type { MipEvaluation, TechnicianAreaAccessResult, TechnicianAreaOrderResult, TechnicianAreaOrderVersion, TechnicianSiteAreaCreationInput, TechnicianSiteAreaCreationResult, TechnicianCriterionEvaluationResult, TechnicianDeviceCreationInput, TechnicianDeviceCreationResult, TechnicianDeviceReviewInput, TechnicianDeviceReviewResult, TechnicianExecutionSession, TechnicianFindingCreateInput, TechnicianFindingResult, TechnicianFindingStatusInput, TechnicianServicePackage, TechnicianServiceSummary, TechnicianHistoryPage } from '@/types/technicianServices'

const base = 'api/technician/services'
const json = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) })

export const fetchTechnicianServices = (signal?: AbortSignal) => apiRequest<TechnicianServiceSummary[]>(base, { signal })
export function fetchTechnicianHistory(
  filter: {page:number;q?:string;from?:string;to?:string},signal?:AbortSignal,
):Promise<TechnicianHistoryPage> {
  const params=new URLSearchParams({page:String(filter.page)})
  if(filter.q)params.set('q',filter.q)
  if(filter.from&&filter.to){params.set('from',filter.from);params.set('to',filter.to)}
  return apiRequest<TechnicianHistoryPage>(base+'/history?'+params.toString(),{signal})
}
export function fetchTechnicianAgenda(from:string,to:string,signal?:AbortSignal):Promise<TechnicianServiceSummary[]> {
  const params=new URLSearchParams({from,to})
  return apiRequest<TechnicianServiceSummary[]>(base+'/agenda?'+params.toString(),{signal})
}
/** Assigned main and reinforcement visits, without granting editing rights. */
export const fetchTechnicianServiceContact = (serviceId: string) =>
  apiRequest<TechnicianServiceSummary>(`${base}/${encodeURIComponent(serviceId)}/contact`)
export const fetchTechnicianPackage = (serviceId: string) => apiRequest<TechnicianServicePackage>(`${base}/${serviceId}/package`)
export const startTechnicianService = (serviceId: string, requestId: string, deviceId: string, version: number) =>
  apiRequest<TechnicianExecutionSession>(`${base}/${serviceId}/start`, json({ requestId, deviceId, version }))
export const claimTechnicianService = (serviceId: string, requestId: string, deviceId: string) =>
  apiRequest<TechnicianExecutionSession>(`${base}/${serviceId}/claim`, json({ requestId, deviceId }))
export const createTechnicianSiteArea = (
  serviceId: string, requestId: string, deviceId: string, lockToken: string,
  areaId: string, serviceAreaId: string, input: TechnicianSiteAreaCreationInput,
  criteria: Array<{ id: string; criterioId: string }>,
) => apiRequest<TechnicianSiteAreaCreationResult>(`${base}/${serviceId}/areas`,
  json({ requestId, deviceId, lockToken, areaId, serviceAreaId, ...input, criteria }))
export const saveTechnicianAreaOrder = (serviceId: string, requestId: string, deviceId: string, lockToken: string, areaIds: string[], versions: TechnicianAreaOrderVersion[]) =>
  apiRequest<TechnicianAreaOrderResult>(`${base}/${serviceId}/areas/order`, json({ requestId, deviceId, lockToken, areaIds, versions }))
export const saveTechnicianCriterionEvaluation = (serviceId: string, requestId: string, deviceId: string, lockToken: string, criterionId: string, version: number, evaluation: MipEvaluation, observation: string, evidenceStoragePaths: string[]) =>
  apiRequest<TechnicianCriterionEvaluationResult>(`${base}/${serviceId}/criteria/${criterionId}`, json({ requestId, deviceId, lockToken, version, evaluation, observation, evidenceStoragePaths }))
export const saveTechnicianAreaAccess = (serviceId: string, areaId: string, requestId: string, deviceId: string, lockToken: string, version: number, withoutAccess: boolean, description: string, photoStoragePath: string | null, photoStoragePaths: string[] = photoStoragePath ? [photoStoragePath] : []) =>
  apiRequest<TechnicianAreaAccessResult>(`${base}/${serviceId}/areas/${areaId}/access`, json({ requestId, deviceId, lockToken, version, withoutAccess, description, photoStoragePath, photoStoragePaths }))
export const createTechnicianDevice = (serviceId: string, areaId: string, requestId: string, deviceId: string, lockToken: string,
  permanentDeviceId: string, serviceDeviceId: string, input: TechnicianDeviceCreationInput) =>
  apiRequest<TechnicianDeviceCreationResult>(`${base}/${serviceId}/areas/${areaId}/devices`,
    json({ requestId, deviceId, lockToken, permanentDeviceId, serviceDeviceId, ...input }))
export const createTechnicianFinding = (serviceId: string, areaId: string, requestId: string, deviceId: string, lockToken: string,
  findingId: string, input: TechnicianFindingCreateInput, evidenceStoragePaths: string[]) =>
  apiRequest<TechnicianFindingResult>(`${base}/${serviceId}/areas/${areaId}/findings`,
    json({ requestId, deviceId, lockToken, findingId, ...input, evidenceStoragePaths }))
export const saveTechnicianFindingStatus = (serviceId: string, areaId: string, findingId: string, requestId: string,
  deviceId: string, lockToken: string, version: number, input: TechnicianFindingStatusInput, evidenceStoragePaths: string[]) =>
  apiRequest<TechnicianFindingResult>(`${base}/${serviceId}/areas/${areaId}/findings/${findingId}/status`,
    json({ requestId, deviceId, lockToken, version, ...input, evidenceStoragePaths }))
export const saveTechnicianDeviceReview = (serviceId: string, serviceDeviceId: string, requestId: string, deviceId: string, lockToken: string, reviewId: string, version: number, input: TechnicianDeviceReviewInput, photoStoragePath: string | null) =>
  apiRequest<TechnicianDeviceReviewResult>(`${base}/${serviceId}/devices/${serviceDeviceId}/review`, json({ requestId, deviceId, lockToken, reviewId, version, ...input, photoStoragePath }))
export const finalizeTechnicianService = (serviceId: string, requestId: string, deviceId: string, lockToken: string,
  technicianStoragePath: string, clientStoragePath: string, clientName: string) =>
  apiRequest<{ package: TechnicianServicePackage }>(`${base}/${serviceId}/finalize`,
    json({ requestId, deviceId, lockToken, technicianStoragePath, clientStoragePath, clientName }))

export const technicianProductSheetUrl=async(serviceId:string,appliedProductId:string):Promise<string> =>
  (await apiRequest<{url:string}>(base+'/'+encodeURIComponent(serviceId)+'/products/'+encodeURIComponent(appliedProductId)+'/technical-sheet')).url

export function getTechnicianEvidenceAccess(serviceId: string, reference: import('@/types/siteInsights').EvidenceReference, signal?: AbortSignal): Promise<import('@/types/siteInsights').EvidenceAccess> {
  return apiRequest(`${base}/${encodeURIComponent(serviceId)}/photos/${reference.kind}/${encodeURIComponent(reference.recordId)}/${reference.index}`, { signal })
}

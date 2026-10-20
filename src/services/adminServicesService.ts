import { apiRequest } from '@/services/apiService'
import type { AdminService, ConfirmationEmail, PagedResult, ServiceFilter, ServiceInput, ServiceMutation, ServicePaymentInput, ServiceReassignment, ServiceSchedule, ServiceWorkspace, UpcomingFilter, UpcomingPatch, UpcomingService } from '@/types/adminServices'

const base = 'api/admin/services'
function query(value: ServiceFilter | UpcomingFilter): string {
  const params = new URLSearchParams()
  for (const [key,item] of Object.entries(value)) if (item != null && item !== '') params.set(key,String(item))
  return params.toString()
}
function json(method: string, value: unknown): RequestInit { return { method,body:JSON.stringify(value) } }
export const fetchServiceWorkspace = () => apiRequest<ServiceWorkspace>(`${base}/workspace`)
export const fetchAdminServices = (filter: ServiceFilter, signal?: AbortSignal) => apiRequest<PagedResult<AdminService>>(`${base}?${query(filter)}`,{ signal })
/** A missing deployment rejects this route rather than returning unscoped results. */
export const fetchContextServices = (filter: ServiceFilter, signal?: AbortSignal) => apiRequest<PagedResult<AdminService>>(`${base}/context?${query(filter)}`,{ signal })
export const fetchUpcomingServices = (filter: UpcomingFilter, signal?: AbortSignal) => apiRequest<PagedResult<UpcomingService>>(`${base}/upcoming?${query(filter)}`,{ signal })
export const fetchAdminService = (id: string) => apiRequest<AdminService>(`${base}/${id}`)
export const fetchUpcomingService = (id: string) => apiRequest<UpcomingService>(`${base}/upcoming/${id}`)
export const fetchServiceCommand = (requestId: string) => apiRequest<{ result: ServiceMutation | null }>(`${base}/commands/${requestId}`)
export const fetchPendingCount = () => apiRequest<{ count: number }>(`${base}/pending-count`)
export const createAdminService = (requestId: string, input: ServiceInput, reassignments:ServiceReassignment[] = [], upcoming?: { id: string; version: number; confirmed: boolean }) =>
  apiRequest<ServiceMutation>(base,json('POST',{ requestId,input,reassignments,upcoming }))
export const updateAdminService = (record: AdminService, requestId: string, input: ServiceInput, reassignments:ServiceReassignment[] = []) =>
  apiRequest<ServiceMutation>(`${base}/${record.id}`,json('PUT',{ requestId,version:record.version,reinforcementVersion:record.refuerzo?.version,input,reassignments }))
export const reprogramAdminService = (record: AdminService, requestId: string, programacion: ServiceSchedule, reassignments:ServiceReassignment[] = [], refuerzo?: ServiceSchedule) =>
  apiRequest<ServiceMutation>(`${base}/${record.id}/reschedule`,json('POST',{ requestId,version:record.version,programacion,reassignments,refuerzo:refuerzo && record.refuerzo ? { version:record.refuerzo.version,programacion:refuerzo } : undefined }))
export const cancelAdminService = (record: AdminService, requestId: string, reason: string) =>
  apiRequest<ServiceMutation>(`${base}/${record.id}/cancel`,json('POST',{ requestId,version:record.version,reason }))
export const saveServicePayment = (record: AdminService, requestId: string, input: ServicePaymentInput) =>
  apiRequest<ServiceMutation>(`${base}/${record.id}/payment`,json('POST',{ requestId,version:record.version,input }))
export const requestCalendarRetry = (id: string, requestId: string) =>
  apiRequest<ServiceMutation>(`${base}/${id}/calendar/retry`,json('POST',{ requestId }))
export const releaseServiceExecutionLock = (id: string, requestId: string, reason: string) =>
  apiRequest<{ serviceId: string; released: boolean }>(`${base}/${id}/execution-lock/release`,json('POST',{ requestId,reason }))
export const saveUpcomingFollowUp = (record: UpcomingService, requestId: string, input: UpcomingPatch) =>
  apiRequest<{ upcoming: UpcomingService; pendingCount: number }>(`${base}/upcoming/${record.id}`,json('PATCH',{ requestId,version:record.version,...input }))
export const previewConfirmationEmail = (id: string) =>
  apiRequest<{ upcoming: UpcomingService; email: ConfirmationEmail }>(`${base}/upcoming/${id}/email-preview`)
export const sendConfirmationEmail = (record: UpcomingService, requestId: string, recipient: string, reviewedUnknown = false, resend = false) =>
  apiRequest<{ upcoming: UpcomingService; pendingCount: number }>(`${base}/upcoming/${record.id}/email`,json('POST',{ requestId,version:record.version,recipient,reviewedUnknown,resend }))
export interface ServiceAuditEntry { id: string; fechaHora: string; usuarioNombre: string; accion: string; detalle: Record<string,unknown> | null }
export const fetchServiceAudit = (id: string, page = 1) =>
  apiRequest<{ items: ServiceAuditEntry[]; total: number; page: number; pageSize: number }>(`${base}/${id}/audit?page=${page}`)

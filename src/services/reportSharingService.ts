import { apiRequest, ApiClientError } from './apiService'
import type { ServiceResultsResponse } from '@/types/serviceResults'
import type { SendServiceReportInput, SendServiceReportResult, ServiceReportShareOptions } from '@/types/reportSharing'

const functionUrl = import.meta.env.VITE_NEON_FUNCTION_URL as string | undefined
const root = (id: string) => 'api/admin/services/' + encodeURIComponent(id) + '/report-sharing'
const json = (data: unknown): RequestInit => ({ method:'POST',body:JSON.stringify(data) })
export const getReportShareOptions = (id: string) => apiRequest<ServiceReportShareOptions>(root(id))
export const sendServiceReport = (id: string, data: SendServiceReportInput) =>
  apiRequest<SendServiceReportResult>(root(id) + '/send', json(data))
export const revokeServiceReportLinks = (id: string) =>
  apiRequest<{ revoked: number }>(root(id) + '/revoke', json({ confirm:true }))

async function publicRequest<T>(path: string, data: unknown): Promise<T> {
  if (!functionUrl) throw new ApiClientError('El informe no está disponible en este entorno.', 503)
  const base = functionUrl.endsWith('/') ? functionUrl : functionUrl + '/'
  const response = await fetch(new URL(path, base), {
    method:'POST',body:JSON.stringify(data),cache:'no-store',
    headers:{ 'Content-Type':'application/json' },referrerPolicy:'no-referrer',
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; code?: string } | null
    throw new ApiClientError(body?.error ?? 'El informe no está disponible.',response.status,body?.code)
  }
  return await response.json() as T
}
export const resolvePublicServiceReport = (token: string) =>
  publicRequest<ServiceResultsResponse>('api/public/reports/resolve',{ token })
export const publicReportPhotoUrl = async (token: string, mediaId: string): Promise<string> =>
  (await publicRequest<{ url: string }>('api/public/reports/media',{ token,mediaId })).url

const technicianRoot = (id: string) => 'api/technician/services/' + encodeURIComponent(id) + '/report-sharing'
export const getTechnicianReportShareOptions = (id: string) => apiRequest<ServiceReportShareOptions>(technicianRoot(id))
export const sendTechnicianServiceReport = (id: string, data: SendServiceReportInput) =>
  apiRequest<SendServiceReportResult>(technicianRoot(id) + '/send', json(data))

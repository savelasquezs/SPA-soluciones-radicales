import { apiBlobRequest, apiRequest } from './apiService'
import type { CertificateContext, CertificateGenerationResult, CertificateServiceOption, CertificateSettings, CertificateTemplate, CertificateType, GenerateCertificateInput, SendCertificatesInput } from '@/types/certificates'

const root = 'api/certificates'
const json = (body: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(body) })
export const getCertificateSettings = () => apiRequest<CertificateSettings>(`${root}/settings`)
export const saveCertificateTemplate = (type: CertificateType, storagePath: string, revision: string | null) =>
  apiRequest<CertificateTemplate>(`${root}/templates/${type}`, json({ storagePath, revision }, 'PUT'))
export const previewCertificate = (type: CertificateType, storagePath: string | null) =>
  apiBlobRequest(`${root}/preview`, json({ type, storagePath }))
export const listCertificateServices = (siteId: string, page = 1) =>
  apiRequest<{ items: CertificateServiceOption[]; page: number; hasMore: boolean }>(`${root}/services?siteId=${encodeURIComponent(siteId)}&page=${page}`)
export const getCertificateContext = (serviceId: string) => apiRequest<CertificateContext>(`${root}/services/${encodeURIComponent(serviceId)}/context`)
export const generateCertificates = (input: GenerateCertificateInput) => apiRequest<CertificateGenerationResult>(`${root}/generate`, json(input))
export const sendCertificates = (input: SendCertificatesInput) => apiRequest<{ sent: boolean; messageId: string }>(`${root}/send`, json(input))
export const getCertificateUrl = async (id: string, inline = false): Promise<string> =>
  (await apiRequest<{ url: string }>(`${root}/documents/${encodeURIComponent(id)}/read-url`, json({ inline }))).url

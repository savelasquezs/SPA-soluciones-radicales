import { apiRequest } from '@/services/apiService'
import type { AreaTemplateApplyResult, AreaTemplateInput, AreaTemplateRecord } from '@/types/domain'

type TemplateWire = Omit<AreaTemplateRecord, 'version'> & { version: number | string }
const normalize = (record: TemplateWire): AreaTemplateRecord => ({ ...record, version: Number(record.version) })

export async function listAreaTemplates(clientId?: string, active?: boolean): Promise<AreaTemplateRecord[]> {
  const params = new URLSearchParams()
  if (clientId) params.set('clientId', clientId)
  if (active !== undefined) params.set('active', String(active))
  const query = params.toString()
  const rows = await apiRequest<TemplateWire[]>(`api/area-templates${query ? `?${query}` : ''}`)
  return rows.map(normalize)
}

export async function createAreaTemplate(input: AreaTemplateInput): Promise<AreaTemplateRecord> {
  return normalize(await apiRequest<TemplateWire>('api/area-templates', {
    method: 'POST', body: JSON.stringify(input),
  }))
}

export async function updateAreaTemplate(id: string, input: AreaTemplateInput): Promise<AreaTemplateRecord> {
  return normalize(await apiRequest<TemplateWire>(`api/area-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(input),
  }))
}

export async function applyTemplateToSite(siteId: string, templateId: string): Promise<AreaTemplateApplyResult> {
  return apiRequest<AreaTemplateApplyResult>(`api/area-templates/sites/${encodeURIComponent(siteId)}/apply`, {
    method: 'POST', body: JSON.stringify({ templateId }),
  })
}

import { apiRequest } from '@/services/apiService'
import type { EvidenceAccess, EvidenceReference, InsightPage, InsightQuery, MonitoringPoint, MonitoringReview, SiteCollection, SiteFinding } from '@/types/siteInsights'

function queryString(query: InsightQuery): string {
  // An explicit empty state means "Todos"; omitting it would restore the server's default.
  return new URLSearchParams({ ...query, page: String(query.page) }).toString()
}
function sitePath(siteId: string): string { return `api/admin/sites/${encodeURIComponent(siteId)}` }
export function listMonitoringPoints(siteId: string, query: InsightQuery, signal?: AbortSignal): Promise<SiteCollection<MonitoringPoint>> {
  return apiRequest(`${sitePath(siteId)}/monitoring-points?${queryString(query)}`, { signal })
}
export async function listMonitoringReviews(siteId: string, pointId: string, query: InsightQuery, signal?: AbortSignal): Promise<SiteCollection<MonitoringReview>> {
  const result = await apiRequest<InsightPage<MonitoringReview>>(`${sitePath(siteId)}/monitoring-points/${encodeURIComponent(pointId)}/reviews?${queryString(query)}`, { signal })
  return { ...result, areas: [], traps: [] }
}
export function listSiteFindings(siteId: string, query: InsightQuery, signal?: AbortSignal): Promise<SiteCollection<SiteFinding>> {
  return apiRequest(`${sitePath(siteId)}/findings?${queryString(query)}`, { signal })
}
export function getEvidenceAccess(siteId: string, photo: EvidenceReference, signal?: AbortSignal): Promise<EvidenceAccess> {
  return apiRequest(`${sitePath(siteId)}/photos/${photo.kind}/${encodeURIComponent(photo.recordId)}/${photo.index}`, { signal })
}

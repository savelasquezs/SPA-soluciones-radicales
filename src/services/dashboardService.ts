import { apiRequest } from '@/services/apiService'
import type { DashboardPeriod, DashboardSnapshot } from '@/types/dashboard'

export function fetchDashboard(period: DashboardPeriod, clientId: string, siteId: string, signal?: AbortSignal): Promise<DashboardSnapshot> {
  const params=new URLSearchParams({period})
  if(clientId)params.set('clientId',clientId)
  if(siteId)params.set('siteId',siteId)
  return apiRequest<DashboardSnapshot>('api/admin/dashboard?'+params.toString(),{signal})
}

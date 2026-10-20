import { apiRequest } from '@/services/apiService'
import type { DashboardPeriod, DashboardSnapshot, DashboardDetailKind, DashboardDetailPage } from '@/types/dashboard'
import type { TechnicianDashboardSnapshot } from '@/types/technicianDashboard'

export interface DashboardQuery {
  period: DashboardPeriod
  clientId: string
  siteId: string
  from?: string
  to?: string
}
export function fetchDashboard(filter: DashboardQuery,signal?:AbortSignal):Promise<DashboardSnapshot>{
  const params=new URLSearchParams({period:filter.period})
  if(filter.clientId)params.set('clientId',filter.clientId)
  if(filter.siteId)params.set('siteId',filter.siteId)
  if(filter.period==='custom'){
    params.set('from',filter.from??'')
    params.set('to',filter.to??'')
  }
  return apiRequest<DashboardSnapshot>('api/admin/dashboard?'+params.toString(),{signal})
}
export function fetchDashboardDetails(kind:DashboardDetailKind,page:number,clientId:string,siteId:string,signal?:AbortSignal):Promise<DashboardDetailPage>{
  const params=new URLSearchParams({kind,page:String(page)})
  if(kind!=='certificates'){
    if(clientId)params.set('clientId',clientId)
    if(siteId)params.set('siteId',siteId)
  }
  return apiRequest<DashboardDetailPage>('api/admin/dashboard/details?'+params.toString(),{signal})
}

/** The authenticated technician is always resolved by the API, never by a caller-supplied ID. */
export function fetchTechnicianDashboard(
  period: DashboardPeriod,
  custom: { from: string; to: string } | null = null,
  signal?: AbortSignal,
): Promise<TechnicianDashboardSnapshot> {
  const params = new URLSearchParams({ period })
  if (period === 'custom') {
    params.set('from',custom?.from ?? '')
    params.set('to',custom?.to ?? '')
  }
  return apiRequest<TechnicianDashboardSnapshot>('api/technician/dashboard?'+params.toString(),{signal})
}

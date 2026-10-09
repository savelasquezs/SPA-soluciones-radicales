import { apiRequest } from './apiService'
import type { ServiceReportStatus, ServiceResultsResponse } from '@/types/serviceResults'

const base=(id:string)=>'api/admin/services/'+encodeURIComponent(id)
export const fetchServiceResults=(id:string)=>apiRequest<ServiceResultsResponse>(base(id)+'/results')
export const fetchServiceReport=(id:string)=>apiRequest<ServiceReportStatus>(base(id)+'/report')
export const queueServiceReport=(id:string)=>apiRequest<ServiceReportStatus>(base(id)+'/report/queue',{method:'POST',body:'{}'})
export const serviceEvidenceUrl=async(id:string,path:string):Promise<string>=>
  (await apiRequest<{url:string}>(base(id)+'/media/read-url?path='+encodeURIComponent(path))).url

import { apiRequest } from './apiService'
import type { ServiceResultsResponse } from '@/types/serviceResults'

const base=(id:string)=>'api/admin/services/'+encodeURIComponent(id)
export const fetchServiceResults=(id:string)=>apiRequest<ServiceResultsResponse>(base(id)+'/results')
export const serviceEvidenceUrl=async(id:string,path:string):Promise<string>=>
  (await apiRequest<{url:string}>(base(id)+'/media/read-url?path='+encodeURIComponent(path))).url

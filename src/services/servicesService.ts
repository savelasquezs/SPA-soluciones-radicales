import { apiRequest } from '@/services/apiService'
import type { ServiceRecord } from '@/types/domain'

/** Technician read model; administrative mutations use adminServicesService. */
export function listAssignedServices(): Promise<ServiceRecord[]> {
  return apiRequest<ServiceRecord[]>('api/services')
}

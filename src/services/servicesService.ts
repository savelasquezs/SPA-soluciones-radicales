import { apiRequest } from '@/services/apiService'
import type { ClientSite, ServiceDraft, ServiceRecord, Technician } from '@/types/domain'

type ClientSiteWire = Omit<ClientSite, 'valorServicio'> & { valorServicio: number | string }

export async function getServiceWorkspace(isAdmin: boolean): Promise<{
  clients: ClientSite[]
  technicians: Technician[]
  services: ServiceRecord[]
}> {
  if (!isAdmin) {
    return { clients: [], technicians: [], services: await listServices() }
  }
  const [clients, technicians, services] = await Promise.all([
    apiRequest<ClientSiteWire[]>('api/catalogs/client-sites'),
    apiRequest<Technician[]>('api/catalogs/technicians'),
    listServices(),
  ])
  return { clients: clients.map(normalizeClientSite), technicians, services }
}

export function createScheduledService(input: ServiceDraft): Promise<ServiceRecord> {
  return apiRequest<ServiceRecord>('api/services', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      inicioProgramado: new Date(input.inicioProgramado).toISOString(),
      duracionMinutos: Number(input.duracionMinutos),
    }),
  })
}

export function retryServiceCalendar(serviceId: string): Promise<ServiceRecord> {
  return apiRequest<ServiceRecord>(`api/services/${serviceId}/calendar/retry`, { method: 'POST' })
}

function listServices(): Promise<ServiceRecord[]> {
  return apiRequest<ServiceRecord[]>('api/services')
}

function normalizeClientSite(client: ClientSiteWire): ClientSite {
  return { ...client, valorServicio: Number(client.valorServicio) }
}

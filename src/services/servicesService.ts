import { apiRequest } from '@/services/apiService'
import type { ClientSite, ServiceDraft, ServiceRecord, Technician } from '@/types/domain'

type ClientSiteWire = Omit<ClientSite, 'valorServicio'> & { valorServicio: number | string }

export type ClientInput = {
  negocioId: string
  nit: string
  negocioNombre: string
  sedeNombre: string
  direccion: string
  contactoNombre: string
  contactoCorreo: string
  valorServicio: string
  periodicidadMeses: string
  manejaRefuerzo: boolean
  tipoSede: string
  duracionServicioMinutos: string
  correos: string[]
}

export async function getServiceWorkspace(isAdmin: boolean): Promise<{
  clients: ClientSite[]
  technicians: Technician[]
  services: ServiceRecord[]
}> {
  if (!isAdmin) {
    return { clients: [], technicians: [], services: await listServices() }
  }
  const [clients, technicians, services] = await Promise.all([
    apiRequest<ClientSiteWire[]>('api/clients'),
    apiRequest<Technician[]>('api/catalogs/technicians'),
    listServices(),
  ])
  return { clients: clients.map(normalizeClientSite), technicians, services }
}

export async function createClientSite(input: ClientInput): Promise<ClientSite> {
  const client = await apiRequest<ClientSiteWire>('api/clients', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      valorServicio: Number(input.valorServicio),
      periodicidadMeses: Number(input.periodicidadMeses),
      duracionServicioMinutos: Number(input.duracionServicioMinutos),
      correos: input.contactoCorreo ? [input.contactoCorreo] : [],
    }),
  })
  return normalizeClientSite(client)
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

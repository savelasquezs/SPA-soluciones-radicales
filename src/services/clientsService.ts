import { apiRequest } from '@/services/apiService'
import { normalizeEmails, normalizePhone } from '@/helpers/clients'
import type {
  AreaInput,
  AreaRecord,
  ClientInput,
  ClientRecord,
  SiteInput,
  SiteRecord,
  VehicleInput,
  VehicleRecord,
  VehicleCertificatePage,
} from '@/types/domain'

type ClientWire = Omit<ClientRecord, 'version' | 'sedesCount' | 'residenciaValorServicio'> & {
  version: number | string
  sedesCount: number | string
  residenciaValorServicio: number | string | null
}

type SiteWire = Omit<SiteRecord, 'valorServicio' | 'version' | 'areasCount'> & {
  valorServicio: number | string
  version: number | string
  areasCount: number | string
}

type AreaWire = Omit<AreaRecord, 'version' | 'dispositivosCount'> & {
  version: number | string
  dispositivosCount: number | string
}

export async function listClients(active: boolean): Promise<ClientRecord[]> {
  const clients = await apiRequest<ClientWire[]>(`api/clients?active=${active}`)
  return clients.map(normalizeClient)
}

export async function getClient(id: string): Promise<ClientRecord> {
  return normalizeClient(await apiRequest<ClientWire>(`api/clients/${id}`))
}

export async function createClient(input: ClientInput): Promise<ClientRecord> {
  return normalizeClient(await apiRequest<ClientWire>('api/clients', {
    method: 'POST',
    body: JSON.stringify(clientPayload(input)),
  }))
}

export async function updateClient(id: string, input: ClientInput): Promise<ClientRecord> {
  return normalizeClient(await apiRequest<ClientWire>(`api/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(clientPayload(input)),
  }))
}

export async function deleteClient(id: string, version: number): Promise<void> {
  await apiRequest(`api/clients/${id}?version=${version}`, { method: 'DELETE' })
}

export async function listSites(clientId: string): Promise<SiteRecord[]> {
  const sites = await apiRequest<SiteWire[]>(`api/clients/${clientId}/sites`)
  return sites.map(normalizeSite)
}

export async function getSite(id: string): Promise<SiteRecord> {
  return normalizeSite(await apiRequest<SiteWire>(`api/sites/${id}`))
}

export async function createSite(clientId: string, input: SiteInput): Promise<SiteRecord> {
  return normalizeSite(await apiRequest<SiteWire>(`api/clients/${clientId}/sites`, {
    method: 'POST',
    body: JSON.stringify(sitePayload(input)),
  }))
}

export async function updateSite(id: string, input: SiteInput): Promise<SiteRecord> {
  return normalizeSite(await apiRequest<SiteWire>(`api/sites/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(sitePayload(input)),
  }))
}

export async function deleteSite(id: string, version: number): Promise<void> {
  await apiRequest(`api/sites/${id}?version=${version}`, { method: 'DELETE' })
}

export async function listAreas(siteId: string): Promise<AreaRecord[]> {
  const areas = await apiRequest<AreaWire[]>(`api/sites/${siteId}/areas`)
  return areas.map(normalizeArea)
}

export async function createArea(siteId: string, input: AreaInput): Promise<AreaRecord> {
  return normalizeArea(await apiRequest<AreaWire>(`api/sites/${siteId}/areas`, {
    method: 'POST',
    body: JSON.stringify(areaPayload(input)),
  }))
}

export async function updateArea(id: string, input: AreaInput): Promise<AreaRecord> {
  return normalizeArea(await apiRequest<AreaWire>(`api/areas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(areaPayload(input)),
  }))
}

export async function deleteArea(id: string, version: number): Promise<void> {
  await apiRequest(`api/areas/${id}?version=${version}`, { method: 'DELETE' })
}

function clientPayload(input: ClientInput): ClientInput {
  const residentialPhone = input.tipoCliente === 'RESIDENCIAL'
    ? normalizePhone(input.residenciaCelular ?? '')
    : null
  return {
    ...input,
    nombre: input.nombre.trim(),
    nit: input.tipoCliente === 'NEGOCIO' ? input.nit?.trim() || null : null,
    correos: input.tipoCliente === 'NEGOCIO' ? normalizeEmails(input.correos) : [],
    residenciaCelular: residentialPhone,
    residenciaDireccion: input.tipoCliente === 'RESIDENCIAL' ? input.residenciaDireccion?.trim() || null : null,
    residenciaValorServicio: input.tipoCliente === 'RESIDENCIAL' ? input.residenciaValorServicio : null,
    vigenciaCertificadoMeses: input.tipoCliente === 'NEGOCIO' ? input.vigenciaCertificadoMeses : null,
  }
}

function sitePayload(input: SiteInput): SiteInput {
  return {
    ...input,
    nombre: input.nombre.trim(),
    direccion: input.direccion.trim(),
    correos: normalizeEmails(input.correos),
    contactoPrincipalNombre: input.contactoPrincipalNombre.trim(),
    contactoPrincipalCorreo: input.contactoPrincipalCorreo?.trim().toLocaleLowerCase('es-CO') || null,
    contactoPrincipalCelular: normalizePhone(input.contactoPrincipalCelular) ?? input.contactoPrincipalCelular.trim(),
  }
}

function areaPayload(input: AreaInput): AreaInput {
  return { ...input, nombre: input.nombre.trim() }
}

function normalizeClient(client: ClientWire): ClientRecord {
  return {
    ...client,
    version: Number(client.version),
    sedesCount: Number(client.sedesCount),
    residenciaValorServicio: client.residenciaValorServicio == null ? null : Number(client.residenciaValorServicio),
  }
}

function normalizeSite(site: SiteWire): SiteRecord {
  return {
    ...site,
    valorServicio: Number(site.valorServicio),
    version: Number(site.version),
    areasCount: Number(site.areasCount),
  }
}

function normalizeArea(area: AreaWire): AreaRecord {
  return { ...area, version: Number(area.version), dispositivosCount: Number(area.dispositivosCount) }
}

type VehicleWire = Omit<VehicleRecord, 'version'> & { version: number | string }
function normalizeVehicle(vehicle: VehicleWire): VehicleRecord {
  return { ...vehicle, version: Number(vehicle.version) }
}
export async function listVehicles(siteId: string): Promise<VehicleRecord[]> {
  const rows = await apiRequest<VehicleWire[]>(`api/sites/${encodeURIComponent(siteId)}/vehicles`)
  return rows.map(normalizeVehicle)
}
export async function createVehicle(siteId: string, input: VehicleInput): Promise<VehicleRecord> {
  return normalizeVehicle(await apiRequest<VehicleWire>(`api/sites/${encodeURIComponent(siteId)}/vehicles`, {
    method: 'POST', body: JSON.stringify({ placa: input.placa.trim().toUpperCase() }),
  }))
}
export async function updateVehicle(id: string, input: VehicleInput): Promise<VehicleRecord> {
  return normalizeVehicle(await apiRequest<VehicleWire>(`api/vehicles/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ ...input, placa: input.placa.trim().toUpperCase() }),
  }))
}
export async function deleteVehicle(id: string, version: number): Promise<void> {
  await apiRequest(`api/vehicles/${encodeURIComponent(id)}?version=${version}`, { method: 'DELETE' })
}
export async function listVehicleCertificates(siteId: string, vehicleId: string, page = 1): Promise<VehicleCertificatePage> {
  return apiRequest<VehicleCertificatePage>(
    `api/sites/${encodeURIComponent(siteId)}/vehicles/${encodeURIComponent(vehicleId)}/certificates?page=${page}`,
  )
}

import { apiRequest } from '@/services/apiService'
import { normalizeEmails, normalizePhone } from '@/helpers/clients'
import type {
  AreaInput,
  AreaRecord,
  ClientInput,
  ClientRecord,
  FormOption,
  PaginatedResult,
  ServiceHistoryItem,
  SiteInput,
  SiteRecord,
} from '@/types/domain'

type ClientWire = Omit<ClientRecord, 'version' | 'sedesCount'> & {
  version: number | string
  sedesCount: number | string
}

type SiteWire = Omit<SiteRecord, 'valorServicio' | 'version' | 'areasCount' | 'formulariosCount'> & {
  valorServicio: number | string
  version: number | string
  areasCount: number | string
  formulariosCount: number | string
}

type AreaWire = Omit<AreaRecord, 'version' | 'dispositivosCount'> & {
  version: number | string
  dispositivosCount: number | string
}

type HistoryWire = Omit<ServiceHistoryItem, 'valor'> & { valor: number | string }

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

export function listClientHistory(clientId: string, page = 1): Promise<PaginatedResult<ServiceHistoryItem>> {
  return historyRequest(`api/clients/${clientId}/services?page=${page}`)
}

export function listSiteHistory(siteId: string, page = 1): Promise<PaginatedResult<ServiceHistoryItem>> {
  return historyRequest(`api/sites/${siteId}/services?page=${page}`)
}

export function listFormOptions(): Promise<FormOption[]> {
  return apiRequest<FormOption[]>('api/catalogs/forms')
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
    formulariosAplicablesIds: [...new Set(input.formulariosAplicablesIds)],
  }
}

function areaPayload(input: AreaInput): AreaInput {
  return { ...input, nombre: input.nombre.trim() }
}

function normalizeClient(client: ClientWire): ClientRecord {
  return { ...client, version: Number(client.version), sedesCount: Number(client.sedesCount) }
}

function normalizeSite(site: SiteWire): SiteRecord {
  return {
    ...site,
    valorServicio: Number(site.valorServicio),
    version: Number(site.version),
    areasCount: Number(site.areasCount),
    formulariosCount: Number(site.formulariosCount),
  }
}

function normalizeArea(area: AreaWire): AreaRecord {
  return { ...area, version: Number(area.version), dispositivosCount: Number(area.dispositivosCount) }
}

async function historyRequest(path: string): Promise<PaginatedResult<ServiceHistoryItem>> {
  const result = await apiRequest<Omit<PaginatedResult<HistoryWire>, 'total'> & { total: number | string }>(path)
  return { ...result, total: Number(result.total), items: result.items.map((item) => ({ ...item, valor: Number(item.valor) })) }
}

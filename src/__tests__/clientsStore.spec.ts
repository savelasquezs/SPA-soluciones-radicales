import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as service from '@/services/clientsService'
import { useClientsStore } from '@/stores/clients'
import type { AreaRecord, ClientRecord, SiteRecord } from '@/types/domain'

vi.mock('@/services/clientsService', () => ({
  listClients: vi.fn<typeof import('@/services/clientsService').listClients>(),
  getClient: vi.fn<typeof import('@/services/clientsService').getClient>(),
  createClient: vi.fn<typeof import('@/services/clientsService').createClient>(),
  updateClient: vi.fn<typeof import('@/services/clientsService').updateClient>(),
  deleteClient: vi.fn<typeof import('@/services/clientsService').deleteClient>(),
  listSites: vi.fn<typeof import('@/services/clientsService').listSites>(),
  getSite: vi.fn<typeof import('@/services/clientsService').getSite>(),
  createSite: vi.fn<typeof import('@/services/clientsService').createSite>(),
  updateSite: vi.fn<typeof import('@/services/clientsService').updateSite>(),
  deleteSite: vi.fn<typeof import('@/services/clientsService').deleteSite>(),
  listAreas: vi.fn<typeof import('@/services/clientsService').listAreas>(),
  createArea: vi.fn<typeof import('@/services/clientsService').createArea>(),
  updateArea: vi.fn<typeof import('@/services/clientsService').updateArea>(),
  deleteArea: vi.fn<typeof import('@/services/clientsService').deleteArea>(),
}))

const client = (overrides: Partial<ClientRecord> = {}): ClientRecord => ({ id: 'client-1', tipoCliente: 'NEGOCIO', nombre: 'Acme', nit: '900', correos: [], activo: true, version: 1, vigenciaCertificadoMeses: 12, residenciaDireccion: null, residenciaCelular: null, residenciaValorServicio: null, sedesCount: 1, ...overrides })
const site = (overrides: Partial<SiteRecord> = {}): SiteRecord => ({ id: 'site-1', clientId: 'client-1', nombre: 'Principal', direccion: 'Calle 1', correos: [], heredaCorreosCliente: true, contactoPrincipalNombre: 'Ana', contactoPrincipalCorreo: null, contactoPrincipalCelular: '+573001234567', valorServicio: 100000, periodicidadMeses: 1, manejaRefuerzo: false, tipoSede: 'NEGOCIO', planoStoragePath: null, manejaVehiculos: false, generaCertificadoVehiculo: false, vigenciaCertificadoVehiculoMeses: null, duracionServicioMinutos: 120, activo: true, version: 1, areasCount: 0, proximoServicio: null, ...overrides })
const area = (overrides: Partial<AreaRecord> = {}): AreaRecord => ({ id: 'area-1', siteId: 'site-1', nombre: 'Cocina', esExterna: false, activo: true, version: 1, dispositivosCount: 0, ...overrides })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('clients store cache', () => {
  it('carga listados en byId y no repite la carga vigente', async () => {
    vi.mocked(service.listClients).mockResolvedValue([client()])
    const store = useClientsStore()
    await store.loadClients(true)
    await store.loadClients(true)
    expect(store.clientsById['client-1']?.nombre).toBe('Acme')
    expect(service.listClients).toHaveBeenCalledOnce()
  })

  it('edita con el snapshot en memoria, reemplaza la respuesta y no hace get ni refetch', async () => {
    vi.mocked(service.listClients).mockResolvedValue([client()])
    vi.mocked(service.updateClient).mockResolvedValue(client({ nombre: 'Acme Editado', version: 2 }))
    const store = useClientsStore()
    await store.loadClients(true)
    const snapshot = await store.ensureClient('client-1')
    await store.updateClient(snapshot.id, { ...snapshot, nombre: 'Acme Editado' })
    expect(service.getClient).not.toHaveBeenCalled()
    expect(service.listClients).toHaveBeenCalledOnce()
    expect(store.activeClients[0]?.nombre).toBe('Acme Editado')
  })

  it('mueve Clientes entre Activos e Inactivos con la respuesta definitiva', () => {
    const store = useClientsStore()
    store.upsertClient(client())
    store.upsertClient(client({ activo: false, version: 2 }))
    expect(store.activeClientIds).toEqual([])
    expect(store.inactiveClientIds).toEqual(['client-1'])
    store.upsertClient(client({ activo: true, version: 3 }))
    expect(store.inactiveClientIds).toEqual([])
    expect(store.activeClientIds).toEqual(['client-1'])
  })

  it('edita Sede y Área cargadas sin get por apertura ni recargar colecciones', async () => {
    vi.mocked(service.listSites).mockResolvedValue([site()])
    vi.mocked(service.updateSite).mockResolvedValue(site({ nombre: 'Norte', version: 2 }))
    vi.mocked(service.listAreas).mockResolvedValue([area()])
    vi.mocked(service.updateArea).mockResolvedValue(area({ nombre: 'Cocina industrial', version: 2 }))
    const store = useClientsStore()
    await store.loadSites('client-1')
    await store.ensureSite('site-1')
    await store.updateSite('site-1', { ...site(), nombre: 'Norte' })
    await store.loadAreas('site-1')
    await store.updateArea('area-1', { nombre: 'Cocina industrial', esExterna: false, activo: true, version: 1 })
    expect(service.getSite).not.toHaveBeenCalled()
    expect(service.listSites).toHaveBeenCalledOnce()
    expect(service.listAreas).toHaveBeenCalledOnce()
    expect(store.sitesById['site-1']?.nombre).toBe('Norte')
    expect(store.areasById['area-1']?.nombre).toBe('Cocina industrial')
  })
})

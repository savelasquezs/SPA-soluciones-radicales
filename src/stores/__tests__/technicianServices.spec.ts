import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/servicesService'
import * as cacheService from '@/services/technicianPackageService'
import { useAuthStore } from '@/stores/auth'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import type { TechnicianExecutionSession, TechnicianPackageCache, TechnicianServicePackage, TechnicianServiceSummary } from '@/types/technicianServices'

vi.mock('@/services/servicesService', () => ({
  fetchTechnicianServices: vi.fn<typeof api.fetchTechnicianServices>(),
  fetchTechnicianPackage: vi.fn<typeof api.fetchTechnicianPackage>(),
  startTechnicianService: vi.fn<typeof api.startTechnicianService>(),
  claimTechnicianService: vi.fn<typeof api.claimTechnicianService>(),
}))
vi.mock('@/services/technicianPackageService', () => ({
  getTechnicianDeviceId: vi.fn<typeof cacheService.getTechnicianDeviceId>(),
  listTechnicianPackageCaches: vi.fn<typeof cacheService.listTechnicianPackageCaches>(),
  loadTechnicianPackageCache: vi.fn<typeof cacheService.loadTechnicianPackageCache>(),
  saveTechnicianPackageCache: vi.fn<typeof cacheService.saveTechnicianPackageCache>(),
}))

const actorId = '10000000-0000-4000-8000-000000000001'
const serviceId = '10000000-0000-4000-8000-000000000002'
const deviceId = '10000000-0000-4000-8000-000000000003'
const summary = (estado: TechnicianServiceSummary['estado'] = 'PROGRAMADO'): TechnicianServiceSummary => ({
  id: serviceId,
  solicitud: 'SR-0101',
  tipoServicio: 'PRINCIPAL',
  estado,
  version: estado === 'PROGRAMADO' ? 1 : 2,
  inicioProgramado: '2026-10-07T14:00:00Z',
  finProgramado: '2026-10-07T15:30:00Z',
  inicioReal: estado === 'PROGRAMADO' ? null : '2026-10-07T13:30:00Z',
  clienteNombre: 'Cliente de prueba',
  sedeNombre: 'Sede de prueba',
  direccion: 'Dirección sintética',
})
const servicePackage = (estado: TechnicianServiceSummary['estado'] = 'PROGRAMADO'): TechnicianServicePackage => ({
  service: summary(estado),
  frozen: estado !== 'PROGRAMADO',
  serverNow: '2026-10-07T13:30:00Z',
  canStart: estado === 'PROGRAMADO',
  startAvailableAt: '2026-10-07T13:00:00Z',
  products: [],
  areas: [],
})
const cache = (): TechnicianPackageCache => ({
  schemaVersion: 1,
  actorId,
  serviceId,
  deviceId,
  savedAt: '2026-10-07T13:30:00Z',
  package: servicePackage(),
  lock: null,
  pendingOperation: null,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  useAuthStore().user = { id: actorId, nombreCompleto: 'Técnico', correoGoogle: 'tecnico@example.invalid', esAdmin: false, esTecnico: true, rolActivo: 'TECNICO', requiereSeleccionRol: false }
  vi.mocked(cacheService.getTechnicianDeviceId).mockReturnValue(deviceId)
  vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([])
  vi.mocked(cacheService.loadTechnicianPackageCache).mockResolvedValue(null)
  vi.mocked(cacheService.saveTechnicianPackageCache).mockResolvedValue()
})

describe('technician services state', () => {
  it('loads assigned services from the dedicated technician API', async () => {
    vi.mocked(api.fetchTechnicianServices).mockResolvedValue([summary()])
    const store = useTechnicianServicesStore()
    await store.loadServices()
    expect(store.records).toHaveLength(1)
    expect(store.usingCachedServices).toBe(false)
  })

  it('uses only prepared packages when the phone is offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([cache()])
    const store = useTechnicianServicesStore()
    await store.loadServices()
    expect(store.records[0]?.id).toBe(serviceId)
    expect(store.usingCachedServices).toBe(true)
    expect(api.fetchTechnicianServices).not.toHaveBeenCalled()
  })

  it('persists the idempotent start before calling the server and replaces it with the execution lock', async () => {
    vi.mocked(api.fetchTechnicianPackage).mockResolvedValue(servicePackage())
    const session: TechnicianExecutionSession = {
      package: servicePackage('EN_PROCESO'),
      lock: { token: '10000000-0000-4000-8000-000000000004', deviceId, acquiredAt: '2026-10-07T13:30:00Z' },
    }
    vi.mocked(api.startTechnicianService).mockResolvedValue(session)
    const store = useTechnicianServicesStore()
    await store.prepare(serviceId)
    await store.start(serviceId)
    const saved = vi.mocked(cacheService.saveTechnicianPackageCache).mock.calls.map(call => call[0])
    expect(saved.some(item => item.pendingOperation?.kind === 'START')).toBe(true)
    expect(saved[saved.length - 1]).toMatchObject({ lock: session.lock, pendingOperation: null })
    expect(store.currentPackage?.service.estado).toBe('EN_PROCESO')
  })
})

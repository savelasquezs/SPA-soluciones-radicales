import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/servicesService'
import * as cacheService from '@/services/technicianPackageService'
import * as mutationService from '@/services/technicianMutationService'
import * as mediaService from '@/services/technicianMediaService'
import * as serviceMedia from '@/services/serviceMediaService'
import { ApiClientError } from '@/services/apiService'
import { useAuthStore } from '@/stores/auth'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import type { TechnicianExecutionSession, TechnicianMutation, TechnicianPackageCache, TechnicianServicePackage, TechnicianServiceSummary } from '@/types/technicianServices'

vi.mock('@/services/servicesService', () => ({
  fetchTechnicianServices: vi.fn<typeof api.fetchTechnicianServices>(),
  fetchTechnicianPackage: vi.fn<typeof api.fetchTechnicianPackage>(),
  startTechnicianService: vi.fn<typeof api.startTechnicianService>(),
  claimTechnicianService: vi.fn<typeof api.claimTechnicianService>(),
  saveTechnicianAreaOrder: vi.fn<typeof api.saveTechnicianAreaOrder>(),
  saveTechnicianCriterionEvaluation: vi.fn<typeof api.saveTechnicianCriterionEvaluation>(),
  saveTechnicianAreaAccess: vi.fn<typeof api.saveTechnicianAreaAccess>(),
  createTechnicianDevice: vi.fn<typeof api.createTechnicianDevice>(),
  saveTechnicianDeviceReview: vi.fn<typeof api.saveTechnicianDeviceReview>(),
  createTechnicianFinding: vi.fn<typeof api.createTechnicianFinding>(),
  saveTechnicianFindingStatus: vi.fn<typeof api.saveTechnicianFindingStatus>(),
}))
vi.mock('@/services/technicianMediaService', () => ({
  saveTechnicianMedia: vi.fn<typeof mediaService.saveTechnicianMedia>(),
  loadTechnicianMedia: vi.fn<typeof mediaService.loadTechnicianMedia>(),
  deleteTechnicianMedia: vi.fn<typeof mediaService.deleteTechnicianMedia>(),
}))
vi.mock('@/services/serviceMediaService', () => ({
  uploadTechnicianAreaPhoto: vi.fn<typeof serviceMedia.uploadTechnicianAreaPhoto>(),
  deleteTechnicianAreaPhoto: vi.fn<typeof serviceMedia.deleteTechnicianAreaPhoto>(),
  uploadTechnicianDevicePhoto: vi.fn<typeof serviceMedia.uploadTechnicianDevicePhoto>(),
  deleteTechnicianDevicePhoto: vi.fn<typeof serviceMedia.deleteTechnicianDevicePhoto>(),
  uploadTechnicianFindingEvidence: vi.fn<typeof serviceMedia.uploadTechnicianFindingEvidence>(),
  deleteTechnicianFindingEvidence: vi.fn<typeof serviceMedia.deleteTechnicianFindingEvidence>(),
}))
vi.mock('@/services/technicianPackageService', () => ({
  getTechnicianDeviceId: vi.fn<typeof cacheService.getTechnicianDeviceId>(),
  listTechnicianPackageCaches: vi.fn<typeof cacheService.listTechnicianPackageCaches>(),
  loadTechnicianPackageCache: vi.fn<typeof cacheService.loadTechnicianPackageCache>(),
  saveTechnicianPackageCache: vi.fn<typeof cacheService.saveTechnicianPackageCache>(),
}))
vi.mock('@/services/technicianMutationService', () => ({
  listTechnicianMutations: vi.fn<typeof mutationService.listTechnicianMutations>(),
  saveTechnicianMutation: vi.fn<typeof mutationService.saveTechnicianMutation>(),
  deleteTechnicianMutation: vi.fn<typeof mutationService.deleteTechnicianMutation>(),
}))

let mutationRecords: TechnicianMutation[] = []

const actorId = '10000000-0000-4000-8000-000000000001'
const serviceId = '10000000-0000-4000-8000-000000000002'
const deviceId = '10000000-0000-4000-8000-000000000003'
const lockToken = '10000000-0000-4000-8000-000000000004'
const areaIds = ['10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000006']
const criterionId = '10000000-0000-4000-8000-000000000007'
const serviceDeviceId = '10000000-0000-4000-8000-000000000008'
const permanentDeviceId = '10000000-0000-4000-8000-000000000009'
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
  deviceTypes: [{ codigo: 'TRAMPA', nombre: 'Trampa', clasificacion: 'RASTREROS', plagas: [{ codigo: 'CUCARACHA', nombre: 'Cucaracha' }] }],
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
const executionCache = (): TechnicianPackageCache => ({
  ...cache(),
  package: {
    ...servicePackage('EN_PROCESO'),
    areas: areaIds.map((id, position) => ({
      id,
      areaId: id,
      nombre: position ? 'Bodega' : 'Cocina',
      esExterna: false,
      posicionInicial: position,
      posicionRecorrido: position,
      sinAcceso: false,
      sinAccesoDescripcion: null,
      sinAccesoFotoStoragePath: null,
      version: 1,
      criterios: position ? [] : [{ id: criterionId, criterioId: criterionId, nombre: 'Orden y aseo', soloAreaExterna: false, evaluacion: null, observacion: null, evidenciasStoragePaths: [], version: 1 }],
      dispositivos: position ? [] : [{
        id: serviceDeviceId,
        dispositivoId: permanentDeviceId,
        numero: 'D-01',
        ubicacion: 'Bajo mesón',
        tipoCodigo: 'TRAMPA_ADHESIVA',
        tipoNombre: 'Trampa adhesiva',
        clasificacion: 'RASTREROS',
        plagas: [{ codigo: 'CUCARACHA', nombre: 'Cucaracha' }],
        estadoAnterior: 'ACTIVO',
        creadoDuranteServicio: false,
        revisado: false,
        revision: null,
      }],
      hallazgos: [],
    })),
  },
  lock: { token: lockToken, deviceId, acquiredAt: '2026-10-07T13:30:00Z' },
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
  mutationRecords = []
  vi.mocked(mutationService.listTechnicianMutations).mockImplementation(async (_actorId, selectedServiceId) => mutationRecords.filter(item => !selectedServiceId || item.serviceId === selectedServiceId))
  vi.mocked(mutationService.saveTechnicianMutation).mockImplementation(async value => {
    mutationRecords = [...mutationRecords.filter(item => item.requestId !== value.requestId), structuredClone(value)]
  })
  vi.mocked(mutationService.deleteTechnicianMutation).mockImplementation(async value => {
    mutationRecords = mutationRecords.filter(item => item.requestId !== value.requestId)
  })
  vi.mocked(mediaService.saveTechnicianMedia).mockResolvedValue()
  vi.mocked(mediaService.loadTechnicianMedia).mockResolvedValue(null)
  vi.mocked(mediaService.deleteTechnicianMedia).mockResolvedValue()
  vi.mocked(serviceMedia.deleteTechnicianAreaPhoto).mockResolvedValue()
  vi.mocked(serviceMedia.deleteTechnicianDevicePhoto).mockResolvedValue()
  vi.mocked(serviceMedia.deleteTechnicianFindingEvidence).mockResolvedValue()
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

  it('applies an offline area order durably without calling the API', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    expect(await store.applyAreaOrder(serviceId, [...areaIds].reverse())).toBe('pending')
    expect(store.currentPackage?.areas.map(area => area.id)).toEqual([...areaIds].reverse())
    expect(store.pendingSyncCount).toBe(1)
    expect(api.saveTechnicianAreaOrder).not.toHaveBeenCalled()
  })

  it('synchronizes the queued order and applies definitive versions', async () => {
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    vi.mocked(api.saveTechnicianAreaOrder).mockResolvedValue({ areas: [
      { id: areaIds[1]!, posicionRecorrido: 0, version: 2 },
      { id: areaIds[0]!, posicionRecorrido: 1, version: 2 },
    ] })
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    expect(await store.applyAreaOrder(serviceId, [...areaIds].reverse())).toBe('synced')
    expect(store.pendingSyncCount).toBe(0)
    expect(store.currentPackage?.areas.map(area => [area.id, area.version])).toEqual([[areaIds[1], 2], [areaIds[0], 2]])
  })

  it('persists a criterion evaluation offline and synchronizes its definitive version', async () => {
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    vi.mocked(api.saveTechnicianCriterionEvaluation).mockResolvedValue({ criterion: {
      id: criterionId, criterioId: criterionId, nombre: 'Orden y aseo', soloAreaExterna: false, evaluacion: 'CP', observacion: 'Mejora pendiente', evidenciasStoragePaths: [], version: 2,
    } })
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    expect(await store.applyCriterionEvaluation(serviceId, areaIds[0]!, criterionId, 'CP', 'Mejora pendiente')).toBe('synced')
    expect(store.currentPackage?.areas[0]?.criterios[0]).toMatchObject({ evaluacion: 'CP', observacion: 'Mejora pendiente', version: 2 })
    expect(store.pendingSyncCount).toBe(0)
    expect(api.saveTechnicianCriterionEvaluation).toHaveBeenCalledWith(serviceId, expect.any(String), deviceId, lockToken, criterionId, 1, 'CP', 'Mejora pendiente')
  })

  it('keeps a criterion response in the shared queue while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    expect(await store.applyCriterionEvaluation(serviceId, areaIds[0]!, criterionId, 'NC', 'Limpieza requerida')).toBe('pending')
    expect(store.currentPackage?.areas[0]?.criterios[0]).toMatchObject({ evaluacion: 'NC', observacion: 'Limpieza requerida' })
    expect(mutationRecords[0]).toMatchObject({ kind: 'CRITERION_EVALUATION', criterionId, status: 'PENDING' })
    expect(api.saveTechnicianCriterionEvaluation).not.toHaveBeenCalled()
  })

  it('preserves an area access exception and its photo while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    const photo = new File(['photo'], 'sin-acceso.jpg', { type: 'image/jpeg' })
    expect(await store.applyAreaAccess(serviceId, areaIds[0]!, true, 'Puerta cerrada', photo)).toBe('pending')
    expect(mutationRecords[0]).toMatchObject({ kind: 'AREA_ACCESS', areaId: areaIds[0], withoutAccess: true, description: 'Puerta cerrada', status: 'PENDING' })
    expect(mediaService.saveTechnicianMedia).toHaveBeenCalledWith(expect.objectContaining({ serviceId, areaId: areaIds[0], file: photo }))
    expect(store.currentPackage?.areas[0]).toMatchObject({ sinAcceso: true, sinAccesoDescripcion: 'Puerta cerrada' })
    expect(store.currentPackage?.areas[0]?.sinAccesoFotoLocalId).toEqual(expect.any(String))
    expect(api.saveTechnicianAreaAccess).not.toHaveBeenCalled()
  })

  it('uploads and synchronizes an area access photo before saving the exception', async () => {
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    const photo = new File(['photo'], 'sin-acceso.jpg', { type: 'image/jpeg' })
    vi.mocked(mediaService.loadTechnicianMedia).mockImplementation(async (_actor, mediaId) => ({
      schemaVersion: 1, id: mediaId, actorId, serviceId, areaId: areaIds[0]!, fileName: photo.name, contentType: photo.type,
      size: photo.size, lastModified: photo.lastModified, file: photo, savedAt: '2026-10-07T13:30:00Z',
    }))
    const storagePath = `services/${serviceId}/areas/${areaIds[0]}/no-access/photo.jpg`
    vi.mocked(serviceMedia.uploadTechnicianAreaPhoto).mockResolvedValue(storagePath)
    vi.mocked(api.saveTechnicianAreaAccess).mockResolvedValue({ area: {
      id: areaIds[0]!, sinAcceso: true, sinAccesoDescripcion: 'Puerta cerrada', sinAccesoFotoStoragePath: storagePath, version: 2,
    } })
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    expect(await store.applyAreaAccess(serviceId, areaIds[0]!, true, 'Puerta cerrada', photo)).toBe('synced')
    expect(serviceMedia.uploadTechnicianAreaPhoto).toHaveBeenCalledWith(serviceId, areaIds[0], deviceId, lockToken, photo)
    expect(api.saveTechnicianAreaAccess).toHaveBeenCalledWith(serviceId, areaIds[0], expect.any(String), deviceId, lockToken, 1, true, 'Puerta cerrada', storagePath)
    expect(mediaService.deleteTechnicianMedia).toHaveBeenCalled()
    expect(store.currentPackage?.areas[0]).toMatchObject({ sinAcceso: true, sinAccesoFotoStoragePath: storagePath, sinAccesoFotoLocalId: null, version: 2 })
    expect(store.pendingSyncCount).toBe(0)
  })

  it('preserves a device review and its condition photo while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    const photo = new File(['photo'], 'dano.jpg', { type: 'image/jpeg' })
    expect(await store.applyDeviceReview(serviceId, areaIds[0]!, serviceDeviceId, {
      estadoObservado: 'DANADO', capturas: [{ plagaCodigo: 'CUCARACHA', cantidad: 2 }],
      consumo: 'Parcial', productoQuimico: '', antidoto: '', observaciones: 'Base desprendida',
    }, photo)).toBe('pending')
    expect(mutationRecords[0]).toMatchObject({ kind: 'DEVICE_REVIEW', serviceDeviceId, estadoObservado: 'DANADO', version: 0, status: 'PENDING' })
    expect(mediaService.saveTechnicianMedia).toHaveBeenCalledWith(expect.objectContaining({ serviceId, areaId: areaIds[0], serviceDeviceId, file: photo }))
    expect(store.currentPackage?.areas[0]?.dispositivos[0]).toMatchObject({ revisado: true, revision: { estadoObservado: 'DANADO' } })
    expect(api.saveTechnicianDeviceReview).not.toHaveBeenCalled()
  })

  it('creates a permanent device locally while offline and queues it before its review', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    expect(await store.applyDeviceCreation(serviceId, areaIds[0]!, {
      numero: 'D-02', tipoCodigo: 'TRAMPA', ubicacion: 'Junto a la puerta',
    })).toBe('pending')
    expect(mutationRecords[0]).toMatchObject({ kind: 'DEVICE_CREATE', areaId: areaIds[0], numero: 'D-02', status: 'PENDING' })
    expect(store.currentPackage?.areas[0]?.dispositivos[1]).toMatchObject({
      numero: 'D-02', tipoNombre: 'Trampa', creadoDuranteServicio: true, creacionPendiente: true,
    })
    expect(api.createTechnicianDevice).not.toHaveBeenCalled()
  })

  it('preserves a new finding and all its evidence while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    const files = [
      new File(['photo-1'], 'hallazgo-1.jpg', { type: 'image/jpeg' }),
      new File(['photo-2'], 'hallazgo-2.png', { type: 'image/png' }),
    ]
    expect(await store.applyFindingCreate(serviceId, areaIds[0]!, {
      descripcion: 'Abertura junto al muro', recomendacionAccion: 'Sellar el paso',
      responsableNombre: 'Mantenimiento', responsableCorreo: 'mantenimiento@example.invalid',
    }, files)).toBe('pending')
    expect(mutationRecords[0]).toMatchObject({ kind: 'FINDING_CREATE', areaId: areaIds[0], status: 'PENDING', evidences: [{ storagePath: null }, { storagePath: null }] })
    expect(mediaService.saveTechnicianMedia).toHaveBeenCalledTimes(2)
    expect(store.currentPackage?.areas[0]?.hallazgos[0]).toMatchObject({
      descripcion: 'Abertura junto al muro', estado: 'ABIERTO', evidenciasAperturaLocalIds: [expect.any(String), expect.any(String)],
    })
    expect(api.createTechnicianFinding).not.toHaveBeenCalled()
  })

  it('queues a later-service finding closure with mandatory evidence while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const prepared = executionCache()
    const findingId = '10000000-0000-4000-8000-000000000011'
    prepared.package.areas[0]!.hallazgos = [{
      id: findingId, servicioAperturaId: '10000000-0000-4000-8000-000000000012', fechaApertura: '2026-09-07T14:00:00Z',
      descripcion: 'Abertura junto al muro', recomendacionAccion: 'Sellar el paso', evidenciasAperturaStoragePaths: [],
      estado: 'EN_PROCESO', responsableNombre: 'Mantenimiento', responsableCorreo: null, servicioCierreId: null,
      fechaCierre: null, evidenciasCierreStoragePaths: [], observacionCierre: null, version: 2,
    }]
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([prepared])
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    await expect(store.applyFindingStatus(serviceId, areaIds[0]!, findingId, { estado: 'CERRADO', observacionCierre: 'Paso sellado' }, [])).rejects.toThrow('evidencia')
    const photo = new File(['closed'], 'cierre.jpg', { type: 'image/jpeg' })
    expect(await store.applyFindingStatus(serviceId, areaIds[0]!, findingId, { estado: 'CERRADO', observacionCierre: 'Paso sellado' }, [photo])).toBe('pending')
    expect(mutationRecords[0]).toMatchObject({ kind: 'FINDING_STATUS', findingId, estado: 'CERRADO', version: 2, status: 'PENDING' })
    expect(store.currentPackage?.areas[0]?.hallazgos[0]).toMatchObject({ estado: 'CERRADO', servicioCierreId: serviceId, observacionCierre: 'Paso sellado' })
  })

  it('uploads and synchronizes a device condition photo before saving the review', async () => {
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    const photo = new File(['photo'], 'dano.jpg', { type: 'image/jpeg' })
    vi.mocked(mediaService.loadTechnicianMedia).mockImplementation(async (_actor, mediaId) => ({
      schemaVersion: 1, id: mediaId, actorId, serviceId, areaId: areaIds[0]!, serviceDeviceId,
      fileName: photo.name, contentType: photo.type, size: photo.size, lastModified: photo.lastModified,
      file: photo, savedAt: '2026-10-07T13:30:00Z',
    }))
    const storagePath = `services/${serviceId}/devices/${serviceDeviceId}/review/photo.jpg`
    vi.mocked(serviceMedia.uploadTechnicianDevicePhoto).mockResolvedValue(storagePath)
    vi.mocked(api.saveTechnicianDeviceReview).mockResolvedValue({ review: {
      id: '10000000-0000-4000-8000-000000000010', estadoObservado: 'DANADO',
      capturas: [{ plagaCodigo: 'CUCARACHA', plagaNombreSnapshot: 'Cucaracha', cantidad: 2 }],
      consumo: '', productoQuimico: '', antidoto: '', observaciones: 'Base desprendida',
      fotoStoragePath: storagePath, version: 1,
    } })
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    expect(await store.applyDeviceReview(serviceId, areaIds[0]!, serviceDeviceId, {
      estadoObservado: 'DANADO', capturas: [{ plagaCodigo: 'CUCARACHA', cantidad: 2 }],
      consumo: '', productoQuimico: '', antidoto: '', observaciones: 'Base desprendida',
    }, photo)).toBe('synced')
    expect(serviceMedia.uploadTechnicianDevicePhoto).toHaveBeenCalledWith(serviceId, serviceDeviceId, deviceId, lockToken, photo)
    expect(api.saveTechnicianDeviceReview).toHaveBeenCalledWith(serviceId, serviceDeviceId, expect.any(String), deviceId, lockToken,
      expect.any(String), 0, expect.objectContaining({ estadoObservado: 'DANADO' }), storagePath)
    expect(store.currentPackage?.areas[0]?.dispositivos[0]?.revision).toMatchObject({ fotoStoragePath: storagePath, version: 1 })
    expect(store.pendingSyncCount).toBe(0)
  })

  it('keeps a local criterion answer until the technician resolves a version conflict', async () => {
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    vi.mocked(api.saveTechnicianCriterionEvaluation).mockRejectedValue(new ApiClientError(
      'El criterio cambió.',
      409,
      'VERSION_CONFLICT',
      { remote: { id: criterionId, criterioId: criterionId, nombre: 'Orden y aseo', soloAreaExterna: false,
        evaluacion: 'C', observacion: 'Respuesta remota', evidenciasStoragePaths: [], version: 2 } },
    ))
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    expect(await store.applyCriterionEvaluation(serviceId, areaIds[0]!, criterionId, 'NC', 'Respuesta local')).toBe('conflict')
    expect(store.currentPackage?.areas[0]?.criterios[0]).toMatchObject({ evaluacion: 'NC', observacion: 'Respuesta local' })
    expect(store.criterionConflict(criterionId)?.conflict).toMatchObject({ evaluacion: 'C', version: 2 })
    await store.discardCriterionEvaluationConflict(serviceId, criterionId)
    expect(store.currentPackage?.areas[0]?.criterios[0]).toMatchObject({ evaluacion: 'C', observacion: 'Respuesta remota', version: 2 })
    expect(store.criterionConflict(criterionId)).toBeNull()
  })

  it('keeps the local proposal until the technician resolves a version conflict', async () => {
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    vi.mocked(api.saveTechnicianAreaOrder).mockRejectedValue(new ApiClientError(
      'El recorrido cambió.',
      409,
      'VERSION_CONFLICT',
      { remote: { areaIds, versions: areaIds.map(id => ({ id, version: 2 })) } },
    ))
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    expect(await store.applyAreaOrder(serviceId, [...areaIds].reverse())).toBe('conflict')
    expect(store.currentPackage?.areas.map(area => area.id)).toEqual([...areaIds].reverse())
    expect(store.currentConflict?.conflict?.areaIds).toEqual(areaIds)
    await store.discardAreaOrderConflict(serviceId)
    expect(store.currentPackage?.areas.map(area => area.id)).toEqual(areaIds)
    expect(store.currentConflict).toBeNull()
  })

  it('does not reuse an idempotency key after an uncertain network response', async () => {
    vi.mocked(cacheService.listTechnicianPackageCaches).mockResolvedValue([executionCache()])
    vi.mocked(api.saveTechnicianAreaOrder).mockRejectedValueOnce(new TypeError('Network error'))
    const store = useTechnicianServicesStore()
    await store.ensurePackage(serviceId)
    expect(await store.applyAreaOrder(serviceId, [...areaIds].reverse())).toBe('pending')
    expect(mutationRecords).toHaveLength(1)
    expect(mutationRecords[0]?.status).toBe('SENDING')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    expect(await store.applyAreaOrder(serviceId, areaIds)).toBe('pending')
    expect(mutationRecords).toHaveLength(2)
    expect(new Set(mutationRecords.map(item => item.requestId)).size).toBe(2)
  })
})

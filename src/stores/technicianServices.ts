import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { isExactAreaPermutation, sortTechnicianServices, technicianDevicePhotoRequired } from '@/helpers/technicianServices'
import { useAuthStore } from '@/stores/auth'
import { claimTechnicianService, createTechnicianDevice, fetchTechnicianPackage, fetchTechnicianServices, saveTechnicianAreaAccess, saveTechnicianAreaOrder, saveTechnicianCriterionEvaluation, saveTechnicianDeviceReview, startTechnicianService } from '@/services/servicesService'
import { ApiClientError } from '@/services/apiService'
import { getTechnicianDeviceId, listTechnicianPackageCaches, loadTechnicianPackageCache, saveTechnicianPackageCache } from '@/services/technicianPackageService'
import { deleteTechnicianMutation, listTechnicianMutations, saveTechnicianMutation } from '@/services/technicianMutationService'
import { deleteTechnicianMedia, loadTechnicianMedia, saveTechnicianMedia } from '@/services/technicianMediaService'
import { deleteTechnicianAreaPhoto, deleteTechnicianDevicePhoto, uploadTechnicianAreaPhoto, uploadTechnicianDevicePhoto } from '@/services/serviceMediaService'
import type { MipEvaluation, TechnicianAreaAccessMutation, TechnicianAreaAccessState, TechnicianAreaOrderConflict, TechnicianAreaOrderMutation, TechnicianAreaOrderResult, TechnicianCriterion, TechnicianCriterionEvaluationMutation, TechnicianDevice, TechnicianDeviceCreationInput, TechnicianDeviceCreationMutation, TechnicianDeviceReview, TechnicianDeviceReviewInput, TechnicianDeviceReviewMutation, TechnicianExecutionSession, TechnicianMutation, TechnicianPackageCache, TechnicianPendingOperation, TechnicianServicePackage, TechnicianServiceSummary } from '@/types/technicianServices'

function onlineNow(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

export const useTechnicianServicesStore = defineStore('technician-services', () => {
  const auth = useAuthStore()
  const records = ref<TechnicianServiceSummary[]>([])
  const caches = ref<Record<string, TechnicianPackageCache>>({})
  const loading = ref(false)
  const refreshing = ref(false)
  const listError = ref('')
  const usingCachedServices = ref(false)
  const currentServiceId = ref('')
  const packageLoading = ref(false)
  const packageError = ref('')
  const currentFromCache = ref(false)
  const action = ref<'START' | 'CLAIM' | null>(null)
  const mutations = ref<Record<string, TechnicianMutation[]>>({})
  const syncing = ref(false)
  let loadedActorId = ''
  let listRequest = 0
  let packageRequest = 0

  const currentCache = computed(() => caches.value[currentServiceId.value] ?? null)
  const currentPackage = computed(() => currentCache.value?.package ?? null)
  const currentMutations = computed(() => mutations.value[currentServiceId.value] ?? [])
  const currentConflict = computed<TechnicianAreaOrderMutation | null>(() => currentMutations.value.find((item): item is TechnicianAreaOrderMutation => item.kind === 'AREA_ORDER' && item.status === 'CONFLICT') ?? null)
  const pendingSyncCount = computed(() => currentMutations.value.filter(item => item.status !== 'CONFLICT').length)

  function actorId(): string {
    const id = auth.profile?.id
    if (!id) throw new Error('No fue posible identificar al Técnico activo.')
    return id
  }

  function resetActorScope(actor: string): void {
    if (!loadedActorId || loadedActorId === actor) return
    records.value = []
    caches.value = {}
    currentServiceId.value = ''
    packageError.value = ''
    currentFromCache.value = false
    mutations.value = {}
  }

  async function hydrateCaches(force = false): Promise<void> {
    const actor = actorId()
    resetActorScope(actor)
    if (!force && loadedActorId === actor) return
    const [found, pending] = await Promise.all([listTechnicianPackageCaches(actor), listTechnicianMutations(actor)])
    caches.value = Object.fromEntries(found.map(item => [item.serviceId, item]))
    const grouped: Record<string, TechnicianMutation[]> = {}
    for (const item of pending) (grouped[item.serviceId] ??= []).push(item)
    mutations.value = grouped
    loadedActorId = actor
  }

  async function reloadMutations(serviceId: string): Promise<TechnicianMutation[]> {
    const found = await listTechnicianMutations(actorId(), serviceId)
    mutations.value = { ...mutations.value, [serviceId]: found }
    return found
  }

  function cachedRecords(): TechnicianServiceSummary[] {
    return sortTechnicianServices(Object.values(caches.value).map(item => item.package.service))
  }

  async function loadServices(): Promise<void> {
    const request = ++listRequest
    resetActorScope(actorId())
    loading.value = records.value.length === 0
    refreshing.value = records.value.length > 0
    listError.value = ''
    try {
      await hydrateCaches()
      if (!onlineNow()) {
        records.value = cachedRecords()
        usingCachedServices.value = true
        return
      }
      const loaded = await fetchTechnicianServices()
      if (request !== listRequest) return
      records.value = sortTechnicianServices(loaded)
      usingCachedServices.value = false
    } catch (failure) {
      if (request !== listRequest) return
      const cached = cachedRecords()
      if (cached.length) {
        records.value = cached
        usingCachedServices.value = true
        listError.value = 'No fue posible actualizar. Se muestran los servicios guardados en este celular.'
      } else {
        listError.value = failure instanceof Error ? failure.message : 'No fue posible cargar tus servicios.'
      }
    } finally {
      if (request === listRequest) {
        loading.value = false
        refreshing.value = false
      }
    }
  }

  async function persistPackage(value: TechnicianServicePackage, patch: Partial<Pick<TechnicianPackageCache, 'lock' | 'pendingOperation'>> = {}): Promise<TechnicianPackageCache> {
    const actor = actorId()
    const previous = caches.value[value.service.id]
    const next: TechnicianPackageCache = {
      schemaVersion: 1,
      actorId: actor,
      serviceId: value.service.id,
      deviceId: getTechnicianDeviceId(),
      savedAt: new Date().toISOString(),
      package: value,
      lock: patch.lock === undefined ? previous?.lock ?? null : patch.lock,
      pendingOperation: patch.pendingOperation === undefined ? previous?.pendingOperation ?? null : patch.pendingOperation,
    }
    await saveTechnicianPackageCache(next)
    caches.value = { ...caches.value, [next.serviceId]: next }
    return next
  }

  async function prepare(serviceId: string): Promise<TechnicianServicePackage> {
    if (!onlineNow()) throw new Error('Conéctate a internet para preparar el servicio.')
    currentServiceId.value = serviceId
    const value = await fetchTechnicianPackage(serviceId)
    await persistPackage(value)
    return value
  }

  async function persistAreaOrder(serviceId: string, areaIds: string[], result?: TechnicianAreaOrderResult): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) throw new Error('Prepara el servicio antes de modificar el recorrido.')
    const currentIds = cache.package.areas.map(area => area.id)
    if (!isExactAreaPermutation(currentIds, areaIds)) throw new Error('El recorrido debe conservar todas las Áreas.')
    const definitive = new Map(result?.areas.map(area => [area.id, area]))
    const byId = new Map(cache.package.areas.map(area => [area.id, area]))
    const areas = areaIds.map((id, position) => {
      const area = byId.get(id)!
      const saved = definitive.get(id)
      return { ...area, posicionRecorrido: position, version: saved?.version ?? area.version }
    })
    await persistPackage({ ...cache.package, areas })
  }

  async function persistCriterionEvaluation(serviceId: string, areaId: string, criterion: TechnicianCriterion): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) throw new Error('Prepara el servicio antes de evaluar sus criterios.')
    let found = false
    const areas = cache.package.areas.map(area => {
      if (area.id !== areaId) return area
      const criterios = area.criterios.map(current => {
        if (current.id !== criterion.id) return current
        found = true
        return criterion
      })
      return { ...area, criterios }
    })
    if (!found) throw new Error('El criterio no pertenece al Área seleccionada.')
    await persistPackage({ ...cache.package, areas })
  }

  async function persistAreaAccess(serviceId: string, state: TechnicianAreaAccessState, localPhotoId: string | null = null): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) throw new Error('Prepara el servicio antes de registrar la excepción de acceso.')
    let found = false
    const areas = cache.package.areas.map(area => {
      if (area.id !== state.id) return area
      found = true
      return { ...area, ...state, sinAccesoFotoLocalId: localPhotoId }
    })
    if (!found) throw new Error('El Área no pertenece al servicio preparado.')
    await persistPackage({ ...cache.package, areas })
  }

  async function persistDeviceReview(serviceId: string, areaId: string, serviceDeviceId: string, review: TechnicianDeviceReview): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) throw new Error('Prepara el servicio antes de revisar sus dispositivos.')
    let found = false
    const areas = cache.package.areas.map(area => {
      if (area.id !== areaId) return area
      const dispositivos = area.dispositivos.map(device => {
        if (device.id !== serviceDeviceId) return device
        found = true
        return { ...device, revisado: true, revision: review }
      })
      return { ...area, dispositivos }
    })
    if (!found) throw new Error('El dispositivo no pertenece al Área seleccionada.')
    await persistPackage({ ...cache.package, areas })
  }

  async function persistDeviceCreation(serviceId: string, areaId: string, device: TechnicianDevice): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) throw new Error('Prepara el servicio antes de agregar dispositivos.')
    let found = false
    const areas = cache.package.areas.map(area => {
      if (area.id !== areaId) return area
      found = true
      const current = area.dispositivos.find(item => item.id === device.id)
      const dispositivos = current
        ? area.dispositivos.map(item => item.id === device.id ? device : item)
        : [...area.dispositivos, device].sort((left, right) => left.numero.localeCompare(right.numero, 'es', { sensitivity: 'base', numeric: true }))
      return { ...area, dispositivos }
    })
    if (!found) throw new Error('El Área no pertenece al servicio preparado.')
    await persistPackage({ ...cache.package, areas })
  }

  async function removeLocalDevice(serviceId: string, areaId: string, serviceDeviceId: string): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) return
    const areas = cache.package.areas.map(area => area.id === areaId
      ? { ...area, dispositivos: area.dispositivos.filter(device => device.id !== serviceDeviceId) }
      : area)
    await persistPackage({ ...cache.package, areas })
  }

  function reviewFromMutation(device: TechnicianDevice, mutation: TechnicianDeviceReviewMutation, base?: TechnicianDeviceReview): TechnicianDeviceReview {
    const pestNames = new Map(device.plagas.map(pest => [pest.codigo, pest.nombre]))
    return {
      id: mutation.reviewId,
      estadoObservado: mutation.estadoObservado,
      capturas: mutation.capturas.map(capture => ({ ...capture, plagaNombreSnapshot: pestNames.get(capture.plagaCodigo) ?? capture.plagaCodigo })),
      consumo: mutation.consumo,
      productoQuimico: mutation.productoQuimico,
      antidoto: mutation.antidoto,
      observaciones: mutation.observaciones,
      fotoStoragePath: mutation.photoStoragePath ?? base?.fotoStoragePath ?? null,
      fotoLocalId: mutation.photoMediaId,
      version: base?.version ?? mutation.version,
    }
  }

  function conflictDetails(failure: ApiClientError): TechnicianAreaOrderConflict | null {
    const remote = failure.details?.remote
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return null
    const record = remote as Partial<TechnicianAreaOrderConflict>
    if (!Array.isArray(record.areaIds) || !Array.isArray(record.versions)) return null
    return { areaIds: record.areaIds, versions: record.versions }
  }

  function criterionConflictDetails(failure: ApiClientError): TechnicianCriterion | null {
    const remote = failure.details?.remote
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return null
    const record = remote as Partial<TechnicianCriterion>
    if (!record.id || !record.criterioId || !Number.isSafeInteger(record.version) || !Array.isArray(record.evidenciasStoragePaths)) return null
    return record as TechnicianCriterion
  }

  function areaAccessConflictDetails(failure: ApiClientError): TechnicianAreaAccessState | null {
    const remote = failure.details?.remote
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return null
    const record = remote as Partial<TechnicianAreaAccessState>
    if (!record.id || typeof record.sinAcceso !== 'boolean' || !Number.isSafeInteger(record.version)) return null
    return record as TechnicianAreaAccessState
  }

  function deviceReviewConflictDetails(failure: ApiClientError): TechnicianDeviceReview | null {
    const remote = failure.details?.remote
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return null
    const record = remote as Partial<TechnicianDeviceReview>
    if (!record.id || !['ACTIVO', 'DANADO', 'FUERA_DE_USO'].includes(record.estadoObservado ?? '')
      || !Array.isArray(record.capturas) || !Number.isSafeInteger(record.version)) return null
    return record as TechnicianDeviceReview
  }

  async function syncPending(serviceId: string): Promise<'synced' | 'pending' | 'conflict'> {
    if (!onlineNow()) return 'pending'
    if (syncing.value) return currentMutations.value.some(item => item.status === 'CONFLICT') ? 'conflict' : 'pending'
    syncing.value = true
    try {
      while (true) {
        const pending = await reloadMutations(serviceId)
        if (pending.some(item => item.status === 'CONFLICT')) return 'conflict'
        const operation = pending[0]
        if (!operation) return 'synced'
        let sending = { ...operation, status: 'SENDING' as const, updatedAt: new Date().toISOString(), error: null } as TechnicianMutation
        await saveTechnicianMutation(sending)
        await reloadMutations(serviceId)
        try {
          if (sending.kind === 'AREA_ORDER') {
            const result = await saveTechnicianAreaOrder(serviceId, sending.requestId, sending.deviceId, sending.lockToken, sending.areaIds, sending.versions)
            await deleteTechnicianMutation(sending)
            const remaining = await listTechnicianMutations(actorId(), serviceId)
            const definitiveVersions = result.areas.map(area => ({ id: area.id, version: area.version }))
            for (const queued of remaining.filter((item): item is TechnicianAreaOrderMutation => item.kind === 'AREA_ORDER' && item.status !== 'CONFLICT')) {
              await saveTechnicianMutation({ ...queued, versions: definitiveVersions, updatedAt: new Date().toISOString() })
            }
            for (const queued of remaining.filter((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS' && item.status !== 'CONFLICT')) {
              const saved = result.areas.find(area => area.id === queued.areaId)
              if (saved) await saveTechnicianMutation({ ...queued, version: saved.version, updatedAt: new Date().toISOString() })
            }
            const latest = [...remaining].reverse().find((item): item is TechnicianAreaOrderMutation => item.kind === 'AREA_ORDER' && item.status !== 'CONFLICT')
            await persistAreaOrder(serviceId, latest?.areaIds ?? result.areas.map(area => area.id), result)
          } else if (sending.kind === 'CRITERION_EVALUATION') {
            const criterionId = sending.criterionId
            const result = await saveTechnicianCriterionEvaluation(serviceId, sending.requestId, sending.deviceId, sending.lockToken,
              criterionId, sending.version, sending.evaluation, sending.observation)
            await deleteTechnicianMutation(sending)
            const remaining = await listTechnicianMutations(actorId(), serviceId)
            const sameCriterion = remaining.filter((item): item is TechnicianCriterionEvaluationMutation => item.kind === 'CRITERION_EVALUATION'
              && item.criterionId === criterionId && item.status !== 'CONFLICT')
            for (const queued of sameCriterion) {
              await saveTechnicianMutation({ ...queued, version: result.criterion.version, updatedAt: new Date().toISOString() })
            }
            const latest = sameCriterion[sameCriterion.length - 1]
            const criterion = latest
              ? { ...result.criterion, evaluacion: latest.evaluation, observacion: latest.observation || null }
              : result.criterion
            await persistCriterionEvaluation(serviceId, sending.areaId, criterion)
          } else if (sending.kind === 'AREA_ACCESS') {
            const areaId = sending.areaId
            let photoStoragePath = sending.photoStoragePath
            if (sending.withoutAccess && !photoStoragePath) {
              if (!sending.photoMediaId) throw new Error('La fotografía local del Área no está disponible.')
              const media = await loadTechnicianMedia(sending.actorId, sending.photoMediaId)
              if (!media) throw new Error('La fotografía local del Área no está disponible.')
              photoStoragePath = await uploadTechnicianAreaPhoto(serviceId, areaId, sending.deviceId, sending.lockToken, media.file)
              sending = { ...sending, photoStoragePath, updatedAt: new Date().toISOString() }
              await saveTechnicianMutation(sending)
              await reloadMutations(serviceId)
            }
            const result = await saveTechnicianAreaAccess(serviceId, areaId, sending.requestId, sending.deviceId, sending.lockToken,
              sending.version, sending.withoutAccess, sending.description, sending.withoutAccess ? photoStoragePath : null)
            await deleteTechnicianMutation(sending)
            if (sending.photoMediaId) await deleteTechnicianMedia(sending.actorId, sending.photoMediaId)
            const remaining = await listTechnicianMutations(actorId(), serviceId)
            for (const queued of remaining.filter((item): item is TechnicianAreaOrderMutation => item.kind === 'AREA_ORDER' && item.status !== 'CONFLICT')) {
              await saveTechnicianMutation({ ...queued,
                versions: queued.versions.map(value => value.id === areaId ? { ...value, version: result.area.version } : value),
                updatedAt: new Date().toISOString() })
            }
            for (const queued of remaining.filter((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS'
              && item.areaId === areaId && item.status !== 'CONFLICT')) {
              await saveTechnicianMutation({ ...queued, version: result.area.version, updatedAt: new Date().toISOString() })
            }
            const latest = [...remaining].reverse().find((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS'
              && item.areaId === areaId && item.status !== 'CONFLICT')
            await persistAreaAccess(serviceId, latest
              ? { ...result.area, sinAcceso: latest.withoutAccess, sinAccesoDescripcion: latest.withoutAccess ? latest.description : null,
                  sinAccesoFotoStoragePath: latest.withoutAccess ? latest.photoStoragePath : null }
              : result.area, latest?.photoMediaId ?? null)
          } else if (sending.kind === 'DEVICE_CREATE') {
            const result = await createTechnicianDevice(serviceId, sending.areaId, sending.requestId, sending.deviceId, sending.lockToken,
              sending.permanentDeviceId, sending.serviceDeviceId,
              { numero: sending.numero, tipoCodigo: sending.tipoCodigo, ubicacion: sending.ubicacion })
            await deleteTechnicianMutation(sending)
            await persistDeviceCreation(serviceId, sending.areaId, { ...result.device, creacionPendiente: false })
          } else {
            let reviewOperation = sending as TechnicianDeviceReviewMutation
            const serviceDeviceId = reviewOperation.serviceDeviceId
            let photoStoragePath = reviewOperation.photoStoragePath
            if (reviewOperation.photoMediaId && !photoStoragePath) {
              const media = await loadTechnicianMedia(reviewOperation.actorId, reviewOperation.photoMediaId)
              if (!media) throw new Error('La fotografía local del dispositivo no está disponible.')
              photoStoragePath = await uploadTechnicianDevicePhoto(serviceId, serviceDeviceId, reviewOperation.deviceId, reviewOperation.lockToken, media.file)
              reviewOperation = { ...reviewOperation, photoStoragePath, updatedAt: new Date().toISOString() }
              sending = reviewOperation
              await saveTechnicianMutation(reviewOperation)
              await reloadMutations(serviceId)
            }
            const input: TechnicianDeviceReviewInput = {
              estadoObservado: reviewOperation.estadoObservado,
              capturas: reviewOperation.capturas,
              consumo: reviewOperation.consumo,
              productoQuimico: reviewOperation.productoQuimico,
              antidoto: reviewOperation.antidoto,
              observaciones: reviewOperation.observaciones,
            }
            const result = await saveTechnicianDeviceReview(serviceId, serviceDeviceId, reviewOperation.requestId, reviewOperation.deviceId,
              reviewOperation.lockToken, reviewOperation.reviewId, reviewOperation.version, input, photoStoragePath)
            await deleteTechnicianMutation(reviewOperation)
            if (reviewOperation.photoMediaId) await deleteTechnicianMedia(reviewOperation.actorId, reviewOperation.photoMediaId)
            const remaining = await listTechnicianMutations(actorId(), serviceId)
            const sameDevice = remaining.filter((item): item is TechnicianDeviceReviewMutation => item.kind === 'DEVICE_REVIEW'
              && item.serviceDeviceId === serviceDeviceId && item.status !== 'CONFLICT')
            for (const queued of sameDevice) {
              await saveTechnicianMutation({ ...queued, version: result.review.version, updatedAt: new Date().toISOString() })
            }
            const latest = sameDevice[sameDevice.length - 1]
            const area = caches.value[serviceId]?.package.areas.find(item => item.id === reviewOperation.areaId)
            const device = area?.dispositivos.find(item => item.id === serviceDeviceId)
            const review = latest && device ? reviewFromMutation(device, latest, result.review) : result.review
            await persistDeviceReview(serviceId, reviewOperation.areaId, serviceDeviceId, review)
          }
        } catch (failure) {
          if ((sending.kind === 'AREA_ACCESS' || sending.kind === 'DEVICE_REVIEW') && failure instanceof ApiClientError
            && failure.code === 'PHOTO_NOT_FOUND' && sending.photoMediaId) {
            await saveTechnicianMutation({ ...sending, photoStoragePath: null, status: 'PENDING', error: failure.message, updatedAt: new Date().toISOString() })
            await reloadMutations(serviceId)
            return 'pending'
          }
          const retryable = !(failure instanceof ApiClientError) || failure.status >= 500 || failure.status === 408 || failure.status === 429
          const error = failure instanceof Error ? failure.message : 'No fue posible sincronizar el cambio.'
          if (sending.kind === 'AREA_ORDER') {
            await saveTechnicianMutation({ ...sending, status: retryable ? 'SENDING' : 'CONFLICT',
              conflict: failure instanceof ApiClientError ? conflictDetails(failure) : null, error, updatedAt: new Date().toISOString() })
          } else if (sending.kind === 'CRITERION_EVALUATION') {
            await saveTechnicianMutation({ ...sending, status: retryable ? 'SENDING' : 'CONFLICT',
              conflict: failure instanceof ApiClientError ? criterionConflictDetails(failure) : null, error, updatedAt: new Date().toISOString() })
          } else if (sending.kind === 'AREA_ACCESS') {
            await saveTechnicianMutation({ ...sending, status: retryable ? 'SENDING' : 'CONFLICT',
              conflict: failure instanceof ApiClientError ? areaAccessConflictDetails(failure) : null, error, updatedAt: new Date().toISOString() })
          } else if (sending.kind === 'DEVICE_CREATE') {
            await saveTechnicianMutation({ ...sending, status: retryable ? 'SENDING' : 'CONFLICT', error, updatedAt: new Date().toISOString() })
          } else {
            await saveTechnicianMutation({ ...sending, status: retryable ? 'SENDING' : 'CONFLICT',
              conflict: failure instanceof ApiClientError ? deviceReviewConflictDetails(failure) : null, error, updatedAt: new Date().toISOString() })
          }
          await reloadMutations(serviceId)
          return retryable ? 'pending' : 'conflict'
        }
      }
    } finally {
      syncing.value = false
    }
  }

  async function applyAreaOrder(serviceId: string, areaIds: string[]): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede editar el recorrido del servicio.')
    const currentIds = cache.package.areas.map(area => area.id)
    if (!isExactAreaPermutation(currentIds, areaIds)) throw new Error('El recorrido debe conservar todas las Áreas.')
    const existing = await reloadMutations(serviceId)
    if (existing.some(item => item.kind === 'AREA_ORDER' && item.status === 'CONFLICT')) return 'conflict'
    const reusable = [...existing].reverse().find((item): item is TechnicianAreaOrderMutation => item.kind === 'AREA_ORDER' && item.status === 'PENDING')
    const now = new Date().toISOString()
    const operation: TechnicianAreaOrderMutation = reusable
      ? { ...reusable, areaIds, updatedAt: now }
      : {
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          actorId: actorId(),
          serviceId,
          deviceId: cache.deviceId,
          lockToken: cache.lock.token,
          kind: 'AREA_ORDER',
          areaIds,
          versions: cache.package.areas.map(area => ({ id: area.id, version: area.version })),
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
          conflict: null,
          error: null,
        }
    await saveTechnicianMutation(operation)
    await reloadMutations(serviceId)
    await persistAreaOrder(serviceId, areaIds)
    return onlineNow() ? syncPending(serviceId) : 'pending'
  }

  async function discardAreaOrderConflict(serviceId: string): Promise<void> {
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianAreaOrderMutation => item.kind === 'AREA_ORDER' && item.status === 'CONFLICT' && Boolean(item.conflict))
    if (!conflicted?.conflict) throw new Error('No hay una versión remota disponible.')
    for (const operation of pending.filter(item => item.kind === 'AREA_ORDER')) await deleteTechnicianMutation(operation)
    await reloadMutations(serviceId)
    const versions = new Map(conflicted.conflict.versions.map(item => [item.id, item.version]))
    await persistAreaOrder(serviceId, conflicted.conflict.areaIds, { areas: conflicted.conflict.areaIds.map((id, posicionRecorrido) => ({
      id,
      posicionRecorrido,
      version: versions.get(id) ?? 1,
    })) })
  }

  async function retryAreaOrderConflict(serviceId: string): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianAreaOrderMutation => item.kind === 'AREA_ORDER' && item.status === 'CONFLICT' && Boolean(item.conflict))
    if (!cache?.lock || !conflicted?.conflict) throw new Error('No es posible reintentar el recorrido.')
    const localOrder = cache.package.areas.map(area => area.id)
    for (const operation of pending.filter(item => item.kind === 'AREA_ORDER')) await deleteTechnicianMutation(operation)
    const now = new Date().toISOString()
    await saveTechnicianMutation({ ...conflicted, requestId: crypto.randomUUID(), areaIds: localOrder, versions: conflicted.conflict.versions,
      status: 'PENDING', conflict: null, error: null, createdAt: now, updatedAt: now })
    await reloadMutations(serviceId)
    return syncPending(serviceId)
  }

  function criterionConflict(criterionId: string): TechnicianCriterionEvaluationMutation | null {
    return currentMutations.value.find((item): item is TechnicianCriterionEvaluationMutation => item.kind === 'CRITERION_EVALUATION'
      && item.criterionId === criterionId && item.status === 'CONFLICT') ?? null
  }

  async function applyCriterionEvaluation(serviceId: string, areaId: string, criterionId: string, evaluation: MipEvaluation, observation: string): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede evaluar el servicio.')
    const area = cache.package.areas.find(item => item.id === areaId)
    const criterion = area?.criterios.find(item => item.id === criterionId)
    if (!area || !criterion) throw new Error('El criterio no pertenece al Área seleccionada.')
    if (area.sinAcceso) throw new Error('Habilita la evaluación del Área antes de cambiar sus criterios.')
    const normalizedObservation = observation.trim()
    if (normalizedObservation.length > 2_000) throw new Error('La observación no puede superar 2000 caracteres.')
    const existing = await reloadMutations(serviceId)
    if (existing.some(item => item.kind === 'CRITERION_EVALUATION' && item.criterionId === criterionId && item.status === 'CONFLICT')) return 'conflict'
    const reusable = [...existing].reverse().find((item): item is TechnicianCriterionEvaluationMutation => item.kind === 'CRITERION_EVALUATION'
      && item.criterionId === criterionId && item.status === 'PENDING')
    const now = new Date().toISOString()
    const operation: TechnicianCriterionEvaluationMutation = reusable
      ? { ...reusable, evaluation, observation: normalizedObservation, updatedAt: now }
      : {
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          actorId: actorId(),
          serviceId,
          deviceId: cache.deviceId,
          lockToken: cache.lock.token,
          kind: 'CRITERION_EVALUATION',
          areaId,
          criterionId,
          evaluation,
          observation: normalizedObservation,
          version: criterion.version,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
          conflict: null,
          error: null,
        }
    await saveTechnicianMutation(operation)
    await reloadMutations(serviceId)
    await persistCriterionEvaluation(serviceId, areaId, { ...criterion, evaluacion: evaluation, observacion: normalizedObservation || null })
    return onlineNow() ? syncPending(serviceId) : 'pending'
  }

  async function discardCriterionEvaluationConflict(serviceId: string, criterionId: string): Promise<void> {
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianCriterionEvaluationMutation => item.kind === 'CRITERION_EVALUATION'
      && item.criterionId === criterionId && item.status === 'CONFLICT' && Boolean(item.conflict))
    if (!conflicted?.conflict) throw new Error('No hay una respuesta sincronizada disponible.')
    for (const operation of pending.filter(item => item.kind === 'CRITERION_EVALUATION' && item.criterionId === criterionId)) await deleteTechnicianMutation(operation)
    await reloadMutations(serviceId)
    await persistCriterionEvaluation(serviceId, conflicted.areaId, conflicted.conflict)
  }

  async function retryCriterionEvaluationConflict(serviceId: string, criterionId: string): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianCriterionEvaluationMutation => item.kind === 'CRITERION_EVALUATION'
      && item.criterionId === criterionId && item.status === 'CONFLICT' && Boolean(item.conflict))
    const area = cache?.package.areas.find(item => item.id === conflicted?.areaId)
    const local = area?.criterios.find(item => item.id === criterionId)
    if (!cache?.lock || !conflicted?.conflict || !local?.evaluacion) throw new Error('No es posible reintentar esta evaluación.')
    for (const operation of pending.filter(item => item.kind === 'CRITERION_EVALUATION' && item.criterionId === criterionId)) await deleteTechnicianMutation(operation)
    const now = new Date().toISOString()
    await saveTechnicianMutation({ ...conflicted, requestId: crypto.randomUUID(), evaluation: local.evaluacion, observation: local.observacion ?? '',
      version: conflicted.conflict.version, status: 'PENDING', conflict: null, error: null, createdAt: now, updatedAt: now })
    await reloadMutations(serviceId)
    return syncPending(serviceId)
  }

  function areaAccessConflict(areaId: string): TechnicianAreaAccessMutation | null {
    return currentMutations.value.find((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS'
      && item.areaId === areaId && item.status === 'CONFLICT') ?? null
  }

  async function applyAreaAccess(
    serviceId: string,
    areaId: string,
    withoutAccess: boolean,
    description: string,
    photo: File | null,
  ): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede registrar excepciones del servicio.')
    const area = cache.package.areas.find(item => item.id === areaId)
    if (!area) throw new Error('El Área no pertenece al servicio preparado.')
    const normalizedDescription = description.trim()
    if (normalizedDescription.length > 2_000) throw new Error('La descripción no puede superar 2000 caracteres.')
    const existing = await reloadMutations(serviceId)
    if (existing.some(item => item.kind === 'AREA_ACCESS' && item.areaId === areaId && item.status === 'CONFLICT')) return 'conflict'
    if (existing.some(item => item.kind === 'AREA_ACCESS' && item.areaId === areaId && item.status === 'SENDING')) {
      throw new Error('Espera a que termine la sincronización del Área antes de cambiarla.')
    }
    const reusable = [...existing].reverse().find((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS'
      && item.areaId === areaId && item.status === 'PENDING')
    const newMediaId = photo ? crypto.randomUUID() : null
    const photoMediaId = withoutAccess ? newMediaId ?? reusable?.photoMediaId ?? area.sinAccesoFotoLocalId ?? null : null
    const photoStoragePath = withoutAccess && !photoMediaId ? reusable?.photoStoragePath ?? area.sinAccesoFotoStoragePath : null
    if (withoutAccess && (!normalizedDescription || (!photoMediaId && !photoStoragePath))) {
      throw new Error('Describe la novedad y adjunta una fotografía para registrar el Área sin acceso.')
    }
    if (photo && newMediaId) {
      await saveTechnicianMedia({ schemaVersion: 1, id: newMediaId, actorId: actorId(), serviceId, areaId, file: photo, savedAt: new Date().toISOString() })
    }
    const now = new Date().toISOString()
    const operation: TechnicianAreaAccessMutation = reusable
      ? { ...reusable, withoutAccess, description: withoutAccess ? normalizedDescription : '', photoMediaId, photoStoragePath,
          updatedAt: now, error: null }
      : {
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          actorId: actorId(),
          serviceId,
          deviceId: cache.deviceId,
          lockToken: cache.lock.token,
          kind: 'AREA_ACCESS',
          areaId,
          withoutAccess,
          description: withoutAccess ? normalizedDescription : '',
          photoMediaId,
          photoStoragePath,
          version: area.version,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
          conflict: null,
          error: null,
        }
    try {
      await saveTechnicianMutation(operation)
    } catch (failure) {
      if (newMediaId) await deleteTechnicianMedia(actorId(), newMediaId)
      throw failure
    }
    if (reusable?.photoMediaId && reusable.photoMediaId !== photoMediaId) await deleteTechnicianMedia(actorId(), reusable.photoMediaId)
    await reloadMutations(serviceId)
    await persistAreaAccess(serviceId, {
      id: area.id,
      sinAcceso: withoutAccess,
      sinAccesoDescripcion: withoutAccess ? normalizedDescription : null,
      sinAccesoFotoStoragePath: withoutAccess ? photoStoragePath : null,
      version: area.version,
    }, photoMediaId)
    return onlineNow() ? syncPending(serviceId) : 'pending'
  }

  async function discardAreaAccessConflict(serviceId: string, areaId: string): Promise<void> {
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS'
      && item.areaId === areaId && item.status === 'CONFLICT' && Boolean(item.conflict))
    if (!conflicted?.conflict) throw new Error('No hay un estado sincronizado disponible para el Área.')
    const affected = pending.filter((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS' && item.areaId === areaId)
    for (const operation of affected) {
      if (operation.photoStoragePath && operation.photoStoragePath !== conflicted.conflict.sinAccesoFotoStoragePath) {
        await deleteTechnicianAreaPhoto(serviceId, areaId, operation.deviceId, operation.lockToken, operation.photoStoragePath)
      }
      await deleteTechnicianMutation(operation)
      if (operation.photoMediaId) await deleteTechnicianMedia(operation.actorId, operation.photoMediaId)
    }
    await reloadMutations(serviceId)
    await persistAreaAccess(serviceId, conflicted.conflict)
  }

  async function retryAreaAccessConflict(serviceId: string, areaId: string): Promise<'synced' | 'pending' | 'conflict'> {
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS'
      && item.areaId === areaId && item.status === 'CONFLICT' && Boolean(item.conflict))
    if (!conflicted?.conflict) throw new Error('No es posible reintentar la excepción del Área.')
    for (const operation of pending.filter(item => item.kind === 'AREA_ACCESS' && item.areaId === areaId)) await deleteTechnicianMutation(operation)
    const now = new Date().toISOString()
    await saveTechnicianMutation({ ...conflicted, requestId: crypto.randomUUID(), version: conflicted.conflict.version,
      status: 'PENDING', conflict: null, error: null, createdAt: now, updatedAt: now })
    await reloadMutations(serviceId)
    return syncPending(serviceId)
  }

  function deviceCreationMutation(serviceDeviceId: string): TechnicianDeviceCreationMutation | null {
    return currentMutations.value.find((item): item is TechnicianDeviceCreationMutation => item.kind === 'DEVICE_CREATE'
      && item.serviceDeviceId === serviceDeviceId) ?? null
  }

  async function applyDeviceCreation(
    serviceId: string,
    areaId: string,
    input: TechnicianDeviceCreationInput,
  ): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede agregar dispositivos al servicio.')
    const area = cache.package.areas.find(item => item.id === areaId)
    if (!area) throw new Error('El Área no pertenece al servicio preparado.')
    if (area.sinAcceso) throw new Error('Habilita el acceso al Área antes de agregar un dispositivo.')
    const normalized = { numero: input.numero.trim(), tipoCodigo: input.tipoCodigo.trim(), ubicacion: input.ubicacion.trim() }
    if (!normalized.numero || normalized.numero.length > 100) throw new Error('El número es obligatorio y no puede superar 100 caracteres.')
    if (!normalized.ubicacion || normalized.ubicacion.length > 500) throw new Error('La ubicación es obligatoria y no puede superar 500 caracteres.')
    const type = (cache.package.deviceTypes ?? []).find(item => item.codigo === normalized.tipoCodigo)
    if (!type) throw new Error('Selecciona un tipo disponible en el paquete del servicio.')
    if (cache.package.areas.some(item => item.dispositivos.some(device => device.numero.localeCompare(normalized.numero, 'es', { sensitivity: 'base' }) === 0))) {
      throw new Error('Ya existe un dispositivo con ese número en la Sede.')
    }
    const now = new Date().toISOString()
    const operation: TechnicianDeviceCreationMutation = {
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      actorId: actorId(),
      serviceId,
      deviceId: cache.deviceId,
      lockToken: cache.lock.token,
      kind: 'DEVICE_CREATE',
      areaId,
      permanentDeviceId: crypto.randomUUID(),
      serviceDeviceId: crypto.randomUUID(),
      ...normalized,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      error: null,
    }
    await saveTechnicianMutation(operation)
    await reloadMutations(serviceId)
    await persistDeviceCreation(serviceId, areaId, {
      id: operation.serviceDeviceId,
      dispositivoId: operation.permanentDeviceId,
      numero: operation.numero,
      ubicacion: operation.ubicacion,
      tipoCodigo: type.codigo,
      tipoNombre: type.nombre,
      clasificacion: type.clasificacion,
      plagas: type.plagas,
      estadoAnterior: 'ACTIVO',
      creadoDuranteServicio: true,
      creacionPendiente: true,
      revisado: false,
      revision: null,
    })
    return onlineNow() ? syncPending(serviceId) : 'pending'
  }

  async function discardDeviceCreationConflict(serviceId: string, serviceDeviceId: string): Promise<void> {
    const pending = await reloadMutations(serviceId)
    const creation = pending.find((item): item is TechnicianDeviceCreationMutation => item.kind === 'DEVICE_CREATE'
      && item.serviceDeviceId === serviceDeviceId && item.status === 'CONFLICT')
    if (!creation) throw new Error('No hay una creación en conflicto para descartar.')
    for (const operation of pending.filter(item => (item.kind === 'DEVICE_CREATE' || item.kind === 'DEVICE_REVIEW')
      && item.serviceDeviceId === serviceDeviceId)) {
      await deleteTechnicianMutation(operation)
      if (operation.kind === 'DEVICE_REVIEW' && operation.photoMediaId) await deleteTechnicianMedia(operation.actorId, operation.photoMediaId)
    }
    await reloadMutations(serviceId)
    await removeLocalDevice(serviceId, creation.areaId, serviceDeviceId)
  }

  async function retryDeviceCreationConflict(
    serviceId: string,
    serviceDeviceId: string,
    input: TechnicianDeviceCreationInput,
  ): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianDeviceCreationMutation => item.kind === 'DEVICE_CREATE'
      && item.serviceDeviceId === serviceDeviceId && item.status === 'CONFLICT')
    if (!cache?.lock || !conflicted) throw new Error('No es posible corregir la creación del dispositivo.')
    const normalized = { numero: input.numero.trim(), tipoCodigo: input.tipoCodigo.trim(), ubicacion: input.ubicacion.trim() }
    if (!normalized.numero || normalized.numero.length > 100 || !normalized.ubicacion || normalized.ubicacion.length > 500) {
      throw new Error('Completa el número y la ubicación del dispositivo.')
    }
    const type = (cache.package.deviceTypes ?? []).find(item => item.codigo === normalized.tipoCodigo)
    if (!type) throw new Error('Selecciona un tipo disponible en el paquete del servicio.')
    if (cache.package.areas.some(area => area.dispositivos.some(device => device.id !== serviceDeviceId
      && device.numero.localeCompare(normalized.numero, 'es', { sensitivity: 'base' }) === 0))) {
      throw new Error('Ya existe un dispositivo con ese número en la Sede.')
    }
    for (const operation of pending.filter(item => (item.kind === 'DEVICE_CREATE' || item.kind === 'DEVICE_REVIEW')
      && item.serviceDeviceId === serviceDeviceId)) {
      await deleteTechnicianMutation(operation)
      if (operation.kind === 'DEVICE_REVIEW' && operation.photoMediaId) await deleteTechnicianMedia(operation.actorId, operation.photoMediaId)
    }
    const now = new Date().toISOString()
    await saveTechnicianMutation({ ...conflicted, ...normalized, requestId: crypto.randomUUID(), status: 'PENDING', error: null,
      createdAt: now, updatedAt: now })
    await reloadMutations(serviceId)
    await persistDeviceCreation(serviceId, conflicted.areaId, {
      id: conflicted.serviceDeviceId,
      dispositivoId: conflicted.permanentDeviceId,
      numero: normalized.numero,
      ubicacion: normalized.ubicacion,
      tipoCodigo: type.codigo,
      tipoNombre: type.nombre,
      clasificacion: type.clasificacion,
      plagas: type.plagas,
      estadoAnterior: 'ACTIVO',
      creadoDuranteServicio: true,
      creacionPendiente: true,
      revisado: false,
      revision: null,
    })
    return onlineNow() ? syncPending(serviceId) : 'pending'
  }

  function deviceReviewMutation(serviceDeviceId: string): TechnicianDeviceReviewMutation | null {
    return currentMutations.value.find((item): item is TechnicianDeviceReviewMutation => item.kind === 'DEVICE_REVIEW'
      && item.serviceDeviceId === serviceDeviceId) ?? null
  }

  async function applyDeviceReview(
    serviceId: string,
    areaId: string,
    serviceDeviceId: string,
    input: TechnicianDeviceReviewInput,
    photo: File | null,
  ): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede revisar los dispositivos del servicio.')
    const area = cache.package.areas.find(item => item.id === areaId)
    const device = area?.dispositivos.find(item => item.id === serviceDeviceId)
    if (!area || !device) throw new Error('El dispositivo no pertenece al Área seleccionada.')
    if (area.sinAcceso) throw new Error('Habilita el acceso al Área antes de revisar sus dispositivos.')
    if (!['ACTIVO', 'DANADO', 'FUERA_DE_USO'].includes(input.estadoObservado)) throw new Error('Selecciona un estado válido para el dispositivo.')
    const pestCodes = new Set(device.plagas.map(pest => pest.codigo))
    const seen = new Set<string>()
    const captures = input.capturas.map(capture => {
      if (!pestCodes.has(capture.plagaCodigo) || seen.has(capture.plagaCodigo)
        || !Number.isSafeInteger(capture.cantidad) || capture.cantidad < 1 || capture.cantidad > 1_000_000) {
        throw new Error('Las capturas registradas no son válidas.')
      }
      seen.add(capture.plagaCodigo)
      return capture
    })
    const normalized: TechnicianDeviceReviewInput = {
      estadoObservado: input.estadoObservado,
      capturas: captures,
      consumo: input.consumo.trim(),
      productoQuimico: input.productoQuimico.trim(),
      antidoto: input.antidoto.trim(),
      observaciones: input.observaciones.trim(),
    }
    if (normalized.consumo.length > 500 || normalized.productoQuimico.length > 500
      || normalized.antidoto.length > 500 || normalized.observaciones.length > 2_000) {
      throw new Error('La información de la revisión supera el tamaño permitido.')
    }
    const existing = await reloadMutations(serviceId)
    if (existing.some(item => item.kind === 'DEVICE_REVIEW' && item.serviceDeviceId === serviceDeviceId && item.status === 'CONFLICT')) return 'conflict'
    if (existing.some(item => item.kind === 'DEVICE_REVIEW' && item.serviceDeviceId === serviceDeviceId && item.status === 'SENDING')) {
      throw new Error('Espera a que termine la sincronización del dispositivo antes de cambiarlo.')
    }
    const reusable = [...existing].reverse().find((item): item is TechnicianDeviceReviewMutation => item.kind === 'DEVICE_REVIEW'
      && item.serviceDeviceId === serviceDeviceId && item.status === 'PENDING')
    const requiresPhoto = technicianDevicePhotoRequired(device.estadoAnterior, normalized.estadoObservado)
    const newMediaId = photo && requiresPhoto ? crypto.randomUUID() : null
    const photoMediaId = requiresPhoto ? newMediaId ?? reusable?.photoMediaId ?? device.revision?.fotoLocalId ?? null : null
    const photoStoragePath = requiresPhoto && !newMediaId ? reusable?.photoStoragePath ?? device.revision?.fotoStoragePath ?? null : null
    if (requiresPhoto && !photoMediaId && !photoStoragePath) {
      throw new Error('Adjunta una fotografía del cambio de estado del dispositivo.')
    }
    if (photo && newMediaId) {
      await saveTechnicianMedia({ schemaVersion: 1, id: newMediaId, actorId: actorId(), serviceId, areaId,
        serviceDeviceId, file: photo, savedAt: new Date().toISOString() })
    }
    const now = new Date().toISOString()
    const operation: TechnicianDeviceReviewMutation = reusable
      ? { ...reusable, ...normalized, photoMediaId, photoStoragePath, updatedAt: now, error: null }
      : {
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          actorId: actorId(),
          serviceId,
          deviceId: cache.deviceId,
          lockToken: cache.lock.token,
          kind: 'DEVICE_REVIEW',
          areaId,
          serviceDeviceId,
          reviewId: device.revision?.id ?? crypto.randomUUID(),
          ...normalized,
          photoMediaId,
          photoStoragePath,
          version: device.revision?.version ?? 0,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
          conflict: null,
          error: null,
        }
    try {
      await saveTechnicianMutation(operation)
    } catch (failure) {
      if (newMediaId) await deleteTechnicianMedia(actorId(), newMediaId)
      throw failure
    }
    if (reusable?.photoMediaId && reusable.photoMediaId !== photoMediaId) await deleteTechnicianMedia(actorId(), reusable.photoMediaId)
    await reloadMutations(serviceId)
    await persistDeviceReview(serviceId, areaId, serviceDeviceId, reviewFromMutation(device, operation, device.revision ?? undefined))
    return onlineNow() ? syncPending(serviceId) : 'pending'
  }

  async function discardDeviceReviewConflict(serviceId: string, serviceDeviceId: string): Promise<void> {
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianDeviceReviewMutation => item.kind === 'DEVICE_REVIEW'
      && item.serviceDeviceId === serviceDeviceId && item.status === 'CONFLICT' && Boolean(item.conflict))
    if (!conflicted?.conflict) throw new Error('No hay una revisión sincronizada disponible para el dispositivo.')
    const affected = pending.filter((item): item is TechnicianDeviceReviewMutation => item.kind === 'DEVICE_REVIEW' && item.serviceDeviceId === serviceDeviceId)
    for (const operation of affected) {
      if (operation.photoStoragePath && operation.photoStoragePath !== conflicted.conflict.fotoStoragePath) {
        await deleteTechnicianDevicePhoto(serviceId, serviceDeviceId, operation.deviceId, operation.lockToken, operation.photoStoragePath)
      }
      await deleteTechnicianMutation(operation)
      if (operation.photoMediaId) await deleteTechnicianMedia(operation.actorId, operation.photoMediaId)
    }
    await reloadMutations(serviceId)
    await persistDeviceReview(serviceId, conflicted.areaId, serviceDeviceId, conflicted.conflict)
  }

  async function retryDeviceReviewConflict(serviceId: string, serviceDeviceId: string): Promise<'synced' | 'pending' | 'conflict'> {
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianDeviceReviewMutation => item.kind === 'DEVICE_REVIEW'
      && item.serviceDeviceId === serviceDeviceId && item.status === 'CONFLICT' && Boolean(item.conflict))
    if (!conflicted?.conflict) throw new Error('No es posible reintentar la revisión del dispositivo.')
    for (const operation of pending.filter(item => item.kind === 'DEVICE_REVIEW' && item.serviceDeviceId === serviceDeviceId)) {
      await deleteTechnicianMutation(operation)
    }
    const now = new Date().toISOString()
    await saveTechnicianMutation({ ...conflicted, requestId: crypto.randomUUID(), reviewId: conflicted.conflict.id,
      version: conflicted.conflict.version, status: 'PENDING', conflict: null, error: null, createdAt: now, updatedAt: now })
    await reloadMutations(serviceId)
    return syncPending(serviceId)
  }

  async function loadPackage(serviceId: string): Promise<TechnicianServicePackage> {
    const request = ++packageRequest
    currentServiceId.value = serviceId
    packageLoading.value = true
    packageError.value = ''
    currentFromCache.value = false
    try {
      await hydrateCaches()
      if (!caches.value[serviceId]) {
        const cached = await loadTechnicianPackageCache(actorId(), serviceId)
        if (cached) caches.value = { ...caches.value, [serviceId]: cached }
      }
      if (!onlineNow()) {
        const cached = caches.value[serviceId]
        if (!cached) throw new Error('Este servicio no está preparado en este celular.')
        currentFromCache.value = true
        return cached.package
      }
      try {
        const synchronization = await syncPending(serviceId)
        if (synchronization !== 'synced') {
          const cached = caches.value[serviceId]
          if (!cached) throw new Error('Este servicio no está preparado en este celular.')
          currentFromCache.value = true
          packageError.value = synchronization === 'conflict'
            ? 'Hay un conflicto pendiente. Revisa cuál cambio conservar.'
            : 'Hay cambios guardados en este celular pendientes de sincronizar.'
          return cached.package
        }
        const value = await fetchTechnicianPackage(serviceId)
        if (request !== packageRequest) return value
        await persistPackage(value)
        return value
      } catch (failure) {
        const cached = caches.value[serviceId]
        if (!cached) throw failure
        currentFromCache.value = true
        packageError.value = 'No fue posible actualizar. Estás viendo la copia guardada en este celular.'
        return cached.package
      }
    } finally {
      if (request === packageRequest) packageLoading.value = false
    }
  }

  async function ensurePackage(serviceId: string): Promise<TechnicianServicePackage> {
    const alreadyOpen = currentServiceId.value === serviceId && Boolean(caches.value[serviceId])
    currentServiceId.value = serviceId
    await hydrateCaches()
    return alreadyOpen && caches.value[serviceId] ? caches.value[serviceId].package : loadPackage(serviceId)
  }

  async function execute(kind: 'START' | 'CLAIM', serviceId: string): Promise<TechnicianExecutionSession> {
    if (!onlineNow()) throw new Error('Conéctate a internet para iniciar o recuperar el servicio.')
    if (action.value) throw new Error('Ya hay una operación en curso.')
    action.value = kind
    try {
      const current = caches.value[serviceId] ?? await loadTechnicianPackageCache(actorId(), serviceId)
      const packageValue = current?.package ?? await prepare(serviceId)
      const expectedVersion = kind === 'START' ? packageValue.service.version : null
      const previous = current?.pendingOperation
      const pending: TechnicianPendingOperation = previous?.kind === kind
        ? previous
        : { kind, requestId: crypto.randomUUID(), version: expectedVersion }
      await persistPackage(packageValue, { pendingOperation: pending })
      const deviceId = getTechnicianDeviceId()
      const session = kind === 'START'
        ? await startTechnicianService(serviceId, pending.requestId, deviceId, pending.version ?? packageValue.service.version)
        : await claimTechnicianService(serviceId, pending.requestId, deviceId)
      await persistPackage(session.package, { lock: session.lock, pendingOperation: null })
      const index = records.value.findIndex(item => item.id === serviceId)
      if (index >= 0) records.value.splice(index, 1, session.package.service)
      else records.value.push(session.package.service)
      records.value = sortTechnicianServices(records.value)
      currentFromCache.value = false
      packageError.value = ''
      return session
    } finally {
      action.value = null
    }
  }

  const start = (serviceId: string) => execute('START', serviceId)
  const claim = (serviceId: string) => execute('CLAIM', serviceId)

  return {
    records,
    caches,
    loading,
    refreshing,
    listError,
    usingCachedServices,
    currentServiceId,
    currentCache,
    currentPackage,
    packageLoading,
    packageError,
    currentFromCache,
    action,
    mutations,
    currentMutations,
    currentConflict,
    pendingSyncCount,
    syncing,
    hydrateCaches,
    loadServices,
    prepare,
    loadPackage,
    ensurePackage,
    start,
    claim,
    syncPending,
    applyAreaOrder,
    discardAreaOrderConflict,
    retryAreaOrderConflict,
    criterionConflict,
    applyCriterionEvaluation,
    discardCriterionEvaluationConflict,
    retryCriterionEvaluationConflict,
    areaAccessConflict,
    applyAreaAccess,
    discardAreaAccessConflict,
    retryAreaAccessConflict,
    deviceCreationMutation,
    applyDeviceCreation,
    discardDeviceCreationConflict,
    retryDeviceCreationConflict,
    deviceReviewMutation,
    applyDeviceReview,
    discardDeviceReviewConflict,
    retryDeviceReviewConflict,
  }
})

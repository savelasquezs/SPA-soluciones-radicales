import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { isExactAreaPermutation, sortTechnicianServices, technicianAreaResolved, technicianDevicePhotoRequired } from '@/helpers/technicianServices'
import { useAuthStore } from '@/stores/auth'
import { claimTechnicianService, createTechnicianDevice, createTechnicianFinding, fetchTechnicianPackage, fetchTechnicianServices, finalizeTechnicianService, saveTechnicianAreaAccess, saveTechnicianAreaOrder, saveTechnicianCriterionEvaluation, saveTechnicianDeviceReview, saveTechnicianFindingStatus, startTechnicianService } from '@/services/servicesService'
import { ApiClientError } from '@/services/apiService'
import { getTechnicianDeviceId, listTechnicianPackageCaches, loadTechnicianPackageCache, saveTechnicianPackageCache } from '@/services/technicianPackageService'
import { deleteTechnicianMutation, listTechnicianMutations, saveTechnicianMutation } from '@/services/technicianMutationService'
import { deleteTechnicianMedia, loadTechnicianMedia, saveTechnicianMedia } from '@/services/technicianMediaService'
import { deleteTechnicianAreaPhoto, deleteTechnicianCriterionEvidence, deleteTechnicianDevicePhoto, deleteTechnicianFindingEvidence, uploadTechnicianAreaPhoto, uploadTechnicianCriterionEvidence, uploadTechnicianDevicePhoto, uploadTechnicianFindingEvidence, uploadTechnicianSignature } from '@/services/serviceMediaService'
import type { MipEvaluation, TechnicianAreaAccessMutation, TechnicianAreaAccessState, TechnicianAreaOrderConflict, TechnicianAreaOrderMutation, TechnicianAreaOrderResult, TechnicianCriterion, TechnicianCriterionEvaluationMutation, TechnicianDevice, TechnicianDeviceCreationInput, TechnicianDeviceCreationMutation, TechnicianDeviceReview, TechnicianDeviceReviewInput, TechnicianDeviceReviewMutation, TechnicianExecutionSession, TechnicianFinding, TechnicianFindingCreateInput, TechnicianFindingCreateMutation, TechnicianFindingStatusInput, TechnicianFindingStatusMutation, TechnicianMutation, TechnicianPackageCache, TechnicianPendingOperation, TechnicianServiceFinalizeMutation, TechnicianServicePackage, TechnicianServiceSummary } from '@/types/technicianServices'

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

  async function persistLocalSignature(serviceId: string, role: 'TECHNICIAN' | 'CLIENT', mediaId: string): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) throw new Error('Prepara el servicio antes de firmar.')
    const current = cache.package.signatures ?? { technicianStoragePath: null, technicianUserId: null, clientStoragePath: null, clientName: null, clientSignedAt: null }
    const signatures = role === 'TECHNICIAN'
      ? { ...current, technicianLocalId: mediaId }
      : { ...current, clientLocalId: mediaId }
    await persistPackage({ ...cache.package, signatures })
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

  async function persistAreaAccess(serviceId: string, state: TechnicianAreaAccessState, localPhotoIds: string[] = []): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) throw new Error('Prepara el servicio antes de registrar la excepción de acceso.')
    let found = false
    const areas = cache.package.areas.map(area => {
      if (area.id !== state.id) return area
      found = true
      return { ...area, ...state, sinAccesoFotoLocalId: localPhotoIds[0] ?? null,
        sinAccesoEvidenciasLocalIds: localPhotoIds }
    })
    if (!found) throw new Error('El Área no pertenece al servicio preparado.')
    await persistPackage({ ...cache.package, areas })
  }

  async function persistDeviceReview(serviceId: string, areaId: string, serviceDeviceId: string, review: TechnicianDeviceReview): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) throw new Error('Prepara el servicio antes de revisar sus puestos de monitoreo.')
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
    if (!found) throw new Error('El puesto de monitoreo no pertenece al Área seleccionada.')
    await persistPackage({ ...cache.package, areas })
  }

  async function persistDeviceCreation(serviceId: string, areaId: string, device: TechnicianDevice): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) throw new Error('Prepara el servicio antes de agregar puestos de monitoreo.')
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

  async function persistFinding(serviceId: string, areaId: string, finding: TechnicianFinding): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) throw new Error('Prepara el servicio antes de registrar Hallazgos.')
    let found = false
    const areas = cache.package.areas.map(area => {
      if (area.id !== areaId) return area
      found = true
      const currentFindings = area.hallazgos ?? []
      const existing = currentFindings.find(item => item.id === finding.id)
      const hallazgos = existing
        ? currentFindings.map(item => item.id === finding.id ? finding : item)
        : [...currentFindings, finding]
      return { ...area, hallazgos }
    })
    if (!found) throw new Error('El Área no pertenece al servicio preparado.')
    await persistPackage({ ...cache.package, areas })
  }

  async function removeLocalFinding(serviceId: string, areaId: string, findingId: string): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache) return
    const areas = cache.package.areas.map(area => area.id === areaId
      ? { ...area, hallazgos: (area.hallazgos ?? []).filter(finding => finding.id !== findingId) }
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

  function findingConflictDetails(failure: ApiClientError): TechnicianFinding | null {
    const remote = failure.details?.remote
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return null
    const record = remote as Partial<TechnicianFinding>
    if (!record.id || !['ABIERTO', 'EN_PROCESO', 'CERRADO'].includes(record.estado ?? '')
      || !Array.isArray(record.evidenciasAperturaStoragePaths) || !Array.isArray(record.evidenciasCierreStoragePaths)
      || !Number.isSafeInteger(record.version)) return null
    return record as TechnicianFinding
  }

  async function uploadFindingMutationEvidences<T extends TechnicianFindingCreateMutation | TechnicianFindingStatusMutation>(
    operation: T,
    phase: 'OPENING' | 'CLOSURE',
  ): Promise<T> {
    let current = operation
    for (const evidence of current.evidences) {
      if (evidence.storagePath) continue
      const media = await loadTechnicianMedia(current.actorId, evidence.mediaId)
      if (!media) throw new Error('Una evidencia local del Hallazgo no está disponible.')
      const storagePath = await uploadTechnicianFindingEvidence(current.serviceId, current.areaId, current.findingId,
        phase, current.deviceId, current.lockToken, media.file)
      current = { ...current,
        evidences: current.evidences.map(item => item.mediaId === evidence.mediaId ? { ...item, storagePath } : item),
        updatedAt: new Date().toISOString() } as T
      await saveTechnicianMutation(current)
      await reloadMutations(current.serviceId)
    }
    return current
  }

  async function uploadCriterionMutationEvidences(operation: TechnicianCriterionEvaluationMutation): Promise<TechnicianCriterionEvaluationMutation> {
    let current = operation
    for (const evidence of current.evidences) {
      if (evidence.storagePath) continue
      const media = await loadTechnicianMedia(current.actorId, evidence.mediaId)
      if (!media) throw new Error('Una evidencia local del criterio no está disponible.')
      const storagePath = await uploadTechnicianCriterionEvidence(current.serviceId, current.criterionId,
        current.deviceId, current.lockToken, media.file)
      current = { ...current,
        evidences: current.evidences.map(item => item.mediaId === evidence.mediaId ? { ...item, storagePath } : item),
        updatedAt: new Date().toISOString() }
      await saveTechnicianMutation(current)
      await reloadMutations(current.serviceId)
    }
    return current
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
            const criterionOperation = await uploadCriterionMutationEvidences(sending)
            sending = criterionOperation
            const criterionId = criterionOperation.criterionId
            const evidenceStoragePaths = [...criterionOperation.retainedEvidenceStoragePaths,
              ...criterionOperation.evidences.flatMap(evidence => evidence.storagePath ? [evidence.storagePath] : [])]
            const result = await saveTechnicianCriterionEvaluation(serviceId, criterionOperation.requestId, criterionOperation.deviceId,
              criterionOperation.lockToken, criterionId, criterionOperation.version, criterionOperation.evaluation,
              criterionOperation.observation, evidenceStoragePaths)
            await deleteTechnicianMutation(criterionOperation)
            for (const evidence of criterionOperation.evidences) await deleteTechnicianMedia(criterionOperation.actorId, evidence.mediaId)
            const remaining = await listTechnicianMutations(actorId(), serviceId)
            const sameCriterion = remaining.filter((item): item is TechnicianCriterionEvaluationMutation => item.kind === 'CRITERION_EVALUATION'
              && item.criterionId === criterionId && item.status !== 'CONFLICT')
            for (const queued of sameCriterion) {
              await saveTechnicianMutation({ ...queued, version: result.criterion.version, updatedAt: new Date().toISOString() })
            }
            const latest = sameCriterion[sameCriterion.length - 1]
            const criterion = latest
              ? { ...result.criterion, evaluacion: latest.evaluation, observacion: latest.observation || null,
                  evidenciasStoragePaths: latest.retainedEvidenceStoragePaths,
                  evidenciasLocalIds: latest.evidences.map(evidence => evidence.mediaId) }
              : result.criterion
            await persistCriterionEvaluation(serviceId, criterionOperation.areaId, criterion)
          } else if (sending.kind === 'AREA_ACCESS') {
            const areaId = sending.areaId
            let areaOperation = sending
            const initialEvidences = areaOperation.evidences ?? (areaOperation.photoMediaId
              ? [{ mediaId: areaOperation.photoMediaId, storagePath: areaOperation.photoStoragePath }] : [])
            for (const evidence of initialEvidences) {
              if (!areaOperation.withoutAccess || evidence.storagePath) continue
              const media = await loadTechnicianMedia(areaOperation.actorId, evidence.mediaId)
              if (!media) throw new Error('Una fotografía local del Área no está disponible.')
              const path = await uploadTechnicianAreaPhoto(serviceId, areaId, areaOperation.deviceId, areaOperation.lockToken, media.file)
              areaOperation = { ...areaOperation, evidences: (areaOperation.evidences ?? initialEvidences)
                .map(item => item.mediaId === evidence.mediaId ? { ...item, storagePath: path } : item),
                photoStoragePath: areaOperation.photoStoragePath ?? path, updatedAt: new Date().toISOString() }
              sending = areaOperation
              await saveTechnicianMutation(areaOperation)
              await reloadMutations(serviceId)
            }
            const photos = areaOperation.withoutAccess ? [
              ...(areaOperation.retainedEvidenceStoragePaths ?? []),
              ...(areaOperation.evidences ?? initialEvidences).flatMap(evidence => evidence.storagePath ? [evidence.storagePath] : []),
            ] : []
            const paths = [...new Set(photos)]
            const result = await saveTechnicianAreaAccess(serviceId, areaId, areaOperation.requestId, areaOperation.deviceId, areaOperation.lockToken,
              areaOperation.version, areaOperation.withoutAccess, areaOperation.description, paths[0] ?? null, paths)
            await deleteTechnicianMutation(areaOperation)
            for (const evidence of areaOperation.evidences ?? initialEvidences) await deleteTechnicianMedia(areaOperation.actorId, evidence.mediaId)
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
                  sinAccesoFotoStoragePath: latest.withoutAccess ? latest.photoStoragePath : null,
                  sinAccesoEvidenciasStoragePaths: latest.withoutAccess ? latest.retainedEvidenceStoragePaths ?? [] : [] }
              : result.area, latest?.evidences?.map(evidence => evidence.mediaId) ?? [])
          } else if (sending.kind === 'DEVICE_CREATE') {
            const result = await createTechnicianDevice(serviceId, sending.areaId, sending.requestId, sending.deviceId, sending.lockToken,
              sending.permanentDeviceId, sending.serviceDeviceId,
              { numero: sending.numero, tipoCodigo: sending.tipoCodigo, ubicacion: sending.ubicacion })
            await deleteTechnicianMutation(sending)
            await persistDeviceCreation(serviceId, sending.areaId, { ...result.device, creacionPendiente: false })
          } else if (sending.kind === 'FINDING_CREATE') {
            const findingOperation = await uploadFindingMutationEvidences(sending, 'OPENING')
            sending = findingOperation
            const result = await createTechnicianFinding(serviceId, findingOperation.areaId, findingOperation.requestId,
              findingOperation.deviceId, findingOperation.lockToken, findingOperation.findingId,
              { descripcion: findingOperation.descripcion, recomendacionAccion: findingOperation.recomendacionAccion },
              findingOperation.evidences.flatMap(evidence => evidence.storagePath ? [evidence.storagePath] : []))
            await deleteTechnicianMutation(findingOperation)
            for (const evidence of findingOperation.evidences) await deleteTechnicianMedia(findingOperation.actorId, evidence.mediaId)
            await persistFinding(serviceId, findingOperation.areaId, result.finding)
          } else if (sending.kind === 'FINDING_STATUS') {
            const findingOperation = await uploadFindingMutationEvidences(sending, 'FOLLOWUP')
            sending = findingOperation
            const result = await saveTechnicianFindingStatus(serviceId, findingOperation.areaId, findingOperation.findingId,
              findingOperation.requestId, findingOperation.deviceId, findingOperation.lockToken, findingOperation.version,
              { estado: findingOperation.estado, observacionCierre: findingOperation.observacionCierre },
              findingOperation.evidences.flatMap(evidence => evidence.storagePath ? [evidence.storagePath] : []))
            await deleteTechnicianMutation(findingOperation)
            for (const evidence of findingOperation.evidences) await deleteTechnicianMedia(findingOperation.actorId, evidence.mediaId)
            await persistFinding(serviceId, findingOperation.areaId, result.finding)
          } else if (sending.kind === 'SERVICE_FINALIZE') {
            let finalization = sending
            if (!finalization.technicianStoragePath) {
              const media = await loadTechnicianMedia(finalization.actorId, finalization.technicianMediaId)
              if (!media) throw new Error('La firma local del Técnico no está disponible.')
              finalization = { ...finalization, technicianStoragePath: await uploadTechnicianSignature(serviceId, 'TECHNICIAN',
                finalization.deviceId, finalization.lockToken, media.file), updatedAt: new Date().toISOString() }
              sending = finalization
              await saveTechnicianMutation(finalization)
              await reloadMutations(serviceId)
            }
            if (!finalization.clientStoragePath) {
              const media = await loadTechnicianMedia(finalization.actorId, finalization.clientMediaId)
              if (!media) throw new Error('La firma local del cliente no está disponible.')
              finalization = { ...finalization, clientStoragePath: await uploadTechnicianSignature(serviceId, 'CLIENT',
                finalization.deviceId, finalization.lockToken, media.file), updatedAt: new Date().toISOString() }
              sending = finalization
              await saveTechnicianMutation(finalization)
              await reloadMutations(serviceId)
            }
            const technicianStoragePath = finalization.technicianStoragePath
            const clientStoragePath = finalization.clientStoragePath
            if (!technicianStoragePath || !clientStoragePath) throw new Error('Las firmas no están listas para sincronizar.')
            const result = await finalizeTechnicianService(serviceId, finalization.requestId, finalization.deviceId,
              finalization.lockToken, technicianStoragePath, clientStoragePath, finalization.clientName)
            await deleteTechnicianMutation(finalization)
            await Promise.all([
              deleteTechnicianMedia(finalization.actorId, finalization.technicianMediaId),
              deleteTechnicianMedia(finalization.actorId, finalization.clientMediaId),
            ])
            await persistPackage(result.package, { lock: null })
            records.value = sortTechnicianServices(records.value.map(record => record.id === serviceId ? result.package.service : record))
          } else {
            let reviewOperation = sending as TechnicianDeviceReviewMutation
            const serviceDeviceId = reviewOperation.serviceDeviceId
            let photoStoragePath = reviewOperation.photoStoragePath
            if (reviewOperation.photoMediaId && !photoStoragePath) {
              const media = await loadTechnicianMedia(reviewOperation.actorId, reviewOperation.photoMediaId)
              if (!media) throw new Error('La fotografía local del puesto no está disponible.')
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
          if (sending.kind === 'AREA_ACCESS' && failure instanceof ApiClientError && failure.code === 'PHOTO_NOT_FOUND'
            && sending.evidences?.length) {
            const missing = typeof failure.details?.storagePath === 'string' ? failure.details.storagePath : null
            const matching = sending.evidences.some(item => item.storagePath === missing && Boolean(item.mediaId))
            if (matching) {
              await saveTechnicianMutation({ ...sending, evidences: sending.evidences.map(item => item.storagePath === missing
                ? { ...item, storagePath: null } : item), photoStoragePath: null, status: 'PENDING', error: failure.message,
                updatedAt: new Date().toISOString() })
              await reloadMutations(serviceId)
              return 'pending'
            }
          }
          if ((sending.kind === 'AREA_ACCESS' || sending.kind === 'DEVICE_REVIEW') && failure instanceof ApiClientError
            && failure.code === 'PHOTO_NOT_FOUND' && sending.photoMediaId
            && (sending.kind === 'DEVICE_REVIEW' || !sending.evidences?.length)) {
            await saveTechnicianMutation({ ...sending, photoStoragePath: null, status: 'PENDING', error: failure.message, updatedAt: new Date().toISOString() })
            await reloadMutations(serviceId)
            return 'pending'
          }
          if (sending.kind === 'CRITERION_EVALUATION' && failure instanceof ApiClientError && failure.code === 'PHOTO_NOT_FOUND') {
            const missingPath = typeof failure.details?.storagePath === 'string' ? failure.details.storagePath : null
            await saveTechnicianMutation({ ...sending,
              evidences: sending.evidences.map(evidence => !missingPath || evidence.storagePath === missingPath
                ? { ...evidence, storagePath: null }
                : evidence), status: 'PENDING', error: failure.message, updatedAt: new Date().toISOString() })
            await reloadMutations(serviceId)
            return 'pending'
          }
          if ((sending.kind === 'FINDING_CREATE' || sending.kind === 'FINDING_STATUS') && failure instanceof ApiClientError
            && failure.code === 'PHOTO_NOT_FOUND') {
            const missingPath = typeof failure.details?.storagePath === 'string' ? failure.details.storagePath : null
            await saveTechnicianMutation({ ...sending,
              evidences: sending.evidences.map(evidence => !missingPath || evidence.storagePath === missingPath
                ? { ...evidence, storagePath: null }
                : evidence),
              status: 'PENDING', error: failure.message, updatedAt: new Date().toISOString() })
            await reloadMutations(serviceId)
            return 'pending'
          }
          if (sending.kind === 'SERVICE_FINALIZE' && failure instanceof ApiClientError && failure.code === 'SIGNATURE_NOT_FOUND') {
            await saveTechnicianMutation({ ...sending, technicianStoragePath: null, clientStoragePath: null,
              status: 'PENDING', error: failure.message, updatedAt: new Date().toISOString() })
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
          } else if (sending.kind === 'FINDING_CREATE') {
            await saveTechnicianMutation({ ...sending, status: retryable ? 'SENDING' : 'CONFLICT', error, updatedAt: new Date().toISOString() })
          } else if (sending.kind === 'FINDING_STATUS') {
            await saveTechnicianMutation({ ...sending, status: retryable ? 'SENDING' : 'CONFLICT',
              conflict: failure instanceof ApiClientError ? findingConflictDetails(failure) : null,
              error, updatedAt: new Date().toISOString() })
          } else if (sending.kind === 'SERVICE_FINALIZE') {
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

  async function applyCriterionEvaluation(serviceId: string, areaId: string, criterionId: string, evaluation: MipEvaluation, observation: string,
    files: File[] = [], retainedEvidenceStoragePaths?: string[], deferSync = false): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede evaluar el servicio.')
    const area = cache.package.areas.find(item => item.id === areaId)
    const criterion = area?.criterios.find(item => item.id === criterionId)
    if (!area || !criterion) throw new Error('El criterio no pertenece al Área seleccionada.')
    if (area.sinAcceso) throw new Error('Habilita la evaluación del Área antes de cambiar sus criterios.')
    const normalizedObservation = observation.trim()
    if (normalizedObservation.length > 2_000) throw new Error('La observación no puede superar 2000 caracteres.')
    const retained = [...(retainedEvidenceStoragePaths ?? criterion.evidenciasStoragePaths)]
    if (retained.length + files.length > 5 || new Set(retained).size !== retained.length) throw new Error('Puedes guardar hasta cinco fotografías por criterio.')
    const existing = await reloadMutations(serviceId)
    if (existing.some(item => item.kind === 'CRITERION_EVALUATION' && item.criterionId === criterionId && item.status === 'CONFLICT')) return 'conflict'
    const reusable = [...existing].reverse().find((item): item is TechnicianCriterionEvaluationMutation => item.kind === 'CRITERION_EVALUATION'
      && item.criterionId === criterionId && item.status === 'PENDING')
    if ((reusable?.evidences.length ?? 0) + retained.length + files.length > 5) throw new Error('Puedes guardar hasta cinco fotografías por criterio.')
    const newEvidences = files.map(file => ({ mediaId: crypto.randomUUID(), storagePath: null, file }))
    for (const evidence of newEvidences) {
      await saveTechnicianMedia({ schemaVersion: 1, id: evidence.mediaId, actorId: actorId(), serviceId, areaId, criterionId,
        file: evidence.file, savedAt: new Date().toISOString() })
    }
    const now = new Date().toISOString()
    const operation: TechnicianCriterionEvaluationMutation = reusable
      ? { ...reusable, evaluation, observation: normalizedObservation, retainedEvidenceStoragePaths: retained,
          evidences: [...reusable.evidences, ...newEvidences.map(({ mediaId, storagePath }) => ({ mediaId, storagePath }))], updatedAt: now }
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
          evidences: newEvidences.map(({ mediaId, storagePath }) => ({ mediaId, storagePath })),
          retainedEvidenceStoragePaths: retained,
          version: criterion.version,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
          conflict: null,
          error: null,
        }
    try { await saveTechnicianMutation(operation) }
    catch (failure) {
      for (const evidence of newEvidences) await deleteTechnicianMedia(actorId(), evidence.mediaId)
      throw failure
    }
    await reloadMutations(serviceId)
    await persistCriterionEvaluation(serviceId, areaId, { ...criterion, evaluacion: evaluation, observacion: normalizedObservation || null,
      evidenciasStoragePaths: retained, evidenciasLocalIds: operation.evidences.map(evidence => evidence.mediaId) })
    return !deferSync && onlineNow() ? syncPending(serviceId) : 'pending'
  }

  async function discardCriterionEvaluationConflict(serviceId: string, criterionId: string): Promise<void> {
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianCriterionEvaluationMutation => item.kind === 'CRITERION_EVALUATION'
      && item.criterionId === criterionId && item.status === 'CONFLICT' && Boolean(item.conflict))
    if (!conflicted?.conflict) throw new Error('No hay una respuesta sincronizada disponible.')
    for (const operation of pending.filter((item): item is TechnicianCriterionEvaluationMutation => item.kind === 'CRITERION_EVALUATION' && item.criterionId === criterionId)) {
      for (const evidence of operation.evidences) {
        if (evidence.storagePath && !conflicted.conflict.evidenciasStoragePaths.includes(evidence.storagePath)) {
          await deleteTechnicianCriterionEvidence(serviceId, criterionId, operation.deviceId, operation.lockToken, evidence.storagePath)
        }
        await deleteTechnicianMedia(operation.actorId, evidence.mediaId)
      }
      await deleteTechnicianMutation(operation)
    }
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
      retainedEvidenceStoragePaths: local.evidenciasStoragePaths,
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
    selectedPhotos: File[] | File | null,
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
    const files = !withoutAccess ? [] : Array.isArray(selectedPhotos) ? selectedPhotos : selectedPhotos ? [selectedPhotos] : []
    const retained = !withoutAccess ? [] : reusable?.retainedEvidenceStoragePaths
      ?? area.sinAccesoEvidenciasStoragePaths ?? (area.sinAccesoFotoStoragePath ? [area.sinAccesoFotoStoragePath] : [])
    const oldEvidence = reusable?.evidences ?? (reusable?.photoMediaId
      ? [{ mediaId: reusable.photoMediaId, storagePath: reusable.photoStoragePath }] : [])
    const newEvidences = files.map(() => ({ mediaId: crypto.randomUUID(), storagePath: null }))
    const evidences = withoutAccess ? [...oldEvidence, ...newEvidences] : []
    if (withoutAccess && (!normalizedDescription || retained.length + evidences.length < 1 || retained.length + evidences.length > 5)) {
      throw new Error('Describe la novedad y adjunta entre una y cinco fotografías para registrar el Área sin acceso.')
    }
    const savedIds: string[] = []
    try {
      for (const [index, file] of files.entries()) {
        const mediaId = newEvidences[index]!.mediaId
        await saveTechnicianMedia({ schemaVersion: 1, id: mediaId, actorId: actorId(), serviceId, areaId,
          file, savedAt: new Date().toISOString() })
        savedIds.push(mediaId)
      }
      const now = new Date().toISOString()
      const normalized = { withoutAccess, description: withoutAccess ? normalizedDescription : '',
        evidences, retainedEvidenceStoragePaths: retained,
        photoMediaId: evidences[0]?.mediaId ?? null, photoStoragePath: evidences[0]?.storagePath ?? retained[0] ?? null }
      const operation: TechnicianAreaAccessMutation = reusable
        ? { ...reusable, ...normalized, updatedAt: now, error: null }
        : { schemaVersion: 1, requestId: crypto.randomUUID(), actorId: actorId(), serviceId,
            deviceId: cache.deviceId, lockToken: cache.lock.token, kind: 'AREA_ACCESS', areaId,
            ...normalized, version: area.version, status: 'PENDING', createdAt: now, updatedAt: now, conflict: null, error: null }
      await saveTechnicianMutation(operation)
      await reloadMutations(serviceId)
      await persistAreaAccess(serviceId, { id: area.id, sinAcceso: withoutAccess,
        sinAccesoDescripcion: withoutAccess ? normalizedDescription : null,
        sinAccesoFotoStoragePath: withoutAccess ? retained[0] ?? null : null,
        sinAccesoEvidenciasStoragePaths: retained,
        version: area.version }, evidences.map(item => item.mediaId))
    } catch (failure) {
      for (const mediaId of savedIds) await deleteTechnicianMedia(actorId(), mediaId)
      throw failure
    }
    if (!withoutAccess) {
      for (const old of oldEvidence) await deleteTechnicianMedia(actorId(), old.mediaId)
    }
    return onlineNow() ? syncPending(serviceId) : 'pending'
  }

  async function discardAreaAccessConflict(serviceId: string, areaId: string): Promise<void> {
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS'
      && item.areaId === areaId && item.status === 'CONFLICT' && Boolean(item.conflict))
    if (!conflicted?.conflict) throw new Error('No hay un estado sincronizado disponible para el Área.')
    const affected = pending.filter((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS' && item.areaId === areaId)
    for (const operation of affected) {
      await deleteTechnicianMutation(operation)
      for (const evidence of operation.evidences ?? (operation.photoMediaId ? [{ mediaId: operation.photoMediaId, storagePath: operation.photoStoragePath }] : [])) {
        if (evidence.storagePath && !(conflicted.conflict.sinAccesoEvidenciasStoragePaths ?? []).includes(evidence.storagePath)) {
          await deleteTechnicianAreaPhoto(serviceId, areaId, operation.deviceId, operation.lockToken, evidence.storagePath)
        }
        await deleteTechnicianMedia(operation.actorId, evidence.mediaId)
      }
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
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede agregar puestos de monitoreo al servicio.')
    const area = cache.package.areas.find(item => item.id === areaId)
    if (!area) throw new Error('El Área no pertenece al servicio preparado.')
    if (area.sinAcceso) throw new Error('Habilita el acceso al Área antes de agregar un puesto de monitoreo.')
    const normalized = { numero: input.numero.trim(), tipoCodigo: input.tipoCodigo.trim(), ubicacion: input.ubicacion.trim() }
    if (!normalized.numero || normalized.numero.length > 100) throw new Error('El número es obligatorio y no puede superar 100 caracteres.')
    if (!normalized.ubicacion || normalized.ubicacion.length > 500) throw new Error('La ubicación es obligatoria y no puede superar 500 caracteres.')
    const type = (cache.package.deviceTypes ?? []).find(item => item.codigo === normalized.tipoCodigo)
    if (!type) throw new Error('Selecciona un tipo disponible en el paquete del servicio.')
    if (cache.package.areas.some(item => item.dispositivos.some(device => device.numero.localeCompare(normalized.numero, 'es', { sensitivity: 'base' }) === 0))) {
      throw new Error('Ya existe un puesto de monitoreo con ese número en la Sede.')
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
    if (!cache?.lock || !conflicted) throw new Error('No es posible corregir la creación del puesto de monitoreo.')
    const normalized = { numero: input.numero.trim(), tipoCodigo: input.tipoCodigo.trim(), ubicacion: input.ubicacion.trim() }
    if (!normalized.numero || normalized.numero.length > 100 || !normalized.ubicacion || normalized.ubicacion.length > 500) {
      throw new Error('Completa el número y la ubicación del puesto de monitoreo.')
    }
    const type = (cache.package.deviceTypes ?? []).find(item => item.codigo === normalized.tipoCodigo)
    if (!type) throw new Error('Selecciona un tipo disponible en el paquete del servicio.')
    if (cache.package.areas.some(area => area.dispositivos.some(device => device.id !== serviceDeviceId
      && device.numero.localeCompare(normalized.numero, 'es', { sensitivity: 'base' }) === 0))) {
      throw new Error('Ya existe un puesto de monitoreo con ese número en la Sede.')
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

  function findingMutation(findingId: string): TechnicianFindingCreateMutation | TechnicianFindingStatusMutation | null {
    return currentMutations.value.find((item): item is TechnicianFindingCreateMutation | TechnicianFindingStatusMutation =>
      (item.kind === 'FINDING_CREATE' || item.kind === 'FINDING_STATUS') && item.findingId === findingId) ?? null
  }

  async function saveFindingMedia(serviceId: string, areaId: string, files: File[]): Promise<string[]> {
    if (files.length > 10) throw new Error('Puedes adjuntar máximo 10 evidencias por Hallazgo.')
    const ids: string[] = []
    try {
      for (const file of files) {
        const id = crypto.randomUUID()
        await saveTechnicianMedia({ schemaVersion: 1, id, actorId: actorId(), serviceId, areaId, file, savedAt: new Date().toISOString() })
        ids.push(id)
      }
      return ids
    } catch (failure) {
      for (const id of ids) await deleteTechnicianMedia(actorId(), id)
      throw failure
    }
  }

  async function applyFindingCreate(
    serviceId: string,
    areaId: string,
    input: TechnicianFindingCreateInput,
    files: File[],
  ): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede registrar Hallazgos en el servicio.')
    const area = cache.package.areas.find(item => item.id === areaId)
    if (!area) throw new Error('El Área no pertenece al servicio preparado.')
    if (area.sinAcceso) throw new Error('Habilita el acceso al Área antes de registrar Hallazgos.')
    const normalized = {
      descripcion: input.descripcion.trim(),
      recomendacionAccion: input.recomendacionAccion.trim(),
    }
    if (!normalized.descripcion || normalized.descripcion.length > 2_000 || !normalized.recomendacionAccion
      || normalized.recomendacionAccion.length > 2_000) {
      throw new Error('Completa la descripción y la acción recomendada del Hallazgo.')
    }
    const mediaIds = await saveFindingMedia(serviceId, areaId, files)
    const now = new Date().toISOString(), findingId = crypto.randomUUID()
    const operation: TechnicianFindingCreateMutation = {
      schemaVersion: 1, requestId: crypto.randomUUID(), actorId: actorId(), serviceId,
      deviceId: cache.deviceId, lockToken: cache.lock.token, kind: 'FINDING_CREATE', areaId, findingId,
      ...normalized, evidences: mediaIds.map(mediaId => ({ mediaId, storagePath: null })),
      status: 'PENDING', createdAt: now, updatedAt: now, error: null,
    }
    try { await saveTechnicianMutation(operation) }
    catch (failure) { for (const mediaId of mediaIds) await deleteTechnicianMedia(operation.actorId, mediaId); throw failure }
    await reloadMutations(serviceId)
    await persistFinding(serviceId, areaId, {
      id: findingId, servicioAperturaId: serviceId, fechaApertura: now,
      descripcion: normalized.descripcion, recomendacionAccion: normalized.recomendacionAccion,
      evidenciasAperturaStoragePaths: [], evidenciasAperturaLocalIds: mediaIds,
      estado: 'ABIERTO', resultadoSeguimiento: null,
      // Solo para la vista offline: al sincronizar se guarda el snapshot definitivo del servidor.
      responsableNombre: cache.package.service.contactoPrincipalNombre?.trim() || 'Contacto de la sede',
      responsableCorreo: cache.package.service.contactoPrincipalCorreo?.trim().toLowerCase() || null,
      servicioCierreId: null, fechaCierre: null,
      evidenciasCierreStoragePaths: [], observacionCierre: null, version: 1,
    })
    return onlineNow() ? syncPending(serviceId) : 'pending'
  }

  async function applyFindingStatus(
    serviceId: string,
    areaId: string,
    findingId: string,
    input: TechnicianFindingStatusInput,
    files: File[],
  ): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) {
      throw new Error('Este celular no puede actualizar Hallazgos en el servicio.')
    }
    const area = cache.package.areas.find(item => item.id === areaId)
    const finding = area?.hallazgos.find(item => item.id === findingId)
    if (!area || !finding || area.sinAcceso) throw new Error('El Hallazgo no está disponible para esta Área.')
    if (finding.servicioAperturaId === serviceId) throw new Error('El seguimiento comienza en una visita posterior.')
    if (finding.estado === 'CERRADO' && finding.servicioCierreId !== serviceId) {
      throw new Error('El Hallazgo se cerró en una visita anterior.')
    }
    const normalizedObservation = input.observacionCierre.trim()
    if (normalizedObservation.length > 2_000) throw new Error('La observación no puede superar 2000 caracteres.')
    const existing = await reloadMutations(serviceId)
    const outstanding = existing.find((item): item is TechnicianFindingStatusMutation =>
      item.kind === 'FINDING_STATUS' && item.findingId === findingId)
    if (outstanding?.status === 'CONFLICT') return 'conflict'
    if (outstanding?.status === 'SENDING') throw new Error('Espera a que se sincronice la revisión anterior.')
    const oldPaths = finding.evidenciasSeguimientoStoragePaths ?? []
    const previousPhotos = outstanding?.evidences.length ?? 0
    if (oldPaths.length + previousPhotos + files.length > 10) throw new Error('Puedes guardar hasta diez fotos por visita.')
    if (input.estado === 'CERRADO' && oldPaths.length + previousPhotos + files.length === 0) {
      throw new Error('Adjunta una fotografía para cerrar el Hallazgo.')
    }
    const mediaIds = await saveFindingMedia(serviceId, areaId, files)
    const now = new Date().toISOString()
    const operation: TechnicianFindingStatusMutation = outstanding
      ? { ...outstanding, estado: input.estado, observacionCierre: normalizedObservation,
          evidences: [...outstanding.evidences, ...mediaIds.map(mediaId => ({ mediaId, storagePath: null }))],
          updatedAt: now, error: null }
      : {
          schemaVersion: 1, requestId: crypto.randomUUID(), actorId: actorId(), serviceId,
          deviceId: cache.deviceId, lockToken: cache.lock.token, kind: 'FINDING_STATUS', areaId, findingId,
          estado: input.estado, observacionCierre: normalizedObservation, version: finding.version,
          evidences: mediaIds.map(mediaId => ({ mediaId, storagePath: null })), conflict: null,
          status: 'PENDING', createdAt: now, updatedAt: now, error: null,
        }
    try { await saveTechnicianMutation(operation) }
    catch (failure) {
      for (const mediaId of mediaIds) await deleteTechnicianMedia(operation.actorId, mediaId)
      throw failure
    }
    await reloadMutations(serviceId)
    const original = finding.estadoAnteriorSeguimiento ?? finding.estado
    const nextState = input.estado === 'SIN_CAMBIOS' ? original
      : input.estado === 'EN_PROCESO' ? 'EN_PROCESO' : 'CERRADO'
    const visit = finding.historialSeguimientos?.find(item => item.servicioId === serviceId)
    const visits = [{ id: visit?.id ?? crypto.randomUUID(), servicioId: serviceId,
      solicitud: cache.package.service.solicitud, fecha: now, resultado: input.estado,
      observacion: normalizedObservation || null, evidenciasStoragePaths: oldPaths },
    ...(finding.historialSeguimientos ?? []).filter(item => item.servicioId !== serviceId)]
    await persistFinding(serviceId, areaId, {
      ...finding, estado: nextState, estadoAnteriorSeguimiento: original,
      resultadoSeguimiento: input.estado, observacionSeguimiento: normalizedObservation || null,
      evidenciasSeguimientoStoragePaths: oldPaths, evidenciasSeguimientoLocalIds: operation.evidences.map(item => item.mediaId),
      historialSeguimientos: visits,
      servicioCierreId: nextState === 'CERRADO' ? serviceId : null,
      fechaCierre: nextState === 'CERRADO' ? now : null,
      evidenciasCierreStoragePaths: nextState === 'CERRADO' ? oldPaths : [],
      evidenciasCierreLocalIds: nextState === 'CERRADO' ? operation.evidences.map(item => item.mediaId) : [],
      observacionCierre: nextState === 'CERRADO' ? normalizedObservation || null : null,
    })
    return onlineNow() ? syncPending(serviceId) : 'pending'
  }

  async function cleanupFindingMutation(operation: TechnicianFindingCreateMutation | TechnicianFindingStatusMutation): Promise<void> {
    const phase = operation.kind === 'FINDING_CREATE' ? 'OPENING' : 'FOLLOWUP'
    for (const evidence of operation.evidences) {
      if (evidence.storagePath) {
        await deleteTechnicianFindingEvidence(operation.serviceId, operation.areaId, operation.findingId, phase,
          operation.deviceId, operation.lockToken, evidence.storagePath)
      }
      await deleteTechnicianMedia(operation.actorId, evidence.mediaId)
    }
    await deleteTechnicianMutation(operation)
  }

  async function discardFindingConflict(serviceId: string, findingId: string): Promise<void> {
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianFindingCreateMutation | TechnicianFindingStatusMutation =>
      (item.kind === 'FINDING_CREATE' || item.kind === 'FINDING_STATUS') && item.findingId === findingId && item.status === 'CONFLICT')
    if (!conflicted) throw new Error('No hay un conflicto pendiente para este Hallazgo.')
    await cleanupFindingMutation(conflicted)
    await reloadMutations(serviceId)
    if (conflicted.kind === 'FINDING_CREATE') await removeLocalFinding(serviceId, conflicted.areaId, findingId)
    else if (conflicted.conflict) await persistFinding(serviceId, conflicted.areaId, conflicted.conflict)
    else if (onlineNow()) await persistPackage(await fetchTechnicianPackage(serviceId))
  }

  async function retryFindingConflict(serviceId: string, findingId: string): Promise<'synced' | 'pending' | 'conflict'> {
    const pending = await reloadMutations(serviceId)
    const conflicted = pending.find((item): item is TechnicianFindingCreateMutation | TechnicianFindingStatusMutation =>
      (item.kind === 'FINDING_CREATE' || item.kind === 'FINDING_STATUS') && item.findingId === findingId && item.status === 'CONFLICT')
    if (!conflicted) throw new Error('No hay un conflicto pendiente para este Hallazgo.')
    const now = new Date().toISOString()
    if (conflicted.kind === 'FINDING_STATUS') {
      if (!conflicted.conflict || conflicted.conflict.estado === 'CERRADO') throw new Error('Usa la versión sincronizada del Hallazgo.')
      await saveTechnicianMutation({ ...conflicted, requestId: crypto.randomUUID(), version: conflicted.conflict.version,
        status: 'PENDING', conflict: null, error: null, createdAt: now, updatedAt: now })
    } else {
      await saveTechnicianMutation({ ...conflicted, requestId: crypto.randomUUID(), status: 'PENDING', error: null,
        createdAt: now, updatedAt: now })
    }
    await reloadMutations(serviceId)
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
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede revisar los puestos de monitoreo del servicio.')
    const area = cache.package.areas.find(item => item.id === areaId)
    const device = area?.dispositivos.find(item => item.id === serviceDeviceId)
    if (!area || !device) throw new Error('El puesto de monitoreo no pertenece al Área seleccionada.')
    if (area.sinAcceso) throw new Error('Habilita el acceso al Área antes de revisar sus puestos de monitoreo.')
    if (!['ACTIVO', 'DANADO', 'FUERA_DE_USO'].includes(input.estadoObservado)) throw new Error('Selecciona un estado válido para la trampa.')
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
      throw new Error('Espera a que termine la sincronización del puesto antes de cambiarlo.')
    }
    const reusable = [...existing].reverse().find((item): item is TechnicianDeviceReviewMutation => item.kind === 'DEVICE_REVIEW'
      && item.serviceDeviceId === serviceDeviceId && item.status === 'PENDING')
    const requiresPhoto = technicianDevicePhotoRequired(device.estadoAnterior, normalized.estadoObservado)
    const newMediaId = photo ? crypto.randomUUID() : null
    const photoMediaId = newMediaId ?? reusable?.photoMediaId ?? device.revision?.fotoLocalId ?? null
    const photoStoragePath = !newMediaId ? reusable?.photoStoragePath ?? device.revision?.fotoStoragePath ?? null : null
    if (requiresPhoto && !photoMediaId && !photoStoragePath) {
      throw new Error('Adjunta una fotografía del cambio de estado de la trampa.')
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
    if (!conflicted?.conflict) throw new Error('No hay una revisión sincronizada disponible para el puesto.')
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
    if (!conflicted?.conflict) throw new Error('No es posible reintentar la revisión del puesto.')
    for (const operation of pending.filter(item => item.kind === 'DEVICE_REVIEW' && item.serviceDeviceId === serviceDeviceId)) {
      await deleteTechnicianMutation(operation)
    }
    const now = new Date().toISOString()
    await saveTechnicianMutation({ ...conflicted, requestId: crypto.randomUUID(), reviewId: conflicted.conflict.id,
      version: conflicted.conflict.version, status: 'PENDING', conflict: null, error: null, createdAt: now, updatedAt: now })
    await reloadMutations(serviceId)
    return syncPending(serviceId)
  }

  async function saveSignature(serviceId: string, role: 'TECHNICIAN' | 'CLIENT', file: File): Promise<void> {
    const cache = caches.value[serviceId]
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede firmar el servicio.')
    if (!(file instanceof File) || !file.size) throw new Error('La firma no es válida.')
    const previousId = role === 'TECHNICIAN'
      ? cache.package.signatures?.technicianLocalId
      : cache.package.signatures?.clientLocalId
    const mediaId = crypto.randomUUID()
    await saveTechnicianMedia({ schemaVersion: 1, id: mediaId, actorId: actorId(), serviceId, file, savedAt: new Date().toISOString() })
    await persistLocalSignature(serviceId, role, mediaId)
    if (previousId) await deleteTechnicianMedia(actorId(), previousId)
  }

  async function finalizeService(serviceId: string, clientName: string): Promise<'synced' | 'pending' | 'conflict'> {
    const cache = caches.value[serviceId]
    if (!cache || cache.package.service.estado !== 'EN_PROCESO' || !cache.lock) throw new Error('Este celular no puede finalizar el servicio.')
    if (!cache.package.areas.every(area => technicianAreaResolved(area, serviceId))) throw new Error('Completa todas las Áreas antes de finalizar.')
    const signatures = cache.package.signatures
    const technicianMediaId = signatures?.technicianLocalId
    const clientMediaId = signatures?.clientLocalId
    if (!technicianMediaId || !clientMediaId) throw new Error('Acepta las dos firmas antes de finalizar.')
    const normalizedName = clientName.trim()
    if (!normalizedName || normalizedName.length > 200) throw new Error('Indica el nombre de quien firma por el cliente.')
    const existing = await reloadMutations(serviceId)
    const queued = existing.find((item): item is TechnicianServiceFinalizeMutation => item.kind === 'SERVICE_FINALIZE')
    if (queued) return queued.status === 'CONFLICT' ? 'conflict' : onlineNow() ? syncPending(serviceId) : 'pending'
    const now = new Date().toISOString()
    await saveTechnicianMutation({
      schemaVersion: 1, kind: 'SERVICE_FINALIZE', requestId: crypto.randomUUID(), actorId: actorId(), serviceId,
      deviceId: cache.deviceId, lockToken: cache.lock.token, status: 'PENDING', createdAt: now, updatedAt: now, error: null,
      technicianMediaId, clientMediaId, technicianStoragePath: null, clientStoragePath: null, clientName: normalizedName,
    })
    await reloadMutations(serviceId)
    return onlineNow() ? syncPending(serviceId) : 'pending'
  }

  async function retryFinalize(serviceId: string): Promise<'synced' | 'pending' | 'conflict'> {
    const operation = (await reloadMutations(serviceId)).find((item): item is TechnicianServiceFinalizeMutation => item.kind === 'SERVICE_FINALIZE')
    if (!operation) return 'synced'
    await saveTechnicianMutation({ ...operation, status: 'PENDING', error: null, updatedAt: new Date().toISOString() })
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
    findingMutation,
    applyFindingCreate,
    applyFindingStatus,
    discardFindingConflict,
    retryFindingConflict,
    deviceReviewMutation,
    applyDeviceReview,
    discardDeviceReviewConflict,
    retryDeviceReviewConflict,
    saveSignature,
    finalizeService,
    retryFinalize,
  }
})

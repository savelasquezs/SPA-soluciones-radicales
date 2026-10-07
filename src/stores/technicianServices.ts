import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { isExactAreaPermutation, sortTechnicianServices } from '@/helpers/technicianServices'
import { useAuthStore } from '@/stores/auth'
import { claimTechnicianService, fetchTechnicianPackage, fetchTechnicianServices, saveTechnicianAreaOrder, startTechnicianService } from '@/services/servicesService'
import { ApiClientError } from '@/services/apiService'
import { getTechnicianDeviceId, listTechnicianPackageCaches, loadTechnicianPackageCache, saveTechnicianPackageCache } from '@/services/technicianPackageService'
import { deleteTechnicianMutation, listTechnicianMutations, saveTechnicianMutation } from '@/services/technicianMutationService'
import type { TechnicianAreaOrderConflict, TechnicianAreaOrderMutation, TechnicianAreaOrderResult, TechnicianExecutionSession, TechnicianPackageCache, TechnicianPendingOperation, TechnicianServicePackage, TechnicianServiceSummary } from '@/types/technicianServices'

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
  const mutations = ref<Record<string, TechnicianAreaOrderMutation[]>>({})
  const syncing = ref(false)
  let loadedActorId = ''
  let listRequest = 0
  let packageRequest = 0

  const currentCache = computed(() => caches.value[currentServiceId.value] ?? null)
  const currentPackage = computed(() => currentCache.value?.package ?? null)
  const currentMutations = computed(() => mutations.value[currentServiceId.value] ?? [])
  const currentConflict = computed(() => currentMutations.value.find(item => item.status === 'CONFLICT') ?? null)
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
    const grouped: Record<string, TechnicianAreaOrderMutation[]> = {}
    for (const item of pending) (grouped[item.serviceId] ??= []).push(item)
    mutations.value = grouped
    loadedActorId = actor
  }

  async function reloadMutations(serviceId: string): Promise<TechnicianAreaOrderMutation[]> {
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

  function conflictDetails(failure: ApiClientError): TechnicianAreaOrderConflict | null {
    const remote = failure.details?.remote
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return null
    const record = remote as Partial<TechnicianAreaOrderConflict>
    if (!Array.isArray(record.areaIds) || !Array.isArray(record.versions)) return null
    return { areaIds: record.areaIds, versions: record.versions }
  }

  async function syncPending(serviceId: string): Promise<'synced' | 'pending' | 'conflict'> {
    if (!onlineNow()) return 'pending'
    if (syncing.value) return currentConflict.value ? 'conflict' : 'pending'
    syncing.value = true
    try {
      let pending = await reloadMutations(serviceId)
      for (const operation of pending) {
        if (operation.status === 'CONFLICT') return 'conflict'
        const sending = { ...operation, status: 'SENDING' as const, updatedAt: new Date().toISOString(), error: null }
        await saveTechnicianMutation(sending)
        await reloadMutations(serviceId)
        try {
          const result = await saveTechnicianAreaOrder(serviceId, sending.requestId, sending.deviceId, sending.lockToken, sending.areaIds, sending.versions)
          await deleteTechnicianMutation(sending)
          const remaining = await listTechnicianMutations(actorId(), serviceId)
          const definitiveVersions = result.areas.map(area => ({ id: area.id, version: area.version }))
          for (const queued of remaining.filter(item => item.status !== 'CONFLICT')) {
            await saveTechnicianMutation({ ...queued, versions: definitiveVersions, updatedAt: new Date().toISOString() })
          }
          pending = await reloadMutations(serviceId)
          const latest = [...pending].reverse().find(item => item.status !== 'CONFLICT')
          await persistAreaOrder(serviceId, latest?.areaIds ?? result.areas.map(area => area.id), result)
        } catch (failure) {
          const retryable = !(failure instanceof ApiClientError) || failure.status >= 500 || failure.status === 408 || failure.status === 429
          const conflict = failure instanceof ApiClientError ? conflictDetails(failure) : null
          await saveTechnicianMutation({
            ...sending,
            status: retryable ? 'SENDING' : 'CONFLICT',
            conflict,
            error: failure instanceof Error ? failure.message : 'No fue posible sincronizar el recorrido.',
            updatedAt: new Date().toISOString(),
          })
          await reloadMutations(serviceId)
          return retryable ? 'pending' : 'conflict'
        }
      }
      return 'synced'
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
    if (existing.some(item => item.status === 'CONFLICT')) return 'conflict'
    const reusable = [...existing].reverse().find(item => item.status === 'PENDING')
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
    const conflicted = pending.find(item => item.status === 'CONFLICT' && item.conflict)
    if (!conflicted?.conflict) throw new Error('No hay una versión remota disponible.')
    for (const operation of pending) await deleteTechnicianMutation(operation)
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
    const conflicted = pending.find(item => item.status === 'CONFLICT' && item.conflict)
    if (!cache?.lock || !conflicted?.conflict) throw new Error('No es posible reintentar el recorrido.')
    const localOrder = cache.package.areas.map(area => area.id)
    for (const operation of pending) await deleteTechnicianMutation(operation)
    const now = new Date().toISOString()
    await saveTechnicianMutation({ ...conflicted, requestId: crypto.randomUUID(), areaIds: localOrder, versions: conflicted.conflict.versions,
      status: 'PENDING', conflict: null, error: null, createdAt: now, updatedAt: now })
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
            ? 'El recorrido tiene un conflicto pendiente. Revisa cuál orden conservar.'
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
  }
})

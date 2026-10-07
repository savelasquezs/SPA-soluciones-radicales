import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { sortTechnicianServices } from '@/helpers/technicianServices'
import { useAuthStore } from '@/stores/auth'
import { claimTechnicianService, fetchTechnicianPackage, fetchTechnicianServices, startTechnicianService } from '@/services/servicesService'
import { getTechnicianDeviceId, listTechnicianPackageCaches, loadTechnicianPackageCache, saveTechnicianPackageCache } from '@/services/technicianPackageService'
import type { TechnicianExecutionSession, TechnicianPackageCache, TechnicianPendingOperation, TechnicianServicePackage, TechnicianServiceSummary } from '@/types/technicianServices'

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
  let loadedActorId = ''
  let listRequest = 0
  let packageRequest = 0

  const currentCache = computed(() => caches.value[currentServiceId.value] ?? null)
  const currentPackage = computed(() => currentCache.value?.package ?? null)

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
  }

  async function hydrateCaches(force = false): Promise<void> {
    const actor = actorId()
    resetActorScope(actor)
    if (!force && loadedActorId === actor) return
    const found = await listTechnicianPackageCaches(actor)
    caches.value = Object.fromEntries(found.map(item => [item.serviceId, item]))
    loadedActorId = actor
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
    hydrateCaches,
    loadServices,
    prepare,
    loadPackage,
    start,
    claim,
  }
})

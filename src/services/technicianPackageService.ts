import { isServiceId } from '@/helpers/adminServices'
import { offlineDatabase } from '@/services/offlineDatabase'
import type { TechnicianPackageCache } from '@/types/technicianServices'

const deviceKey = 'soluciones-radicales:technician-device-id'
let memoryDeviceId = ''

function cacheKey(actorId: string, serviceId: string): string {
  if (!isServiceId(actorId) || !isServiceId(serviceId)) throw new Error('El contexto local del servicio no es válido.')
  return `technician-service:${actorId}:${serviceId}`
}

function validCache(value: unknown, actorId?: string): value is TechnicianPackageCache {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<TechnicianPackageCache>
  return record.schemaVersion === 1
    && isServiceId(record.actorId)
    && isServiceId(record.serviceId)
    && isServiceId(record.deviceId)
    && (!actorId || record.actorId === actorId)
    && record.package?.service?.id === record.serviceId
    && Array.isArray(record.package.products)
    && Array.isArray(record.package.areas)
}

export function getTechnicianDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId
  try {
    const stored = localStorage.getItem(deviceKey)
    if (isServiceId(stored)) return (memoryDeviceId = stored)
    const created = crypto.randomUUID()
    localStorage.setItem(deviceKey, created)
    return (memoryDeviceId = created)
  } catch {
    return (memoryDeviceId = crypto.randomUUID())
  }
}

/**
 * Restore the browser's device identity from its durable offline work.
 * A new phone has no matching IndexedDB cache, so it cannot inherit the lock.
 */
export function restoreTechnicianDeviceIdFromCaches(caches: TechnicianPackageCache[]): void {
  const active = caches.filter(cache => cache.package.service.estado === 'EN_PROCESO'
    && cache.lock?.deviceId === cache.deviceId)
  const candidates = active.length ? active : caches
  const knownIds = new Set(candidates.map(cache => cache.deviceId))
  if (knownIds.size !== 1) return
  const [knownId] = knownIds
  if (!isServiceId(knownId)) return
  memoryDeviceId = knownId
  try { localStorage.setItem(deviceKey, knownId) } catch { /* IndexedDB remains the durable fallback. */ }
}

export async function listTechnicianPackageCaches(actorId: string): Promise<TechnicianPackageCache[]> {
  if (!isServiceId(actorId)) return []
  const values = await (await offlineDatabase).getAll('technicianPackages')
  return values.filter(value => validCache(value, actorId))
}

export async function loadTechnicianPackageCache(actorId: string, serviceId: string): Promise<TechnicianPackageCache | null> {
  const value = await (await offlineDatabase).get('technicianPackages', cacheKey(actorId, serviceId))
  return validCache(value, actorId) ? value : null
}

export async function saveTechnicianPackageCache(value: TechnicianPackageCache): Promise<void> {
  if (!validCache(value)) throw new Error('El paquete local del servicio no es válido.')
  const plain = JSON.parse(JSON.stringify(value)) as TechnicianPackageCache
  if (JSON.stringify(plain).length > 1_000_000) throw new Error('El paquete del servicio supera el tamaño local permitido.')
  await (await offlineDatabase).put('technicianPackages', plain, cacheKey(plain.actorId, plain.serviceId))
}

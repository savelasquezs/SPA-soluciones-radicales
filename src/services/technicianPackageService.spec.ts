import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TechnicianPackageCache, TechnicianServicePackage } from '@/types/technicianServices'

vi.mock('@/services/offlineDatabase', () => ({ offlineDatabase: Promise.resolve({}) }))

const storageKey = 'soluciones-radicales:technician-device-id'
const originalDevice = '10000000-0000-4000-8000-000000000003'
const differentDevice = '10000000-0000-4000-8000-000000000099'
const extraDevice = '10000000-0000-4000-8000-000000000098'

function cached(deviceId: string, withLock = false): TechnicianPackageCache {
  return {
    schemaVersion: 1,
    actorId: '10000000-0000-4000-8000-000000000001',
    serviceId: '10000000-0000-4000-8000-000000000002',
    deviceId,
    savedAt: '2026-10-20T20:00:00Z',
    package: { service: { estado: 'EN_PROCESO' } } as TechnicianServicePackage,
    lock: withLock ? { deviceId, token: '10000000-0000-4000-8000-000000000004',
      acquiredAt: '2026-10-20T20:00:00Z' } : null,
    pendingOperation: null,
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('technician device identity recovery', () => {
  it('restores the original device when localStorage changed but IndexedDB kept its lock', async () => {
    localStorage.setItem(storageKey, differentDevice)
    const { getTechnicianDeviceId, restoreTechnicianDeviceIdFromCaches } =
      await import('@/services/technicianPackageService')
    expect(getTechnicianDeviceId()).toBe(differentDevice)

    restoreTechnicianDeviceIdFromCaches([cached(originalDevice, true)])

    expect(getTechnicianDeviceId()).toBe(originalDevice)
    expect(localStorage.getItem(storageKey)).toBe(originalDevice)
  })

  it('prefers a previously locked service over an unrelated prepared package', async () => {
    const { getTechnicianDeviceId, restoreTechnicianDeviceIdFromCaches } =
      await import('@/services/technicianPackageService')

    restoreTechnicianDeviceIdFromCaches([
      cached(differentDevice),
      { ...cached(originalDevice, true), deviceId: extraDevice },
    ])

    expect(getTechnicianDeviceId()).toBe(originalDevice)
  })

  it('does not choose an identity if the local caches disagree and none has a lock', async () => {
    localStorage.setItem(storageKey, originalDevice)
    const { getTechnicianDeviceId, restoreTechnicianDeviceIdFromCaches } =
      await import('@/services/technicianPackageService')

    restoreTechnicianDeviceIdFromCaches([cached(differentDevice), cached(extraDevice)])

    expect(getTechnicianDeviceId()).toBe(originalDevice)
  })
})

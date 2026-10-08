import { effectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEvidenceGallery } from '@/composables/useEvidenceGallery'
import type { EvidenceAccess, EvidenceReference } from '@/types/siteInsights'
import type { getEvidenceAccess } from '@/services/siteInsightsService'
const mocks = vi.hoisted(() => ({ access: vi.fn<typeof getEvidenceAccess>() }))
vi.mock('@/services/siteInsightsService', () => ({ getEvidenceAccess: mocks.access }))
const photo = (index: number): EvidenceReference => ({ kind: 'OPENING', recordId: 'finding', index, label: `Foto ${index+1}`, date: '2026-10-08T12:00:00Z' })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.access.mockResolvedValue({ status: 'AVAILABLE', url: 'https://storage.example.test/photo.jpg', expiresAt: '2099-01-01T00:00:00Z' })
})
describe('evidence gallery', () => {
  it('loads on demand, keeps unavailable slots, caches within the gallery and closes cleanly', async () => {
    const scope = effectScope()
    const gallery = scope.run(() => useEvidenceGallery(() => 'site'))!
    expect(mocks.access).not.toHaveBeenCalled()
    gallery.show([photo(0),photo(1)])
    await flushPromises()
    expect(gallery.state.value).toBe('AVAILABLE')
    mocks.access.mockResolvedValueOnce({ status: 'EXPIRED', url: null, expiresAt: null })
    gallery.select(1)
    await flushPromises()
    expect(gallery.state.value).toBe('EXPIRED')
    expect(gallery.photos.value).toHaveLength(2)
    gallery.select(0)
    await flushPromises()
    expect(mocks.access).toHaveBeenCalledTimes(2)
    gallery.select(-1)
    expect(gallery.index.value).toBe(0)
    scope.stop()
    expect(gallery.open.value).toBe(false)
  })
  it('renews failed image URLs once without infinite loops or false expiry', async () => {
    const scope = effectScope(), gallery = scope.run(() => useEvidenceGallery(() => 'site'))!
    gallery.show([photo(0)])
    await flushPromises()
    gallery.imageFailed()
    await flushPromises()
    expect(mocks.access).toHaveBeenCalledTimes(2)
    gallery.imageFailed()
    expect(gallery.state.value).toBe('ERROR')
    expect(mocks.access).toHaveBeenCalledTimes(2)
    scope.stop()
  })
  it('keeps network errors recoverable', async () => {
    const scope = effectScope(), gallery = scope.run(() => useEvidenceGallery(() => 'site'))!
    mocks.access.mockRejectedValueOnce(new Error('offline'))
    gallery.show([photo(0)])
    await flushPromises()
    expect(gallery.state.value).toBe('ERROR')
    gallery.retry()
    await flushPromises()
    expect(gallery.state.value).toBe('AVAILABLE')
    scope.stop()
  })
  it('ignores an outdated response after navigation or closing', async () => {
    const scope = effectScope(), gallery = scope.run(() => useEvidenceGallery(() => 'site'))!
    let finish: ((value: EvidenceAccess) => void) | undefined
    mocks.access.mockImplementationOnce(() => new Promise<EvidenceAccess>(resolve => { finish = resolve }))
    gallery.show([photo(0),photo(1)])
    gallery.select(1)
    await flushPromises()
    finish?.({ status: 'MISSING', url: null, expiresAt: null })
    await flushPromises()
    expect(gallery.state.value).toBe('AVAILABLE')
    gallery.close()
    expect(gallery.open.value).toBe(false)
    scope.stop()
  })
})

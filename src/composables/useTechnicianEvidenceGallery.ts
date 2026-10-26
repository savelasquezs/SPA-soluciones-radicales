import { onScopeDispose } from 'vue'
import { useEvidenceGallery } from '@/composables/useEvidenceGallery'
import { getTechnicianEvidenceAccess } from '@/services/servicesService'

export function useTechnicianEvidenceGallery(serviceId: () => string, actorId: () => string | undefined) {
  const localUrls = new Map<string, string>()
  onScopeDispose(() => { for (const url of localUrls.values()) URL.revokeObjectURL(url) })
  return useEvidenceGallery(serviceId, async (id, reference, signal) => {
    if (!reference.recordId.startsWith('local:')) return getTechnicianEvidenceAccess(id, reference, signal)
    const { loadTechnicianMedia } = await import('@/services/technicianMediaService')
    const mediaId = reference.recordId.slice(6)
    const actor = actorId()
    const media = actor ? await loadTechnicianMedia(actor, mediaId) : null
    if (!media || media.serviceId !== id) return { status: 'MISSING', url: null, expiresAt: null }
    const url = localUrls.get(mediaId) ?? URL.createObjectURL(media.file)
    localUrls.set(mediaId, url)
    return { status: 'AVAILABLE', url, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }
  })
}

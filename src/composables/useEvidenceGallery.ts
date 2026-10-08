import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { evidenceKey } from '@/helpers/siteInsights'
import { getEvidenceAccess } from '@/services/siteInsightsService'
import type { EvidenceDisplayState, EvidenceReference } from '@/types/siteInsights'

type Entry = { state: EvidenceDisplayState; url: string | null; expiresAt: number; renewed: boolean }

/** Only opened galleries resolve private URLs. Cache lasts for this component/authorized route. */
export function useEvidenceGallery(siteId: () => string) {
  const photos = shallowRef<EvidenceReference[]>([])
  const index = ref(0)
  const open = ref(false)
  const entries = shallowRef<Record<string, Entry>>({})
  let generation = 0
  let controller: AbortController | null = null
  const current = computed(() => photos.value[index.value] ?? null)
  const entry = computed(() => current.value ? entries.value[evidenceKey(current.value)] : undefined)
  const state = computed<EvidenceDisplayState>(() => entry.value?.state ?? 'IDLE')
  const url = computed(() => entry.value?.url ?? null)

  function put(key: string, value: Entry): void { entries.value = { ...entries.value, [key]: value } }
  async function resolve(force = false): Promise<void> {
    const photo = current.value
    if (!open.value || !photo) return
    const key = evidenceKey(photo)
    const cached = entries.value[key]
    if (!force && cached && ((cached.state === 'AVAILABLE' && cached.expiresAt > Date.now() + 15_000)
      || cached.state === 'MISSING' || cached.state === 'EXPIRED')) return
    const serial = ++generation
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    put(key, { state: 'LOADING', url: null, expiresAt: 0, renewed: cached?.renewed ?? false })
    try {
      const result = await getEvidenceAccess(siteId(), photo, requestController.signal)
      if (serial !== generation) return
      put(key, { state: result.status, url: result.url,
        expiresAt: result.expiresAt ? new Date(result.expiresAt).getTime() : 0, renewed: cached?.renewed ?? false })
    } catch {
      if (serial !== generation || requestController.signal.aborted) return
      put(key, { state: 'ERROR', url: null, expiresAt: 0, renewed: false })
    }
  }
  function show(collection: EvidenceReference[], selected = 0): void {
    close()
    entries.value = {}
    photos.value = [...collection]
    index.value = Math.min(Math.max(selected, 0), Math.max(collection.length - 1, 0))
    open.value = collection.length > 0
    void resolve()
  }
  function select(next: number): void {
    if (next < 0 || next >= photos.value.length || next === index.value) return
    ++generation
    controller?.abort()
    index.value = next
    void resolve()
  }
  function close(): void { open.value = false; ++generation; controller?.abort() }
  function retry(): void {
    if (current.value) deleteEntry(current.value)
    void resolve(true)
  }
  function deleteEntry(photo: EvidenceReference): void {
    const copy = { ...entries.value }
    delete copy[evidenceKey(photo)]
    entries.value = copy
  }
  function imageFailed(): void {
    const photo = current.value
    if (!photo) return
    const key = evidenceKey(photo), value = entries.value[key]
    if (value?.state !== 'AVAILABLE') return
    // A broken image can mean a stale signed URL, CORS, network, or removal after HEAD.
    // Reauthorize once; only the backend may classify it as missing/expired.
    if (!value.renewed) {
      put(key, { ...value, renewed: true })
      void resolve(true)
    } else put(key, { ...value, state: 'ERROR', url: null })
  }
  onScopeDispose(() => { close(); entries.value = {} })
  return { photos, index, open, current, state, url, show, select, close, retry, imageFailed }
}

import { inject, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, routerKey } from 'vue-router'
import { loadFindingWorkDraft, saveFindingWorkDraft, type FindingWorkDraft } from '@/services/technicianWorkDraftService'

export function useTechnicianFindingDraft(context: () => { actorId?: string; serviceId?: string; areaId?: string; itemId: string }, initial: Partial<FindingWorkDraft>) {
  const draft = ref<FindingWorkDraft>({ description: '', recommendation: '', note: '', outcome: null, photos: [], useEvidence: true, open: false, ...initial })
  const ready = ref(false)
  const failure = ref('')
  let queue = Promise.resolve()
  const router = inject(routerKey, null)
  onMounted(async () => {
    const { actorId, serviceId, areaId, itemId } = context()
    try {
      if (actorId && serviceId && areaId) Object.assign(draft.value, await loadFindingWorkDraft(actorId, serviceId, areaId, itemId))
    } catch { failure.value = 'No fue posible recuperar el borrador de este celular.' }
    finally { ready.value = true }
  })
  watch(draft, value => {
    if (!ready.value) return
    const snapshot: FindingWorkDraft = { ...value, photos: [...value.photos] }
    const { actorId, serviceId, areaId, itemId } = context()
    if (!actorId || !serviceId || !areaId) return
    queue = queue.then(() => saveFindingWorkDraft(actorId, serviceId, areaId, itemId, snapshot))
      .then(() => { failure.value = '' }, () => { failure.value = 'No fue posible guardar el borrador en este celular. Conserva esta pantalla e intenta de nuevo.' })
  }, { deep: true, flush: 'sync' })
  async function flush(): Promise<boolean> { await queue; return !failure.value }
  if (router) {
    onBeforeRouteLeave(flush)
    onBeforeRouteUpdate(flush)
  }
  async function clear(): Promise<void> {
    await queue
    const { actorId, serviceId, areaId, itemId } = context()
    if (actorId && serviceId && areaId) await saveFindingWorkDraft(actorId, serviceId, areaId, itemId, null)
  }
  return { draft, ready, failure, clear }
}

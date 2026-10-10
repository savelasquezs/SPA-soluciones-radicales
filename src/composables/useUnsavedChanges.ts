import { onBeforeUnmount, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export function useUnsavedChanges(isDirty: MaybeRefOrGetter<boolean>, isBusy: MaybeRefOrGetter<boolean> = false) {
  const confirmOpen = ref(false)
  let pendingNavigation: Promise<boolean> | null = null
  let resolveNavigation: ((allow: boolean) => void) | null = null

  function beforeUnload(event: BeforeUnloadEvent): void {
    if (!toValue(isDirty) && !toValue(isBusy)) return
    event.preventDefault()
  }
  window.addEventListener('beforeunload', beforeUnload)

  onBeforeRouteLeave(() => {
    if (toValue(isBusy)) return false
    if (!toValue(isDirty)) return true
    // Repeated clicks share the same decision; no navigation promise is orphaned.
    if (pendingNavigation) return pendingNavigation
    confirmOpen.value = true
    pendingNavigation = new Promise<boolean>((resolve) => { resolveNavigation = resolve })
    return pendingNavigation
  })

  function finish(allow: boolean): void {
    confirmOpen.value = false
    resolveNavigation?.(allow)
    resolveNavigation = null
    pendingNavigation = null
  }
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload)
    finish(false)
  })

  return {
    confirmOpen,
    cancelDiscard: () => finish(false),
    confirmDiscard: () => finish(true),
  }
}
